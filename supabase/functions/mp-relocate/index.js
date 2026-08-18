// =============================================================================
// mp-relocate — Фаза 4, одиннадцатый кусочек: перенос столицы за золото
// ("tp" из index.html:8050-8054/7568). Цена растёт с эпохой ратуши
// (CFG.TELEPORT_BASE=5000 * 2.2^(epochOf(hall)-1), index.html:1726) —
// чистая формула без единой bonuses()-зависимости, как и щит мира
// (mp-shield, предыдущий кусочек).
//
// Честное упрощение: настоящий relocate() (index.html:5417-5441) ищет
// новое место среди 400 случайных точек в окрестности старого города,
// избегая клеток занятой карты (W.map) и настоящей воды (isRealWater) —
// общий мир не генерирует map_cells вообще (та же причина, по которой
// marches/mp-scout считают путь по прямой, а не waterPath()), поэтому
// здесь используется тот же алгоритм подбора места, что и при первом
// входе игрока (pickSpawn в mp-join) — минимальное расстояние до всех
// существующих городов (MIN_CITY_GAP), без понятия "вода"/"занятая
// клетка" вообще, потому что таких клеток в общем мире не существует.
//
// Тело запроса: {} (никаких параметров — платит и переносится сразу).
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

// index.html:1726 CFG.TELEPORT_BASE / index.html:2854 epochOf.
const TELEPORT_BASE = 5000;
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);

// index.html:123-138 pickSpawn (mp-join) — тот же алгоритм подбора места,
// см. заголовок файла.
const MIN_CITY_GAP = 40;
function pickSpawn(existing, away) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ring = 50 + Math.floor(attempt / 10) * 30;
    const x = Math.round(away.x + (Math.random() * 2 - 1) * ring);
    const y = Math.round(away.y + (Math.random() * 2 - 1) * ring);
    const ok = existing.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN_CITY_GAP);
    if (ok) return { x, y };
  }
  return { x: Math.round(away.x + Math.random() * 400 - 200), y: Math.round(away.y + Math.random() * 400 - 200) };
}

// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/
// rules.js) — дергаем перед проверкой золота, чтобы цена телепорта
// списывалась с актуального баланса.
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

    const hallLv = Array.isArray(p.b.hall) ? Math.max(0, ...p.b.hall) : (p.b.hall || 0);
    const cost = Math.round(TELEPORT_BASE * Math.pow(2.2, epochOf(hallLv) - 1));
    if ((p.res.gold || 0) < cost) return jsonResponse({ err: "Не хватает золота" }, 400);

    const { data: others, error: oErr } = await admin
      .from("players").select("x,y").eq("world_id", world.id).neq("id", row.id);
    if (oErr) return jsonResponse({ err: oErr.message }, 500);
    const { x, y } = pickSpawn(others || [], { x: row.x, y: row.y });

    p.res.gold -= cost;
    const { error: updErr } = await admin.from("players")
      .update({ state: p, x, y, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, x, y, cost });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
