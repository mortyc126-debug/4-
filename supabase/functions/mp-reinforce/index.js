// =============================================================================
// mp-reinforce — Фаза 56: подкрепления в крепость союза.
// =============================================================================
// Таблица — supabase/migrations/0017_fort_garrison.sql, там же разобрано,
// почему гарнизон лежит по строке на пару (крепость, игрок).
//
// Две операции, и обе про одно и то же войско, поэтому одним файлом (тот же
// довод, что и у mp-alliance/mp-rally — деплой руками через дашборд):
//   send   {x, y, units} — отправить отряд в крепость своего союза
//   recall {x, y}        — забрать свой отряд домой
// Ответ: { ok:true, ... } либо { err }.
//
// Отправка — ОБЫЧНЫЙ МАРШ (mode:"reinf"), а не мгновенное зачисление: до
// крепости надо дойти, и по дороге отряд можно перехватить ровно так же, как
// любой другой. В гарнизон он ложится уже на прибытии (applyReinfArrive в
// mp-tick). Возврат — такой же марш обратно, только state:'back'.
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
// Вместимость крепости — 2 000 000 на всех и неизменна (прямое условие
// автора: «сразу по дефолту такая и по идее неизменная»). Со зданием Центра
// Альянса не связана вовсе: то задаёт вместимость ПОДКРЕПЛЕНИЙ В ГОРОД и
// общего сбора, а не крепости.
const ALLY_FORT_CAP = 2000000;

// Скорость похода — копии из mp-raid (правило самодостаточных функций).
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } };
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
const marchSlots = (hall) => (hall >= 22 ? 5 : hall >= 17 ? 4 : hall >= 11 ? 3 : hall >= 5 ? 2 : 1);
const RACES_MINUS_MARCH = { dwarf: 0.90 };
const RACE_EPOCH_MARCH = { elf: 2 };
const ACADEMY_MARCH_NODES = [
  { id: "mil_march1", total: 0.15, max: 5 },
  { id: "mil_march2", total: 0.15, max: 5 },
];
const portalMarchBonus = (lv) => (lv <= 0 ? 0 : lv <= 10 ? lv * 0.005 : 10 * 0.005 + (lv - 10) * 0.01);
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
function marchBonusOnly(p) {
  let march = 1;
  if (RACES_MINUS_MARCH[p.race]) march *= RACES_MINUS_MARCH[p.race];
  const epoch = epochOf(Array.isArray(p.b && p.b.hall) ? Math.max(0, ...p.b.hall) : (p.b && p.b.hall) || 0);
  if (RACE_EPOCH_MARCH[p.race] !== undefined && epoch > RACE_EPOCH_MARCH[p.race]) march *= 1.10;
  if (p.race === "dwarf" && ((p.gen && p.gen.id) || 0) === 1) march += 0.10;
  if (p.race === "elf" && ((p.gen && p.gen.id) || 0) === 1) march += 0.05;
  march *= 1 + portalMarchBonus((p.b && p.b.portal) || 0);
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
function unitsTotal(u) {
  let n = 0;
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) n += (u && u[t] && u[t][i]) || 0; });
  return n;
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

    const { data: myMem } = await admin.from("alliance_members")
      .select("alliance_id, role").eq("player_id", meRow.id).maybeSingle();
    if (!myMem) return jsonResponse({ err: "Крепости держат союзом — вступите в союз" }, 400);

    const x = Math.round(Number(body.x)), y = Math.round(Number(body.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return jsonResponse({ err: "Не указана крепость" }, 400);
    const { data: cell } = await admin.from("map_cells").select("*")
      .eq("world_id", world.id).eq("x", x).eq("y", y).maybeSingle();

    const meP = meRow.state;
    meP.race = meP.race || meRow.race;
    const hallLv = Array.isArray(meP.b.hall) ? Math.max(0, ...meP.b.hall) : meP.b.hall;

    // -----------------------------------------------------------------------
    // send — отправить отряд в крепость
    // -----------------------------------------------------------------------
    if (op === "send") {
      if (!cell || cell.t !== "regfort") return jsonResponse({ err: "Это не крепость" }, 400);
      const cd = cell.data || {};
      if (cd.state !== "ally") return jsonResponse({ err: "Крепость ещё не стоит" }, 400);
      // В чужую крепость подкрепления не ходят: гарнизон — это оборона своей
      // области, а не подарок соседу.
      if (cd.alliance_id !== myMem.alliance_id)
        return jsonResponse({ err: "Это крепость другого союза" }, 400);

      const req0 = body.units || {};
      const send = {}; let total = 0;
      TKEYS.forEach((t) => {
        send[t] = {};
        for (let i = 1; i <= 5; i++) {
          const want = Math.max(0, Math.round(Number((req0[t] && req0[t][i]) || 0)));
          const have = (meP.troops[t] && meP.troops[t][i]) || 0;
          const n = Math.min(want, have);
          send[t][i] = n; total += n;
        }
      });
      if (total <= 0) return jsonResponse({ err: "Отправьте хотя бы одного воина" }, 400);

      // Вместимость — на ВЕСЬ гарнизон, и считается вместе с теми отрядами,
      // что ещё в пути: иначе десять человек разом отправили бы по полному
      // потолку каждый, и на прибытии крепость приняла бы вдесятеро больше,
      // чем может.
      const [{ data: garr }, { data: onTheWay }] = await Promise.all([
        admin.from("alliance_fort_garrison").select("units")
          .eq("world_id", world.id).eq("x", x).eq("y", y),
        admin.from("marches").select("units")
          .eq("world_id", world.id).eq("mode", "reinf").eq("state", "go").eq("tx", x).eq("ty", y),
      ]);
      let inFort = 0;
      (garr || []).forEach((g) => { inFort += unitsTotal(g.units); });
      (onTheWay || []).forEach((mm) => { inFort += unitsTotal(mm.units); });
      const room = Math.max(0, ALLY_FORT_CAP - inFort);
      if (room <= 0) return jsonResponse({ err: "Крепость полна" }, 400);
      if (total > room) return jsonResponse({ err: "В крепости осталось места на " + room + " воинов" }, 400);

      const { count: busy } = await admin.from("marches").select("id", { count: "exact", head: true })
        .eq("world_id", world.id).eq("player_id", meRow.id).in("mode", ["attack", "gather", "raid", "reinf"]);
      const { data: rallyParts } = await admin.from("alliance_rally_parts")
        .select("rally_id, alliance_rallies!inner(state)")
        .eq("player_id", meRow.id).eq("alliance_rallies.state", "gather");
      if ((busy || 0) + ((rallyParts && rallyParts.length) || 0) >= marchSlots(hallLv))
        return jsonResponse({ err: "Все отряды заняты" }, 400);

      const dist = Math.hypot(x - meRow.x, y - meRow.y);
      const spd = marchSpeed(send, meP.race, marchBonusOnly(meP));
      const travel = Math.max(20, (dist / spd) * 60);
      const nowSec = Date.now() / 1000;

      TKEYS.forEach((t) => {
        for (let i = 1; i <= 5; i++) meP.troops[t][i] = Math.max(0, (meP.troops[t][i] || 0) - send[t][i]);
      });

      const { data: marchRow, error: mErr } = await admin.from("marches").insert({
        world_id: world.id, player_id: meRow.id, mode: "reinf", state: "go",
        tx: x, ty: y, t0: nowSec, t1: nowSec + travel, units: send,
        // Полководца в гарнизон не отправляют: он ведёт поход, а не сидит в
        // чужой крепости — и вернуть его оттуда было бы нечем, кроме отзыва
        // всего отряда.
        data: { dist, spd, has_gen: false, cell_x: x, cell_y: y, alliance_id: myMem.alliance_id },
      }).select().single();
      if (mErr) return jsonResponse({ err: mErr.message }, 500);

      const { data: evRow, error: evErr } = await admin.from("events").insert({
        world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
        type: "march_arrive", data: { march_id: marchRow.id },
      }).select("id").single();
      if (evErr) {
        await admin.from("marches").delete().eq("id", marchRow.id);
        return jsonResponse({ err: evErr.message }, 500);
      }

      const nextIso = new Date(Math.max(Date.now(), Date.parse(meRow.updated_at) + 1)).toISOString();
      const { data: saved, error: sErr } = await admin.from("players")
        .update({ state: meP, updated_at: nextIso })
        .eq("id", meRow.id).eq("updated_at", meRow.updated_at).select("id");
      if (sErr || !saved || !saved.length) {
        await admin.from("events").delete().eq("id", evRow.id);
        await admin.from("marches").delete().eq("id", marchRow.id);
        if (sErr) return jsonResponse({ err: sErr.message }, 500);
        return jsonResponse({ err: "Состояние изменилось, повторяю…", retry: true }, 409);
      }
      return jsonResponse({ ok: true, march_id: marchRow.id, eta: travel, room: room - total });
    }

    // -----------------------------------------------------------------------
    // recall — забрать свой отряд из крепости домой
    // -----------------------------------------------------------------------
    // Забрать можно ТОЛЬКО своё и только целиком: половину гарнизона делить
    // незачем, а чужое в крепости не трогают даже главы — люди отдали войска
    // на оборону, а не в распоряжение.
    if (op === "recall") {
      const { data: mine } = await admin.from("alliance_fort_garrison").select("*")
        .eq("world_id", world.id).eq("x", x).eq("y", y).eq("player_id", meRow.id).maybeSingle();
      if (!mine) return jsonResponse({ err: "В этой крепости у вас никого нет" }, 400);
      const units = mine.units || {};
      if (unitsTotal(units) <= 0) {
        await admin.from("alliance_fort_garrison").delete()
          .eq("world_id", world.id).eq("x", x).eq("y", y).eq("player_id", meRow.id);
        return jsonResponse({ ok: true, empty: true });
      }
      // Строку забираем ПЕРВОЙ и по её же наличию: два одновременных отзыва
      // иначе создали бы два марша с одними и теми же войсками.
      const { data: took, error: dErr } = await admin.from("alliance_fort_garrison").delete()
        .eq("world_id", world.id).eq("x", x).eq("y", y).eq("player_id", meRow.id).select("player_id");
      if (dErr) return jsonResponse({ err: dErr.message }, 500);
      if (!took || !took.length) return jsonResponse({ err: "Отряд уже отозван" }, 400);

      const dist = Math.hypot(x - meRow.x, y - meRow.y);
      const spd = marchSpeed(units, meP.race, marchBonusOnly(meP));
      const travel = Math.max(20, (dist / spd) * 60);
      const nowSec = Date.now() / 1000;
      const { data: back, error: bErr } = await admin.from("marches").insert({
        world_id: world.id, player_id: meRow.id, mode: "reinf", state: "back",
        tx: x, ty: y, t0: nowSec, t1: nowSec + travel, units,
        data: { dist, spd, has_gen: false, from: { x, y } },
      }).select("id").single();
      if (bErr) {
        // Марш не завёлся — возвращаем гарнизон на место, иначе войска
        // исчезли бы вовсе.
        await admin.from("alliance_fort_garrison").insert(mine);
        return jsonResponse({ err: bErr.message }, 500);
      }
      const { error: evErr } = await admin.from("events").insert({
        world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
        type: "march_home", data: { march_id: back.id },
      });
      if (evErr) {
        await admin.from("marches").delete().eq("id", back.id);
        await admin.from("alliance_fort_garrison").insert(mine);
        return jsonResponse({ err: evErr.message }, 500);
      }
      return jsonResponse({ ok: true, eta: travel });
    }

    return jsonResponse({ err: "Неизвестное действие подкрепления" }, 400);
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
