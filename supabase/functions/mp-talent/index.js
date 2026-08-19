// =============================================================================
// mp-talent — Фаза 10, кусочек 2: трата одного очка таланта генерала.
// Зеркало действия "tal" (index.html:7934-7937): один клик = один узел =
// одно вложенное очко, до потолка узла, пока хватает p.gen.pts (который
// наконец по-настоящему растёт — см. Фаза 10, кусочек 1). Мгновенное
// действие, без марша/события — тот же паттерн, что и mp-pickgen.
//
// Честный пробел: САМ ЭФФЕКТ уже вложенных очков (TALENTS w1-w5/d1-d5/
// g1-g5 и GENERAL_TREE gt_c*/gt_a*, применяемые в bonuses(), index.html:
// 3760-3787) сюда не входит — во всех mp-* копиях bonuses() по-прежнему
// читают p.gen.tal, которое отсюда начнёт заполняться, но сами формулы,
// добавляющие вклад в b.atk/b.def/... по этим полям, ещё не перенесены.
// Игрок может вложить очки, но они пока ничего не меняют — отдельный
// следующий кусочек, см. supabase/README.md.
//
// Тело запроса: { id: string } — id узла (например "w1", "gt_a3").
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

// index.html:2348-2395 TALENTS/GENERAL_TREE — дословно (без n.field/n.per/
// n.kind/n.txt — та часть нужна только bonuses(), не этому эндпоинту,
// которому важны лишь id/max для проверки потолка узла). TALENTS-узлы без
// явного max по умолчанию считаются max:5 — тот же приём, что
// findTalentNode/(node&&node.max)||5 в index.html:7935.
const TALENT_NODE_IDS = {
  war: ["w1", "w2", "w3", "w4", "w5"],
  dev: ["d1", "d2", "d3", "d4", "d5"],
  gath: ["g1", "g2", "g3", "g4", "g5"],
};
const GENERAL_TREE_MAX = {
  gt_c1: 5, gt_c2: 5, gt_c3: 5, gt_c4: 5, gt_c5: 5,
  gt_a1: 10, gt_a2: 10, gt_a3: 10, gt_a4: 10, gt_a5: 10, gt_a6: 10, gt_a7: 5, gt_a8: 5, gt_a9: 5, gt_a10: 5,
};
function findTalentMax(id) {
  for (const branch in TALENT_NODE_IDS) if (TALENT_NODE_IDS[branch].includes(id)) return 5;
  if (GENERAL_TREE_MAX[id] !== undefined) return GENERAL_TREE_MAX[id];
  return null; // неизвестный id — не узел ни одного из двух деревьев
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
    const id = typeof body.id === "string" ? body.id : null;
    const max = id ? findTalentMax(id) : null;
    if (!id || max == null) return jsonResponse({ err: "Неизвестный узел таланта" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    if (!p.gen) p.gen = { lv: 1, xp: 0, pts: 0, tal: {}, id: null, away: null };
    if (!p.gen.tal) p.gen.tal = {};
    // У самого index.html вложение талантов доступно только после выбора
    // полководца (foGen() до этого показывает лишь "Выбор полководца") —
    // клиент сам не даёт нажать кнопку раньше времени, но сервер должен
    // проверить явно (тот же принцип, что "требуется Академия" в
    // mp-research — у сервера нет страховки со стороны UI).
    if (p.gen.id == null) return jsonResponse({ err: "Сначала выберите полководца" }, 400);
    if (!(p.gen.pts > 0)) return jsonResponse({ err: "Нет свободных очков таланта" }, 400);
    const cur = p.gen.tal[id] || 0;
    if (cur >= max) return jsonResponse({ err: "Узел уже прокачан до предела" }, 400);

    p.gen.tal[id] = cur + 1;
    p.gen.pts -= 1;

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, id, lv: p.gen.tal[id], pts: p.gen.pts });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
