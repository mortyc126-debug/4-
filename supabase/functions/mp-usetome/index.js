// =============================================================================
// mp-usetome — потратить книгу опыта на прокачку генерала. Зеркало клиента
// index.html:7943-7950 ("usetome"): списывает 1 книгу номинала v из
// p.tomes, вызывает addXp(p,v). Мгновенное действие без очереди/события —
// тот же паттерн, что и mp-upgrade/mp-talent/mp-pickgen.
//
// Книги теперь реально появляются в p.tomes — mp-tick начисляет их с Фазы 8
// (кусочек 2) разгрома лагерей разбойников, тем же коммитом, что и эта
// функция (index.html:5074-5077 bookDrop, ранее честно не переносился, см.
// заголовок banditLoot/bookDrop в mp-tick).
//
// Тело запроса: { v: 100|500|1000|5000|10000|20000 }
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

const TOME_VALUES = [20000, 10000, 5000, 1000, 500, 100];
// index.html:2848-2849/5136-5147 — тот же GEN_XP_NEED/genXpNeed/addXp, что
// и в mp-tick (Фаза 10, кусочек 1), дословная копия (самодостаточный файл,
// см. заголовок mp-upgrade про Dashboard-редактор).
const GEN_XP_NEED = [210,210,276,483,846,1482,2594,4541,7950,7950,7950,7950,8449,10471,12978,16084,19935,24707,30621,30621,33942,40093,47360,55943,66083,78060,92207,108919,128659,128659,142186,163193,187303,214974,246734,283186,323079,370524,424937,424937,478776,540017,609091,687001,774876,873992,985786,1111879,1254102,1660595,1909956,2196763,2526638,2906048,3921926,4612964,5425762,6381774,7506234];
const genXpNeed = (lv) => GEN_XP_NEED[lv - 1] || GEN_XP_NEED[GEN_XP_NEED.length - 1];
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
function addXp(p, xp) {
  if (!p.gen) p.gen = { lv: 1, xp: 0, pts: 5, tal: {}, id: null };
  p.gen.xp = (p.gen.xp || 0) + xp;
  const cap = Math.min(60, epochOf(p.b && p.b.hall) * 12);
  while (p.gen.xp >= genXpNeed(p.gen.lv) && p.gen.lv < cap) {
    p.gen.xp -= genXpNeed(p.gen.lv);
    p.gen.lv++; p.gen.pts = (p.gen.pts || 0) + 1;
  }
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
    const v = Number(body.v);
    if (!TOME_VALUES.includes(v)) return jsonResponse({ err: "Неизвестный номинал книги" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    p.race = p.race || row.race;
    if (!p.tomes) p.tomes = {};
    if (!p.gen) p.gen = { lv: 1, xp: 0, pts: 5, tal: {}, id: null };

    // Дословно клиентский "usetome" из index.html:7943-7950.
    const lvCap = Math.min(60, epochOf(p.b && p.b.hall) * 12);
    if ((p.tomes[v] || 0) <= 0) return jsonResponse({ err: "Нет такой книги" }, 400);
    if (!(p.gen.lv < lvCap)) return jsonResponse({ err: "Генерал уже на максимуме для текущей эпохи" }, 400);
    p.tomes[v]--;
    addXp(p, v);

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, v, lv: p.gen.lv, xp: p.gen.xp, pts: p.gen.pts });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
