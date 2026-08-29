// =============================================================================
// Где стоят крепости варваров — по одной на каждый из шестнадцати регионов.
// =============================================================================
// Считает точки и печатает готовый кусок SQL для миграции. Сам ничего не
// пишет: миграции в этом репозитории — обычные .sql, которые автор вставляет
// в дашборд руками (см. шапку supabase/README.md), и подставлять туда
// координаты «на лету» неоткуда.
//
// ОТКУДА ТОЧКА. Исходная — capital_world из worldgen/regions/regions_meta.json:
// generate_regions.py выбирал её не в голом центре региона, а по стоимости
// прохода, как место под крепость. Но проверку самой игры она проходит не
// везде: три столицы из шестнадцати стоят на КРУЧЕ (перепад с соседними
// клетками больше STEEP_MAX_RISE — тот же порог, по которому index.html
// отказывается ставить туда лагерь или точку сбора). Такие сдвигаются к
// ближайшей годной клетке ПО СПИРАЛИ, с условием остаться в своём регионе:
// иначе крепость Ледяных Пиков ушла бы в Торговую Бухту.
//
// Правила годности — дословно те же три, что и у остальных строений мира:
// не вода (высота ниже RW_SEA), не круча, и клетка принадлежит своему региону.
//
// ЧТО ЗАДАЁТ ТИР. Число соседей региона (worldgen/regions/regions_buffs.json,
// degree): шесть соседей — великая твердыня, четыре-пять — средняя, один-три —
// малая. Это ровно разбиение из worldgen/regions/SHRINES.md, утверждённого
// автором, и оно же решает, какая из трёх моделей встанет на карте.
// Уровней у крепости НЕТ: «там нет уровней, они не как лагеря варваров, это
// нечто уникальное, как святыня» (прямые слова автора).
//
// Запуск:
//   node tools/gen_region_forts.mjs           # SQL для миграции
//   node tools/gen_region_forts.mjs --json    # то же машиночитаемо
import { readFileSync } from 'node:fs';

// Те же числа, что в index.html (RW_HEIGHT_W/H, RW_ELEV_SCALE, RW_SEA) и в
// mp-tick. Держатся в синхроне вручную, как и весь остальной их выводок.
const W = 2400, H = 1200, HALFX = W / 2, HALFZ = H / 2, ELEV_SCALE = 2.5, SEA = 0.235;
const STEEP_SAMPLE_R = 3, STEEP_MAX_RISE = 0.11;
const SEARCH_MAX = 60;   // дальше столицы уже не искать: значит, что-то не так

const elBuf = readFileSync('heightmap/elevation-v6.bin');
const el = new Uint16Array(elBuf.buffer, elBuf.byteOffset, elBuf.byteLength / 2);
const reg = new Uint8Array(readFileSync('worldgen/regions/regions-v1.bin'));
const meta = JSON.parse(readFileSync('worldgen/regions/regions_meta.json', 'utf8'));
const buffs = JSON.parse(readFileSync('worldgen/regions/regions_buffs.json', 'utf8')).regions;

// Имена областей — те же и в том же порядке, что REGION_NAMES в index.html
// (значение в regions-v1.bin, то есть id региона минус один). Святыни — из
// worldgen/regions/SHRINES.md.
const REGION = [
  ['Северное Побережье', 'Соляная Пристань'],
  ['Северные Поля',      'Хлебный Алтарь'],
  ['Ледяные Пики',       'Ледяной Дозор'],
  ['Торговая Бухта',     'Гостиный Двор'],
  ['Западная Пустошь',   'Ветряной Стан'],
  ['Зелёные Земли',      'Житница Предвечных'],
  ['Великая Степь',      'Ханская Ставка'],
  ['Восточная Гавань',   'Корабельная Роща'],
  ['Древний Лес',        'Тайная Тропа'],
  ['Открытые Равнины',   'Курган Павших'],
  ['Богатая Долина',     'Рог Изобилия'],
  ['Стальные Горы',      'Кузнечный Кряж'],
  ['Южный Берег',        'Маячный Утёс'],
  ['Гранитный Кряж',     'Каменный Венец'],
  ['Тёмная Чаща',        'Лучный Схрон'],
  ['Грозовые Вершины',   'Янтарный Престол'],
];

function bilinear(px, py) {
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const fx = px - x0, fy = py - y0;
  const i00 = y0 * W + x0, i10 = y0 * W + x1, i01 = y1 * W + x0, i11 = y1 * W + x1;
  const e0 = el[i00] + (el[i10] - el[i00]) * fx;
  const e1 = el[i01] + (el[i11] - el[i01]) * fx;
  return (e0 + (e1 - e0) * fy) * (ELEV_SCALE / 65535);
}
// Высота в центре клетки — та же точка, что берёт под объект 3D-карта.
function heightAt(x, y) {
  const cx = x + 0.5, cy = y + 0.5;
  if (cx < -HALFX || cx >= HALFX || cy < -HALFZ || cy >= HALFZ) return 0;
  return bilinear(cx + HALFX, cy + HALFZ);
}
const isWater = (x, y) => heightAt(x, y) < SEA;
function isSteep(x, y) {
  const c = heightAt(x, y);
  for (let dy = -STEEP_SAMPLE_R; dy <= STEEP_SAMPLE_R; dy++)
    for (let dx = -STEEP_SAMPLE_R; dx <= STEEP_SAMPLE_R; dx++) {
      if (!dx && !dy) continue;
      if (Math.abs(heightAt(x + dx, y + dy) - c) > STEEP_MAX_RISE) return true;
    }
  return false;
}
function regionAt(x, y) {
  const px = Math.round(x) + HALFX, py = Math.round(y) + HALFZ;
  if (px < 0 || py < 0 || px >= W || py >= H) return 255;
  return reg[py * W + px];
}
const fits = (x, y, r) => !isWater(x, y) && !isSteep(x, y) && regionAt(x, y) === r;

// Спираль кольцами: ближайшая годная клетка, при равном расстоянии — первая
// найденная (порядок обхода детерминирован, значит и результат тоже).
function nearestFit(cx, cy, r) {
  if (fits(cx, cy, r)) return { x: cx, y: cy, moved: 0 };
  for (let ring = 1; ring <= SEARCH_MAX; ring++) {
    let best = null, bd = Infinity;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx, y = cy + dy;
        if (!fits(x, y, r)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y, moved: ring }; }
      }
    if (best) return best;
  }
  return null;
}

const degreeOf = Object.fromEntries(buffs.map((b) => [b.id, b.degree]));
const tierOf = (deg) => (deg >= 6 ? 3 : deg >= 4 ? 2 : 1);

const forts = [];
for (const r of meta.regions) {
  const cx = Math.round(r.capital_world[0]), cy = Math.round(r.capital_world[1]);
  const spot = nearestFit(cx, cy, r.id - 1);
  if (!spot) { console.error(`регион ${r.id}: годного места не нашлось`); process.exit(1); }
  const [name, shrine] = REGION[r.id - 1];
  forts.push({ region: r.id, name, shrine, tier: tierOf(degreeOf[r.id]),
               x: spot.x, y: spot.y, moved: spot.moved,
               from: spot.moved ? [cx, cy] : null });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(forts, null, 2));
} else {
  console.log('-- Считано tools/gen_region_forts.mjs — не править руками.');
  console.log('-- region | тир | x | y | область | святыня');
  for (const f of forts) {
    const note = f.moved ? `  -- сдвинуто на ${f.moved} с (${f.from[0]},${f.from[1]}): столица на круче` : '';
    console.log(`  (${String(f.region).padStart(2)}, ${f.tier}, ${String(f.x).padStart(5)}, ${String(f.y).padStart(5)},` +
                ` '${f.name}', '${f.shrine}'),${note}`);
  }
  const byTier = [3, 2, 1].map((t) => `${t}: ${forts.filter((f) => f.tier === t).length}`).join(', ');
  console.log(`-- тиров — ${byTier}; сдвинуто точек: ${forts.filter((f) => f.moved).length}`);
}
