// =============================================================================
// Общий модуль правил — Фаза 2, начало.
// =============================================================================
// Это НЕ полный перенос bonuses()/RACES/GENERALS/ACADEMY_TREE и т.д. (тот
// перенос — отдельная большая задача на потом, см. supabase/README.md,
// раздел "Расчётные формулы"). Здесь ровно тот минимум чистых формул,
// который нужен первому пилотному действию (набор войск), скопирован
// буквально из index.html построчно, чтобы сервер считал так же, как
// клиент в одиночной игре. Источник в index.html — строки, указанные в
// комментариях у каждого блока ниже; при изменении формулы там её нужно
// поправить и тут.

// index.html: RES
export const RES = ["food", "wood", "stone", "gold"];

// index.html: TROOP_COST_COMBAT / TROOP_COST_SIEGE / troopCost
export const TROOP_COST_COMBAT = [
  { food: 10, wood: 10, stone: 0, gold: 0 },
  { food: 40, wood: 40, stone: 0, gold: 0 },
  { food: 100, wood: 100, stone: 20, gold: 0 },
  { food: 200, wood: 200, stone: 150, gold: 0 },
  { food: 350, wood: 350, stone: 350, gold: 80 },
];
export const TROOP_COST_SIEGE = [
  { food: 0, wood: 20, stone: 0, gold: 0 },
  { food: 0, wood: 50, stone: 30, gold: 0 },
  { food: 0, wood: 100, stone: 40, gold: 0 },
  { food: 0, wood: 250, stone: 100, gold: 0 },
  { food: 0, wood: 400, stone: 300, gold: 80 },
];
export const troopCost = (type, tier) =>
  (type === "sie" ? TROOP_COST_SIEGE : TROOP_COST_COMBAT)[tier - 1];

// index.html: TRAIN_TIME / trainTime
export const TRAIN_TIME = [3.6, 7.2, 12, 24, 48]; // сек за 1 юнита: T1..T5
export const trainTime = (type, tier) => TRAIN_TIME[tier - 1];

// index.html: TRAIN_BLD / BLD_TRAIN
export const TRAIN_BLD = { inf: "barracks", arc: "range", cav: "stable", sie: "siege" };
export const BLD_TRAIN = { barracks: "inf", range: "arc", stable: "cav", siege: "sie" };

// index.html: TRAIN_CAP / trainCap / tblRow
export const TRAIN_CAP = [
  20, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 700, 800,
  900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 2000,
];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
export const trainCap = (lv) => (lv <= 0 ? 0 : tblRow(TRAIN_CAP, lv));

// index.html: canPay / pay (без syncRes — тут это чистая функция от p.res,
// накопление ресурсов по времени в Фазе 2 ещё не перенесено на сервер, см.
// mp-train/index.js).
export const canPay = (res, c) => RES.every((r) => !c[r] || res[r] >= c[r]);
export const pay = (res, c) => RES.forEach((r) => { if (c[r]) res[r] -= c[r]; });

// index.html: trainDuration
//   trainTime(type,tier)*n/((1+p.b.hall*0.06)*(1+bonuses(p).trainSpeed))
// bonuses(p).trainSpeed — Фаза 6 подключила настоящий подсчёт (раса/эпоха
// рас/дефолтный генерал/дерево исследований), см. bonuses() ниже в этом
// файле; каждый вызывающий код сам считает B=bonuses(p) и передаёт
// B.trainSpeed сюда.
export function trainDuration(hallLv, type, tier, n, trainSpeedBonus = 0) {
  return (trainTime(type, tier) * n) / ((1 + hallLv * 0.06) * (1 + trainSpeedBonus));
}

// index.html:2840 healUnitCost — лечение раненого в лазарете стоит вдвое
// дешевле полного набора того же юнита и никогда не требует золота.
// healBonus — bonuses(p).heal (Фаза 6, настоящий подсчёт, см. trainDuration выше).
export function healUnitCost(type, tier, healBonus = 1) {
  const c = troopCost(type, tier);
  return {
    food: Math.round(((c.food || 0) / 2) * healBonus),
    wood: Math.round(((c.wood || 0) / 2) * healBonus),
    stone: Math.round(((c.stone || 0) / 2) * healBonus),
    gold: 0,
  };
}
// index.html:2844 healUnitTime — лечение вдвое быстрее набора того же юнита.
export const healUnitTime = (type, tier) => trainTime(type, tier) / 2;
// index.html:5778 healDuration — healSpeedBonus (bonuses(p).healSpeed) это
// готовый МАСШТАБ времени, стоящий в ЧИСЛИТЕЛЕ (дефолт 1 = "как обычно",
// МЕНЬШЕ значение = быстрее) — НЕ конвенция trainSpeed/build (бонус сверху
// единицы в знаменателе). В index.html эту формулу дважды чинили в
// неверном направлении подряд, там же подробный разбор почему — легко
// перепутать снова, если переносить не глядя на оригинал.
export function healDuration(hallLv, type, tier, n, healSpeedBonus = 1) {
  return (healUnitTime(type, tier) * n * healSpeedBonus) / (1 + hallLv * 0.06);
}

// =============================================================================
// Постройки — Фаза 5. Первый кусочек (казармы/стрельбище/конюшня/мастерская)
// уже был; этот довешивает ратушу и все 5 зданий из HALL_REQ (index.html:2463
// — wall/store/academy/barracks/hospital), без которых ратуша НЕ поднимается
// выше 1 уровня (см. hallRequire ниже) — а без ратуши все остальные здания
// сами упираются в потолок "требуется ратуша N уровня". Оставшиеся постройки
// (ферма/лесопилка/каменоломня/шахта/дозор/разведка/горн) — следующие шаги,
// каждая отдельным переносом, тот же принцип.
// Таблицы — буквальная копия из index.html (строки на момент переноса).
export const BARRACKS_TABLE = [
  { t: 0, power: 5 },
  { food: 500, wood: 800, t: 20, power: 10 },
  { food: 1000, wood: 1500, t: 60, power: 20 },
  { food: 2000, wood: 2800, t: 200, power: 37 },
  { food: 3800, wood: 5000, t: 1000, power: 94 },
  { food: 6500, wood: 8500, stone: 3400, t: 2750, power: 244 },
  { food: 9800, wood: 12800, stone: 5400, t: 5520, power: 525 },
  { food: 14800, wood: 19300, stone: 8700, t: 10980, power: 1059 },
  { food: 22300, wood: 29000, stone: 13900, t: 22020, power: 2083 },
  { food: 33500, wood: 43500, stone: 22200, t: 43980, power: 4063 },
  { food: 52500, wood: 67500, stone: 35000, t: 52800, power: 6520 },
  { food: 80000, wood: 102500, stone: 52500, t: 63360, power: 9576 },
  { food: 120000, wood: 155000, stone: 80000, t: 76020, power: 13407 },
  { food: 180000, wood: 232500, stone: 120000, t: 90000, power: 18241 },
  { food: 270000, wood: 350000, stone: 180000, t: 108000, power: 24400 },
  { food: 405000, wood: 525000, stone: 270000, t: 129600, power: 32325 },
  { food: 607500, wood: 787500, stone: 405000, t: 158400, power: 42636 },
  { food: 925000, wood: 1200000, stone: 625000, t: 190800, power: 56328 },
  { food: 1400000, wood: 1800000, stone: 950000, t: 226800, power: 74659 },
  { food: 2100000, wood: 2700000, stone: 1400000, t: 273600, power: 99431 },
  { food: 3200000, wood: 4100000, stone: 2200000, t: 327600, power: 133357 },
  { food: 4700000, wood: 6100000, stone: 3200000, t: 424800, power: 181631 },
  { food: 7100000, wood: 9100000, stone: 4900000, t: 594000, power: 252430 },
  { food: 10800000, wood: 13800000, stone: 7500000, t: 892800, power: 359629 },
  { food: 16200000, wood: 20800000, stone: 11200000, t: 2944800, power: 592326 },
];
export const SIEGE_TABLE = [
  { food: 400, wood: 500, t: 10, power: 5 },
  { food: 800, wood: 1000, t: 90, power: 10 },
  { food: 1500, wood: 2000, t: 240, power: 26 },
  { food: 2800, wood: 3800, t: 600, power: 63 },
  { food: 5000, wood: 6800, t: 1000, power: 126 },
  { food: 8500, wood: 11500, stone: 5700, t: 2750, power: 293 },
  { food: 12800, wood: 17300, stone: 9000, t: 5520, power: 600 },
  { food: 19300, wood: 26000, stone: 14400, t: 22020, power: 1173 },
  { food: 19300, wood: 26000, stone: 14400, t: 22020, power: 2258 },
  { food: 43500, wood: 58500, stone: 36900, t: 43980, power: 4332 },
  { food: 67500, wood: 90000, stone: 57500, t: 52800, power: 6931 },
  { food: 102500, wood: 135000, stone: 87500, t: 63360, power: 10202 },
  { food: 102500, wood: 135000, stone: 87500, t: 76020, power: 14355 },
  { food: 232500, wood: 305000, stone: 200000, t: 90000, power: 19679 },
  { food: 350000, wood: 457500, stone: 300000, t: 129600, power: 26573 },
  { food: 525000, wood: 687500, stone: 450000, t: 129600, power: 35603 },
  { food: 787500, wood: 1000000, stone: 675000, t: 158400, power: 47574 },
  { food: 1200000, wood: 1600000, stone: 1000000, t: 190800, power: 63716 },
  { food: 1800000, wood: 2300000, stone: 1600000, t: 273600, power: 85697 },
  { food: 2700000, wood: 3500000, stone: 2300000, t: 273600, power: 115969 },
  { food: 4100000, wood: 5300000, stone: 3500000, t: 327600, power: 158145 },
  { food: 6100000, wood: 7900000, stone: 5300000, t: 424800, power: 218794 },
  { food: 9100000, wood: 11800000, stone: 7900000, t: 594000, power: 308118 },
  { food: 13800000, wood: 17800000, stone: 12000000, t: 892800, power: 442817 },
  { food: 20700000, wood: 26824600, stone: 17916000, t: 2946240, power: 716764 },
];
// index.html:1415 HALL_TABLE
export const HALL_TABLE = [
  { t: 0, power: 7 },
  { food: 3500, wood: 3500, t: 2, power: 21 },
  { food: 6500, wood: 6500, t: 300, power: 59 },
  { food: 11800, wood: 11800, t: 1200, power: 154 },
  { food: 21300, wood: 21300, t: 3600, power: 383 },
  { food: 36300, wood: 36300, stone: 12000, t: 7200, power: 852 },
  { food: 54400, wood: 54400, stone: 19200, t: 18000, power: 1847 },
  { food: 81800, wood: 81800, stone: 30800, t: 36000, power: 3706 },
  { food: 122800, wood: 122800, stone: 49200, t: 54000, power: 6504 },
  { food: 184300, wood: 184300, stone: 78700, t: 79200, power: 10933 },
  { food: 277500, wood: 277500, stone: 120000, t: 108000, power: 16723 },
  { food: 417500, wood: 417500, stone: 180000, t: 144000, power: 24693 },
  { food: 627500, wood: 627500, stone: 270000, t: 180000, power: 35213 },
  { food: 942500, wood: 942500, stone: 405000, t: 216000, power: 48838 },
  { food: 1400000, wood: 1400000, stone: 607500, t: 252000, power: 66400 },
  { food: 2100000, wood: 2100000, stone: 912500, t: 345600, power: 91451 },
  { food: 3200000, wood: 3200000, stone: 1400000, t: 417600, power: 125005 },
  { food: 4800000, wood: 4800000, stone: 2100000, t: 504000, power: 170590 },
  { food: 7200000, wood: 7200000, stone: 3100000, t: 604800, power: 232957 },
  { food: 10800000, wood: 10800000, stone: 4700000, t: 712800, power: 318769 },
  { food: 16200000, wood: 16200000, stone: 7000000, t: 950400, power: 442735 },
  { food: 24300000, wood: 24300000, stone: 10600000, t: 1479600, power: 630860 },
  { food: 36500000, wood: 36500000, stone: 15900000, t: 2070000, power: 907085 },
  { food: 54800000, wood: 54800000, stone: 24000000, t: 3110400, power: 1322485 },
  { food: 82200000, wood: 82200000, stone: 36000000, t: 10915200, power: 2195458 },
];
// index.html:1305 WALL_TABLE
export const WALL_TABLE = [
  { t: 0, power: 5, hp: 15000 },
  { food: 2300, wood: 2800, t: 2, power: 15, hp: 15500 },
  { food: 4300, wood: 5000, t: 90, power: 37, hp: 16000 },
  { food: 7800, wood: 9000, t: 600, power: 94, hp: 16500 },
  { food: 14000, wood: 16300, t: 1800, power: 226, hp: 17000 },
  { food: 18000, wood: 21000, stone: 25000, t: 3500, power: 519, hp: 17500 },
  { food: 27000, wood: 32000, stone: 40000, t: 7020, power: 1037, hp: 18250 },
  { food: 41000, wood: 47000, stone: 64000, t: 13980, power: 1965, hp: 19000 },
  { food: 61000, wood: 71000, stone: 102400, t: 28020, power: 3656, hp: 19750 },
  { food: 92000, wood: 106000, stone: 164000, t: 55980, power: 6784, hp: 20500 },
  { food: 137000, wood: 160000, stone: 250000, t: 67200, power: 10816, hp: 21250 },
  { food: 207000, wood: 240000, stone: 375000, t: 80640, power: 16060, hp: 22000 },
  { food: 310000, wood: 360000, stone: 565000, t: 97200, power: 22965, hp: 22750 },
  { food: 465000, wood: 540000, stone: 850000, t: 115200, power: 32169, hp: 23500 },
  { food: 698000, wood: 810000, stone: 1300000, t: 165600, power: 44583, hp: 24250 },
  { food: 1000000, wood: 1200000, stone: 1900000, t: 165600, power: 61540, hp: 25000 },
  { food: 1600000, wood: 1800000, stone: 2900000, t: 201600, power: 84977, hp: 26000 },
  { food: 2400000, wood: 2700000, stone: 4400000, t: 241200, power: 117860, hp: 27000 },
  { food: 3500000, wood: 4100000, stone: 6600000, t: 288000, power: 164369, hp: 28000 },
  { food: 5300000, wood: 6200000, stone: 9900000, t: 345600, power: 230776, hp: 29000 },
  { food: 8000000, wood: 9300000, stone: 14800000, t: 417600, power: 326321, hp: 30000 },
  { food: 12000000, wood: 13900000, stone: 22200000, t: 540000, power: 466309, hp: 31000 },
  { food: 18000000, wood: 20900000, stone: 33300000, t: 756000, power: 674163, hp: 32000 },
  { food: 27000000, wood: 31300000, stone: 50000000, t: 1134000, power: 986224, hp: 33000 },
  { food: 40500000, wood: 47100000, stone: 75000000, t: 3556800, power: 1545374, hp: 40000 },
];
// index.html:1552 ACADEMY_BUILD_TABLE (не путать с ACADEMY_TREE — исследования)
export const ACADEMY_BUILD_TABLE = [
  { food: 500, wood: 800, t: 6, power: 5 },
  { food: 1000, wood: 1500, t: 40, power: 11 },
  { food: 2000, wood: 2800, t: 160, power: 27 },
  { food: 3800, wood: 5000, stone: 800, t: 360, power: 61 },
  { food: 6800, wood: 9000, stone: 1500, t: 1200, power: 145 },
  { food: 11500, wood: 15500, stone: 3200, t: 3200, power: 336 },
  { food: 17300, wood: 23300, stone: 5000, t: 6420, power: 688 },
  { food: 26000, wood: 35000, stone: 8000, t: 12780, power: 1346 },
  { food: 39000, wood: 52500, stone: 12800, t: 25620, power: 2591 },
  { food: 58500, wood: 78800, stone: 20500, t: 51180, power: 4975 },
  { food: 90000, wood: 120000, stone: 32500, t: 61440, power: 7970 },
  { food: 135000, wood: 180000, stone: 50000, t: 73740, power: 11679 },
  { food: 202500, wood: 270000, stone: 75000, t: 90000, power: 16387 },
  { food: 305000, wood: 405000, stone: 112500, t: 104400, power: 22391 },
  { food: 457500, wood: 607500, stone: 170000, t: 126000, power: 30127 },
  { food: 687500, wood: 912500, stone: 255000, t: 151200, power: 40207 },
  { food: 1000000, wood: 1400000, stone: 382500, t: 183600, power: 53497 },
  { food: 1600000, wood: 2100000, stone: 575000, t: 219600, power: 71227 },
  { food: 2300000, wood: 3100000, stone: 875000, t: 262800, power: 95369 },
  { food: 3500000, wood: 4700000, stone: 1300000, t: 316800, power: 128424 },
  { food: 5250000, wood: 7050000, stone: 2000000, t: 536400, power: 174240 },
  { food: 7900000, wood: 10600000, stone: 3000000, t: 493200, power: 239921 },
  { food: 11800000, wood: 15900000, stone: 4500000, t: 691200, power: 336515 },
  { food: 17800000, wood: 24000000, stone: 6800000, t: 1036800, power: 481806 },
  { food: 26800000, wood: 36000000, stone: 10200000, t: 1209600, power: 783449 },
];
// index.html:1579 STORE_BUILD_TABLE (не путать со STORE_TABLE — защита склада)
export const STORE_BUILD_TABLE = [
  { t: 0, power: 5 },
  { food: 500, wood: 500, t: 18, power: 10 },
  { food: 1000, wood: 1000, t: 80, power: 17 },
  { food: 2000, wood: 2000, t: 400, power: 41 },
  { food: 3800, wood: 3800, t: 900, power: 92 },
  { food: 6500, wood: 6500, stone: 3800, t: 1800, power: 201 },
  { food: 9800, wood: 9800, stone: 6000, t: 3600, power: 402 },
  { food: 14800, wood: 14800, stone: 9600, t: 7200, power: 778 },
  { food: 22300, wood: 22300, stone: 15400, t: 14400, power: 1489 },
  { food: 33500, wood: 33500, stone: 24600, t: 28800, power: 2848 },
  { food: 52500, wood: 52500, stone: 37500, t: 34560, power: 4552 },
  { food: 80000, wood: 80000, stone: 57500, t: 41460, power: 6703 },
  { food: 120000, wood: 120000, stone: 87500, t: 49740, power: 9436 },
  { food: 180000, wood: 180000, stone: 132500, t: 59700, power: 12942 },
  { food: 270000, wood: 270000, stone: 200000, t: 71640, power: 17488 },
  { food: 405000, wood: 405000, stone: 300000, t: 85980, power: 23447 },
  { food: 607500, wood: 607500, stone: 450000, t: 104400, power: 31354 },
  { food: 925000, wood: 925000, stone: 675000, t: 122400, power: 42032 },
  { food: 1400000, wood: 1400000, stone: 1000000, t: 147600, power: 56560 },
  { food: 2100000, wood: 2100000, stone: 1600000, t: 176400, power: 76832 },
  { food: 3200000, wood: 3200000, stone: 2300000, t: 212400, power: 104966 },
  { food: 4700000, wood: 4700000, stone: 3500000, t: 277200, power: 145492 },
  { food: 7100000, wood: 7100000, stone: 5300000, t: 388800, power: 205219 },
  { food: 10800000, wood: 10800000, stone: 8000000, t: 583200, power: 295585 },
  { food: 16200000, wood: 16200000, stone: 12000000, t: 0, power: 478367 },
];
// index.html:1663 HOSPITAL_BUILD_TABLE (не путать с hospitalCap — мест в лазарете)
export const HOSPITAL_BUILD_TABLE = [
  { t: 0, power: 5 },
  { food: 2000, wood: 2000, t: 24, power: 13 },
  { food: 3800, wood: 3800, t: 100, power: 32 },
  { food: 3800, wood: 3800, t: 150, power: 65 },
  { food: 12300, wood: 12300, t: 1200, power: 162 },
  { food: 21000, wood: 21000, stone: 8200, t: 2400, power: 366 },
  { food: 31500, wood: 31500, stone: 13000, t: 4800, power: 723 },
  { food: 47300, wood: 47300, stone: 20800, t: 7200, power: 1262 },
  { food: 71000, wood: 71000, stone: 33300, t: 10800, power: 2077 },
  { food: 106500, wood: 106500, stone: 53300, t: 16200, power: 3310 },
  { food: 160000, wood: 160000, stone: 80000, t: 19440, power: 4967 },
  { food: 240000, wood: 240000, stone: 120000, t: 23340, power: 7220 },
  { food: 360000, wood: 360000, stone: 180000, t: 28020, power: 10319 },
  { food: 540000, wood: 540000, stone: 270000, t: 33540, power: 14632 },
  { food: 810000, wood: 810000, stone: 405000, t: 40320, power: 20699 },
  { food: 1200000, wood: 1200000, stone: 607500, t: 48360, power: 29316 },
  { food: 1800000, wood: 1800000, stone: 912500, t: 58020, power: 41665 },
  { food: 2800000, wood: 2800000, stone: 1400000, t: 69660, power: 59576 },
  { food: 4100000, wood: 4100000, stone: 2100000, t: 83580, power: 85644 },
  { food: 6200000, wood: 6200000, stone: 3100000, t: 100800, power: 123830 },
  { food: 9300000, wood: 9300000, stone: 4700000, t: 118800, power: 179944 },
  { food: 14000000, wood: 14000000, stone: 7100000, t: 154800, power: 263152 },
  { food: 20900000, wood: 20900000, stone: 10600000, t: 219600, power: 387338 },
  { food: 31500000, wood: 31500000, stone: 16000000, t: 327600, power: 574480 },
  { food: 47200000, wood: 47200000, stone: 24000000, t: 0, power: 881480 },
];

// index.html:1442/1471/1498/1525 FARM/LUMBER/QUARRY/MINE_TABLE
export const FARM_TABLE = [
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
// Лесопилка — те же числа, что и Ферма, только тратит еду вместо дерева
// (index.html:1469).
export const LUMBER_TABLE = [
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
export const QUARRY_TABLE = [
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
export const MINE_TABLE = [
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

// index.html:1335 WATCH_TABLE (Гарнизон) / index.html:1376 SCOUT_TABLE (Разведка).
// atk — урон разового залпа Сторожевой башни перед общей схваткой (см.
// garrisonVolley, index.html:4057); hp в игре не подключён отдельно (у
// гарнизона нет своего пула HP — использует общий wallHp города), но
// перенесён вместе с остальными полями для точности копии, не используется.
export const WATCH_TABLE = [
  { t: 0, power: 5, atk: 1000, hp: 1000 }, { food: 800, wood: 800, t: 30, power: 11, atk: 1500, hp: 1500 }, { food: 1500, wood: 1500, t: 100, power: 21, atk: 2000, hp: 2000 },
  { food: 2800, wood: 2800, t: 300, power: 44, atk: 3000, hp: 3000 }, { food: 5000, wood: 5000, t: 900, power: 100, atk: 4000, hp: 4000 },
  { food: 8500, wood: 8500, stone: 1300, t: 2100, power: 221, atk: 5000, hp: 5000 }, { food: 12800, wood: 12800, stone: 2000, t: 4200, power: 446, atk: 6000, hp: 6000 },
  { food: 19300, wood: 19300, stone: 3200, t: 8400, power: 868, atk: 16000, hp: 8000 }, { food: 29000, wood: 29000, stone: 5200, t: 16800, power: 1671, atk: 20000, hp: 10000 },
  { food: 43500, wood: 43500, stone: 8200, t: 33600, power: 3213, atk: 24000, hp: 12000 }, { food: 67500, wood: 67500, stone: 12500, t: 40320, power: 5133, atk: 28000, hp: 14000 },
  { food: 102500, wood: 102500, stone: 20000, t: 48360, power: 7538, atk: 32000, hp: 16000 }, { food: 155000, wood: 155000, stone: 30000, t: 58080, power: 10570, atk: 36000, hp: 18000 },
  { food: 232500, wood: 232500, stone: 45000, t: 69660, power: 14421, atk: 40000, hp: 20000 }, { food: 350000, wood: 350000, stone: 67500, t: 83580, power: 19367, atk: 66000, hp: 22000 },
  { food: 525000, wood: 525000, stone: 102500, t: 100800, power: 25787, atk: 72000, hp: 24000 }, { food: 787500, wood: 787500, stone: 155000, t: 118800, power: 34217, atk: 78000, hp: 26000 },
  { food: 1200000, wood: 1200000, stone: 250000, t: 144000, power: 45545, atk: 84000, hp: 28000 }, { food: 1800000, wood: 1800000, stone: 375000, t: 172800, power: 60804, atk: 90000, hp: 30000 },
  { food: 2700000, wood: 2700000, stone: 575000, t: 208800, power: 81650, atk: 96000, hp: 32000 }, { food: 4100000, wood: 4100000, stone: 875000, t: 248400, power: 110460, atk: 136000, hp: 34000 },
  { food: 6100000, wood: 6100000, stone: 1300000, t: 324000, power: 151716, atk: 144000, hp: 36000 }, { food: 9100000, wood: 9100000, stone: 2000000, t: 453600, power: 212389, atk: 152000, hp: 38000 },
  { food: 13800000, wood: 13800000, stone: 3000000, t: 680400, power: 303649, atk: 160000, hp: 40000 }, { food: 20800000, wood: 20800000, stone: 4500000, t: 1234800, power: 495562, atk: 500000, hp: 50000 },
];
// bonus (надбавка к скорости лазутчика от уровня здания, %) и scouts
// (лимит одновременных вылазок, 1 на 1-4, 2 на 5-10, 3 на 11+) — нужны
// mp-scout (Фаза 4, восьмой кусочек), не только постройке самого здания.
export const SCOUT_TABLE = [
  { food: 300, wood: 300, t: 4, power: 5, bonus: 5, scouts: 1 }, { food: 500, wood: 500, t: 15, power: 10, bonus: 10, scouts: 1 }, { food: 1000, wood: 1000, t: 60, power: 16, bonus: 15, scouts: 1 },
  { food: 2000, wood: 2000, t: 210, power: 32, bonus: 20, scouts: 1 }, { food: 3800, wood: 3800, t: 850, power: 81, bonus: 25, scouts: 2 },
  { food: 6500, wood: 6500, t: 2100, power: 191, bonus: 30, scouts: 2 }, { food: 9800, wood: 9800, t: 4200, power: 398, bonus: 35, scouts: 2 },
  { food: 14800, wood: 14800, t: 7800, power: 769, bonus: 40, scouts: 2 }, { food: 22300, wood: 22300, t: 10380, power: 1274, bonus: 45, scouts: 2 },
  { food: 31300, wood: 31300, t: 14280, power: 1971, bonus: 50, scouts: 2 }, { food: 42500, wood: 42500, t: 19380, power: 2916, bonus: 60, scouts: 3 },
  { food: 52500, wood: 52500, t: 28980, power: 4286, bonus: 70, scouts: 3 }, { food: 60000, wood: 60000, t: 35760, power: 5956, bonus: 80, scouts: 3 },
  { food: 67500, wood: 67500, t: 43560, power: 7969, bonus: 90, scouts: 3 }, { food: 75000, wood: 75000, t: 52020, power: 10350, bonus: 90, scouts: 3 },
  { food: 82500, wood: 82500, t: 62760, power: 13191, bonus: 100, scouts: 3 }, { food: 92500, wood: 92500, t: 86400, power: 17149, bonus: 100, scouts: 3 },
  { food: 102500, wood: 102500, t: 115200, power: 22223, bonus: 110, scouts: 3 }, { food: 115000, wood: 115000, t: 144000, power: 28423, bonus: 110, scouts: 3 },
  { food: 127500, wood: 127500, t: 180000, power: 36109, bonus: 115, scouts: 3 }, { food: 142500, wood: 142500, t: 234000, power: 46007, bonus: 115, scouts: 3 },
  { food: 157500, wood: 157500, t: 288000, power: 58118, bonus: 120, scouts: 3 }, { food: 250000, wood: 250000, t: 378000, power: 74187, bonus: 120, scouts: 3 },
  { food: 500000, wood: 500000, t: 504000, power: 96279, bonus: 120, scouts: 3 }, { food: 650000, wood: 650000, t: 669600, power: 139023, bonus: 125, scouts: 3 },
];
export const BUILD_BLD_TABLE = {
  barracks: BARRACKS_TABLE, range: BARRACKS_TABLE, stable: BARRACKS_TABLE, siege: SIEGE_TABLE,
  hall: HALL_TABLE, wall: WALL_TABLE, store: STORE_BUILD_TABLE, academy: ACADEMY_BUILD_TABLE,
  hospital: HOSPITAL_BUILD_TABLE, farm: FARM_TABLE, lumber: LUMBER_TABLE, quarry: QUARRY_TABLE, mine: MINE_TABLE,
  garrison: WATCH_TABLE, scout: SCOUT_TABLE,
};
export const BUILD_MAX_LV = 25; // buildingMax(bk) для всех этих зданий — CFG.MAX_LEVEL, см. index.html
// index.html:2425 BUILDINGS.*.plots — multi-здания: hospital (лазарет) и
// farm/lumber/quarry/mine (все 4 экономических), у каждого 4 участка
// (индексы 0-3). Участок 0 разблокирован всегда, участки 1-3 — по эпохе
// ратуши (см. epochOf/plotUnlocked ниже, index.html:2453/2854).
export const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);
// index.html:2854 epochOf — эпоха ратуши (1..5), определяет разблокировку
// участков multi-зданий (см. plotUnlocked) и ряд других вещей в клиенте,
// сюда не относящихся (декор, названия зданий по эпохе и т.п.).
export const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
// index.html:2453 plotUnlocked — участок 0 у multi-зданий открыт всегда,
// участок N (1-3) — с эпохи N+1 (участок 1 → эпоха 2 → ратуша 7 ур.,
// участок 2 → эпоха 3 → ратуша 13 ур., участок 3 → эпоха 4 → ратуша 19 ур.).
export const plotUnlocked = (bk, idx, hall) => !BUILD_MULTI.has(bk) || idx === 0 || epochOf(hall) >= idx + 1;
// index.html:5724 cur — уровень КОНКРЕТНОГО участка multi-здания (buildLv
// ниже — только участок 0, для HALL_REQ-проверки; тут нужен произвольный).
export function buildLvAt(p, bk, plot) {
  const raw = p.b[bk];
  return BUILD_MULTI.has(bk) ? ((Array.isArray(raw) ? raw[plot] : (plot === 0 ? raw : 0)) || 0) : (raw || 0);
}
// index.html:2463 HALL_REQ / index.html:2872 hallGateLevel — чтобы поднять
// ратушу с уровня L на L+1, все 5 зданий должны быть НЕ НИЖЕ текущего L.
export const HALL_REQ = ["wall", "store", "academy", "barracks", "hospital"];
export const BUILD_BLD_RU_NAME = {
  wall: "Стена", store: "Склад", academy: "Академия", barracks: "Казармы", hospital: "Госпиталь",
}; // упрощённые названия для текста ошибки HALL_REQ — buildingName() в index.html
   // ещё и красит их по расе/эпохе (BUILDING_TIER_NAMES), сюда эта косметика
   // не перенесена, там, где она реально нужна (клиентский предпросмотр во
   // вкладке "Общий мир"), используется настоящий buildingName() из index.html.

// index.html: buildTime/buildCost. bonuses(p).build/buildCostCut — Фаза 6,
// настоящий подсчёт, см. bonuses() ниже (та же схема, что у trainSpeed выше).
export function buildDuration(bk, lv, buildBonus = 1) {
  return tblRow(BUILD_BLD_TABLE[bk], lv).t / buildBonus;
}
export function buildCost(bk, lv, buildCostCut = 0) {
  const r = tblRow(BUILD_BLD_TABLE[bk], lv);
  const cut = 1 - buildCostCut;
  return { food: Math.round((r.food || 0) * cut), wood: Math.round((r.wood || 0) * cut), stone: Math.round((r.stone || 0) * cut), gold: 0 };
}
// index.html:2872 hallGateLevel — уровень здания для сравнения с HALL_REQ;
// multi-здание (hospital) сравнивается по участку 0.
export function buildLv(p, bk) {
  const raw = p.b[bk];
  return BUILD_MULTI.has(bk) ? ((Array.isArray(raw) ? raw[0] : raw) || 0) : (raw || 0);
}

// =============================================================================
// Прочность построек, снос осадой и восстановление — Фаза 29.
// =============================================================================
// До этой фазы город был неразрушим: проигранный штурм стоил защитнику войск
// и части склада, но сам город оставался цел до последнего бревна. Автор
// попросил механику сноса в духе Travian/Tribal Wars: у каждой постройки своя
// прочность, осадные орудия ломают её отдельным уроном (не тем, которым бьют
// по войскам), а сбитое здание исчезает ЦЕЛИКОМ — не откатывается на уровень
// вниз, а пропадает с карты города вместе со своей мощью, и его надо строить
// заново с первого уровня.
//
// Три числа держат весь баланс, и крутить предполагается именно их:
// BUILD_HP_BASE (насколько крепок город), SIEGE_BDMG_BASE (насколько силён
// таран) и DEMOLISH_ROUNDS (сколько длится запал осады). Всё остальное —
// производные.

// Прочность = BUILD_HP_BASE * уровень^BUILD_HP_POW * множитель типа. Степень
// 1.2, а не линейный рост: 25-й уровень должен быть заметно тяжелее 24-го (у
// него и цена такая), но не в 25 раз крепче первого — иначе ранний город
// сносится одним отрядом, а поздний не сносится вообще ничем.
// Ориентир на 25 уровне: обычное здание ≈ 11 900, Стена ≈ 29 700,
// Ратуша ≈ 35 700. Экономические участки нарочно вдвое мягче военных — терять
// ферму не так больно, как Академию, и осада не должна вязнуть в грядках.
export const BUILD_HP_BASE = 250;
export const BUILD_HP_POW = 1.2;
export const BUILD_HP_MULT = {
  hall: 3, wall: 2.5, garrison: 2, scout: 0.8,
  farm: 0.6, lumber: 0.6, quarry: 0.6, mine: 0.6,
};
// Горн — единственное здание без уровней (max:1, см. BUILDINGS в index.html),
// формула от уровня дала бы ему 125 прочности, то есть картонную будку.
// Своё плоское число, примерно как у здания 12 уровня.
export const BUILD_HP_FLAT = { forge: 3000 };
export function buildingMaxHp(bk, lv) {
  if (lv <= 0) return 0;
  if (BUILD_HP_FLAT[bk] != null) return BUILD_HP_FLAT[bk];
  return Math.round(BUILD_HP_BASE * Math.pow(lv, BUILD_HP_POW) * (BUILD_HP_MULT[bk] || 1));
}

// p.bhp — текущая прочность, ТА ЖЕ форма, что и p.b (скаляр у обычного
// здания, массив из 4 у multi). Отсутствие ключа означает "цело", а не "ноль":
// поле заводится только у повреждённых зданий и удаляется, как только они
// починились. Поэтому никакой миграции для существующих игроков не нужно —
// у всех, кого ни разу не осаждали, p.bhp честно пуст.
export function buildHpAt(p, bk, plot) {
  const lv = buildLvAt(p, bk, plot);
  const max = buildingMaxHp(bk, lv);
  if (max <= 0) return 0;
  const raw = p.bhp && p.bhp[bk];
  const cur = BUILD_MULTI.has(bk)
    ? (Array.isArray(raw) ? raw[plot || 0] : undefined)
    : (typeof raw === "number" ? raw : undefined);
  if (cur == null || !(cur >= 0)) return max;
  return Math.min(max, cur);
}
export function setBuildHp(p, bk, plot, hp) {
  const lv = buildLvAt(p, bk, plot);
  const max = buildingMaxHp(bk, lv);
  if (!p.bhp) p.bhp = {};
  const v = Math.max(0, Math.min(max, Math.round(hp)));
  if (BUILD_MULTI.has(bk)) {
    // Заводим массив сразу с ЧЕСТНОЙ прочностью каждого участка (у не
    // построенного она 0, а не как у соседнего) — иначе в состоянии остаются
    // числа, которых у пустого участка быть не может, и следующий читатель
    // на них споткнётся.
    if (!Array.isArray(p.bhp[bk])) p.bhp[bk] = [0, 1, 2, 3].map((i) => buildingMaxHp(bk, buildLvAt(p, bk, i)));
    p.bhp[bk][plot || 0] = v;
    // Все четыре участка целы — запись больше ничего не сообщает, чистим.
    if (p.bhp[bk].every((h, i) => h >= buildingMaxHp(bk, buildLvAt(p, bk, i)))) delete p.bhp[bk];
  } else {
    if (v >= max) delete p.bhp[bk]; else p.bhp[bk] = v;
  }
}

// Восстановление. Автор: "если город игрока не подвергался 30 минут
// нападениям, здания начинают медленно регенерировать". p.lastHitAt ставится
// на КАЖДОМ бою у города (см. mp-tick), отсчёт тишины идёт от него, а не от
// момента самого урона — новая атака откладывает починку целиком, а не
// доливает прочность между двумя штурмами.
// Считается лениво, тем же приёмом, что и добыча ресурсов (см. syncRes ниже):
// нет отдельного тика, есть отметка времени и пересчёт при любом чтении.
export const BUILD_REGEN_CALM_SEC = 1800;   // 30 минут без нападений
export const BUILD_REGEN_PER_HOUR = 0.20;   // 20% от полной прочности в час → полная починка за 5 часов тишины
export function syncBuildingHp(p, nowSec) {
  if (!p.bhp || !Object.keys(p.bhp).length) { p.bhpAt = nowSec; return; }
  // Чинить начинаем с более позднего из двух моментов: когда последний раз
  // считали и когда истекло окно тишины. Без второго слагаемого город
  // восстанавливался бы прямо во время осады.
  const from = Math.max(p.bhpAt || 0, (p.lastHitAt || 0) + BUILD_REGEN_CALM_SEC);
  const dt = nowSec - from;
  p.bhpAt = nowSec;
  if (dt <= 0) return;
  for (const bk of Object.keys(p.bhp)) {
    const plots = BUILD_MULTI.has(bk) ? [0, 1, 2, 3] : [null];
    for (const plot of plots) {
      const max = buildingMaxHp(bk, buildLvAt(p, bk, plot));
      if (max <= 0) continue;
      const cur = buildHpAt(p, bk, plot);
      if (cur >= max) continue;
      setBuildHp(p, bk, plot, cur + max * BUILD_REGEN_PER_HOUR * (dt / 3600));
    }
  }
}

// Урон осадных по постройкам — ОТДЕЛЬНЫЙ от их обычной атаки стат: в полевом
// бою (за точки, против лагерей) осадные бьют ровно как раньше, эта величина
// туда не заходит вовсе. Базовое число — за один осадный юнит первого тира за
// один раунд сноса, дальше по той же лестнице тиров TIER_MULT, что и все
// остальные характеристики войск: [0.75, 1.22, 1.91, 3.04, 4.65].
//
// Калибровка (один осадный за ВСЮ фазу сноса даёт base*TIER_MULT*
// DEMOLISH_ROUNDS урона, т.е. 6 у Т1 и 37 у Т5):
//   1 осадный Т1     →  6 урона  — 0,02% от Стены 25 ур., то есть царапина;
//   1000 осадных Т5  →  37 000   — Стена 25 ур. и Гарнизон, и всё;
//   5000 осадных Т5  →  186 000  — Стена, Гарнизон и 8-10 крупных зданий.
// Такой потолок и есть ответ на "один выживший осадный будет сносить вечно":
// урон за осаду жёстко конечен и пропорционален числу ПРИШЕДШИХ орудий.
export const SIEGE_BDMG_BASE = 0.75;
// Сколько раундов длится фаза сноса после разгрома защитника. Те же
// 15-секундные тики, что и у самого боя (см. BATTLE_TICK_SECONDS в mp-tick) —
// осада не разрешается мгновенно, её видно в живую.
export const DEMOLISH_ROUNDS = 8;
// atkSie/matkSie — те самые Баллистика/Машиностроение/Инженерия из Академии
// (см. ACADEMY_TREE): вложился в осадную ветку — ломаешь стены быстрее. Своей
// отдельной ветки исследований под снос не заводим.
export function siegeBreachPerRound(units, race, B) {
  let dmg = 0;
  for (let i = 1; i <= 5; i++) {
    const n = (units.sie && units.sie[i]) || 0;
    if (n > 0) dmg += n * SIEGE_BDMG_BASE * TIER_MULT[i - 1];
  }
  const bonus = 1 + ((B && B.atkSie) || 0) + ((B && B.matkSie) || 0);
  return dmg * bonus * troopMod(race, "sie", "atk");
}

// Порядок, в котором таран берётся за постройки. Автор: "в первую очередь
// попадают под раздачу стена и гарнизон, а самым последним Ратуша" — так и
// сделано, а середина отсортирована по уровню: сначала самое крупное, что
// стоит в городе. Это и естественнее (осадная башня бьёт по главному, а не по
// сараю), и делает снос осмысленным: за короткий запал осады успеваешь
// обрушить именно то, что противник дольше всего строил.
//
// Ратуша последней — это, помимо просьбы автора, ещё и весь баланс убийства
// правителя разом: чтобы вообще ДОБРАТЬСЯ до неё, нужно снести весь остальной
// город, а он чинится через полчаса тишины. Одним удачным штурмом никого не
// убить, нужна серия осад подряд — то есть работа альянса, а не случайность.
export const DEMOLISH_FIRST = ["wall", "garrison"];
export function demolishOrder(p) {
  const out = [];
  const push = (bk, plot) => { if (buildLvAt(p, bk, plot) > 0) out.push({ bk, plot }); };
  DEMOLISH_FIRST.forEach((bk) => push(bk, null));
  const middle = [];
  Object.keys(BUILD_BLD_TABLE).concat(["forge", "portal", "market", "alliance"]).forEach((bk) => {
    if (bk === "hall" || DEMOLISH_FIRST.includes(bk)) return;
    const plots = BUILD_MULTI.has(bk) ? [0, 1, 2, 3] : [null];
    plots.forEach((plot) => {
      const lv = buildLvAt(p, bk, plot);
      if (lv > 0) middle.push({ bk, plot, lv });
    });
  });
  // Убывание уровня; при равных — стабильный порядок по имени, чтобы два
  // одинаковых города не разбирались в случайном и невоспроизводимом порядке
  // (бой обязан пересчитываться одинаково на любом продолжении, см. mp-tick).
  middle.sort((a, b) => b.lv - a.lv || (a.bk < b.bk ? -1 : a.bk > b.bk ? 1 : (a.plot || 0) - (b.plot || 0)));
  middle.forEach((e) => out.push({ bk: e.bk, plot: e.plot }));
  push("hall", null);
  return out;
}
// Все ли постройки, кроме Ратуши, уже снесены — Ратуша начинает получать урон
// только после этого (см. demolishOrder: она физически последняя в списке).
export function cityFlattened(p) {
  return demolishOrder(p).every((e) => e.bk === "hall");
}

// =============================================================================
// Добыча ресурсов по времени — Фаза 5. Зеркало syncRes/production/
// plotFillCap из index.html (syncRes: index.html:3838). В одиночной игре
// это "ленивая экономика" — синкается при любом чтении/трате, а не тикает
// сама по себе постоянно; на сервере то же самое: syncRes() ниже дергается
// из mp-join (сразу же и на каждый последующий опрос — вкладка "Общий мир"
// опрашивает mp-join раз в 5с, см. index.html) и из mp-train/mp-build перед
// canPay/pay, так что p.res всегда актуален на момент, когда он реально
// понадобился — отдельный "тикер добычи" в pg_cron не нужен (та же причина,
// по которой одиночная игра не тикает ресурсы каждый кадр, см. комментарий
// у syncRes в index.html).
// index.html:1290 PROD_TABLE / index.html:2797 prodRate / index.html:2461 plotCap
export const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
export const prodRate = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv));
export const plotCap = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv) * 10);
const PROD_BLD = { food: "farm", wood: "lumber", stone: "quarry", gold: "mine" };
const PROD_MULT = { food: 1, wood: 1, stone: 0.75, gold: 0.5 };
// index.html:3790 production() — раньше была заглушкой без bonuses(p)
// (Фаза 5), настоящее определение (использующее полноценный bonuses(p) из
// Фазы 6) — ниже в файле, рядом с самой bonuses(), т.к. её саму нужно
// объявить раньше вызова. Функция ОДНА, объявление не дублируется.
// index.html:3813 plotFillCap — сколько добычи участок копит за один синк,
// прежде чем перестать расти (роль "тапа" на сервере играет сам факт
// вызова syncRes, см. заголовок блока).
export function plotFillCap(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let extra = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { extra += plotCap(lv) * PROD_MULT[r]; });
    out[r] = Math.round(extra);
  });
  return out;
}
// index.html:3838 syncRes (без lazy-порога — серверные вызовы и так редкие
// относительно кадров браузера, порог тут не нужен; без p.isBot-ветки — в
// общем мире пока нет ботов). nowSec — Date.now()/1000, та же секундная
// шкала, что t0/t1 у очередей/наборов в mp-train/mp-build.
export function syncRes(p, nowSec) {
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
// PvP-бой — Фаза 4, продолжено в Фазе 6. НЕ resolveBattle() из index.html
// (index.html:4129) — тот раунд за раундом считает погоду, слом дисциплины,
// урон/от полководцев, поднятие нежити прямо в бою, контрудар гарнизона
// (dwarf defMods "counter") и первый залп лучников без ответа (elf
// firstStrike); полный перенос — отдельная большая задача, сравнимая по
// объёму с самой bonuses(). Здесь — единственный обмен ударами по настоящим
// базовым характеристикам войск (TROOP_TYPES/TIER_MULT/RACE_TROOP_MOD/
// COUNTER_UP/COUNTER_DOWN — буквальная копия из index.html:2578-2651, те же
// числа), без раундов/погоды/дисциплины/полководцев/подъёма нежити/
// гарнизонного контрудара/первого залпа. Стена (уровень + расовый/
// эпохальный wallBonus) и остальные боевые бонусы (atk/def/matk/mdef/hp по
// каждому роду войск, archer, дефолтный генерал, дерево исследований) — уже
// подключены (Фаза 6, sideStats/dmgTo/resolvePvp ниже принимают bonuses(p)).
// Урон по типу защитника считается той же формулой "доля-по-HP + контр-
// множитель", что и dmgTo() внутри resolveBattle() (index.html:4194-4213),
// просто один раз, а не в цикле — честно ПРИБЛИЖЕНИЕ, а не точная замена
// целого раундового боевого движка (не заглушка одного бонуса, как
// trainSpeed/build/prod раньше, а сознательное упрощение всей МЕХАНИКИ боя;
// сами бонусы внутри этого упрощения теперь настоящие, см. выше).
export const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20];
// load — грузоподъёмность бойца (сбор с точек и вынос добычи из боя).
// Раньше её тут не было вовсе, хотя index.html:2583-2587 её задаёт: справочник
// расходился с игрой, и обе живые копии (mp-gather/mp-tick) дописывали её
// каждая по-своему. Приведено к эталону.
export const TROOP_TYPES = {
  inf: { atk: 34, def: 46, hp: 44, load: 6, speed: 1.00, magicAtk: 8, magicDef: 18, beats: "arc", losesTo: "cav" },
  arc: { atk: 50, def: 30, hp: 36, load: 8, speed: 1.10, magicAtk: 20, magicDef: 8, beats: "cav", losesTo: "inf" },
  cav: { atk: 46, def: 34, hp: 40, load: 5, speed: 1.70, magicAtk: 12, magicDef: 12, beats: "inf", losesTo: "arc" },
  sie: { atk: 24, def: 20, hp: 60, load: 30, speed: 0.60, magicAtk: 26, magicDef: 6, beats: null, losesTo: null },
};
export const RACE_TROOP_MOD = {
  dwarf: { inf: { atk: 1.05, def: 1.05, hp: 1.05 } },
  human: { cav: { atk: 1.05, def: 1.05, hp: 1.05 } },
  elf: { arc: { atk: 1.05, def: 1.05, hp: 1.05 } },
  // load:0.80 — обратная сторона вдвое более сильных осадных нежити
  // (index.html:2725). Её отсутствие здесь и в живых копиях давало нежити
  // в общем мире силу без размена: +25% к выносу добычи против одиночки.
  undead: { sie: { atk: 2.20 * 1.05, def: 1.05, hp: 1.05, speed: 1.20, load: 0.80 } },
};
export const troopMod = (race, t, stat) => (RACE_TROOP_MOD[race] && RACE_TROOP_MOD[race][t] && RACE_TROOP_MOD[race][t][stat]) || 1;
// index.html:2895 tableAt — дробный (интерполированный) поиск по уровню:
// усредняет между соседними целыми уровнями по дробной части lv. Нужен для
// wallDefBonus, который в index.html читает "непрерывный" HP-рост стены.
export function tableAt(tbl, lv, field) {
  const i = clamp(lv, 1, tbl.length) - 1;
  const lo = Math.floor(i), hi = Math.min(tbl.length - 1, lo + 1), f = i - lo;
  const a = field ? tbl[lo][field] : tbl[lo], b = field ? tbl[hi][field] : tbl[hi];
  return a + (b - a) * f;
}
// index.html:2904 wallDefBonus — доля смягчения урона от уровня стены
// защитника, по интерполированному росту HP стены между 1-м и последним
// (25-м, WALL_TABLE.length-1) уровнем; 0 при отсутствии стены (lv<=0).
export function wallDefBonus(lv) {
  if (lv <= 0) return 0;
  const hp = tableAt(WALL_TABLE, lv, "hp"), hp1 = WALL_TABLE[0].hp, hpMax = WALL_TABLE[WALL_TABLE.length - 1].hp;
  return 0.125 * (hp - hp1) / (hpMax - hp1);
}
export const COUNTER_UP = 1.5, COUNTER_DOWN = 0.7;
export function counterMult(from, to) {
  const T = TROOP_TYPES[from];
  if (T.beats === to) return COUNTER_UP;
  if (T.losesTo === to) return COUNTER_DOWN;
  return 1;
}
// index.html:3974 sideStats — свёрнутые атака/защита/HP по каждому роду
// войск (сумма по тирам). Фаза 6, продолжение: раньше бонусы p.gen/tal/
// tech/race-пассивки были не перенесены — теперь принимает готовый B
// (bonuses(p) или bonuses(p,true) для защитника) и применяет ровно те же
// множители, что и index.html:3974-4014 (per-type atkX/defX/matkX/mdefX +
// общие atk/def/matk/mdef/hp + archer для лучников). НЕ переносит f.broken
// (слом дисциплины) и f.risen (поднятые скелеты) — оба существуют только
// внутри раундового resolveBattle(), здесь один обмен без раундов.
const SIDE_TYPE_ATK = { inf: "atkInf", arc: "atkArc", cav: "atkCav", sie: "atkSie" };
const SIDE_TYPE_DEF = { inf: "defInf", arc: "defArc", cav: "defCav", sie: "defSie" };
const SIDE_TYPE_MATK = { inf: "matkInf", arc: "matkArc", cav: "matkCav", sie: "matkSie" };
const SIDE_TYPE_MDEF = { inf: "mdefInf", arc: "mdefArc", cav: "mdefCav", sie: "mdefSie" };
export function sideStats(units, race, B) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const s = {};
  TKEYS.forEach((t) => {
    let atk = 0, def = 0, matk = 0, mdef = 0, hp = 0, n = 0;
    const atkMod = 1 + (B[SIDE_TYPE_ATK[t]] || 0), defMod = 1 + (B[SIDE_TYPE_DEF[t]] || 0);
    const matkMod = 1 + (B[SIDE_TYPE_MATK[t]] || 0), mdefMod = 1 + (B[SIDE_TYPE_MDEF[t]] || 0);
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      if (!c) continue;
      const w = TIER_MULT[i - 1];
      let a = TROOP_TYPES[t].atk * w * troopMod(race, t, "atk") * atkMod;
      if (t === "arc") a *= 1 + (B.archer || 0);
      const d = TROOP_TYPES[t].def * w * troopMod(race, t, "def") * defMod;
      const ma = TROOP_TYPES[t].magicAtk * w * troopMod(race, t, "atk") * matkMod;
      const md = TROOP_TYPES[t].magicDef * w * troopMod(race, t, "def") * mdefMod;
      atk += c * a * (1 + B.atk); def += c * d * (1 + B.def);
      matk += c * ma * (1 + B.matk); mdef += c * md * (1 + B.mdef);
      hp += c * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp") * (1 + B.hp);
      n += c;
    }
    s[t] = { atk, def, matk, mdef, hp, n };
  });
  s.totalHp = TKEYS.reduce((a, t) => a + s[t].hp, 0);
  s.totalN = TKEYS.reduce((a, t) => a + s[t].n, 0);
  return s;
}
// index.html:4194 dmgTo(att,attS,defS,defWall,shake) — урон, наносимый attS
// стороне defS, по родам войск защитника (доля по HP + контр-множитель +
// смягчение защитой×стеной). defWall — множитель index.html:4142
// (1+wallDefBonus(lv)*(1+bonus)) — Фаза 6: bonus (defB.wallBonus) теперь
// настоящий, передаётся явным 4-м параметром вместо захардкоженного нуля;
// defWall умножает ИМЕННО дробь def/70 (мультипликативно внутри
// mitig=1+x/70*defWall — не всё выражение (1+x)), в точности как в
// index.html:4208. defWall=1, если стены нет (defWallLv<=0) или для урона
// по атакующему (у него в бою своя стена не защищает — resolvePvp зовёт
// это с defWallLv=0/wallBonus=0 для урона по атакующему). Без
// CFG.BATTLE_PACE/шейка (это один обмен, не раунд в цикле — масштаб урона
// другой, скидка на "раунд" тут не нужна).
export function dmgTo(attS, defS, defWallLv = 0, wallBonus = 0) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const defWall = 1 + wallDefBonus(defWallLv) * (1 + wallBonus);
  const out = {};
  TKEYS.forEach((dt) => {
    if (defS[dt].n <= 0) { out[dt] = 0; return; }
    let d = 0, dm = 0;
    TKEYS.forEach((at) => {
      if (attS[at].n <= 0) return;
      const share = defS[dt].hp / Math.max(1, defS.totalHp);
      d += attS[at].atk * counterMult(at, dt) * share;
      dm += attS[at].matk * counterMult(at, dt) * share;
    });
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70 * defWall;
    const mitigM = 1 + (defS[dt].mdef / Math.max(1, defS[dt].n)) / 70 * defWall;
    out[dt] = d / mitig + dm / mitigM;
  });
  return out;
}
// Переводит урон по HP (dmgTo) в реальные потери юнитов, распределённые по
// тирам пропорционально их числу внутри рода войск (не по HP — упрощение,
// точное распределение по тирам resolveBattle() не переносим). hpBonus —
// сырой B.hp (та же величина, что sideStats уже подставляла как (1+B.hp) в
// totalHp) — нужен здесь тоже, иначе hpTotal (знаменатель доли потерь)
// разойдётся с тем пулом HP, из которого dmgTo() фактически считал урон.
// Возвращает {units, hpLost} — units той же формы, что p.troops[t], hpLost —
// суммарный нанесённый урон (нужен только для итоговой сводки).
export function applyLosses(units, dmgByType, race, hpBonus = 0) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const lost = { inf: {}, arc: {}, cav: {}, sie: {} };
  let hpLost = 0;
  TKEYS.forEach((t) => {
    const n = TKEYS.includes(t) ? [1, 2, 3, 4, 5].reduce((s, i) => s + ((units[t] && units[t][i]) || 0), 0) : 0;
    if (n <= 0 || !dmgByType[t]) { [1, 2, 3, 4, 5].forEach((i) => lost[t][i] = 0); return; }
    let hpTotal = 0;
    for (let i = 1; i <= 5; i++) hpTotal += ((units[t][i] || 0)) * TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp") * (1 + hpBonus);
    const dmg = Math.min(dmgByType[t], hpTotal);
    hpLost += dmg;
    const frac = hpTotal > 0 ? dmg / hpTotal : 0;
    for (let i = 1; i <= 5; i++) {
      const c = units[t][i] || 0;
      lost[t][i] = Math.min(c, Math.round(c * frac));
    }
  });
  return { units: lost, hpLost };
}
// index.html:4057 garrisonVolley — Сторожевая башня защитника один раз бьёт
// наступающих ДО общей схватки (в index.html — до раундового цикла, вместе
// с залпом лучников; здесь, раз обмен и так один, просто добавляется к
// единственному урону по атакующему). Урон делится по родам войск
// атакующего пропорционально доле в общем HP (без контр-множителя —
// башня не участник треугольника, бьёт по площади), смягчается защитой
// атакующего той же /70-формулой. WATCH_TABLE.atk — настоящая атака
// Сторожевой башни RoK (до 500000 на максимуме), не придуманная lv*900
// из старой версии клиента (см. комментарий у WATCH_TABLE).
export function garrisonVolley(defGarrisonLv, attS) {
  if (defGarrisonLv <= 0) return null;
  const dmg = tblRow(WATCH_TABLE, defGarrisonLv).atk;
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const out = {};
  TKEYS.forEach((t) => {
    if (attS[t].n <= 0) { out[t] = 0; return; }
    const share = dmg * (attS[t].hp / Math.max(1, attS.totalHp));
    const mitig = 1 + (attS[t].def / Math.max(1, attS[t].n)) / 70;
    out[t] = share / mitig;
  });
  return out;
}
// Один обмен ударами: attacker бьёт defender, defender отвечает тем же
// разом (не в очередь, как в резолвBattle() — тут только один шаг). Все
// живые войска защитника участвуют — марш-система (кто именно "дошёл")
// ещё не перенесена, атака бьёт мгновенно по всему гарнизону защитника.
// defWallLv — уровень стены защитника (p.b.wall), смягчает урон ТОЛЬКО по
// защитнику (index.html:4218-4219: defWall=wallMul для dA, но 1 для dD —
// стена защищает дом, а не марширующих в чужие земли атакующих).
// defGarrisonLv — уровень Сторожевой башни защитника (p.b.garrison),
// добавляет разовый залп по атакующему поверх основного обмена (см.
// garrisonVolley выше) — тоже защищает только оборону, симметрично стене.
//
// Фаза 6, продолжение — attP/defP теперь ПОЛНЫЕ объекты игрока (race+b+
// gen+tech), не голые строки расы: нужны для bonuses(attP)/bonuses(defP,
// true) — defP считается С defending=true (5-я эпоха, defMods — например,
// дворфский "Несокрушимые"). attB.wallBonus НЕ участвует нигде — у
// атакующего в чужом походе своей стены нет; тем же принципом объясняется,
// почему сам урон ПО атакующему (dmgTo(defS,attS)) зовётся с defWallLv=0/
// wallBonus=0 — там "защитник" внутри dmgTo это атакующая сторона данного
// обмена, у которой стены дома нет.
export function resolvePvp(attUnits, attP, defUnits, defP, defWallLv = 0, defGarrisonLv = 0) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const attB = bonuses(attP), defB = bonuses(defP, true);
  const attS = sideStats(attUnits, attP.race, attB), defS = sideStats(defUnits, defP.race, defB);
  const dmgToDef = dmgTo(attS, defS, defWallLv, defB.wallBonus), dmgToAtt = dmgTo(defS, attS);
  const openG = garrisonVolley(defGarrisonLv, attS);
  if (openG) TKEYS.forEach((t) => { dmgToAtt[t] = (dmgToAtt[t] || 0) + (openG[t] || 0); });
  const defLoss = applyLosses(defUnits, dmgToDef, defP.race, defB.hp);
  const attLoss = applyLosses(attUnits, dmgToAtt, attP.race, attB.hp);
  const defHpLeft = Math.max(0, defS.totalHp - defLoss.hpLost);
  const attHpLeft = Math.max(0, attS.totalHp - attLoss.hpLost);
  // Победитель: чья сторона выжила целиком при уничтоженной другой, иначе —
  // у кого осталось больше суммарного HP. ВНИМАНИЕ: эта копия описывает
  // ОДНООБМЕННУЮ модель Фазы 6 и с Фазы 9 отстала от настоящей —
  // mp-tick/index.js давно раундовый (кусочки 1-5: погода/дисциплина/
  // полководцы/первый залп/контрудар) и с кусочка 6 решает ничью честным
  // armyPower(), а не приближением по HP, как здесь. Рефакторить эту копию
  // вслед за каждым кусочком Фазы 9 не стали намеренно — rules.js нигде не
  // импортируется (ни одна Edge Function не читает его — все self-
  // contained копии, см. заголовок файла), это чисто справочный текст —
  // отставание тут не ломает ничего реального, только сам комментарий
  // вводит в заблуждение, если не знать про это уточнение.
  // Ничья (в т.ч. 0:0) — победа ОБОРОНЫ, тот же принцип, что и в
  // resolveBattle() (index.html: win=...powA>powD?"A":"D" — строго больше
  // для нападавших, иначе защита; см. комментарий там же "штурм не удался").
  const winner = defHpLeft <= 0 && attHpLeft > 0 ? "att" : attHpLeft <= 0 && defHpLeft > 0 ? "def" : (attHpLeft > defHpLeft ? "att" : "def");
  return { attLoss: attLoss.units, defLoss: defLoss.units, attHpLeft, defHpLeft, winner };
}

// index.html:2867 HOSPITAL_CAP_TABLE / hospitalCap / totalHospitalCap —
// сколько раненых вмещает лазарет (сумма по всем 4 построенным участкам,
// см. Фаза 5, пятый кусочек). Другая таблица, чем HOSPITAL_BUILD_TABLE
// выше (та — стоимость/время постройки, эта — ёмкость лазарета).
export const HOSPITAL_CAP_TABLE = [
  7500, 8250, 9000, 10000, 11000, 12250, 13500, 15000, 16500,
  18250, 20000, 22000, 24000, 26500, 29000, 32000, 35000, 38500, 42000, 46000, 50000,
  54500, 59500, 65000, 75000,
];
export const hospitalCap = (lv) => (lv <= 0 ? 0 : tblRow(HOSPITAL_CAP_TABLE, lv));
export function totalHospitalCap(p) {
  const plots = p.b && p.b.hospital;
  return (Array.isArray(plots) ? plots : [plots || 0]).reduce((s, lv) => s + hospitalCap(lv), 0);
}
// index.html:4340 SLIGHT_WOUND_FRAC / index.html:4351 hospitalSplit — Фаза
// 4, шестой кусочек: часть потерь (loss, уже вычтенных из активного войска
// resolvePvp'ом) отделывается лёгким испугом и НЕМЕДЛЕННО возвращается в
// строй (slight, 12%, лазарет не нужен), часть едет в лазарет (hurt,
// копится в p.wounded — само лечение, healUnit, ещё не перенесено на
// сервер, честная заглушка, раненые там и остаются), остаток, что не влез
// в лазарет, гибнет насовсем (dead). mode:"siege-attack" (штурмующий
// чужой город) — гибель насмерть без исключений, той же логике, что
// index.html:4352-4359; в общем мире это всегда атакующий марш — у
// защитника всегда обычный режим (лазарет свой, дома). bonuses(p).hosp/
// mercy — Фаза 6, настоящий подсчёт (index.html:4360 зовёт bonuses(p) БЕЗ
// defending=true, дословно повторено здесь, а не "исправлено" на true —
// hospitalSplit в клиенте используется не только для обороны города).
export const SLIGHT_WOUND_FRAC = 0.12;
export function hospitalSplit(p, loss, mode) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  if (mode === "siege-attack") {
    const deadUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
    let dead = 0;
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) { const n = (loss[t] && loss[t][i]) || 0; deadUnits[t][i] = n; dead += n; } });
    return { dead, hurt: 0, slight: 0, slightUnits: { inf: {}, arc: {}, cav: {}, sie: {} }, deadUnits, hurtUnits: { inf: {}, arc: {}, cav: {}, sie: {} } };
  }
  const B = bonuses(p);
  const cap = Math.round(totalHospitalCap(p) * (1 + B.hosp + B.mercy));
  let inHosp = 0;
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) inHosp += (p.wounded && p.wounded[t] && p.wounded[t][i]) || 0; });
  let dead = 0, hurt = 0, slight = 0;
  const slightUnits = { inf: {}, arc: {}, cav: {}, sie: {} }, deadUnits = { inf: {}, arc: {}, cav: {}, sie: {} }, hurtUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      let n = (loss[t] && loss[t][i]) || 0;
      slightUnits[t][i] = 0; hurtUnits[t][i] = 0; deadUnits[t][i] = 0;
      if (!n) continue;
      const sl = Math.round(n * SLIGHT_WOUND_FRAC);
      if (sl > 0) { slightUnits[t][i] = sl; slight += sl; n -= sl; }
      const room = Math.max(0, cap - inHosp);
      const w = Math.min(n, room);
      inHosp += w;
      hurtUnits[t][i] = w; hurt += w;
      const d = n - w;
      deadUnits[t][i] = d; dead += d;
    }
  });
  return { dead, hurt, slight, slightUnits, deadUnits, hurtUnits };
}

// =============================================================================
// Марш — Фаза 4, второй кусочек: настоящее время в пути вместо мгновенной
// атаки. Зеркало marchSlots (index.html:2863) и marchSpeed/sendMarch
// (index.html:4640-4681), с одним честным упрощением: расстояние —
// напрямую по прямой (Math.hypot), а не waterPath() (index.html:4596) —
// та огибает воду по карте W.map, а в общем мире клетки местности
// (map_cells) ещё не сгенерированы вообще, обходить пока нечего.
export const MARCH_SPEED_SCALE = 32;
export const marchSlots = (hall) => (hall >= 22 ? 5 : hall >= 17 ? 4 : hall >= 11 ? 3 : hall >= 5 ? 2 : 1);
// index.html:4641 marchSpeed — минимальная скорость среди отправленных
// типов войск (медленный тип держит темп всего отряда), ×MARCH_SPEED_SCALE,
// ×bonuses(p).march (временно = 1, та же заглушка, что и everywhere else).
export function marchSpeed(units, race, marchBonus = 1) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  let s = 99;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      if ((units[t] && units[t][i]) > 0) s = Math.min(s, TROOP_TYPES[t].speed * troopMod(race, t, "speed"));
    }
  });
  if (s > 90) s = 1; // пустой отряд — не должно случаться (проверка на totalSend>0 выше по стеку), но не делить на 0
  return s * MARCH_SPEED_SCALE * marchBonus; // клеток в минуту
}
// index.html:4663/4775 — время в пути в секундах: расстояние (клетки) /
// скорость (клеток/мин) * 60, не короче 20с туда / 15с обратно (те же
// нижние пороги, что и в index.html, чтобы соседние клетки не били
// мгновенно).
export function travelSeconds(dist, units, race, marchBonus, minSec) {
  const spd = marchSpeed(units, race, marchBonus);
  return Math.max(minSec, (dist / spd) * 60);
}

// index.html:4696/4722 SCOUT_SPEED_MULT/scoutSpeed — лазутчик налегке,
// заметно быстрее армии (SCOUT_SPEED_MULT=2.2), плюс надбавка от уровня
// самого здания Разведки (SCOUT_TABLE.bonus). marchSpeed(p,emptyUnits()) в
// клиенте с пустым отрядом всегда падает на запасной случай s=1 (см.
// marchSpeed выше) — лазутчик не тянет расовые модификаторы скорости
// конкретных родов войск, отправляется налегке.
export const SCOUT_SPEED_MULT = 2.2;
export function scoutSpeed(scoutLv, marchBonus = 1) {
  const speedMult = SCOUT_SPEED_MULT * (1 + tblRow(SCOUT_TABLE, scoutLv).bonus / 100);
  return 1 * MARCH_SPEED_SCALE * marchBonus * speedMult; // клеток в минуту
}
// index.html:4723 — минимум 15с (не 20с, как у боевого марша) — та же
// нижняя граница, что и в клиенте.
export function scoutTravelSeconds(dist, scoutLv, marchBonus = 1) {
  return Math.max(15, (dist / scoutSpeed(scoutLv, marchBonus)) * 60);
}

// =============================================================================
// Дерево исследований — Фаза 5, Академия (ACADEMY_TREE). Перенесено дословно
// из index.html (RS_*-таблицы: 1854-1916, RESEARCH_TABLE: 1917-1997,
// researchTime/Cost/Power: 2007-2023, ACADEMY_TREE: 2024-2153,
// tierUnlockedFor/findNode/nodeVisibleFor: 2154-2167, TIER_NAMES: 2615-2620,
// nodeTitle: 3651-3654, nodeDepth/ROW_SIZES/computeRows/rowGate/
// EPOCH_HALL_MIN/researchLocked/lockReason: 3656-3704) — самый крупный кусок
// данных во всём этом модуле, ~70 узлов дерева на два раздела (eco/mil).
//
// Особенность, которую легко упустить при поверхностном чтении: разблокировка
// узла (researchLocked/rowGate) НЕ проверяет впрямую n.requires — она
// смотрит, закончен ли ЦЕЛИКОМ предыдущий визуальный РЯД дерева
// (computeRows группирует узлы одного "уровня глубины" — nodeDepth,
// посчитанный по цепочке requires, — в ряды по ROW_SIZES=[4,3,4,2] штук для
// красоты интерфейса). n.requires используется ТОЛЬКО для расчёта глубины
// узла, а не как прямой список условий — это дословное поведение клиента,
// не упрощение с нашей стороны, каким бы неожиданным оно ни казалось.
//
// bonuses(p).researchSpeed (влияет на длительность БУДУЩИХ исследований
// через researchTime(n,lv)/(1+B.researchSpeed), index.html:5859) и сами
// ЭФФЕКТЫ уже исследованных узлов (n.field/n.effects — надбавки к добыче/
// бою/etc) — с Фазы 6 оба подключены по-настоящему через bonuses() ниже в
// этом же файле (см. её собственный заголовок): p.tech заполняется
// настоящими уровнями (эта Фаза, Фаза 5), а сами бонусы от них применяются
// в production()/trainDuration/healDuration/buildDuration/dmgTo/sideStats
// и mp-research'а собственном researchTime()/(1+B.researchSpeed) (Фаза 6).
//
// gen-гейтед "венцы" (eco_crown_*/mil_crown_* с полем gen:0|1) видны только
// игроку с p.gen.id===n.gen (nodeVisibleFor: n.gen!==(p.gen.id||0)) —
// генералы на сервер не перенесены (p.gen.id всегда null у всех игроков, см.
// mp-join), поэтому p.gen.id||0 всегда 0. ИСПРАВЛЕНИЕ более раннего неверного
// заявления в этом файле: НЕ все 8 венцов от этого недостижимы — у
// eco_crown_* gen:1 (0!==1 -> невидим, действительно недостижим), а у
// mil_crown_* gen:0 (0===0 -> ВИДИМ) — эти 4 узла честно достижимы любым
// игроком подходящей расы, как только он пройдёт row-гейтинг предыдущего
// ряда, генерал тут вообще ни при чём (см. bonuses(), Фаза 6, ниже: их
// effects тоже подключены и реально действуют).
export const TIER_NAMES = {           // общий набор — служит запасным вариантом (разбойники и т.п.)
  inf:["Ополченец","Мечник","Копейщик","Латник","Гвардеец"],
  arc:["Лучник","Стрелок","Арбалетчик","Снайпер","Мастер лука"],
  cav:["Всадник","Разведчик","Рыцарь","Кирасир","Паладин"],
  sie:["Таран","Баллиста","Катапульта","Онагр","Требушет"],
};
export function nodeTitle(n) {
  if (n.unlock) return ({ inf: "Пехота", arc: "Лучники", cav: "Кавалерия", sie: "Осада" }[n.unlock.type]) + ": " + TIER_NAMES[n.unlock.type][n.unlock.tier - 1];
  return n.name;
}
export const RS_BALLISTICS = [{food:400000,wood:400000,stone:300000,gold:200000,t:25920,power:4536},{food:600000,wood:600000,stone:450000,gold:300000,t:51840,power:11859},{food:900000,wood:900000,stone:675000,gold:450000,t:104400,power:23881},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:208800,power:43989},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:414000,power:78302},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:828000,power:138066},{food:4560000,wood:4560000,stone:3420000,gold:2740000,t:1659600,power:246584},{food:6840000,wood:6840000,stone:5130000,gold:4100000,t:3319200,power:442538},{food:10250000,wood:10250000,stone:7700000,gold:6150000,t:6634800,power:802824},{food:15375000,wood:15375000,stone:11550000,gold:9225000,t:13302000,power:1475963}];
export const RS_BUCKLER = [{food:40000,wood:40000,stone:30000,gold:20000,t:21600,power:1214},{food:80000,wood:80000,stone:60000,gold:40000,t:30240,power:3123},{food:160000,wood:160000,stone:120000,gold:80000,t:42360,power:6216},{food:320000,wood:320000,stone:240000,gold:160000,t:59280,power:11386},{food:640000,wood:640000,stone:480000,gold:320000,t:82980,power:20305}];
export const RS_CAMOUFLAGE = [{food:400000,wood:400000,stone:300000,gold:200000,t:18000,power:4220},{food:600000,wood:600000,stone:450000,gold:300000,t:54000,power:11630},{food:900000,wood:900000,stone:675000,gold:540000,t:162000,power:26435},{food:1350000,wood:1350000,stone:1010000,gold:810000,t:486000,power:58362},{food:2030000,wood:2030000,stone:1520000,gold:1220000,t:1458000,power:135413}];
// Также используется для eco_amber1 (Cutting & Polishing) — у неё самой стоимость/
// время не подтверждены источником напрямую, приведены "по паттерну Carriage"
// (тот же тир, та же оценка уже сделана в самой табличке).
export const RS_CARRIAGE = [{food:400000,wood:400000,stone:300000,gold:200000,t:48000,power:5420},{food:600000,wood:600000,stone:450000,gold:300000,t:72000,power:13550},{food:900000,wood:900000,stone:675000,gold:450000,t:108000,power:25745},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:162000,power:44039},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:244800,power:71484},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:363600,power:112656},{food:4600000,wood:4600000,stone:3400000,gold:2300000,t:547200,power:174414},{food:6840000,wood:6840000,stone:5130000,gold:3420000,t:820800,power:267053},{food:10250000,wood:10250000,stone:7700000,gold:5130000,t:1231200,power:406011},{food:15375000,wood:15375000,stone:11550000,gold:7695000,t:2462400,power:614450}];
export const RS_CARTOGRAPHY = [{food:850000,wood:850000,stone:637500,gold:425000,t:36000,power:8877},{food:1280000,wood:1280000,stone:957000,gold:638000,t:54000,power:22198},{food:1910000,wood:1910000,stone:1440000,gold:1150000,t:81000,power:43136},{food:2870000,wood:2870000,stone:2150000,gold:1720000,t:122400,power:74543},{food:4300000,wood:4300000,stone:3230000,gold:2580000,t:183600,power:121648}];
export const RS_CHISEL = [{food:30000,wood:30000,stone:22500,gold:15000,t:3600,power:406},{food:60000,wood:60000,stone:45000,gold:30000,t:5400,power:1147},{food:120000,wood:120000,stone:90000,gold:60000,t:7200,power:2485},{food:240000,wood:240000,stone:180000,gold:120000,t:14400,power:5161},{food:480000,wood:480000,stone:360000,gold:240000,t:28800,power:10513}];
export const RS_COMBATTACTICS = [{food:500000,wood:500000,stone:375000,gold:250000,t:32400,power:5671},{food:750000,wood:750000,stone:563000,gold:375000,t:64800,power:14827},{food:1130000,wood:1130000,stone:845000,gold:675000,t:129600,power:30421},{food:1690000,wood:1690000,stone:1270000,gold:1010000,t:259200,power:56408},{food:2530000,wood:2530000,stone:1900000,gold:1520000,t:518400,power:100570},{food:3800000,wood:3800000,stone:2860000,gold:2280000,t:1036800,power:177222},{food:5700000,wood:5700000,stone:4290000,gold:3420000,t:2073600,power:312936},{food:8550000,wood:8550000,stone:6440000,gold:5130000,t:4147200,power:557994},{food:12830000,wood:12830000,stone:9660000,gold:7700000,t:8294400,power:1008570},{food:19250000,wood:19250000,stone:14490000,gold:11550000,t:16588800,power:1850342}];
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
export const RS_CROWN_ECO = [{food:387823,wood:387823,stone:290867,gold:193911,t:46539,power:5255},{food:581734,wood:581734,stone:436301,gold:290867,t:69808,power:13138},{food:872601,wood:872601,stone:654451,gold:436301,t:104712,power:24961},{food:1308902,wood:1308902,stone:979253,gold:654451,t:157068,power:42698},{food:1968201,wood:1968201,stone:1473727,gold:979253,t:237348,power:69308}];
export const RS_CROWN_MIL = [{food:426027,wood:426027,stone:319520,gold:213014,t:27607,power:4832},{food:639041,wood:639041,stone:479707,gold:319520,t:55213,power:12633},{food:962821,wood:962821,stone:719986,gold:575137,t:110426,power:25920},{food:1439972,wood:1439972,stone:1082109,gold:860575,t:220852,power:48063},{food:2155697,wood:2155697,stone:1618903,gold:1295123,t:441705,power:85691}];
export const RS_ENGINEERING = [{food:250000,wood:250000,stone:187500,gold:125000,t:43200,power:3915},{food:375000,wood:375000,stone:282000,gold:188000,t:60480,power:9620},{food:563000,wood:563000,stone:423000,gold:282000,t:84660,power:17937},{food:845000,wood:845000,stone:635000,gold:423000,t:118800,power:30078},{food:1270000,wood:1270000,stone:953000,gold:635000,t:165600,power:47822},{food:1900000,wood:1900000,stone:1430000,gold:953000,t:234000,power:73778},{food:2850000,wood:2850000,stone:2150000,gold:1430000,t:324000,power:111786},{food:4280000,wood:4280000,stone:3220000,gold:2150000,t:453600,power:167500},{food:6420000,wood:6420000,stone:4830000,gold:3220000,t:637200,power:249252},{food:9630000,wood:9630000,stone:7240000,gold:4830000,t:892800,power:369332}];
export const RS_HANDCART = [{food:50000,wood:50000,stone:37500,gold:25000,t:3600,power:581},{food:100000,wood:100000,stone:75000,gold:50000,t:5400,power:1672},{food:200000,wood:200000,stone:150000,gold:100000,t:7200,power:3710},{food:400000,wood:400000,stone:300000,gold:200000,t:14400,power:7786},{food:800000,wood:800000,stone:600000,gold:400000,t:28800,power:15938}];
export const RS_HEAVYFRAME = [{food:400000,wood:400000,stone:300000,gold:200000,t:38880,power:5055},{food:600000,wood:600000,stone:450000,gold:300000,t:77760,power:13415},{food:900000,wood:900000,stone:675000,gold:450000,t:154800,power:27510},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:309600,power:51765},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:622800,power:94373},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:1245600,power:170726},{food:4560000,wood:4560000,stone:3420000,gold:2740000,t:2487600,power:312421},{food:6840000,wood:6840000,stone:5130000,gold:4100000,t:4975200,power:574730},{food:10250000,wood:10250000,stone:7700000,gold:6150000,t:9954000,power:1067727},{food:15380000,wood:15380000,stone:11540000,gold:9230000,t:13302000,power:2006287}];
export const RS_IRONWORKING = [{food:10000,wood:10000,t:3600,power:184},{food:20000,wood:20000,t:4320,power:252},{food:40000,wood:40000,stone:30000,t:5160,power:457},{food:80000,wood:80000,stone:60000,t:6240,power:748},{food:160000,wood:160000,stone:120000,t:8160,power:1298}];
export const RS_IRRIGATION = [{food:5000,wood:5000,t:600,power:44},{food:10000,wood:10000,stone:7500,t:900,power:142},{food:20000,wood:20000,stone:15000,t:2000,power:347},{food:40000,wood:40000,stone:30000,t:4980,power:797},{food:80000,wood:80000,stone:60000,t:9960,power:1697}];
export const RS_JEWELRY = [{food:1000000,wood:1000000,stone:750000,gold:500000,t:10800,power:9182}];
// 10-й уровень: время в источнике не подтверждено ('?'), взято по общему для тира
// росту ×1.4 от 9-го уровня (тот же коэффициент, что и у соседних серий тира).
export const RS_MACHINERY = [{food:350000,wood:350000,stone:275000,gold:175000,t:36000,power:4540},{food:525000,wood:525000,stone:413000,gold:263000,t:50400,power:11210},{food:788000,wood:788000,stone:620000,gold:395000,t:70560,power:21019},{food:1180000,wood:1180000,stone:930000,gold:593000,t:97200,power:35453},{food:1770000,wood:1770000,stone:1400000,gold:890000,t:136800,power:56711},{food:2660000,wood:2660000,stone:2090000,gold:1340000,t:194400,power:88049},{food:3990000,wood:3990000,stone:3140000,gold:2000000,t:270000,power:134286},{food:5990000,wood:5990000,stone:4710000,gold:3010000,t:378000,power:202560},{food:8980000,wood:8980000,stone:7070000,gold:4510000,t:532800,power:303458},{food:13500000,wood:13500000,stone:10600000,gold:6800000,t:745200,power:452681}];
export const RS_MASONRY = [{food:20000,wood:20000,stone:15000,t:3600,power:269},{food:30000,wood:30000,stone:22500,t:5400,power:672},{food:50000,wood:50000,stone:37500,t:7200,power:1272},{food:70000,wood:70000,stone:52500,t:10800,power:2141},{food:100000,wood:100000,stone:75000,t:28800,power:3918}];
export const RS_MEDICALCORPS = [{food:500000,wood:500000,stone:375000,gold:250000,t:38880,power:5930},{food:750000,wood:750000,stone:563000,gold:375000,t:77760,power:15604},{food:1130000,wood:1130000,stone:845000,gold:563000,t:154800,power:31674},{food:1690000,wood:1690000,stone:1270000,gold:844000,t:309600,power:58891},{food:2530000,wood:2530000,stone:1900000,gold:1270000,t:622800,power:105938},{food:3800000,wood:3800000,stone:2850000,gold:1900000,t:1245600,power:188950},{food:5700000,wood:5700000,stone:4280000,gold:3420000,t:2487600,power:341205},{food:8550000,wood:8550000,stone:6420000,gold:5130000,t:4975200,power:619354},{food:12820000,wood:12820000,stone:9630000,gold:7690000,t:9954000,power:1136111},{food:19200000,wood:19200000,stone:14400000,gold:11500000,t:20008800,power:2110314}];
export const RS_METALLURGY = [{food:50000,wood:50000,stone:37500,t:1800,power:384}];
export const RS_MILDISCIPLINE = [{food:5000,wood:5000,t:900,power:56}];
export const RS_MULTILAYER = [{food:40000,wood:40000,stone:30000,gold:20000,t:3600,power:494},{food:80000,wood:80000,stone:60000,gold:40000,t:7200,power:1482},{food:160000,wood:160000,stone:120000,gold:80000,t:14400,power:3458},{food:320000,wood:320000,stone:240000,gold:160000,t:28800,power:7410},{food:640000,wood:640000,stone:480000,gold:320000,t:57600,power:15314}];
export const RS_PLOW = [{food:100000,wood:100000,stone:75000,gold:50000,t:28800,power:2027},{food:150000,wood:150000,stone:113000,gold:75000,t:40320,power:4953},{food:225000,wood:225000,stone:170000,gold:113000,t:56460,power:9185},{food:338000,wood:338000,stone:255000,gold:170000,t:79020,power:15313},{food:507000,wood:507000,stone:383000,gold:255000,t:111600,power:24190},{food:761000,wood:761000,stone:575000,gold:383000,t:154800,power:37069},{food:1140000,wood:1140000,stone:863000,gold:575000,t:216000,power:55775},{food:1710000,wood:1710000,stone:1300000,gold:863000,t:302400,power:82970},{food:2570000,wood:2570000,stone:1940000,gold:1300000,t:424800,power:122555},{food:3860000,wood:3860000,stone:2920000,gold:1940000,t:594000,power:180236}];
export const RS_QUARRYING = [{food:100,wood:100,t:60,power:5}];
export const RS_SCYTHE = [{food:200000,wood:200000,stone:150000,gold:100000,t:36000,power:3190},{food:300000,wood:300000,stone:225000,gold:150000,t:50400,power:7831},{food:450000,wood:450000,stone:338000,gold:225000,t:70560,power:14592},{food:675000,wood:675000,stone:507000,gold:338000,t:97200,power:24454},{food:1010000,wood:1010000,stone:761000,gold:507000,t:136800,power:38855},{food:1520000,wood:1520000,stone:1140000,gold:761000,t:194400,power:59910},{food:2280000,wood:2280000,stone:1710000,gold:1140000,t:270000,power:90721},{food:3420000,wood:3420000,stone:2570000,gold:1710000,t:378000,power:135855},{food:5130000,wood:5130000,stone:3860000,gold:2570000,t:532800,power:202041},{food:7700000,wood:7700000,stone:5780000,gold:3860000,t:745200,power:299196}];
export const RS_SICKLE = [{food:20000,wood:20000,stone:15000,t:900,power:161},{food:40000,wood:40000,stone:30000,t:1800,power:483},{food:80000,wood:80000,stone:60000,t:3600,power:1127},{food:160000,wood:160000,stone:120000,t:7200,power:2415},{food:320000,wood:320000,stone:240000,t:14400,power:4991}];
// 10-й уровень: время не подтверждено источником, оценено тем же способом, что и Machinery.
export const RS_STONESAW = [{food:300000,wood:300000,stone:225000,gold:150000,t:36000,power:4065},{food:450000,wood:450000,stone:338000,gold:225000,t:50400,power:10020},{food:675000,wood:675000,stone:507000,gold:338000,t:70560,power:18753},{food:1010000,wood:1010000,stone:761000,gold:507000,t:97200,power:31574},{food:1520000,wood:1520000,stone:1140000,gold:761000,t:136800,power:50416},{food:2280000,wood:2280000,stone:1710000,gold:1140000,t:194400,power:78129},{food:3420000,wood:3420000,stone:2570000,gold:1710000,t:270000,power:118926},{food:5130000,wood:5130000,stone:3860000,gold:2570000,t:378000,power:179040},{food:7700000,wood:7700000,stone:5780000,gold:3860000,t:532800,power:267695},{food:11500000,wood:11500000,stone:8700000,gold:5800000,t:745200,power:398558}];
export const RS_T2UNLOCK_MELEE = [{food:200000,wood:200000,stone:150000,t:36000,power:2690}];
export const RS_T2UNLOCK_SIEGE = [{food:200000,wood:200000,stone:150000,t:45000,power:3050}];
export const RS_T3UNLOCK_MELEE = [{food:1500000,wood:1500000,stone:1130000,gold:1500000,t:259200,power:27243}];
export const RS_T3UNLOCK_SIEGE = [{food:1500000,wood:1500000,stone:1130000,gold:1500000,t:388800,power:32427}];
export const RS_T4UNLOCK_MELEE = [{food:5000000,wood:5000000,stone:3750000,gold:5000000,t:2592000,power:159930}];
export const RS_T4UNLOCK_SIEGE = [{food:5000000,wood:5000000,stone:3750000,gold:5000000,t:3888000,power:211770}];
export const RS_T5UNLOCK_MELEE = [{food:10000000,wood:10000000,stone:7500000,gold:10000000,t:8643600,power:485748}];
export const RS_T5UNLOCK_SIEGE = [{food:10000000,wood:10000000,stone:7500000,gold:10000000,t:12965400,power:672382}];
export const RS_TRACKING = [{food:15000,wood:15000,stone:11300,t:7200,power:381},{food:30000,wood:30000,stone:22500,t:10080,power:971},{food:60000,wood:60000,stone:45000,t:14100,power:1910},{food:120000,wood:120000,stone:90000,t:19740,power:3450},{food:240000,wood:240000,stone:180000,t:27660,power:6056}];
export const RS_WHEEL = [{food:60000,wood:60000,stone:45000,gold:30000,t:3600,power:669},{food:120000,wood:120000,stone:90000,gold:60000,t:7200,power:2007},{food:240000,wood:240000,stone:180000,gold:120000,t:14400,power:4683},{food:480000,wood:480000,stone:360000,gold:240000,t:28800,power:10035},{food:960000,wood:960000,stone:720000,gold:480000,t:57600,power:20739}];
export const RS_WOOTZSTEEL = [{food:400000,wood:400000,stone:300000,gold:200000,t:17280,power:4191},{food:600000,wood:600000,stone:450000,gold:300000,t:34560,power:10823},{food:900000,wood:900000,stone:675000,gold:450000,t:69120,power:21462},{food:1350000,wood:1350000,stone:1010000,gold:675000,t:136800,power:38805},{food:2030000,wood:2030000,stone:1520000,gold:1010000,t:277200,power:67589},{food:3040000,wood:3040000,stone:2280000,gold:1520000,t:554400,power:116294},{food:4560000,wood:4560000,stone:3420000,gold:2740000,t:1105200,power:202693},{food:6840000,wood:6840000,stone:5130000,gold:4100000,t:2210400,power:354410},{food:10250000,wood:10250000,stone:7700000,gold:6150000,t:4424400,power:626223},{food:15375000,wood:15375000,stone:11550000,gold:9225000,t:9453600,power:1122415}];
export const RS_WRITING = [{food:50000,wood:50000,stone:37500,gold:25000,t:7200,power:725},{food:100000,wood:100000,stone:75000,gold:50000,t:14400,power:2176},{food:200000,wood:200000,stone:150000,gold:100000,t:28800,power:5078},{food:400000,wood:400000,stone:300000,gold:200000,t:57600,power:10882},{food:800000,wood:800000,stone:600000,gold:400000,t:115200,power:22490}];
export const RESEARCH_TABLE = {
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
export const RESEARCH_GROWTH=1.6, RESEARCH_WAVE={1:1,2:5,3:20,4:60};
export const RESEARCH_POWER_BASE={eco:28500, mil:26200};
export const RESEARCH_POWER_WAVE = {1:0.018, 2:5, 3:20, 4:60};
export const ECO_TIME_BASE=900, MIL_TIME_BASE=720;
export function researchTime(n,lv){
  const row=(RESEARCH_TABLE[n.id]||[])[lv-1];
  if(row) return row.t;
  const base = n.branch==="eco"?ECO_TIME_BASE:MIL_TIME_BASE;
  return Math.round(base*RESEARCH_WAVE[n.wave]*Math.pow(RESEARCH_GROWTH,lv-1));
}
export function researchCost(n,lv){
  const row=(RESEARCH_TABLE[n.id]||[])[lv-1];
  if(row) return {food:row.food||0,wood:row.wood||0,stone:row.stone||0,gold:row.gold||0};
  const t=researchTime(n,lv), base=t*4.44;   // та же пропорция цена/время, что у построек — только для венцов
  return {food:Math.round(base),wood:Math.round(base),stone:Math.round(base*.435),gold:0};
}
export function researchPower(n,lv){
  const row=(RESEARCH_TABLE[n.id]||[])[lv-1];
  if(row) return row.power;
  return lv*RESEARCH_POWER_WAVE[n.wave]*RESEARCH_POWER_BASE[n.branch];
}
export const ACADEMY_TREE = {
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
export function tierUnlockedFor(p,type){
  let mx=1;
  for(let t=2;t<=5;t++){ if((p.tech["mil_tier_"+type+t]||0)>=1) mx=t; else break }
  return mx;
}
export function findNode(id){
  for(const arr of [ACADEMY_TREE.eco, ACADEMY_TREE.mil]) for(const n of arr) if(n.id===id) return n;
  return null;
}
export function nodeVisibleFor(n,p){                          // раса + выбор генерала (венец только один — в его ветке)
  if(n.race && n.race!==p.race) return false;
  if(n.gen!=null && n.gen!==(p.gen.id||0)) return false;
  return true;
}
export function nodeDepth(n,arr,cache){
  if(cache.has(n.id)) return cache.get(n.id);
  cache.set(n.id,0); // защита от случайного цикла в данных
  const reqs=n.requires||[];
  const d = reqs.length ? 1+Math.max(...reqs.map(id=>{
    const pn=arr.find(x=>x.id===id); return pn?nodeDepth(pn,arr,cache):0;
  })) : 0;
  cache.set(n.id,d);
  return d;
}
export const ROW_SIZES=[4,3,4,2];    // рядами по 2-4 для красоты, а не одной длинной стеной
export function computeRows(arr,p){
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
export function rowGate(n,p){
  const rows=computeRows(ACADEMY_TREE[n.branch],p);
  const idx=rows.findIndex(row=>row.some(x=>x.id===n.id));
  if(idx<=0) return {locked:false,missing:[]};
  const missing=rows[idx-1].filter(x=>(p.tech[x.id]||0)<x.max);
  return {locked:missing.length>0,missing};
}
export function researchLocked(n,p){
  if(epochOf(p.b.hall)<n.wave) return true;
  return rowGate(n,p).locked;
}
export const EPOCH_HALL_MIN=[1,7,13,19,25];
export function lockReason(n,p){
  if(epochOf(p.b.hall)<n.wave) return "нужна ратуша "+EPOCH_HALL_MIN[n.wave-1]+" уровня";
  const missing=rowGate(n,p).missing;
  if(missing.length) return "нужно закончить: "+missing.map(x=>nodeTitle(x)).join(", ");
  return "заблокировано";
}

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
//   6. ~~Талантовые бонусы генерала и GENERAL_TREE~~ — закрыто в Фазе 10,
//      кусочек 3: mp-talent (кусочек 2) начал реально заполнять p.gen.tal,
//      здесь bonuses() наконец читает оба блока (index.html:3760-3767 и
//      3780-3787), а не только копит очки без эффекта.
//
// index.html:2283-2344 GENERALS — оба генерала на расу (name — только для
// mp-pickgen'а ответа/сверки, косметика apply не нужна серверу).
export const GENERALS = {
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
export const RACES_MINUS = {
  human:  { field: "prodGold", kind: "frac", value: -0.15 },
  dwarf:  { field: "march",    kind: "mult", value: 0.90 },
  elf:    { field: "def",      kind: "frac", value: -0.10 },
  undead: { field: "def",      kind: "frac", value: -0.10 },
};
// index.html:1767-1832 RACE_EPOCHS — mods (действуют всегда, как только
// открыта эпоха), defMods (только у 5-й эпохи, только при обороне).
export const RACE_EPOCHS = {
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
export const portalMarchBonus = (lv) => (lv <= 0 ? 0 : lv <= 10 ? lv * 0.005 : 10 * 0.005 + (lv - 10) * 0.01);

export function bonuses(p, defending = false) {
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
export function production(p) {
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

// =============================================================================
// Мощь державы (power) — Фаза 31.
// =============================================================================
// --- НАЧАЛО СГЕНЕРИРОВАННОГО БЛОКА (tools/gen_power_tables.mjs) ---
// Таблицы мощи, вынутые из index.html. НЕ ПРАВИТЬ РУКАМИ: правьте исходные
// таблицы в index.html и перегенерируйте (node tools/gen_power_tables.mjs).
// Сверить, не разошлись ли копии: node tools/gen_power_tables.mjs --check
export const POWER_BUILD = {
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
export const POWER_RSCH = {
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
export const POWER_RSCH_META = {
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
export const POWER_RSCH_WAVE = {1:0.018,2:5,3:20,4:60};
export const POWER_RSCH_BASE = [28500,26200];
export const POWER_UNIT = [1,2,3,4,10];
export const POWER_GEAR = [1250,2750,6250,15000,37500];
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
export const POWER_TKEYS = ["inf", "arc", "cav", "sie"];
export const powerTblRow = (arr, lv) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(lv) - 1))];
export function buildingPowerOf(bk, lv) {
  lv = +lv || 0;
  if (lv <= 0) return 0;
  const arr = POWER_BUILD[bk];
  if (!arr || !arr.length) return 0;
  return powerTblRow(arr, lv);
}
export function researchPowerOf(id, lv) {
  const arr = POWER_RSCH[id];
  const row = arr && arr[lv - 1];
  if (row != null) return row;
  // Формула-запас для узлов без своей строки в таблице — index.html
  // researchPower(): lv * волна * база ветки.
  const meta = POWER_RSCH_META[id];
  if (!meta) return 0;
  return lv * (POWER_RSCH_WAVE[meta[0]] || 0) * (POWER_RSCH_BASE[meta[1]] || 0);
}
export function powerOf(p, marchUnits) {
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
export function applyPower(p, row, marchUnits) {
  const v = powerOf(p, marchUnits);
  p.peakPower = Math.max(p.peakPower || 0, v);
  if (row) row.power = v;
  return v;
}

