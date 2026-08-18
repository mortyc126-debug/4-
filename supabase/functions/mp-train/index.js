// =============================================================================
// mp-train — Фаза 2, пилотное действие №1: набор войск в общем мире.
// Специально выбрано первым — единственное действие, чья цена/время НЕ
// зависит от bonuses()/рас/генералов/академии (см. supabase/README.md,
// разбор в истории обсуждения) кроме одного множителя скорости обучения,
// который здесь временно = 0 (см. _shared/rules.js, trainDuration).
//
// Зеркало startTrain(p,type,tier,n) из index.html:5735 — та же проверка
// порядка, тот же canPay/pay, тот же trainDuration. Разница: здесь пишем
// не в объект в памяти браузера, а в players.state (JSONB) через
// service-role, и вместо schedule(t,"train",{...}) — INSERT в events,
// которую потом разберёт mp-tick (см. соседнюю функцию).
//
// Тело запроса: { type:"inf"|"arc"|"cav"|"sie", tier:1..5, n:number }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS_HEADERS, jsonResponse, handleOptions } from "../_shared/cors.js";
import { TRAIN_BLD, troopCost, trainCap, trainDuration, canPay, pay, RES } from "../_shared/rules.js";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ err: "Не авторизован" }, 401);

    let body = {};
    try { body = await req.json(); } catch (_) { /* noop */ }
    const type = body.type;
    const tier = Math.round(body.tier);
    let n = Math.round(Number(body.n));
    if (!TRAIN_BLD[type]) return jsonResponse({ err: "Неизвестный тип войск" }, 400);
    if (!(tier >= 1 && tier <= 5)) return jsonResponse({ err: "Неверный тир (1..5)" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    const bld = TRAIN_BLD[type];

    // Дословно startTrain(p,type,tier,n) из index.html:5735-5751.
    if (p.train[type]) return jsonResponse({ err: "Здание уже занято набором" }, 400);
    if (p.queues.some((q) => q && q.b === bld))
      return jsonResponse({ err: "Здание сейчас улучшается — дождитесь окончания" }, 400);
    const cap = trainCap(Array.isArray(p.b[bld]) ? Math.max(0, ...p.b[bld]) : p.b[bld]);
    if (n < 1) return jsonResponse({ err: "Наберите хотя бы одного воина" }, 400);
    if (n > cap) return jsonResponse({ err: "За раз можно набрать не больше " + cap }, 400);
    const c = troopCost(type, tier), tot = {};
    RES.forEach((r) => { tot[r] = Math.round((c[r] || 0) * n); });
    if (!canPay(p.res, tot)) return jsonResponse({ err: "Не хватает ресурсов" }, 400);
    pay(p.res, tot);

    // trainSpeedBonus временно 0 — см. заголовок файла и rules.js.
    const hallLv = Array.isArray(p.b.hall) ? Math.max(0, ...p.b.hall) : p.b.hall;
    const t = trainDuration(hallLv, type, tier, n, 0);
    const now = Date.now() / 1000;
    p.train[type] = { type, tier, n, t0: now, t1: now + t };

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    const fireAt = new Date(Date.now() + t * 1000).toISOString();
    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: fireAt, type: "train",
      data: { player_id: row.id, type },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: t, fire_at: fireAt });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
