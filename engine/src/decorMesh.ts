/* =========================================================================
   Декоративные пропсы (деревья/камни/кусты/трава) — процедурная геометрия,
   как и весь остальной мир (см. terrain.ts). Идея разнообразия — со
   старого прототипа (obyom-3d-infinite.html — treeSpruce/treePine/
   treeBroad/treeBirch/treeDead/bush + палитры PINE/LEAF/GRASSC/BUSHC), не
   дословный код: там форма/цвет запекались на CPU в геометрию КАЖДОГО
   отдельного дерева (статичный остров), тут форма — одна из нескольких
   переиспользуемых (рельеф бесконечный, стримится чанками — разную
   геометрию на каждый инстанс не позволить), а цвет — атрибут ИНСТАНСА
   (см. renderer.ts/DECOR_SHADER).

   По прямому запросу пользователя ("детализация, пофиг на
   производительность, чтобы было похоже на платные ассеты") — каждый вид
   заметно богаче геометрией, чем более ранняя версия: больше сегментов на
   конус, больше "блобов" кроны, у камня — кластер из трёх гранёных валунов
   вместо одного, у берёзы — полосы коры, у травы — гуще пучок.

   materialId у каждой вершины — РОЛЬ, не сам цвет:
   0 = обычный ствол (TRUNK_COLOR),
   1 = крона/камень/куст/трава — цвет ИНСТАНСА (палитра на CPU, main.ts),
   2 = бледный ствол берёзы (BIRCH_TRUNK),
   3 = тёмная полоса коры берёзы (BIRCH_MARK),
   4 = сухой ствол (DEAD_COLOR) — отдельно от живого, чтобы сухостой не
       читался тем же тёплым бурым, что и ствол под кроной живого дерева.
   Плюс "shade" (0.7..1.3) — печётся на каждую вершину отдельно, множится
   на итоговый цвет в шейдере: у одного и того же инстанса разные "блобы"
   кроны получают чуть разную яркость (лёгкая рябь светотени), а не один
   плоский оттенок на весь силуэт.
   ========================================================================= */
import { cross, sub, norm, type Vec3 } from "./mat4";

export interface DecorMesh {
  positions: Float32Array;
  normals: Float32Array;
  materialIds: Float32Array;
  shades: Float32Array;
  vertexCount: number;
}

// Палитры — перенос PINE/LEAF/GRASSC/BUSHC из obyom-3d-infinite.html: хвоя —
// приглушённые тёмно-зелёные тона, лиственная крона — от оливкового до
// тёплого золотисто-оранжевого, трава светлее и желтее кроны, куст — между
// травой и кроной по тону.
export const PINE: Vec3[] = [
  [0.13, 0.22, 0.14], [0.17, 0.28, 0.16], [0.11, 0.19, 0.13],
  [0.20, 0.31, 0.19], [0.15, 0.26, 0.20], [0.22, 0.30, 0.14],
];
export const LEAF: Vec3[] = [
  [0.28, 0.34, 0.15], [0.36, 0.39, 0.18], [0.23, 0.30, 0.14],
  [0.42, 0.36, 0.14], [0.31, 0.27, 0.12], [0.34, 0.41, 0.20], [0.45, 0.40, 0.17],
];
export const GRASS_TONES: Vec3[] = [
  [0.30, 0.38, 0.16], [0.36, 0.42, 0.18], [0.26, 0.33, 0.14], [0.41, 0.43, 0.20],
];
export const BUSH_TONES: Vec3[] = [
  [0.24, 0.31, 0.14], [0.29, 0.36, 0.16], [0.20, 0.28, 0.13], [0.33, 0.38, 0.18], [0.26, 0.34, 0.19],
];
export const ROCK_TONES: Vec3[] = [
  [0.40, 0.38, 0.34], [0.46, 0.43, 0.38], [0.35, 0.34, 0.33], [0.44, 0.38, 0.32],
];

function pushTri(pos: number[], nrm: number[], mid: number[], shd: number[], a: Vec3, b: Vec3, c: Vec3, m: number, shade: number) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  for (const p of [a, b, c]) {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    mid.push(m);
    shd.push(shade);
  }
}

function cone(pos: number[], nrm: number[], mid: number[], shd: number[], sides: number, radius: number, height: number, baseY: number, m: number, shade: number) {
  const apex: Vec3 = [0, baseY + height, 0];
  const base: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    base.push([Math.cos(a) * radius, baseY, Math.sin(a) * radius]);
  }
  for (let i = 0; i < sides; i++) {
    const b0 = base[i], b1 = base[(i + 1) % sides];
    pushTri(pos, nrm, mid, shd, apex, b0, b1, m, shade);
  }
}

// Ствол-усечённый конус (не прямоугольная коробка) — у основания шире, к
// вершине уже, гранёный по sides сторонам: заметно органичнее прежнего
// box()-ствола, тот же порядок стоимости (2×sides треугольников).
function frustum(pos: number[], nrm: number[], mid: number[], shd: number[], sides: number, rBase: number, rTop: number, height: number, baseY: number, m: number, shade: number) {
  const y0 = baseY, y1 = baseY + height;
  const lo: Vec3[] = [], hi: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    lo.push([Math.cos(a) * rBase, y0, Math.sin(a) * rBase]);
    hi.push([Math.cos(a) * rTop, y1, Math.sin(a) * rTop]);
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    pushTri(pos, nrm, mid, shd, lo[i], lo[j], hi[j], m, shade);
    pushTri(pos, nrm, mid, shd, lo[i], hi[j], hi[i], m, shade);
  }
}

// Октаэдр (8 треугольников) как дешёвый "шар" для кроны/куста — ellipsoid
// через масштаб по осям вместо честной сферы.
function blob(pos: number[], nrm: number[], mid: number[], shd: number[], cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, m: number, shade: number) {
  const top: Vec3 = [cx, cy + ry, cz], bottom: Vec3 = [cx, cy - ry, cz];
  const ring: Vec3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ring.push([cx + Math.cos(a) * rx, cy, cz + Math.sin(a) * rz]);
  }
  for (let i = 0; i < 4; i++) {
    const r0 = ring[i], r1 = ring[(i + 1) % 4];
    pushTri(pos, nrm, mid, shd, top, r0, r1, m, shade);
    pushTri(pos, nrm, mid, shd, bottom, r1, r0, m, shade);
  }
}

const mk = (): { positions: number[]; normals: number[]; materialIds: number[]; shades: number[] } => ({ positions: [], normals: [], materialIds: [], shades: [] });
const done = (b: ReturnType<typeof mk>): DecorMesh => ({
  positions: new Float32Array(b.positions), normals: new Float32Array(b.normals),
  materialIds: new Float32Array(b.materialIds), shades: new Float32Array(b.shades),
  vertexCount: b.positions.length / 3,
});

// ---- ель: высокий узкий силуэт из шести сужающихся, плотно перекрытых
// ярусов конуса — "рождественская" форма. shade чуть гуляет по ярусам —
// не одна плоская яркость на весь конус.
export function buildSpruceMesh(): DecorMesh {
  const b = mk();
  frustum(b.positions, b.normals, b.materialIds, b.shades, 7, 0.1, 0.06, 0.5, 0, 0, 1);
  const tiers: [number, number, number][] = [
    [0.95, 0.62, 0.42], [0.82, 0.60, 0.78], [0.68, 0.58, 1.12],
    [0.54, 0.56, 1.46], [0.40, 0.52, 1.78], [0.24, 0.48, 2.08],
  ];
  tiers.forEach(([r, h, y], i) => cone(b.positions, b.normals, b.materialIds, b.shades, 8, r, h, y, 1, 0.88 + (i % 3) * 0.09));
  return done(b);
}

// ---- сосна: более редкая, округлая — клубы кроны (блобы), а не острые
// ярусы, асимметрично разбросанные вокруг ствола (в т.ч. пара низких
// боковых "ветвей") — сильно отличимый от ели силуэт того же назначения.
export function buildPineMesh(): DecorMesh {
  const b = mk();
  frustum(b.positions, b.normals, b.materialIds, b.shades, 7, 0.11, 0.07, 0.9, 0, 0, 1);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.5, 0.78, 0.3, 0.34, 0.26, 0.34, 1, 0.85);
  blob(b.positions, b.normals, b.materialIds, b.shades, -0.46, 0.7, -0.3, 0.32, 0.24, 0.32, 1, 0.8);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0, 1.05, 0, 0.72, 0.5, 0.72, 1, 1.0);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.36, 1.42, 0.22, 0.52, 0.4, 0.52, 1, 1.08);
  blob(b.positions, b.normals, b.materialIds, b.shades, -0.32, 1.58, -0.26, 0.46, 0.36, 0.46, 1, 0.95);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.06, 1.92, 0.04, 0.38, 0.32, 0.38, 1, 1.15);
  return done(b);
}

// ---- дуб/лиственное: толстый ствол, полная округлая крона из восьми
// перекрывающихся блобов на разной высоте/вылете — плотный "пышный" силуэт.
export function buildBroadleafMesh(): DecorMesh {
  const b = mk();
  frustum(b.positions, b.normals, b.materialIds, b.shades, 7, 0.14, 0.09, 0.85, 0, 0, 1);
  const blobs: [number, number, number, number, number, number, number][] = [
    [0, 1.5, 0, 0.68, 0.6, 0.68, 1.0],
    [0.46, 1.32, 0.14, 0.42, 0.38, 0.42, 1.1],
    [-0.42, 1.36, -0.3, 0.4, 0.36, 0.4, 0.85],
    [0.1, 1.16, -0.44, 0.36, 0.32, 0.36, 0.95],
    [-0.16, 1.62, 0.2, 0.34, 0.3, 0.34, 1.15],
    [0.42, 1.68, -0.18, 0.3, 0.28, 0.3, 1.05],
    [-0.4, 1.72, 0.22, 0.28, 0.26, 0.28, 0.9],
    [0.02, 1.95, -0.02, 0.3, 0.28, 0.3, 1.2],
  ];
  blobs.forEach(([cx, cy, cz, rx, ry, rz, shade]) => blob(b.positions, b.normals, b.materialIds, b.shades, cx, cy, cz, rx, ry, rz, 1, shade));
  return done(b);
}

// ---- берёза: тонкий бледный ствол (materialId=2) с тёмными полосами коры
// (materialId=3, короткие плоские вставки на разной высоте/повороте —
// узнаваемая деталь, которой не хватало) + лёгкая светлая крона.
export function buildBirchMesh(): DecorMesh {
  const b = mk();
  const trunkRBase = 0.075, trunkRTop = 0.045, trunkH = 0.98;
  frustum(b.positions, b.normals, b.materialIds, b.shades, 6, trunkRBase, trunkRTop, trunkH, 0, 2, 1);
  // Тёмные полосы коры — плоские вставки прямо на поверхности ствола
  // (не осесимметричный бокс, а квад, развёрнутый по касательной к стволу
  // на нужной высоте/угле) — узнаваемая деталь берёзы.
  const marks: [number, number, number][] = [[0.3, 0.18, 0.09], [2.1, 0.4, 0.075], [4.0, 0.62, 0.085], [1.2, 0.82, 0.06]];
  marks.forEach(([angle, y, hw]) => {
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const r = (trunkRBase + (trunkRTop - trunkRBase) * (y / trunkH)) * 1.02;
    const center: Vec3 = [dx * r, y, dz * r];
    const perp: Vec3 = [-dz, 0, dx];
    const halfH = 0.045;
    const c0: Vec3 = [center[0] + perp[0] * hw, y - halfH, center[2] + perp[2] * hw];
    const c1: Vec3 = [center[0] - perp[0] * hw, y - halfH, center[2] - perp[2] * hw];
    const c2: Vec3 = [center[0] - perp[0] * hw, y + halfH, center[2] - perp[2] * hw];
    const c3: Vec3 = [center[0] + perp[0] * hw, y + halfH, center[2] + perp[2] * hw];
    pushTri(b.positions, b.normals, b.materialIds, b.shades, c0, c1, c2, 3, 1);
    pushTri(b.positions, b.normals, b.materialIds, b.shades, c0, c2, c3, 3, 1);
  });
  blob(b.positions, b.normals, b.materialIds, b.shades, 0, 1.5, 0, 0.46, 0.48, 0.46, 1, 1.05);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.26, 1.28, 0.2, 0.32, 0.3, 0.32, 1, 0.95);
  blob(b.positions, b.normals, b.materialIds, b.shades, -0.24, 1.24, -0.18, 0.3, 0.28, 0.3, 1, 0.88);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.12, 1.06, -0.26, 0.26, 0.24, 0.26, 1, 1.0);
  blob(b.positions, b.normals, b.materialIds, b.shades, -0.1, 1.72, 0.1, 0.24, 0.22, 0.24, 1, 1.1);
  return done(b);
}

// ---- сухостой: голый серый ствол (materialId=4 — отдельный от живого,
// иначе читался бы тем же тёплым бурым) с пятью обломанными сучьями под
// разными углами вместо трёх — гуще и не так очевидно "три палки крестом".
export function buildDeadTreeMesh(): DecorMesh {
  const b = mk();
  frustum(b.positions, b.normals, b.materialIds, b.shades, 6, 0.09, 0.035, 1.4, 0, 4, 1);
  const branch = (angle: number, tilt: number, y: number, len: number) => {
    const dx = Math.cos(angle) * Math.cos(tilt), dz = Math.sin(angle) * Math.cos(tilt), dy = Math.sin(tilt);
    const a: Vec3 = [0, y, 0];
    const bpt: Vec3 = [dx * len, y + dy * len, dz * len];
    const perp: Vec3 = [-dz, 0, dx];
    const w = 0.03;
    pushTri(b.positions, b.normals, b.materialIds, b.shades,
      [a[0] + perp[0] * w, a[1], a[2] + perp[2] * w],
      [a[0] - perp[0] * w, a[1], a[2] - perp[2] * w],
      bpt, 4, 1);
    const c: Vec3 = [bpt[0] * 0.55, bpt[1] * 0.55 + y * 0.45, bpt[2] * 0.55];
    const twig: Vec3 = [bpt[0] + dx * len * 0.4 - dz * 0.15, bpt[1] + dy * len * 0.4 + 0.1, bpt[2] + dz * len * 0.4 + dx * 0.15];
    pushTri(b.positions, b.normals, b.materialIds, b.shades,
      [c[0] + perp[0] * w * 0.6, c[1], c[2] + perp[2] * w * 0.6],
      [c[0] - perp[0] * w * 0.6, c[1], c[2] - perp[2] * w * 0.6],
      twig, 4, 1);
  };
  branch(0.4, 0.5, 1.5, 0.6);
  branch(2.2, 0.32, 1.75, 0.5);
  branch(3.8, 0.55, 1.95, 0.46);
  branch(5.1, 0.4, 2.1, 0.4);
  branch(1.6, 0.65, 2.25, 0.34);
  return done(b);
}

// ---- куст: без ствола, компактный кластер из пяти блобов у самой земли —
// заполняет "средний ярус" между травой и деревьями.
export function buildBushMesh(): DecorMesh {
  const b = mk();
  blob(b.positions, b.normals, b.materialIds, b.shades, 0, 0.26, 0, 0.4, 0.26, 0.4, 1, 1.0);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.26, 0.22, 0.16, 0.28, 0.2, 0.28, 1, 0.9);
  blob(b.positions, b.normals, b.materialIds, b.shades, -0.24, 0.2, -0.18, 0.26, 0.18, 0.26, 1, 0.85);
  blob(b.positions, b.normals, b.materialIds, b.shades, 0.1, 0.3, -0.24, 0.24, 0.2, 0.24, 1, 1.05);
  blob(b.positions, b.normals, b.materialIds, b.shades, -0.14, 0.34, 0.2, 0.22, 0.18, 0.22, 1, 0.95);
  return done(b);
}

// ---- пучок травы: пять узких лезвий веером (было три) — гуще силуэт
// одного инстанса, что напрямую снижает число инстансов, нужных для
// ощущения сплошного покрова.
export function buildGrassMesh(): DecorMesh {
  const b = mk();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const dx = Math.cos(a) * 0.11, dz = Math.sin(a) * 0.11;
    const h = 0.36 + (i % 2) * 0.14;
    const tip: Vec3 = [dx * 0.4, h, dz * 0.4];
    pushTri(b.positions, b.normals, b.materialIds, b.shades, [-dx, 0, -dz], [dx, 0, dz], tip, 1, 0.85 + (i % 3) * 0.1);
  }
  return done(b);
}

// ---- камень: кластер из трёх гранёных валунов (было — один куб) —
// главный (подразбитый дважды, ~128 треугольников — по-настоящему гладкий
// гранёный силуэт) плюс два меньших спутника рядом (подразбиты один раз) —
// читается как естественная россыпь, а не одна и та же "капля",
// повторённая инстансингом.
function normVec(v: Vec3): Vec3 { return norm(v); }
function midNorm(a: Vec3, b: Vec3): Vec3 { return normVec([a[0] + b[0], a[1] + b[1], a[2] + b[2]]); }
// Детерминированный хеш направления вершины на единичной сфере — держит
// один и тот же случайный "выступ" радиуса на каждой из повторных копий
// одной вершины (шов между гранями), а не независимый шум на каждую копию
// (иначе была бы трещина в мешe).
function hashDir(v: Vec3, salt: number): number {
  const h = Math.sin(v[0] * 12.9898 + v[1] * 78.233 + v[2] * 37.719 + salt * 91.7) * 43758.5453;
  return h - Math.floor(h);
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
    pushTri(bld.positions, bld.normals, bld.materialIds, bld.shades, jitterR(a), jitterR(b), jitterR(c), 1, shade);
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
