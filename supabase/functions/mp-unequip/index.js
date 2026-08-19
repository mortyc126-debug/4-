// =============================================================================
// mp-unequip — Фаза 11, кусочек 4: снять надетое снаряжение обратно на
// склад. Зеркало unequipItem(p,slot) (index.html:5904-5909) — мгновенное
// действие, тот же паттерн, что и mp-equip (см. его заголовок).
//
// Тело запроса: { slot: string }
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

const GEAR_SLOT_IDS = ["helmet", "chest", "gloves", "pants", "boots", "handL", "handR", "acc1", "acc2"];

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
    const slot = String(body.slot || "");
    if (!GEAR_SLOT_IDS.includes(slot)) return jsonResponse({ err: "Неизвестный слот" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    if (!p.gear) p.gear = {};
    if (!p.inventory) p.inventory = {};

    // Дословно unequipItem(p,slot) из index.html:5904-5909.
    const cur = p.gear[slot];
    if (!cur) return jsonResponse({ err: "Слот пуст" }, 400);
    if (!p.inventory[slot]) p.inventory[slot] = {};
    if (!p.inventory[slot][cur.order]) p.inventory[slot][cur.order] = [0, 0, 0, 0, 0];
    p.inventory[slot][cur.order][cur.rarity - 1] = (p.inventory[slot][cur.order][cur.rarity - 1] || 0) + 1;
    p.gear[slot] = null;

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, slot, returned: cur });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
