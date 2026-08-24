// =============================================================================
// mp-equip — Фаза 11, кусочек 4: надеть скованное снаряжение. Зеркало
// equipItem(p,slot,order,rarity) (index.html:5895-5903) — мгновенное
// действие без очереди/события, тот же паттерн, что и mp-upgrade
// (перекладка между складом p.inventory и надетым p.gear[slot], не работа
// станка). Снятие — mp-unequip, разбор — mp-dismantle, тем же кусочком.
//
// Это последний шаг, после которого gearBonus(p) (index.html:2255-2263)
// наконец не всегда ноль — mp-tick подключает её в genStats() тем же
// коммитом (честный пробел, открыто помеченный ещё в Фазе 9, кусочек 4).
//
// Тело запроса: { slot: string, order: "bastion"|"storm", rarity: 1..5 }
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

const GEAR_SLOT_IDS = ["helmet", "chest", "gloves", "pants", "boots", "handL", "handR", "acc1", "acc2"];
const ORDERS = ["bastion", "storm"];

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
    const order = String(body.order || "");
    const rarity = Number(body.rarity);
    if (!GEAR_SLOT_IDS.includes(slot)) return jsonResponse({ err: "Неизвестный слот" }, 400);
    if (!ORDERS.includes(order)) return jsonResponse({ err: "Неизвестная школа ковки" }, 400);
    if (!Number.isInteger(rarity) || rarity < 1 || rarity > 5) return jsonResponse({ err: "Неверная редкость" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    if (!p.inventory) p.inventory = {};
    if (!p.inventory[slot]) p.inventory[slot] = {};
    if (!p.inventory[slot][order]) p.inventory[slot][order] = [0, 0, 0, 0, 0];
    if (!p.gear) p.gear = {};

    // Дословно equipItem(p,slot,order,rarity) из index.html:5895-5903.
    const inv = p.inventory[slot][order];
    if ((inv[rarity - 1] || 0) < 1) return jsonResponse({ err: "Такого предмета нет на складе" }, 400);
    const cur = p.gear[slot];
    inv[rarity - 1]--;
    if (cur) {
      if (!p.inventory[slot][cur.order]) p.inventory[slot][cur.order] = [0, 0, 0, 0, 0];
      p.inventory[slot][cur.order][cur.rarity - 1] = (p.inventory[slot][cur.order][cur.rarity - 1] || 0) + 1;
    }
    p.gear[slot] = { order, rarity };

    const saved = await savePlayerState(admin, row, p);
    if (saved.conflict) return conflictResponse();          // см. savePlayerState
    if (saved.error) return jsonResponse({ err: saved.error.message }, 500);

    return jsonResponse({ ok: true, slot, order, rarity, replaced: cur || null });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
