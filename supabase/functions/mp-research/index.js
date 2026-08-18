// =============================================================================
// mp-research — Фаза 5, Академия: дерево исследований (ACADEMY_TREE), самый
// крупный кусок правил, перенесённый на сервер за один шаг — ~79 узлов на
// два раздела (экономика/военное дело), с настоящими таблицами стоимости/
// времени/мощи (RS_*, дословные RoK-числа, см. подробные комментарии перед
// каждым блоком ниже) и настоящей разблокировкой по дереву. Зеркало
// startResearch(p,id) из index.html:5848-5863.
//
// ВАЖНАЯ ОСОБЕННОСТЬ, унаследованная от клиента как есть (не наше
// упрощение): разблокировка узла (researchLocked/rowGate) НЕ проверяет
// впрямую n.requires — она смотрит, закончен ли ЦЕЛИКОМ предыдущий
// визуальный РЯД дерева (computeRows группирует узлы одной "глубины" —
// nodeDepth, посчитанной по цепочке requires, — в ряды по ROW_SIZES=
// [4,3,4,2] штук для красоты интерфейса). n.requires используется ТОЛЬКО
// для расчёта глубины узла, а не как прямой список условий — так ведёт
// себя сам index.html, здесь просто зеркалируется, каким бы неожиданным
// это ни казалось на первый взгляд.
//
// Честно НЕ входит в этот шаг:
// 1. Сами ЭФФЕКТЫ уже исследованных узлов (n.field/n.effects — надбавки к
//    добыче/бою/etc) — с Фазы 6 bonuses() перенесена и реально применяет их
//    в production()/mp-train/mp-heal/mp-build/mp-tick (см. _shared/rules.js).
//    bonuses(p).researchSpeed ТОЖЕ теперь настоящая (влияет на длительность
//    БУДУЩИХ исследований через researchTime(n,lv)/(1+B.researchSpeed),
//    index.html:5859) — раньше здесь стояла заглушка =0, дальше в этом файле
//    её больше нет.
// 2. gen-гейтед "венцы" (eco_crown_*/mil_crown_* с полем gen:0|1) — раньше
//    здесь стояло неверное заявление, что ВСЕ 8 недостижимы без генералов.
//    На деле p.gen.id всегда null (генералы не перенесены) -> p.gen.id||0
//    всегда 0. У eco_crown_* gen:1 (0!==1 -> невидим, действительно
//    недостижим). У mil_crown_* gen:0 (0===0 -> ВИДИМ) — эти 4 узла честно
//    достижимы любой подходящей расе после row-гейтинга, генерал тут ни при
//    чём. См. подробности в _shared/rules.js рядом с nodeVisibleFor.
//
// Требует построенную Академию (p.b.academy>0) — сам startResearch(p,id) в
// index.html этого явно не проверяет (полагается на то, что кнопка вообще
// не появится без неё), но у сервера нет такой страховки со стороны UI,
// поэтому здесь проверка есть явно, как и у остальных зданий-гейтов.
//
// Тело запроса: { id: string } — id узла ACADEMY_TREE (например "eco_food1").
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

const RES = ["food", "wood", "stone", "gold"];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });
// index.html:2854 epochOf — эпоха ратуши (1..5), нужна и для гейтинга волн
// исследований (researchLocked), и уже использовалась в других функциях.
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);

// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/
// rules.js) — дергаем перед canPay/pay, чтобы цена исследования списывалась
// с актуального баланса.
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
const prodRate = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv));
const plotCap = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv) * 10);
const PROD_BLD = { food: "farm", wood: "lumber", stone: "quarry", gold: "mine" };
const PROD_MULT = { food: 1, wood: 1, stone: 0.75, gold: 0.5 };
function production(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let base = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { if (lv > 0) base += prodRate(lv); });
    out[r] = base * PROD_MULT[r];
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


// -----------------------------------------------------------------------------
// Данные дерева (RS_*, RESEARCH_TABLE, ACADEMY_TREE и связанные функции) —
// см. полное объяснение в заголовке файла выше. Дословный перенос из
// index.html: RS_*-таблицы 1854-1916, RESEARCH_TABLE 1917-1997,
// researchTime/Cost/Power 2007-2023, ACADEMY_TREE 2024-2153,
// tierUnlockedFor/findNode/nodeVisibleFor 2154-2167, TIER_NAMES 2615-2620,
// nodeTitle 3651-3654, nodeDepth/ROW_SIZES/computeRows/rowGate/
// EPOCH_HALL_MIN/researchLocked/lockReason 3656-3704.
const TIER_NAMES = {           // общий набор — служит запасным вариантом (разбойники и т.п.)
  inf:["Ополченец","Мечник","Копейщик","Латник","Гвардеец"],
  arc:["Лучник","Стрелок","Арбалетчик","Снайпер","Мастер лука"],
  cav:["Всадник","Разведчик","Рыцарь","Кирасир","Паладин"],
  sie:["Таран","Баллиста","Катапульта","Онагр","Требушет"],
};
function nodeTitle(n) {
  if (n.unlock) return ({ inf: "Пехота", arc: "Лучники", cav: "Кавалерия", sie: "Осада" }[n.unlock.type]) + ": " + TIER_NAMES[n.unlock.type][n.unlock.tier - 1];
  return n.name;
}
const RS_BALLISTICS = [{food:400000,wood:400000,stone:300000,gold:200000,t:25920,power:4536},{food:600000,wood:600000,stone:450000,gold:300000,t:51840,power:11859},{food:900000,wood:900000,stone:675000,gold:450000,t:104400,power:23881},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:208800,power:43989},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:414000,power:78302},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:828000,power:138066},{food:4560000,wood:4560000,stone:3420000,gold:2740000,t:1659600,power:246584},{food:6840000,wood:6840000,stone:5130000,gold:4100000,t:3319200,power:442538},{food:10250000,wood:10250000,stone:7700000,gold:6150000,t:6634800,power:802824},{food:15375000,wood:15375000,stone:11550000,gold:9225000,t:13302000,power:1475963}];
const RS_BUCKLER = [{food:40000,wood:40000,stone:30000,gold:20000,t:21600,power:1214},{food:80000,wood:80000,stone:60000,gold:40000,t:30240,power:3123},{food:160000,wood:160000,stone:120000,gold:80000,t:42360,power:6216},{food:320000,wood:320000,stone:240000,gold:160000,t:59280,power:11386},{food:640000,wood:640000,stone:480000,gold:320000,t:82980,power:20305}];
const RS_CAMOUFLAGE = [{food:400000,wood:400000,stone:300000,gold:200000,t:18000,power:4220},{food:600000,wood:600000,stone:450000,gold:300000,t:54000,power:11630},{food:900000,wood:900000,stone:675000,gold:540000,t:162000,power:26435},{food:1350000,wood:1350000,stone:1010000,gold:810000,t:486000,power:58362},{food:2030000,wood:2030000,stone:1520000,gold:1220000,t:1458000,power:135413}];
// Также используется для eco_amber1 (Cutting & Polishing) — у неё самой стоимость/
// время не подтверждены источником напрямую, приведены "по паттерну Carriage"
// (тот же тир, та же оценка уже сделана в самой табличке).
const RS_CARRIAGE = [{food:400000,wood:400000,stone:300000,gold:200000,t:48000,power:5420},{food:600000,wood:600000,stone:450000,gold:300000,t:72000,power:13550},{food:900000,wood:900000,stone:675000,gold:450000,t:108000,power:25745},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:162000,power:44039},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:244800,power:71484},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:363600,power:112656},{food:4600000,wood:4600000,stone:3400000,gold:2300000,t:547200,power:174414},{food:6840000,wood:6840000,stone:5130000,gold:3420000,t:820800,power:267053},{food:10250000,wood:10250000,stone:7700000,gold:5130000,t:1231200,power:406011},{food:15375000,wood:15375000,stone:11550000,gold:7695000,t:2462400,power:614450}];
const RS_CARTOGRAPHY = [{food:850000,wood:850000,stone:637500,gold:425000,t:36000,power:8877},{food:1280000,wood:1280000,stone:957000,gold:638000,t:54000,power:22198},{food:1910000,wood:1910000,stone:1440000,gold:1150000,t:81000,power:43136},{food:2870000,wood:2870000,stone:2150000,gold:1720000,t:122400,power:74543},{food:4300000,wood:4300000,stone:3230000,gold:2580000,t:183600,power:121648}];
const RS_CHISEL = [{food:30000,wood:30000,stone:22500,gold:15000,t:3600,power:406},{food:60000,wood:60000,stone:45000,gold:30000,t:5400,power:1147},{food:120000,wood:120000,stone:90000,gold:60000,t:7200,power:2485},{food:240000,wood:240000,stone:180000,gold:120000,t:14400,power:5161},{food:480000,wood:480000,stone:360000,gold:240000,t:28800,power:10513}];
const RS_COMBATTACTICS = [{food:500000,wood:500000,stone:375000,gold:250000,t:32400,power:5671},{food:750000,wood:750000,stone:563000,gold:375000,t:64800,power:14827},{food:1130000,wood:1130000,stone:845000,gold:675000,t:129600,power:30421},{food:1690000,wood:1690000,stone:1270000,gold:1010000,t:259200,power:56408},{food:2530000,wood:2530000,stone:1900000,gold:1520000,t:518400,power:100570},{food:3800000,wood:3800000,stone:2860000,gold:2280000,t:1036800,power:177222},{food:5700000,wood:5700000,stone:4290000,gold:3420000,t:2073600,power:312936},{food:8550000,wood:8550000,stone:6440000,gold:5130000,t:4147200,power:557994},{food:12830000,wood:12830000,stone:9660000,gold:7700000,t:8294400,power:1008570},{food:19250000,wood:19250000,stone:14490000,gold:11550000,t:16588800,power:1850342}];
// Венцы рас (eco_crown_*/mil_crown_*) — придуманный игрой контент без
// прообраза в RoK (см. комментарий в начале файла), раньше считались формулой
// ниже (RESEARCH_GROWTH/RESEARCH_WAVE) — та формула на 4-й волне (венцы) даёт
// lv*60*BASE, то есть уже на 1 уровне ~1.5-1.7 млн мощи разом (нашёл
// пользователь, "так не пойдёт"). Первая правка пересчитала только power, а
// время/цену оставила от старой формулы "как есть" — по итогу пользователь
// правильно указал, что их тоже никто не пересматривал, и они по факту
// унаследовали ту же болезнь (та же WAVE=60 на 4-й волне, gold:0 — просто
// формула так считала, не осмысленное решение).
// Теперь ВСЯ строка (еда/дерево/камень/золото/время/мощь) — это ОДНА строка
// уже готовой настоящей RoK-таблицы (RS_CARRIAGE для эко, RS_COMBATTACTICS
// для военных — те же источники, что и раньше для геометрии мощи), целиком
// умноженная на один и тот же коэффициент (подобран так, чтобы 1 уровень
// мощи вышел на 5255/4832 — те же числа, что и в первой правке). Так как
// умножен ВЕСЬ ряд одним числом, а не только power, "цена за единицу мощи"
// и "время за единицу мощи" — ТОЧНО те же, что у настоящей RoK Carriage/
// Combat Tactics, просто в меньшем масштабе (венец — не полноценная
// 10-уровневая ветка, а вершина дерева на 5 уровнях). Заодно вернулось
// золото в цену (было 0 — артефакт старой формулы, не сознательный выбор).
const RS_CROWN_ECO = [{food:387823,wood:387823,stone:290867,gold:193911,t:46539,power:5255},{food:581734,wood:581734,stone:436301,gold:290867,t:69808,power:13138},{food:872601,wood:872601,stone:654451,gold:436301,t:104712,power:24961},{food:1308902,wood:1308902,stone:979253,gold:654451,t:157068,power:42698},{food:1968201,wood:1968201,stone:1473727,gold:979253,t:237348,power:69308}];
const RS_CROWN_MIL = [{food:426027,wood:426027,stone:319520,gold:213014,t:27607,power:4832},{food:639041,wood:639041,stone:479707,gold:319520,t:55213,power:12633},{food:962821,wood:962821,stone:719986,gold:575137,t:110426,power:25920},{food:1439972,wood:1439972,stone:1082109,gold:860575,t:220852,power:48063},{food:2155697,wood:2155697,stone:1618903,gold:1295123,t:441705,power:85691}];
const RS_ENGINEERING = [{food:250000,wood:250000,stone:187500,gold:125000,t:43200,power:3915},{food:375000,wood:375000,stone:282000,gold:188000,t:60480,power:9620},{food:563000,wood:563000,stone:423000,gold:282000,t:84660,power:17937},{food:845000,wood:845000,stone:635000,gold:423000,t:118800,power:30078},{food:1270000,wood:1270000,stone:953000,gold:635000,t:165600,power:47822},{food:1900000,wood:1900000,stone:1430000,gold:953000,t:234000,power:73778},{food:2850000,wood:2850000,stone:2150000,gold:1430000,t:324000,power:111786},{food:4280000,wood:4280000,stone:3220000,gold:2150000,t:453600,power:167500},{food:6420000,wood:6420000,stone:4830000,gold:3220000,t:637200,power:249252},{food:9630000,wood:9630000,stone:7240000,gold:4830000,t:892800,power:369332}];
const RS_HANDCART = [{food:50000,wood:50000,stone:37500,gold:25000,t:3600,power:581},{food:100000,wood:100000,stone:75000,gold:50000,t:5400,power:1672},{food:200000,wood:200000,stone:150000,gold:100000,t:7200,power:3710},{food:400000,wood:400000,stone:300000,gold:200000,t:14400,power:7786},{food:800000,wood:800000,stone:600000,gold:400000,t:28800,power:15938}];
const RS_HEAVYFRAME = [{food:400000,wood:400000,stone:300000,gold:200000,t:38880,power:5055},{food:600000,wood:600000,stone:450000,gold:300000,t:77760,power:13415},{food:900000,wood:900000,stone:675000,gold:450000,t:154800,power:27510},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:309600,power:51765},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:622800,power:94373},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:1245600,power:170726},{food:4560000,wood:4560000,stone:3420000,gold:2740000,t:2487600,power:312421},{food:6840000,wood:6840000,stone:5130000,gold:4100000,t:4975200,power:574730},{food:10250000,wood:10250000,stone:7700000,gold:6150000,t:9954000,power:1067727},{food:15380000,wood:15380000,stone:11540000,gold:9230000,t:13302000,power:2006287}];
const RS_IRONWORKING = [{food:10000,wood:10000,t:3600,power:184},{food:20000,wood:20000,t:4320,power:252},{food:40000,wood:40000,stone:30000,t:5160,power:457},{food:80000,wood:80000,stone:60000,t:6240,power:748},{food:160000,wood:160000,stone:120000,t:8160,power:1298}];
const RS_IRRIGATION = [{food:5000,wood:5000,t:600,power:44},{food:10000,wood:10000,stone:7500,t:900,power:142},{food:20000,wood:20000,stone:15000,t:2000,power:347},{food:40000,wood:40000,stone:30000,t:4980,power:797},{food:80000,wood:80000,stone:60000,t:9960,power:1697}];
const RS_JEWELRY = [{food:1000000,wood:1000000,stone:750000,gold:500000,t:10800,power:9182}];
// 10-й уровень: время в источнике не подтверждено ('?'), взято по общему для тира
// росту ×1.4 от 9-го уровня (тот же коэффициент, что и у соседних серий тира).
const RS_MACHINERY = [{food:350000,wood:350000,stone:275000,gold:175000,t:36000,power:4540},{food:525000,wood:525000,stone:413000,gold:263000,t:50400,power:11210},{food:788000,wood:788000,stone:620000,gold:395000,t:70560,power:21019},{food:1180000,wood:1180000,stone:930000,gold:593000,t:97200,power:35453},{food:1770000,wood:1770000,stone:1400000,gold:890000,t:136800,power:56711},{food:2660000,wood:2660000,stone:2090000,gold:1340000,t:194400,power:88049},{food:3990000,wood:3990000,stone:3140000,gold:2000000,t:270000,power:134286},{food:5990000,wood:5990000,stone:4710000,gold:3010000,t:378000,power:202560},{food:8980000,wood:8980000,stone:7070000,gold:4510000,t:532800,power:303458},{food:13500000,wood:13500000,stone:10600000,gold:6800000,t:745200,power:452681}];
const RS_MASONRY = [{food:20000,wood:20000,stone:15000,t:3600,power:269},{food:30000,wood:30000,stone:22500,t:5400,power:672},{food:50000,wood:50000,stone:37500,t:7200,power:1272},{food:70000,wood:70000,stone:52500,t:10800,power:2141},{food:100000,wood:100000,stone:75000,t:28800,power:3918}];
const RS_MEDICALCORPS = [{food:500000,wood:500000,stone:375000,gold:250000,t:38880,power:5930},{food:750000,wood:750000,stone:563000,gold:375000,t:77760,power:15604},{food:1130000,wood:1130000,stone:845000,gold:563000,t:154800,power:31674},{food:1690000,wood:1690000,stone:1270000,gold:844000,t:309600,power:58891},{food:2530000,wood:2530000,stone:1900000,gold:1270000,t:622800,power:105938},{food:3800000,wood:3800000,stone:2850000,gold:1900000,t:1245600,power:188950},{food:5700000,wood:5700000,stone:4280000,gold:3420000,t:2487600,power:341205},{food:8550000,wood:8550000,stone:6420000,gold:5130000,t:4975200,power:619354},{food:12820000,wood:12820000,stone:9630000,gold:7690000,t:9954000,power:1136111},{food:19200000,wood:19200000,stone:14400000,gold:11500000,t:20008800,power:2110314}];
const RS_METALLURGY = [{food:50000,wood:50000,stone:37500,t:1800,power:384}];
const RS_MILDISCIPLINE = [{food:5000,wood:5000,t:900,power:56}];
const RS_MULTILAYER = [{food:40000,wood:40000,stone:30000,gold:20000,t:3600,power:494},{food:80000,wood:80000,stone:60000,gold:40000,t:7200,power:1482},{food:160000,wood:160000,stone:120000,gold:80000,t:14400,power:3458},{food:320000,wood:320000,stone:240000,gold:160000,t:28800,power:7410},{food:640000,wood:640000,stone:480000,gold:320000,t:57600,power:15314}];
const RS_PLOW = [{food:100000,wood:100000,stone:75000,gold:50000,t:28800,power:2027},{food:150000,wood:150000,stone:113000,gold:75000,t:40320,power:4953},{food:225000,wood:225000,stone:170000,gold:113000,t:56460,power:9185},{food:338000,wood:338000,stone:255000,gold:170000,t:79020,power:15313},{food:507000,wood:507000,stone:383000,gold:255000,t:111600,power:24190},{food:761000,wood:761000,stone:575000,gold:383000,t:154800,power:37069},{food:1140000,wood:1140000,stone:863000,gold:575000,t:216000,power:55775},{food:1710000,wood:1710000,stone:1300000,gold:863000,t:302400,power:82970},{food:2570000,wood:2570000,stone:1940000,gold:1300000,t:424800,power:122555},{food:3860000,wood:3860000,stone:2920000,gold:1940000,t:594000,power:180236}];
const RS_QUARRYING = [{food:100,wood:100,t:60,power:5}];
const RS_SCYTHE = [{food:200000,wood:200000,stone:150000,gold:100000,t:36000,power:3190},{food:300000,wood:300000,stone:225000,gold:150000,t:50400,power:7831},{food:450000,wood:450000,stone:338000,gold:225000,t:70560,power:14592},{food:675000,wood:675000,stone:507000,gold:338000,t:97200,power:24454},{food:1010000,wood:1010000,stone:761000,gold:507000,t:136800,power:38855},{food:1520000,wood:1520000,stone:1140000,gold:761000,t:194400,power:59910},{food:2280000,wood:2280000,stone:1710000,gold:1140000,t:270000,power:90721},{food:3420000,wood:3420000,stone:2570000,gold:1710000,t:378000,power:135855},{food:5130000,wood:5130000,stone:3860000,gold:2570000,t:532800,power:202041},{food:7700000,wood:7700000,stone:5780000,gold:3860000,t:745200,power:299196}];
const RS_SICKLE = [{food:20000,wood:20000,stone:15000,t:900,power:161},{food:40000,wood:40000,stone:30000,t:1800,power:483},{food:80000,wood:80000,stone:60000,t:3600,power:1127},{food:160000,wood:160000,stone:120000,t:7200,power:2415},{food:320000,wood:320000,stone:240000,t:14400,power:4991}];
// 10-й уровень: время не подтверждено источником, оценено тем же способом, что и Machinery.
const RS_STONESAW = [{food:300000,wood:300000,stone:225000,gold:150000,t:36000,power:4065},{food:450000,wood:450000,stone:338000,gold:225000,t:50400,power:10020},{food:675000,wood:675000,stone:507000,gold:338000,t:70560,power:18753},{food:1010000,wood:1010000,stone:761000,gold:507000,t:97200,power:31574},{food:1520000,wood:1520000,stone:1140000,gold:761000,t:136800,power:50416},{food:2280000,wood:2280000,stone:1710000,gold:1140000,t:194400,power:78129},{food:3420000,wood:3420000,stone:2570000,gold:1710000,t:270000,power:118926},{food:5130000,wood:5130000,stone:3860000,gold:2570000,t:378000,power:179040},{food:7700000,wood:7700000,stone:5780000,gold:3860000,t:532800,power:267695},{food:11500000,wood:11500000,stone:8700000,gold:5800000,t:745200,power:398558}];
const RS_T2UNLOCK_MELEE = [{food:200000,wood:200000,stone:150000,t:36000,power:2690}];
const RS_T2UNLOCK_SIEGE = [{food:200000,wood:200000,stone:150000,t:45000,power:3050}];
const RS_T3UNLOCK_MELEE = [{food:1500000,wood:1500000,stone:1130000,gold:1500000,t:259200,power:27243}];
const RS_T3UNLOCK_SIEGE = [{food:1500000,wood:1500000,stone:1130000,gold:1500000,t:388800,power:32427}];
const RS_T4UNLOCK_MELEE = [{food:5000000,wood:5000000,stone:3750000,gold:5000000,t:2592000,power:159930}];
const RS_T4UNLOCK_SIEGE = [{food:5000000,wood:5000000,stone:3750000,gold:5000000,t:3888000,power:211770}];
const RS_T5UNLOCK_MELEE = [{food:10000000,wood:10000000,stone:7500000,gold:10000000,t:8643600,power:485748}];
const RS_T5UNLOCK_SIEGE = [{food:10000000,wood:10000000,stone:7500000,gold:10000000,t:12965400,power:672382}];
const RS_TRACKING = [{food:15000,wood:15000,stone:11300,t:7200,power:381},{food:30000,wood:30000,stone:22500,t:10080,power:971},{food:60000,wood:60000,stone:45000,t:14100,power:1910},{food:120000,wood:120000,stone:90000,t:19740,power:3450},{food:240000,wood:240000,stone:180000,t:27660,power:6056}];
const RS_WHEEL = [{food:60000,wood:60000,stone:45000,gold:30000,t:3600,power:669},{food:120000,wood:120000,stone:90000,gold:60000,t:7200,power:2007},{food:240000,wood:240000,stone:180000,gold:120000,t:14400,power:4683},{food:480000,wood:480000,stone:360000,gold:240000,t:28800,power:10035},{food:960000,wood:960000,stone:720000,gold:480000,t:57600,power:20739}];
const RS_WOOTZSTEEL = [{food:400000,wood:400000,stone:300000,gold:200000,t:17280,power:4191},{food:600000,wood:600000,stone:450000,gold:300000,t:34560,power:10823},{food:900000,wood:900000,stone:675000,gold:450000,t:69120,power:21462},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:136800,power:38805},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:277200,power:67589},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:554400,power:116294},{food:4560000,wood:4560000,stone:3420000,gold:2740000,t:1105200,power:202693},{food:6840000,wood:6840000,stone:5130000,gold:4100000,t:2210400,power:354410},{food:10250000,wood:10250000,stone:7700000,gold:6150000,t:4424400,power:626223},{food:15375000,wood:15375000,stone:11550000,gold:9225000,t:9453600,power:1122415}];
const RS_WRITING = [{food:50000,wood:50000,stone:37500,gold:25000,t:7200,power:725},{food:100000,wood:100000,stone:75000,gold:50000,t:14400,power:2176},{food:200000,wood:200000,stone:150000,gold:100000,t:28800,power:5078},{food:400000,wood:400000,stone:300000,gold:200000,t:57600,power:10882},{food:800000,wood:800000,stone:600000,gold:400000,t:115200,power:22490}];
const RESEARCH_TABLE = {
  eco_stone0: RS_QUARRYING,
  eco_gold0: RS_METALLURGY,
  eco_food1: RS_IRRIGATION,
  eco_wood1: RS_IRRIGATION,
  eco_build1: RS_MASONRY,
  eco_stone1: RS_CHISEL,
  eco_gold1: RS_CHISEL,
  eco_rsch1: RS_WRITING,
  eco_gfood1: RS_SICKLE,
  eco_gwood1: RS_SICKLE,
  eco_gstone1: RS_HANDCART,
  eco_ggold1: RS_HANDCART,
  eco_load1: RS_WHEEL,
  eco_cap1: RS_MULTILAYER,
  eco_amber0: RS_JEWELRY,
  eco_wood2: RS_PLOW,
  eco_food2: RS_PLOW,
  eco_gwood2: RS_SCYTHE,
  eco_gfood2: RS_SCYTHE,
  eco_build2: RS_ENGINEERING,
  eco_rsch2: RS_ENGINEERING,
  eco_gold2: RS_SCYTHE,
  eco_stone2: RS_SCYTHE,
  eco_ggold2: RS_STONESAW,
  eco_gstone2: RS_STONESAW,
  eco_gall2: RS_MACHINERY,
  eco_load2: RS_CARRIAGE,
  eco_amber1: RS_CARRIAGE,
  eco_crown_dwarf: RS_CROWN_ECO,
  eco_crown_human: RS_CROWN_ECO,
  eco_crown_elf: RS_CROWN_ECO,
  eco_crown_undead: RS_CROWN_ECO,
  mil_trainspd: RS_MILDISCIPLINE,
  mil_atk_inf1: RS_IRONWORKING,
  mil_atk_arc1: RS_IRONWORKING,
  mil_atk_cav1: RS_IRONWORKING,
  mil_atk_sie1: RS_IRONWORKING,
  mil_tier_inf2: RS_T2UNLOCK_MELEE,
  mil_tier_arc2: RS_T2UNLOCK_MELEE,
  mil_tier_cav2: RS_T2UNLOCK_MELEE,
  mil_tier_sie2: RS_T2UNLOCK_SIEGE,
  mil_scout1: RS_TRACKING,
  mil_march1: RS_TRACKING,
  mil_def_inf1: RS_BUCKLER,
  mil_def_arc1: RS_BUCKLER,
  mil_def_cav1: RS_BUCKLER,
  mil_def_sie1: RS_BUCKLER,
  mil_tier_inf3: RS_T3UNLOCK_MELEE,
  mil_tier_arc3: RS_T3UNLOCK_MELEE,
  mil_tier_cav3: RS_T3UNLOCK_MELEE,
  mil_tier_sie3: RS_T3UNLOCK_SIEGE,
  mil_scout2: RS_CAMOUFLAGE,
  mil_atk_all1: RS_COMBATTACTICS,
  mil_def_all1: RS_COMBATTACTICS,
  mil_hp_all1: RS_COMBATTACTICS,
  mil_march2: RS_CARTOGRAPHY,
  mil_tier_inf4: RS_T4UNLOCK_MELEE,
  mil_tier_arc4: RS_T4UNLOCK_MELEE,
  mil_tier_cav4: RS_T4UNLOCK_MELEE,
  mil_tier_sie4: RS_T4UNLOCK_SIEGE,
  mil_atk_inf2: RS_WOOTZSTEEL,
  mil_atk_arc2: RS_WOOTZSTEEL,
  mil_atk_cav2: RS_WOOTZSTEEL,
  mil_atk_sie2: RS_BALLISTICS,
  mil_def_inf2: RS_BALLISTICS,
  mil_def_arc2: RS_BALLISTICS,
  mil_def_cav2: RS_BALLISTICS,
  mil_def_sie2: RS_HEAVYFRAME,
  mil_atk_all2: RS_MEDICALCORPS,
  mil_def_all2: RS_MEDICALCORPS,
  mil_hp_all2: RS_MEDICALCORPS,
  mil_tier_inf5: RS_T5UNLOCK_MELEE,
  mil_tier_arc5: RS_T5UNLOCK_MELEE,
  mil_tier_cav5: RS_T5UNLOCK_MELEE,
  mil_tier_sie5: RS_T5UNLOCK_SIEGE,
  mil_crown_dwarf: RS_CROWN_MIL,
  mil_crown_human: RS_CROWN_MIL,
  mil_crown_elf: RS_CROWN_MIL,
  mil_crown_undead: RS_CROWN_MIL,
};
// Раньше комментарий гласил "только для 8 венцов рас" — теперь у всех 8 есть
// явные таблицы (RS_CROWN_ECO/RS_CROWN_MIL, см. выше), формула ниже как
// фактический фолбэк уже не используется ни одним узлом ACADEMY_TREE, но
// оставлена (не мёртвый код в строгом смысле — сработает для любого будущего
// узла без своей RS_*-таблицы, как и для остальных wave 1-3 без своих таблиц).
const RESEARCH_GROWTH=1.6, RESEARCH_WAVE={1:1,2:5,3:20,4:60};
const RESEARCH_POWER_BASE={eco:28500, mil:26200};
const RESEARCH_POWER_WAVE = {1:0.018, 2:5, 3:20, 4:60};
const ECO_TIME_BASE=900, MIL_TIME_BASE=720;
function researchTime(n,lv){
  const row=(RESEARCH_TABLE[n.id]||[])[lv-1];
  if(row) return row.t;
  const base = n.branch==="eco"?ECO_TIME_BASE:MIL_TIME_BASE;
  return Math.round(base*RESEARCH_WAVE[n.wave]*Math.pow(RESEARCH_GROWTH,lv-1));
}
function researchCost(n,lv){
  const row=(RESEARCH_TABLE[n.id]||[])[lv-1];
  if(row) return {food:row.food||0,wood:row.wood||0,stone:row.stone||0,gold:row.gold||0};
  const t=researchTime(n,lv), base=t*4.44;   // та же пропорция цена/время, что у построек — только для венцов
  return {food:Math.round(base),wood:Math.round(base),stone:Math.round(base*.435),gold:0};
}
function researchPower(n,lv){
  const row=(RESEARCH_TABLE[n.id]||[])[lv-1];
  if(row) return row.power;
  return lv*RESEARCH_POWER_WAVE[n.wave]*RESEARCH_POWER_BASE[n.branch];
}
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
function tierUnlockedFor(p,type){
  let mx=1;
  for(let t=2;t<=5;t++){ if((p.tech["mil_tier_"+type+t]||0)>=1) mx=t; else break }
  return mx;
}
function findNode(id){
  for(const arr of [ACADEMY_TREE.eco, ACADEMY_TREE.mil]) for(const n of arr) if(n.id===id) return n;
  return null;
}
function nodeVisibleFor(n,p){                          // раса + выбор генерала (венец только один — в его ветке)
  if(n.race && n.race!==p.race) return false;
  if(n.gen!=null && n.gen!==(p.gen.id||0)) return false;
  return true;
}
function nodeDepth(n,arr,cache){
  if(cache.has(n.id)) return cache.get(n.id);
  cache.set(n.id,0); // защита от случайного цикла в данных
  const reqs=n.requires||[];
  const d = reqs.length ? 1+Math.max(...reqs.map(id=>{
    const pn=arr.find(x=>x.id===id); return pn?nodeDepth(pn,arr,cache):0;
  })) : 0;
  cache.set(n.id,d);
  return d;
}
const ROW_SIZES=[4,3,4,2];    // рядами по 2-4 для красоты, а не одной длинной стеной
function computeRows(arr,p){
  const visible=arr.filter(n=>nodeVisibleFor(n,p));
  const cache=new Map();
  const byDepth={};
  visible.forEach(n=>{ const d=nodeDepth(n,arr,cache); (byDepth[d]=byDepth[d]||[]).push(n); });
  const depths=Object.keys(byDepth).map(Number).sort((a,b)=>a-b);
  let sizeIdx=0;
  const rows=[];
  depths.forEach(d=>{
    const unlockNodes=byDepth[d].filter(n=>n.unlock);
    let list=byDepth[d].filter(n=>!n.unlock);
    while(list.length){
      const n=ROW_SIZES[sizeIdx%ROW_SIZES.length]; sizeIdx++;
      rows.push(list.slice(0,n));
      list=list.slice(n);
    }
    if(unlockNodes.length) rows.push(unlockNodes);   // открытие тира войск — всегда своей строкой целиком, без разбивки
  });
  return rows;
}
function rowGate(n,p){
  const rows=computeRows(ACADEMY_TREE[n.branch],p);
  const idx=rows.findIndex(row=>row.some(x=>x.id===n.id));
  if(idx<=0) return {locked:false,missing:[]};
  const missing=rows[idx-1].filter(x=>(p.tech[x.id]||0)<x.max);
  return {locked:missing.length>0,missing};
}
function researchLocked(n,p){
  if(epochOf(p.b.hall)<n.wave) return true;
  return rowGate(n,p).locked;
}
const EPOCH_HALL_MIN=[1,7,13,19,25];
function lockReason(n,p){
  if(epochOf(p.b.hall)<n.wave) return "нужна ратуша "+EPOCH_HALL_MIN[n.wave-1]+" уровня";
  const missing=rowGate(n,p).missing;
  if(missing.length) return "нужно закончить: "+missing.map(x=>nodeTitle(x)).join(", ");
  return "заблокировано";
}

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
//   3. Бонус "генерала по умолчанию" — genOf(p)=GENERALS[p.race][p.gen.id||0]
//      (index.html:2345): т.к. в общем мире игрок физически не может выбрать
//      другого генерала (p.gen.id всегда null, mp-join не заводит выбор), это
//      ВСЕГДА индекс 0 — тот же дефолт, что и у игрока одиночной игры,
//      который просто ещё не открывал вкладку "Генерал". GENERALS_DEFAULT
//      ниже — только эти 4 записи (index 0 на расу), не вся таблица GENERALS
//      (второй генерал каждой расы здесь физически недостижим, выбирать
//      нечем — переносить его было бы "то, чего ещё нет", см. правило
//      пользователя из более ранней переписки).
//   4. portalMarchBonus(p.b.portal) — Портал не входит в постройки общего
//      мира (нет в BUILD_MP_BLDS/BKEYS этого модуля), поэтому p.b.portal
//      всегда отсутствует — передаётся 0 явно (portalMarchBonus(0)=0), это
//      не заглушка отдельного бонуса, а честный факт "здания ещё нет".
//   5. Бонусы дерева исследований (ACADEMY_TREE[*].field/effects, по
//      p.tech) — уже перенесено в Фазе 5, здесь наконец подключается.
//
// Что НЕ считается, и почему это математически, а не по недосмотру, ноль:
//   - Талантовые бонусы генерала (w1-w5/d1-d5/g1-g3/g4-g5, index.html:
//     3760-3767) и GENERAL_TREE (город/армия, index.html:3780-3787) — оба
//     читают ТОЛЬКО p.gen.tal. В общем мире система вложения очков таланта
//     не заведена вообще: p.gen.tal у каждого игрока всегда {} (mp-join),
//     очков взять неоткуда. T[id]||0 для любого id из пустого объекта — это
//     буквально 0, то есть эти два блока клиента при p.gen.tal={} дают
//     нулевой вклад АБСОЛЮТНО ТОЧНО, не приближённо — переносить их сюда
//     значило бы скопировать код, который на сервере гарантированно не
//     умеет посчитать ничего, кроме нуля. Поэтому они просто опущены, а не
//     скопированы ради видимости полноты.
const GENERALS_DEFAULT = {
  human:  { apply: (b) => { b.atk += .15; b.def += .08; } },                 // Король Алдрик
  dwarf:  { apply: (b) => { b.def += .08; b.wallBonus += .08; } },           // Дорвальд Каменный Трон
  elf:    { apply: (b) => { b.def += .10; b.archer = 0; } },                 // Ильвен Хрустальный Щит
  undead: { apply: (b) => { b.def += .10; b.healSpeed = 1; } },              // Владислав фон Морвейн — обнуляет расовую скидку лазарета (см. RACE_EPOCHS.undead[1])
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
  GENERALS_DEFAULT[p.race].apply(b);
  b.march *= 1 + portalMarchBonus((p.b && p.b.portal) || 0);
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
  return b;
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
    const id = String(body.id || "");
    if (!id) return jsonResponse({ err: "Не указано исследование" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    // ИСПРАВЛЕНИЕ БАГА (Фаза 6): p.race читается nodeVisibleFor/researchLocked
    // ниже, но race живёт в отдельной колонке players.race, а не в самом
    // state — mp-join до Фазы 6 её туда не дублировал, из-за чего ЛЮБОЙ
    // race-гейтед узел (все 8 венцов) был невидим для всех игроков без
    // исключения (n.race && n.race!==p.race — undefined!=="human" всегда
    // true), а не только для реально не подходящей расы. Теперь mp-join
    // дублирует race в state для новых игроков; здесь — то же
    // самоисцеление, что и во всех остальных функциях этого набора.
    p.race = p.race || row.race;
    const now = Date.now() / 1000;
    syncRes(p, now);

    // Самоисцеление легаси-состояния — как и everywhere else в этом наборе
    // функций, а не потому что это где-то ожидается.
    if (!p.tech) p.tech = {};
    // Академия — одноплотное здание (как barracks/range/stable/hall, не
    // массив плотов вроде farm/hospital/quarry/mine), p.b.academy — обычное
    // число (index.html:3300). Проверка, которой НЕТ в самом startResearch()
    // index.html:5848-5863 — там на неё полагается UI (кнопка исследования
    // просто не появляется без построенной Академии, ср. index.html:8310
    // `gated=p.b.academy<=0`). У сервера такой страховки нет, поэтому здесь
    // она добавлена явно (см. заголовок файла).
    if (!(p.b.academy > 0)) return jsonResponse({ err: "Нужна построенная Академия" }, 400);

    // Дословно startResearch(p,id) из index.html:5848-5863.
    if (p.rsch) return jsonResponse({ err: "Академия занята" }, 400);
    const n = findNode(id);
    if (!n) return jsonResponse({ err: "Неизвестное исследование" }, 400);
    if (!nodeVisibleFor(n, p)) return jsonResponse({ err: "Недоступно вашей расе или генералу" }, 400);
    const cur = p.tech[id] || 0;
    if (cur >= n.max) return jsonResponse({ err: "Уже на максимуме" }, 400);
    if (researchLocked(n, p)) return jsonResponse({ err: lockReason(n, p) }, 400);
    const lv = cur + 1;
    const c = researchCost(n, lv);
    if (!canPay(p.res, c)) return jsonResponse({ err: "Не хватает ресурсов" }, 400);
    pay(p.res, c);
    // bonuses(p).researchSpeed — настоящий подсчёт (раса/эпоха/дефолтный
    // генерал/дерево исследований eco_rsch1/eco_rsch2 — да, влияет сама на
    // себя рекурсивно не может: researchSpeed воздействует на ДЛИТЕЛЬНОСТЬ
    // будущих исследований, не на уже идущее), index.html:5859 делит
    // researchTime(n,lv) на (1+B.researchSpeed).
    const B = bonuses(p);
    const t = researchTime(n, lv) / (1 + B.researchSpeed);
    p.rsch = { id, lv, t0: now, t1: now + t };

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    const fireAt = new Date(Date.now() + t * 1000).toISOString();
    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: fireAt, type: "research",
      data: { player_id: row.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: t, fire_at: fireAt, lv });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
