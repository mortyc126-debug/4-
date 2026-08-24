// =============================================================================
// mp-gather — Фаза 8, кусочек 1: отправляет отряд собирать ресурсы на
// точке (map_cells, t:"node"), появившейся благодаря seedNodesAround в
// mp-join. Зеркало sendMarch(...,"gather")/arriveMarch-узел из index.html
// (index.html:4646/5018-5039) — тот же марш-конвейер, что и mp-attack
// (список отрядов/marchSlots/travel по прямой), только вместо боя на месте
// начинается отдельный отсчёт сбора (см. applyGatherStart/applyGathered в
// mp-tick), а по возвращении домой добыча зачисляется в ресурсы
// (applyMarchHome, m.data.carry).
//
// Честные упрощения:
// 1. Расстояние — по прямой (Math.hypot), как и у mp-attack: карта местности
//    (map_cells помимо самих точек) не генерируется, обходить нечего.
// 2. Узел не "занимается" жёстко — количество (data.amount) списывается
//    сразу при отправке отряда (та же "бронь", что в index.html), поэтому
//    второй отряд на ту же точку просто получит меньше или наткнётся на
//    "Точка истощена" — отдельного поля busy-блокировки не заводили, чтобы
//    не городить логику её снятия при отмене/ошибке на ровном месте.
// 3. Респаун истощённой точки — ПЕРЕНЕСЁН Фазой 8, кусочком 3 (см. mp-tick/
//    index.js: applyGathered удаляет клетку с amount:0 и заводит событие
//    "node_respawn" на NODE_RESPAWN_SEC=3600с позже — applyNodeRespawn
//    сеет новый узел в 3-12 клетках от старого, со свежим случайным
//    уровнем/ресурсом). Этот комментарий раньше отставал от кода — сам
//    respawn работает, просто не в ЭТОЙ функции (mp-gather только
//    списывает amount при отправке отряда, решение "удалить и посеять
//    заново" принимается позже, когда отряд довозит добычу домой).
//
// Тело запроса: { x: number, y: number, units:{inf:{1:n,...},...} }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js и ../_shared/rules.js — тот же
// приём самодостаточности, что и у остальных функций (см. их заголовки).
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

// =============================================================================
// savePlayerState — запись состояния игрока с проверкой, что его никто не
// перезаписал, пока мы считали.
// =============================================================================
// Каждая функция здесь работает по схеме "прочитал строку игрока -> изменил
// объект state в памяти -> записал его ЦЕЛИКОМ обратно". Пока запросы к
// одному игроку идут строго по очереди, это верно. Но они идут не по
// очереди: клиент опрашивает mp-join каждые пять секунд (а тот пишет строку
// игрока — начисляет добычу), и тик мира (mp-tick) пишет её же, разрешая
// события. Если игрок нажал "Строить" в тот же миг, порядок получался
// такой:
//     действие  читает state (постройки нет, ресурсы целы)
//     mp-join   читает state (то же самое)
//     действие  пишет  state (ресурсы списаны, стройка в очереди)
//     mp-join   пишет  state — СВОЙ, прочитанный ДО действия
// и стройка вместе со списанием исчезала бесследно. Обратный порядок так же
// легко давал зеркальный исход — ресурсы списаны, а стройки нет. Ни ошибки,
// ни следа в логах: последняя запись просто затирала чужую.
//
// Лечится проверкой версии при записи. updated_at и так есть у строки и и
// так пишется при каждом изменении — используем его как метку версии:
// обновляем строку ТОЛЬКО если updated_at всё ещё тот, что мы прочитали.
// Не совпал — значит кто-то записал раньше нас, и наш объект state построен
// на устаревших данных; сообщаем об этом вызывающему, а не затираем.
// Отдельная колонка-счётчик не нужна: миграцию пришлось бы накатывать
// руками через дашборд (см. supabase/README.md), а updated_at уже на месте.
//
// Новая метка строго больше прочитанной (Math.max с +1 мс) — время на
// сервере может идти назад при коррекции часов, а метка версии обязана
// только расти, иначе устаревшее значение однажды совпало бы снова.
//
// Возвращает { ok:true } | { conflict:true } | { error }.
async function savePlayerState(admin, row, state) {
  const prev = row.updated_at;
  if (!prev) {
    // Строка прочитана без updated_at (старый вызывающий код) — сверять не с
    // чем; пишем как раньше, чтобы ничего не сломать, но и не притворяемся,
    // что проверили.
    const { error } = await admin.from("players")
      .update({ state, updated_at: new Date().toISOString() }).eq("id", row.id);
    return error ? { error } : { ok: true };
  }
  const nextIso = new Date(Math.max(Date.now(), Date.parse(prev) + 1)).toISOString();
  const { data, error } = await admin.from("players")
    .update({ state, updated_at: nextIso })
    .eq("id", row.id).eq("updated_at", prev).select("id,updated_at");
  if (error) return { error };
  if (!data || !data.length) return { conflict: true };
  // Своя же метка — на случай второй записи той же строки в этом запросе.
  row.updated_at = data[0].updated_at;
  return { ok: true };
}

// Ответ на проигранную гонку. 409 + retry:true — клиент (mpCall в
// index.html) повторяет такой запрос сам, молча: состояние он перечитает
// заново, так что повтор посчитается уже по свежим данным. Игрок ничего не
// замечает, а данные не теряются.
function conflictResponse() {
  return jsonResponse({ err: "Состояние изменилось, повторяю…", retry: true }, 409);
}

const TKEYS = ["inf", "arc", "cav", "sie"];
const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20]; // index.html:2578
const TROOP_LOAD = { inf: 6, arc: 8, cav: 5, sie: 30 }; // index.html:2583-2587 (TROOP_TYPES[*].load)
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } };
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
// index.html:2725 troopMod(race,t,"load"). Раньше тут стояла ПУСТАЯ таблица с
// комментарием "сейчас ни у одной расы нет модификатора груза" — неверно:
// у нежити осадные всегда несли load:0.80. Это её честный размен: осадные
// нежити бьют вдвое сильнее (atk 2.20*1.05), но возят на 20% меньше. Без
// этой строки в общем мире нежить получала силу БЕЗ обратной стороны и
// собирала с точек на 25% больше, чем та же нежить в одиночке.
const RACE_LOAD_MOD = { undead: { sie: 0.80 } };
const troopLoadMod = (race, t) => (RACE_LOAD_MOD[race] && RACE_LOAD_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
const marchSlots = (hall) => (hall >= 22 ? 5 : hall >= 17 ? 4 : hall >= 11 ? 3 : hall >= 5 ? 2 : 1);
const RES = ["food", "wood", "stone", "gold"];
// amber:45 — index.html:2807. Точки Янтаря теперь реально сеются на общей
// карте (mp-join seedNodesAround / mp-tick applyNodeRespawn/applyAmbientSeed,
// AMBER_NODE_SHARE=0.12), так что этот ключ достижим — держим таблицу полной.
const GATHER_BASE_RATE = { food: 3000, wood: 3000, stone: 2250, gold: 1000, amber: 45 }; // index.html:2807

const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
// bonuses(p) — тот же честный перенос, что и в mp-attack/_shared/rules.js
// (Фаза 6): нужны B.gather/B.gatherFW/B.gatherSG и B.march для скорости
// сбора/марша. ACADEMY_TREE — только узлы с этими тремя полями, без всего
// остального дерева (там их формулы идентичны полной копии в mp-attack).
const ACADEMY_GATHER_NODES = [
  { id: "eco_gfood1", field: "gatherFW", total: 0.15, max: 5 },
  { id: "eco_gwood1", field: "gatherFW", total: 0.15, max: 5 },
  { id: "eco_gstone1", field: "gatherSG", total: 0.15, max: 5 },
  { id: "eco_ggold1", field: "gatherSG", total: 0.15, max: 5 },
  { id: "eco_gfood2", field: "gatherFW", total: 0.35, max: 10 },
  { id: "eco_gwood2", field: "gatherFW", total: 0.35, max: 10 },
  { id: "eco_gstone2", field: "gatherSG", total: 0.35, max: 10 },
  { id: "eco_ggold2", field: "gatherSG", total: 0.35, max: 10 },
  { id: "eco_gall2", field: "gather", total: 0.25, max: 10 },
  // index.html:2218/2245 eco_amber0/eco_amber1 — своя ветка академии для
  // Янтаря, отдельная от gatherFW/gatherSG (см. isAmber-ветку ниже).
  { id: "eco_amber0", field: "gatherAmber", total: 0.05, max: 1 },
  { id: "eco_amber1", field: "gatherAmber", total: 0.35, max: 10 },
  { id: "eco_load1", field: "load", total: 0.15, max: 5 },
  { id: "eco_load2", field: "load", total: 0.25, max: 10 },
  { id: "mil_march1", field: "march", kind: "mult", total: 0.15, max: 5 },
  { id: "mil_march2", field: "march", kind: "mult", total: 0.15, max: 5 },
];
const GENERALS = {
  human: [{ apply: () => {} }, { apply: () => {} }], // ни один людской генерал не трогает march/gather
  dwarf: [{ apply: () => {} }, { apply: (b) => { b.march += 0.10; } }], // Гимрод
  elf: [{ apply: () => {} }, { apply: (b) => { b.march += 0.05; } }],   // Тариэль
  undead: [{ apply: () => {} }, { apply: () => {} }],
};
const RACES_MINUS = {
  human: { field: "prodGold", kind: "frac", value: -0.15 },
  dwarf: { field: "march", kind: "mult", value: 0.90 },
  elf: { field: "def", kind: "frac", value: -0.10 },
  undead: { field: "def", kind: "frac", value: -0.10 },
};
const RACE_EPOCHS_MARCH = {
  // Только строки, которые реально трогают march/gather (index.html:1767-1832)
  // — остальные поля той же таблицы (atk/def/prodX/...) здесь не нужны,
  // эта функция считает ТОЛЬКО B.march/B.gather*/B.load для нужд похода.
  human: [null, null, null, null, null],
  dwarf: [null, null, null, null, null],
  elf: [null, null, { field: "march", kind: "mult", value: 1.10 }, null, null],
  undead: [null, null, null, null, null],
};
const portalMarchBonus = (lv) => (lv <= 0 ? 0 : lv <= 10 ? lv * 0.005 : 10 * 0.005 + (lv - 10) * 0.01);

function bonuses(p) {
  const b = { march: 1, gather: 0, gatherFW: 0, gatherSG: 0, gatherAmber: 0, load: 0 };
  const mn = RACES_MINUS[p.race];
  if (mn.field === "march") { if (mn.kind === "mult") b.march *= mn.value; else b.march += mn.value; }
  const epoch = epochOf(p.b && p.b.hall), track = RACE_EPOCHS_MARCH[p.race];
  for (let i = 0; i < epoch; i++) {
    const e = track[i]; if (!e) continue;
    if (e.kind === "mult") b[e.field] *= e.value; else b[e.field] = (b[e.field] || 0) + (e.value || 0);
  }
  (GENERALS[p.race][(p.gen && p.gen.id) || 0]).apply(b);
  b.march *= 1 + portalMarchBonus((p.b && p.b.portal) || 0);
  // index.html:3760-3767/3780-3787 TALENTS (g1-g5) и GENERAL_TREE (gt_a7/
  // gt_a8) — только те узлы, что реально трогают march/gather/load, тот же
  // принцип сужения, что и у ACADEMY_GATHER_NODES выше. Фаза 10, кусочек 3:
  // p.gen.tal теперь реально заполняется (mp-talent, кусочек 2).
  const T = (p.gen && p.gen.tal) || {};
  const g = (id) => T[id] || 0;
  b.load += g("g1") * .04; b.gather += g("g2") * .04; b.march *= 1 + g("g3") * .03;
  b.gatherFW += g("g4") * .05; b.gatherSG += g("g5") * .05;
  const tech = p.tech || {};
  const multAcc = {};
  ACADEMY_GATHER_NODES.forEach((n) => {
    const lv = tech[n.id] || 0; if (!lv) return;
    const inc = n.total * (lv / n.max);
    if (n.kind === "mult") multAcc[n.field] = (multAcc[n.field] || 0) + inc;
    else b[n.field] = (b[n.field] || 0) + inc;
  });
  Object.keys(multAcc).forEach((f) => { b[f] = (b[f] === undefined ? 1 : b[f]) * (1 + multAcc[f]); });
  b.load += g("gt_a8") * .03; b.march *= 1 + g("gt_a7") * .03;
  return b;
}

function marchSpeed(units, race, marchBonus = 1) {
  let s = 99;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      if ((units[t] && units[t][i]) > 0) s = Math.min(s, TROOP_SPEED[t] * troopSpeedMod(race, t));
    }
  });
  if (s > 90) s = 1;
  return s * MARCH_SPEED_SCALE * marchBonus;
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
    const tx = Math.round(Number(body.x)), ty = Math.round(Number(body.y));
    const reqUnits = body.units && typeof body.units === "object" ? body.units : {};
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return jsonResponse({ err: "Не указана точка" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: attRow, error: aErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (aErr) return jsonResponse({ err: aErr.message }, 500);
    if (!attRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const { data: cell, error: cErr } = await admin
      .from("map_cells").select("*").eq("world_id", world.id).eq("x", tx).eq("y", ty).maybeSingle();
    if (cErr) return jsonResponse({ err: cErr.message }, 500);
    if (!cell || cell.t !== "node") return jsonResponse({ err: "Здесь нет точки сбора" }, 400);
    const cellAmount = (cell.data && cell.data.amount) || 0;
    if (cellAmount <= 0) return jsonResponse({ err: "Точка истощена" }, 400);

    const attP = attRow.state;
    attP.race = attP.race || attRow.race; // самоисцеление, тот же приём, что и в mp-attack/mp-train

    const hallLv = Array.isArray(attP.b.hall) ? Math.max(0, ...attP.b.hall) : attP.b.hall;
    // Марш-слоты — общий пул с mp-attack (index.html: и осада, и сбор —
    // одни и те же "отряды в поле", renderFieldArmy фильтрует только
    // разведку отдельно). Считаем оба режима вместе.
    const { count: busy, error: busyErr } = await admin
      .from("marches").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).eq("player_id", attRow.id).in("mode", ["attack", "gather", "raid"]);
    if (busyErr) return jsonResponse({ err: busyErr.message }, 500);
    if ((busy || 0) >= marchSlots(hallLv)) return jsonResponse({ err: "Все отряды заняты" }, 400);

    const sendUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
    let totalSend = 0, loadCap = 0;
    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) {
        const want = Math.max(0, Math.round(Number((reqUnits[t] && reqUnits[t][i]) || 0)));
        const have = (attP.troops[t] && attP.troops[t][i]) || 0;
        const n = Math.min(want, have);
        sendUnits[t][i] = n; totalSend += n;
        loadCap += n * TROOP_LOAD[t] * TIER_MULT[i - 1] * troopLoadMod(attP.race, t);
      }
    });
    if (totalSend <= 0) return jsonResponse({ err: "Отправьте хотя бы одного воина" }, 400);

    const B = bonuses(attP);
    loadCap = Math.round(loadCap * (1 + B.load));
    const take = Math.min(loadCap, cellAmount);
    if (take <= 0) return jsonResponse({ err: "Отряд не может ничего унести" }, 400);

    const res = (cell.data && cell.data.res) || "food";
    const isAmber = res === "amber";
    let rate = GATHER_BASE_RATE[res] * (60 + hallLv * 22) / 82 * (1 + B.gather);
    // index.html:5210-5211 — Янтарь на своей ветке академии (gatherAmber),
    // не на gatherFW/gatherSG обычных ресурсов.
    rate *= isAmber ? (1 + (B.gatherAmber || 0))
      : (res === "food" || res === "wood") ? (1 + B.gatherFW) : (1 + B.gatherSG);
    const gatherSecs = (take / rate) * 3600;

    const dist = Math.hypot(tx - attRow.x, ty - attRow.y);
    const spd = marchSpeed(sendUnits, attP.race, B.march);
    const travel = Math.max(20, (dist / spd) * 60);

    // Бронируем добычу за этим отрядом сразу (та же логика, что и в
    // index.html arriveMarch — cell.amount уменьшается по факту отправки,
    // не по факту прибытия), чтобы второй отряд на ту же точку не мог
    // рассчитывать на уже занятые ресурсы.
    const newCellData = { ...(cell.data || {}), amount: Math.max(0, cellAmount - take) };
    const { error: updCell } = await admin.from("map_cells")
      .update({ data: newCellData, updated_at: new Date().toISOString() })
      .eq("world_id", world.id).eq("x", tx).eq("y", ty);
    if (updCell) return jsonResponse({ err: updCell.message }, 500);

    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) attP.troops[t][i] = Math.max(0, (attP.troops[t][i] || 0) - sendUnits[t][i]);
    });
    const saved = await savePlayerState(admin, attRow, attP);
    if (saved.conflict) return conflictResponse();          // см. savePlayerState
    if (saved.error) return jsonResponse({ err: saved.error.message }, 500);

    const nowSec = Date.now() / 1000;
    const { data: march, error: mErr } = await admin.from("marches").insert({
      world_id: world.id, player_id: attRow.id, mode: "gather", state: "go",
      tx, ty, t0: nowSec, t1: nowSec + travel,
      units: sendUnits, data: { res, take, dist, spd, gather_secs: gatherSecs, cell_x: tx, cell_y: ty },
    }).select().single();
    if (mErr) return jsonResponse({ err: mErr.message }, 500);

    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
      type: "march_arrive", data: { march_id: march.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, march_id: march.id, eta: travel + gatherSecs });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
