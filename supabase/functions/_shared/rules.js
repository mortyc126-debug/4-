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
// Постройки — Фаза 5, первый кусочек: ТОЛЬКО казармы/стрельбище/конюшня/
// мастерская (barracks/range/stable/siege), то есть ровно те 4 здания, что
// разблокируют набор войск (mp-train) — раньше их приходилось поднимать
// вручную через SQL. Остальные 11 построек (ратуша, стена, ферма и т.д.) —
// следующие шаги, каждое отдельным переносом, тот же принцип, что и раньше
// (см. README). Таблицы — буквальная копия BARRACKS_TABLE/SIEGE_TABLE из
// index.html (строки 1609/1636 на момент переноса).
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
export const BUILD_BLD_TABLE = { barracks: BARRACKS_TABLE, range: BARRACKS_TABLE, stable: BARRACKS_TABLE, siege: SIEGE_TABLE };
export const BUILD_MAX_LV = 25; // buildingMax(bk) для этих 4 зданий — CFG.MAX_LEVEL, см. index.html

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
