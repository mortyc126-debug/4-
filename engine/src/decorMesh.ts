/* =========================================================================
   Декоративные пропсы (деревья/камни/трава) — процедурная низкополигональная
   геометрия, как и весь остальной мир (см. terrain.ts). Идея разнообразия —
   со старого прототипа (obyom-3d-infinite.html — treeSpruce/treePine/
   treeBroad/treeBirch/treeDead + палитры PINE/LEAF/GRASSC), не дословный
   код: там цвет/форма запекались на CPU в геометрию каждого отдельного
   дерева (тысячи уникальных мешей на статичный остров), тут форма — одна из
   нескольких переиспользуемых (рельеф теперь бесконечный и стримится
   чанками, разную геометрию на каждый инстанс не позволить), а цвет —
   атрибут ИНСТАНСА (см. renderer.ts/DECOR_SHADER).

   materialId у каждой вершины — не цвет, а РОЛЬ, которую цвет играет:
   0 = обычный ствол (бурый, см. TRUNK_COLOR в DECOR_SHADER),
   1 = крона/камень/трава — красится цветом инстанса (палитра выбирается на
       CPU, см. main.ts),
   2 = бледный ствол берёзы (BIRCH_TRUNK в шейдере).
   ========================================================================= */
import { cross, sub, norm, type Vec3 } from "./mat4";

export interface DecorMesh {
  positions: Float32Array;
  normals: Float32Array;
  materialIds: Float32Array;
  vertexCount: number;
}

// Палитры — прямой перенос PINE/LEAF/GRASSC из obyom-3d-infinite.html:
// хвоя — приглушённые тёмно-зелёные тона, лиственная крона — от оливкового
// до тёплого золотисто-оранжевого (тот самый "разнообразный" осенний тон),
// трава — светлее и желтее кроны.
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
export const ROCK_TONES: Vec3[] = [
  [0.40, 0.38, 0.34], [0.46, 0.43, 0.38], [0.35, 0.34, 0.33], [0.44, 0.38, 0.32],
];

function pushTri(pos: number[], nrm: number[], mid: number[], a: Vec3, b: Vec3, c: Vec3, m: number) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  for (const p of [a, b, c]) {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    mid.push(m);
  }
}

function cone(pos: number[], nrm: number[], mid: number[], sides: number, radius: number, height: number, baseY: number, m: number) {
  const apex: Vec3 = [0, baseY + height, 0];
  const base: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    base.push([Math.cos(a) * radius, baseY, Math.sin(a) * radius]);
  }
  for (let i = 0; i < sides; i++) {
    const b0 = base[i], b1 = base[(i + 1) % sides];
    pushTri(pos, nrm, mid, apex, b0, b1, m);
  }
}

function box(pos: number[], nrm: number[], mid: number[], hx: number, hy: number, hz: number, baseY: number, m: number) {
  const y0 = baseY, y1 = baseY + hy * 2;
  const c: Vec3[] = [
    [-hx, y0, -hz], [hx, y0, -hz], [hx, y0, hz], [-hx, y0, hz],
    [-hx, y1, -hz], [hx, y1, -hz], [hx, y1, hz], [-hx, y1, hz],
  ];
  const quad = (a: Vec3, b: Vec3, cc: Vec3, d: Vec3) => {
    pushTri(pos, nrm, mid, a, b, cc, m);
    pushTri(pos, nrm, mid, a, cc, d, m);
  };
  quad(c[0], c[1], c[5], c[4]);
  quad(c[1], c[2], c[6], c[5]);
  quad(c[2], c[3], c[7], c[6]);
  quad(c[3], c[0], c[4], c[7]);
  quad(c[4], c[5], c[6], c[7]);
}

// Октаэдр (8 треугольников) как дешёвый "шар" для лиственной кроны —
// ellipsoid через масштаб по осям вместо честной сферы.
function blob(pos: number[], nrm: number[], mid: number[], cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, m: number) {
  const top: Vec3 = [cx, cy + ry, cz], bottom: Vec3 = [cx, cy - ry, cz];
  const ring: Vec3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ring.push([cx + Math.cos(a) * rx, cy, cz + Math.sin(a) * rz]);
  }
  for (let i = 0; i < 4; i++) {
    const r0 = ring[i], r1 = ring[(i + 1) % 4];
    pushTri(pos, nrm, mid, top, r0, r1, m);
    pushTri(pos, nrm, mid, bottom, r1, r0, m);
  }
}

const TRUNK_HALF = 0.09;

// Ель/сосна: ствол + четыре сужающихся яруса конуса кроны (было три —
// пользователь явно попросил больше детализации ценой FPS, лишний ярус
// заметно обогащает силуэт хвойного дерева).
export function buildConiferMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  box(positions, normals, materialIds, TRUNK_HALF, 0.5, TRUNK_HALF, 0, 0);
  cone(positions, normals, materialIds, 7, 0.85, 0.85, 0.4, 1);
  cone(positions, normals, materialIds, 7, 0.66, 0.72, 0.92, 1);
  cone(positions, normals, materialIds, 7, 0.48, 0.62, 1.42, 1);
  cone(positions, normals, materialIds, 6, 0.28, 0.55, 1.88, 1);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// Лиственное дерево: ствол + пять перекрывающихся "шаров"-октаэдров кроны
// (было три) — гуще и не так очевидно "три шарика на палке".
export function buildBroadleafMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  box(positions, normals, materialIds, TRUNK_HALF, 0.55, TRUNK_HALF, 0, 0);
  blob(positions, normals, materialIds, 0, 1.4, 0, 0.6, 0.56, 0.6, 1);
  blob(positions, normals, materialIds, 0.44, 1.2, 0.12, 0.4, 0.38, 0.4, 1);
  blob(positions, normals, materialIds, -0.4, 1.24, -0.3, 0.38, 0.36, 0.38, 1);
  blob(positions, normals, materialIds, 0.1, 1.1, -0.42, 0.34, 0.32, 0.34, 1);
  blob(positions, normals, materialIds, -0.14, 1.62, 0.18, 0.32, 0.3, 0.32, 1);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// Берёза: узнаваемо бледный ствол (materialId=2 — свой цвет в шейдере, не
// тонируется палитрой инстанса) + компактная светлая крона из блобов, чуть
// смещённых вбок от ствола, как в прототипе (treeBirch).
export function buildBirchMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  box(positions, normals, materialIds, 0.07, 0.62, 0.07, 0, 2);
  blob(positions, normals, materialIds, 0, 1.42, 0, 0.42, 0.44, 0.42, 1);
  blob(positions, normals, materialIds, 0.24, 1.2, 0.18, 0.3, 0.3, 0.3, 1);
  blob(positions, normals, materialIds, -0.22, 1.16, -0.16, 0.28, 0.28, 0.28, 1);
  blob(positions, normals, materialIds, 0.1, 1.0, -0.24, 0.26, 0.24, 0.26, 1);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// Сухостой: голый ствол + три тонких обломанных сучка под разными углами,
// без кроны вообще — тот же приём, что и treeDead в прототипе, чисто для
// разнообразия силуэта леса (не всё живое и пышное).
export function buildDeadTreeMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  box(positions, normals, materialIds, 0.075, 0.8, 0.075, 0, 0);
  const branch = (angle: number, tilt: number, y: number, len: number) => {
    const dx = Math.cos(angle) * Math.cos(tilt), dz = Math.sin(angle) * Math.cos(tilt), dy = Math.sin(tilt);
    const a: Vec3 = [0, y, 0];
    const b: Vec3 = [dx * len, y + dy * len, dz * len];
    const perp: Vec3 = [-dz, 0, dx];
    const w = 0.035;
    pushTri(positions, normals, materialIds,
      [a[0] + perp[0] * w, a[1], a[2] + perp[2] * w],
      [a[0] - perp[0] * w, a[1], a[2] - perp[2] * w],
      b, 0);
  };
  branch(0.4, 0.5, 1.1, 0.55);
  branch(2.6, 0.35, 1.4, 0.48);
  branch(4.4, 0.6, 1.65, 0.4);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// Пучок травы: три тонких плоских "лезвия" (по одному треугольнику) веером
// из общей точки — тот же приём, что и grassTuft() в прототипе. Декор-
// пайплайн не задаёт cullMode (см. renderer.ts) — обе стороны лезвия видны
// без доп. геометрии.
export function buildGrassMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const dx = Math.cos(a) * 0.12, dz = Math.sin(a) * 0.12;
    const tip: Vec3 = [dx * 0.35, 0.42 + i * 0.05, dz * 0.35];
    pushTri(positions, normals, materialIds, [-dx, 0, -dz], [dx, 0, dz], tip, 1);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// ---- камень: гранёный валун вместо куба -----------------------------
// Октаэдр, подразбитый один раз (8 -> 32 треугольника) и вытянутый по
// радиусу в каждой вершине — деталей заметно больше, чем у прежнего "куба
// со сдвинутыми углами" (пользователь справедливо указал, что тот
// выглядел как куб и есть). Подразбиение неиндексированное (как и весь
// декор), но общая вершина между соседними гранями считается ОДНОЙ и той
// же формулой из одних и тех же входных точек — плавающая точка даёт
// побитово одинаковый результат, трещин на стыке граней не возникает даже
// без индексации.
function normVec(v: Vec3): Vec3 { return norm(v); }
function midNorm(a: Vec3, b: Vec3): Vec3 { return normVec([a[0] + b[0], a[1] + b[1], a[2] + b[2]]); }
// Простой детерминированный хеш вершины (по её направлению на единичной
// сфере) — держит один и тот же случайный "выступ" радиуса на каждой из
// повторных копий одной вершины (шов между гранями), а не независимый шум
// на каждую копию (иначе была бы дыра/трещина в мешe).
function hashDir(v: Vec3): number {
  const h = Math.sin(v[0] * 12.9898 + v[1] * 78.233 + v[2] * 37.719) * 43758.5453;
  return h - Math.floor(h);
}
export function buildRockMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  const PX: Vec3 = [1, 0, 0], NX: Vec3 = [-1, 0, 0], PY: Vec3 = [0, 1, 0], NY: Vec3 = [0, -1, 0], PZ: Vec3 = [0, 0, 1], NZ: Vec3 = [0, 0, -1];
  const faces: [Vec3, Vec3, Vec3][] = [
    [PX, PY, PZ], [PZ, PY, NX], [NX, PY, NZ], [NZ, PY, PX],
    [PX, PZ, NY], [PZ, NX, NY], [NX, NZ, NY], [NZ, PX, NY],
  ];
  const RY = 0.34 / 0.5; // приплюснутый по Y валун, те же пропорции, что и у прежнего куба
  const CENTER_Y = 0.5 * RY; // сфера центрирована в (0,0,0) — поднимаем, чтобы низ лежал на y=0 (на земле), а не наполовину под ней
  const jitterR = (v: Vec3): Vec3 => {
    const r = 0.5 * (0.82 + hashDir(v) * 0.42); // 0.82..1.24 от базового радиуса
    return [v[0] * r, v[1] * r * RY + CENTER_Y, v[2] * r];
  };
  for (const [a, b, c] of faces) {
    const mab = midNorm(a, b), mbc = midNorm(b, c), mca = midNorm(c, a);
    const A = jitterR(a), B = jitterR(b), C = jitterR(c);
    const Mab = jitterR(mab), Mbc = jitterR(mbc), Mca = jitterR(mca);
    pushTri(positions, normals, materialIds, A, Mab, Mca, 1);
    pushTri(positions, normals, materialIds, Mab, B, Mbc, 1);
    pushTri(positions, normals, materialIds, Mca, Mbc, C, 1);
    pushTri(positions, normals, materialIds, Mab, Mbc, Mca, 1);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}
