// =============================================================================
// mp-build — Фаза 5: постройка/улучшение зданий. Первый кусочек (barracks/
// range/stable/siege) уже был; теперь добавлены hall/wall/store/academy/
// hospital — все 5 из HALL_REQ плюс сама ратуша, без которых ратуша не
// поднимается выше 1 уровня (см. hallRequire ниже), а без ратуши все
// остальные здания упираются в "требуется ратуша N уровня". Оставшиеся
// постройки (ферма/лесопилка/каменоломня/шахта/дозор/разведка/горн) —
// следующие шаги переноса, каждая отдельно, тот же принцип.
// Зеркало startBuild(p,bk,plot) из index.html:5712.
//
// hospital — единственное multi-здание среди перенесённых (BUILDINGS.
// hospital.plots=4); портирован только участок 0 (у isMulti-зданий он
// разблокирован всегда — см. plotUnlocked в index.html — и это ровно тот
// участок, что нужен HALL_REQ). Участки 1-3 — следующий шаг, если
// понадобятся отдельно от разблокировки ратуши.
//
// bonuses(p).build/buildCostCut временно = 1/0 (без бонусов) — та же
// заглушка, что и trainSpeed в mp-train, см. _shared/rules.js.
//
// Тело запроса: { bk: "barracks"|"range"|"stable"|"siege"|"hall"|"wall"|
//                     "store"|"academy"|"hospital" }
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

const BARRACKS_TABLE = [
  { t: 0, power: 5 }, { food: 500, wood: 800, t: 20, power: 10 }, { food: 1000, wood: 1500, t: 60, power: 20 },
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
  { t: 0, power: 5 }, { food: 500, wood: 500, t: 18, power: 10 }, { food: 1000, wood: 1000, t: 80, power: 17 },
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
  { t: 0, power: 5 }, { food: 2000, wood: 2000, t: 24, power: 13 }, { food: 3800, wood: 3800, t: 100, power: 32 },
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
const BUILD_BLD_TABLE = {
  barracks: BARRACKS_TABLE, range: BARRACKS_TABLE, stable: BARRACKS_TABLE, siege: SIEGE_TABLE,
  hall: HALL_TABLE, wall: WALL_TABLE, store: STORE_BUILD_TABLE, academy: ACADEMY_BUILD_TABLE, hospital: HOSPITAL_BUILD_TABLE,
  farm: FARM_TABLE, lumber: LUMBER_TABLE, quarry: QUARRY_TABLE, mine: MINE_TABLE,
};
const BUILD_MAX_LV = 25;
// hospital/farm/lumber/quarry/mine — multi-здания (BUILDINGS.*.plots в
// index.html); портирован только участок 0 у каждого (см. комментарий в
// _shared/rules.js). Приток ресурсов от уровня фермы/лесопилки/каменоломни/
// шахты (production(), тикает по реальному времени) ещё НЕ перенесён — эти
// 4 здания пока можно строить/улучшать, но добыча сама по себе не идёт,
// это отдельный следующий шаг (другой тип механики — непрерывное
// накопление, а не разовое событие, как постройка/набор).
const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);
const HALL_REQ = ["wall", "store", "academy", "barracks", "hospital"];
const BUILD_BLD_RU_NAME = { wall: "Стена", store: "Склад", academy: "Академия", barracks: "Казармы", hospital: "Госпиталь" };
function buildDuration(bk, lv, buildBonus = 1) { return tblRow(BUILD_BLD_TABLE[bk], lv).t / buildBonus; }
function buildCost(bk, lv, buildCostCut = 0) {
  const r = tblRow(BUILD_BLD_TABLE[bk], lv), cut = 1 - buildCostCut;
  return { food: Math.round((r.food || 0) * cut), wood: Math.round((r.wood || 0) * cut), stone: Math.round((r.stone || 0) * cut), gold: 0 };
}
function buildLv(p, bk) {
  const raw = p.b[bk];
  return BUILD_MULTI.has(bk) ? ((Array.isArray(raw) ? raw[0] : raw) || 0) : (raw || 0);
}
const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });

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
      return jsonResponse({ err: "Пока перенесены только казармы/стрельбище/конюшня/мастерская/ратуша/стена/склад/академия/госпиталь" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!row) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    const p = row.state;
    // Самоисцеление старых записей: до соответствующих шагов переноса
    // mp-join заводил multi-здания (hospital, потом farm/lumber/quarry/
    // mine) скаляром (0), а не участком [0,0,0,0] (BUILDINGS.*.plots=4 в
    // index.html) — на новых join уже исправлено везде, здесь достраиваем
    // задним числом тех, кто успел зайти раньше любого из этих исправлений.
    for (const k of BUILD_MULTI) if (!Array.isArray(p.b[k])) p.b[k] = [p.b[k] || 0, 0, 0, 0];

    const isMulti = BUILD_MULTI.has(bk), plotKey = isMulti ? 0 : null;

    // Дословно startBuild(p,bk,plot) из index.html:5712-5726.
    if (p.queues.some((q) => q && q.b === bk && q.plot === plotKey))
      return jsonResponse({ err: "Эта постройка уже в работе у одной из бригад" }, 400);
    const trainType = BLD_TRAIN[bk];
    if (trainType && p.train[trainType])
      return jsonResponse({ err: "Здание занято набором войск — дождитесь окончания" }, 400);
    const cur = buildLv(p, bk);
    const lv = cur + 1;
    if (lv > BUILD_MAX_LV) return jsonResponse({ err: "Максимальный уровень" }, 400);
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
    const c = buildCost(bk, lv, 0);
    if (!canPay(p.res, c)) return jsonResponse({ err: "Не хватает ресурсов" }, 400);
    pay(p.res, c);

    const t = buildDuration(bk, lv, 1);
    const now = Date.now() / 1000;
    p.queues[slot] = { b: bk, lv, plot: plotKey, t0: now, t1: now + t };

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
