// =============================================================================
// mp-join — Фаза 2. Заводит (или возвращает уже существующего) игрока в
// ОБЩЕМ мире по его anon-uid (Supabase Auth). Единственный способ создать
// строку в players — RLS на этой таблице (см. миграцию 0001) намеренно не
// даёт INSERT никому, кроме service-role, которым обладает только эта
// функция (Deno-рантайм Edge Function, ключ не попадает в браузер).
//
// Вызывается один раз при входе игрока в общий мир (кнопка "Общий мир" в
// будущем UI, ещё не подключена в index.html — это отдельный следующий шаг,
// сама функция уже рабочая и её можно проверить curl'ом/Postman уже сейчас).
//
// Тело запроса: { race: "human"|"dwarf"|"elf"|"undead", nick?: string }
// Ответ: { ok:true, world_id, player: {...строка players...} } либо {err}.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — Dashboard-редактор Edge
// Functions не подтягивает относительные импорты на общую папку, поэтому
// здесь код самодостаточен (копия, а не импорт). При деплое через Supabase
// CLI можно вернуть `import ... from "../_shared/cors.js"` как в репозитории.
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

const RACES = ["human", "dwarf", "elf", "undead"];

// Вставлено буквально из ../_shared/rules.js — добыча ресурсов по времени
// (index.html:3790 production / index.html:3813 plotFillCap / index.html:3838
// syncRes). Нужна здесь, чтобы возвращать уже актуальные ресурсы при
// повторном join (вкладка "Общий мир" опрашивает mp-join раз в 5с, см.
// index.html) — та же "ленивая экономика", что в одиночной игре: не тикает
// сама по себе, досчитывается при каждом обращении.
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
const RES = ["food", "wood", "stone", "gold"];
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

// Тот же снимок полей, что newPlayer() в index.html (см. index.html:2968) —
// специально в той же форме, чтобы Фаза 5 (перенос остальных действий) не
// переписывала форму состояния заново. ai/pts=5/gear/inventory и т.д. —
// как у только что созданного игрока-человека там же (isBot=false: gen.id
// всегда null, ai не используется).
function newPlayerState(race, nowSec) {
  const BKEYS = ["hall", "wall", "farm", "lumber", "quarry", "mine", "academy",
    "store", "barracks", "range", "stable", "siege", "hospital", "scout", "garrison"];
  // Столько же участков, сколько BUILDINGS[k].plots в index.html: farm/
  // lumber/quarry/mine/hospital — все 4 (index.html:2416-2425). Раньше
  // hospital/quarry/mine сюда забыты не были включены — заводились
  // скаляром 0 вместо [0,0,0,0], что ломало mp-build при попытке поднять
  // такое здание (см. самоисцеление в mp-build/mp-tick).
  const MULTI = { farm: 4, lumber: 4, quarry: 4, mine: 4, hospital: 4 };
  const b = {};
  BKEYS.forEach((k) => { b[k] = MULTI[k] ? new Array(MULTI[k]).fill(0) : 0; });
  b.hall = 1; b.wall = 1; b.farm[0] = 1; b.lumber[0] = 1; b.store = 1;
  const troops = {}, wounded = {};
  ["inf", "arc", "cav", "sie"].forEach((t) => {
    troops[t] = {}; wounded[t] = {};
    for (let i = 1; i <= 5; i++) { troops[t][i] = 0; wounded[t][i] = 0; }
  });
  troops.inf[1] = 200; troops.arc[1] = 150;
  return {
    // resAt = момент создания, не 0 — иначе первый же syncRes() увидел бы
    // "прошли миллиарды секунд с эпохи Unix" и начислил бы участку добычу
    // сразу под завязку его plotFillCap.
    res: { food: 100000, wood: 100000, stone: 100000, gold: 100000 }, resAt: nowSec,
    b, queues: [null, null], train: { inf: null, arc: null, cav: null, sie: null },
    troops, wounded, heal: null,
    gen: { lv: 1, xp: 0, pts: 5, tal: {}, id: null, away: null },
    gear: {}, tech: {}, rsch: null,
    inventory: {}, materials: { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] },
    craft: null, tomes: {}, lostTo: null,
  };
}

// Простой поиск свободного места на условной решётке мира — не копия
// findFreeCellInChunk/MIN_STRUCT_GAP из index.html (та логика заточена под
// плотную карту узлов/лагерей одного браузера), здесь городов в общем мире
// будет заведомо меньше и достаточно грубой проверки минимального
// расстояния между СТОЛИЦАМИ, чтобы новый игрок не встал вплотную к чужой.
const MIN_CITY_GAP = 40;
function pickSpawn(existing) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ring = 50 + Math.floor(attempt / 10) * 30;
    const x = Math.round((Math.random() * 2 - 1) * ring);
    const y = Math.round((Math.random() * 2 - 1) * ring);
    const ok = existing.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN_CITY_GAP);
    if (ok) return { x, y };
  }
  return { x: Math.round(Math.random() * 400 - 200), y: Math.round(Math.random() * 400 - 200) };
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
    if (userErr || !user) return jsonResponse({ err: "Не авторизован — нужен anon-вход Supabase Auth" }, 401);

    let body = {};
    try { body = await req.json(); } catch (_) { /* пустое тело — ок для повторного join */ }
    const race = RACES.includes(body.race) ? body.race : null;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Один общий мир на всё время (см. миграцию 0001) — берём самый старый,
    // а если ни одного ещё нет, заводим первый.
    let { data: world, error: wErr } = await admin
      .from("worlds").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr) return jsonResponse({ err: wErr.message }, 500);
    if (!world) {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const ins = await admin.from("worlds").insert({ seed }).select().single();
      if (ins.error) return jsonResponse({ err: ins.error.message }, 500);
      world = ins.data;
    }

    const nowSec = Date.now() / 1000;

    // Уже есть игрок этого uid в этом мире — вернуть его (идемпотентный
    // join), но сперва досчитать добычу ресурсов по прошедшему времени —
    // mp-join это ещё и опрос вкладки "Общий мир" раз в 5с, ресурсы должны
    // быть свежими на каждый такой вызов, а не только на настоящих действиях.
    const existing = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (existing.error) return jsonResponse({ err: existing.error.message }, 500);
    if (existing.data) {
      const st = existing.data.state;
      syncRes(st, nowSec);
      const upd = await admin.from("players").update({ state: st, updated_at: new Date().toISOString() })
        .eq("id", existing.data.id).select().single();
      if (upd.error) return jsonResponse({ err: upd.error.message }, 500);
      return jsonResponse({ ok: true, world_id: world.id, player: upd.data });
    }

    if (!race) return jsonResponse({ err: "Нужна раса: human|dwarf|elf|undead" }, 400);

    const allPlayers = await admin.from("players").select("x,y").eq("world_id", world.id);
    if (allPlayers.error) return jsonResponse({ err: allPlayers.error.message }, 500);
    const { x, y } = pickSpawn(allPlayers.data || []);

    const ins = await admin.from("players").insert({
      world_id: world.id, auth_uid: user.id, is_bot: false, race,
      nick: typeof body.nick === "string" ? body.nick.slice(0, 40) : "",
      x, y, state: newPlayerState(race, nowSec),
    }).select().single();
    if (ins.error) return jsonResponse({ err: ins.error.message }, 500);

    return jsonResponse({ ok: true, world_id: world.id, player: ins.data });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
