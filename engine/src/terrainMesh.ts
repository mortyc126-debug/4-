/* =========================================================================
   Меш рельефа: обычная (не инстансированная) решётка треугольников —
   вторая техника рендера после маркеров, показывает, что пайплайн не
   завязан на один-единственный приём. Вода — отдельная плоская подложка
   на уровне SEA (не следует сырой высоте, как и в живой игре), суша —
   вершины приподняты по heightAt(x,y)*HMAX.

   Затенение — АНАЛИТИЧЕСКАЯ нормаль по градиенту heightAt (центральные
   разности), не face-нормаль конкретного треугольника: раньше нормаль (и
   сама подсветка) считались один раз на треугольник на CPU и записывались
   уже готовым цветом — соседние треугольники одной и той же поверхности
   заметно отличались яркостью, рельеф выглядел гранёным "low-poly"
   пятном. Теперь CPU кладёт нормаль В ТОЧКЕ отдельным атрибутом (одна и
   та же для всех треугольников, ссылающихся на одну мировую координату —
   меш не индексирован, но heightAt чистая функция координат, так что
   значение всё равно совпадает), а подсветку считает фрагментный шейдер
   (см. renderer.ts) по ИНТЕРПОЛИРОВАННОЙ нормали — гладкий переход между
   треугольниками, тот же приём, что уже даёт настоящим .glb-моделям
   мягкое затенение (см. modelRenderer.ts).

   Аналитическая нормаль стоит 4 лишних heightAt на точку — заметно на
   дальнем разреженном кольце (step>1, см. main.ts:updateFarTerrain), где
   чанки строятся на лету во время полёта и результат всё равно почти не
   виден (далеко, да ещё скрыт туманом). Поэтому она включается только для
   ближних чанков (step===1); грубые чанки возвращаются к дешёвой
   face-нормали треугольника — тот приём, что был до этого перехода.

   Цвет земли больше не запекается на CPU (groundColor(e) — суша красится
   настоящими текстурами в фрагментном шейдере, см. renderer.ts, по uv +
   elevation, которые кладём тут как атрибуты). "colors" остался только для
   ВОДЫ — она плоская, без текстуры, дешевле держать баked-цвет, как и
   раньше; waterFlag говорит шейдеру, что в этой точке брать colors как
   есть, а не сэмплить текстуры земли.
   ========================================================================= */
import { heightAt, waterColor, forestMaskAt, moistureAt, SEA, HMAX, isWater } from "./terrain";
import { norm, cross, sub, type Vec3 } from "./mat4";

export interface MeshData {
  positions: Float32Array;
  colors: Float32Array; // только вода, см. комментарий выше
  normals: Float32Array;
  uvs: Float32Array;
  elevations: Float32Array;
  waterFlags: Float32Array;
  // Настоящая доля древесного покрова в этой точке (terrain.ts:forestMaskAt,
  // теперь читает ESA WorldCover, не синтетический шум) — кладём как
  // атрибут вершины по ТОЙ ЖЕ причине, что и elevation выше: у фрагментного
  // WGSL-шейдера (renderer.ts) нет доступа к heightRaw/сырым данным
  // растра (та же цепочка, что и раньше не портировалась в WGSL), только к
  // готовому числу с CPU, интерполированному по треугольнику.
  forestFracs: Float32Array;
  // Та же логика, что и у forestFracs выше, только для влажности региона
  // (terrain.ts:moistureAt — теперь тоже настоящие классы ESA WorldCover,
  // не синтетический шум) — WGSL не может прочитать moisture.bin напрямую,
  // поэтому CPU считает готовое число в каждой вершине и кладёт атрибутом.
  moistureFracs: Float32Array;
  vertexCount: number;
}

const UP: Vec3 = [0, 1, 0];
// Сколько мировых клеток укладывается в один повтор текстуры земли —
// подобрано на глаз под масштаб декора (дерево ~1-2 клетки в диаметре):
// текстура не должна быть ни огромным единственным пятном на весь чанк, ни
// мелкой рябью.
const GROUND_TILE = 6;

// Центральные разности heightAt — тот же приём, что и в heightmap-нормалях
// любого рельефа: наклон вдоль X/Z даёт наклон нормали. e=0.5 — примерно
// половина шага сетки ближних чанков (step=1), достаточно мелко для
// плавного результата, не настолько мелко, чтобы шум heightAt на этом
// масштабе давал зернистость.
function normalAt(x: number, y: number): Vec3 {
  const e = 0.5;
  const hL = heightAt(x - e, y) * HMAX, hR = heightAt(x + e, y) * HMAX;
  const hD = heightAt(x, y - e) * HMAX, hU = heightAt(x, y + e) * HMAX;
  return norm([-(hR - hL) / (2 * e), 1, -(hU - hD) / (2 * e)]);
}

interface Vert { p: Vec3; c: [number, number, number]; n: Vec3; uv: [number, number]; e: number; water: number; forest: number; moisture: number }

// sink — насколько опустить весь патч по вертикали. Нужен ТОЛЬКО грубому
// дальнему кольцу: оно теперь местами лежит под детальными ближними чанками
// (см. updateFarTerrain в main.ts — грубый чанк выбрасывается лишь когда он
// ЦЕЛИКОМ накрыт детальным слоем, иначе в мире появлялись прорези). Обе сетки
// читают одну и ту же heightAt, но грубая между своими редкими узлами
// интерполирует линейно, поэтому её поверхность то чуть выше, то чуть ниже
// детальной — на совпадающих участках это давало бы z-fighting. Небольшой
// сдвиг вниз гарантирует, что там, где есть детальный рельеф, виден именно
// он, а грубый молча остаётся подложкой.
export function buildTerrainPatch(x0: number, y0: number, x1: number, y1: number, step = 1, sink = 0): MeshData {
  const cols = Math.round((x1 - x0) / step);
  const rows = Math.round((y1 - y0) / step);
  const smooth = step === 1; // см. комментарий в шапке файла
  const positions: number[] = [];
  const colors: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const elevations: number[] = [];
  const waterFlags: number[] = [];
  const forestFracs: number[] = [];
  const moistureFracs: number[] = [];

  function vertexAt(x: number, y: number): Vert {
    const e = heightAt(x, y);
    const water = e < SEA;
    const p: Vec3 = water ? [x, SEA * HMAX - sink, y] : [x, e * HMAX - sink, y];
    const c: [number, number, number] = water ? waterColor((SEA - e) * 3) : [0, 0, 0];
    // вода — плоская подложка (см. выше), нормаль честно "вверх"; на грубых
    // чанках (!smooth) аналитическую нормаль не считаем — face-нормаль
    // подставит pushTri ниже, дешевле и не заметно на таком расстоянии.
    const n = water ? UP : (smooth ? normalAt(x, y) : UP);
    return { p, c, n, uv: [x / GROUND_TILE, y / GROUND_TILE], e, water: water ? 1 : 0, forest: forestMaskAt(x, y), moisture: moistureAt(x, y) };
  }

  // Сетка углов ячеек считается один раз на угол, а не заново в КАЖДОЙ из
  // до 4 ячеек, что его используют (было так раньше, для одной только
  // позиции/цвета не страшно, а normalAt выше добавляет ещё 4 вызова
  // heightAt на точку — ре-семплирование того же угла вчетверо стало бы
  // ощутимо дороже).
  const grid: Vert[][] = [];
  for (let j = 0; j <= rows; j++) {
    const row: Vert[] = [];
    for (let i = 0; i <= cols; i++) row.push(vertexAt(x0 + i * step, y0 + j * step));
    grid.push(row);
  }

  function pushTri(a: Vert, b: Vert, c: Vert) {
    // Грубые (!smooth) чанки: одна face-нормаль на треугольник, как до
    // перехода на аналитическую подсветку — дёшево, гранёность не видна
    // на разреженном дальнем кольце.
    const faceN = smooth ? null : norm(cross(sub(b.p, a.p), sub(c.p, a.p)));
    for (const v of [a, b, c]) {
      positions.push(v.p[0], v.p[1], v.p[2]);
      colors.push(v.c[0], v.c[1], v.c[2]);
      const n = faceN ?? v.n;
      normals.push(n[0], n[1], n[2]);
      uvs.push(v.uv[0], v.uv[1]);
      elevations.push(v.e);
      waterFlags.push(v.water);
      forestFracs.push(v.forest);
      moistureFracs.push(v.moisture);
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const v00 = grid[j][i], v10 = grid[j][i + 1], v01 = grid[j + 1][i], v11 = grid[j + 1][i + 1];
      // Порядок вершин важен вдвойне: раньше отсюда же бралась face-нормаль
      // для затенения (её больше нет — см. normalAt выше), но он всё ещё
      // задаёт видимую грань для cullMode:"back" в renderer.ts. Ранее тут
      // стоял (v00,v10,v11)/(v00,v11,v01) — давало нормаль (0,-1,0), рельеф
      // культился прочь при обычном взгляде сверху (см. историю бага —
      // не проявлялось в этой песочнице, только на реальном устройстве).
      pushTri(v00, v11, v10);
      pushTri(v00, v01, v11);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    elevations: new Float32Array(elevations),
    waterFlags: new Float32Array(waterFlags),
    forestFracs: new Float32Array(forestFracs),
    moistureFracs: new Float32Array(moistureFracs),
    vertexCount: positions.length / 3,
  };
}

export { isWater };
