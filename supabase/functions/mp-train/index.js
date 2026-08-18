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
const TROOP_COST_COMBAT = [
  { food: 10, wood: 10, stone: 0, gold: 0 },
  { food: 40, wood: 40, stone: 0, gold: 0 },
  { food: 100, wood: 100, stone: 20, gold: 0 },
  { food: 200, wood: 200, stone: 150, gold: 0 },
  { food: 350, wood: 350, stone: 350, gold: 80 },
];
const TROOP_COST_SIEGE = [
  { food: 0, wood: 20, stone: 0, gold: 0 },
  { food: 0, wood: 50, stone: 30, gold: 0 },
  { food: 0, wood: 100, stone: 40, gold: 0 },
  { food: 0, wood: 250, stone: 100, gold: 0 },
  { food: 0, wood: 400, stone: 300, gold: 80 },
];
const troopCost = (type, tier) => (type === "sie" ? TROOP_COST_SIEGE : TROOP_COST_COMBAT)[tier - 1];
const TRAIN_TIME = [3.6, 7.2, 12, 24, 48];
const TRAIN_BLD = { inf: "barracks", arc: "range", cav: "stable", sie: "siege" };
const TRAIN_CAP = [
  20, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800,
  900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 2000,
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
const trainCap = (lv) => (lv <= 0 ? 0 : tblRow(TRAIN_CAP, lv));
const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });
// trainSpeedBonus временно 0 (bonuses(p).trainSpeed ещё не перенесён на
// сервер — зависит от рас/генералов/академии, см. supabase/README.md).
function trainDuration(hallLv, type, tier, n, trainSpeedBonus = 0) {
  return (TRAIN_TIME[tier - 1] * n) / ((1 + hallLv * 0.06) * (1 + trainSpeedBonus));
}
// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/rules.js)
// — дергаем перед canPay/pay, чтобы цена набора списывалась с актуального
// баланса, а не с того, что был на момент последнего join/действия.
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
const prodRate = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv));
const plotCap = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv) * 10);
const PROD_BLD = { food: "farm", wood: "lumber", stone: "quarry", gold: "mine" };
const PROD_MULT = { food: 1, wood: 1, stone: 0.75, gold: 0.5 };
function production(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let base = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { if (lv > 0) base += prodRate(lv); });
    out[r] = base * PROD_MULT[r];
  });
  return out;
}
function plotFillCap(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let extra = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { extra += plotCap(lv) * PROD_MULT[r]; });
    out[r] = Math.round(extra);
  });
  return out;
}
function syncRes(p, nowSec) {
  const dt = (nowSec - (p.resAt || 0)) / 3600;
  if (dt <= 0) { p.resAt = nowSec; return; }
  const pr = production(p), cap = plotFillCap(p);
  RES.forEach((r) => {
    const add = Math.min(pr[r] * dt, cap[r]);
    p.res[r] = Math.max(0, p.res[r] + add);
  });
  p.resAt = nowSec;
}

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
    const now = Date.now() / 1000;
    syncRes(p, now);

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
