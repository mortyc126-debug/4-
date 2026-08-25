/* =========================================================================
   Декоративные пропсы (деревья/камни/кусты/трава) — геометрия под
   ТЕКСТУРЫ, не под запечённый цвет. Ствол — процедурный гранёный конус
   (текстурируется корой, textures/decor/bark.jpg / birch_bark.jpg), крона/
   куст/трава — billboard-cross: 2-3 пересекающиеся текстурированные
   плоскости с альфа-вырезом по контуру (textures/decor/*.png — реальные
   карточки листвы с прозрачным фоном, сгенерированные нейросетью по
   промптам этой сессии). Тот же приём, что рисует деревья практически в
   любой игре (SpeedTree и подобные): полноценных 3D-листьев не бывает
   нигде, кроме macro-съёмки — крона это всегда текстурная карточка на
   нескольких плоскостях.

   materialId у каждой вершины — РОЛЬ (какую из ДВУХ текстур этого вида
   сэмплить), не сам цвет:
   0 = ствол (текстура коры — какая именно, решает renderer.ts: у вида
       "birch" это birch_bark.png, у остальных — обычная bark.png; сама
       геометрия не знает, какая у неё кора),
   1 = крона/куст/трава/камень — альфа-вырез, цвет ИНСТАНСА (main.ts)
       множится поверх текстуры (тонкая вариация тона между инстансами
       одной текстуры, не замена ей).
   "shade" (0.6..1.3) по-прежнему печётся на вершину — у разных плоскостей
   кроны чуть разная яркость, живее, чем одна плоская заливка.
   ========================================================================= */
import { cross, sub, norm, type Vec3 } from "./mat4";

export interface DecorMesh {
  positions: Float32Array;
  normals: Float32Array;
  materialIds: Float32Array;
  shades: Float32Array;
  uvs: Float32Array;
  vertexCount: number;
}

// Палитры — лёгкий тон-множитель ПОВЕРХ настоящей текстуры (не замена
// цвета, как раньше): у одного и того же вида остаётся разброс оттенков
// между инстансами, но общий цвет и рисунок теперь настоящие, из PNG.
export const PINE: Vec3[] = [
  [0.78, 0.9, 0.8], [0.85, 1.0, 0.88], [0.72, 0.84, 0.76],
  [0.9, 1.0, 0.92], [0.8, 0.94, 0.9], [0.88, 0.98, 0.8],
];
export const LEAF: Vec3[] = [
  [0.85, 0.95, 0.78], [0.92, 1.0, 0.85], [0.8, 0.9, 0.76],
  [1.0, 0.94, 0.78], [0.88, 0.82, 0.7], [0.86, 1.0, 0.9], [1.0, 0.92, 0.8],
];
export const GRASS_TONES: Vec3[] = [
  [1.0, 1.15, 0.95], [1.05, 1.15, 1.0], [0.92, 1.05, 0.9], [1.15, 1.15, 1.0],
];
export const BUSH_TONES: Vec3[] = [
  [0.78, 0.9, 0.76], [0.85, 0.98, 0.82], [0.72, 0.86, 0.74], [0.9, 1.0, 0.88], [0.8, 0.94, 0.86],
];
export const ROCK_TONES: Vec3[] = [
  [0.92, 0.9, 0.86], [1.0, 0.98, 0.92], [0.84, 0.84, 0.82], [0.96, 0.9, 0.82],
];

function pushTri(
  pos: number[], nrm: number[], mid: number[], shd: number[], uv: number[],
  a: Vec3, b: Vec3, c: Vec3, m: number, shade: number,
  uvA: [number, number] = [0.5, 0.5], uvB: [number, number] = [0.5, 0.5], uvC: [number, number] = [0.5, 0.5]
) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  const pts: [Vec3, [number, number]][] = [[a, uvA], [b, uvB], [c, uvC]];
  for (const [p, u] of pts) {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    mid.push(m);
    shd.push(shade);
    uv.push(u[0], u[1]);
  }
}

// Ствол — усечённый конус, гранёный по sides сторонам, с UV для текстуры
// коры: u оборачивается вокруг ствола, v идёт вдоль высоты (0 у земли, 1 у
// вершины) — простое линейное растяжение текстуры по стволу, стандартный
// приём для конических стволов.
function trunk(pos: number[], nrm: number[], mid: number[], shd: number[], uv: number[], sides: number, rBase: number, rTop: number, height: number, baseY: number, m: number, shade: number) {
  const y0 = baseY, y1 = baseY + height;
  const lo: Vec3[] = [], hi: Vec3[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    lo.push([Math.cos(a) * rBase, y0, Math.sin(a) * rBase]);
    hi.push([Math.cos(a) * rTop, y1, Math.sin(a) * rTop]);
  }
  for (let i = 0; i < sides; i++) {
    const u0 = i / sides, u1 = (i + 1) / sides;
    pushTri(pos, nrm, mid, shd, uv, lo[i], lo[i + 1], hi[i + 1], m, shade, [u0, 0], [u1, 0], [u1, 1]);
    pushTri(pos, nrm, mid, shd, uv, lo[i], hi[i + 1], hi[i], m, shade, [u0, 0], [u1, 1], [u0, 1]);
  }
}

// Крона/куст/трава — billboard cross: несколько текстурированных плоскостей
// (карточка с альфа-вырезом, см. decorMesh header), пересекающихся по
// центральной оси, а не честная 3D-геометрия — тот же приём, что и в
// любой игре с деревьями: реальный объём даёт не число полигонов, а сама
// текстура (силуэт вырезан по контуру кроны/травинок в самой картинке).
// texPadBottom — доля ПОЛНОСТЬЮ ПРОЗРАЧНОЙ полосы внизу самой картинки.
// Карточка рисуется целиком, от baseY до topY, и картинка натягивается на неё
// тоже целиком — значит, если у картинки внизу пустое поле, видимое растение
// начинается ВЫШЕ основания карточки и висит в воздухе. Ровно это автор и
// увидел: кусты и трава парят над землёй.
//
// Деревьев это не касается, хотя пустая полоса есть и у их текстур: у них
// есть ствол — настоящая геометрия от самой земли, — и он их держит. Парят
// только те, что состоят ИЗ ОДНИХ карточек, без ствола: куст и трава.
//
// Лечим сдвигом всей карточки вниз ровно на высоту этой полосы: видимая часть
// садится основанием на землю, а размер и пропорции остаются теми же, что
// были, — сдвиг, а не растяжение. Ушедший под землю кусок карточки прозрачен
// целиком, рисовать там нечего.
//
// Числа мерены по тому же порогу альфы, по которому шейдер делает discard
// (a < 0.5, см. DECOR_SHADER в renderer.ts):
//     node tools/measure_decor_padding.mjs
// Перемеряйте после ЛЮБОЙ замены картинки декора.
function billboardCross(pos: number[], nrm: number[], mid: number[], shd: number[], uv: number[], planes: number, halfWidth: number, baseY: number, topY: number, m: number, shade: number, xOffset = 0, texPadBottom = 0) {
  if (texPadBottom > 0) {
    const drop = (topY - baseY) * texPadBottom;
    baseY -= drop;
    topY -= drop;
  }
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI; // 0..π — плоскость и её "изнанка" через 180° это та же плоскость (у декор-пайплайна нет backface culling, см. renderer.ts)
    const dx = Math.cos(a), dz = Math.sin(a);
    const lo0: Vec3 = [xOffset - dx * halfWidth, baseY, -dz * halfWidth];
    const lo1: Vec3 = [xOffset + dx * halfWidth, baseY, dz * halfWidth];
    const hi0: Vec3 = [xOffset - dx * halfWidth, topY, -dz * halfWidth];
    const hi1: Vec3 = [xOffset + dx * halfWidth, topY, dz * halfWidth];
    pushTri(pos, nrm, mid, shd, uv, lo0, lo1, hi1, m, shade, [0, 1], [1, 1], [1, 0]);
    pushTri(pos, nrm, mid, shd, uv, lo0, hi1, hi0, m, shade, [0, 1], [1, 0], [0, 0]);
  }
}

const mk = (): { positions: number[]; normals: number[]; materialIds: number[]; shades: number[]; uvs: number[] } => ({ positions: [], normals: [], materialIds: [], shades: [], uvs: [] });
const done = (b: ReturnType<typeof mk>): DecorMesh => ({
  positions: new Float32Array(b.positions), normals: new Float32Array(b.normals),
  materialIds: new Float32Array(b.materialIds), shades: new Float32Array(b.shades), uvs: new Float32Array(b.uvs),
  vertexCount: b.positions.length / 3,
});

// ---- ель: узкий и высокий крест из карточек хвои (conifer_a.png) —
// вытянутая по Y пропорция кроны читается как острый "рождественский"
// силуэт, хотя геометрия та же, что и у сосны ниже.
export function buildSpruceMesh(): DecorMesh {
  const b = mk();
  trunk(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 7, 0.1, 0.06, 0.45, 0, 0, 1);
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 3, 0.85, 0.3, 2.7, 1, 1.0);
  return done(b);
}

// ---- сосна: та же хвоя, но крест шире и ниже — округлый, не острый
// силуэт, сильно отличимый от ели тем же приёмом (пропорции карточки), что
// экономит на отдельной текстуре.
export function buildPineMesh(): DecorMesh {
  const b = mk();
  trunk(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 7, 0.11, 0.07, 0.7, 0, 0, 1);
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 3, 1.15, 0.25, 2.15, 1, 1.0);
  return done(b);
}

// ---- дуб/лиственное: толстый ствол, широкий полный крест кроны
// (broadleaf.png ИЛИ autumn.png — выбор текстуры на CPU, см. main.ts).
export function buildBroadleafMesh(): DecorMesh {
  const b = mk();
  trunk(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 7, 0.14, 0.09, 0.8, 0, 0, 1);
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 3, 1.3, 0.65, 2.55, 1, 1.0);
  return done(b);
}

// ---- берёза: тонкий ствол — его текстура (birch_bark.png, светлая, с уже
// нарисованными В САМОЙ картинке тёмными полосами — отдельная процедурная
// деталь для них больше не нужна) назначается на уровне renderer.ts (у
// вида "birch" свой bind group с этой текстурой на роли materialId=0, как
// и у остальных видов со своей корой) + компактный светлый крест кроны
// (birch_leaf.png).
export function buildBirchMesh(): DecorMesh {
  const b = mk();
  trunk(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 6, 0.075, 0.045, 0.95, 0, 0, 1);
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 3, 0.95, 0.7, 2.35, 1, 1.0);
  return done(b);
}

// ---- сухостой: голый ствол (та же текстура коры, но приглушённый shade —
// читается как высохший/серый без отдельной текстуры-константы) с пятью
// обломанными сучьями под разными углами — без кроны вообще.
export function buildDeadTreeMesh(): DecorMesh {
  const b = mk();
  trunk(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 6, 0.09, 0.035, 1.4, 0, 0, 0.62);
  const branch = (angle: number, tilt: number, y: number, len: number) => {
    const dx = Math.cos(angle) * Math.cos(tilt), dz = Math.sin(angle) * Math.cos(tilt), dy = Math.sin(tilt);
    const a: Vec3 = [0, y, 0];
    const bpt: Vec3 = [dx * len, y + dy * len, dz * len];
    const perp: Vec3 = [-dz, 0, dx];
    const w = 0.03;
    pushTri(b.positions, b.normals, b.materialIds, b.shades, b.uvs,
      [a[0] + perp[0] * w, a[1], a[2] + perp[2] * w],
      [a[0] - perp[0] * w, a[1], a[2] - perp[2] * w],
      bpt, 0, 0.62);
    const c: Vec3 = [bpt[0] * 0.55, bpt[1] * 0.55 + y * 0.45, bpt[2] * 0.55];
    const twig: Vec3 = [bpt[0] + dx * len * 0.4 - dz * 0.15, bpt[1] + dy * len * 0.4 + 0.1, bpt[2] + dz * len * 0.4 + dx * 0.15];
    pushTri(b.positions, b.normals, b.materialIds, b.shades, b.uvs,
      [c[0] + perp[0] * w * 0.6, c[1], c[2] + perp[2] * w * 0.6],
      [c[0] - perp[0] * w * 0.6, c[1], c[2] - perp[2] * w * 0.6],
      twig, 0, 0.62);
  };
  branch(0.4, 0.5, 1.5, 0.6);
  branch(2.2, 0.32, 1.75, 0.5);
  branch(3.8, 0.55, 1.95, 0.46);
  branch(5.1, 0.4, 2.1, 0.4);
  branch(1.6, 0.65, 2.25, 0.34);
  return done(b);
}

// ---- куст: без ствола, компактный крест кроны у самой земли (bush.png) —
// заполняет средний ярус между травой и деревьями.
// bush.png — 91 прозрачная строка из 768 снизу (11.85%), самый парящий из
// всего декора: куст висел примерно на восьмую часть собственной высоты.
const BUSH_TEX_PAD = 91 / 768;
export function buildBushMesh(): DecorMesh {
  const b = mk();
  // baseY был 0.02 — маленький подъём над землёй, доставшийся от общей формы
  // вызова (у кроны дерева он осмыслен, она сидит НА СТВОЛЕ). У куста ствола
  // нет, держаться этому подъёму не на чем, и он добавлялся к парению поверх
  // пустой полосы текстуры. Основание карточки вертикальное, с землёй оно не
  // компланарно — z-fighting'а от нуля тут быть не может.
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 3, 0.55, 0, 0.72, 1, 1.0, 0, BUSH_TEX_PAD);
  return done(b);
}

// ---- пучок травы: два креста разной высоты со сдвигом по X — не один
// силуэт по центру инстанса, а небольшая группа, гуще читается как заросли,
// не единственная плашка (grass_tuft.png).
// grass_tuft.png — 32 прозрачные строки из 768 снизу (4.17%). Оба креста
// пучка берут одну и ту же картинку, значит и поправка у них одна.
const GRASS_TEX_PAD = 32 / 768;
export function buildGrassMesh(): DecorMesh {
  const b = mk();
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 2, 0.4, 0, 0.62, 1, 1.0, -0.14, GRASS_TEX_PAD);
  billboardCross(b.positions, b.normals, b.materialIds, b.shades, b.uvs, 2, 0.32, 0, 0.5, 1, 0.92, 0.16, GRASS_TEX_PAD);
  return done(b);
}

// ---- камень: кластер из трёх гранёных валунов (подразбитый октаэдр,
// главный — дважды, спутники — один раз) с гранитной текстурой
// (textures/ground/rock.jpg, переиспользуется — та же порода что и на
// рельефе). UV — простая широтно-долготная проекция направления вершины
// НА ЕДИНИЧНОЙ сфере (до случайного смещения радиуса) — на валуне шов не
// заметен, это не критичная для читаемости деталь.
function midNorm(a: Vec3, b: Vec3): Vec3 { return norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]); }
// Детерминированный хеш направления вершины на единичной сфере — держит
// один и тот же случайный "выступ" радиуса на каждой из повторных копий
// одной вершины (шов между гранями), а не независимый шум на каждую копию
// (иначе была бы трещина в мешe).
function hashDir(v: Vec3, salt: number): number {
  const h = Math.sin(v[0] * 12.9898 + v[1] * 78.233 + v[2] * 37.719 + salt * 91.7) * 43758.5453;
  return h - Math.floor(h);
}
function sphereUV(v: Vec3): [number, number] {
  return [0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(Math.max(-1, Math.min(1, v[1]))) / Math.PI];
}
function octahedronFaces(): [Vec3, Vec3, Vec3][] {
  const PX: Vec3 = [1, 0, 0], NX: Vec3 = [-1, 0, 0], PY: Vec3 = [0, 1, 0], NY: Vec3 = [0, -1, 0], PZ: Vec3 = [0, 0, 1], NZ: Vec3 = [0, 0, -1];
  return [
    [PX, PY, PZ], [PZ, PY, NX], [NX, PY, NZ], [NZ, PY, PX],
    [PX, PZ, NY], [PZ, NX, NY], [NX, NZ, NY], [NZ, PX, NY],
  ];
}
function subdivideOnce(faces: [Vec3, Vec3, Vec3][]): [Vec3, Vec3, Vec3][] {
  const out: [Vec3, Vec3, Vec3][] = [];
  for (const [a, b, c] of faces) {
    const mab = midNorm(a, b), mbc = midNorm(b, c), mca = midNorm(c, a);
    out.push([a, mab, mca], [mab, b, mbc], [mca, mbc, c], [mab, mbc, mca]);
  }
  return out;
}
function addBoulder(bld: ReturnType<typeof mk>, level: number, cx: number, cy: number, cz: number, radius: number, flatY: number, salt: number) {
  let faces = octahedronFaces();
  for (let i = 0; i < level; i++) faces = subdivideOnce(faces);
  const jitterR = (v: Vec3): Vec3 => {
    const r = radius * (0.8 + hashDir(v, salt) * 0.45);
    return [cx + v[0] * r, cy + v[1] * r * flatY, cz + v[2] * r];
  };
  for (const [a, b, c] of faces) {
    const shade = 0.82 + hashDir(a, salt + 3) * 0.36;
    pushTri(bld.positions, bld.normals, bld.materialIds, bld.shades, bld.uvs, jitterR(a), jitterR(b), jitterR(c), 1, shade, sphereUV(a), sphereUV(b), sphereUV(c));
  }
}
export function buildRockMesh(): DecorMesh {
  const b = mk();
  const flatY = 0.68; // приплюснутый по Y валун — тот же пропорции, что были у прежнего куба
  const mainR = 0.5, mainCY = mainR * flatY; // центр поднят так, чтобы низ лежал на y=0
  addBoulder(b, 2, 0, mainCY, 0, mainR, flatY, 1);
  const sideR = 0.24;
  addBoulder(b, 1, 0.48, sideR * flatY * 0.9, 0.1, sideR, flatY, 2);
  addBoulder(b, 1, -0.4, sideR * flatY * 0.8, -0.34, sideR * 0.85, flatY, 3);
  return done(b);
}
