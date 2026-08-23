/* =========================================================================
   Рельеф — раньше был целиком процедурным (value-noise горы/плато/реки, см.
   историю файла). Автор увидел превью с настоящими данными высот (Копер-
   ник DEM, 30м) и настоящим спутниковым покровом растительности (ESA World-
   Cover, 10м) для дуги Карпат вокруг Трансильванского плато и попросил
   взять это за основу целиком: "копировать всё, как рельеф и местность, так
   деревья, растения, траву, природу... без отсебятины". Процедурная генера-
   ция гор/плато/рек (regionKind/MOUNTAIN_BOOST/riverCarveAt и т.д. — см.
   историю коммитов) полностью удалена и заменена билинейным чтением из
   ДВУХ запечённых бинарных файлов (heightmap/elevation.bin, forest.bin) —
   не текстур для GPU (те привязаны к конкретному чанку/шейдеру), а сырых
   typed array, доступных на CPU: heightAt()/forestMaskAt() остаются теми же
   чистыми функциями (x,y)->число, что и раньше, только источник данных
   сменился с noise() на настоящую Землю. Сам процесс получения этих файлов
   (выбор региона, DEM, скачивание тайлов, честный D8 flow accumulation для
   рек, нормализация метров в игровую шкалу e, океан по краю мира вместо
   стены) — офлайн Python-пайплайн вне движка, см. описание в PR/коммите;
   здесь только чтение готового результата.

   Мир теперь ПРЯМОУГОЛЬНЫЙ (WORLD_HALF_X ≠ WORLD_HALF_Z), не квадратный —
   реальная область (дуга Карпат) шире по долготе, чем по широте, и автор
   прямо разрешил "расширить до тех масштабов, которые потребуются", лишь
   бы не резать остров обрезанным прямоугольником. 1 мировая единица = 1
   пиксель запечённых данных (~200-280м на местности в этих широтах) —
   никакого отдельного масштабного коэффициента не нужно, индекс массива
   получается сложением координаты с половиной соответствующей стороны.
   ========================================================================= */

export const SEED = 12345;
export const HMAX = 13.0;
export const SEA = 0.235;

// Реальная область: дуга Карпат + Трансильванское плато, экспортирована в
// 2400×1200 пикселей (1 world unit = 1 пиксель, см. шапку файла).
const HEIGHT_W = 2400;
const HEIGHT_H = 1200;
export const WORLD_HALF_X = HEIGHT_W / 2; // 1200
export const WORLD_HALF_Z = HEIGHT_H / 2; // 600
// Диапазон квантования elevation.bin (Uint16, см. bake-скрипт) — то же
// число должно быть и там, и тут, иначе значения разъедутся при распаковке.
const ELEV_SCALE = 2.5;

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

// ---- Загрузка запечённых данных -----------------------------------------
// heightAt()/forestMaskAt() ниже — чистые функции координат ТОЛЬКО после
// того, как эти два typed array заполнены; main.ts обязан дождаться
// loadHeightmapData() ДО первого вызова updateTerrainChunks/genDecorForChunk
// (см. вызов там же) — раньше рельеф был доступен сразу (чистый noise()),
// теперь первый кадр физически не может нарисоваться без сети. Пока не
// загружено — возвращаем безопасное плоское значение чуть выше SEA (не 0 и
// не NaN), чтобы случайный ранний вызов (если такой всё же случится) не
// уронил меш/декор, а не потому что это ожидаемый путь выполнения.
let elevData: Uint16Array | null = null;
let forestData: Uint8Array | null = null;
let moistureData: Uint8Array | null = null;

// fetch() НЕ отклоняет промис на HTTP-ошибке (404 и т.п.) — только на
// сетевом сбое. Без явной проверки response.ok неудачный деплой (файл не
// доехал/переехал) тихо отдал бы страницу-404 ВМЕСТО бинарных данных —
// new Uint16Array() на ней не бросит исключение, просто даст мусорный
// массив неправильного размера, и весь рельеф дальше молча разъедется в
// NaN/пустоту без единого сообщения об ошибке игроку. main() уже ловит
// исключения из этой функции (main().catch(...) в самом низу файла,
// setErrorStatus) — здесь достаточно честно бросить, а не проглотить.
async function fetchBinary(path: string, expectBytes: number): Promise<ArrayBuffer> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength !== expectBytes) {
    throw new Error(`${path}: неверный размер (${buf.byteLength} байт, ожидалось ${expectBytes})`);
  }
  return buf;
}

// render.yaml кэширует /heightmap/* на неделю (Cache-Control: max-age=
// 604800) — правильно для игрока, который заходит повторно В ТЕЧЕНИЕ этой
// недели: не качать заново 8.6МБ каждый раз. Версия сначала жила в query-
// строке (?v=N) — не сработало: живой Render-сервис оказался настроен НЕ
// через этот render.yaml (см. её же комментарий у buildCommand — реальный
// деплой идёт "Empty build command; skipping build", то есть render.yaml
// тут вообще не читается) — значит и секция headers могла не применяться,
// а какой-то промежуточный кэш/CDN на пути мог игнорировать query-строку
// и отдавать файл по одному только пути. Автор с устройства продолжал
// получать старые русла даже после ?v=5 и подтверждённого деплоя нужного
// коммита. Теперь версия — часть САМОГО ИМЕНИ файла (elevation-v6.bin, не
// elevation.bin?v=6) — тот же приём, что и у хэшированных имён собранного
// JS-бандла: URL, которого не существовало ДО этого пуша, физически не
// может лежать ни в одном кэше ни на одном слое, никакая настройка
// Cache-Control тут ничего не решает. При следующей перепечке пайплайна:
// новый файл heightmap/elevation-vN.bin, поднять HEIGHTMAP_VERSION здесь
// (старый файл можно оставить лежать или удалить — не критично).
//
// index.html читает ТОТ ЖЕ файл своей копией (isRealWater, см. её
// комментарий там) — держать HEIGHTMAP_VERSION синхронно в ОБОИХ местах.
// Экспортирован — main.ts кладёт его в #hmVersion (см. index.html), чтобы
// с ЛЮБОГО устройства одним скриншотом было видно, какая версия рельефа
// реально загрузилась, без ?debug=1/консоли (terrain.ts сам DOM не трогает
// — см. шапку файла, "чистая математика").
export const HEIGHTMAP_VERSION = 6;
export async function loadHeightmapData(): Promise<void> {
  const cellCount = HEIGHT_W * HEIGHT_H;
  const [elevBuf, forestBuf, moistureBuf] = await Promise.all([
    fetchBinary(`/heightmap/elevation-v${HEIGHTMAP_VERSION}.bin`, cellCount * 2), // Uint16
    fetchBinary("/heightmap/forest.bin", cellCount),        // Uint8
    fetchBinary("/heightmap/moisture.bin", cellCount),      // Uint8
  ]);
  elevData = new Uint16Array(elevBuf);
  forestData = new Uint8Array(forestBuf);
  moistureData = new Uint8Array(moistureBuf);
}

// Билинейная выборка — тот же приём, что и раньше был у value-noise (hermite
// между 4 соседями), только соседи теперь настоящие соседние пиксели
// запечённого растра, а не хэш случайных углов клетки. px/py — уже в
// пространстве ПИКСЕЛЕЙ массива (не мировых координат), см. вызовы ниже.
function bilinear(data: Uint16Array | Uint8Array, px: number, py: number, norm: number): number {
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, HEIGHT_W - 1), y1 = Math.min(y0 + 1, HEIGHT_H - 1);
  const fx = px - x0, fy = py - y0;
  const i00 = y0 * HEIGHT_W + x0, i10 = y0 * HEIGHT_W + x1, i01 = y1 * HEIGHT_W + x0, i11 = y1 * HEIGHT_W + x1;
  const e0 = data[i00] + (data[i10] - data[i00]) * fx;
  const e1 = data[i01] + (data[i11] - data[i01]) * fx;
  return (e0 + (e1 - e0) * fy) * norm;
}

// Мировые (x,y=мировой Z) -> пиксельные координаты запечённого растра,
// зажатые в границы массива — камера/панорама и так не пускают игрока
// дальше WORLD_HALF_X/Z (см. camera.ts/main.ts), но decor/дальнее кольцо
// рельефа (main.ts, FAR_*) может честно попросить точку чуть за краем —
// клэмп повторяет край крайнего пикселя (там уже океан, см. bake-скрипт),
// а не падает и не читает мусор за пределами буфера.
function toPixel(x: number, y: number): [number, number] {
  const px = Math.max(0, Math.min(HEIGHT_W - 1, x + WORLD_HALF_X));
  const py = Math.max(0, Math.min(HEIGHT_H - 1, y + WORLD_HALF_Z));
  return [px, py];
}

export function heightRaw(x: number, y: number): number {
  if (!elevData) return SEA + 0.05; // см. комментарий у loadHeightmapData — путь не должен исполняться на практике
  const [px, py] = toPixel(x, y);
  return bilinear(elevData, px, py, ELEV_SCALE / 65535);
}

// Усредняет высоту с 4 соседями в 0.7 мировых единицы (~0.7 пикселя
// запечённых данных) — наследие ЕЩЁ процедурной эпохи этого файла: сырой
// value-noise heightRaw() того времени был honeстно шумным на пиксель, без
// этого сглаживания рельеф/площадки под здания выглядели зернистыми.
// Раньше (до текущего фикса) heightAt() ниже гонял ВСЮ карту через эту
// функцию — с настоящими данными это оказалось не безобидным наследием, а
// реальным багом: автор с живого устройства "рек не было" уже ПОСЛЕ фикса
// самого запекания (см. коммит 2cace7b, bake_final2.py) — численно
// проверено (см. историю правки), что 100% "стержневых" клеток реки
// (accum>150) в самих данных уходят под SEA, но после ЭТОГО усреднения
// (соседи по 0.7 клетки — типичная ширина запечённой реки как раз ~1
// пиксель) под водой оставалось только ~35% — усреднение с сухими
// берегами возвращало русло выше SEA почти everywhere, оставляя от
// сплошной реки редкие лужицы (медиана связной "лужи" — 3 пикселя).
// Настоящий DEM физически непрерывен (не белый шум) — bilinear() выше сам
// по себе уже даёт гладкую интерполяцию между соседними пикселями,
// дополнительное усреднение ему не нужно. heightAt() ниже теперь читает
// heightRaw() напрямую; эта функция осталась только для точечных площадок
// под здания (registerFlattenSite ниже) — там лёгкое сглаживание всё ещё
// уместно (площадка не должна цепляться за одну случайно выпирающую
// точку рельефа под фундаментом), а ширина захвата (0.7) на масштабе
// здания не топит ничего похожего на русло реки.
//
// Побочный эффект того же фикса — не только корректность, но и
// быстродействие: раньше КАЖДЫЙ heightAt() стоил 5 билинейных выборок
// (центр + 4 соседа), теперь 1 — впятеро дешевле на каждый вызов, а
// heightAt() дёргается на каждую вершину меша (и ещё 4 раза сверху в
// normalAt для аналитической нормали, см. terrainMesh.ts) — то есть
// разом упала цена именно того, что чаще всего в кадре: стройка чанков.
function heightAtNatural(x: number, y: number): number {
  const c = heightRaw(x, y);
  const s = (heightRaw(x + 0.7, y) + heightRaw(x - 0.7, y) + heightRaw(x, y + 0.7) + heightRaw(x, y - 0.7)) * 0.25;
  return c * 0.55 + s * 0.45;
}

// ---- Площадки под реальные постройки ----------------------------------
// Настоящий рельеф ничего не знает о городах/лагерях/точках, которые на
// него ставятся (см. main.ts, modelMatrix(wx, heightAt(wx,wz)*HMAX, ...))
// — якорь модели берёт высоту только В ОДНОЙ точке (центре), а сама
// постройка занимает заметную площадь. На склоне угол наклона рельефа под
// разными краями фундамента отличался от высоты в центре на целые мировые
// единицы (HMAX=13 — даже небольшая разница e даёт метры) — здание
// выглядело "утопленным" в один край холма или парящим над другим. Вокруг
// АНКЕРА каждой настоящей сущности регистрируется плоская площадка на
// высоте ЕСТЕСТВЕННОГО рельефа В ЭТОЙ ТОЧКЕ (heightAtNatural — БЕЗ учёта
// уже зарегистрированных площадок, никакой рекурсии) — heightAt ниже
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
  // heightRaw() напрямую, не heightAtNatural() — см. её комментарий выше:
  // усреднение с соседями душит однопиксельные речные русла обратно выше
  // SEA. bilinear() уже даёт гладкую интерполяцию настоящего DEM без него.
  const natural = heightRaw(x, y);
  // Площадка не должна топить/осушать воду — она даёт зданию ровную
  // ГОРИЗОНТАЛЬНУЮ опору на СУШЕ, но targetH одна на весь радиус (высота в
  // АНКЕРЕ сущности), а не по-пиксельно честная. Река/озеро может пройти
  // краем радиуса (город/лагерь/точка ресурсов стоят рядом с водой сплошь
  // и рядом — не в ней самой, но их площадка ×1.4 запаса легко накрывает
  // берег) — раньше там река молча подмешивалась к сухому targetH и
  // ИСЧЕЗАЛА ровно под моделькой. Реальный репорт с устройства: "русла
  // обрываются под моделями точек с ресурсами". Если ЭТА КОНКРЕТНАЯ точка
  // и без площадки уже вода — площадку тут не применяем вообще, площадка
  // остаётся плоской ровно там, где стоит здание (высоты в дальних точках
  // радиуса не участвуют), суша вокруг не отличит разницы.
  if (natural < SEA) return natural;
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

// ---- Макро-биом (только цвет земли в TERRAIN_SHADER — не форма рельефа) -
// moistureAt раньше был синтетическим шумом. В ESA WorldCover нет прямого
// канала "влажность", но есть классы покрова, которые честно с ней
// коррелируют (болото/луг/пашня объективно не сухая земля, кустарник/голая
// порода — сухая) — запечено в moisture.bin тем же способом, что и лес
// (класс -> число, лёгкий блюр при запекании для связных региональных
// пятен, не рябь по границе каждого поля). coldnessAt остался процедурным —
// у настоящих открытых источников, доступных отсюда, не нашлось climate-
// слоя (пробовал WorldClim/CHELSA/Planetary Computer — все три недоступны
// через прокси этой песочницы), а "выше — холоднее" физически верно и без
// точных цифр, шум просто решает, какие ИЗ высоких хребтов холоднее прочих
// (не каждая вершина одинаково заснежена, см. использование в renderer.ts).
export function moistureAt(x: number, y: number): number {
  if (!moistureData) return 0.5;
  const [px, py] = toPixel(x, y);
  return bilinear(moistureData, px, py, 1 / 255);
}

export function coldnessAt(x: number, y: number): number {
  return noise(x / 260, y / 260, SEED + 921);
}

// forestMaskAt — раньше синтетические пятна шума с порогом+treeline-
// smoothstep по высоте (см. историю). Теперь честная доля реального
// древесного покрова (ESA WorldCover класс 10 "Tree cover", 10м, лёгкий
// блюр при запекании для связных пятен, а не одиночных зашумлённых
// пикселей) — верхняя граница леса уже встроена В САМИ спутниковые данные
// (на настоящей верхушке горы просто нет класса "лес" — реальность сама
// решила treeline за нас, отдельный порог по высоте больше не нужен).
// ТОЛЬКО для main.ts (плотность декора, чистый TS, в шейдер не портируется
// — на цвет поверхности не влияет, только на то, ставить ли дерево в
// данной клетке).
export function forestMaskAt(x: number, y: number): number {
  if (!forestData) return 0;
  const [px, py] = toPixel(x, y);
  return bilinear(forestData, px, py, 1 / 255);
}

// ---- Палитра земли — легаси CPU-градиент по высоте, оставлен как
// референс/фолбэк (см. terrainMesh.ts) — суша красится настоящими
// текстурами в шейдере (renderer.ts), не этой функцией.
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
