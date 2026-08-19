// =============================================================================
// mp-forge — Фаза 11, кусочек 1: Горн (постройка) + добыча материалов.
// Первый кусочек кузницы/снаряжения (до сих пор перенесено на 0% — см.
// supabase/README.md, общий список пробелов). Начинаем с самого основания:
// здание "Горн" (index.html:2430-2432 — RoK-кузница БЕЗ уровней, разовая
// постройка, max:1, не 25, отдельный FORGE_TABLE с одной строкой) плюс
// добыча СЫРЫХ материалов, дословно produceMaterial(p,mat) (index.html:
// 5864-5873). Крафт СНАРЯЖЕНИЯ (startCraftItem, редкости/шанс/экипировка) —
// НЕ в этом кусочке, отдельная следующая задача, требует куда больше кода
// (GEAR_SLOTS/GEAR_NAMES/gearItemStats/genStats.gearBonus и т.д.).
//
// Действие "Горн" как здание строится через уже существующий mp-build —
// mp-build/index.js получил FORGE_TABLE в BUILD_BLD_TABLE и разовый
// потолок уровня (BUILD_MAX_LV_OVERRIDE), см. правку там же. Этот файл —
// только добыча материалов, отдельное самостоятельное действие (как
// mp-research — своя очередь p.craft, не связанная с очередями построек).
//
// Честные упрощения:
// 1. Материал ВСЕГДА добывается обычного качества (тир 0 из 5) — то же
//    самое, что и в источнике (p.materials[c.mat][0]+=c.n, index.html:4849)
//    — повышение качества (upgradeMaterial, 4 обычных -> 1 улучшенный) сюда
//    не входит, отдельный следующий кусочек.
// 2. Источник (produceMaterial, index.html:5864-5873) НЕ проверяет
//    p.b.forge>0 в самой функции — только клиентская кнопка спрятана без
//    построенного Горна (index.html:5566 if(!p.craft&&p.b.forge>0)). У
//    сервера такой страховки со стороны UI нет (тот же принцип, что и в
//    mp-research — "нужна построенная Академия" туда добавлена явно), эта
//    функция проверяет p.b.forge>0 явно — небольшая осознанная поправка
//    к самому источнику, не молчаливое расхождение.
// 3. Очередь одна на игрока (p.craft) — то же самое, что и в источнике
//    (Горн — не multi-здание, один "станок" на город).
//
// Тело запроса: { mat: "ore"|"leather"|"bone"|"ebony" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });

// index.html:2182 MATERIALS — только id'шники нужны здесь (валидация тела
// запроса), названия/иконки — дело клиента.
const MATERIAL_IDS = ["ore", "leather", "bone", "ebony"];

// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/
// rules.js) — тот же узкий, БЕЗ bonuses(), снимок, что и в mp-research
// (нужен только чтобы p.res.gold был актуален перед pay(), сама добыча
// материалов ни от каких бонусов не зависит).
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
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
    const mat = String(body.mat || "");
    if (!MATERIAL_IDS.includes(mat)) return jsonResponse({ err: "Неизвестный материал" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    p.race = p.race || row.race; // самоисцеление легаси-записей, см. mp-research/mp-train
    const now = Date.now() / 1000;
    syncRes(p, now);

    // Самоисцеление легаси-состояния — как и everywhere else в этом наборе
    // функций, не потому что это где-то реально ожидается (mp-join уже
    // заводит materials/craft на новых игроков).
    if (!p.materials) p.materials = { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] };
    if (!p.materials[mat]) p.materials[mat] = [0, 0, 0, 0, 0];

    // Явная страховка со стороны сервера (см. заголовок файла, пункт 2) —
    // в источнике её у самой produceMaterial() нет, только у клиентской
    // кнопки.
    if (!(p.b.forge > 0)) return jsonResponse({ err: "Нужен построенный Горн" }, 400);

    // Дословно produceMaterial(p,mat) из index.html:5864-5873.
    if (p.craft) return jsonResponse({ err: "Кузница занята" }, 400);
    const n = 3, cost = { gold: 100 };
    if (!canPay(p.res, cost)) return jsonResponse({ err: "Не хватает золота" }, 400);
    pay(p.res, cost);
    const t = 2400; // 40 минут за партию
    p.craft = { kind: "material", mat, n, t0: now, t1: now + t };

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    const fireAt = new Date((now + t) * 1000).toISOString();
    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: fireAt, type: "craft",
      data: { player_id: row.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: t, fire_at: fireAt, mat, n });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
