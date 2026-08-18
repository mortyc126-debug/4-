// =============================================================================
// mp-pickgen — Фаза 7: выбор полководца. Зеркало экрана "Выбор полководца"
// (foGen(), index.html:7414-7426) и его клика-обработчика (index.html:
// 7951-7953): один раз за игру, бесплатно, необратимо — игрок выбирает
// одного из ДВУХ генералов своей расы (p.gen.id: 0 или 1). До этого момента
// bonuses() (Фаза 6) везде честно применял GENERALS[p.race][(p.gen&&p.gen.id)
// ||0] — то есть индекс 0 по умолчанию, ровно как в клиенте до выбора
// (p.gen.id==null). Этот эндпоинт впервые даёт p.gen.id стать НЕ нулевым.
//
// Тело запроса: { id: 0|1 }
//
// Что перенесено дословно: сам факт выбора (одноразовый, без цены, без
// отмены) и полный список из ВОСЬМИ генералов (обе записи на расу, apply()),
// index.html:2283-2344 — то же самое, что уже лежит в bonuses() остальных
// mp-* функций (Фаза 6, продолжение).
//
// Что НЕ перенесено, и почему это честный пробел, а не недосмотр: система
// уровней/опыта генерала (p.gen.lv/xp), очки таланта (p.gen.pts/tal) и трата
// их на дерево генерала (GENERAL_TREE, index.html:3780-3787) — в общем мире
// нет источника опыта генерала (никакой mp-* функция не начисляет p.gen.xp),
// поэтому p.gen.lv/pts/tal остаются такими же, какими их создаёт mp-join
// (lv:1, xp:0, pts:5, tal:{}) — 5 неистраченных очков честно висят
// неиспользованными, как и раньше, вместо фиктивного круга "потратьте на
// что-то, чего сервер не считает".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — см. пояснение в других mp-*
// функциях (Dashboard-редактор не подтягивает относительные импорты).
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

// index.html:2283-2344 GENERALS — оба генерала на расу. name — для ответа
// клиенту (эхо выбора), apply() здесь не нужен (сам бонус читает bonuses()
// в остальных mp-* функциях по p.gen.id, который этот эндпоинт только
// устанавливает) — но оставлен рядом для честности данных (та же таблица,
// что и везде, а не урезанная копия).
const GENERALS = {
  human: [
    { name: "Король Алдрик", apply: (b) => { b.atk += .15; b.def += .08; } },
    { name: "Королева Астрид", apply: (b) => { b.prodGold += .15; b.prodAll += .05; } },
  ],
  dwarf: [
    { name: "Дорвальд Каменный Трон", apply: (b) => { b.def += .08; b.wallBonus += .08; } },
    { name: "Гимрод Быстрая Секира", apply: (b) => { b.march += .10; b.wallBonus = 0; } },
  ],
  elf: [
    { name: "Ильвен Хрустальный Щит", apply: (b) => { b.def += .10; b.archer = 0; } },
    { name: "Тариэль Вечная", apply: (b) => { b.archer += .15; b.march += .05; } },
  ],
  undead: [
    { name: "Владислав фон Морвейн", apply: (b) => { b.def += .10; b.healSpeed = 1; } },
    { name: "Кармилла", apply: (b) => { b.raise += .15; b.mercy += .05; } },
  ],
};

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
    const id = Math.round(Number(body.id));
    if (id !== 0 && id !== 1) return jsonResponse({ err: "Неверный выбор полководца" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    // Самоисцеление легаси-записей, тот же приём, что и в остальных mp-*
    // (race дублируется в state с Фазы 6, но у старых записей его там нет).
    p.race = p.race || row.race;
    if (!GENERALS[p.race]) return jsonResponse({ err: "Неизвестная раса" }, 500);
    // Дословно foGen()/клик-обработчик (index.html:7951-7953):
    // if(p.gen.id==null){ p.gen.id=+b.dataset.id; ... } — выбор одноразовый.
    if (!p.gen) p.gen = { lv: 1, xp: 0, pts: 5, tal: {}, id: null, away: null }; // на случай совсем старой записи без .gen вовсе
    if (p.gen.id != null) return jsonResponse({ err: "Полководец уже выбран" }, 400);
    p.gen.id = id;

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    return jsonResponse({ ok: true, gen: { id, name: GENERALS[p.race][id].name } });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
