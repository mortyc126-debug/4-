// =============================================================================
// mp-relocate-building — Свободная застройка МП (Фаза 2 из 6, см. mp-build
// и его блок "Свободная застройка"). Переносит уже стоящее здание на новое
// свободное место внутри CITY_GRID — отдельная маленькая функция, а не
// ветка внутри mp-build, тем же принципом, что и mp-train/mp-retrain,
// mp-forge/mp-upgrade (одно действие — один файл). Никакой цены/времени —
// это ровно то, что просил автор ("можно перетаскивать, менять свободно
// архитектуру и т.д."), не постройка заново, а просто смена координат уже
// оплаченного здания. Не трогает p.b/p.queues/p.res/events вообще.
//
// Тело запроса: { bk: string (см. PLACEABLE_BKEYS), plot?: 0-3, gx, gy }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — та же причина, что и в
// остальных mp-* (Dashboard-редактор не подтягивает относительные импорты).
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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// =============================================================================
// Свободная застройка (index.html: CITY_GRID/BUILDINGS.*.footprint/
// collisionOk/PLACEABLE_BKEYS) — дословная копия, синхронно править вместе
// с тем же блоком в mp-build/index.js и mp-join/index.js (импортов между
// Edge Functions нет, см. заголовки остальных mp-*).
const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);
const CITY_GRID = {
  w: 16, h: 24,
  mask: [
    "0000000000000000", "0000001111000000", "0000111111110000", "0001111111111000",
    "0011111111111100", "0111111111111100", "0111111111111110", "0111111111111110",
    "0111111111111110", "1111111111111110", "1111111111111110", "1111111111111111",
    "1111111111111111", "1111111111111111", "1111111111111111", "1111111111111111",
    "1111111111111111", "0111111111111110", "0111111111111110", "0111111111111110",
    "0011111111111100", "0001111111111000", "0001111111111000", "0000000000000000",
  ],
};
const BUILD_FOOTPRINT = {
  farm: { w: 2, h: 2 }, lumber: { w: 2, h: 2 }, quarry: { w: 2, h: 2 }, mine: { w: 2, h: 2 },
  store: { w: 3, h: 2 }, barracks: { w: 3, h: 3 }, range: { w: 3, h: 3 }, stable: { w: 3, h: 3 },
  siege: { w: 3, h: 3 }, hospital: { w: 2, h: 2 }, academy: { w: 3, h: 3 },
  garrison: { w: 3, h: 2 }, scout: { w: 2, h: 2 }, forge: { w: 2, h: 2 }, portal: { w: 3, h: 3 },
  market: { w: 3, h: 3 }, alliance: { w: 3, h: 3 },
};
const PLACEABLE_BKEYS = Object.keys(BUILD_FOOTPRINT);
// Ратуша — фиксированное несдвигаемое здание (index.html:CITY_FIXED_GRID_POS.hall),
// не входит в layout вообще, поэтому цикл по layout ниже её не видит — без
// этой проверки перенос здания мог бы приземлить его прямо на Ратушу (тот
// же баг, нашёл автор — Горн встал внутрь Ратуши). Стену (gy:24) отдельно
// не проверяю — она физически вне сетки, пересечься с ней невозможно.
const HALL_RECT = { gx: 6, gy: 9, w: 4, h: 4 };
function collisionOk(layout, footprint, gx, gy, excludeIdx) {
  const { w, h } = footprint;
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return false;
  if (gx < 0 || gy < 0 || gx + w > CITY_GRID.w || gy + h > CITY_GRID.h) return false;
  for (let y = gy; y < gy + h; y++) {
    const row = CITY_GRID.mask[y];
    for (let x = gx; x < gx + w; x++) if (row[x] !== "1") return false;
  }
  if (gx < HALL_RECT.gx + HALL_RECT.w && gx + w > HALL_RECT.gx && gy < HALL_RECT.gy + HALL_RECT.h && gy + h > HALL_RECT.gy) return false;
  for (let i = 0; i < layout.length; i++) {
    if (i === excludeIdx) continue;
    const e = layout[i];
    const fp = BUILD_FOOTPRINT[e.b];
    if (!fp) continue;
    const ex2 = e.gx + fp.w, ey2 = e.gy + fp.h;
    if (gx < ex2 && gx + w > e.gx && gy < ey2 && gy + h > e.gy) return false;
  }
  return true;
}
function findFreeSpot(layout, fp) {
  for (let gy = 0; gy <= CITY_GRID.h - fp.h; gy++) {
    for (let gx = 0; gx <= CITY_GRID.w - fp.w; gx++) {
      if (collisionOk(layout, fp, gx, gy, -1)) return { gx, gy };
    }
  }
  return null;
}
// Та же самоисцеляющая достройка p.layout, что и в mp-join/mp-build — звана
// здесь тоже (та же степень паранойи: не полагаться на то, что mp-join уже
// точно успел отработать перед этим вызовом).
function ensureLayout(p) {
  if (!Array.isArray(p.layout)) p.layout = [];
  for (const bk of PLACEABLE_BKEYS) {
    const fp = BUILD_FOOTPRINT[bk];
    const raw = p.b[bk];
    const levels = BUILD_MULTI.has(bk) ? (Array.isArray(raw) ? raw : [raw || 0, 0, 0, 0]) : [raw || 0];
    levels.forEach((lv, idx) => {
      if (lv <= 0) return;
      const plotKey = BUILD_MULTI.has(bk) ? idx : null;
      if (p.layout.some((e) => e.b === bk && e.plot === plotKey)) return;
      const pos = findFreeSpot(p.layout, fp);
      if (pos) p.layout.push({ b: bk, plot: plotKey, gx: pos.gx, gy: pos.gy });
    });
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
    const bk = body.bk;
    if (!PLACEABLE_BKEYS.includes(bk))
      return jsonResponse({ err: "Это здание нельзя переносить" }, 400);
    const isMulti = BUILD_MULTI.has(bk);
    const plotKey = isMulti ? (Number.isInteger(body.plot) ? clamp(body.plot, 0, 3) : 0) : null;
    const gx = body.gx, gy = body.gy;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    if (!p.queues) p.queues = [null, null];
    ensureLayout(p);

    const idx = p.layout.findIndex((e) => e.b === bk && e.plot === plotKey);
    if (idx < 0) return jsonResponse({ err: "Такое здание ещё не построено" }, 400);

    // Мидстройка (уровень уже в очереди) — перенос запрещён, тот же footprint
    // уже занимает клетку, а по завершении applyBuild() в mp-tick меняет
    // только уровень, координаты не трогает — переносить в этот момент
    // безопасно нельзя (можно разъехаться с тем, что видит другой клиент
    // прямо в момент завершения стройки).
    if (p.queues.some((q) => q && q.b === bk && q.plot === plotKey))
      return jsonResponse({ err: "Постройка ещё не завершена — подождите" }, 400);

    const fp = BUILD_FOOTPRINT[bk];
    if (!collisionOk(p.layout, fp, gx, gy, idx))
      return jsonResponse({ err: "Нельзя поставить сюда — клетка занята или вне города" }, 400);

    p.layout[idx].gx = gx;
    p.layout[idx].gy = gy;

    const saved = await savePlayerState(admin, row, p);
    if (saved.conflict) return conflictResponse();          // см. savePlayerState
    if (saved.error) return jsonResponse({ err: saved.error.message }, 500);

    return jsonResponse({ ok: true, gx, gy });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
