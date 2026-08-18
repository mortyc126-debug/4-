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
