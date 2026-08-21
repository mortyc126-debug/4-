// =============================================================================
// mp-build — Фаза 5: постройка/улучшение зданий. Все здания из BUILDINGS
// (index.html) перенесены: barracks/range/stable/siege, hall + весь
// HALL_REQ (wall/store/academy/hospital), farm/lumber/quarry/mine,
// garrison/scout, forge (Фаза 11, кусочек 1), portal (своей выдумки,
// прообраза в RoK нет — PORTAL_TABLE ниже, среднее Академии и Стены). Зеркало
// startBuild(p,bk,plot) из index.html:5712.
//
// hospital/farm/lumber/quarry/mine — multi-здания (BUILDINGS.*.plots=4 в
// index.html), у каждого 4 независимых участка (0-3). Участок 0
// разблокирован всегда (и это ровно тот участок, что нужен HALL_REQ у
// hospital), участки 1-3 — по эпохе ратуши (epochOf/plotUnlocked, см.
// _shared/rules.js): участок 1 с эпохи 2 (ратуша 7 ур.), участок 2 с эпохи
// 3 (13 ур.), участок 3 с эпохи 4 (19 ур.) — все 4 участка строятся
// отдельными заказами через отдельные вызовы этой функции с разным
// body.plot; production()/plotFillCap() уже суммируют вклад всех
// построенных участков (см. syncRes ниже), это не требует отдельного шага.
//
// bonuses(p).build/buildCostCut — Фаза 6 подключила настоящий подсчёт (раса/
// эпоха рас/дефолтный генерал/дерево исследований), см. заголовок bonuses()
// ниже.
//
// Тело запроса: { bk: "barracks"|"range"|"stable"|"siege"|"hall"|"wall"|
//                     "store"|"academy"|"hospital"|"farm"|"lumber"|
//                     "quarry"|"mine"|"garrison"|"scout"|"forge"|"portal",
//                     plot?: 0-3 }
//                (plot нужен только у multi-зданий hospital/farm/lumber/
//                 quarry/mine, у остальных игнорируется; по умолчанию 0)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js и ../_shared/rules.js —
// Dashboard-редактор Edge Functions не подтягивает относительные импорты на
// общую папку, поэтому здесь код самодостаточен (копия, а не импорт). При
// деплое через Supabase CLI можно вернуть импорты как в репозитории.
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
const BLD_TRAIN = { barracks: "inf", range: "arc", stable: "cav", siege: "sie" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];

// Казармы/Стрельбище/Конюшня/Склад/Госпиталь/Гарнизон свободно ставятся
// через freeform-пикер (mp-build startBuild) — в отличие от Ратуши/Стены,
// которые всегда уже есть. В RoK у этих шести 1 уровень бесплатный (уже
// встроен в город с нуля, источник даёт "—"), но здесь строить "бесплатно
// и мгновенно" нельзя ни для одного здания — 1 уровень каждого домножен
// наполовину от их же настоящего 2 уровня (тот же ×2, что и между 1-2
// уровнем у зданий, где источник цену на 1 уровне и так даёт — Ферма,
// Академия, Рынок и т.д.), см. те же числа и подробный комментарий в
// index.html:WATCH_TABLE. Мощь(5) не трогал — настоящее число 1 уровня.
const BARRACKS_TABLE = [
  { food: 250, wood: 400, t: 10, power: 5 }, { food: 500, wood: 800, t: 20, power: 10 }, { food: 1000, wood: 1500, t: 60, power: 20 },
  { food: 2000, wood: 2800, t: 200, power: 37 }, { food: 3800, wood: 5000, t: 1000, power: 94 },
  { food: 6500, wood: 8500, stone: 3400, t: 2750, power: 244 }, { food: 9800, wood: 12800, stone: 5400, t: 5520, power: 525 },
  { food: 14800, wood: 19300, stone: 8700, t: 10980, power: 1059 }, { food: 22300, wood: 29000, stone: 13900, t: 22020, power: 2083 },
  { food: 33500, wood: 43500, stone: 22200, t: 43980, power: 4063 }, { food: 52500, wood: 67500, stone: 35000, t: 52800, power: 6520 },
  { food: 80000, wood: 102500, stone: 52500, t: 63360, power: 9576 }, { food: 120000, wood: 155000, stone: 80000, t: 76020, power: 13407 },
  { food: 180000, wood: 232500, stone: 120000, t: 90000, power: 18241 }, { food: 270000, wood: 350000, stone: 180000, t: 108000, power: 24400 },
  { food: 405000, wood: 525000, stone: 270000, t: 129600, power: 32325 }, { food: 607500, wood: 787500, stone: 405000, t: 158400, power: 42636 },
  { food: 925000, wood: 1200000, stone: 625000, t: 190800, power: 56328 }, { food: 1400000, wood: 1800000, stone: 950000, t: 226800, power: 74659 },
  { food: 2100000, wood: 2700000, stone: 1400000, t: 273600, power: 99431 }, { food: 3200000, wood: 4100000, stone: 2200000, t: 327600, power: 133357 },
  { food: 4700000, wood: 6100000, stone: 3200000, t: 424800, power: 181631 }, { food: 7100000, wood: 9100000, stone: 4900000, t: 594000, power: 252430 },
  { food: 10800000, wood: 13800000, stone: 7500000, t: 892800, power: 359629 }, { food: 16200000, wood: 20800000, stone: 11200000, t: 2944800, power: 592326 },
];
const SIEGE_TABLE = [
  { food: 400, wood: 500, t: 10, power: 5 }, { food: 800, wood: 1000, t: 90, power: 10 }, { food: 1500, wood: 2000, t: 240, power: 26 },
  { food: 2800, wood: 3800, t: 600, power: 63 }, { food: 5000, wood: 6800, t: 1000, power: 126 },
  { food: 8500, wood: 11500, stone: 5700, t: 2750, power: 293 }, { food: 12800, wood: 17300, stone: 9000, t: 5520, power: 600 },
  { food: 19300, wood: 26000, stone: 14400, t: 22020, power: 1173 }, { food: 19300, wood: 26000, stone: 14400, t: 22020, power: 2258 },
  { food: 43500, wood: 58500, stone: 36900, t: 43980, power: 4332 }, { food: 67500, wood: 90000, stone: 57500, t: 52800, power: 6931 },
  { food: 102500, wood: 135000, stone: 87500, t: 63360, power: 10202 }, { food: 102500, wood: 135000, stone: 87500, t: 76020, power: 14355 },
  { food: 232500, wood: 305000, stone: 200000, t: 90000, power: 19679 }, { food: 350000, wood: 457500, stone: 300000, t: 129600, power: 26573 },
  { food: 525000, wood: 687500, stone: 450000, t: 129600, power: 35603 }, { food: 787500, wood: 1000000, stone: 675000, t: 158400, power: 47574 },
  { food: 1200000, wood: 1600000, stone: 1000000, t: 190800, power: 63716 }, { food: 1800000, wood: 2300000, stone: 1600000, t: 273600, power: 85697 },
  { food: 2700000, wood: 3500000, stone: 2300000, t: 273600, power: 115969 }, { food: 4100000, wood: 5300000, stone: 3500000, t: 327600, power: 158145 },
  { food: 6100000, wood: 7900000, stone: 5300000, t: 424800, power: 218794 }, { food: 9100000, wood: 11800000, stone: 7900000, t: 594000, power: 308118 },
  { food: 13800000, wood: 17800000, stone: 12000000, t: 892800, power: 442817 }, { food: 20700000, wood: 26824600, stone: 17916000, t: 2946240, power: 716764 },
];
const HALL_TABLE = [
  { t: 0, power: 7 }, { food: 3500, wood: 3500, t: 2, power: 21 }, { food: 6500, wood: 6500, t: 300, power: 59 },
  { food: 11800, wood: 11800, t: 1200, power: 154 }, { food: 21300, wood: 21300, t: 3600, power: 383 },
  { food: 36300, wood: 36300, stone: 12000, t: 7200, power: 852 }, { food: 54400, wood: 54400, stone: 19200, t: 18000, power: 1847 },
  { food: 81800, wood: 81800, stone: 30800, t: 36000, power: 3706 }, { food: 122800, wood: 122800, stone: 49200, t: 54000, power: 6504 },
  { food: 184300, wood: 184300, stone: 78700, t: 79200, power: 10933 }, { food: 277500, wood: 277500, stone: 120000, t: 108000, power: 16723 },
  { food: 417500, wood: 417500, stone: 180000, t: 144000, power: 24693 }, { food: 627500, wood: 627500, stone: 270000, t: 180000, power: 35213 },
  { food: 942500, wood: 942500, stone: 405000, t: 216000, power: 48838 }, { food: 1400000, wood: 1400000, stone: 607500, t: 252000, power: 66400 },
  { food: 2100000, wood: 2100000, stone: 912500, t: 345600, power: 91451 }, { food: 3200000, wood: 3200000, stone: 1400000, t: 417600, power: 125005 },
  { food: 4800000, wood: 4800000, stone: 2100000, t: 504000, power: 170590 }, { food: 7200000, wood: 7200000, stone: 3100000, t: 604800, power: 232957 },
  { food: 10800000, wood: 10800000, stone: 4700000, t: 712800, power: 318769 }, { food: 16200000, wood: 16200000, stone: 7000000, t: 950400, power: 442735 },
  { food: 24300000, wood: 24300000, stone: 10600000, t: 1479600, power: 630860 }, { food: 36500000, wood: 36500000, stone: 15900000, t: 2070000, power: 907085 },
  { food: 54800000, wood: 54800000, stone: 24000000, t: 3110400, power: 1322485 }, { food: 82200000, wood: 82200000, stone: 36000000, t: 10915200, power: 2195458 },
];
const WALL_TABLE = [
  { t: 0, power: 5 }, { food: 2300, wood: 2800, t: 2, power: 15 }, { food: 4300, wood: 5000, t: 90, power: 37 },
  { food: 7800, wood: 9000, t: 600, power: 94 }, { food: 14000, wood: 16300, t: 1800, power: 226 },
  { food: 18000, wood: 21000, stone: 25000, t: 3500, power: 519 }, { food: 27000, wood: 32000, stone: 40000, t: 7020, power: 1037 },
  { food: 41000, wood: 47000, stone: 64000, t: 13980, power: 1965 }, { food: 61000, wood: 71000, stone: 102400, t: 28020, power: 3656 },
  { food: 92000, wood: 106000, stone: 164000, t: 55980, power: 6784 }, { food: 137000, wood: 160000, stone: 250000, t: 67200, power: 10816 },
  { food: 207000, wood: 240000, stone: 375000, t: 80640, power: 16060 }, { food: 310000, wood: 360000, stone: 565000, t: 97200, power: 22965 },
  { food: 465000, wood: 540000, stone: 850000, t: 115200, power: 32169 }, { food: 698000, wood: 810000, stone: 1300000, t: 165600, power: 44583 },
  { food: 1000000, wood: 1200000, stone: 1900000, t: 165600, power: 61540 }, { food: 1600000, wood: 1800000, stone: 2900000, t: 201600, power: 84977 },
  { food: 2400000, wood: 2700000, stone: 4400000, t: 241200, power: 117860 }, { food: 3500000, wood: 4100000, stone: 6600000, t: 288000, power: 164369 },
  { food: 5300000, wood: 6200000, stone: 9900000, t: 345600, power: 230776 }, { food: 8000000, wood: 9300000, stone: 14800000, t: 417600, power: 326321 },
  { food: 12000000, wood: 13900000, stone: 22200000, t: 540000, power: 466309 }, { food: 18000000, wood: 20900000, stone: 33300000, t: 756000, power: 674163 },
  { food: 27000000, wood: 31300000, stone: 50000000, t: 1134000, power: 986224 }, { food: 40500000, wood: 47100000, stone: 75000000, t: 3556800, power: 1545374 },
];
const ACADEMY_BUILD_TABLE = [
  { food: 500, wood: 800, t: 6, power: 5 }, { food: 1000, wood: 1500, t: 40, power: 11 }, { food: 2000, wood: 2800, t: 160, power: 27 },
  { food: 3800, wood: 5000, stone: 800, t: 360, power: 61 }, { food: 6800, wood: 9000, stone: 1500, t: 1200, power: 145 },
  { food: 11500, wood: 15500, stone: 3200, t: 3200, power: 336 }, { food: 17300, wood: 23300, stone: 5000, t: 6420, power: 688 },
  { food: 26000, wood: 35000, stone: 8000, t: 12780, power: 1346 }, { food: 39000, wood: 52500, stone: 12800, t: 25620, power: 2591 },
  { food: 58500, wood: 78800, stone: 20500, t: 51180, power: 4975 }, { food: 90000, wood: 120000, stone: 32500, t: 61440, power: 7970 },
  { food: 135000, wood: 180000, stone: 50000, t: 73740, power: 11679 }, { food: 202500, wood: 270000, stone: 75000, t: 90000, power: 16387 },
  { food: 305000, wood: 405000, stone: 112500, t: 104400, power: 22391 }, { food: 457500, wood: 607500, stone: 170000, t: 126000, power: 30127 },
  { food: 687500, wood: 912500, stone: 255000, t: 151200, power: 40207 }, { food: 1000000, wood: 1400000, stone: 382500, t: 183600, power: 53497 },
  { food: 1600000, wood: 2100000, stone: 575000, t: 219600, power: 71227 }, { food: 2300000, wood: 3100000, stone: 875000, t: 262800, power: 95369 },
  { food: 3500000, wood: 4700000, stone: 1300000, t: 316800, power: 128424 }, { food: 5250000, wood: 7050000, stone: 2000000, t: 536400, power: 174240 },
  { food: 7900000, wood: 10600000, stone: 3000000, t: 493200, power: 239921 }, { food: 11800000, wood: 15900000, stone: 4500000, t: 691200, power: 336515 },
  { food: 17800000, wood: 24000000, stone: 6800000, t: 1036800, power: 481806 }, { food: 26800000, wood: 36000000, stone: 10200000, t: 1209600, power: 783449 },
];
const STORE_BUILD_TABLE = [
  { food: 250, wood: 250, t: 9, power: 5 }, { food: 500, wood: 500, t: 18, power: 10 }, { food: 1000, wood: 1000, t: 80, power: 17 },
  { food: 2000, wood: 2000, t: 400, power: 41 }, { food: 3800, wood: 3800, t: 900, power: 92 },
  { food: 6500, wood: 6500, stone: 3800, t: 1800, power: 201 }, { food: 9800, wood: 9800, stone: 6000, t: 3600, power: 402 },
  { food: 14800, wood: 14800, stone: 9600, t: 7200, power: 778 }, { food: 22300, wood: 22300, stone: 15400, t: 14400, power: 1489 },
  { food: 33500, wood: 33500, stone: 24600, t: 28800, power: 2848 }, { food: 52500, wood: 52500, stone: 37500, t: 34560, power: 4552 },
  { food: 80000, wood: 80000, stone: 57500, t: 41460, power: 6703 }, { food: 120000, wood: 120000, stone: 87500, t: 49740, power: 9436 },
  { food: 180000, wood: 180000, stone: 132500, t: 59700, power: 12942 }, { food: 270000, wood: 270000, stone: 200000, t: 71640, power: 17488 },
  { food: 405000, wood: 405000, stone: 300000, t: 85980, power: 23447 }, { food: 607500, wood: 607500, stone: 450000, t: 104400, power: 31354 },
  { food: 925000, wood: 925000, stone: 675000, t: 122400, power: 42032 }, { food: 1400000, wood: 1400000, stone: 1000000, t: 147600, power: 56560 },
  { food: 2100000, wood: 2100000, stone: 1600000, t: 176400, power: 76832 }, { food: 3200000, wood: 3200000, stone: 2300000, t: 212400, power: 104966 },
  { food: 4700000, wood: 4700000, stone: 3500000, t: 277200, power: 145492 }, { food: 7100000, wood: 7100000, stone: 5300000, t: 388800, power: 205219 },
  { food: 10800000, wood: 10800000, stone: 8000000, t: 583200, power: 295585 }, { food: 16200000, wood: 16200000, stone: 12000000, t: 0, power: 478367 },
];
const HOSPITAL_BUILD_TABLE = [
  { food: 1000, wood: 1000, t: 12, power: 5 }, { food: 2000, wood: 2000, t: 24, power: 13 }, { food: 3800, wood: 3800, t: 100, power: 32 },
  { food: 3800, wood: 3800, t: 150, power: 65 }, { food: 12300, wood: 12300, t: 1200, power: 162 },
  { food: 21000, wood: 21000, stone: 8200, t: 2400, power: 366 }, { food: 31500, wood: 31500, stone: 13000, t: 4800, power: 723 },
  { food: 47300, wood: 47300, stone: 20800, t: 7200, power: 1262 }, { food: 71000, wood: 71000, stone: 33300, t: 10800, power: 2077 },
  { food: 106500, wood: 106500, stone: 53300, t: 16200, power: 3310 }, { food: 160000, wood: 160000, stone: 80000, t: 19440, power: 4967 },
  { food: 240000, wood: 240000, stone: 120000, t: 23340, power: 7220 }, { food: 360000, wood: 360000, stone: 180000, t: 28020, power: 10319 },
  { food: 540000, wood: 540000, stone: 270000, t: 33540, power: 14632 }, { food: 810000, wood: 810000, stone: 405000, t: 40320, power: 20699 },
  { food: 1200000, wood: 1200000, stone: 607500, t: 48360, power: 29316 }, { food: 1800000, wood: 1800000, stone: 912500, t: 58020, power: 41665 },
  { food: 2800000, wood: 2800000, stone: 1400000, t: 69660, power: 59576 }, { food: 4100000, wood: 4100000, stone: 2100000, t: 83580, power: 85644 },
  { food: 6200000, wood: 6200000, stone: 3100000, t: 100800, power: 123830 }, { food: 9300000, wood: 9300000, stone: 4700000, t: 118800, power: 179944 },
  { food: 14000000, wood: 14000000, stone: 7100000, t: 154800, power: 263152 }, { food: 20900000, wood: 20900000, stone: 10600000, t: 219600, power: 387338 },
  { food: 31500000, wood: 31500000, stone: 16000000, t: 327600, power: 574480 }, { food: 47200000, wood: 47200000, stone: 24000000, t: 0, power: 881480 },
];
const FARM_TABLE = [
  { wood: 100, t: 2, power: 5 }, { wood: 200, t: 15, power: 11 }, { wood: 300, t: 60, power: 18 },
  { wood: 500, t: 90, power: 28 }, { wood: 1000, t: 120, power: 38 },
  { wood: 1800, stone: 1000, t: 600, power: 68 }, { wood: 2700, stone: 1600, t: 1800, power: 150 },
  { wood: 4000, stone: 2600, t: 3600, power: 309 }, { wood: 6000, stone: 4200, t: 5400, power: 549 },
  { wood: 9000, stone: 6600, t: 7200, power: 874 }, { wood: 15000, stone: 10000, t: 10800, power: 1366 },
  { wood: 22500, stone: 15000, t: 14400, power: 2032 }, { wood: 35000, stone: 22500, t: 22020, power: 3049 },
  { wood: 52500, stone: 35000, t: 28980, power: 4419 }, { wood: 80000, stone: 52500, t: 36000, power: 6176 },
  { wood: 120000, stone: 80000, t: 48000, power: 8576 }, { wood: 180000, stone: 120000, t: 64980, power: 11896 },
  { wood: 275000, stone: 200000, t: 79980, power: 16246 }, { wood: 425000, stone: 300000, t: 100800, power: 21966 },
  { wood: 650000, stone: 450000, t: 129600, power: 29846 }, { wood: 975000, stone: 675000, t: 158400, power: 40211 },
  { wood: 1500000, stone: 1000000, t: 208800, power: 54646 }, { wood: 2200000, stone: 1600000, t: 280800, power: 74946 },
  { wood: 3500000, stone: 2500000, t: 349200, power: 103446 }, { wood: 5200000, stone: 3800000, t: 439200, power: 143196 },
];
const LUMBER_TABLE = [
  { food: 100, t: 2, power: 5 }, { food: 200, t: 15, power: 11 }, { food: 300, t: 60, power: 18 },
  { food: 500, t: 90, power: 28 }, { food: 1000, t: 120, power: 38 },
  { food: 1800, stone: 1000, t: 600, power: 68 }, { food: 2700, stone: 1600, t: 1800, power: 150 },
  { food: 4000, stone: 2600, t: 3600, power: 309 }, { food: 6000, stone: 4200, t: 5400, power: 549 },
  { food: 9000, stone: 6600, t: 7200, power: 874 }, { food: 15000, stone: 10000, t: 10800, power: 1366 },
  { food: 22500, stone: 15000, t: 14400, power: 2032 }, { food: 35000, stone: 22500, t: 22020, power: 3049 },
  { food: 52500, stone: 35000, t: 28980, power: 4419 }, { food: 80000, stone: 52500, t: 36000, power: 6176 },
  { food: 120000, stone: 80000, t: 48000, power: 8576 }, { food: 180000, stone: 120000, t: 64980, power: 11896 },
  { food: 275000, stone: 200000, t: 79980, power: 16246 }, { food: 425000, stone: 300000, t: 100800, power: 21966 },
  { food: 650000, stone: 450000, t: 129600, power: 29846 }, { food: 975000, stone: 675000, t: 158400, power: 40211 },
  { food: 1500000, stone: 1000000, t: 208800, power: 54646 }, { food: 2200000, stone: 1600000, t: 280800, power: 74946 },
  { food: 3500000, stone: 2500000, t: 349200, power: 103446 }, { food: 5200000, stone: 3800000, t: 439200, power: 143196 },
];
const QUARRY_TABLE = [
  { food: 100, wood: 100, t: 10, power: 5 }, { food: 300, wood: 300, t: 60, power: 10 }, { food: 500, wood: 500, t: 120, power: 16 },
  { food: 1000, wood: 1000, t: 300, power: 32 }, { food: 2000, wood: 2000, t: 1200, power: 88 },
  { food: 3500, wood: 3500, t: 2400, power: 198 }, { food: 5300, wood: 5300, t: 4200, power: 387 },
  { food: 8000, wood: 8000, t: 5220, power: 627 }, { food: 12000, wood: 12000, t: 6480, power: 934 },
  { food: 18000, wood: 18000, t: 8640, power: 1351 }, { food: 27500, wood: 27500, t: 12960, power: 1979 },
  { food: 42500, wood: 42500, t: 19440, power: 2926 }, { food: 65000, wood: 65000, t: 24180, power: 4152 },
  { food: 97500, wood: 97500, t: 29160, power: 5708 }, { food: 147500, wood: 147500, t: 34800, power: 7690 },
  { food: 222500, wood: 222500, t: 42000, power: 10260 }, { food: 335000, wood: 335000, t: 60000, power: 14000 },
  { food: 525000, wood: 525000, t: 78000, power: 19220 }, { food: 800000, wood: 800000, t: 97200, power: 26260 },
  { food: 1200000, wood: 1200000, t: 118800, power: 35860 }, { food: 1800000, wood: 1800000, t: 154800, power: 49300 },
  { food: 2700000, wood: 2700000, t: 190800, power: 67780 }, { food: 4100000, wood: 4100000, t: 252000, power: 94060 },
  { food: 6300000, wood: 6300000, t: 334800, power: 132500 }, { food: 9500000, wood: 9500000, t: 540000, power: 192100 },
];
const MINE_TABLE = [
  { food: 500, wood: 500, t: 10, power: 6 }, { food: 1000, wood: 1000, t: 240, power: 19 }, { food: 2000, wood: 2000, t: 480, power: 46 },
  { food: 3800, wood: 3800, stone: 2500, t: 800, power: 100 }, { food: 6800, wood: 6800, stone: 5000, t: 1920, power: 219 },
  { food: 11500, wood: 11500, stone: 12000, t: 2500, power: 401 }, { food: 17300, wood: 17300, stone: 19200, t: 4320, power: 699 },
  { food: 26000, wood: 26000, stone: 30800, t: 6000, power: 1335 }, { food: 39000, wood: 39000, stone: 49200, t: 7980, power: 1758 },
  { food: 58500, wood: 58500, stone: 78700, t: 10980, power: 2668 }, { food: 90000, wood: 90000, stone: 120000, t: 14880, power: 3984 },
  { food: 135000, wood: 135000, stone: 180000, t: 22380, power: 5958 }, { food: 202500, wood: 202500, stone: 270000, t: 27480, power: 8678 },
  { food: 305000, wood: 305000, stone: 405000, t: 33540, power: 12454 }, { food: 457500, wood: 457500, stone: 607500, t: 40020, power: 17707 },
  { food: 687500, wood: 687500, stone: 912500, t: 48300, power: 25126 }, { food: 1000000, wood: 1000000, stone: 1400000, t: 69000, power: 36126 },
  { food: 1600000, wood: 1600000, stone: 2100000, t: 86400, power: 52139 }, { food: 2300000, wood: 2300000, stone: 3100000, t: 111600, power: 75230 },
  { food: 3500000, wood: 3500000, stone: 4700000, t: 136800, power: 108850 }, { food: 5300000, wood: 5300000, stone: 7100000, t: 180000, power: 158176 },
  { food: 7900000, wood: 7900000, stone: 10600000, t: 219600, power: 230233 }, { food: 11800000, wood: 11800000, stone: 15900000, t: 291600, power: 336750 },
  { food: 17800000, wood: 17800000, stone: 24000000, t: 385200, power: 495206 }, { food: 26800000, wood: 26800000, stone: 36000000, t: 612000, power: 735046 },
];
const WATCH_TABLE = [
  { food: 400, wood: 400, t: 15, power: 5 }, { food: 800, wood: 800, t: 30, power: 11 }, { food: 1500, wood: 1500, t: 100, power: 21 },
  { food: 2800, wood: 2800, t: 300, power: 44 }, { food: 5000, wood: 5000, t: 900, power: 100 },
  { food: 8500, wood: 8500, stone: 1300, t: 2100, power: 221 }, { food: 12800, wood: 12800, stone: 2000, t: 4200, power: 446 },
  { food: 19300, wood: 19300, stone: 3200, t: 8400, power: 868 }, { food: 29000, wood: 29000, stone: 5200, t: 16800, power: 1671 },
  { food: 43500, wood: 43500, stone: 8200, t: 33600, power: 3213 }, { food: 67500, wood: 67500, stone: 12500, t: 40320, power: 5133 },
  { food: 102500, wood: 102500, stone: 20000, t: 48360, power: 7538 }, { food: 155000, wood: 155000, stone: 30000, t: 58080, power: 10570 },
  { food: 232500, wood: 232500, stone: 45000, t: 69660, power: 14421 }, { food: 350000, wood: 350000, stone: 67500, t: 83580, power: 19367 },
  { food: 525000, wood: 525000, stone: 102500, t: 100800, power: 25787 }, { food: 787500, wood: 787500, stone: 155000, t: 118800, power: 34217 },
  { food: 1200000, wood: 1200000, stone: 250000, t: 144000, power: 45545 }, { food: 1800000, wood: 1800000, stone: 375000, t: 172800, power: 60804 },
  { food: 2700000, wood: 2700000, stone: 575000, t: 208800, power: 81650 }, { food: 4100000, wood: 4100000, stone: 875000, t: 248400, power: 110460 },
  { food: 6100000, wood: 6100000, stone: 1300000, t: 324000, power: 151716 }, { food: 9100000, wood: 9100000, stone: 2000000, t: 453600, power: 212389 },
  { food: 13800000, wood: 13800000, stone: 3000000, t: 680400, power: 303649 }, { food: 20800000, wood: 20800000, stone: 4500000, t: 1234800, power: 495562 },
];
const SCOUT_TABLE = [
  { food: 300, wood: 300, t: 4, power: 5 }, { food: 500, wood: 500, t: 15, power: 10 }, { food: 1000, wood: 1000, t: 60, power: 16 },
  { food: 2000, wood: 2000, t: 210, power: 32 }, { food: 3800, wood: 3800, t: 850, power: 81 },
  { food: 6500, wood: 6500, t: 2100, power: 191 }, { food: 9800, wood: 9800, t: 4200, power: 398 },
  { food: 14800, wood: 14800, t: 7800, power: 769 }, { food: 22300, wood: 22300, t: 10380, power: 1274 },
  { food: 31300, wood: 31300, t: 14280, power: 1971 }, { food: 42500, wood: 42500, t: 19380, power: 2916 },
  { food: 52500, wood: 52500, t: 28980, power: 4286 }, { food: 60000, wood: 60000, t: 35760, power: 5956 },
  { food: 67500, wood: 67500, t: 43560, power: 7969 }, { food: 75000, wood: 75000, t: 52020, power: 10350 },
  { food: 82500, wood: 82500, t: 62760, power: 13191 }, { food: 92500, wood: 92500, t: 86400, power: 17149 },
  { food: 102500, wood: 102500, t: 115200, power: 22223 }, { food: 115000, wood: 115000, t: 144000, power: 28423 },
  { food: 127500, wood: 127500, t: 180000, power: 36109 }, { food: 142500, wood: 142500, t: 234000, power: 46007 },
  { food: 157500, wood: 157500, t: 288000, power: 58118 }, { food: 250000, wood: 250000, t: 378000, power: 74187 },
  { food: 500000, wood: 500000, t: 504000, power: 96279 }, { food: 650000, wood: 650000, t: 669600, power: 139023 },
];
// index.html:1695 FORGE_TABLE — Горн, единственная строка данных (RoK-
// кузница без уровней вообще, апгрейдов не бывает — см. BUILD_MAX_LV_OVERRIDE
// ниже). Фаза 11, кусочек 1 — до сих пор нигде не деплоилось (mp-build
// сам об этом честно предупреждал: "кузница пока не переносилась").
const FORGE_TABLE = [{ food: 1000, wood: 1000, stone: 1000, t: 11, power: 5 }];
// Портал — своей выдумки, прообраза в RoK нет. Раньше пользовался общей
// BUILD_TABLE ниже (на деле кривая Ратуши, 1 уровень бесплатный — годится
// для стартового здания, но не для того, что игрок строит с нуля) — теперь
// собственная таблица, среднее Академии и Стены по каждому полю на каждом
// уровне (см. index.html:PORTAL_TABLE, те же самые числа).
const PORTAL_TABLE = [
  { food: 250, wood: 400, t: 3, power: 5 },
  { food: 1650, wood: 2150, t: 21, power: 13 },
  { food: 3150, wood: 3900, t: 125, power: 32 },
  { food: 5800, wood: 7000, stone: 400, t: 480, power: 78 },
  { food: 10400, wood: 12700, stone: 750, t: 1500, power: 186 },
  { food: 14800, wood: 18300, stone: 14100, t: 3350, power: 428 },
  { food: 22200, wood: 27700, stone: 22500, t: 6720, power: 863 },
  { food: 33500, wood: 41000, stone: 36000, t: 13380, power: 1656 },
  { food: 50000, wood: 61800, stone: 57600, t: 26820, power: 3124 },
  { food: 75300, wood: 92400, stone: 92300, t: 53580, power: 5880 },
  { food: 114000, wood: 140000, stone: 141000, t: 64320, power: 9393 },
  { food: 171000, wood: 210000, stone: 213000, t: 77190, power: 13870 },
  { food: 256000, wood: 315000, stone: 320000, t: 93600, power: 19676 },
  { food: 385000, wood: 473000, stone: 481000, t: 109800, power: 27280 },
  { food: 578000, wood: 709000, stone: 735000, t: 145800, power: 37355 },
  { food: 844000, wood: 1060000, stone: 1080000, t: 158400, power: 50874 },
  { food: 1300000, wood: 1600000, stone: 1640000, t: 192600, power: 69237 },
  { food: 2000000, wood: 2400000, stone: 2490000, t: 230400, power: 94544 },
  { food: 2900000, wood: 3600000, stone: 3740000, t: 275400, power: 129869 },
  { food: 4400000, wood: 5450000, stone: 5600000, t: 331200, power: 179600 },
  { food: 6630000, wood: 8180000, stone: 8400000, t: 477000, power: 250281 },
  { food: 9950000, wood: 12300000, stone: 12600000, t: 516600, power: 353115 },
  { food: 14900000, wood: 18400000, stone: 18900000, t: 723600, power: 505339 },
  { food: 22400000, wood: 27700000, stone: 28400000, t: 1085400, power: 734015 },
  { food: 33700000, wood: 41600000, stone: 42600000, t: 2383200, power: 1164412 },
];
// Рынок/Центр Альянса — цена/время/мощь по 25 уровням дословно из таблицы
// RoK (Trading Post/Alliance Center), которую прислал автор — время из
// "Xд Yч Zм Wс" переведено в секунды, ресурсы K/M — в целые числа, формат
// строк тот же {food,wood,stone,t,power}, что и у остальных таблиц этого
// файла. Требование "Trading Post 10+ требует Goldmine N" из источника не
// переносил — ни у одного ДРУГОГО здания в этом файле нет межздание-вого
// гейта (только общий nextLv<=hallLv), заводить его только для одного
// здания значило бы ломать единообразие ради частности, которую не просили.
// Своего игрового эффекта (обмен ресурсами между игроками у Trading Post,
// помощь гильдии у Alliance Center) тоже не заводил — ни того, ни другого
// механически в игре нет, здания просто строятся/растут и дают мощь,
// как и было прямо попрошено (см. тот же довод в index.html:BUILDINGS).
const TRADING_TABLE = [
  { food: 400, wood: 700, t: 15, power: 5 }, { food: 800, wood: 1300, t: 90, power: 10 }, { food: 1500, wood: 2300, t: 240, power: 27 },
  { food: 2800, wood: 4300, t: 1080, power: 84 }, { food: 5000, wood: 7800, t: 2100, power: 193 },
  { food: 8500, wood: 13300, stone: 5000, t: 3200, power: 379 }, { food: 12800, wood: 19900, stone: 7500, t: 4200, power: 634 },
  { food: 19300, wood: 30000, stone: 11300, t: 8400, power: 1102 }, { food: 29000, wood: 45000, stone: 17000, t: 16800, power: 1973 },
  { food: 43500, wood: 67500, stone: 25500, t: 33600, power: 3615 }, { food: 67500, wood: 102500, stone: 40000, t: 40320, power: 5687 },
  { food: 102500, wood: 155000, stone: 60000, t: 48360, power: 8317 }, { food: 155000, wood: 232500, stone: 90000, t: 58080, power: 11684 },
  { food: 232500, wood: 350000, stone: 135000, t: 69660, power: 16040 }, { food: 350000, wood: 525000, stone: 202500, t: 83580, power: 21741 },
  { food: 525000, wood: 787500, stone: 305000, t: 100800, power: 29294 }, { food: 787500, wood: 1200000, stone: 457500, t: 118800, power: 39422 },
  { food: 1200000, wood: 1800000, stone: 700000, t: 144000, power: 53250 }, { food: 1800000, wood: 2700000, stone: 1100000, t: 172800, power: 72284 },
  { food: 2700000, wood: 4000000, stone: 1600000, t: 208800, power: 98780 }, { food: 4100000, wood: 6100000, stone: 2400000, t: 248400, power: 136090 },
  { food: 6100000, wood: 9100000, stone: 3600000, t: 324000, power: 190096 }, { food: 9100000, wood: 13600000, stone: 5400000, t: 453600, power: 269894 },
  { food: 13800000, wood: 20500000, stone: 8300000, t: 680400, power: 390404 }, { food: 20800000, wood: 30800000, stone: 12500000, t: 2384640, power: 626317 },
];
const ALLIANCE_TABLE = [
  { food: 500, wood: 500, t: 7, power: 5 }, { food: 1000, wood: 1000, t: 35, power: 10 }, { food: 2000, wood: 2000, t: 90, power: 21 },
  { food: 3800, wood: 3800, t: 420, power: 53 }, { food: 6800, wood: 6800, t: 900, power: 116 },
  { food: 11500, wood: 11500, stone: 4400, t: 2250, power: 265 }, { food: 17300, wood: 17300, stone: 7000, t: 4500, power: 535 },
  { food: 26000, wood: 26000, stone: 11200, t: 9000, power: 1032 }, { food: 39000, wood: 39000, stone: 18000, t: 18000, power: 1962 },
  { food: 58500, wood: 58500, stone: 28700, t: 36000, power: 3722 }, { food: 90000, wood: 90000, stone: 45000, t: 43200, power: 5945 },
  { food: 135000, wood: 135000, stone: 67500, t: 51840, power: 8761 }, { food: 202500, wood: 202500, stone: 102500, t: 62160, power: 12366 },
  { food: 305000, wood: 305000, stone: 155000, t: 74640, power: 17036 }, { food: 457500, wood: 457500, stone: 232500, t: 90000, power: 23146 },
  { food: 687500, wood: 687500, stone: 350000, t: 108000, power: 31245 }, { food: 1000000, wood: 1000000, stone: 525000, t: 129600, power: 42109 },
  { food: 1600000, wood: 1600000, stone: 800000, t: 151200, power: 56900 }, { food: 2300000, wood: 2300000, stone: 1200000, t: 183600, power: 77229 },
  { food: 3500000, wood: 3500000, stone: 1800000, t: 223200, power: 105544 }, { food: 5300000, wood: 5300000, stone: 2700000, t: 266400, power: 145342 },
  { food: 7900000, wood: 7900000, stone: 4100000, t: 345600, power: 202900 }, { food: 11800000, wood: 11800000, stone: 6100000, t: 486000, power: 287897 },
  { food: 17800000, wood: 17800000, stone: 9300000, t: 730800, power: 415855 }, { food: 26800000, wood: 26800000, stone: 14000000, t: 0, power: 667083 },
];
const BUILD_BLD_TABLE = {
  barracks: BARRACKS_TABLE, range: BARRACKS_TABLE, stable: BARRACKS_TABLE, siege: SIEGE_TABLE,
  hall: HALL_TABLE, wall: WALL_TABLE, store: STORE_BUILD_TABLE, academy: ACADEMY_BUILD_TABLE, hospital: HOSPITAL_BUILD_TABLE,
  farm: FARM_TABLE, lumber: LUMBER_TABLE, quarry: QUARRY_TABLE, mine: MINE_TABLE,
  garrison: WATCH_TABLE, scout: SCOUT_TABLE, forge: FORGE_TABLE, portal: PORTAL_TABLE,
  market: TRADING_TABLE, alliance: ALLIANCE_TABLE,
};
const BUILD_MAX_LV = 25;
// index.html:2777 buildingMax — потолок здания — .max конкретного здания
// (BUILDINGS[bk].max), не выше общего CFG.MAX_LEVEL. У всех зданий этого
// модуля .max===25 (общий потолок), кроме Горна — max:1 (разовая
// постройка). Единственное здание с явным override, поэтому отдельная
// табличка, а не полный перенос BUILDINGS.*.max.
const BUILD_MAX_LV_OVERRIDE = { forge: 1 };
const buildingMax = (bk) => BUILD_MAX_LV_OVERRIDE[bk] || BUILD_MAX_LV;
// hospital/farm/lumber/quarry/mine — multi-здания (BUILDINGS.*.plots в
// index.html), у каждого 4 участка (индексы 0-3). Участок 0 разблокирован
// всегда, участки 1-3 — по эпохе ратуши (epochOf/plotUnlocked ниже,
// index.html:2453/2854). Приток ресурсов сам по себе (production(),
// тикает по реальному времени через resAt) уже перенесён отдельно — этот
// файл только строит/улучшает участки, синкает баланс перед оплатой.
const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);
const HALL_REQ = ["wall", "store", "academy", "barracks", "hospital"];
const BUILD_BLD_RU_NAME = { wall: "Стена", store: "Склад", academy: "Академия", barracks: "Казармы", hospital: "Госпиталь" };

// =============================================================================
// Свободная застройка (index.html: CITY_GRID/BUILDINGS.*.footprint/
// collisionOk/PLACEABLE_BKEYS) — дословная копия, синхронно править в обе
// стороны при изменении сетки/footprint (импортов между Edge Functions нет,
// см. заголовок файла). Ратуша и стена сюда не входят — фиксированы по
// смыслу, в p.layout никогда не попадают.
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
const PLACEABLE_BKEYS = Object.keys(BUILD_BLD_TABLE).filter((k) => k !== "hall" && k !== "wall");
function collisionOk(layout, footprint, gx, gy, excludeIdx) {
  const { w, h } = footprint;
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) return false;
  if (gx < 0 || gy < 0 || gx + w > CITY_GRID.w || gy + h > CITY_GRID.h) return false;
  for (let y = gy; y < gy + h; y++) {
    const row = CITY_GRID.mask[y];
    for (let x = gx; x < gx + w; x++) if (row[x] !== "1") return false;
  }
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
// Достраивает p.layout для уже стоящих (level>0) размещаемых зданий, у
// которых ещё нет записи в layout — легаси-игроки/сама миграция на эту
// систему. Только ДОБАВЛЯЕТ недостающее, никогда не двигает/не убирает уже
// расставленное — безопасно звать безусловно на каждый вызов (mp-join и
// здесь — та же степень паранойи, что и у самоисцеления BUILD_MULTI выше).
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
function buildDuration(bk, lv, buildBonus = 1) { return tblRow(BUILD_BLD_TABLE[bk], lv).t / buildBonus; }
function buildCost(bk, lv, buildCostCut = 0) {
  const r = tblRow(BUILD_BLD_TABLE[bk], lv), cut = 1 - buildCostCut;
  return { food: Math.round((r.food || 0) * cut), wood: Math.round((r.wood || 0) * cut), stone: Math.round((r.stone || 0) * cut), gold: 0 };
}
function buildLv(p, bk) {
  const raw = p.b[bk];
  return BUILD_MULTI.has(bk) ? ((Array.isArray(raw) ? raw[0] : raw) || 0) : (raw || 0);
}
// index.html:2854 epochOf — эпоха ратуши (1..5).
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
// index.html:2453 plotUnlocked — участок 0 у multi-зданий открыт всегда,
// участок N (1-3) — с эпохи N+1 (участок 1 → эпоха 2 → ратуша 7 ур.,
// участок 2 → эпоха 3 → ратуша 13 ур., участок 3 → эпоха 4 → ратуша 19 ур.).
const plotUnlocked = (bk, idx, hall) => !BUILD_MULTI.has(bk) || idx === 0 || epochOf(hall) >= idx + 1;
// index.html:5724 cur — уровень КОНКРЕТНОГО участка multi-здания (buildLv
// выше — только участок 0, годится для HALL_REQ, но не для стройки).
function buildLvAt(p, bk, plot) {
  const raw = p.b[bk];
  return BUILD_MULTI.has(bk) ? ((Array.isArray(raw) ? raw[plot] : (plot === 0 ? raw : 0)) || 0) : (raw || 0);
}
const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });
// Добыча ресурсов по времени (index.html:3790/3813/3838, см. _shared/
// rules.js) — дергаем перед canPay/pay, чтобы цена постройки списывалась с
// актуального баланса.
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
const prodRate = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv));
const plotCap = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv) * 10);
const PROD_BLD = { food: "farm", wood: "lumber", stone: "quarry", gold: "mine" };
const PROD_MULT = { food: 1, wood: 1, stone: 0.75, gold: 0.5 };
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
//      мира (mp-build, отдельный кусочек после Фазы 11, своя PORTAL_TABLE),
//      p.b.portal — реальный уровень, не всегда 0.
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
    if (!BUILD_BLD_TABLE[bk])
      return jsonResponse({ err: "Неизвестное здание" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    // Самоисцеление легаси-записей — см. тот же комментарий в mp-train/mp-heal.
    p.race = p.race || row.race;
    // Самоисцеление старых записей: до соответствующих шагов переноса
    // mp-join заводил multi-здания (hospital, потом farm/lumber/quarry/
    // mine) скаляром (0), а не участком [0,0,0,0] (BUILDINGS.*.plots=4 в
    // index.html) — на новых join уже исправлено везде, здесь достраиваем
    // задним числом тех, кто успел зайти раньше любого из этих исправлений.
    for (const k of BUILD_MULTI) if (!Array.isArray(p.b[k])) p.b[k] = [p.b[k] || 0, 0, 0, 0];
    ensureLayout(p);

    const now = Date.now() / 1000;
    syncRes(p, now);

    const isMulti = BUILD_MULTI.has(bk);
    // Участок передаётся телом запроса только у multi-зданий; у остальных
    // всегда null (как и раньше). body.plot не число/вне 0-3 -> 0 (тот же
    // единственный участок, что был единственным вариантом до этого шага).
    const plotReq = isMulti ? (Number.isInteger(body.plot) ? clamp(body.plot, 0, 3) : 0) : null;
    const plotKey = plotReq;
    // Новый экземпляр (первая постройка на пустом месте) — только у
    // размещаемых зданий (не ратуша/стена) и только пока в p.layout ещё нет
    // записи на этот bk/plot. Обычный апгрейд уже стоящего здания (кнопка
    // "Улучшить") gx/gy в теле не шлёт вообще — сюда просто не попадает.
    const isNewInstance = PLACEABLE_BKEYS.includes(bk) && !p.layout.some((e) => e.b === bk && e.plot === plotKey);
    let placeGx = null, placeGy = null;
    if (isNewInstance) {
      const fp = BUILD_FOOTPRINT[bk];
      placeGx = body.gx; placeGy = body.gy;
      if (!collisionOk(p.layout, fp, placeGx, placeGy, -1))
        return jsonResponse({ err: "Нельзя строить здесь — клетка занята или вне города" }, 400);
    }

    // Дословно startBuild(p,bk,plot) из index.html:5712-5726.
    if (isMulti && !plotUnlocked(bk, plotReq, buildLv(p, "hall")))
      return jsonResponse({ err: "Участок откроется позже" }, 400);
    if (p.queues.some((q) => q && q.b === bk && q.plot === plotKey))
      return jsonResponse({ err: "Эта постройка уже в работе у одной из бригад" }, 400);
    const trainType = BLD_TRAIN[bk];
    if (trainType && p.train[trainType])
      return jsonResponse({ err: "Здание занято набором войск — дождитесь окончания" }, 400);
    const cur = isMulti ? buildLvAt(p, bk, plotReq) : buildLv(p, bk);
    const lv = cur + 1;
    if (lv > buildingMax(bk)) return jsonResponse({ err: "Максимальный уровень" }, 400);
    const hallLv = buildLv(p, "hall");
    if (bk === "hall") {
      const need = HALL_REQ.filter((k) => buildLv(p, k) < hallLv);
      if (need.length)
        return jsonResponse({ err: "Сначала до " + hallLv + " ур.: " + need.map((k) => BUILD_BLD_RU_NAME[k]).join(", ") }, 400);
    } else if (lv > hallLv) {
      return jsonResponse({ err: "Требуется ратуша " + lv + " уровня" }, 400);
    }
    const slot = p.queues.findIndex((q) => !q);
    if (slot < 0) return jsonResponse({ err: "Обе бригады заняты" }, 400);
    const B = bonuses(p);
    const c = buildCost(bk, lv, B.buildCostCut);
    if (!canPay(p.res, c)) return jsonResponse({ err: "Не хватает ресурсов" }, 400);
    pay(p.res, c);

    const t = buildDuration(bk, lv, B.build);
    p.queues[slot] = { b: bk, lv, plot: plotKey, t0: now, t1: now + t };
    // Место на карте фиксируется сразу при СТАРТЕ стройки (не по завершении)
    // — footprint сразу блокирует его для других зданий, а на карте видно
    // "в процессе" по data-layout ещё до того, как applyBuild() в mp-tick
    // пропишет p.b[bk] (см. index.html: план "Свободная застройка").
    if (isNewInstance) p.layout.push({ b: bk, plot: plotKey, gx: placeGx, gy: placeGy });

    const { error: updErr } = await admin
      .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) return jsonResponse({ err: updErr.message }, 500);

    const fireAt = new Date(Date.now() + t * 1000).toISOString();
    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: fireAt, type: "build",
      data: { player_id: row.id, slot },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, eta: t, fire_at: fireAt, lv });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
