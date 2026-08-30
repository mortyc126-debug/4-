// =============================================================================
// mp-rally — Фаза 53: общий сбор союза. Созыв, присоединение, отзыв, отмена.
// =============================================================================
// Таблицы — supabase/migrations/0014_rally.sql, там же разобрано, как сбор
// ложится на уже существующий марш. Здесь только то, что происходит ДО
// выступления; выступление и разбор боя — в mp-tick.
//
// Одна функция на четыре операции по тому же доводу, что и mp-alliance (см. её
// шапку): все четыре работают с одними и теми же двумя строками и делят весь
// пролог, а деплой руками через дашборд делает каждый лишний файл лишним
// риском.
//
// Тело запроса: { op: "...", ... }
//   start    {tx, ty, minutes, units, withGen} — созвать сбор на цель
//   join     {rallyId, units}                  — привести войска в чужой сбор
//   withdraw {rallyId}                         — забрать свои войска обратно
//   cancel   {rallyId}                         — распустить сбор (созывающий)
// Ответ: { ok:true, ... } либо { err }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
function handleOptions(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  return null;
}

const TKEYS = ["inf", "arc", "cav", "sie"];

// Сроки сбора — ровно те четыре, что назвал автор. Минутами, потому что
// минутами их и выбирают.
const RALLY_MINUTES = [5, 15, 30, 360];

// Вместимость общего сбора по уровню Центра Альянса. Копия ALLY_RALLY_CAP из
// index.html по правилу самодостаточных функций (см. supabase/README.md).
const ALLY_RALLY_CAP = [30000, 36000, 43000, 51000, 60000, 72000, 86000, 100000, 120000, 140000,
  170000, 210000, 240000, 290000, 350000, 410000, 490000, 590000, 700000, 830000,
  990000, 1200000, 1400000, 1700000, 2000000];
function rallyCapFor(state) {
  const lv = (state && state.b && state.b.alliance) || 0;
  return lv > 0 ? ALLY_RALLY_CAP[Math.min(25, lv) - 1] : 0;
}

// Слотов отрядов по уровню ратуши — копия marchSlots из mp-raid/mp-attack.
function marchSlots(hallLv) {
  const lv = Math.max(0, Math.min(25, hallLv | 0));
  return lv >= 21 ? 5 : lv >= 16 ? 4 : lv >= 10 ? 3 : lv >= 4 ? 2 : 1;
}

function unitsTotal(u) {
  let n = 0;
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) n += (u && u[t] && u[t][i]) || 0; });
  return n;
}
function emptyUnits() {
  const u = {}; TKEYS.forEach((t) => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = 0; });
  return u;
}
function unitsAdd(a, b) {
  const out = emptyUnits();
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++)
    out[t][i] = ((a && a[t] && a[t][i]) || 0) + ((b && b[t] && b[t][i]) || 0); });
  return out;
}

// Сколько отрядов игрока уже в поле. Считаются И обычные марши, И участие в
// сборах: войска, отданные в сбор, из замка ушли ровно так же, и «свободных
// отрядов» у игрока от этого столько же меньше. Без этого счёта можно было бы
// раздать один и тот же гарнизон в пять сборов сразу.
async function busySlots(admin, worldId, playerId) {
  const [marches, parts] = await Promise.all([
    // Выступивший сбор у созывающего уже есть обычным маршем — иначе он
    // считался бы дважды и съедал два слота вместо одного.
    admin.from("marches").select("id", { count: "exact", head: true })
      .eq("world_id", worldId).eq("player_id", playerId).in("mode", ["attack", "gather", "raid"])
      .is("data->>rally_id", null),
    admin.from("alliance_rally_parts")
      .select("rally_id, alliance_rallies!inner(state)")
      .eq("player_id", playerId).in("alliance_rallies.state", ["gather", "march"]),
  ]);
  return (marches.count || 0) + ((parts.data && parts.data.length) || 0);
}

// Вернуть игроку его долю из сбора. Одним местом, потому что случаев три:
// отзыв, отмена созывающим и роспуск союза.
async function returnUnits(admin, playerId, units) {
  if (unitsTotal(units) <= 0) return;
  const { data: row } = await admin.from("players").select("id,state,updated_at").eq("id", playerId).maybeSingle();
  if (!row) return;
  const p = row.state;
  p.troops = unitsAdd(p.troops, units);
  await admin.from("players")
    .update({ state: p, updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString() })
    .eq("id", playerId);
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
    const op = String(body.op || "");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: world } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: meRow } = await admin.from("players").select("*")
      .eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (!meRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);
    if (meRow.dead_at) return jsonResponse({ err: "Правитель погиб" }, 400);

    // Сбор — дело союза: без союза ни созвать, ни присоединиться.
    const { data: myMem } = await admin.from("alliance_members")
      .select("alliance_id, role").eq("player_id", meRow.id).maybeSingle();
    if (!myMem) return jsonResponse({ err: "Сбор созывают союзом — вступите в союз" }, 400);

    const meP = meRow.state;
    meP.race = meP.race || meRow.race;
    const hallLv = Array.isArray(meP.b.hall) ? Math.max(0, ...meP.b.hall) : meP.b.hall;

    // Что игрок отдаёт в сбор — общий разбор для start и join: берём не больше,
    // чем у него есть (тот же приём, что в mp-raid), и списываем сразу.
    const takeUnits = () => {
      const req = body.units || {};
      const send = emptyUnits();
      let total = 0;
      TKEYS.forEach((t) => {
        for (let i = 1; i <= 5; i++) {
          const want = Math.max(0, Math.round(Number((req[t] && req[t][i]) || 0)));
          const have = (meP.troops[t] && meP.troops[t][i]) || 0;
          const n = Math.min(want, have);
          send[t][i] = n; total += n;
        }
      });
      return { send, total };
    };
    const chargeUnits = async (send) => {
      TKEYS.forEach((t) => {
        for (let i = 1; i <= 5; i++) meP.troops[t][i] = Math.max(0, (meP.troops[t][i] || 0) - send[t][i]);
      });
      const nextIso = new Date(Math.max(Date.now(), Date.parse(meRow.updated_at) + 1)).toISOString();
      const { data, error } = await admin.from("players")
        .update({ state: meP, updated_at: nextIso })
        .eq("id", meRow.id).eq("updated_at", meRow.updated_at).select("id");
      if (error) return { error };
      if (!data || !data.length) return { conflict: true };
      return { ok: true };
    };

    // -----------------------------------------------------------------------
    // start — созвать сбор
    // -----------------------------------------------------------------------
    if (op === "start") {
      const minutes = Number(body.minutes);
      if (!RALLY_MINUTES.includes(minutes))
        return jsonResponse({ err: "Срок сбора — 5, 15, 30 минут или 6 часов" }, 400);
      const tx = Math.round(Number(body.tx)), ty = Math.round(Number(body.ty));
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return jsonResponse({ err: "Не указана цель" }, 400);

      // Один сбор на созывающего: два своих сбора разом — это способ обойти и
      // вместимость, и слоты отрядов.
      const { data: mine } = await admin.from("alliance_rallies")
        .select("id").eq("leader_id", meRow.id).in("state", ["gather", "march"]).limit(1);
      if (mine && mine.length) return jsonResponse({ err: "Вы уже ведёте сбор" }, 400);

      const cap = rallyCapFor(meP);
      if (cap <= 0) return jsonResponse({ err: "Нужен построенный Центр Альянса — он и задаёт вместимость сбора" }, 400);

      // Цель. Лагерь/форт/крепость варваров — из map_cells; чужой город — из
      // players. Свой город, соратник по союзу и стоящий под щитом целью не
      // бывают: первые два бессмысленны, третий защищён.
      let targetKind = "", targetPlayerId = null, targetName = "";
      const { data: cell } = await admin.from("map_cells").select("*")
        .eq("world_id", world.id).eq("x", tx).eq("y", ty).maybeSingle();
      if (cell && (cell.t === "camp" || cell.t === "fort")) {
        targetKind = cell.t;
        targetName = (cell.t === "fort" ? "Форт" : "Лагерь") + " варваров";
      } else if (cell && cell.t === "regfort") {
        // Фаза 56 — сбор ходит и на крепость союза: это ровно та цель, ради
        // которой сбор в первую очередь и созывают.
        const fortState = (cell.data && cell.data.state) || "barb";
        if (fortState !== "barb" && fortState !== "ally")
          return jsonResponse({ err: fortState === "building"
            ? "Тут пока только стройка — бить некого"
            : "Это место пусто" }, 400);
        if (fortState === "ally" && (cell.data && cell.data.alliance_id) === myMem.alliance_id)
          return jsonResponse({ err: "Это крепость вашего союза" }, 400);
        targetKind = "regfort";
        targetName = (cell.data && cell.data.shrine) ||
                     (fortState === "ally" ? "Крепость союза" : "Крепость варваров");
      } else {
        const { data: foe } = await admin.from("players")
          .select("id,nick,x,y,shield_until,dead_at").eq("world_id", world.id)
          .eq("x", tx).eq("y", ty).is("dead_at", null).maybeSingle();
        if (!foe) return jsonResponse({ err: "На этой клетке нечего брать" }, 400);
        if (foe.id === meRow.id) return jsonResponse({ err: "Это ваш собственный город" }, 400);
        const { data: foeMem } = await admin.from("alliance_members")
          .select("alliance_id").eq("player_id", foe.id).maybeSingle();
        if (foeMem && foeMem.alliance_id === myMem.alliance_id)
          return jsonResponse({ err: "Это соратник по союзу" }, 400);
        if (Number(foe.shield_until || 0) > Date.now() / 1000)
          return jsonResponse({ err: "Он под щитом мира" }, 400);
        targetKind = "city"; targetPlayerId = foe.id; targetName = foe.nick || "Правитель";
      }

      const { send, total } = takeUnits();
      if (total <= 0) return jsonResponse({ err: "Отправьте хотя бы одного воина" }, 400);
      if (total > cap) return jsonResponse({ err: "Больше вместимости сбора (" + cap + ")" }, 400);
      if ((await busySlots(admin, world.id, meRow.id)) >= marchSlots(hallLv))
        return jsonResponse({ err: "Все отряды заняты" }, 400);

      // Полководец идёт с созывающим и только с ним — прямое условие автора:
      // «генерал будет участвовать тот, кто возглавляет сбор». У
      // присоединяющихся полководца не спрашивают вовсе.
      const takeGen = !!body.withGen && meP.gen && meP.gen.id != null && meP.gen.away == null;

      const charged = await chargeUnits(send);
      if (charged.conflict) return jsonResponse({ err: "Состояние изменилось, повторяю…", retry: true }, 409);
      if (charged.error) return jsonResponse({ err: charged.error.message }, 500);

      const until = new Date(Date.now() + minutes * 60000).toISOString();
      const { data: rally, error: rErr } = await admin.from("alliance_rallies").insert({
        world_id: world.id, alliance_id: myMem.alliance_id, leader_id: meRow.id,
        tx, ty, target_kind: targetKind, target_player_id: targetPlayerId, target_name: targetName,
        gather_until: until, state: "gather", cap, has_gen: takeGen,
      }).select("*").maybeSingle();
      if (rErr) { await returnUnits(admin, meRow.id, send); return jsonResponse({ err: rErr.message }, 500); }
      await admin.from("alliance_rally_parts").insert({ rally_id: rally.id, player_id: meRow.id, units: send });

      // Полководец уезжает с войском — как и в обычном походе.
      if (takeGen) {
        meP.gen.away = { rally: rally.id };
        await admin.from("players").update({ state: meP }).eq("id", meRow.id);
      }
      // Событие выступления. Разбирает его mp-tick: соберёт доли, сложит
      // войска и создаст один обычный марш.
      await admin.from("events").insert({
        world_id: world.id, fire_at: until, type: "rally_launch", data: { rally_id: rally.id },
      });
      // Сбор — дело общее, и знать о нём должны все: строка в чат союза.
      await admin.from("alliance_chat").insert({
        alliance_id: myMem.alliance_id, player_id: null, nick: "", kind: "system",
        body: (meRow.nick || "Безымянный лорд") + " созывает сбор на «" + targetName + "» (" + tx + ", " + ty + ")." +
              " Выступаем через " + (minutes >= 60 ? (minutes / 60) + " ч" : minutes + " мин") + ".",
      });
      return jsonResponse({ ok: true, rally_id: rally.id, cap, until });
    }

    // -----------------------------------------------------------------------
    // Дальше — операции над уже существующим сбором.
    // -----------------------------------------------------------------------
    const rallyId = Number(body.rallyId);
    if (!Number.isFinite(rallyId)) return jsonResponse({ err: "Не указан сбор" }, 400);
    const { data: rally } = await admin.from("alliance_rallies").select("*").eq("id", rallyId).maybeSingle();
    if (!rally) return jsonResponse({ err: "Такого сбора нет" }, 400);
    if (rally.alliance_id !== myMem.alliance_id) return jsonResponse({ err: "Это сбор другого союза" }, 400);
    if (rally.state !== "gather") return jsonResponse({ err: "Сбор уже выступил" }, 400);

    // -----------------------------------------------------------------------
    // join — привести войска
    // -----------------------------------------------------------------------
    if (op === "join") {
      const { data: already } = await admin.from("alliance_rally_parts")
        .select("player_id").eq("rally_id", rallyId).eq("player_id", meRow.id).maybeSingle();
      if (already) return jsonResponse({ err: "Вы уже в этом сборе" }, 400);
      if (Date.parse(rally.gather_until) <= Date.now())
        return jsonResponse({ err: "Сбор уже выступает" }, 400);

      const { send, total } = takeUnits();
      if (total <= 0) return jsonResponse({ err: "Отправьте хотя бы одного воина" }, 400);
      if ((await busySlots(admin, world.id, meRow.id)) >= marchSlots(hallLv))
        return jsonResponse({ err: "Все отряды заняты" }, 400);

      // Вместимость — на ВЕСЬ сбор, а не на одного: она и есть то, ради чего
      // растят Центр Альянса.
      const { data: parts } = await admin.from("alliance_rally_parts")
        .select("units").eq("rally_id", rallyId);
      let inRally = 0;
      (parts || []).forEach((p) => { inRally += unitsTotal(p.units); });
      const room = Math.max(0, Number(rally.cap) - inRally);
      if (room <= 0) return jsonResponse({ err: "Сбор уже полон" }, 400);
      if (total > room) return jsonResponse({ err: "В сборе осталось места на " + room + " воинов" }, 400);

      const charged = await chargeUnits(send);
      if (charged.conflict) return jsonResponse({ err: "Состояние изменилось, повторяю…", retry: true }, 409);
      if (charged.error) return jsonResponse({ err: charged.error.message }, 500);

      const { error: pErr } = await admin.from("alliance_rally_parts")
        .insert({ rally_id: rallyId, player_id: meRow.id, units: send });
      if (pErr) { await returnUnits(admin, meRow.id, send); return jsonResponse({ err: pErr.message }, 500); }
      await admin.from("alliance_chat").insert({
        alliance_id: rally.alliance_id, player_id: null, nick: "", kind: "system",
        body: (meRow.nick || "Безымянный лорд") + " ведёт " + total + " воинов в сбор на «" + rally.target_name + "».",
      });
      return jsonResponse({ ok: true, sent: total, room: room - total });
    }

    // -----------------------------------------------------------------------
    // withdraw — забрать свои войска обратно (до выступления)
    // -----------------------------------------------------------------------
    if (op === "withdraw") {
      if (rally.leader_id === meRow.id)
        return jsonResponse({ err: "Созывающий не выходит из своего сбора — его можно только распустить" }, 400);
      const { data: part } = await admin.from("alliance_rally_parts")
        .select("units").eq("rally_id", rallyId).eq("player_id", meRow.id).maybeSingle();
      if (!part) return jsonResponse({ err: "Вас нет в этом сборе" }, 400);
      await admin.from("alliance_rally_parts").delete().eq("rally_id", rallyId).eq("player_id", meRow.id);
      // Войска возвращаются СРАЗУ: до выступления они стоят в замке
      // созывающего, идти им неоткуда.
      await returnUnits(admin, meRow.id, part.units);
      return jsonResponse({ ok: true, withdrawn: true });
    }

    // -----------------------------------------------------------------------
    // cancel — распустить сбор (только созывающий)
    // -----------------------------------------------------------------------
    if (op === "cancel") {
      if (rally.leader_id !== meRow.id)
        return jsonResponse({ err: "Распустить сбор может только созвавший" }, 403);
      const { data: parts } = await admin.from("alliance_rally_parts")
        .select("player_id, units").eq("rally_id", rallyId);
      for (const p of parts || []) await returnUnits(admin, p.player_id, p.units);
      await admin.from("alliance_rally_parts").delete().eq("rally_id", rallyId);
      await admin.from("alliance_rallies").update({ state: "done" }).eq("id", rallyId);
      // Полководец созывающего возвращается домой.
      if (rally.has_gen) {
        const { data: lead } = await admin.from("players").select("state").eq("id", rally.leader_id).maybeSingle();
        if (lead && lead.state && lead.state.gen) {
          lead.state.gen.away = null;
          await admin.from("players").update({ state: lead.state }).eq("id", rally.leader_id);
        }
      }
      await admin.from("alliance_chat").insert({
        alliance_id: rally.alliance_id, player_id: null, nick: "", kind: "system",
        body: "Сбор на «" + rally.target_name + "» распущен. Войска вернулись по замкам.",
      });
      return jsonResponse({ ok: true, cancelled: true });
    }

    return jsonResponse({ err: "Неизвестное действие сбора" }, 400);
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
