// =============================================================================
// mp-attack — Фаза 4, второй кусочек: отправляет марш с настоящим временем
// в пути (было: мгновенный бой, см. историю коммитов). Зеркало sendMarch
// из index.html:4646 — считает то же расстояние/скорость, списывает
// отправленные войска из домашнего гарнизона сразу (как и в клиенте),
// заводит строку в marches и событие "march_arrive" в events, которое
// разберёт mp-tick, когда войско дойдёт (тот же тикер, что уже разбирает
// набор/постройки, см. supabase/README.md, Фаза 2). Сам бой (resolvePvp) и
// обратная дорога — там же, в mp-tick, см. подробный разбор ограничений
// боевой модели в _shared/rules.js ("PvP-бой" — не resolveBattle()).
//
// Честное упрощение: расстояние по прямой (Math.hypot), а не waterPath() —
// клетки местности (map_cells) в общем мире ещё не сгенерированы, обходить
// пока нечего.
//
// Тело запроса: { defender_id: number, units: {inf:{1:n,...},arc:{...},
//                  cav:{...},sie:{...}} }
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

const TKEYS = ["inf", "arc", "cav", "sie"];
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } }; // index.html RACE_TROOP_MOD — только нежить меняет скорость (осада)
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
const marchSlots = (hall) => (hall >= 22 ? 5 : hall >= 17 ? 4 : hall >= 11 ? 3 : hall >= 5 ? 2 : 1);
function marchSpeed(units, race) {
  let s = 99;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      if ((units[t] && units[t][i]) > 0) s = Math.min(s, TROOP_SPEED[t] * troopSpeedMod(race, t));
    }
  });
  if (s > 90) s = 1;
  return s * MARCH_SPEED_SCALE; // bonuses(p).march временно = 1, та же заглушка, что и везде
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
    const defenderId = Number(body.defender_id);
    const reqUnits = body.units && typeof body.units === "object" ? body.units : {};
    if (!Number.isFinite(defenderId)) return jsonResponse({ err: "Не указан защитник" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: attRow, error: aErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (aErr) return jsonResponse({ err: aErr.message }, 500);
    if (!attRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);
    if (defenderId === attRow.id) return jsonResponse({ err: "Нельзя атаковать самого себя" }, 400);

    const { data: defRow, error: dErr } = await admin
      .from("players").select("id,x,y,shield_until").eq("world_id", world.id).eq("id", defenderId).maybeSingle();
    if (dErr) return jsonResponse({ err: dErr.message }, 500);
    if (!defRow) return jsonResponse({ err: "Защитник не найден" }, 400);
    const nowSec = Date.now() / 1000;
    if (defRow.shield_until > nowSec) return jsonResponse({ err: "Город под щитом мира — атака невозможна" }, 400);

    const attP = attRow.state;

    // Лимит отрядов в поле — marchSlots(hall), считаем текущие незавершённые
    // марши игрока (mode:"attack") в таблице marches.
    const hallLv = Array.isArray(attP.b.hall) ? Math.max(0, ...attP.b.hall) : attP.b.hall;
    const { count: busy, error: busyErr } = await admin
      .from("marches").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).eq("player_id", attRow.id).eq("mode", "attack");
    if (busyErr) return jsonResponse({ err: busyErr.message }, 500);
    if ((busy || 0) >= marchSlots(hallLv)) return jsonResponse({ err: "Все отряды заняты" }, 400);

    // Собираем и проверяем отправляемую часть гарнизона: не больше, чем
    // реально есть дома, и хотя бы один боец.
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

    // Дословно sendMarch из index.html:4646-4681 (без waterPath/portalShortcut
    // /generала/предупреждения защитника — см. заголовок файла и README).
    const dist = Math.hypot(defRow.x - attRow.x, defRow.y - attRow.y);
    const spd = marchSpeed(sendUnits, attP.race);
    const travel = Math.max(20, (dist / spd) * 60);

    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) attP.troops[t][i] = Math.max(0, (attP.troops[t][i] || 0) - sendUnits[t][i]);
    });
    const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
    if (updA) return jsonResponse({ err: updA.message }, 500);

    const { data: march, error: mErr } = await admin.from("marches").insert({
      world_id: world.id, player_id: attRow.id, mode: "attack", state: "go",
      tx: defRow.x, ty: defRow.y, t0: nowSec, t1: nowSec + travel,
      units: sendUnits, data: { defender_id: defRow.id, dist, spd },
    }).select().single();
    if (mErr) return jsonResponse({ err: mErr.message }, 500);

    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
      type: "march_arrive", data: { march_id: march.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, march_id: march.id, eta: travel });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
