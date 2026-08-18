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
// bonuses(p).trainSpeed ЗАВИСИТ от рас/генералов/талантов/академии — вся эта
// ветка ещё не перенесена на сервер (см. README, Фаза 5). Пока временно
// считаем её нулевой (как будто ни одного бонуса скорости обучения нет) —
// это ПРИБЛИЖЕНИЕ, а не точная замена: реальные бонусы клиента-одиночки на
// сервере пока не действуют. Явно помечено здесь и в комментарии над
// вызовом в mp-train, чтобы не потерялось при следующем переносе.
export function trainDuration(hallLv, type, tier, n, trainSpeedBonus = 0) {
  return (trainTime(type, tier) * n) / ((1 + hallLv * 0.06) * (1 + trainSpeedBonus));
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
export const SCOUT_TABLE = [
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
export const BUILD_BLD_TABLE = {
  barracks: BARRACKS_TABLE, range: BARRACKS_TABLE, stable: BARRACKS_TABLE, siege: SIEGE_TABLE,
  hall: HALL_TABLE, wall: WALL_TABLE, store: STORE_BUILD_TABLE, academy: ACADEMY_BUILD_TABLE,
  hospital: HOSPITAL_BUILD_TABLE, farm: FARM_TABLE, lumber: LUMBER_TABLE, quarry: QUARRY_TABLE, mine: MINE_TABLE,
  garrison: WATCH_TABLE, scout: SCOUT_TABLE,
};
export const BUILD_MAX_LV = 25; // buildingMax(bk) для всех этих зданий — CFG.MAX_LEVEL, см. index.html
// index.html:2425 BUILDINGS.*.plots — multi-здания среди перенесённых:
// hospital (лазарет) и farm/lumber/quarry/mine (все 4 экономических).
// Портирован только участок 0 у каждого (индекс 0 у isMulti-зданий ВСЕГДА
// разблокирован — см. plotUnlocked в index.html, остальные 3 участка
// открываются по эпохе — epochOf(hall)>=idx+1 — то есть практически
// недостижимы, пока ратуша низкого уровня); участки 1-3 — следующий шаг.
// ВАЖНО: сам приток ресурсов от уровня фермы/лесопилки/каменоломни/шахты
// (production() в index.html, тикает по реальному времени через resAt) ещё
// НЕ перенесён — эти 4 здания пока можно строить/улучшать, но добыча
// ресурсов в общем мире по-прежнему не идёт сама по себе, это отдельный
// следующий шаг (другой тип механики — непрерывное накопление, а не
// разовое событие, как постройка/набор).
export const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);
// index.html:2463 HALL_REQ / index.html:2872 hallGateLevel — чтобы поднять
// ратушу с уровня L на L+1, все 5 зданий должны быть НЕ НИЖЕ текущего L.
export const HALL_REQ = ["wall", "store", "academy", "barracks", "hospital"];
export const BUILD_BLD_RU_NAME = {
  wall: "Стена", store: "Склад", academy: "Академия", barracks: "Казармы", hospital: "Госпиталь",
}; // упрощённые названия для текста ошибки HALL_REQ — buildingName() в index.html
   // ещё и красит их по расе/эпохе (BUILDING_TIER_NAMES), сюда эта косметика
   // не перенесена, там, где она реально нужна (клиентский предпросмотр во
   // вкладке "Общий мир"), используется настоящий buildingName() из index.html.

// index.html: buildTime/buildCost. bonuses(p).build/buildCostCut ЗАВИСЯТ от
// рас/генералов/талантов/академии — та же временная заглушка (=1/=0), что и
// у trainSpeed в trainDuration выше, тем же способом помечена.
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
// index.html:3790 production(). bonuses(p).prodAll/prodFood/prodWood/
// prodStone/prodGold/prodFW/prodSG ЗАВИСЯТ от рас/генералов/академии — та
// же временная заглушка (=0), что у trainSpeed/build выше. Т.к. пока
// перенесён только участок 0 у farm/lumber/quarry/mine (см. BUILD_MULTI),
// формула ниже автоматически считает только его — участки 1-3 всегда 0 в
// текущей форме состояния, forEach их честно учтёт (просто добавит 0), как
// только участки 1-3 станут переносимыми, менять здесь ничего не придётся.
export function production(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let base = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { if (lv > 0) base += prodRate(lv); });
    out[r] = base * PROD_MULT[r];
  });
  return out;
}
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
// PvP-бой — Фаза 4. НЕ resolveBattle() из index.html (index.html:4129) —
// тот раунд за раундом считает погоду, слом дисциплины, урон полководцам,
// поднятие нежити прямо в бою, контрудар гарнизона и оборону стены; полный
// перенос — отдельная большая задача (сравнимая по объёму с bonuses()).
// Здесь — единственный обмен ударами по настоящим базовым характеристикам
// войск (TROOP_TYPES/TIER_MULT/RACE_TROOP_MOD/COUNTER_UP/COUNTER_DOWN —
// буквальная копия из index.html:2578-2651, те же числа), без стены, без
// полководцев, без погоды/раундов/дисциплины/подъёма нежити. Урон по типу
// защитника считается той же формулой "доля-по-HP + контр-множитель", что
// и dmgTo() внутри resolveBattle() (index.html:4194-4213), просто один раз,
// а не в цикле — честно ПРИБЛИЖЕНИЕ, а не точная замена, как и остальные
// временные заглушки в этом файле (trainSpeed/build/prod-бонусы), только
// на этот раз — заглушка не одного бонуса, а всего боевого движка целиком.
export const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20];
export const TROOP_TYPES = {
  inf: { atk: 34, def: 46, hp: 44, speed: 1.00, magicAtk: 8, magicDef: 18, beats: "arc", losesTo: "cav" },
  arc: { atk: 50, def: 30, hp: 36, speed: 1.10, magicAtk: 20, magicDef: 8, beats: "cav", losesTo: "inf" },
  cav: { atk: 46, def: 34, hp: 40, speed: 1.70, magicAtk: 12, magicDef: 12, beats: "inf", losesTo: "arc" },
  sie: { atk: 24, def: 20, hp: 60, speed: 0.60, magicAtk: 26, magicDef: 6, beats: null, losesTo: null },
};
export const RACE_TROOP_MOD = {
  dwarf: { inf: { atk: 1.05, def: 1.05, hp: 1.05 } },
  human: { cav: { atk: 1.05, def: 1.05, hp: 1.05 } },
  elf: { arc: { atk: 1.05, def: 1.05, hp: 1.05 } },
  undead: { sie: { atk: 2.20 * 1.05, def: 1.05, hp: 1.05, speed: 1.20 } },
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
// войск (сумма по тирам), без бонусов (бонусы p.gen/tal/tech/race-пассивки
// ещё не перенесены, см. заголовок файла).
export function sideStats(units, race) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const s = {};
  TKEYS.forEach((t) => {
    let atk = 0, def = 0, matk = 0, mdef = 0, hp = 0, n = 0;
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      if (!c) continue;
      const w = TIER_MULT[i - 1];
      atk += c * TROOP_TYPES[t].atk * w * troopMod(race, t, "atk");
      def += c * TROOP_TYPES[t].def * w * troopMod(race, t, "def");
      matk += c * TROOP_TYPES[t].magicAtk * w * troopMod(race, t, "atk");
      mdef += c * TROOP_TYPES[t].magicDef * w * troopMod(race, t, "def");
      hp += c * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp");
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
// (1+wallDefBonus(lv)*(1+bonus)), где bonus (D.B.wallBonus, из bonuses())
// временно заглушён нулём, как и все остальные bonuses()-члены в этом
// файле; defWall умножает ИМЕННО дробь def/70 (мультипликативно внутри
// mitig=1+x/70*defWall — не всё выражение (1+x)), в точности как в
// index.html:4208. defWall=1, если стены нет (defWallLv<=0) или для урона
// по атакующему (у него в бою своя стена не защищает). Без
// CFG.BATTLE_PACE/шейка (это один обмен, не раунд в цикле — масштаб урона
// другой, скидка на "раунд" тут не нужна).
export function dmgTo(attS, defS, defWallLv = 0) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const defWall = 1 + wallDefBonus(defWallLv) * (1 + 0);
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
// точное распределение по тирам resolveBattle() не переносим). Возвращает
// {units, hpLost} — units той же формы, что p.troops[t], hpLost — суммарный
// нанесённый урон (нужен только для итоговой сводки).
export function applyLosses(units, dmgByType, race) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const lost = { inf: {}, arc: {}, cav: {}, sie: {} };
  let hpLost = 0;
  TKEYS.forEach((t) => {
    const n = TKEYS.includes(t) ? [1, 2, 3, 4, 5].reduce((s, i) => s + ((units[t] && units[t][i]) || 0), 0) : 0;
    if (n <= 0 || !dmgByType[t]) { [1, 2, 3, 4, 5].forEach((i) => lost[t][i] = 0); return; }
    let hpTotal = 0;
    for (let i = 1; i <= 5; i++) hpTotal += ((units[t][i] || 0)) * TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp");
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
export function resolvePvp(attUnits, attRace, defUnits, defRace, defWallLv = 0, defGarrisonLv = 0) {
  const TKEYS = ["inf", "arc", "cav", "sie"];
  const attS = sideStats(attUnits, attRace), defS = sideStats(defUnits, defRace);
  const dmgToDef = dmgTo(attS, defS, defWallLv), dmgToAtt = dmgTo(defS, attS);
  const openG = garrisonVolley(defGarrisonLv, attS);
  if (openG) TKEYS.forEach((t) => { dmgToAtt[t] = (dmgToAtt[t] || 0) + (openG[t] || 0); });
  const defLoss = applyLosses(defUnits, dmgToDef, defRace);
  const attLoss = applyLosses(attUnits, dmgToAtt, attRace);
  const defHpLeft = Math.max(0, defS.totalHp - defLoss.hpLost);
  const attHpLeft = Math.max(0, attS.totalHp - attLoss.hpLost);
  // Победитель: чья сторона выжила целиком при уничтоженной другой, иначе —
  // у кого осталось больше суммарного HP (тот же дух, что и armyPower-
  // сравнение в resolveBattle(), без полного портирования armyPower).
  // Ничья (в т.ч. 0:0) — победа ОБОРОНЫ, тот же принцип, что и в
  // resolveBattle() (index.html: win=...powA>powD?"A":"D" — строго больше
  // для нападавших, иначе защита; см. комментарий там же "штурм не удался").
  const winner = defHpLeft <= 0 && attHpLeft > 0 ? "att" : attHpLeft <= 0 && defHpLeft > 0 ? "def" : (attHpLeft > defHpLeft ? "att" : "def");
  return { attLoss: attLoss.units, defLoss: defLoss.units, attHpLeft, defHpLeft, winner };
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
