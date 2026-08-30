// =============================================================================
// mp-raid — Фаза 8, кусочек 2: отправляет отряд на лагерь варваров
// (map_cells, t:"camp"|"fort", появившийся благодаря seedCampsAround в
// mp-join). Дispatch-only, тот же марш-конвейер, что и у mp-attack/
// mp-gather (список отрядов/marchSlots/travel по прямой) — сам бой
// (resolveBanditRaid, однообменный, НЕ resolveBattle()) разрешается
// позже, при прибытии, в mp-tick (applyRaidArrive), тем же принципом
// "текущее состояние на момент события", что и у остальных маршей.
//
// Честные упрощения:
// 1. Расстояние — по прямой, как у mp-attack/mp-gather: местность помимо
//    самих клеток не генерируется.
// 2. ~~Респаун разгромленного лагеря — НЕ перенесён~~ — закрыто в Фазе 8,
//    кусочек 3 (см. applyCampRespawn в mp-tick).
// 3. ~~Книги опыта генерала (bookDrop) — не перенесены~~ / ~~Опыт
//    генерала (BANDIT_XP) — не перенесён~~ — оба закрыты (BANDIT_XP в
//    Фазе 10 кусочек 1, bookDrop отдельным кусочком позже — applyRaidArrive
//    начисляет и то, и другое победителю).
//
// Тело запроса: { x: number, y: number, units:{inf:{1:n,...},...},
//                  with_gen?: boolean }
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
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } };
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
const marchSlots = (hall) => (hall >= 22 ? 5 : hall >= 17 ? 4 : hall >= 11 ? 3 : hall >= 5 ? 2 : 1);

// bonuses(p).march — та же узкая копия, что и в mp-gather (только march
// нужен на отправке; боевые поля считает mp-tick при прибытии, полной
// копией bonuses(), как и у mp-attack).
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
// Только Гимрод (дворф, id:1) и Тариэль (эльф, id:1) реально трогают march
// среди генералов (index.html:2283-2344) — остальные шесть его не меняют,
// отдельная GENERALS-таблица здесь не нужна.
const RACES_MINUS_MARCH = { dwarf: 0.90 }; // только раса с march-модификатором минуса (mult)
const RACE_EPOCH_MARCH = { elf: 2 }; // эпоха (индекс), с которой march ×1.10 — только у эльфов
const ACADEMY_MARCH_NODES = [
  { id: "mil_march1", total: 0.15, max: 5 },
  { id: "mil_march2", total: 0.15, max: 5 },
];
const portalMarchBonus = (lv) => (lv <= 0 ? 0 : lv <= 10 ? lv * 0.005 : 10 * 0.005 + (lv - 10) * 0.01);
function marchBonusOnly(p) {
  let march = 1;
  if (RACES_MINUS_MARCH[p.race]) march *= RACES_MINUS_MARCH[p.race];
  const epoch = epochOf(p.b && p.b.hall);
  if (RACE_EPOCH_MARCH[p.race] !== undefined && epoch > RACE_EPOCH_MARCH[p.race]) march *= 1.10;
  if (p.race === "dwarf" && ((p.gen && p.gen.id) || 0) === 1) march += 0.10;
  if (p.race === "elf" && ((p.gen && p.gen.id) || 0) === 1) march += 0.05;
  march *= 1 + portalMarchBonus((p.b && p.b.portal) || 0);
  // index.html:3766/3787 TALENTS.gath.g3 и GENERAL_TREE.army.gt_a7 — оба
  // march-мультипликаторы (по .03 за очко). Фаза 10, кусочек 3: p.gen.tal
  // теперь реально заполняется (mp-talent, кусочек 2).
  const T = (p.gen && p.gen.tal) || {};
  march *= 1 + (T.g3 || 0) * .03;
  march *= 1 + (T.gt_a7 || 0) * .03;
  const tech = p.tech || {};
  let mult = 0;
  ACADEMY_MARCH_NODES.forEach((n) => { const lv = tech[n.id] || 0; if (lv) mult += n.total * (lv / n.max); });
  march *= 1 + mult;
  return march;
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
    const withGen = !!body.with_gen;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return jsonResponse({ err: "Не указан лагерь" }, 400);

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
    // Крепость региона (map_cells t:"regfort", миграция 0013) — такая же цель
    // набега, как лагерь и форт. Автор прямо снял запрет: «пусть атакуют, пусть
    // убивают, это их выбор». Одиночному отряду она почти наверняка не по
    // зубам, и панель говорит это заранее, — но запрещать нападение мы не
    // будем.
    const isRegfort = cell && cell.t === "regfort";
    if (!cell || (cell.t !== "camp" && cell.t !== "fort" && !isRegfort))
      return jsonResponse({ err: "Здесь нет лагеря" }, 400);
    // Разорённая крепость и уже взятая союзом — не цель набега: варваров в
    // первой нет вовсе, а вторая берётся не так (это придёт со сбором).
    // Фаза 56 — крепость СОЮЗА тоже цель набега: «на эту крепость можно
    // напасть как сбором, так и одиночными войсками и разбить». Разорённое
    // место (state:'razed'/'building') целью не бывает — там некого бить.
    const fortState = isRegfort ? ((cell.data && cell.data.state) || "barb") : null;
    if (isRegfort && fortState !== "barb" && fortState !== "ally")
      return jsonResponse({ err: fortState === "building"
        ? "Тут пока только стройка — бить некого"
        : "Это место пусто" }, 400);
    if (isRegfort && fortState === "ally") {
      const { data: myMem } = await admin.from("alliance_members")
        .select("alliance_id").eq("player_id", attRow.id).maybeSingle();
      if (myMem && myMem.alliance_id === (cell.data && cell.data.alliance_id))
        return jsonResponse({ err: "Это крепость вашего союза" }, 400);
    }
    // У крепости уровня нет — сила берётся по её ступени, опорным уровнем на
    // ту же кривую banditArmy, что и у лагерей (малая 16-18, средняя 19-22,
    // великая 23-25 по worldgen/regions/SHRINES.md — берём середину).
    // Копия таблицы из index.html (regfortLevel) по правилу самодостаточных
    // функций.
    const REGFORT_TIER_LV = [0, 17, 20, 24];
    const campLv = isRegfort
      ? (REGFORT_TIER_LV[Math.max(1, Math.min(3, ((cell.data && cell.data.tier) | 0)))] || 17)
      : ((cell.data && cell.data.lv) || 1);

    const attP = attRow.state;
    attP.race = attP.race || attRow.race;

    const hallLv = Array.isArray(attP.b.hall) ? Math.max(0, ...attP.b.hall) : attP.b.hall;
    // Общий пул с mp-attack/mp-gather — все три режима делят одни и те же
    // "Отряды в поле" (index.html: renderFieldArmy не отличает их, кроме
    // разведки).
    const { count: busy, error: busyErr } = await admin
      .from("marches").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).eq("player_id", attRow.id).in("mode", ["attack", "gather", "raid"]);
    if (busyErr) return jsonResponse({ err: busyErr.message }, 500);
    // Фаза 53 — войска, отданные в готовящийся сбор союза, из замка ушли ровно
    // так же, как в поход: слот отряда они держат. Без этой второй половины
    // счёта сбор был бы «бесплатным» — можно было бы отдать в него гарнизон и
    // тут же выступить всеми слотами ещё раз.
    const { data: rallyParts } = await admin.from("alliance_rally_parts")
      .select("rally_id, alliance_rallies!inner(state)")
      .eq("player_id", attRow.id).eq("alliance_rallies.state", "gather");
    const busyAll = (busy || 0) + ((rallyParts && rallyParts.length) || 0);
    if (busyAll >= marchSlots(hallLv)) return jsonResponse({ err: "Все отряды заняты" }, 400);

    const sendUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
    let totalSend = 0;
    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) {
        const want = Math.max(0, Math.round(Number((reqUnits[t] && reqUnits[t][i]) || 0)));
        const have = (attP.troops[t] && attP.troops[t][i]) || 0;
        const n = Math.min(want, have);
        sendUnits[t][i] = n; totalSend += n;
      }
    });
    if (totalSend <= 0) return jsonResponse({ err: "Отправьте хотя бы одного воина" }, 400);

    const march = marchBonusOnly(attP);
    const dist = Math.hypot(tx - attRow.x, ty - attRow.y);
    const spd = marchSpeed(sendUnits, attP.race, march);
    const travel = Math.max(20, (dist / spd) * 60);

    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) attP.troops[t][i] = Math.max(0, (attP.troops[t][i] || 0) - sendUnits[t][i]);
    });

    // index.html:4655/5061 takeGen/withGen — рейд на лагерь тоже берёт
    // полководца с собой (bandUnits вообще без своего генерала, но
    // атакующий свой применяет), тот же принцип "один физически", что и в
    // mp-attack (см. заголовок там). march.id нужен раньше записи attP.
    const takeGen = withGen && attP.gen && attP.gen.id != null && attP.gen.away == null;

    const nowSec = Date.now() / 1000;
    const { data: marchRow, error: mErr } = await admin.from("marches").insert({
      world_id: world.id, player_id: attRow.id, mode: "raid", state: "go",
      tx, ty, t0: nowSec, t1: nowSec + travel,
      // regfort в данных марша — чтобы разбор набега (mp-tick, finalizeRaid)
      // знал, что победа тут не стирает клетку, а разоряет крепость.
      units: sendUnits, data: { dist, spd, camp_lv: campLv, cell_x: tx, cell_y: ty, has_gen: takeGen,
                                regfort: isRegfort || undefined },
    }).select().single();
    if (mErr) return jsonResponse({ err: mErr.message }, 500);

    // Событие прибытия создаём ДО записи состояния игрока (см. тот же
    // разбор в mp-attack): тик мира событийный, обхода просроченных маршей
    // у него нет, и марш без своего события висел бы в пути вечно, держа
    // войска и слот отряда.
    const { data: evRow, error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
      type: "march_arrive", data: { march_id: marchRow.id },
    }).select("id").single();
    if (evErr) {
      await admin.from("marches").delete().eq("id", marchRow.id);
      return jsonResponse({ err: evErr.message }, 500);
    }
    const rollback = async () => {
      if (evRow) await admin.from("events").delete().eq("id", evRow.id);
      await admin.from("marches").delete().eq("id", marchRow.id);
    };

    if (takeGen) attP.gen.away = marchRow.id;
    const saved = await savePlayerState(admin, attRow, attP);
    // См. тот же случай в mp-attack: отряд уже создан, при отказе записи его
    // надо убрать, иначе повтор запроса даст второй такой же поход.
    if (saved.conflict) { await rollback(); return conflictResponse(); }
    if (saved.error) { await rollback(); return jsonResponse({ err: saved.error.message }, 500); }

    return jsonResponse({ ok: true, march_id: marchRow.id, eta: travel, has_gen: takeGen });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
