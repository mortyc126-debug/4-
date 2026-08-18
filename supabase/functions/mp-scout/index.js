// =============================================================================
// mp-scout — Фаза 4, восьмой кусочек: разведка чужого города. До сих пор
// здание «Разведка» (`p.b.scout`) уже строилось и считалось в мощь (Фаза 5,
// четвёртый кусочек), но сама механика разведки не существовала — нападать
// приходилось вслепую, не зная даже, есть ли у цели вообще войска. Зеркало
// sendScout(p,tx,ty)/EV.scouted из index.html:4704-4730/4877-4893 — тот же
// лазутчик, что и в одиночной игре: не занимает слот похода (свой отдельный
// лимит SCOUT_TABLE.scouts, 1 на уровнях 1-4, 2 на 5-10, 3 на 11+ — как в
// клиенте), бежит быстрее армии (SCOUT_SPEED_MULT=2.2, плюс SCOUT_TABLE.bonus
// от прокачки самого здания), без войск с собой, без боя, без обратной
// дороги — снимает показания на месте и тут же гасит марш.
//
// Честные упрощения, в дополнение к общим для всех маршей (index.html:
// waterPath -> прямая, bonuses(p).march=1):
// 1. Цель — игрок по id (defender_id), а не клетка (tx,ty) — то же самое
//    упрощение, что и у mp-attack, по той же причине (map_cells не
//    сгенерированы в общем мире).
// 2. Глубина донесения (scoutSnapshot, index.html:5237-5282) зависит от
//    технологии "Маскировка" (p.tech.mil_scout2) — ЦЕЛОГО дерева
//    исследований, которое на сервер ещё не перенесено вообще (Фаза 5,
//    самая большая оставшаяся задача). Честная заглушка — se=0 всегда,
//    то есть донесение несёт РОВНО то, что даёт se=0 в реальной формуле:
//    только общее число войск цели (без разбивки по родам/тирам, без
//    запасов, без стены, без полководца, без академии/гарнизона/талантов/
//    снаряжения — все они появляются лишь с se>=1). Это не "притворная"
//    урезанная версия — это ТА ЖЕ формула на минимальном тире, какой она
//    была бы у игрока без единого очка в "Маскировку".
// 3. `power(q)` (общая мощь цели, index.html) не перенесена (зависит от
//    построек/войск/академии/генерала/снаряжения разом) — вместо неё в
//    донесении просто уровень ратуши цели, как самостоятельный, честный
//    показатель силы, который уже есть на сервере.
//
// Тело запроса: { defender_id: number }
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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
// index.html:1376 SCOUT_TABLE — bonus (надбавка к скорости лазутчика от
// уровня здания) и scouts (сколько лазутчиков разом можно держать в пути).
const SCOUT_TABLE = [
  { bonus: 5, scouts: 1 }, { bonus: 10, scouts: 1 }, { bonus: 15, scouts: 1 }, { bonus: 20, scouts: 1 },
  { bonus: 25, scouts: 2 }, { bonus: 30, scouts: 2 }, { bonus: 35, scouts: 2 }, { bonus: 40, scouts: 2 },
  { bonus: 45, scouts: 2 }, { bonus: 50, scouts: 2 }, { bonus: 60, scouts: 3 }, { bonus: 70, scouts: 3 },
  { bonus: 80, scouts: 3 }, { bonus: 90, scouts: 3 }, { bonus: 90, scouts: 3 }, { bonus: 100, scouts: 3 },
  { bonus: 100, scouts: 3 }, { bonus: 110, scouts: 3 }, { bonus: 110, scouts: 3 }, { bonus: 115, scouts: 3 },
  { bonus: 115, scouts: 3 }, { bonus: 120, scouts: 3 }, { bonus: 120, scouts: 3 }, { bonus: 120, scouts: 3 },
  { bonus: 125, scouts: 3 },
];
// index.html:4696 SCOUT_SPEED_MULT — налегке и без обоза, заметно быстрее
// войска независимо от уровня здания; MARCH_SPEED_SCALE — общий масштаб
// всех маршей (см. mp-attack).
const SCOUT_SPEED_MULT = 2.2;
const MARCH_SPEED_SCALE = 32;

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
    if (!Number.isFinite(defenderId)) return jsonResponse({ err: "Не указана цель" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: attRow, error: aErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (aErr) return jsonResponse({ err: aErr.message }, 500);
    if (!attRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);
    if (defenderId === attRow.id) return jsonResponse({ err: "Это ваш город" }, 400);

    const { data: defRow, error: dErr } = await admin
      .from("players").select("id,x,y").eq("world_id", world.id).eq("id", defenderId).maybeSingle();
    if (dErr) return jsonResponse({ err: dErr.message }, 500);
    if (!defRow) return jsonResponse({ err: "Цель не найдена" }, 400);

    const attP = attRow.state;
    // Дословно sendScout(p,tx,ty) из index.html:4704-4730.
    const scoutLv = Array.isArray(attP.b.scout) ? Math.max(0, ...attP.b.scout) : (attP.b.scout || 0);
    if (scoutLv <= 0) return jsonResponse({ err: "Нужна разведка" }, 400);

    const { data: dupes, error: dupErr } = await admin
      .from("marches").select("id")
      .eq("world_id", world.id).eq("player_id", attRow.id).eq("mode", "scout")
      .eq("data->>defender_id", String(defRow.id));
    if (dupErr) return jsonResponse({ err: dupErr.message }, 500);
    if (dupes && dupes.length) return jsonResponse({ err: "Лазутчик уже в пути" }, 400);

    const { count: outNow, error: outErr } = await admin
      .from("marches").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).eq("player_id", attRow.id).eq("mode", "scout");
    if (outErr) return jsonResponse({ err: outErr.message }, 500);
    const maxScouts = tblRow(SCOUT_TABLE, scoutLv).scouts;
    if ((outNow || 0) >= maxScouts) return jsonResponse({ err: "Все лазутчики уже в пути (" + maxScouts + ")" }, 400);

    const nowSec = Date.now() / 1000;
    const dist = Math.hypot(defRow.x - attRow.x, defRow.y - attRow.y);
    // marchSpeed(p,emptyUnits()) в клиенте — без единого юниата всегда
    // падает на запасной случай s=1 (MARCH_SPEED_SCALE*bonuses(p).march,
    // тот же =1-заглушка везде), лазутчик налегке без расовых модификаторов
    // скорости конкретных родов войск.
    const speedMult = SCOUT_SPEED_MULT * (1 + tblRow(SCOUT_TABLE, scoutLv).bonus / 100);
    const baseSpeed = MARCH_SPEED_SCALE; // marchSpeed(emptyUnits) = 1 * 32 * march(=1)
    const travel = Math.max(15, (dist / (baseSpeed * speedMult)) * 60);

    const { data: march, error: mErr } = await admin.from("marches").insert({
      world_id: world.id, player_id: attRow.id, mode: "scout", state: "go",
      tx: defRow.x, ty: defRow.y, t0: nowSec, t1: nowSec + travel,
      units: { inf: {}, arc: {}, cav: {}, sie: {} }, data: { defender_id: defRow.id },
    }).select().single();
    if (mErr) return jsonResponse({ err: mErr.message }, 500);

    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
      type: "scout_arrive", data: { march_id: march.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, march_id: march.id, eta: travel });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
