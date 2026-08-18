// =============================================================================
// mp-build — Фаза 5, первый кусочек: постройка/улучшение казарм/стрельбища/
// конюшни/мастерской (barracks/range/stable/siege) — ровно те 4 здания, что
// разблокируют mp-train (раньше их приходилось поднимать вручную через SQL).
// Зеркало startBuild(p,bk,plot) из index.html:5712, ограничено этими 4
// зданиями (bk без plot — они не multi). Остальные 11 построек — следующие
// шаги переноса, каждое отдельно, по тому же принципу.
//
// bonuses(p).build/buildCostCut временно = 1/0 (без бонусов) — та же
// заглушка, что и trainSpeed в mp-train, см. _shared/rules.js.
//
// Тело запроса: { bk: "barracks"|"range"|"stable"|"siege" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js и ../_shared/rules.js —
// Dashboard-редактор Edge Functions не подтягивает относительные импорты на
// общую папку, поэтому здесь код самодостаточен (копия, а не импорт). При
// деплое через Supabase CLI можно вернуть импорты как в репозитории.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
function handleOptions(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  return null;
}

const RES = ["food", "wood", "stone", "gold"];
const BLD_TRAIN = { barracks: "inf", range: "arc", stable: "cav", siege: "sie" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
const BARRACKS_TABLE = [
  { t: 0, power: 5 },
  { food: 500, wood: 800, t: 20, power: 10 },
  { food: 1000, wood: 1500, t: 60, power: 20 },
  { food: 2000, wood: 2800, t: 200, power: 37 },
  { food: 3800, wood: 5000, t: 1000, power: 94 },
  { food: 6500, wood: 8500, stone: 3400, t: 2750, power: 244 },
  { food: 9800, wood: 12800, stone: 5400, t: 5520, power: 525 },
  { food: 14800, wood: 19300, stone: 8700, t: 10980, power: 1059 },
  { food: 22300, wood: 29000, stone: 13900, t: 22020, power: 2083 },
  { food: 33500, wood: 43500, stone: 22200, t: 43980, power: 4063 },
  { food: 52500, wood: 67500, stone: 35000, t: 52800, power: 6520 },
  { food: 80000, wood: 102500, stone: 52500, t: 63360, power: 9576 },
  { food: 120000, wood: 155000, stone: 80000, t: 76020, power: 13407 },
  { food: 180000, wood: 232500, stone: 120000, t: 90000, power: 18241 },
  { food: 270000, wood: 350000, stone: 180000, t: 108000, power: 24400 },
  { food: 405000, wood: 525000, stone: 270000, t: 129600, power: 32325 },
  { food: 607500, wood: 787500, stone: 405000, t: 158400, power: 42636 },
  { food: 925000, wood: 1200000, stone: 625000, t: 190800, power: 56328 },
  { food: 1400000, wood: 1800000, stone: 950000, t: 226800, power: 74659 },
  { food: 2100000, wood: 2700000, stone: 1400000, t: 273600, power: 99431 },
  { food: 3200000, wood: 4100000, stone: 2200000, t: 327600, power: 133357 },
  { food: 4700000, wood: 6100000, stone: 3200000, t: 424800, power: 181631 },
  { food: 7100000, wood: 9100000, stone: 4900000, t: 594000, power: 252430 },
  { food: 10800000, wood: 13800000, stone: 7500000, t: 892800, power: 359629 },
  { food: 16200000, wood: 20800000, stone: 11200000, t: 2944800, power: 592326 },
];
const SIEGE_TABLE = [
  { food: 400, wood: 500, t: 10, power: 5 },
  { food: 800, wood: 1000, t: 90, power: 10 },
  { food: 1500, wood: 2000, t: 240, power: 26 },
  { food: 2800, wood: 3800, t: 600, power: 63 },
  { food: 5000, wood: 6800, t: 1000, power: 126 },
  { food: 8500, wood: 11500, stone: 5700, t: 2750, power: 293 },
  { food: 12800, wood: 17300, stone: 9000, t: 5520, power: 600 },
  { food: 19300, wood: 26000, stone: 14400, t: 22020, power: 1173 },
  { food: 19300, wood: 26000, stone: 14400, t: 22020, power: 2258 },
  { food: 43500, wood: 58500, stone: 36900, t: 43980, power: 4332 },
  { food: 67500, wood: 90000, stone: 57500, t: 52800, power: 6931 },
  { food: 102500, wood: 135000, stone: 87500, t: 63360, power: 10202 },
  { food: 102500, wood: 135000, stone: 87500, t: 76020, power: 14355 },
  { food: 232500, wood: 305000, stone: 200000, t: 90000, power: 19679 },
  { food: 350000, wood: 457500, stone: 300000, t: 129600, power: 26573 },
  { food: 525000, wood: 687500, stone: 450000, t: 129600, power: 35603 },
  { food: 787500, wood: 1000000, stone: 675000, t: 158400, power: 47574 },
  { food: 1200000, wood: 1600000, stone: 1000000, t: 190800, power: 63716 },
  { food: 1800000, wood: 2300000, stone: 1600000, t: 273600, power: 85697 },
  { food: 2700000, wood: 3500000, stone: 2300000, t: 273600, power: 115969 },
  { food: 4100000, wood: 5300000, stone: 3500000, t: 327600, power: 158145 },
  { food: 6100000, wood: 7900000, stone: 5300000, t: 424800, power: 218794 },
  { food: 9100000, wood: 11800000, stone: 7900000, t: 594000, power: 308118 },
  { food: 13800000, wood: 17800000, stone: 12000000, t: 892800, power: 442817 },
  { food: 20700000, wood: 26824600, stone: 17916000, t: 2946240, power: 716764 },
];
const BUILD_BLD_TABLE = { barracks: BARRACKS_TABLE, range: BARRACKS_TABLE, stable: BARRACKS_TABLE, siege: SIEGE_TABLE };
const BUILD_MAX_LV = 25;
function buildDuration(bk, lv, buildBonus = 1) { return tblRow(BUILD_BLD_TABLE[bk], lv).t / buildBonus; }
function buildCost(bk, lv, buildCostCut = 0) {
  const r = tblRow(BUILD_BLD_TABLE[bk], lv), cut = 1 - buildCostCut;
  return { food: Math.round((r.food || 0) * cut), wood: Math.round((r.wood || 0) * cut), stone: Math.round((r.stone || 0) * cut), gold: 0 };
}
const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });

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
    const bk = body.bk;
    if (!BUILD_BLD_TABLE[bk])
      return jsonResponse({ err: "Пока перенесены только казармы/стрельбище/конюшня/мастерская" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;

    // Дословно startBuild(p,bk,plot) из index.html:5712-5726 (plot всегда
    // null — ни одно из этих 4 зданий не multi).
    if (p.queues.some((q) => q && q.b === bk))
      return jsonResponse({ err: "Эта постройка уже в работе у одной из бригад" }, 400);
    const trainType = BLD_TRAIN[bk];
    if (trainType && p.train[trainType])
      return jsonResponse({ err: "Здание занято набором войск — дождитесь окончания" }, 400);
    const cur = p.b[bk] || 0;
    const lv = cur + 1;
    if (lv > BUILD_MAX_LV) return jsonResponse({ err: "Максимальный уровень" }, 400);
    const hallLv = Array.isArray(p.b.hall) ? Math.max(0, ...p.b.hall) : p.b.hall;
    if (lv > hallLv) return jsonResponse({ err: "Требуется ратуша " + lv + " уровня" }, 400);
    const slot = p.queues.findIndex((q) => !q);
    if (slot < 0) return jsonResponse({ err: "Обе бригады заняты" }, 400);
    const c = buildCost(bk, lv, 0);
    if (!canPay(p.res, c)) return jsonResponse({ err: "Не хватает ресурсов" }, 400);
    pay(p.res, c);

    const t = buildDuration(bk, lv, 1);
    const now = Date.now() / 1000;
    p.queues[slot] = { b: bk, lv, plot: null, t0: now, t1: now + t };

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    const fireAt = new Date(Date.now() + t * 1000).toISOString();
    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: fireAt, type: "build",
      data: { player_id: row.id, slot },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: t, fire_at: fireAt, lv });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
