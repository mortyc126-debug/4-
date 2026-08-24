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
    // Очки убийств (RoK), index.html addKillPoints — начисляются mp-tick'ом
    // в finalizePvpBattle/finalizeNodeBattle, НЕ в finalizeRaidBattle (PvE
    // не в зачёт). kpByTier — разбивка по тирам Т1-Т5 для профиля.
    kp: 0, kpByTier: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
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
function isRealWater(x, y) { return rwHeightAt(x + 0.5, y + 0.5) < RW_SEA; }
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
const MIN_CITY_GAP = 40;
function pickSpawn(existing) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const ring = 50 + Math.floor(attempt / 10) * 30;
    const x = Math.round((Math.random() * 2 - 1) * ring);
    const y = Math.round((Math.random() * 2 - 1) * ring);
    if (isRealWater(x, y)) continue;
    const ok = existing.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN_CITY_GAP);
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
const NODE_SEED_COUNT = 5, NODE_SEED_MIN_R = 8, NODE_SEED_MAX_R = 25;
// SEED_WATER_TRIES — Фаза 12: точка/лагерь пересеивается в воду до 8 раз
// (тот же приём, что и у pickSpawn выше), последняя попытка кладётся как
// есть без проверки — честный редкий отказ вместо риска зациклиться в
// сильно "морском" кольце. Теперь тем же счётчиком попыток пересеивается и
// от крутого рельефа, и от соседних точек/лагерей (см. ниже) — раньше
// проверялась только вода, а точки/лагеря общего мира могли лечь на склон
// горы или буквально друг в друга (см. комментарий у MIN_STRUCT_GAP ниже).
const SEED_WATER_TRIES = 8;
// Зазор между точками/лагерями общего мира — мягче, чем MIN_STRUCT_GAP=20 в
// index.html (там плотная одиночная карта с полным перебором чанка; тут
// сеть — каждая проверка это отдельный запрос к БД, дороже держать строгим).
// Раньше зазора не было ВООБЩЕ: upsert с ignoreDuplicates спасал только от
// ТОЧНОГО совпадения координат — два узла в 1-2 клетках друг от друга
// прекрасно уживались (в 3D выглядело бы как модели, вросшие друг в друга).
const MIN_STRUCT_GAP = 6;
// Соседние клетки читаются ОДИН раз на вызов seedNodesAround/seedCampsAround
// (не на каждую точку) — pad с запасом покрывает оба кольца (узлы и
// лагеря делят один и тот же радиус 8..25), avoid пополняется на лету
// уже размещёнными в ЭТОМ вызове точками, чтобы монеты в одной пачке тоже
// не легли друг на друга.
async function fetchNearbyCells(admin, worldId, cx, cy, pad) {
  const { data, error } = await admin.from("map_cells").select("x,y")
    .eq("world_id", worldId)
    .gte("x", cx - pad).lte("x", cx + pad)
    .gte("y", cy - pad).lte("y", cy + pad);
  if (error) throw error;
  return data || [];
}
function tooCloseToAny(cells, x, y, gap) {
  for (const c of cells) if (Math.hypot(c.x - x, c.y - y) < gap) return true;
  return false;
}
function seedPoint(cx, cy, minR, maxR, avoid) {
  let x, y;
  for (let t = 0; t < SEED_WATER_TRIES; t++) {
    const ang = Math.random() * Math.PI * 2;
    const r = minR + Math.random() * (maxR - minR);
    x = Math.round(cx + Math.cos(ang) * r); y = Math.round(cy + Math.sin(ang) * r);
    if (isRealWater(x, y)) continue;
    if (isTooSteep(x, y)) continue;
    if (tooCloseToAny(avoid, x, y, MIN_STRUCT_GAP)) continue;
    return { x, y };
  }
  return { x, y }; // честный редкий отказ — тот же принцип, что и раньше у воды
}
async function seedNodesAround(admin, worldId, cx, cy, avoid) {
  const rows = [];
  for (let i = 0; i < NODE_SEED_COUNT; i++) {
    const { x, y } = seedPoint(cx, cy, NODE_SEED_MIN_R, NODE_SEED_MAX_R, avoid);
    avoid.push({ x, y }); // следующая точка этой же пачки уже не ляжет вплотную
    const lv = 1 + Math.floor(Math.random() * 3); // 1..3 — новичкам не нужны жилы 5 уровня под боком
    const { res, amount } = pickNodeResAndAmount(lv); // index.html:3111/3344 (EV.nodeback/ensureChunkContent) — те же формулы
    rows.push({ world_id: worldId, x, y, t: "node", data: { res, lv, amount, max: amount } });
  }
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
const CAMP_SEED_COUNT = 3, CAMP_SEED_MIN_R = 8, CAMP_SEED_MAX_R = 25;
async function seedCampsAround(admin, worldId, cx, cy, avoid) {
  const rows = [];
  for (let i = 0; i < CAMP_SEED_COUNT; i++) {
    const { x, y } = seedPoint(cx, cy, CAMP_SEED_MIN_R, CAMP_SEED_MAX_R, avoid);
    avoid.push({ x, y });
    const lv = 1 + Math.floor(Math.random() * 5); // 1..5 — уровни 15+ (форт) новичку рядом не нужны
    rows.push({ world_id: worldId, x, y, t: "camp", data: { lv } });
  }
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
      const savedJoin = await savePlayerState(admin, existing.data, st);
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
    const { x, y } = pickSpawn(allPlayers.data || []);

    const ins = await admin.from("players").insert({
      world_id: world.id, auth_uid: user.id, is_bot: false, race,
      nick: typeof body.nick === "string" ? body.nick.slice(0, 40) : "",
      x, y, state: newPlayerState(race, nowSec),
    }).select().single();
    if (ins.error) return jsonResponse({ err: ins.error.message }, 500);

    // Фаза 8, кусочек 1 — только при создании НОВОГО игрока, не на каждый
    // повторный join/опрос (см. seedNodesAround выше). Ошибка сева узлов не
    // должна ронять сам вход игрока — он уже создан, точки сбора можно
    // досеять и позже, поэтому не return jsonResponse на исключении.
    // avoid — уже существующие в округе точки/лагеря (запрошены ОДИН раз на
    // оба кольца, см. fetchNearbyCells) плюс всё, что размещает сам этот
    // вызов — seedNodesAround/seedCampsAround делят один и тот же массив,
    // поэтому узлы и лагеря не садятся друг в друга даже между собой.
    let avoid = [];
    try { avoid = await fetchNearbyCells(admin, world.id, x, y, Math.max(NODE_SEED_MAX_R, CAMP_SEED_MAX_R) + MIN_STRUCT_GAP); } catch (_) { /* без соседей — сеем как есть, тот же честный отказ */ }
    try { await seedNodesAround(admin, world.id, x, y, avoid); } catch (_) { /* см. комментарий */ }
    try { await seedCampsAround(admin, world.id, x, y, avoid); } catch (_) { /* см. тот же комментарий */ }

    return jsonResponse({ ok: true, world_id: world.id, player: ins.data });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
