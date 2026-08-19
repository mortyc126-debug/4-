// =============================================================================
// mp-craft — Фаза 11, кусочек 3: ковка снаряжения. Зеркало
// startCraftItem(p,slot,order,rarity) (index.html:5879-5894) — вторая (и
// последняя) работа для очереди Горна (p.craft), после добычи материалов
// (mp-forge, Фаза 11 кусочек 1). Экипировка/снятие/разбор скованного
// (equipItem/unequipItem/dismantleItem, index.html:5895-5917) — НЕ в этом
// кусочке, отдельные следующие задачи: этот кусочек только доводит
// предмет до склада (p.inventory), надеть его пока нельзя.
//
// Честные упрощения/добавки:
// 1. Как и у mp-forge, источник не проверяет p.b.forge>0 в самой функции
//    (только клиентская кнопка спрятана без здания) — сервер проверяет
//    явно.
// 2. `order` ("bastion"|"storm" — школа ковки, определяет линейку имён и
//    какой стат первичный/вторичный, см. GEAR_NAMES/gearItemStats в
//    index.html) НЕ проверяется в самой startCraftItem() источника вообще
//    — сервер проверяет явно (то же самое соображение, что и с forge>0).
// 3. Шанс успеха ковки (CRAFT_CHANCE по редкости) разрешается через
//    Math.random() в mp-tick при завершении очереди — не seeded PRNG, как
//    у погоды/боя: здесь нет требования "тот же марш/бой — тот же исход
//    при пересчёте", это разовое событие без параллельной сверки, Math.
//    random() уже используется в этом наборе функций для похожих разовых
//    случайностей (см. mp-join, генерация точек карты).
//
// Тело запроса: { slot: string, order: "bastion"|"storm", rarity: 1..5 }
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
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);

// index.html:2187-2197 GEAR_SLOTS — только id/mat нужны здесь (какой
// материал расходуется), название/категория — дело клиента.
const GEAR_SLOTS = {
  helmet: { mat: "ore" }, chest: { mat: "ore" },
  gloves: { mat: "leather" }, pants: { mat: "leather" }, boots: { mat: "leather" },
  handL: { mat: "ebony" }, handR: { mat: "ebony" },
  acc1: { mat: "bone" }, acc2: { mat: "bone" },
};
const ORDERS = ["bastion", "storm"];
// index.html:2246-2251 CRAFT_CHANCE/CRAFT_MAT_NEED/craftCost — дословно.
const CRAFT_CHANCE = [1.0, 0.9, 0.75, 0.55, 0.35];
const CRAFT_MAT_NEED = [2, 1, 1, 1, 1];
function craftCost(mat, tier, r) {
  const gold = 200 * r * r;
  const c = { gold, food: Math.round(gold * 0.3), wood: Math.round(gold * 0.3) };
  c[mat] = null; // материал расходуется отдельно, не через canPay/pay
  return c;
}

// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/
// rules.js) — тот же узкий, БЕЗ bonuses(), снимок, что и в mp-forge/
// mp-research (нужен только чтобы p.res было актуально перед pay()).
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
    const slot = String(body.slot || "");
    const order = String(body.order || "");
    const rarity = Number(body.rarity);
    const s = GEAR_SLOTS[slot];
    if (!s) return jsonResponse({ err: "Неизвестный слот" }, 400);
    if (!ORDERS.includes(order)) return jsonResponse({ err: "Неизвестная школа ковки" }, 400);
    if (!Number.isInteger(rarity) || rarity < 1 || rarity > 5) return jsonResponse({ err: "Неверная редкость" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    p.race = p.race || row.race; // самоисцеление легаси-записей
    const now = Date.now() / 1000;
    syncRes(p, now);

    if (!p.materials) p.materials = { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] };
    if (!p.materials[s.mat]) p.materials[s.mat] = [0, 0, 0, 0, 0];

    // Явная страховка со стороны сервера (см. заголовок файла, пункт 1).
    if (!(p.b && p.b.forge > 0)) return jsonResponse({ err: "Нужен построенный Горн" }, 400);

    // Дословно startCraftItem(p,slot,order,rarity) из index.html:5879-5894.
    if (p.craft) return jsonResponse({ err: "Кузница занята" }, 400);
    const hallLv = Array.isArray(p.b.hall) ? Math.max(0, ...p.b.hall) : (p.b.hall || 0);
    if (rarity > epochOf(hallLv)) return jsonResponse({ err: "Такая редкость откроется позже" }, 400);
    const tier = rarity - 1, need = CRAFT_MAT_NEED[tier];
    if ((p.materials[s.mat][tier] || 0) < need) return jsonResponse({ err: "Не хватает материала нужного качества" }, 400);
    const c = craftCost(s.mat, tier, rarity);
    if (!canPay(p.res, { gold: c.gold, food: c.food, wood: c.wood })) return jsonResponse({ err: "Не хватает ресурсов" }, 400);
    pay(p.res, { gold: c.gold, food: c.food, wood: c.wood });
    p.materials[s.mat][tier] -= need;
    const t = 1800 * rarity * rarity;
    p.craft = { kind: "item", slot, order, rarity, t0: now, t1: now + t };

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    const fireAt = new Date((now + t) * 1000).toISOString();
    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: fireAt, type: "craft",
      data: { player_id: row.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: t, fire_at: fireAt, slot, order, rarity });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
