// =============================================================================
// mp-recall — Фаза 4, девятый кусочек: отзыв похода на полпути. Зеркало
// recallMarch(m) из index.html:4770-4780 — до сих пор поход, однажды
// отправленный (mp-attack), нельзя было ни отменить, ни развернуть раньше
// срока: оставалось либо ждать боя, либо просто закрыть вкладку. Теперь
// поход в пути (mode:"attack", state:"go") можно отозвать — отряд
// разворачивается ОТ ТЕКУЩЕЙ ТОЧКИ на маршруте (не от цели и не мгновенно
// из дома), считая новую дорогу домой от неё же, той же формулой скорости,
// что и исходный марш.
//
// Честное упрощение, продолжающее то же, что и в mp-attack: путь по прямой
// (Math.hypot), не waterPath() — клетки местности (map_cells) в общем
// мире не сгенерированы. Текущая точка на маршруте — линейная интерполяция
// между домом отправителя и целью по доле пройденного времени
// (marchPos(m) в клиенте делает то же самое покадрово вдоль настоящего
// path[], здесь то же самое, просто по прямой).
//
// Поход, уже возвращающийся (state:"back"), отзывать нечего — в клиенте
// recallMarch(m) тут просто молча выходит (if(m.state==="back") return),
// но там это фоновый вызов без ответа пользователю; здесь это прямое
// действие по кнопке — честнее вернуть ошибку, чтобы кнопка не выглядела
// нерабочей.
//
// Тело запроса: { march_id: number }
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

const TKEYS = ["inf", "arc", "cav", "sie"];
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } }; // index.html RACE_TROOP_MOD — только нежить меняет скорость (осада)
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
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
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
    const marchId = Number(body.march_id);
    if (!Number.isFinite(marchId)) return jsonResponse({ err: "Не указан поход" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: attRow, error: aErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (aErr) return jsonResponse({ err: aErr.message }, 500);
    if (!attRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const { data: m, error: mErr } = await admin
      .from("marches").select("*").eq("id", marchId).eq("player_id", attRow.id).maybeSingle();
    if (mErr) return jsonResponse({ err: mErr.message }, 500);
    if (!m) return jsonResponse({ err: "Поход не найден" }, 400);
    if (m.mode !== "attack") return jsonResponse({ err: "Отозвать можно только военный поход" }, 400);
    if (m.state !== "go") return jsonResponse({ err: "Отряд уже возвращается" }, 400);

    const nowSec = Date.now() / 1000;
    // Дословно marchPos(m)/recallMarch(m) из index.html:4770-4784, по
    // прямой вместо настоящего path[] (см. заголовок файла).
    const f = clamp((nowSec - m.t0) / Math.max(1, m.t1 - m.t0), 0, 1);
    const curX = attRow.x + (m.tx - attRow.x) * f;
    const curY = attRow.y + (m.ty - attRow.y) * f;
    const dist = Math.hypot(attRow.x - curX, attRow.y - curY);
    const spd = marchSpeed(m.units, attRow.race);
    const travel = Math.max(15, (dist / spd) * 60);

    const { error: updM } = await admin.from("marches")
      .update({ state: "back", t0: nowSec, t1: nowSec + travel }).eq("id", m.id);
    if (updM) return jsonResponse({ err: updM.message }, 500);

    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
      type: "march_home", data: { march_id: m.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: travel });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
