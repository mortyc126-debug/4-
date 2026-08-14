/* =========================================================================
   Рельеф — дословный порт heightRaw/heightAt/isWater/ground() из
   obyom-3d-infinite.html (тот же фиксированный SEED=12345), чтобы новый
   движок рисовал ТОТ ЖЕ остров, что игрок уже видел в живой игре, а не
   какой-то другой мир. Ничего не придумано заново — только переведено на
   TypeScript, чистые функции координат остались чистыми функциями координат.
   ========================================================================= */

export const SEED = 12345;
export const HMAX = 13.0;
export const SEA = 0.235;

export function hash2(x: number, y: number, s: number): number {
  let h = x * 374761393 + y * 668265263 + s * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const ridge = (x: number, y: number, s: number) => 1 - Math.abs(2 * noise(x, y, s) - 1);
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function regionKind(x: number, y: number) {
  return {
    mount: sstep(0.4, 0.72, noise(x / 40, y / 40, SEED + 55)),
    plat: sstep(0.62, 0.84, noise(x / 34, y / 34, SEED + 88)),
    rough: noise(x / 26, y / 26, SEED + 123),
  };
}

export function heightRaw(x: number, y: number): number {
  const wx = (noise(x / 34, y / 34, SEED + 101) * 2 - 1) * 13;
  const wy = (noise(x / 34, y / 34, SEED + 102) * 2 - 1) * 13;
  const X = x + wx, Y = y + wy;
  const R = regionKind(x, y);
  const cont = noise(X / 62, Y / 62, SEED + 201);
  let e = 0.16 + cont * 0.5;
  const amp = 0.16 + 0.84 * R.mount + 0.35 * R.rough;
  e +=
    (noise(X / 27, Y / 27, SEED) * 0.2 +
      noise(X / 13, Y / 13, SEED + 9) * 0.1 +
      noise(X / 6, Y / 6, SEED + 21) * 0.045) *
    amp;
  e += ridge(X / 17, Y / 17, SEED + 37) * 0.33 * R.mount;
  e += R.mount * 0.1 - (1 - R.mount) * 0.05;
  if (R.plat > 0.02) {
    const terr = Math.round(e * 6.0) / 6.0;
    e = e * (1 - R.plat * 0.8) + terr * (R.plat * 0.8);
  }
  if (e >= 0.42) {
    const k = sstep(0.42, 0.68, e);
    e += (noise(x / 2.4, y / 2.4, SEED + 180) - 0.5) * 0.075 * k + (noise(x / 5.5, y / 5.5, SEED + 181) - 0.5) * 0.055 * k;
  }
  return Math.max(0.02, Math.min(1, e));
}

function heightAtNatural(x: number, y: number): number {
  const c = heightRaw(x, y);
  const s = (heightRaw(x + 0.7, y) + heightRaw(x - 0.7, y) + heightRaw(x, y + 0.7) + heightRaw(x, y - 0.7)) * 0.25;
  return c * 0.55 + s * 0.45;
}

// ---- Площадки под реальные постройки ----------------------------------
// Процедурный рельеф ничего не знает о городах/лагерях/точках, которые
// на него ставятся (см. main.ts, modelMatrix(wx, heightAt(wx,wz)*HMAX, ...))
// — якорь модели берёт высоту только В ОДНОЙ точке (центре), а сама
// постройка занимает заметную площадь. На склоне угол наклона рельефа под
// разными краями фундамента отличался от высоты в центре на целые
// мировые единицы (HMAX=13 — даже небольшая разница e даёт метры) —
// здание выглядело "утопленным" в один край холма или парящим над другим.
// Решение то же, что и было в плане сессии (Фаза 1, "Гарантия проходимой
// земли"), но не было реализовано в движке до сих пор: вокруг АНКЕРА
// каждой настоящей сущности регистрируется плоская площадка на высоте
// ЕСТЕСТЕСТВЕННОГО рельефа В ЭТОЙ ТОЧКЕ (heightAtNatural — БЕЗ учёта уже
// зарегистрированных площадок, никакой рекурсии) — heightAt ниже
// подмешивает эту высоту вместо настоящей в радиусе площадки, с плавным
// растворением к естественному рельефу на границе, а не резким обрывом.
// Бакетируется по грубой сетке (тот же приём, что и W.mapChunks в
// index.html) — heightAt дёргается тысячи раз на чанк, полный перебор
// списка при каждом вызове был бы заметно дороже, чем 9 соседних корзин.
interface FlattenSite { x: number; z: number; targetH: number; radius: number }
const FLATTEN_BUCKET = 32;
const flattenBuckets = new Map<string, FlattenSite[]>();
function flattenBucketKey(x: number, z: number): string {
  return Math.floor(x / FLATTEN_BUCKET) + "," + Math.floor(z / FLATTEN_BUCKET);
}
export function registerFlattenSite(x: number, z: number, radius: number): void {
  const site: FlattenSite = { x, z, targetH: heightAtNatural(x, z), radius };
  const key = flattenBucketKey(x, z);
  const bucket = flattenBuckets.get(key);
  if (bucket) bucket.push(site);
  else flattenBuckets.set(key, [site]);
}

export function heightAt(x: number, y: number): number {
  const natural = heightAtNatural(x, y);
  if (flattenBuckets.size === 0) return natural;
  const bcx = Math.floor(x / FLATTEN_BUCKET), bcz = Math.floor(y / FLATTEN_BUCKET);
  let best: FlattenSite | null = null;
  let bestT = 0; // доля "внутри площадки" (1 = центр, 0 = граница радиуса) — берём сайт с максимальным перекрытием, а не первый попавшийся
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const bucket = flattenBuckets.get(bcx + dx + "," + (bcz + dz));
      if (!bucket) continue;
      for (const site of bucket) {
        const d = Math.hypot(x - site.x, y - site.z);
        if (d >= site.radius) continue;
        // Плоское ядро до 55% радиуса, дальше плавное (smoothstep) растворение
        // в естественный рельеф к самой границе — без него на кромке площадки
        // был бы заметный "порог".
        const inner = site.radius * 0.55;
        const t = d <= inner ? 1 : 1 - ((d - inner) / (site.radius - inner)) ** 2 * (3 - 2 * ((d - inner) / (site.radius - inner)));
        if (t > bestT) { bestT = t; best = site; }
      }
    }
  }
  return best ? natural * (1 - bestT) + best.targetH * bestT : natural;
}

export function isWater(x: number, y: number): boolean {
  return heightAt(x, y) < SEA;
}

// ---- Палитра земли — тот же градиент по высоте, что и в живой игре
// (см. ground() в obyom-3d-infinite.html), без AO/пятен ради простоты
// первого прохода — цель сейчас "тот же остров", не "тот же самый пиксель".
const MIX = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const SAND: [number, number, number] = [0.68, 0.6, 0.42];
const GRASS: [number, number, number] = [0.31, 0.41, 0.21];
const MEAD: [number, number, number] = [0.4, 0.45, 0.23];
const DRYG: [number, number, number] = [0.47, 0.42, 0.25];
const SCRUB: [number, number, number] = [0.38, 0.33, 0.22];
const SCREE: [number, number, number] = [0.36, 0.34, 0.31];
const SEA_SHALLOW: [number, number, number] = [0.14, 0.24, 0.28];
const SEA_DEEP: [number, number, number] = [0.05, 0.11, 0.19];

export function groundColor(e: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (e - SEA) / (1 - SEA)));
  if (t < 0.06) return MIX(SAND, GRASS, t / 0.06);
  if (t < 0.3) return MIX(GRASS, MEAD, (t - 0.06) / 0.24);
  if (t < 0.52) return MIX(MEAD, DRYG, (t - 0.3) / 0.22);
  if (t < 0.72) return MIX(DRYG, SCRUB, (t - 0.52) / 0.2);
  return MIX(SCRUB, SCREE, Math.min(1, (t - 0.72) / 0.28));
}

export function waterColor(depthFrac: number): [number, number, number] {
  return MIX(SEA_SHALLOW, SEA_DEEP, Math.min(1, depthFrac));
}
