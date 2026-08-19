// =============================================================================
// mp-upgrade — Фаза 11, кусочек 2: слияние материалов в более редкое
// качество. Зеркало upgradeMaterial(p,mat,tier) (index.html:5874-5877,
// действие "matup" на клиенте, index.html:7914) — 4 штуки материала
// текущего качества (tier 0..3, "Обычная".."Эпическая") превращаются в
// 1 штуку следующего (tier+1, вплоть до "Легендарная" = индекс 4).
// Мгновенное действие, без очереди/события — тот же паттерн, что и
// mp-talent/mp-pickgen (никакого p.craft тут не задействовано: слияние —
// не работа станка, чистая перекладка уже добытого).
//
// Честное добавление к источнику: upgradeMaterial() сама по себе не
// проверяет p.b.forge>0 (весь экран, где кнопка слияния показывается,
// открывается только из уже построенного здания Горн) — сервер здесь
// проверяет явно, тот же принцип, что и в mp-forge/mp-research.
//
// Тело запроса: { mat: "ore"|"leather"|"bone"|"ebony", tier: 0|1|2|3 }
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

const MATERIAL_IDS = ["ore", "leather", "bone", "ebony"];

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
    const mat = String(body.mat || "");
    const tier = Number(body.tier);
    if (!MATERIAL_IDS.includes(mat)) return jsonResponse({ err: "Неизвестный материал" }, 400);
    if (!Number.isInteger(tier) || tier < 0 || tier > 3) return jsonResponse({ err: "Неверное качество" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    if (!p.materials) p.materials = { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] };
    if (!p.materials[mat]) p.materials[mat] = [0, 0, 0, 0, 0];

    // Явная страховка со стороны сервера (см. заголовок файла).
    if (!(p.b && p.b.forge > 0)) return jsonResponse({ err: "Нужен построенный Горн" }, 400);

    // Дословно upgradeMaterial(p,mat,tier) из index.html:5874-5877.
    if ((p.materials[mat][tier] || 0) < 4) return jsonResponse({ err: "Нужно 4 штуки этого качества" }, 400);
    p.materials[mat][tier] -= 4;
    p.materials[mat][tier + 1] = (p.materials[mat][tier + 1] || 0) + 1;

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, mat, tier: tier + 1, have: p.materials[mat][tier + 1] });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
