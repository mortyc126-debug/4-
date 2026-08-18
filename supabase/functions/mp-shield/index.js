// =============================================================================
// mp-shield — Фаза 4, десятый кусочек: щит мира за золото. Новичкам уже
// ставится трёхдневный щит при первом входе (см. mp-join), но продлить
// его дальше или поставить заново после нападения было нечем. Зеркало
// действия "shield" из index.html:8043-8049 — три готовых тарифа
// (CFG.SHIELD_COST): 8ч/1200 золота, 24ч/3000 золота, 3д/7500 золота.
// Покупка СКЛАДЫВАЕТСЯ с уже оставшимся временем (Math.max(now,
// shield_until)+duration — как в клиенте: "продлить", не "перезаписать").
//
// Единственная простая денежная кнопка среди перенесённых — ни от bonuses(),
// ни от построек, ни от рас не зависит вообще, поэтому портирована без
// единой временной заглушки (в отличие от почти всего остального в
// supabase/functions).
//
// Тело запроса: { tier: 0|1|2 }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — Dashboard-редактор Edge
// Functions не подтягивает относительные импорты на общую папку, поэтому
// здесь код самодостаточен (копия, а не импорт). При деплое через Supabase
// CLI можно вернуть импорт как в репозитории.
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

// index.html:1725 CFG.SHIELD_COST — [длительность в секундах, цена в золоте].
const SHIELD_COST = [
  [8 * 3600, 1200],
  [24 * 3600, 3000],
  [3 * 86400, 7500],
];

// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/
// rules.js) — дергаем перед проверкой золота, чтобы цена щита списывалась
// с актуального баланса.
const RES = ["food", "wood", "stone", "gold"];
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
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
    const tier = Math.round(Number(body.tier));
    if (!(tier >= 0 && tier < SHIELD_COST.length)) return jsonResponse({ err: "Неверный тариф щита" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    const now = Date.now() / 1000;
    syncRes(p, now);

    const [duration, cost] = SHIELD_COST[tier];
    if ((p.res.gold || 0) < cost) return jsonResponse({ err: "Не хватает золота" }, 400);
    p.res.gold -= cost;

    // Дословно index.html:8046 — продлевает, а не перезаписывает: щит,
    // купленный заранее, не пропадает при повторной покупке.
    const shieldUntil = Math.max(now, row.shield_until || 0) + duration;

    const { error: updErr } = await admin.from("players")
      .update({ state: p, shield_until: shieldUntil, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, shield_until: shieldUntil });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
