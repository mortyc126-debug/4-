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
// Автор: «Сделаем мир ограниченным, от центра по 500 клеток в разные
// стороны... получим мир 1к на 1к». Реальные игровые координаты (города/
// лагеря/точки, см. mp-join respawn) не выходят за ±200 — запас в 300
// клеток до границы отдан целиком под "ничью землю" и горную стену, чтобы
// та не съедала игровое пространство. camera.ts клэмпит cam.target этим
// же числом (не даёт увести камеру за границу), а heightRaw ниже поднимает
// рельеф в горы ровно от неё (визуальная стена, см. её же комментарий) —
// оба берут одну константу, а не два независимо подобранных числа.
export const WORLD_HALF = 500;

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
    // Плато раньше занимали заметную часть карты (порог 0.62-0.84 — почти
    // треть территории по распределению value-noise — и блендились на 80%
    // к дискретным ступеням) — весь этот кусок читался как сплошные плоские
    // мезы, отсюда жалоба "равнины плоские". Уже реже (0.7-0.9, заметно
    // меньше площади) и мягче (см. блендинг R.plat*0.6 ниже, было *0.8) —
    // плато остаётся узнаваемой total-war-style деталью, а не доминирующим
    // фоном.
    plat: sstep(0.7, 0.9, noise(x / 34, y / 34, SEED + 88)),
    rough: noise(x / 26, y / 26, SEED + 123),
  };
}

// Раньше heightRaw жёстко клэмпировало e в [0.02,1] (Math.min(1,e)). Сырое e
// на вершинах гор регулярно перевешивает за 1 (сумма октав+ridge+уклона на
// высоком R.mount легко доходит до ~1.5-1.6) — а значит ЛЮБАЯ гора, чьё
// сырое e перевалило за единицу, срезалась в ОДНУ И ТУ ЖЕ максимальную
// высоту. Не "сглаженные вершины", а буквально идентичный потолок у
// десятков разных гор — отсюда жалоба "вершины плоские, все на одной
// высоте". softCapElevation — мягкое асимптотическое сжатие вместо жёсткого
// среза: любые два сырых e выше KNEE дают РАЗНЫЙ результат (просто
// сближающийся с потолком по мере роста raw e), а не одинаковый плоский
// верх. Асимптота (KNEE+CEIL_EXTRA=1.35) заведомо намного ниже минимальной
// высоты стены по краю мира (не ниже ~2.5, см. edgeWallPeak/WALL_PEAK) —
// граница "это естественная гора" / "это стена" (main.ts:
// e > NATURAL_ELEVATION_CAP) остаётся однозначной, с большим запасом.
const ELEV_KNEE = 0.8;
const ELEV_CEIL_EXTRA = 0.55;
export const NATURAL_ELEVATION_CAP = 1.3;
function softCapElevation(e: number): number {
  if (e <= ELEV_KNEE) return e;
  const over = e - ELEV_KNEE;
  return ELEV_KNEE + ELEV_CEIL_EXTRA * (1 - Math.exp(-over / ELEV_CEIL_EXTRA));
}

// Горная стена по границе мира — автор уточнил после первой версии:
// 1) горы должны НАЧИНАТЬСЯ ровно на границе (WORLD_HALF=500, там же, где
//    камеру уже не пускают дальше, см. camera.ts) — не за 70 клеток до неё.
// 2) высота — в 3-4 раза больше обычных гор. Обычный рельеф жёстко
//    потолком в e=1.0 (HMAX=13 мировых единиц, см. ниже) — "в 3-4 раза
//    больше" тут в буквальном смысле НЕ помещается под тем же потолком,
//    поэтому стена его не разделяет: heightRaw возвращает её высоту
//    НАПРЯМУЮ, минуя Math.min(1,...) внизу. Это безопасно — groundColor()/
//    шейдер (renderer.ts, WGSL) уже клэмпят elevation при выборе текстуры,
//    а меш (terrainMesh.ts) просто умножает e*HMAX на позицию вершины без
//    собственного потолка.
// 3) без декора (деревьев/камней — genDecorForChunk в main.ts проверяет
//    e>1.0, доступное только здесь, и пропускает посадку).
// 4) стена не бесконечна: реальная геометрия — WALL_BAND от границы,
//    дальше — резкий обрыв в воду (ниже SEA), а не ещё горы: «не нужно
//    создавать бесконечные горы, это будет нагружать мир» — и
//    вычислительно тоже: за подъёмом (d>=WORLD_HALF+WALL_RISE) heightRaw
//    пропускает все октавы обычного шума совсем — они там уже не нужны,
//    естественный рельеф участвует только в самой полосе подъёма (нужен
//    для плавной стыковки, см. пункт про домешивание ниже). Автор
//    попросил сократить с исходных 200 до 50 клеток.
// Math.max(|x|,|y|), не окружность: сама граница -500..500 квадратная,
// круглый вал оставил бы проходимые клинья по углам.
const WALL_RISE = 24;     // подъём от границы до полной высоты — короткий, "резко", не пологий скат
const WALL_BAND = 50;     // толщина самого хребта за границей (см. пункт 4)
const WALL_DROP = 24;     // обрыв после хребта — тоже резкий, не бесконечный склон
const WALL_PEAK = 3.5;    // "в 3-4 раза выше" обычного потолка e=1.0
const WALL_VOID_E = 0.06; // за обрывом — плоское дно ниже уровня моря, дёшево и не растёт дальше
// 0.85..1.15 от WALL_PEAK — тот же ridge(), что и у обычных гор (R.mount
// ниже), просто на масштабе под толщину полосы, иначе стена вышла бы
// идеально гладкой, не хребтом.
function edgeWallPeak(x: number, y: number): number {
  return WALL_PEAK * (0.85 + 0.3 * ridge(x / 20, y / 20, SEED + 777));
}

export function heightRaw(x: number, y: number): number {
  const d = Math.max(Math.abs(x), Math.abs(y));
  if (d >= WORLD_HALF + WALL_RISE) {
    // Дальше подъёма обычный рельеф даже не считаем — либо ровный хребет
    // на пике, либо обрыв в пустоту за ним, либо сама пустота: см. пункт 4
    // — "не нужно создавать бесконечные горы, это будет нагружать мир".
    if (d < WORLD_HALF + WALL_BAND) return Math.max(0.02, edgeWallPeak(x, y));
    if (d < WORLD_HALF + WALL_BAND + WALL_DROP) {
      const t = sstep(WORLD_HALF + WALL_BAND, WORLD_HALF + WALL_BAND + WALL_DROP, d);
      return Math.max(0.02, edgeWallPeak(x, y) * (1 - t) + WALL_VOID_E * t);
    }
    return WALL_VOID_E;
  }
  const wx = (noise(x / 34, y / 34, SEED + 101) * 2 - 1) * 13;
  const wy = (noise(x / 34, y / 34, SEED + 102) * 2 - 1) * 13;
  const X = x + wx, Y = y + wy;
  const R = regionKind(x, y);
  // Величественность конкретной ГОРНОЙ ЦЕПИ — раньше R.mount (период
  // ~26-40, размер одной горы) сам по себе решал ВСЮ высоту хребта, так
  // что любые две горы с одинаковым R.mount выглядели одинаково — отсюда
  // "все вершины одинаковые". prominence — независимое поле НАМНОГО
  // крупнее (период ~190, на порядок крупнее отдельной горы, целой цепи) —
  // одни цепи то выше среднего, то ниже, как настоящие горные системы
  // (Альпы ≠ Уральские горы), а не конвейер одинаковых пиков. 0.65..1.35,
  // среднее ~1 — общая "средняя" высота гор в среднем не меняется, меняется
  // только разброс между разными цепями.
  const prominence = 0.65 + 0.7 * noise(X / 190, Y / 190, SEED + 930);
  const cont = noise(X / 62, Y / 62, SEED + 201);
  let e = 0.16 + cont * 0.5;
  // Пол amp поднят 0.16→0.20 — на самой плоской местности (R.mount=R.rough=0)
  // октавы шума ниже всё равно дают едва заметную рябь, а не идеально ровный
  // стол: та же жалоба "равнины плоские", часть ответа помимо plat/prominence
  // выше.
  const amp = 0.2 + 0.84 * R.mount * prominence + 0.35 * R.rough;
  e +=
    (noise(X / 27, Y / 27, SEED) * 0.2 +
      noise(X / 13, Y / 13, SEED + 9) * 0.1 +
      noise(X / 6, Y / 6, SEED + 21) * 0.045) *
    amp;
  e += ridge(X / 17, Y / 17, SEED + 37) * 0.33 * R.mount * prominence;
  e += R.mount * prominence * 0.1 - (1 - R.mount) * 0.05;
  if (R.plat > 0.02) {
    const terr = Math.round(e * 6.0) / 6.0;
    e = e * (1 - R.plat * 0.6) + terr * (R.plat * 0.6);
  }
  if (e >= 0.42) {
    const k = sstep(0.42, 0.68, e);
    e += (noise(x / 2.4, y / 2.4, SEED + 180) - 0.5) * 0.075 * k + (noise(x / 5.5, y / 5.5, SEED + 181) - 0.5) * 0.055 * k;
  }
  if (d < WORLD_HALF) return Math.max(0.02, softCapElevation(e));
  // Домешиваем стену к УЖЕ посчитанной естественной высоте (не к нулю) —
  // без этого на самой границе получался бы ров: рампа начиналась от 0,
  // а не от локального рельефа под ней (замечено при проверке — см.
  // историю коммитов). t=0 ровно на WORLD_HALF (граница = e без изменений),
  // t=1 на WORLD_HALF+WALL_RISE (уже полный пик). Сама вершина стены
  // (edgeWallPeak) легитимно выше обычного потолка гор — её НЕ сжимаем; e
  // естественного рельефа под рампой теперь тоже проходит softCapElevation
  // (не Math.min(1,e), как раньше) — иначе на самой линии WORLD_HALF был бы
  // шов: изнутри e сжато до ~1.2-1.3, а сразу за границей бралось сырое
  // (несжатое) значение вплоть до ~1.6 — заметный скачок высоты ровно по
  // линии границы, до этого момента маскировавшийся тем, что оба среза были
  // просто клэмпом в [0,1].
  const t = sstep(WORLD_HALF, WORLD_HALF + WALL_RISE, d);
  return Math.max(0.02, softCapElevation(e) * (1 - t) + edgeWallPeak(x, y) * t);
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

// ---- Макро-биом ---------------------------------------------------------
// Автор с живого сайта: мир выглядит так, будто "хаотично накидали всего
// подряд и перемешали", деревья/камни/трава разбросаны РАВНОМЕРНО везде —
// нет читаемых издалека регионов, как на карте Total War (зелёное
// сердце королевства, выжженная степь по краю, снежные хребты то тут, то
// там, а не на каждой горе одинаково). heightRaw/regionKind выше уже дают
// горы/плато/шум НУЖНОГО масштаба для самого рельефа — трёх полей ниже не
// хватало для того, ЧТО видно поверх него: тон травы и густота леса были
// одной и той же формулой в любой точке карты.
//
// moistureAt/coldnessAt — крупномасштабные (период ~90-260 клеток, на
// порядок крупнее гор с их 26-40) поля, гораздо больше отдельного холма —
// задают ПЯТНА региона, а не рябь на месте. Свой SEED-сдвиг и своя частота
// у каждого — не совпадают друг с другом и с region Kind намеренно (иначе
// "сыро/лесисто/холодно" всегда шли бы пачкой, а на настоящей карте пышный
// луг и голая холодная возвышенность вполне соседствуют).
//
// ВАЖНО: те же формулы (буквально те же noise()/hash2 с теми же SEED+901/
// SEED+921) продублированы в WGSL внутри TERRAIN_SHADER (renderer.ts,
// moistureAt/coldnessAt/hash2/noiseAt) — фрагментный шейдер красит рельеф
// по мировым координатам напрямую, не через атрибут вершины (дешевле, чем
// растить interleaved-буфер ещё на 2 float/вершину ради гладкого поля,
// которое и так меняется медленнее, чем сама сетка вершин). При правке
// синхронно копировать в обе стороны — тот же принцип, что и у collisionOk
// между index.html/mp-*, просто TS↔WGSL вместо TS↔TS.
export function moistureAt(x: number, y: number): number {
  const a = noise(x / 210, y / 210, SEED + 901);
  const b = noise(x / 90, y / 90, SEED + 902);
  return Math.max(0, Math.min(1, a * 0.7 + b * 0.3));
}

export function coldnessAt(x: number, y: number): number {
  return noise(x / 260, y / 260, SEED + 921);
}

// forestMaskAt — ТОЛЬКО для main.ts (плотность декора, чистый TS, в шейдер
// не портируется — на цвет поверхности не влияет, только на то, ставить ли
// дерево в данной клетке). Порог+smoothstep (не сырой noise напрямую) даёт
// КОМПАКТНЫЕ пятна леса с плавным, но не размытым на весь континент краем
// — то самое "лес тут, поле там", а не "чуть гуще/чуть реже везде одно и то
// же". treeline — второй smoothstep по высоте: выше него дерево не растёт
// ни при какой "лесистости" поля (голые холмы/предгорья), тот же приём,
// что уже держит decor подальше от стены (e>1.0) чуть ниже по main.ts,
// просто мягкий порог вместо жёсткого.
export function forestMaskAt(x: number, y: number): number {
  const n = noise(x / 150, y / 150, SEED + 911) * 0.65 + noise(x / 60, y / 60, SEED + 912) * 0.35;
  const patch = sstep(0.4, 0.62, n);
  const treeline = 1 - sstep(0.55, 0.82, heightAt(x, y));
  return patch * treeline;
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
