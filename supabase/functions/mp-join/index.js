// =============================================================================
// mp-join — Фаза 2. Заводит (или возвращает уже существующего) игрока в
// ОБЩЕМ мире по его anon-uid (Supabase Auth). Единственный способ создать
// строку в players — RLS на этой таблице (см. миграцию 0001) намеренно не
// даёт INSERT никому, кроме service-role, которым обладает только эта
// функция (Deno-рантайм Edge Function, ключ не попадает в браузер).
//
// Вызывается один раз при входе игрока в общий мир (кнопка "Общий мир" в
// будущем UI, ещё не подключена в index.html — это отдельный следующий шаг,
// сама функция уже рабочая и её можно проверить curl'ом/Postman уже сейчас).
//
// Тело запроса: { race: "human"|"dwarf"|"elf"|"undead", nick?: string }
// Ответ: { ok:true, world_id, player: {...строка players...} } либо {err}.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — Dashboard-редактор Edge
// Functions не подтягивает относительные импорты на общую папку, поэтому
// здесь код самодостаточен (копия, а не импорт). При деплое через Supabase
// CLI можно вернуть `import ... from "../_shared/cors.js"` как в репозитории.
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
// Фаза 31 — power пишется ТЕМ ЖЕ UPDATE, что и state: отдельным запросом
// это был бы второй рейс к базе на каждом пятисекундном опросе каждого
// игрока и вторая гонка за ту же строку. Аргумент необязательный — все
// прежние вызывающие места (их тут ещё несколько) работают как работали.
async function savePlayerState(admin, row, state, power) {
  const extra = (power == null) ? {} : { power: Math.round(power) };
  const prev = row.updated_at;
  if (!prev) {
    // Строка прочитана без updated_at (старый вызывающий код) — сверять не с
    // чем; пишем как раньше, чтобы ничего не сломать, но и не притворяемся,
    // что проверили.
    const { error } = await admin.from("players")
      .update({ state, ...extra, updated_at: new Date().toISOString() }).eq("id", row.id);
    return error ? { error } : { ok: true };
  }
  const nextIso = new Date(Math.max(Date.now(), Date.parse(prev) + 1)).toISOString();
  const { data, error } = await admin.from("players")
    .update({ state, ...extra, updated_at: nextIso })
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

// Автор пожаловался: очередь стройки/боя показывается сразу, а сам
// результат (новый уровень здания, исход боя) применяет только раз-в-минуту
// тикер (mp-tick) — то есть до минуты ожидания, даже если сама стройка была
// на 10 секунд. Решение — НЕ гнать общий pg_cron-тикер каждую секунду (риск
// упереться в лимит бесплатных вызовов Edge Functions), а "толкать" тикер
// НА ЛЮБОЙ опрос mp-join (тот самый комментарий чуть ниже "опрашивает
// mp-join раз в 5с" — так и было задумано с самого начала, просто клиент
// этого раньше не делал, см. mpRefreshPlayer() в index.html). Не дублирует
// логику применения событий (там ~1900 строк резолва боя/построек — дублировать
// рискованно, разъедется багфиксами при следующей правке) — просто дёргает
// mp-tick тем же HTTP-путём и тем же секретом, что и pg_cron (см. миграцию
// 0002/0003), и ждёт ответа, чтобы следующее чтение players уже видело
// применённый результат. Ошибка/недоступность тикера не должна ронять сам
// join/опрос — у игрока и так будет то состояние, что есть в базе.
// Найдено при разборе жалобы "бесконечная загрузка, не могу зайти в игру":
// эта функция await'ится КАЖДЫМ вызовом mp-join (см. вызов ниже), а у
// клиента (mpCall/mpEnsureAuth в index.html) не было НИКАКОГО таймаута на
// сам запрос mp-join — если mp-tick хоть раз завис/сильно затормозил
// (например, конкурентные тики друг друга подождали на блокировках строк —
// теперь тик дёргается на каждый опрос mp-join, раз в 5с на игрока, а не
// раз в минуту, как раньше, конкурентные запуски стали реальностью, не
// теорией), это утягивало за собой и сам join, а через него — весь экран
// загрузки, у которого тоже не было таймаута. AbortController здесь —
// первый слой защиты (не дать САМОЙ функции зависнуть надолго из-за
// внутреннего вызова); второй слой — таймаут в index.html на сам fetch к
// mp-join (см. supabase/README.md).
async function triggerTick(SUPABASE_URL) {
  const secret = Deno.env.get("MP_TICK_SECRET");
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      await fetch(SUPABASE_URL + "/functions/v1/mp-tick", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(secret ? { "x-tick-secret": secret } : {}) },
        body: "{}",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (_) { /* тикер недоступен/завис/упал — не блокируем сам join, см. комментарий выше */ }
}

const RACES = ["human", "dwarf", "elf", "undead"];

// Вставлено буквально из ../_shared/rules.js — добыча ресурсов по времени
// (index.html:3790 production / index.html:3813 plotFillCap / index.html:3838
// syncRes). Нужна здесь, чтобы возвращать уже актуальные ресурсы при
// повторном join (вкладка "Общий мир" опрашивает mp-join раз в 5с, см.
// index.html) — та же "ленивая экономика", что в одиночной игре: не тикает
// сама по себе, досчитывается при каждом обращении.
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
const prodRate = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv));
const plotCap = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv) * 10);
const PROD_BLD = { food: "farm", wood: "lumber", stone: "quarry", gold: "mine" };
const PROD_MULT = { food: 1, wood: 1, stone: 0.75, gold: 0.5 };
const RES = ["food", "wood", "stone", "gold"];
const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);

// =============================================================================
// Свободная застройка (index.html: CITY_GRID/BUILDINGS.*.footprint/
// collisionOk/PLACEABLE_BKEYS, дословная копия — см. тот же блок в
// mp-build/index.js, синхронно править в обе стороны). mp-join достраивает
// p.layout легаси-игрокам на каждый join/опрос — см. ensureLayout ниже,
// звана в self-heal веточке существующего игрока.
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
// этой проверки ensureLayout мог бы поставить любое здание прямо на Ратушу
// (баг, нашёл автор — Горн встал внутрь Ратуши). Стену (gy:24) отдельно не
// проверяю — она физически вне сетки, пересечься с ней невозможно.
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
// Янтарь (index.html:3327 AMBER_NODE_SHARE) — доля точек, оказывающихся
// Янтарной жилой вместо обычного ресурса, и её отдельная (заметно меньшая)
// формула объёма — премиальный ресурс, одна жила примерно на восемь обычных
// точек. Тот же принцип и число, что в одиночной игре, дословно перенесены
// во все три точки посева узлов в мультиплеере (см. AMBER_NODE_SHARE ниже).
const AMBER_NODE_SHARE = 0.12;
function pickNodeResAndAmount(lv) {
  const isAmber = Math.random() < AMBER_NODE_SHARE;
  const res = isAmber ? "amber" : RES[Math.floor(Math.random() * RES.length)];
  const amount = Math.round(isAmber ? 240 * Math.pow(1.9, lv - 1) : 6000 * Math.pow(2.6, lv - 1));
  return { res, amount };
}
// index.html:2854 epochOf — эпоха ратуши (1..5), нужна для bonuses() ниже
// (расовые эпохальные способности).
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
// Дерево исследований (только сама структура ACADEMY_TREE — таблицы
// стоимости/времени/мощи (RS_*) сюда не нужны, bonuses() ниже смотрит
// только на n.id/n.field/n.total/n.max/n.effects/n.unlock) — дословная
// копия из index.html:2024-2153, тот же кусок данных, что и в mp-research
// (полная версия с RS_*-таблицами — там, эта функция им не пользуется).
const ACADEMY_TREE = {
  eco: [
    // Было max:3 — в RoK и Quarrying, и Metallurgy однoуровневые (чистый анлок
    // без цифры), а в RESEARCH_TABLE на них теперь ровно одна точная строка.
    // Оставлен свой небольшой бонус (0.05, не из таблички — как раньше).
    {id:"eco_stone0",name:"Горное дело",max:1,wave:1,branch:"eco",field:"prodStone",total:0.05},
    {id:"eco_gold0",  name:"Промысел",   max:1,wave:1,branch:"eco",field:"prodGold", total:0.05},
    {id:"eco_food1",  name:"Ирригация",  max:5,wave:1,branch:"eco",field:"prodFood", total:0.15},
    {id:"eco_wood1",  name:"Лесное дело",max:5,wave:1,branch:"eco",field:"prodWood", total:0.15},
    {id:"eco_build1", name:"Кладка",     max:5,wave:1,branch:"eco",field:"build",kind:"mult",total:0.15},
    {id:"eco_stone1", name:"Резец",      max:5,wave:1,branch:"eco",field:"prodStone",total:0.15,requires:["eco_stone0"]},
    {id:"eco_gold1",  name:"Металлообработка",max:5,wave:1,branch:"eco",field:"prodGold",total:0.15,requires:["eco_gold0"]},
    {id:"eco_rsch1",  name:"Письменность",max:5,wave:1,branch:"eco",field:"researchSpeed",total:0.10},
    {id:"eco_gfood1", name:"Серп",       max:5,wave:1,branch:"eco",field:"gatherFW",total:0.15},
    {id:"eco_gwood1", name:"Топор",      max:5,wave:1,branch:"eco",field:"gatherFW",total:0.15},
    {id:"eco_gstone1",name:"Тачка",      max:5,wave:1,branch:"eco",field:"gatherSG",total:0.15},
    {id:"eco_ggold1", name:"Промывка",   max:5,wave:1,branch:"eco",field:"gatherSG",total:0.15},
    {id:"eco_load1",  name:"Колесо",     max:5,wave:1,branch:"eco",field:"load",total:0.15},
    {id:"eco_cap1",   name:"Многослойная кладка",max:5,wave:1,branch:"eco",field:"cap",total:0.15},
    // Донатная ветка (Янтарь). В RoK её аналог (Jewelry) — чистый анлок без
    // своего бонуса, тир 7, требует Multilayer Structure 4; здесь — как и
    // Горное дело/Промысел (тоже бывшие RoK-анлоки без цифр) — превращён в
    // узел с небольшим собственным бонусом, а не голый флаг. Сбор янтаря на
    // карте НЕ гейтится этим узлом (см. обсуждение) — открыт всем с начала
    // игры; тут только бонус к скорости сбора, как и у остальной тройки.
    // Было max:3 (по образцу старых eco_stone0/gold0) — но у Jewelry в
    // табличке только 1 строка, а 2-3 уровень тогда проваливались в
    // формулу-заглушку с абсурдным провалом цены. Как и у stone0/gold0,
    // оставлен один уровень с тем же принципом (свой бонус 0.05 не из
    // таблички, у самой Jewelry цифры нет — только цена/время/мощь).
    {id:"eco_amber0", name:"Промысел янтаря",max:1,wave:1,branch:"eco",field:"gatherAmber",total:0.05},
    {id:"eco_crown_dwarf", name:"Венец: Родовые копи",  max:5,wave:4,branch:"eco",race:"dwarf",gen:1,
      requires:["eco_stone2","eco_gold2"], effects:[{field:"prodStone",total:0.10},{field:"prodGold",total:0.10}]},
    {id:"eco_crown_human", name:"Венец: Казённый оброк", max:5,wave:4,branch:"eco",race:"human",gen:1,
      requires:["eco_gold2"], field:"prodGold", total:0.15},
    {id:"eco_crown_elf",   name:"Венец: Дары рощи",      max:5,wave:4,branch:"eco",race:"elf",gen:1,
      requires:["eco_food2","eco_wood2"], effects:[{field:"prodFood",total:0.10},{field:"prodWood",total:0.10}]},
    {id:"eco_crown_undead",name:"Венец: Голод погоста",  max:5,wave:4,branch:"eco",race:"undead",gen:1,
      requires:["eco_gall2"], effects:[{field:"raise",total:0.10},{field:"mercy",total:0.05}]},
    {id:"eco_wood2",  name:"Лесопилка",  max:10,wave:2,branch:"eco",field:"prodWood",total:0.55,requires:["eco_wood1"]},
    {id:"eco_food2",  name:"Плуг",       max:10,wave:2,branch:"eco",field:"prodFood",total:0.55,requires:["eco_food1"]},
    {id:"eco_gwood2", name:"Пилорама",   max:10,wave:2,branch:"eco",field:"gatherFW",total:0.35,requires:["eco_gwood1"]},
    {id:"eco_build2", name:"Инженерия",  max:10,wave:2,branch:"eco",field:"build",kind:"mult",total:0.35,requires:["eco_build1"]},
    {id:"eco_gfood2", name:"Коса",       max:10,wave:2,branch:"eco",field:"gatherFW",total:0.35,requires:["eco_gfood1"]},
    {id:"eco_rsch2",  name:"Математика", max:10,wave:2,branch:"eco",field:"researchSpeed",total:0.15,requires:["eco_rsch1"]},
    {id:"eco_gold2",  name:"Монетное дело",max:10,wave:2,branch:"eco",field:"prodGold",total:0.55,requires:["eco_gold1"]},
    {id:"eco_stone2", name:"Открытый разрез",max:10,wave:2,branch:"eco",field:"prodStone",total:0.55,requires:["eco_stone1"]},
    {id:"eco_ggold2", name:"Шахтное дело",max:10,wave:2,branch:"eco",field:"gatherSG",total:0.35,requires:["eco_ggold1"]},
    {id:"eco_gall2",  name:"Механизация",max:10,wave:2,branch:"eco",field:"gather",total:0.25,requires:["eco_gfood1","eco_gstone1"]},
    {id:"eco_gstone2",name:"Каменная пила",max:10,wave:2,branch:"eco",field:"gatherSG",total:0.35,requires:["eco_gstone1"]},
    // Была requires:["eco_load1","eco_cap1"] — второй пункт ссылался на чужую
    // линию (защита склада), нет ни в RoK-цепочке Carriage (там Machinery),
    // ни в собственном паттерне дерева (везде "2" требует только свою "1").
    {id:"eco_load2",  name:"Повозка",    max:10,wave:2,branch:"eco",field:"load",total:0.25,requires:["eco_load1"]},
    // Огранка (Cutting & Polishing, RoK тир 13, тот же тир что и Повозка) —
    // точный макс. бонус +35%, подтверждён по вики отдельно от таблицы
    // стоимости/времени тира (та сама по себе не была доступна источнику).
    {id:"eco_amber1", name:"Огранка",    max:10,wave:2,branch:"eco",field:"gatherAmber",total:0.35,requires:["eco_amber0"]},
  ],
  mil: [
    {id:"mil_atk_inf1",name:"Пехота, атака I",   max:5, wave:1,branch:"mil",
      effects:[{field:"atkInf",total:0.10},{field:"matkInf",total:0.05}]},
    {id:"mil_atk_inf2",name:"Пехота, атака II",  max:10,wave:2,branch:"mil",requires:["mil_atk_inf1"],
      effects:[{field:"atkInf",total:0.20},{field:"matkInf",total:0.10}]},
    {id:"mil_atk_arc1",name:"Лучники, атака I",  max:5, wave:1,branch:"mil",
      effects:[{field:"atkArc",total:0.10},{field:"matkArc",total:0.05}]},
    {id:"mil_atk_arc2",name:"Лучники, атака II", max:10,wave:2,branch:"mil",requires:["mil_atk_arc1"],
      effects:[{field:"atkArc",total:0.20},{field:"matkArc",total:0.10}]},
    {id:"mil_atk_cav1",name:"Кавалерия, атака I",max:5, wave:1,branch:"mil",
      effects:[{field:"atkCav",total:0.10},{field:"matkCav",total:0.05}]},
    {id:"mil_atk_cav2",name:"Кавалерия, атака II",max:10,wave:2,branch:"mil",requires:["mil_atk_cav1"],
      effects:[{field:"atkCav",total:0.20},{field:"matkCav",total:0.10}]},
    {id:"mil_atk_sie1",name:"Осада, атака I",    max:5, wave:1,branch:"mil",
      effects:[{field:"atkSie",total:0.10},{field:"matkSie",total:0.05}]},
    {id:"mil_atk_sie2",name:"Осада, атака II",   max:10,wave:2,branch:"mil",requires:["mil_atk_sie1"],
      effects:[{field:"atkSie",total:0.20},{field:"matkSie",total:0.10}]},
    {id:"mil_def_inf1",name:"Пехота, защита I",   max:5, wave:1,branch:"mil",
      effects:[{field:"defInf",total:0.10},{field:"mdefInf",total:0.05}]},
    {id:"mil_def_inf2",name:"Пехота, защита II",  max:10,wave:2,branch:"mil",requires:["mil_def_inf1"],
      effects:[{field:"defInf",total:0.20},{field:"mdefInf",total:0.10}]},
    {id:"mil_def_arc1",name:"Лучники, защита I",  max:5, wave:1,branch:"mil",
      effects:[{field:"defArc",total:0.10},{field:"mdefArc",total:0.05}]},
    {id:"mil_def_arc2",name:"Лучники, защита II", max:10,wave:2,branch:"mil",requires:["mil_def_arc1"],
      effects:[{field:"defArc",total:0.20},{field:"mdefArc",total:0.10}]},
    {id:"mil_def_cav1",name:"Кавалерия, защита I",max:5, wave:1,branch:"mil",
      effects:[{field:"defCav",total:0.10},{field:"mdefCav",total:0.05}]},
    {id:"mil_def_cav2",name:"Кавалерия, защита II",max:10,wave:2,branch:"mil",requires:["mil_def_cav1"],
      effects:[{field:"defCav",total:0.20},{field:"mdefCav",total:0.10}]},
    {id:"mil_def_sie1",name:"Осада, защита I",    max:5, wave:1,branch:"mil",
      effects:[{field:"defSie",total:0.10},{field:"mdefSie",total:0.05}]},
    {id:"mil_def_sie2",name:"Осада, защита II",   max:10,wave:2,branch:"mil",requires:["mil_def_sie1"],
      effects:[{field:"defSie",total:0.20},{field:"mdefSie",total:0.10}]},
    {id:"mil_atk_all1",name:"Атака войск I",  max:10,wave:2,branch:"mil",
      requires:["mil_atk_inf1","mil_atk_arc1","mil_atk_cav1","mil_atk_sie1"],
      effects:[{field:"atk",total:0.15},{field:"matk",total:0.075}]},
    {id:"mil_atk_all2",name:"Атака войск II", max:10,wave:3,branch:"mil",requires:["mil_atk_all1"],
      effects:[{field:"atk",total:0.25},{field:"matk",total:0.125}]},
    {id:"mil_def_all1",name:"Защита войск I", max:10,wave:2,branch:"mil",
      requires:["mil_def_inf1","mil_def_arc1","mil_def_cav1","mil_def_sie1"],
      effects:[{field:"def",total:0.15},{field:"mdef",total:0.075}]},
    {id:"mil_def_all2",name:"Защита войск II",max:10,wave:3,branch:"mil",requires:["mil_def_all1"],
      effects:[{field:"def",total:0.25},{field:"mdef",total:0.125}]},
    {id:"mil_hp_all1", name:"Здоровье войск I", max:10,wave:2,branch:"mil",field:"hp",total:0.15,
      requires:["mil_atk_all1","mil_def_all1"]},
    {id:"mil_hp_all2", name:"Здоровье войск II",max:10,wave:3,branch:"mil",field:"hp",total:0.25,requires:["mil_hp_all1"]},
    {id:"mil_trainspd",name:"Дисциплина обучения",max:1,wave:1,branch:"mil",field:"trainSpeed",total:0.20},
    {id:"mil_march1",  name:"Следопытство", max:5,wave:1,branch:"mil",field:"march",kind:"mult",total:0.15},
    // Была wave:1 — единственная "2"-нода во всём военном дереве без обычного
    // сдвига волны на 1 против своей "1" (везде x1→x2 поднимает волну, здесь
    // почему-то нет), и по факту это RoK-тир 9 (Cartography) против тира 4
    // у Следопытства — разрыв не меньше, чем у остальных таких пар.
    {id:"mil_march2",  name:"Картография",  max:5,wave:2,branch:"mil",field:"march",kind:"mult",total:0.15,requires:["mil_march1"]},
    {id:"mil_scout1",  name:"Слежка",       max:5,wave:1,branch:"mil",field:"scoutBonus",total:5},
    // Та же история: RoK-тир 7 (Camouflage) против тира 4 у Слежки, но была wave:1.
    {id:"mil_scout2",  name:"Маскировка",   max:5,wave:2,branch:"mil",field:"scoutBonus",total:5,requires:["mil_scout1"]},
    {id:"mil_crown_dwarf", name:"Венец: Секира предков", max:5,wave:4,branch:"mil",race:"dwarf",gen:0,
      requires:["mil_atk_inf2","mil_def_inf2"], effects:[{field:"atkInf",total:0.15},{field:"defInf",total:0.15}]},
    {id:"mil_crown_human", name:"Венец: Королевский указ",max:5,wave:4,branch:"mil",race:"human",gen:0,
      requires:["mil_atk_cav2","mil_def_cav2"], effects:[{field:"atkCav",total:0.15},{field:"defCav",total:0.15}]},
    {id:"mil_crown_elf",   name:"Венец: Лунная тетива",  max:5,wave:4,branch:"mil",race:"elf",gen:0,
      requires:["mil_atk_arc2","mil_def_arc2"], effects:[{field:"atkArc",total:0.15},{field:"defArc",total:0.15}]},
    {id:"mil_crown_undead",name:"Венец: Пир кургана",    max:5,wave:4,branch:"mil",race:"undead",gen:0,
      requires:["mil_atk_sie2","mil_def_sie2"], effects:[{field:"atkSie",total:0.15},{field:"defSie",total:0.15}]},
    ...["inf","arc","cav","sie"].flatMap(t=>[2,3,4,5].map(tier=>({
      id:"mil_tier_"+t+tier, name:({inf:"Пехота",arc:"Лучники",cav:"Кавалерия",sie:"Осада"}[t])+" T"+tier, max:1,
      wave:tier-1, branch:"mil", unlock:{type:t,tier},
      requires: tier>2 ? ["mil_tier_"+t+(tier-1)] : undefined
    }))),
  ],
};
// =============================================================================
// bonuses(p, defending) — Фаза 6. Честная (не упрощённая) часть центрального
// агрегатора бонусов клиента (index.html:3731-3789). Порядок и формулы —
// дословно оттуда, но перенесена НЕ вся функция целиком: часть слагаемых
// зависит от системы генералов, которая на сервер физически не может дать
// иного значения, кроме нейтрального (см. по пунктам ниже) — портить эти
// куски НЕЧЕГО, у них нет отдельных настоящих чисел, которые здесь
// проверялись бы отдельно.
//
// Что реально считается (все данные — дословная копия из index.html):
//   1. Расовый "минус" (RACES[race].minus, index.html:1743-1759).
//   2. Расовые эпохальные способности (RACE_EPOCHS, index.html:1767-1832) —
//      по числу открытых эпох (epochOf(p.b.hall)), плюс defMods 5-й эпохи
//      ТОЛЬКО при обороне (defending=true).
//   3. Бонус выбранного генерала — genOf(p)=GENERALS[p.race][p.gen.id||0]
//      (index.html:2345). Фаза 7: выбор генерала подключён по-настоящему
//      (mp-pickgen) — p.gen.id больше не всегда null, GENERALS ниже несёт
//      ОБЕ записи на расу (не только index 0), apply() читается по
//      реальному p.gen.id||0, как в клиенте.
//   4. portalMarchBonus(p.b.portal) — Портал теперь настоящее здание общего
//      мира (mp-build, отдельный кусочек после Фазы 11 — единственное
//      здание без собственной ценовой кривой и в источнике, работает через
//      общую BUILD_TABLE), p.b.portal — реальный уровень, не всегда 0.
//   5. Бонусы дерева исследований (ACADEMY_TREE[*].field/effects, по
//      p.tech) — уже перенесено в Фазе 5, здесь наконец подключается.
//
// Устарело (оставлено видимым нарочно — см. ниже, а не удалено молча):
// раньше здесь было написано, что талантовые бонусы генерала (w1-w5/d1-d5/
// g1-g3/g4-g5, index.html:3760-3767) и GENERAL_TREE (город/армия, index.html:
// 3780-3787) НЕ считаются, потому что вложить очки в общем мире было
// неоткуда (p.gen.tal всегда {}). Это больше не так: mp-talent (Фаза 10,
// кусочек 2) даёт реально тратить очки в p.gen.tal, и блок ниже
// (`const T=(p.gen&&p.gen.tal)||{}` и всё, что после него) их честно читает
// и применяет — не ноль. Смотрите сам код bonuses() ниже, а не этот
// комментарий, если нужно проверить, что именно считается.
// index.html:2283-2344 GENERALS — оба генерала на расу (name — только для
// mp-pickgen'а ответа/сверки, косметика apply не нужна серверу).
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
    { name: "Владислав фон Морвейн", apply: (b) => { b.def += .10; b.healSpeed = 1; } }, // обнуляет расовую скидку лазарета (RACE_EPOCHS.undead[1])
    { name: "Кармилла", apply: (b) => { b.raise += .15; b.mercy += .05; } },
  ],
};
// index.html:1736-1759 RACES[*].minus (без name/color/desc — косметика клиента).
const RACES_MINUS = {
  human:  { field: "prodGold", kind: "frac", value: -0.15 },
  dwarf:  { field: "march",    kind: "mult", value: 0.90 },
  elf:    { field: "def",      kind: "frac", value: -0.10 },
  undead: { field: "def",      kind: "frac", value: -0.10 },
};
// index.html:1767-1832 RACE_EPOCHS — mods (действуют всегда, как только
// открыта эпоха), defMods (только у 5-й эпохи, только при обороне).
const RACE_EPOCHS = {
  human: [
    { mods: [{ field: "build", kind: "mult", value: 1.05 }] },
    { mods: [{ field: "prodAll", kind: "frac", value: 0.05 }] },
    { mods: [{ field: "trainSpeed", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "buildCostCut", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "atk", kind: "frac", value: 0.08 }, { field: "def", kind: "frac", value: 0.08 }] },
  ],
  dwarf: [
    { mods: [{ field: "prodStone", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "prodGold", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "def", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "wallBonus", kind: "frac", value: 0.10 }] },
    { mods: [], defMods: [{ field: "def", kind: "add", value: 0.20 }, { field: "counter", kind: "add", value: 0.15 }] },
  ],
  elf: [
    { mods: [{ field: "prodFood", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "prodWood", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "march", kind: "mult", value: 1.10 }] },
    { mods: [{ field: "archer", kind: "frac", value: 0.15 }] },
    { mods: [{ field: "firstStrike", kind: "frac", value: 1 }] },
  ],
  undead: [
    { mods: [{ field: "raise", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "heal", kind: "mult", value: 0.70 }, { field: "healSpeed", kind: "mult", value: 0.5 }] },
    { mods: [{ field: "mercy", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "raise", kind: "frac", value: 0.25 }] },
    { mods: [], defMods: [{ field: "raiseHurt", kind: "abs", value: 0.40 }] },
  ],
};
// index.html:2909 portalMarchBonus.
const portalMarchBonus = (lv) => (lv <= 0 ? 0 : lv <= 10 ? lv * 0.005 : 10 * 0.005 + (lv - 10) * 0.01);

function bonuses(p, defending = false) {
  const b = {
    build: 1, march: 1, heal: 1, healSpeed: 1,
    atk: 0, def: 0, hp: 0, archer: 0, raise: 0, raiseHurt: 0, gather: 0, load: 0, hosp: 0, cap: 0,
    prodFW: 0, prodSG: 0, bandit: 0, mercy: 0,
    gatherAmber: 0,
    prodAll: 0, prodFood: 0, prodWood: 0, prodStone: 0, prodGold: 0,
    trainSpeed: 0, buildCostCut: 0, wallBonus: 0, counter: 0, firstStrike: 0,
    researchSpeed: 0, scoutBonus: 0,
    atkInf: 0, atkArc: 0, atkCav: 0, atkSie: 0, defInf: 0, defArc: 0, defCav: 0, defSie: 0,
    matkInf: 0, matkArc: 0, matkCav: 0, matkSie: 0, mdefInf: 0, mdefArc: 0, mdefCav: 0, mdefSie: 0,
    matk: 0, mdef: 0,
    genAtkMod: 0, genDefMod: 0, genHpMod: 0,
  };
  const mn = RACES_MINUS[p.race];
  if (mn.kind === "mult") b[mn.field] *= mn.value; else b[mn.field] = (b[mn.field] || 0) + mn.value;
  const epoch = epochOf(p.b && p.b.hall), track = RACE_EPOCHS[p.race];
  for (let i = 0; i < epoch; i++) {
    (track[i].mods || []).forEach((m) => {
      if (m.kind === "mult") b[m.field] *= m.value; else b[m.field] = m.value;
    });
  }
  if (defending && epoch >= 5 && track[4].defMods) {
    track[4].defMods.forEach((m) => {
      if (m.kind === "abs") b[m.field] = m.value; else b[m.field] = (b[m.field] || 0) + m.value;
    });
  }
  GENERALS[p.race][(p.gen && p.gen.id) || 0].apply(b);
  b.march *= 1 + portalMarchBonus((p.b && p.b.portal) || 0);
  // index.html:3760-3767 TALENTS (war/dev/gath) — Фаза 10, кусочек 3: раньше
  // p.gen.tal было гарантированно {} (очков взять было неоткуда), теперь
  // mp-talent (кусочек 2) реально его заполняет — здесь наконец читаем эффект.
  const T = (p.gen && p.gen.tal) || {};
  const g = (id) => T[id] || 0;
  b.atk += g("w1") * .02; b.def += g("w2") * .02; b.hp += g("w3") * .02;
  b.bandit += g("w4") * .05; b.mercy += g("w5") * .03;
  b.build *= 1 + g("d1") * .03; b.prodFW += g("d2") * .04; b.prodSG += g("d3") * .04;
  b.hosp += g("d4") * .05; b.cap += g("d5") * .04;
  b.load += g("g1") * .04; b.gather += g("g2") * .04; b.march *= 1 + g("g3") * .03;
  b.gatherFW = g("g4") * .05; b.gatherSG = g("g5") * .05;
  const tech = p.tech || {};
  const multAcc = {};
  [ACADEMY_TREE.eco, ACADEMY_TREE.mil].forEach((arr) => arr.forEach((n) => {
    const lv = tech[n.id] || 0; if (!lv || n.unlock) return;
    const list = n.effects || [{ field: n.field, total: n.total, kind: n.kind }];
    list.forEach((e) => {
      const inc = e.total * (lv / n.max);
      if (e.kind === "mult") multAcc[e.field] = (multAcc[e.field] || 0) + inc;
      else b[e.field] = (b[e.field] || 0) + inc;
    });
  }));
  Object.keys(multAcc).forEach((f) => b[f] *= (1 + multAcc[f]));
  // index.html:3780-3787 GENERAL_TREE (город/армия) — тот же T, что и выше.
  const GENERAL_TREE_NODES = [
    { id: "gt_c1", per: .03, kind: "mult", field: "build" },
    { id: "gt_c2", per: .03, kind: "add", field: "buildCostCut" },
    { id: "gt_c3", per: .04, kind: "add", field: "trainSpeed" },
    { id: "gt_c4", per: .03, kind: "add", field: "prodAll" },
    { id: "gt_c5", per: .03, kind: "add", field: "cap" },
    { id: "gt_a1", per: .03, kind: "add", field: "genAtkMod" },
    { id: "gt_a2", per: .03, kind: "add", field: "genDefMod" },
    { id: "gt_a3", per: .03, kind: "add", field: "genHpMod" },
    { id: "gt_a4", per: .02, kind: "add", field: "atk" },
    { id: "gt_a5", per: .02, kind: "add", field: "def" },
    { id: "gt_a6", per: .02, kind: "add", field: "hp" },
    { id: "gt_a7", per: .03, kind: "mult", field: "march" },
    { id: "gt_a8", per: .03, kind: "add", field: "load" },
    { id: "gt_a9", per: .05, kind: "add", field: "bandit" },
    { id: "gt_a10", per: .03, kind: "add", field: "mercy" },
  ];
  const multAcc2 = {};
  GENERAL_TREE_NODES.forEach((n) => {
    const lv = T[n.id] || 0; if (!lv) return;
    const inc = n.per * lv;
    if (n.kind === "mult") multAcc2[n.field] = (multAcc2[n.field] || 0) + inc;
    else b[n.field] = (b[n.field] || 0) + inc;
  });
  Object.keys(multAcc2).forEach((f) => b[f] *= (1 + multAcc2[f]));
  return b;
}

// index.html:3790 production() — теперь считает через полноценный bonuses(p)
// вместо голых PROD_TABLE-чисел (тот же самый B, что течёт и в trainSpeed/
// build/heal у остальных функций этого файла). handicap (p.isBot) в общем
// мире не нужен — ботов здесь нет (см. syncRes выше).
function production(p) {
  const B = bonuses(p), out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let base = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { if (lv > 0) base += prodRate(lv); });
    let v = base * PROD_MULT[r];
    v *= 1 + B.prodAll;
    v *= 1 + (r === "food" ? B.prodFood : r === "wood" ? B.prodWood : r === "stone" ? B.prodStone : B.prodGold);
    v *= 1 + ((r === "food" || r === "wood") ? B.prodFW : B.prodSG);
    out[r] = v;
  });
  return out;
}
function plotFillCap(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let extra = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { extra += plotCap(lv) * PROD_MULT[r]; });
    out[r] = Math.round(extra);
  });
  return out;
}
function syncRes(p, nowSec) {
  const dt = (nowSec - (p.resAt || 0)) / 3600;
  if (dt <= 0) { p.resAt = nowSec; return; }
  const pr = production(p), cap = plotFillCap(p);
  RES.forEach((r) => {
    const add = Math.min(pr[r] * dt, cap[r]);
    p.res[r] = Math.max(0, p.res[r] + add);
  });
  p.resAt = nowSec;
}


// =============================================================================
// Мощь державы (power) — Фаза 31.
// =============================================================================
// --- НАЧАЛО СГЕНЕРИРОВАННОГО БЛОКА (tools/gen_power_tables.mjs) ---
// Таблицы мощи, вынутые из index.html. НЕ ПРАВИТЬ РУКАМИ: правьте исходные
// таблицы в index.html и перегенерируйте (node tools/gen_power_tables.mjs).
// Сверить, не разошлись ли копии: node tools/gen_power_tables.mjs --check
const POWER_BUILD = {
  hall: [7,21,59,154,383,852,1847,3706,6504,10933,16723,24693,35213,48838,66400,91451,125005,170590,232957,318769,442735,630860,907085,1322485,2195458],
  farm: [5,11,18,28,38,68,150,309,549,874,1366,2032,3049,4419,6176,8576,11896,16246,21966,29846,40211,54646,74946,103446,143196],
  lumber: [5,11,18,28,38,68,150,309,549,874,1366,2032,3049,4419,6176,8576,11896,16246,21966,29846,40211,54646,74946,103446,143196],
  quarry: [5,10,16,32,88,198,387,627,934,1351,1979,2926,4152,5708,7690,10260,14000,19220,26260,35860,49300,67780,94060,132500,192100],
  mine: [6,19,46,100,219,401,699,1335,1758,2668,3984,5958,8678,12454,17707,25126,36126,52139,75230,108850,158176,230233,336750,495206,735046],
  academy: [5,11,27,61,145,336,688,1346,2591,4975,7970,11679,16387,22391,30127,40207,53497,71227,95369,128424,174240,239921,336515,481806,783449],
  store: [5,10,17,41,92,201,402,778,1489,2848,4552,6703,9436,12942,17488,23447,31354,42032,56560,76832,104966,145492,205219,295585,478367],
  barracks: [5,10,20,37,94,244,525,1059,2083,4063,6520,9576,13407,18241,24400,32325,42636,56328,74659,99431,133357,181631,252430,359629,592326],
  range: [5,10,20,37,94,244,525,1059,2083,4063,6520,9576,13407,18241,24400,32325,42636,56328,74659,99431,133357,181631,252430,359629,592326],
  stable: [5,10,20,37,94,244,525,1059,2083,4063,6520,9576,13407,18241,24400,32325,42636,56328,74659,99431,133357,181631,252430,359629,592326],
  siege: [5,10,26,63,126,293,600,1173,2258,4332,6931,10202,14355,19679,26573,35603,47574,63716,85697,115969,158145,218794,308118,442817,716764],
  hospital: [5,13,32,65,162,366,723,1262,2077,3310,4967,7220,10319,14632,20699,29316,41665,59576,85644,123830,179944,263152,387338,574480,881480],
  wall: [5,15,37,94,226,519,1037,1965,3656,6784,10816,16060,22965,32169,44583,61540,84977,117860,164369,230776,326321,466309,674163,986224,1545374],
  garrison: [5,11,21,44,100,221,446,868,1671,3213,5133,7538,10570,14421,19367,25787,34217,45545,60804,81650,110460,151716,212389,303649,495562],
  scout: [5,10,16,32,81,191,398,769,1274,1971,2916,4286,5956,7969,10350,13191,17149,22223,28423,36109,46007,58118,74187,96279,139023],
  forge: [5],
  market: [5,10,27,84,193,379,634,1102,1973,3615,5687,8317,11684,16040,21741,29294,39422,53250,72284,98780,136090,190096,269894,390404,626317],
  alliance: [5,10,21,53,116,265,535,1032,1962,3722,5945,8761,12366,17036,23146,31245,42109,56900,77229,105544,145342,202900,287897,415855,667083],
  portal: [5,13,32,78,186,428,863,1656,3124,5880,9393,13870,19676,27280,37355,50874,69237,94544,129869,179600,250281,353115,505339,734015,1164412],
};
const POWER_RSCH = {
  eco_stone0: [5],
  eco_gold0: [384],
  eco_food1: [44,142,347,797,1697],
  eco_wood1: [44,142,347,797,1697],
  eco_build1: [269,672,1272,2141,3918],
  eco_stone1: [406,1147,2485,5161,10513],
  eco_gold1: [406,1147,2485,5161,10513],
  eco_rsch1: [725,2176,5078,10882,22490],
  eco_gfood1: [161,483,1127,2415,4991],
  eco_gwood1: [161,483,1127,2415,4991],
  eco_gstone1: [581,1672,3710,7786,15938],
  eco_ggold1: [581,1672,3710,7786,15938],
  eco_load1: [669,2007,4683,10035,20739],
  eco_cap1: [494,1482,3458,7410,15314],
  eco_amber0: [9182],
  eco_wood2: [2027,4953,9185,15313,24190,37069,55775,82970,122555,180236],
  eco_food2: [2027,4953,9185,15313,24190,37069,55775,82970,122555,180236],
  eco_gwood2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_gfood2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_build2: [3915,9620,17937,30078,47822,73778,111786,167500,249252,369332],
  eco_rsch2: [3915,9620,17937,30078,47822,73778,111786,167500,249252,369332],
  eco_gold2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_stone2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_ggold2: [4065,10020,18753,31574,50416,78129,118926,179040,267695,398558],
  eco_gstone2: [4065,10020,18753,31574,50416,78129,118926,179040,267695,398558],
  eco_gall2: [4540,11210,21019,35453,56711,88049,134286,202560,303458,452681],
  eco_load2: [5420,13550,25745,44039,71484,112656,174414,267053,406011,614450],
  eco_amber1: [5420,13550,25745,44039,71484,112656,174414,267053,406011,614450],
  eco_crown_dwarf: [5255,13138,24961,42698,69308],
  eco_crown_human: [5255,13138,24961,42698,69308],
  eco_crown_elf: [5255,13138,24961,42698,69308],
  eco_crown_undead: [5255,13138,24961,42698,69308],
  mil_trainspd: [56],
  mil_atk_inf1: [184,252,457,748,1298],
  mil_atk_arc1: [184,252,457,748,1298],
  mil_atk_cav1: [184,252,457,748,1298],
  mil_atk_sie1: [184,252,457,748,1298],
  mil_tier_inf2: [2690],
  mil_tier_arc2: [2690],
  mil_tier_cav2: [2690],
  mil_tier_sie2: [3050],
  mil_scout1: [381,971,1910,3450,6056],
  mil_march1: [381,971,1910,3450,6056],
  mil_def_inf1: [1214,3123,6216,11386,20305],
  mil_def_arc1: [1214,3123,6216,11386,20305],
  mil_def_cav1: [1214,3123,6216,11386,20305],
  mil_def_sie1: [1214,3123,6216,11386,20305],
  mil_tier_inf3: [27243],
  mil_tier_arc3: [27243],
  mil_tier_cav3: [27243],
  mil_tier_sie3: [32427],
  mil_scout2: [4220,11630,26435,58362,135413],
  mil_atk_all1: [5671,14827,30421,56408,100570,177222,312936,557994,1008570,1850342],
  mil_def_all1: [5671,14827,30421,56408,100570,177222,312936,557994,1008570,1850342],
  mil_hp_all1: [5671,14827,30421,56408,100570,177222,312936,557994,1008570,1850342],
  mil_march2: [8877,22198,43136,74543,121648],
  mil_tier_inf4: [159930],
  mil_tier_arc4: [159930],
  mil_tier_cav4: [159930],
  mil_tier_sie4: [211770],
  mil_atk_inf2: [4191,10823,21462,38805,67589,116294,202693,354410,626223,1122415],
  mil_atk_arc2: [4191,10823,21462,38805,67589,116294,202693,354410,626223,1122415],
  mil_atk_cav2: [4191,10823,21462,38805,67589,116294,202693,354410,626223,1122415],
  mil_atk_sie2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_inf2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_arc2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_cav2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_sie2: [5055,13415,27510,51765,94373,170726,312421,574730,1067727,2006287],
  mil_atk_all2: [5930,15604,31674,58891,105938,188950,341205,619354,1136111,2110314],
  mil_def_all2: [5930,15604,31674,58891,105938,188950,341205,619354,1136111,2110314],
  mil_hp_all2: [5930,15604,31674,58891,105938,188950,341205,619354,1136111,2110314],
  mil_tier_inf5: [485748],
  mil_tier_arc5: [485748],
  mil_tier_cav5: [485748],
  mil_tier_sie5: [672382],
  mil_crown_dwarf: [4832,12633,25920,48063,85691],
  mil_crown_human: [4832,12633,25920,48063,85691],
  mil_crown_elf: [4832,12633,25920,48063,85691],
  mil_crown_undead: [4832,12633,25920,48063,85691],
};
// id технологии -> [волна, ветка] (0=eco, 1=mil) для формулы-запаса у узлов
// без своей строки в таблице (см. researchPower в index.html).
const POWER_RSCH_META = {
  eco_stone0: [1,0],
  eco_gold0: [1,0],
  eco_food1: [1,0],
  eco_wood1: [1,0],
  eco_build1: [1,0],
  eco_stone1: [1,0],
  eco_gold1: [1,0],
  eco_rsch1: [1,0],
  eco_gfood1: [1,0],
  eco_gwood1: [1,0],
  eco_gstone1: [1,0],
  eco_ggold1: [1,0],
  eco_load1: [1,0],
  eco_cap1: [1,0],
  eco_amber0: [1,0],
  eco_crown_dwarf: [4,0],
  eco_crown_human: [4,0],
  eco_crown_elf: [4,0],
  eco_crown_undead: [4,0],
  eco_wood2: [2,0],
  eco_food2: [2,0],
  eco_gwood2: [2,0],
  eco_build2: [2,0],
  eco_gfood2: [2,0],
  eco_rsch2: [2,0],
  eco_gold2: [2,0],
  eco_stone2: [2,0],
  eco_ggold2: [2,0],
  eco_gall2: [2,0],
  eco_gstone2: [2,0],
  eco_load2: [2,0],
  eco_amber1: [2,0],
  mil_atk_inf1: [1,1],
  mil_atk_inf2: [2,1],
  mil_atk_arc1: [1,1],
  mil_atk_arc2: [2,1],
  mil_atk_cav1: [1,1],
  mil_atk_cav2: [2,1],
  mil_atk_sie1: [1,1],
  mil_atk_sie2: [2,1],
  mil_def_inf1: [1,1],
  mil_def_inf2: [2,1],
  mil_def_arc1: [1,1],
  mil_def_arc2: [2,1],
  mil_def_cav1: [1,1],
  mil_def_cav2: [2,1],
  mil_def_sie1: [1,1],
  mil_def_sie2: [2,1],
  mil_atk_all1: [2,1],
  mil_atk_all2: [3,1],
  mil_def_all1: [2,1],
  mil_def_all2: [3,1],
  mil_hp_all1: [2,1],
  mil_hp_all2: [3,1],
  mil_trainspd: [1,1],
  mil_march1: [1,1],
  mil_march2: [2,1],
  mil_scout1: [1,1],
  mil_scout2: [2,1],
  mil_crown_dwarf: [4,1],
  mil_crown_human: [4,1],
  mil_crown_elf: [4,1],
  mil_crown_undead: [4,1],
  mil_tier_inf2: [1,1],
  mil_tier_inf3: [2,1],
  mil_tier_inf4: [3,1],
  mil_tier_inf5: [4,1],
  mil_tier_arc2: [1,1],
  mil_tier_arc3: [2,1],
  mil_tier_arc4: [3,1],
  mil_tier_arc5: [4,1],
  mil_tier_cav2: [1,1],
  mil_tier_cav3: [2,1],
  mil_tier_cav4: [3,1],
  mil_tier_cav5: [4,1],
  mil_tier_sie2: [1,1],
  mil_tier_sie3: [2,1],
  mil_tier_sie4: [3,1],
  mil_tier_sie5: [4,1],
};
const POWER_RSCH_WAVE = {1:0.018,2:5,3:20,4:60};
const POWER_RSCH_BASE = [28500,26200];
const POWER_UNIT = [1,2,3,4,10];
const POWER_GEAR = [1250,2750,6250,15000,37500];
// --- КОНЕЦ СГЕНЕРИРОВАННОГО БЛОКА ---
// Мощь державы — Фаза 31. Дословный порт mpPower()/power() из index.html:
// постройки + войска (дома И в походах) + исследования + полководец +
// надетое снаряжение. Таблицы чисел — в сгенерированном блоке выше.
//
// До этой фазы мощь считалась ТОЛЬКО в браузере, а колонка players.power так
// и стояла нулём с самой первой миграции. Автор: "будут рейтинги в том числе
// и по мощи" — значит число должно быть у сервера, а не у клиента, который
// его к тому же может назвать любым.
//
// marchUnits — состав отрядов, которые прямо сейчас В ПОЛЕ. Их войска
// вычтены из p.troops ещё на отправке (см. mp-attack/mp-gather), и без этого
// слагаемого мощь проваливалась бы на время каждого похода, а рейтинг
// дёргался бы туда-сюда просто от того, воюет игрок или сидит дома.
const POWER_TKEYS = ["inf", "arc", "cav", "sie"];
const powerTblRow = (arr, lv) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(lv) - 1))];
function buildingPowerOf(bk, lv) {
  lv = +lv || 0;
  if (lv <= 0) return 0;
  const arr = POWER_BUILD[bk];
  if (!arr || !arr.length) return 0;
  return powerTblRow(arr, lv);
}
function researchPowerOf(id, lv) {
  const arr = POWER_RSCH[id];
  const row = arr && arr[lv - 1];
  if (row != null) return row;
  // Формула-запас для узлов без своей строки в таблице — index.html
  // researchPower(): lv * волна * база ветки.
  const meta = POWER_RSCH_META[id];
  if (!meta) return 0;
  return lv * (POWER_RSCH_WAVE[meta[0]] || 0) * (POWER_RSCH_BASE[meta[1]] || 0);
}
function powerOf(p, marchUnits) {
  let v = 0;
  for (const bk of Object.keys(POWER_BUILD)) {
    const lv = p.b && p.b[bk];
    if (Array.isArray(lv)) lv.forEach((l) => { v += buildingPowerOf(bk, l || 0); });
    else v += buildingPowerOf(bk, lv || 0);
  }
  const addUnits = (u) => {
    if (!u) return;
    for (const t of POWER_TKEYS) for (let i = 1; i <= 5; i++) v += ((u[t] && u[t][i]) || 0) * POWER_UNIT[i - 1];
  };
  addUnits(p.troops);
  (marchUnits || []).forEach(addUnits);
  const tech = p.tech || {};
  for (const id of Object.keys(tech)) {
    const lv = tech[id] || 0;
    if (lv) v += researchPowerOf(id, lv);
  }
  // index.html genPowerOf: 2000 + 318.5*ур^1.5, плюс 1000 за каждое
  // вложенное очко таланта.
  const g = p.gen || {};
  let talSpent = 0;
  for (const k in (g.tal || {})) talSpent += g.tal[k] || 0;
  v += 2000 + Math.pow(g.lv || 1, 1.5) * 318.5 + talSpent * 1000;
  // index.html gearPowerOf: по мощи редкости за каждый надетый предмет.
  for (const it of Object.values(p.gear || {})) {
    if (it && it.rarity) v += POWER_GEAR[it.rarity - 1] || 0;
  }
  return Math.round(v);
}
// Пишется в две точки сразу: колонка players.power (по ней пойдут рейтинги —
// индексировать и сортировать JSONB ради этого незачем) и state.peakPower
// (высшая мощь за всё правление, для итога на экране гибели: текущая на
// момент смерти всегда занижена, у павшего к тому времени нет ни войск, ни
// половины города).
function applyPower(p, row, marchUnits) {
  const v = powerOf(p, marchUnits);
  p.peakPower = Math.max(p.peakPower || 0, v);
  if (row) row.power = v;
  return v;
}

// Тот же снимок полей, что newPlayer() в index.html (см. index.html:2968) —
// специально в той же форме, чтобы Фаза 5 (перенос остальных действий) не
// переписывала форму состояния заново. ai/pts=5/gear/inventory и т.д. —
// как у только что созданного игрока-человека там же (isBot=false: gen.id
// всегда null, ai не используется).
function newPlayerState(race, nowSec) {
  const BKEYS = ["hall", "wall", "farm", "lumber", "quarry", "mine", "academy",
    "store", "barracks", "range", "stable", "siege", "hospital", "scout", "garrison"];
  // Столько же участков, сколько BUILDINGS[k].plots в index.html: farm/
  // lumber/quarry/mine/hospital — все 4 (index.html:2416-2425). Раньше
  // hospital/quarry/mine сюда забыты не были включены — заводились
  // скаляром 0 вместо [0,0,0,0], что ломало mp-build при попытке поднять
  // такое здание (см. самоисцеление в mp-build/mp-tick).
  const MULTI = { farm: 4, lumber: 4, quarry: 4, mine: 4, hospital: 4 };
  const b = {};
  BKEYS.forEach((k) => { b[k] = MULTI[k] ? new Array(MULTI[k]).fill(0) : 0; });
  // Автор попросил чистый старт: только Ратуша 1 ур. и Стена 1 ур., без
  // фермы/лесопилки/склада авансом — та же правка, что и в index.html
  // (newPlayer()/genWorld()), держим оба мира в синхроне.
  b.hall = 1; b.wall = 1;
  const troops = {}, wounded = {};
  ["inf", "arc", "cav", "sie"].forEach((t) => {
    troops[t] = {}; wounded[t] = {};
    for (let i = 1; i <= 5; i++) { troops[t][i] = 0; wounded[t][i] = 0; }
  });
  troops.inf[1] = 200; troops.arc[1] = 150;
  return {
    // resAt = момент создания, не 0 — иначе первый же syncRes() увидел бы
    // "прошли миллиарды секунд с эпохи Unix" и начислил бы участку добычу
    // сразу под завязку его plotFillCap.
    res: { food: 100000, wood: 100000, stone: 100000, gold: 100000 }, resAt: nowSec,
    // race — Фаза 6: раса дублируется и сюда, в state (JSONB), не только в
    // одноимённую колонку players.race — bonuses()/nodeVisibleFor() читают
    // ОДИН объединённый объект "p" (как и в одиночной игре, где race — поле
    // самого объекта игрока), а не state+row по отдельности. Колонка
    // players.race остаётся как есть (по ней идут другие запросы — mp-attack/
    // mp-tick и т.д. уже читают её напрямую с row), это не замена, а
    // дублирование ради единообразного p.race внутри bonuses().
    race,
    b, layout: [], queues: [null, null], train: { inf: null, arc: null, cav: null, sie: null },
    troops, wounded, heal: null,
    gen: { lv: 1, xp: 0, pts: 5, tal: {}, id: null, away: null },
    gear: {}, tech: {}, rsch: null,
    inventory: {}, materials: { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] },
    craft: null, tomes: {}, lostTo: null,
    // Янтарь — отдельное поле, не часть res (index.html:2823 p.amber — та же
    // причина: премиальная валюта не из общей четвёрки, в склад не идёт).
    amber: 0,
  };
}

// index.html:2706-2763 — дословная копия рельефа объёмной карты (Фаза 12).
// RW_SEED — ФИКСИРОВАННАЯ константа, одна и та же у любого клиента (не
// worlds.seed), рельеф не зависит от того, чья это партия — поэтому эта
// копия детерминированно совпадает с тем, что показывает 3D-вкладка «Мир»
// у каждого игрока, без какой-либо синхронизации сида между сервером и
// клиентами. До Фазы 12 mp-join сажал город/точку/лагерь вслепую (только
// от игроков/друг друга) — 3D-карты тогда не существовало, поэтому "город
// в море" был просто невозможен УВИДЕТЬ. Теперь, когда объёмная карта
// реально показывает соседей (кусочки 1-4), это стало видимым багом:
// первый же игрок мог случайно осесть на воде.
function hash2(x, y, s) { let h = x * 374761393 + y * 668265263 + s * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function ridge(x, y, s) { return 1 - Math.abs(2 * noise(x, y, s) - 1); }
const RW_SEED = 12345, RW_SEA = 0.235;
function rwSstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function rwRegionKind(x, y) {
  return { mount: rwSstep(0.40, 0.72, noise(x / 40, y / 40, RW_SEED + 55)),
           plat: rwSstep(0.62, 0.84, noise(x / 34, y / 34, RW_SEED + 88)),
           rough: noise(x / 26, y / 26, RW_SEED + 123) };
}
function rwHeightRaw(x, y) {
  const wx = (noise(x / 34, y / 34, RW_SEED + 101) * 2 - 1) * 13;
  const wy = (noise(x / 34, y / 34, RW_SEED + 102) * 2 - 1) * 13;
  const X = x + wx, Y = y + wy;
  const R = rwRegionKind(x, y);
  const cont = noise(X / 62, Y / 62, RW_SEED + 201);
  let e = 0.16 + cont * 0.50;
  const amp = 0.16 + 0.84 * R.mount + 0.35 * R.rough;
  e += (noise(X / 27, Y / 27, RW_SEED) * 0.20 + noise(X / 13, Y / 13, RW_SEED + 9) * 0.10
    + noise(X / 6, Y / 6, RW_SEED + 21) * 0.045) * amp;
  e += ridge(X / 17, Y / 17, RW_SEED + 37) * 0.33 * R.mount;
  e += R.mount * 0.10 - (1 - R.mount) * 0.05;
  if (R.plat > 0.02) {
    const terr = Math.round(e * 6.0) / 6.0;
    e = e * (1 - R.plat * 0.80) + terr * (R.plat * 0.80);
  }
  if (e >= 0.42) {
    const k = rwSstep(0.42, 0.68, e);
    e += (noise(x / 2.4, y / 2.4, RW_SEED + 180) - 0.5) * 0.075 * k
      + (noise(x / 5.5, y / 5.5, RW_SEED + 181) - 0.5) * 0.055 * k;
  }
  return Math.max(0.02, Math.min(1, e));
}
function rwHeightAt(x, y) {
  const c = rwHeightRaw(x, y);
  const s = (rwHeightRaw(x + 0.7, y) + rwHeightRaw(x - 0.7, y) + rwHeightRaw(x, y + 0.7) + rwHeightRaw(x, y - 0.7)) * 0.25;
  return c * 0.55 + s * 0.45;
}
// ---- НАСТОЯЩАЯ карта воды (запечена из heightmap/elevation-v6.bin) --------
// Процедурная формула rwHeightAt выше — НЕ та вода, которую видит игрок.
// Замер по всей карте: она не видит 96% настоящей воды, то есть сервер
// спокойно ставил точки и лагеря прямо в реки, а 3D-движок рисует настоящий
// рельеф — отсюда рудники и каменоломни на берегу и в русле.
//
// Сам elevation-v6.bin — 5.76 МБ, в функцию его не зашить и качать в рантайме
// незачем. Здесь лежит его сжатая битовая маска (worldgen/bake_water_mask.mjs):
// 1 бит на блок WATER_MASK_STEP x WATER_MASK_STEP клеток, блок считается водой,
// если мокра ЛЮБАЯ его клетка — консервативно, лучше лишний запас у берега,
// чем точка в реке. Проверено: пропущенной воды 0.0% против 96.2% у формулы,
// ценой 3.1% карты в виде запаса вдоль берегов.
// Перепечь после смены heightmap: node worldgen/bake_water_mask.mjs
const WATER_MASK_STEP = 4, WATER_MASK_W = 600, WATER_MASK_H = 300;
const WATER_MASK_HALF_X = 1200, WATER_MASK_HALF_Z = 600; // мировые полуразмеры запечённой области
const WATER_MASK_B64 = "///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////n//////////////////////////////////////////////////////////////////////////////////////////////////8HIPD///////////////////////////////////////////////////////////////////////////////////////////////8AAPD////w/z/g//8///////////////////////////////////////////////////////////////////////9/OOD/////fw8AAGDf/3+A9w0AGgAP3P////j///////////////////////////////////////////////////////////////8BAAD/////fwAAAICBjzMAAAAAAAACAP7/AwD+/////////////3/w//////////////////////////////8//////////////wcAAADw//8/PgAAAACADwAAAAAAAAAAADgAAADA/////////////x/A////////////z/////////////////9/9v///////3PgPwAAAADA/5EfdgAAAAAAAAAAAAAAAAAAAAAAAAAAwP//h////////wMA/v//////////h/////////////////9jDsD//////wAAAAAAAAAAgAAA4AEAAAAAAAAAAAAAAAAAAAAAAAAAAOD/APz///8HDgAA/P//////////A////////x/g/////z/gDQD+////DwAAAAAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAOD/fz8AGAAA/P//////////AP7//////4HAP/D//w+AHQD4////AwAAAAAAAAAAAAAAgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAGAAA/P//////f/g/APj/////P4CAD+D//wOAPh/g//9/AAwAAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAAAAAAAEBgAAAAAABAMAQQ/P//////f4ABAADw////DwAAAOD//wEA9P8D/z8AAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAABggAEAAABABjAQ/v//////fwAAAAAA+P//AQAAAMD//wcA/OEP/AHAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAABggAEAAAAACBAA/v//////fwAAAAAAAAAAAAAAAID/AQ8A+Ad/AADgAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAEAAACDAA////////fwAAAAAAAAAAAAAAAAAOABwA6C74AABAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAcAAAAHOA////////fwAAAAAAAAAAAAAAAAAAABgAACjgwADAGAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAA4AEAAM+H////////fwwAAAAAAAAAAAAAAA4AAHgAAAD4//8AHwAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAwAEADA7A////////fxwAAAAAAAAAAAAAAAAAAPADAABg//8BDwAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAgAUAAADw////////fwgAAAAAAAAAAAAAAAAAAMAHAAAAAP4PAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAQAAAAQAAADg////////PzAAAAAAAAAAAAAAAAAAAAAPAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAADg////////HzgAAAAAAAAAAAAAAAAAAAB8AAAAAAD8PAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAgAAADw////////DwwAAAAAAAAAAAAAAAAAAAB4AAAAAAD8/zcAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAADw////////BwAAAAAAAAAAAAAAAAAAAADgAAAAAAD8738AAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAGAAAQDw////////AwAAAAAAAAAAAAAAAAAAAADgAAAAAACAQP0PAAAgAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAA4AFMAGADA8D5////////AQsAAAAAAAAAAAAAAAAAAABnAAAAAAAAAMAfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwA/MAAAAAID5////////AR8AAAAAAAAAAAAAAAAAAABjAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8MAAAAAAD4////////AB8AAAAAAAAAAAAAAAAAAABgAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQDAAAAAQD4////////AB8AAAAAAAAAAAAAAAAAAADgAQAAAAAAAADwAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAD8////////AD8AAAAAAAAAAAAAAAAAAADAAwAAAAAAAADgAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAH+AAAwAAD8//////9/ADwAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAACAgwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAwDAAAD8////////ABgAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAADAzwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACADwCAAAD+////////AAwAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAADg/gEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAABgD+//////9/AAAAAAAAAAAAAAAAAAAABgMABwAAAAAAAABw+B8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAABgD+//////9/BwAAAAAAAAAAAAAAAACAAAAADgAAAAAAAADw4P8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIeBAADAD+////////AyAAAAAAAAAAAAAAAACAAAAAHgAAAAAAAADwMPwBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACI4P8DDAD+////////AQAAAAAAAAAADAAAAAAAAAAA+AAAAAAAAADwAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgf8HBAD+////////AQAAAAAAAAAABAAAAAAAAAAA8AEAAAAAAAA+AAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAOBAD8////////AAEAAAAAAAAAAAAAAAAAAAAAwAMAQAAAAAAPAMAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAAQA8AAD8////////gAEgAAAAAAAAAAAAAAAAAAAAAAMAwAAAAIAPAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAPAAAAAGAAAAB4GADw////////OAFwAAAAAAAAAAAAAAAAAAAAAAcAAAAAAIAHAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+Hx8AAGAAAwDgAQDw////////PAAwAAAAAAAAAAAAAAAAAAAAAA4AAAAAAMADAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw/38AAMA5AgDAAwDg////////PAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAMABAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA8fEDAMAZADMABwDA////////OAAAAAAAAAAAAAAAgCEAAAAAAAwAAAAAAMABAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAPAAA4AAMADgDA////////AAAAAAAAAAAAAAAAgCAAAAAAABgAAAAAAMABAMAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AABwAAAADADA////////AQAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAMAAAMAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AwDgAQAAPAAA////////AQAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAMABAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAHwCAAQAA+AAA/v//////AQAAAAAAAAAAABgAAAAAAAAAADgAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgCABwAAwAAA/v//////AwAAAAAAAAAAAAwAAAAAAwAAADgAAAAAOMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAHwAAwAAA/v//////AwAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AMAPAAAwAEA/P//////w2MAAAAAAAAAAAAAAAAAAAAAAhgAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AMAAAwAEA+P//////xw8AAAAAAAAAAAAAAAAAAAAAAAAAAACAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAgAcA+P//////hw8AAAAAAAAAAAAAAAIAAAAAAAAAAACAAYADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAB8A+P//////BwgDAAAAAAAAAAAAAAIAAAAAAAAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAADwA8P//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAOAPAAAAADgA8P//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AQAAAAAAAID/AAAAABwA8P//////DwAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADPAwAAAAAAAAD4HwAAAHgA+P//////DwAAAAAAAAAAADwAAAQAAAAAAAAAAAAAAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAHBwAAAAAAAAAAfwAAAOAA+P//////HwAAAAAAAAAAAA5ADAQAAAAAABAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABDgAAAAAAAAAA4AEAAMAB+P//////HwAAAAAAAACAAAZADAAAAAAAABgAAAAQAHwAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAHEAAAAAAAAAAwIcBAMAB+P//////HwAAAAAAAACAAQwIAAAAAAAAABAAAAAAADwAAP8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAcBwAPEAAAAAAAAAAAJ8ZAIAH/P//////PwAAAAAAAACAAA4YAAAAAAAAAAAAAAAAADwAwM8PAAAAAAAAAAAAAAAAAAAAAAAAAAAA8A8AMAAAAAAAAAAAADwIAAAP////////PwAAIAAAAAAAwA8AAAAAAAAAAAAAAAAAADwA+AEMAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AMAcAAAAAAAAAAAAPAAAAAO////////fwAA/AAAAAAAwAMAAAAAAAAAAAAAAAAAADwAfgAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAOABAACM////////fwAAfgAAAAAC4AEAAAAAAAAAAAAAAAAAAB4ADwAeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAIAHAAD8/////////4APBgAAAAD/fwAA+AAAAAAAAAAAAAAAAAwABwAOAAAAAAAAAADgAwAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAOAAD8/////////+PfBwAAAPj/PwAAPwAAAAAAAAAAAAAAABzwBwDuAQAAAAAAAADwDxwAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAcAADw///////////+BwAAwP+ZHQCADwAAAAAAAAAAAAAAADz+AwD8ewAAAAAAAAA4/v//AAAAAAAAAAAAAAAAwAMAAAAAAAAAAAD4AADw////////fz5+AAAA+N8DAADAAQAAAAAAAAAAAAAAABweAAA4/wAAAAAAAAAc+PP/AQAAAAAAAAAAAAAAgAMAAAAAAAAAAADwAADw//////8PfgQAAAAAPx0AAAD8AAAAAAAAAAAAAAAAABgHAAAAzgEAAAAAAAAOAACAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAADgAQDw//////8DAAAAMADAF/z4/9Y/AAAAAAAAAAAAAAAAANgDAAAAgAcAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAACABwDw//////8BAAAAAADwA/j///8DAAAAgAEAAAAAAAAAAPgDAAAAAA8AAAAAAMABAAAAAAAAAAAAAAAAAAAAAPACAAAAAAAAAAAAHgDw//////8BAAAAAO5wAMAPwP8AAAAAgAEAAAAAAAAAAPABAAAAAAwAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAPAHAAAAAAAAAAAAPADw//////8BAAAAgP84AAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAIAPAAAAAAAAAAAAMADw//////8BAAADwPs/EAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAJgAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAAAAAA4ADw//////8BAAAK4IEfGAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAPABAAAAAB4AAAIAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAwAHw//////8BAACI/wAHCAAAAAAAAAAAAAAAAADgAQAAAAAAAAAAAOAPAAAU4P8AAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAgAPw//////8BAACA/wAAAAAAwAMAAAAAAAAAAADgAwAAAAAAAAAAAAA/ALD//v8DAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAfw//////8BAADALwAAAAAAwAEAAAAAAAAAAADAAwAAAAAAAAAAAAA+AP7/P8ADAACAAQAA8AEAAAAAAAAAAADAAQAAAAAAAAAAAAbw//////8BAADgAQAAAAAAAAAAAAAAAAAAAAAAAwAAAEAAAAAAAABw4P+BBwAHAACAAQAA+AMAAAAAAAAAAADADwAAAAAAAAAAAAbw//////8BAAD4AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg+wEAAAAHAAABAAAAAAAAAAAAAAAAAAAA/gAAAAAAAAAAAAbw//////8BAAC8AAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAPwAAAAAGAIABAAAAAAAAAAAAAAAAAAAA8AMAAAAAAAAAAA7w//////8BAAAYAAAAALYBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAHAAAAAAAAAAAAAAAAAAAAAAAA4AcAAAAAAAAAAAzg//////8BAAAcAAAAjPkBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAzg//////8B4AAOAAAA+PiBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAzA//////8B4AAHAAAA8ACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAB+AAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAzA//////8B4AAHAAAI8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAD+AQAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAADyA//////8Q8PgDAAAA+P8AAjj3AwAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAACYAwAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAPgA//////8Q/v8BAAAAnv8Pgv//fwAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAMAB/v////8An38AQAAAD4APoP///38AAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAfgAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAAIAf/v////8AAwAA8ACnAwD+/wEA/P//BwAAAAAAAAAAAAAAAAAAAAAAGAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAOD/AAAAAAAAIAB//P////8AAwAA+Lf/AQD8fwAAAPD/HwAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AQAAAAAAIAD4/P////+BBwaAv9/5AAAADAAAAAA4PAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwBwACAAAAAADA+/////+B/w/gH/wBAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACADwAAAAAAAACA/////////x/wAHAAIAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAHwAAAAAAAAAA/v//////F/g+AAAAIAAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAA/P//////D/A/BgAAAAAAAAAAAAAAgAEAAAAAAAAAAAAAAAAAAAB8ABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAA+P//////D4ABBgAAAAAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAAAeADAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAPwAAAAAAAAAA+P//////BwAAAIAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAHBDAAgAAAAAAAAAAAgP8H4B8AAAAAAAAAAAAATwAAAAAAAAAA+P//////DwAAAPABAAMAAAAAAAAAwAIAAAAAAAAAAAAAAAAAAAADBgAAwAAAAAAAAAAAwP8P/v8BAAAAAAAAAAAA/AAAAAAAAAQA+P//////HwAAAPAAAAEQAAAAAAAAwAcAAAAAAAAAAAAAAAAAAIADAAIA2AAAAAAAAAAA8AD8P/A/AAAAAAAAAAAA+AEAAAAAAGwH+P//////PwAAwPAAAAAYAAAAAAAAgD8AAAAAAAAAAAAAAAAAAIADAAMCCAAAgAEAAAAAfADwEQD/AQAAAAAAAAAA8AH4OAAAAGAG+P//////PwAA8DEAAAAAAAAAAAAAAPw7AAAAAAAAAAAAAAAAAMADgADeAAAAgAEAAAAAHwBAAADgBwAAAAAAAAAA4IH//wEAAAAA+P//////PwAA8AMCAAAAAAAAAAAAAOQ/AAAAAAAAAAAAAAAAAIADAACYAAAAgAEAAACAAwAAAAAADwAAAAAAAAAAcMCf/wMAAAAA+P//////PwAA4AMaABgAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAMADAAAYAAAAiAEAAADAAQAAAAAADAAAAAAAAAAAcOABAA8AAAAA/P//////fwAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAMAAAADAAAAADgAAAAAAAAAAAAAAAAAAAA4HAAAB4ABgAA/P///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAMAAAADAAAAAAwAAAAAAAAAAAAAAAAAAAAgD8AADgAAAAA/v//////3wAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIABAAAYAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAD8AADAAAAAA/v//////3zkAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAMAAAAAQAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAA////////nz8AAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIMAAAAAAAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAAOABAACA////////Dx8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYOAAAADwAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAMAHAACA////////DwQAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAA4PAAAADwAwAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAAIA/AOCA////////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwH0AAAAAAwAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAB4AODA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAADgATDA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAOAAAAAAAAAAAEAAAAAAAAAAAAAAAADABxDA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgA8AAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHxDG////////DwAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAD4/wMAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAADAAAAAAAAAAAAA/ADG////////DwAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAD8/wAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAABAAAAAAAAAAAAA4AHA////////DwAAAAAAAAAA4AEAAAAAAAAADAAAAAAAAAAAAIBPAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAOA////////3wAAAAAAAAAA8AcAAAAAAAAACAAgAAAAAAAAAPAHAAAAAA4AAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcA/////////x8AAAAAAAD4Px8AAAAAAAAAGAAAAAAAAAAA8H8AAAAAAA4AAAAAAAABAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYA/////////38AAAAAAAD+HzwAAAAAAAAACAAAAAAAAAA48B8AAAAAAAAAAAAAAAADAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A////////D+ADAAAAAPAfAHAAAAAAAAAAAAAAAAAAALAfAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwA////////B+A/MAAAAPwDAHAAAAAAAAAAAAAAAAAAAPwHAAAAAAAAAAAAAAAAAAAMgAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgA/v//////BwB8cB4AAG4AAGAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAcwAMAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAOAD/P//////BwBo/T9w/AcAAOAAgAMAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAY8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAP/P//////BwDg33P4/wMAwMABzwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAe/v//////BwDAD+DfnwAAgMDf/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4////////BwCAA8CPAwAAAID/cwAAAAAAAAAAADgAAAAAAAAACAAAAAAAAAAAAADgGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw////////AwAIBwAAAAAAAADgAAAAAAAAAACA338AAAAAAAAAGAAAAAAAAAAAAADAHQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA////////HwAMDgAAAAAAAAAAAAAAAAAAAADA/y8AAAAAAAAAGAAAAIAB+H8AAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////AwAEnB8AAAAAAAAAAAAAAAAAAADwYA4AAAAAAAAAGAAAAAAAfB4AAAEABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////QwAAeD8AAAAAAAAAAAAAAAAAAAAAAAcAAAAAAHAAGAAAAAAADgAAAAEAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//////wwAA8PMLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABAAAAAAAABwAAAACAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////AwAA4OEfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////BwAA4IA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////BwAAwABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAgAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////DwAAwADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//////DwAAwADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB+AAA4AAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//////DwAAwAHACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPD/AwAwAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////HwAAwAGAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7DBwAAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////HwAAgAMAPwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwH8ABgAAAAAAAAAPAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////HwAAAAMA8H8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AMADgAAAAAAAMADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////DwCAgQMA4P8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAHAAAAAAAAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P//////BwCA8QEAAMADAAAAAAAAAAAAAAAAAAAAAAAAAID/DwAAGAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////AwCA+AAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAPD/DwAAOAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////AAAAOAAAAAAWAAAAAAAAAAAAAAAAAAAAAAAAAPjCAAAAcAAAAAAAsAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P////9/AAAAMAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAA4ABwjAAA/wMAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAA/v////8/AAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAwA8AACAAwAP8/gfA7wAAAAAA4AAAAAAAAAcAAAAAAAAAAAAAAAAAAAAA/v////8fAAAAAAAAAADgAQAAAAAAAAAAAAAAAAAAAAAAwAMAACAAgMfe/x/8AQAAAAAAYAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAA/v////8fAAAAAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAOfHh/9/AAAAAAAAAAAAAAAAAAAAAAAgAAEAAAAAAQAAAAAA/v////8fAAAAAAAAAAAA/wAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAPbHB/F/AAAAAAAAAAAAAAAAAAAAAAAwgAMAAAAAAQAAAAAA//////8fAAAAAAAAAAAAxgEAAAAAAAAAAAAAAAAAAAAAcAAAAAAAgP/DA+AEAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAHAAAAAA//////8/AAAAAAAAAAAQgAMAAAAAAAAAAAAAAAAAAAAAYAAAAAAA4B8AAAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAPABAAAA/v////9/AwAAAAAAANwBAAcAAAAAAAAAAAAAAAAAAAALeAAAAAAA/AAAAAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAMAHAAAA/P//////AgAAAAAAANwBAA4AAAAAAAAAAAAAAAAAAOB/fwAAAADwHwAAAAAAAAD+/wAACAAAAAAAAAAAAAAAAAAAAAAAAAAfAAAA/P//////AQAAAAAAAAAAABwAAAAAAAAAAAAAAAAAgPj/LwAAAAD9AwAAAAAAAPj//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAA/P//////AwAAAAAAAgAAAHgAAAAAAAAAAAAAgAEA4D/AAAAAAIA/AAAAAAAAAP4HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAA/P//////BwAAAAAAAwAAAOAAAAAAAAAAAAAAAAMA/g8AAAAAAPwHAAAAAAAAgG8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAA/P//////BwAAAAAAAQAAAOAAAAAAAAAAAAAAAAMAPAIAAAAAgH8AAAAAAAAA8AEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAQAA/v//////BwAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAwAcAAAAAAADg/wAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAACAAQAA/P//////BwAAAAAAAHAAAIAPAAAAAAAAAAAAAAAAMAAAAAAAwAMAAAAAAADwHwAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAACAAwAA+P//////BwAAAwAAAGAAAAAGAAAAAAAAAAAAAAAAcAAAAAAAgAcAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAgA8ABwAA+P//////BwAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAeAAAAAAAAA4AAAAAAOAfAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAwAcADgAA+P//////BwAAAAAAAAAAAADeyAAAAAAAAAAAAAAAUAAAAAAAAA4AAAAAAP4DAAAAAAAAAEBgAAAAAAAAAAAADAAAAAAAAAEADAAA/P//////BwAAAAAAAAAAAAD8/wcAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAD8AAAAAAAAAAMAAAAAAAAAAAAAADAAAAAAAAAAAHACA/P//////BwAAAAAAAAAAAACw/w/8wQEAAAAAAAAAAAAAAAAAgA8AAAAAgAMAAAAAAAAAIABwAAAAAAAAAAAADAAAAAAAAAAAOACA////////B0AIAAAAAADAAAAAAHz+/wMAAAAAAAAAAAAAAAAAwAcAAAAAwAEAAAAAAAAAIAD+AAAAAAAAAAAADAAAAAAAAAAA8AGA////////B8A4AAAAAADAAQAAAPgHfwcAAAAAAAAAAAAAAAAA4AAAAAAA4AAAAAAAAAAAAIAfAAAAAAAAAAAAHAAAAAAAAAAA4H8A////////BwAYAAAAAADAAAAAAOADMAYAAAAAAAAAAAAAAAAA4AAAAAAAcAAAAAAAAAAAAOADAAADAAAAAAAAGAAAAAAAAAAAAP7/////////E4EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAMAAAAAAAAACA9/8AAAADAAAAAAAAGAAAAAAAAAAAAMD/////////M4MABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAMAAIADPQAAAAAAIODh/z8AAAAAAAAAAAAAOAAAAAAAAAAAAACA////////AwEADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAMAAP//HwAAAAAA/v93HQAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA////////AwAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgQMAgP/8BwAAAID+/78/AAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA////////BwAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAEA4AEAAAAAAPj/AQAcAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAEAcAAAAAAAAPwDAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAA/v//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwCAAOAAAAAAAAA8AAAAAAAAAAAAAQAAAAAAAwAAAAAAAAAAAAAAA/v//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4PwBHAAAAAAA/gMAAAAAAAAAAAAA4AEAAAAAwAEAAAAAAAAAAAAA/v//////H2cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P8/PwAAAADA/wAAAAAAAAAAAAAA4AAAAAAAgAEAAAAAAAAAAAAA/v////////8ChgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Af/fwAAAADwAwAAAAAAAAAAAAAAAAAAAAAAwAEAAAAAAAAAAAAA/v////////8fgAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8ADg4QMAAAA4AAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA/P//////H/j/AwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAwA8AAAA+AAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA+P//////H8D8HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwAAAD4AAMB/AAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA+P//////H4APvwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAHwAAAHgAwPsDAAAAAAAAAAAAAAAAAAAAAAAAMAMAAAAAAAAAAAAA8P//////HwAA/icAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAQAAAOAA8H8AAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA/P//////HwAA/P/nP/D4EQAAAAAAAAAAAAAAAAAAAAAAAADgAQAAAMADfgcAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA+P//////HwAAAPr//P//fwAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAICPHwMAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAA+P//////HwAAAAI/4L9vfwAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAD+hwMAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAA+P//////HwAAAAAIQAQA6AAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAD4wAEAAAAAAABwAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAA+P//////PwAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAA4AAAAAAAAAB4AAAAAAAAAABwAAAADAAAAAAAAAAAAAAA/P//////PwAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAD8AAAADgAAAAAAAAAAAAAA////////fwAAAAAAAAAAgAcAAAAAAAAAAAAAAAAAAAAAAOAfAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAD/AQAADAAAAAAAAAAAAAAA/////////yAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAPgPAAAAAAAAMAAAAAAAAAAAAAAAAAAAwPCHAQAADAAAAAAAAAAAAAAA/////////yEAAAAAAAAAAP4AAAAAAAAAAAAAAAAAAAAAAPwAAAAAAAAAGAAAAAAAAAAAAAAAAAAA8P+BAQAADgAAAAAAAAAAAACA/////////wMAAAAAAAAAAPwDEAB4AAAAAAAAAAAAAAAAAM8AAAAAAAAAGAAAAAAAAAAAAAAAAAAA9z/AAQAADAAAAAAAAAAAAAAA/////////wcAAAAAAAAAAMD///3/AAAAAAAAAAAAAAAAmMMBAAAAAAAAGAAAAAAAAAAAAAAAAADwbwDgAAAAHAAAAAAAAAAAAAAA/////////wcAAAAAAAAAAAD////vAAAAAAAAAAAAAAAA/IMBAAAAAACAHwAAAAAAAAAAAAAAAAD4bwDwAAAAGAAAAAAAAAAAAACA/////////wcAAAAAAAAAAAA+gD/gAAAAAAAAAAAAAAAA/gAAAwAAAADADwAAAAAAAAAAAAAAAAA8fABwAAAAMAAAAAAAAAAAAADA/////////wcAAAAAAAAAAAAAAADADwAAAAAAAAAAAAAABwCCAwAAAADAAAAAAAAAAAAAAAAAAAAPuABwAAAAMAAAAAAAAAAAAAAA/////////wMAAAAAAAAAAAAAAACAHwAAAAAAAAAAAABgBwDiAAADAABgAAAAAAAAAAAAAAAAAAAHgAAwAAAAMAAAAAAAAAAAAACA/////////wMAAAAAAAAAAAAAAAAAPGA4AAAAAAAAAAD/AwAAAAADAABgAAAAAAAAAAAAAAAAAIADAAAwAAAAMAAAAAAAAAAAAACA/////////wMAAAAAAAAAAAAAAAAA8P//AGAAAAAAAOD/AQAAADwAAABwAAAAAAAAAAAAAAAAAIABAAAwAAAAMAAAAAAAAAAAAADg/////////wcAAAAAAAAAAAAAAAAA4P/v/8AHAAAAAPyIAAAAAAwAAAA6AAAAAAAAAAAAAAAAAMAAAACwAAAAMAAAAAAAAAAAAADw/////////wYAAAAAAAAAAAAAAAAAAP+n/+MPAAAAgD8IAAAAAAAAAAAfAAAAAAAAAAAAAAAAAPAAAACwAQAAMAAAAAAAAAAAAAD4/////////wAAAAAAAAAAAAAAAAAAAOQAeP/8BwAAwA8AAAAAAAAAAAAfAAAAAAAAAAAAAAAAAHgAAABwAADgGAAAAAAAAAAAAAD4////////fwAAAAAAAAAAAAAAAAAAAAAAAD/4DwAA4AcAAIABAAAAAAA/AAAAAAAAAAAAAAAAABwAAABwAADgHAAAMAAAAAAAAADw////////PwAAAAAAAAAAAAAAAAAAAAAAAACAfQAAfAAAAIABAAAAAAA4AAAAAAAAAAAAAAAAABwAAABwAAAIDiAAOAAAAAAAAADw////////DwAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAfwAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAABwAAADwAAAMB3AAHAAAAAAAAAD4////////BwAAAAAAAAAAAAAAAAAAAAAAAAAA4AfABwQAAAAAAAAAAAAeAAAAAAAAADAAAAAAAA8AAADwAACAA2AADwAAAAAAAAD4////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAgA/wGQQAAAAAAAAAAAAOAAAAAAAAAAAAAAAA+AcAAADgAQCAAQDABwAAAAAAAADw////////AwDAAQAAAAAAAAAAAAAAAAAAAAAAAP55AAAAAAAAAAAAAAAOAAAAAAAAAAAAwPzh/gEAAADgAwCAAQDAAQAAAAAAAADw////////AQDAAQAAAAAAAAgAAAAAAAAAAAAAAPgfAAAAAAAAAAAAAAAcAAAAAAAAAAAA+P//DwAAAADIBwCAAfzkAAAAAAAAAADA////////AQAAAAAAAAAAAAgAAAAAAAAAAAAAADgPAAAAAAAAAAAAAAD4BwAAAAAAAADA/wf/AwAAAADeDwDgAf9/ABgAAAAAAADA////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAADwDwAAAAAAAAD/PwQAAAAAAACAHQDggIc/AAAAAAAAAADA////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAABwAAAAAAAAHIAAAABgAPt/AAAAAAAAAACAOwDwzwEAAAAAAAAAAADA////////AAAAAAAAAOA/AAAAAAAAAAAAAAAAAAYAAAAAAABgAAAAOAABOIAAAAD88P8DAAAAAAAAAADAcQCw/wAAAAAAAAAAAAAA//////9/AAAAAIAAAP4fAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAA8AAAcAAAAAD//w8AAAAAAAAAAADg5ACwOQAAAAAAAAAAAAAA//////9/AAAAAMAAHz8YAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAwAwAYAAAgP/HDwAAAAAAAAAAAABgxgH4AAAAAAAAAAAAAADA//////8/AAAAAAAA/wcAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA4M4AAA/P8DAAAAAAAAAAAAAAAAgMMfAAAAAAAAAAAAAAAA//////8fAADAAEcA9wEAAAAeAAAAAAAAAAAAAAMAAAAAAAAAAAAAwAYAwAAA/ncAAAAAAAAAAAAAAOAPAOcPAAAAAAAAAAAAAAAg//////8fAADg////DwAAAAAfAAAAAAAAAAAAAAcAAAAAAAAAAAAAgACAwACA/wBgAAAAAAAAAAAAAOAPAH4AAAAAAAAAAAAAAADA//////8PAAD8//3/BwAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAgAHAPwBgAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAACA//////8PAAD//wP45xAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAABAPwBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA//////8PAID//x/+//8AAAAAAAAAAAAAAAAwAAMAAAAAAAAAAAAAAAAABAb4AAAAAAAAAAAAAAAAAAAgAAwAAAAAAAAAAAAAAADA//////8PAMCDwv2fH/8BAAAAAAAAAAAAAAAQgAMAAAAAAAAAAAAAHgAAggz8AQAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAADA//////8HAPAAAPADAIADAAAAAAAAAAAAAAAIgAEAAAAAAAAAAAAADgAAwxz8AAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAACA//////8HAH4AAAAAAIAHAAAAAAAAAAAAAAAPgAEAAAAAAABgAAAAAAAAADg8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA//////8H4K8BAAAAAAA+AAAAAAAAAAAAAMAPgAEAAAAAAAB4AAAAAAAAADA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+/////8H+YMBAAAAAMD8AwAAAAAAAAAAAIAAgAEAAAAAAAAIAAAAAAAAAHAcAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAA8P//////fwAAAAAAAODgDwAAAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAOAPAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAA+P//////HwAAAAAAAGAwPAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P////8HAAAAAIAAAAAAeAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAPADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P////8HAAAAAAAAAAAA4AEAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAHABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P////8HAAAAAAAAAAAAwwMAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAA4P////8HAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAA4P////8PAAAAAAAAAAIAAP4AAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAGAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE4P////8PAAAAAAAAAAAAAOAAAAAAAAAAAAAA3gEAAAAAAABAAAAAMAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM4P////8fAAAAAAAAAAAAAMADAAAAAAAAAAAAzgAAAAAAAADgAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAA8P////8fAAAAAAAAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAADAAAAAAAAAAAADAAwAAAAAAAAA4AAAAAAAAAAAAAAAA+P////8/AAAAAAAAAAAAAAAOAAAAAAAAAAAwAAAAAAAAAAB4AAAAAAAAAPAAAAAAAAAAAADwAwAAAAAAAAAwAAAAAAAAAAAAAAAA/P////9/AAAAAAAAAAAAAAAcAAAAAAAAAAAwAAAAAAAAAADwAAAAAAAAAOAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P////9/AAAAAAAAAAAAAAAcAAAAAAAAAAAQAAAAAAAAAADgAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////AAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAACgAQAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////AQAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAA+P//////AQAAAAAAAAAAAABgAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAA+P//////AwAAAAAAAAAAAABgAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAA8P//////BwAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAAAAA+P//////BwAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAA/P//////BwAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAA+P//////BwAAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAA+P//////BwAAAAAAAAAAAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////AwAAAAAAAAAAAQCAAwAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAGAAAABwAAAAAAAAMAAAAAAAAAAAAAAAAADAAAAAAA/P//////AQAAABgAAAAAAQAAAwAAAAAAAAAAAAAAAADADAAA+B8AAAAAAAAHAACABwAAAAAgAAAAAAAAAAAAAAAAAAAADAAAAAAA/v//////AQAAABAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAA8B8AAAAAAIADAAAABwAAAABgAAAAAAAAAAAAAAAAAAAADgAAAAAA/v//////AAAAAAAAAAAAAAAAAAAA8AMAAAAAAAAAAAAAAAAAwAMAAAAAAAAHAAAADgAAAABgAAAAAAAAAAAAAAAAAAAADAAAAAAA/v//////AAAAAAAAAAAAAAAAAAYAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAHgAAAAB4AAAAAAAAAAAAAAAAAAAAHAAAAACA////////AQAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAADgAAAABwAAAAAAAAAAAAAAAAAAAAOAAAAACA////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAACA////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAACAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAA////////AwAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAABAAAAAAAGIAACAAAAACAAAAPgAAAABAAAAAAAQAAAAAAAAAAAAAcAAAAAAA////////AwAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAABAAAAAwAAAAAGB/AMAHAAAAAAAAAABAAAAAAAwAAAAAAAAIAAAA4AAAAAAA/P//////BwAAAAAAAAAAAAAAAAAAAAAAGEAAAAAAAAAAAAAgAAAAAAB+AMADAAAAAAAAAAAAAAAAAAwAAAAAAAAcAAAAwAAAAAAA+P//////BwAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAwAAAAAAAAPAAAAwAEAAAAA4P//////DwAAAAAAAAAAAAAAAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAEAAAAAAAAAAAAOAAAAgAMAAAAA4P//////DwAAAAAAAAAACAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAMAAAAAwP//////DwAAAAAAAAAADgAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAMAAAAAwP//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAABAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMA4B8AgP//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAEA8P8HgP//////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAgAGAP/APgP//////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAADAABAAAAAgAOADwAcAP//////BwAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAfgAAA4AP//////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAABgAAADMAAAAAAAAAAAAAAAAAAHAAAAAAAAAP5/AAAwAP7/////AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPw/AAAwAP7/////AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAP7/////AwAAAAAAAAAAQAAHAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAADAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAADgAP//////AwAAAAAAAAAAYAAEAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAABwAAQAAAADAAAAAAAAAAAAAEAAAAAwAAAAAAAADAAP//////AwAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAADgAAAAAAAAAAAAAAAABgAAQAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAACAg///////BwAAAAAAAAAAAAAAAAAAAAAAgAMAAAAAAADwAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAA////////BwAAAAAAAAAAAAAAAAAAAAAA+AMAAAAAAABwAAAAAAAAAAAAAGwAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////BwAAAAAAAAAAAAAAAADgAQAA8AAAAAAAAAAwAAAAAAAAAAAAgP8BAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////BwAAAAAAAAAAAAAAAADwAQAAIAAAAAAAAAAwAAAAAAAAAAAA8P8BBgAAgAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAA8P//////hwAAwP8HAAAAAAAAAAAAAAAAAAAAAAAgAAD8AQAAAMABgAAA/v/vDwAAwAcAAAAADAAAAAAAAAAAAAAA4P8AAAAAgBkA/P//////+wcA+P8fAAAAAAAAAAAAAAAAADAAAAD8AMD//wEAAPj//w8A/v//HwAA4N8PAAAAPCAAAMD/k4N+AAD8//8fAAAAwP8A/v/////////9//9/AAAAAAAAAAAAAADwATAAAAD/B/7///+wCfz//z/g////PwAA/P+fAwAA//0AAP7//9//APj///9/AAAA4P9/////////////////AQAAAACAAAAAAAD8MDDAB4D////////9j////////////wHA////lwMS//9/AP//////v///////AQDA////////////////////DwAAAADo7wAAAAD4/zn8//z/////////7////////////3///////5ff////////////////////HwD8////////////////////XwAAAAD+/z8AAAD8//////////////////////////////////////////////////////////////3/////////////////////fziAg/z//38AAGD////////////////////////////////////////////////////////////////////////////////////////f///////xA/z////////////////////////////////////////////////////////////////////////////////////////////////9D/7/////////////////////////////////////////////////////////////////////////////////////////////////v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////";
const WATER_MASK = (() => {
  const bin = atob(WATER_MASK_B64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
})();
// null — точка вне запечённой области (мир игры шире зафиксированного региона):
// там настоящих данных просто нет, и вызывающий откатывается на процедурную
// формулу, как было всегда.
function maskWaterAt(x, y) {
  const px = Math.floor((x + 0.5 + WATER_MASK_HALF_X) / WATER_MASK_STEP);
  const py = Math.floor((y + 0.5 + WATER_MASK_HALF_Z) / WATER_MASK_STEP);
  if (px < 0 || py < 0 || px >= WATER_MASK_W || py >= WATER_MASK_H) return null;
  const i = py * WATER_MASK_W + px;
  return ((WATER_MASK[i >> 3] >> (i & 7)) & 1) === 1;
}
function isRealWater(x, y) {
  const m = maskWaterAt(x, y);
  if (m !== null) return m;
  return rwHeightAt(x + 0.5, y + 0.5) < RW_SEA;
}
// Крутизна рельефа под точкой/лагерем — раньше здесь проверялась только
// вода, крутизна соседнего рельефа — никак (тот же пробел, что и в
// index.html до этого коммита, см. её комментарий у isTooSteep: "не должны
// появляться на неровных поверхностях"). STEEP_SAMPLE_R/STEEP_MAX_RISE —
// те же значения, что и в index.html (держать в синхроне вручную, как и
// остальной этот блок рельефа — см. заголовок файла про самодостаточные
// копии). Процедурный rwHeightAt — единственный источник рельефа здесь (в
// отличие от клиента mp-join не подгружает 5.76МБ настоящих данных высот),
// тот же уровень честного упрощения, что уже был у isRealWater.
const STEEP_SAMPLE_R = 3, STEEP_MAX_RISE = 0.11;
function isTooSteep(x, y) {
  const cx = x + 0.5, cy = y + 0.5;
  const c = rwHeightAt(cx, cy);
  const d1 = Math.abs(rwHeightAt(cx + STEEP_SAMPLE_R, cy) - c);
  const d2 = Math.abs(rwHeightAt(cx - STEEP_SAMPLE_R, cy) - c);
  const d3 = Math.abs(rwHeightAt(cx, cy + STEEP_SAMPLE_R) - c);
  const d4 = Math.abs(rwHeightAt(cx, cy - STEEP_SAMPLE_R) - c);
  return Math.max(d1, d2, d3, d4) > STEEP_MAX_RISE;
}

// Простой поиск свободного места на условной решётке мира — не копия
// findFreeCellInChunk/MIN_STRUCT_GAP из index.html (та логика заточена под
// плотную карту узлов/лагерей одного браузера), здесь городов в общем мире
// будет заведомо меньше и достаточно грубой проверки минимального
// расстояния между СТОЛИЦАМИ, чтобы новый игрок не встал вплотную к чужой.
// isRealWater добавлена Фазой 12 — раньше проверялось только расстояние.
// Минимальный зазор между ЛЮБЫМИ двумя объектами мира — точками ресурсов,
// лагерями/фортами варваров и замками правителей. По прямой просьбе автора:
// «между ними расстояние должно быть минимум в 30 клеток и это реально
// минимум». Раньше здесь стояло 6 и проверялось только между клетками
// map_cells (точка-точка, лагерь-лагерь) — замки в проверку не входили
// ВООБЩЕ, поэтому точка могла сесть вплотную к чужой столице.
const MIN_STRUCT_GAP = 30;
const MIN_CITY_GAP = 40;
// cells — точки/лагеря/форты мира: замок нового игрока обязан соблюдать общий
// минимум MIN_STRUCT_GAP и от них тоже, иначе столица садилась бы прямо на
// чужую жилу (проверка раньше знала только про другие ЗАМКИ, MIN_CITY_GAP).
// MIN_CITY_GAP между столицами оставлен как был (40 > 30, свой смысл — не
// теснить игроков друг к другу), это не минимум наложения, а расселение.
function pickSpawn(existing, cells) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ring = 50 + Math.floor(attempt / 10) * 30;
    const x = Math.round((Math.random() * 2 - 1) * ring);
    const y = Math.round((Math.random() * 2 - 1) * ring);
    if (isRealWater(x, y)) continue;
    if (isTooSteep(x, y)) continue;
    const ok = existing.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN_CITY_GAP)
      && (cells || []).every((c) => Math.hypot(c.x - x, c.y - y) >= MIN_STRUCT_GAP);
    if (ok) return { x, y };
  }
  // 200 попыток по воде и соседям не нашли места — тот же честный отказ от
  // проверки водой, что и раньше был у самой функции целиком: лучше
  // редчайший город в море, чем игрок, которому вообще не дали войти.
  return { x: Math.round(Math.random() * 400 - 200), y: Math.round(Math.random() * 400 - 200) };
}

// Фаза 8, кусочек 1 — точки сбора ресурсов (map_cells, t:"node"). Таблица
// map_cells существует с самой первой миграции (0001) — заведена "на
// вырост", под именно узлы сбора и лагеря/форты разбойников (см. её
// комментарий), просто до сих пор никто в неё не писал. Честное упрощение:
// вместо hash-детерминированной плотности по всей бескрайней карте
// (nodeLevelAt/findFreeCellInChunk, index.html:2968/3103 — заточены под
// чанки одного браузера) — небольшое кольцо узлов вокруг КАЖДОГО нового
// города, только при первом создании игрока (не на каждый join/опрос).
// upsert с ignoreDuplicates — если чьё-то кольцо случайно перекроет чужое
// (или повторный вызов из-за retry), лишняя запись просто не создаётся,
// без падения на конфликте первичного ключа.
// Кольцо 8..25 вокруг нового города physически несовместимо с зазором в 30
// клеток от самого этого города: ВСЁ кольцо ближе минимума, ни одна точка не
// разместилась бы. Кольцо сдвинуто наружу ровно настолько, чтобы начаться с
// самого зазора, ШИРИНА кольца сохранена прежней (было 8..25 — ширина 17,
// стало 30..47). Это единственное место, где пришлось тронуть верхнюю
// границу, и только потому, что иначе арифметика не сходится.
const NODE_SEED_COUNT = 5, NODE_SEED_MIN_R = MIN_STRUCT_GAP, NODE_SEED_MAX_R = MIN_STRUCT_GAP + 17;
// SEED_WATER_TRIES — Фаза 12: точка/лагерь пересеивается в воду до 8 раз
// (тот же приём, что и у pickSpawn выше), последняя попытка кладётся как
// есть без проверки — честный редкий отказ вместо риска зациклиться в
// сильно "морском" кольце. Теперь тем же счётчиком попыток пересеивается и
// от крутого рельефа, и от соседних точек/лагерей (см. ниже) — раньше
// проверялась только вода, а точки/лагеря общего мира могли лечь на склон
// горы или буквально друг в друга (см. комментарий у MIN_STRUCT_GAP ниже).
// С зазором в 30 клеток восьми бросков по узкому кольцу мало: попытки часто
// попадают в зону уже занятых объектов, и точка не размещалась бы вовсе.
// Проверки теперь чисто в памяти (соседи выбраны ОДНИМ запросом заранее, см.
// fetchNearby ниже), так что попытки дёшевы. Начиная с SEED_SPREAD_AFTER-й
// попытки кольцо расширяется — чтобы в плотно занятой округе было куда уйти,
// а не упереться и положить объект вплотную к соседу.
// SEED_MAX_SPREAD — потолок расширения кольца. Он ОБЯЗАН согласовываться с
// окном выборки соседей (pad ниже): если попытка уходит дальше окна, соседи
// там просто не выбраны и зазор тихо не проверяется — на симуляции 25 входов
// это давало 14 пар ближе минимума (худшая 8.5 клетки) при формально
// включённой проверке. Держать эти две величины в согласии вручную.
const SEED_WATER_TRIES = 24, SEED_SPREAD_AFTER = 6, SEED_MAX_SPREAD = 2;
// Зазор между точками/лагерями общего мира — мягче, чем MIN_STRUCT_GAP=20 в
// index.html (там плотная одиночная карта с полным перебором чанка; тут
// сеть — каждая проверка это отдельный запрос к БД, дороже держать строгим).
// Раньше зазора не было ВООБЩЕ: upsert с ignoreDuplicates спасал только от
// ТОЧНОГО совпадения координат — два узла в 1-2 клетках друг от друга
// прекрасно уживались (в 3D выглядело бы как модели, вросшие друг в друга).
// Соседние клетки читаются ОДИН раз на вызов seedNodesAround/seedCampsAround
// (не на каждую точку) — pad с запасом покрывает оба кольца (узлы и
// лагеря делят один и тот же радиус 8..25), avoid пополняется на лету
// уже размещёнными в ЭТОМ вызове точками, чтобы монеты в одной пачке тоже
// не легли друг на друга.
// ВСЕ соседи в округе — и клетки карты (точки/лагеря/форты), и ЗАМКИ игроков.
// Замков тут раньше не было вовсе: зазор считался только между записями
// map_cells, поэтому точка ресурсов могла сесть вплотную к чужой столице —
// ровно то наложение, на которое пожаловался автор. Оба списка приводятся к
// одной форме {x,y} и дальше неразличимы: минимум в 30 клеток общий для всех
// пар объектов, без исключений.
async function fetchNearby(admin, worldId, cx, cy, pad) {
  const [cells, players] = await Promise.all([
    admin.from("map_cells").select("x,y").eq("world_id", worldId)
      .gte("x", cx - pad).lte("x", cx + pad).gte("y", cy - pad).lte("y", cy + pad),
    admin.from("players").select("x,y").eq("world_id", worldId)
      .gte("x", cx - pad).lte("x", cx + pad).gte("y", cy - pad).lte("y", cy + pad),
  ]);
  if (cells.error) throw cells.error;
  if (players.error) throw players.error;
  return [...(cells.data || []), ...(players.data || [])];
}
function tooCloseToAny(cells, x, y, gap) {
  for (const c of cells) if (Math.hypot(c.x - x, c.y - y) < gap) return true;
  return false;
}
// origin — центр кольца (замок новичка). Он сам обязан соблюдать тот же
// зазор, даже если по какой-то причине не попал в выборку соседей выше.
function seedPoint(cx, cy, minR, maxR, avoid) {
  let x, y;
  for (let t = 0; t < SEED_WATER_TRIES; t++) {
    // После SEED_SPREAD_AFTER неудач кольцо расширяется — в плотно занятой
    // округе иначе некуда уйти и объект лёг бы вплотную к соседу.
    const spread = Math.min(SEED_MAX_SPREAD, t < SEED_SPREAD_AFTER ? 1 : 1 + (t - SEED_SPREAD_AFTER) * 0.35);
    const ang = Math.random() * Math.PI * 2;
    const r = (minR + Math.random() * (maxR - minR)) * spread;
    x = Math.round(cx + Math.cos(ang) * r); y = Math.round(cy + Math.sin(ang) * r);
    if (isRealWater(x, y)) continue;
    if (isTooSteep(x, y)) continue;
    if (Math.hypot(x - cx, y - cy) < MIN_STRUCT_GAP) continue; // зазор от собственного замка
    if (tooCloseToAny(avoid, x, y, MIN_STRUCT_GAP)) continue;
    return { x, y };
  }
  return null; // места нет — честнее не создать объект, чем поставить его внахлёст
}
async function seedNodesAround(admin, worldId, cx, cy, avoid) {
  const rows = [];
  for (let i = 0; i < NODE_SEED_COUNT; i++) {
    const spot = seedPoint(cx, cy, NODE_SEED_MIN_R, NODE_SEED_MAX_R, avoid);
    if (!spot) continue;   // место не нашлось — пропускаем, а не кладём внахлёст
    const { x, y } = spot;
    avoid.push({ x, y }); // следующая точка этой же пачки уже не ляжет вплотную
    const lv = 1 + Math.floor(Math.random() * 3); // 1..3 — новичкам не нужны жилы 5 уровня под боком
    const { res, amount } = pickNodeResAndAmount(lv); // index.html:3111/3344 (EV.nodeback/ensureChunkContent) — те же формулы
    rows.push({ world_id: worldId, x, y, t: "node", data: { res, lv, amount, max: amount } });
  }
  if (!rows.length) return;   // всё кольцо занято/в воде — сеять нечего
  // ignoreDuplicates: true = ON CONFLICT DO NOTHING на (world_id,x,y) —
  // ошибка изредка возможной коллизии координат никого не должна ронять.
  const { error } = await admin.from("map_cells").upsert(rows, { onConflict: "world_id,x,y", ignoreDuplicates: true });
  if (error) throw error; // не критично для самого mp-join, но лучше видеть в логах, если формат данных разъехался
}

// Фаза 8, кусочек 2 — лагеря варваров (map_cells, t:"camp"). Тот же приём,
// что и seedNodesAround, отдельным кольцом — лагерей на карте одиночной
// игры заметно меньше, чем точек сбора (NODE_CHUNK_CHANCE/CAMP_CHUNK_CHANCE
// = 22/13, index.html:3156), тот же порядок и здесь (5 узлов / 3 лагеря).
// Уровень 1..5 (не 1..3, как у узлов) — новичку нужно во что расти, но
// campRawAt-хэш-плотность (index.html:2974) с самой первой минуты партии
// заточена под уже освоенную карту, а не под спавн, поэтому тот же честный
// разброс "случайный уровень в разумных пределах", что и у узлов.
const CAMP_SEED_COUNT = 3, CAMP_SEED_MIN_R = MIN_STRUCT_GAP, CAMP_SEED_MAX_R = MIN_STRUCT_GAP + 17; // см. кольцо узлов выше — та же причина сдвига
async function seedCampsAround(admin, worldId, cx, cy, avoid) {
  const rows = [];
  for (let i = 0; i < CAMP_SEED_COUNT; i++) {
    const spot = seedPoint(cx, cy, CAMP_SEED_MIN_R, CAMP_SEED_MAX_R, avoid);
    if (!spot) continue;   // см. сеятель узлов выше
    const { x, y } = spot;
    avoid.push({ x, y });
    const lv = 1 + Math.floor(Math.random() * 5); // 1..5 — уровни 15+ (форт) новичку рядом не нужны
    rows.push({ world_id: worldId, x, y, t: "camp", data: { lv } });
  }
  if (!rows.length) return;   // см. сеятель узлов выше
  const { error } = await admin.from("map_cells").upsert(rows, { onConflict: "world_id,x,y", ignoreDuplicates: true });
  if (error) throw error;
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
    if (userErr || !user) return jsonResponse({ err: "Не авторизован — нужен anon-вход Supabase Auth" }, 401);

    let body = {};
    try { body = await req.json(); } catch (_) { /* пустое тело — ок для повторного join */ }
    const race = RACES.includes(body.race) ? body.race : null;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Один общий мир на всё время (см. миграцию 0001) — берём самый старый,
    // а если ни одного ещё нет, заводим первый.
    let { data: world, error: wErr } = await admin
      .from("worlds").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr) return jsonResponse({ err: wErr.message }, 500);
    if (!world) {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const ins = await admin.from("worlds").insert({ seed }).select().single();
      if (ins.error) return jsonResponse({ err: ins.error.message }, 500);
      world = ins.data;
      // Фаза 15 — фоновый respawn точек/лагерей (не по истощению, см.
      // applyAmbientSeed в mp-tick/index.js): самоподдерживающаяся цепочка
      // событий, заводится ровно один раз — при создании мира. Существующий
      // на сегодня мир (создан до этой правки) сюда не попадёт — для него
      // цепочку заводит миграция 0003_faster_tick.sql отдельной строкой.
      try {
        await admin.from("events").insert({
          world_id: world.id, fire_at: new Date().toISOString(), type: "ambient_seed", data: {},
        });
      } catch (_) { /* не критично — цепочка respawn'а просто не начнётся сама, можно завести вручную */ }
    }

    const nowSec = Date.now() / 1000;

    // Толкаем тикер ДО чтения существующего игрока — тогда сам select ниже
    // уже увидит только что применённый результат (новый уровень здания,
    // исход боя), а не то, что было секунду назад. См. triggerTick() выше.
    await triggerTick(SUPABASE_URL);

    // Уже есть игрок этого uid в этом мире — вернуть его (идемпотентный
    // join), но сперва досчитать добычу ресурсов по прошедшему времени —
    // mp-join это ещё и опрос вкладки "Общий мир" раз в 5с, ресурсы должны
    // быть свежими на каждый такой вызов, а не только на настоящих действиях.
    const existing = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (existing.error) return jsonResponse({ err: existing.error.message }, 500);
    if (existing.data) {
      // Фаза 30 — правитель погиб (см. markRulerFallen в mp-tick). Строка
      // ещё жива и помечена dead_at ровно затем, чтобы игрок увидел экран
      // гибели, а не пустую регистрацию, — но начислять павшему добычу,
      // достраивать ему layout и вообще что-либо писать в его строку не
      // нужно и вредно. Отдаём как есть: клиент по dead_at сам покажет
      // экран гибели, а стирание случится по кнопке (mp-restart).
      if (existing.data.dead_at) {
        return jsonResponse({ ok: true, world_id: world.id, player: existing.data });
      }
      const st = existing.data.state;
      // Самоисцеление легаси-записей, заведённых до Фазы 6 (race тогда не
      // дублировалась в state) — см. комментарий в newPlayerState выше.
      st.race = st.race || existing.data.race;
      // Самоисцеление ещё одного пробела: newPlayerState's BKEYS не
      // включает forge/portal (участок под них заводится только при
      // реальной стройке, см. buildLv/buildLvAt в mp-build) — st.b.forge/
      // st.b.portal были ровно undefined, а не 0, у игроков, ещё их не
      // построивших. Клиентский mpPower()/mpCellPanelHtml (index.html)
      // из-за этого падали на undefined.power внутри buildingPower() —
      // автор сообщил "нет аватарки/мощи, меню как будто не дорисовывается"
      // (mpRenderTop() рвался посередине, а mpRerender() без try/catch
      // тянул этот обрыв дальше по всей цепочке опроса). Клиент починен
      // отдельно (||0 везде, где раньше читали st.b[...] напрямую), но
      // лучше не оставлять исходную причину только на клиентской защите —
      // самоисцеляем и здесь, разом на будущее для любого другого кода,
      // который тоже может забыть про ||0.
      // Та же самоисцеляющая причина, что и у forge/portal чуть выше —
      // Рынок/Центр Альянса тоже не входят в newPlayerState's BKEYS.
      if (st.b) { st.b.forge = st.b.forge || 0; st.b.portal = st.b.portal || 0; st.b.market = st.b.market || 0; st.b.alliance = st.b.alliance || 0; }
      if (st.b) ensureLayout(st);
      syncRes(st, nowSec);
      // Фаза 31 — мощь державы. mp-join дёргается клиентом на КАЖДОМ
      // пятисекундном опросе, то есть это самая частая точка в игре, где
      // состояние игрока уже перечитано и вот-вот будет записано, — дешевле
      // места для пересчёта нет. Колонка players.power до сих пор стояла
      // нулём с самой первой миграции; по ней пойдут рейтинги, поэтому
      // считает её сервер, а не клиент, который мог бы назвать любое число.
      // Отряды в поле — отдельным запросом: их войска вычтены из st.troops
      // ещё на отправке (mp-attack/mp-gather), и без них мощь проваливалась
      // бы на всё время каждого похода.
      const marchRows = await admin.from("marches").select("units").eq("player_id", existing.data.id);
      if (marchRows.error) return jsonResponse({ err: marchRows.error.message }, 500);
      const pw = applyPower(st, null, (marchRows.data || []).map((r) => r.units));
      // Эта запись — самая частая в игре: клиент дёргает mp-join на КАЖДОМ
      // пятисекундном опросе. Именно она чаще всего и затирала чужие правки
      // (см. подробности у savePlayerState выше): пока mp-join считал
      // начисление добычи, игрок успевал что-то построить или нанять — и
      // запись mp-join, собранная из состояния ДО действия, стирала его.
      // Теперь пишем только если строку никто не трогал.
      //
      // Проигранная гонка тут не ошибка и не повод просить повтор:
      // начисление добычи считается от st.resAt (см. syncRes), то есть тот,
      // кто выиграл гонку, начислил ровно то же самое сам. Достаточно
      // перечитать строку и вернуть её свежую — игрок получит актуальное
      // состояние, включая своё только что применённое действие.
      const savedJoin = await savePlayerState(admin, existing.data, st, pw);
      if (savedJoin.error) return jsonResponse({ err: savedJoin.error.message }, 500);
      if (savedJoin.conflict) {
        const again = await admin.from("players").select("*").eq("id", existing.data.id).maybeSingle();
        if (again.error) return jsonResponse({ err: again.error.message }, 500);
        return jsonResponse({ ok: true, world_id: world.id, player: again.data });
      }
      // Записалось — отдаём ту же строку с уже применённым st, без ещё
      // одного запроса к базе: savePlayerState обновил existing.data.updated_at,
      // а state у нас и так на руках. Раньше здесь был update().select(),
      // то есть лишний обратный рейс на каждом пятисекундном опросе каждого
      // игрока.
      existing.data.state = st;
      return jsonResponse({ ok: true, world_id: world.id, player: existing.data });
    }

    if (!race) return jsonResponse({ err: "Нужна раса: human|dwarf|elf|undead" }, 400);

    const allPlayers = await admin.from("players").select("x,y").eq("world_id", world.id);
    if (allPlayers.error) return jsonResponse({ err: allPlayers.error.message }, 500);
    // Все клетки мира разом: их немного по построению (потолок ambient-подсева
    // в mp-tick — max(20, игроков×3) узлов и max(10, игроков×1.5) лагерей),
    // выбрать целиком дешевле, чем угадывать окно вокруг ещё не выбранного места.
    const allCells = await admin.from("map_cells").select("x,y").eq("world_id", world.id);
    const { x, y } = pickSpawn(allPlayers.data || [], allCells.data || []);

    // Фаза 31 — мощь новичка известна сразу, ждать первого опроса незачем:
    // и колонка, и высшая мощь заполняются прямо на вставке.
    const newState = newPlayerState(race, nowSec);
    const newPower = powerOf(newState, []);
    newState.peakPower = newPower;
    const ins = await admin.from("players").insert({
      world_id: world.id, auth_uid: user.id, is_bot: false, race,
      nick: typeof body.nick === "string" ? body.nick.slice(0, 40) : "",
      x, y, state: newState, power: newPower,
    }).select().single();
    if (ins.error) return jsonResponse({ err: ins.error.message }, 500);

    // Фаза 8, кусочек 1 — только при создании НОВОГО игрока, не на каждый
    // повторный join/опрос (см. seedNodesAround выше). Ошибка сева узлов не
    // должна ронять сам вход игрока — он уже создан, точки сбора можно
    // досеять и позже, поэтому не return jsonResponse на исключении.
    // avoid — уже существующие в округе точки/лагеря (запрошены ОДИН раз на
    // оба кольца, см. fetchNearby) плюс всё, что размещает сам этот
    // вызов — seedNodesAround/seedCampsAround делят один и тот же массив,
    // поэтому узлы и лагеря не садятся друг в друга даже между собой.
    let avoid = [];
    try { avoid = await fetchNearby(admin, world.id, x, y, Math.max(NODE_SEED_MAX_R, CAMP_SEED_MAX_R) * SEED_MAX_SPREAD + MIN_STRUCT_GAP); } catch (_) { /* без соседей — сеем как есть, тот же честный отказ */ }
    try { await seedNodesAround(admin, world.id, x, y, avoid); } catch (_) { /* см. комментарий */ }
    try { await seedCampsAround(admin, world.id, x, y, avoid); } catch (_) { /* см. тот же комментарий */ }

    return jsonResponse({ ok: true, world_id: world.id, player: ins.data });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
