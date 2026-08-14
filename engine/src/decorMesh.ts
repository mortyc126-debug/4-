/* =========================================================================
   Декоративные пропсы (деревья/камни) — процедурная низкополигональная
   геометрия, как и весь остальной мир (см. terrain.ts). Портирована сама
   ИДЕЯ разнообразия из старого прототипа (obyom-3d-infinite.html —
   treeSpruce/treePine/treeBroad/treeBirch + палитры PINE/LEAF), не
   дословный код: там цвет кроны запекался на CPU в геометрию каждого
   отдельного дерева (тясячи уникальных мешей на статичный остров), тут
   цвет — атрибут ИНСТАНСА (см. renderer.ts/DECOR_SHADER), а геометрия — две
   переиспользуемые формы (хвойная/лиственная), потому что рельеф теперь
   бесконечный и стримится чанками: разную геометрию на каждый инстанс себе
   не позволить, а разный цвет на каждый инстанс — GPU-инстансинг именно для
   этого и существует.

   materialId у каждой вершины (0=ствол, 1=крона) — не цвет: ствол всегда
   один и тот же бурый (см. TRUNK_COLOR в DECOR_SHADER), крона красится
   цветом инстанса, выбранным на CPU из палитры PINE (хвоя) или LEAF
   (лиственная — от оливкового до жёлто-оранжевого, тот самый "разнообразный"
   осенний тон со скриншотов старого прототипа).
   ========================================================================= */
import { cross, sub, norm, type Vec3 } from "./mat4";

export interface DecorMesh {
  positions: Float32Array;
  normals: Float32Array;
  materialIds: Float32Array;
  vertexCount: number;
}

// Прямой перенос палитр из obyom-3d-infinite.html (PINE/LEAF): хвоя —
// приглушённые тёмно-зелёные тона, лиственная крона — от оливкового до
// тёплого золотисто-оранжевого. Само разнообразие ВНУТРИ палитры (не один
// зафиксированный оттенок на весь тип дерева) — то, чего не хватало первой
// версии декора.
export const PINE: Vec3[] = [
  [0.13, 0.22, 0.14], [0.17, 0.28, 0.16], [0.11, 0.19, 0.13],
  [0.20, 0.31, 0.19], [0.15, 0.26, 0.20], [0.22, 0.30, 0.14],
];
export const LEAF: Vec3[] = [
  [0.28, 0.34, 0.15], [0.36, 0.39, 0.18], [0.23, 0.30, 0.14],
  [0.42, 0.36, 0.14], [0.31, 0.27, 0.12], [0.34, 0.41, 0.20], [0.45, 0.40, 0.17],
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
// ellipsoid через масштаб по осям вместо честной сферы (см. treeBroad в
// старом прототипе — там та же роль у их ball()).
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

// Ель/сосна: ствол + три сужающихся яруса конуса кроны (вместо одного
// конуса — заметно более узнаваемый хвойный силуэт, тот же приём, что и
// treeSpruce/treePine в прототипе).
export function buildConiferMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  box(positions, normals, materialIds, TRUNK_HALF, 0.5, TRUNK_HALF, 0, 0);
  cone(positions, normals, materialIds, 6, 0.85, 1.05, 0.45, 1);
  cone(positions, normals, materialIds, 6, 0.62, 0.85, 1.05, 1);
  cone(positions, normals, materialIds, 6, 0.36, 0.65, 1.6, 1);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// Лиственное дерево: ствол + три перекрывающихся "шара"-октаэдра кроны —
// округлый силуэт, контрастный конусам хвойных (см. treeBroad в прототипе).
export function buildBroadleafMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  box(positions, normals, materialIds, TRUNK_HALF, 0.55, TRUNK_HALF, 0, 0);
  blob(positions, normals, materialIds, 0, 1.35, 0, 0.62, 0.55, 0.62, 1);
  blob(positions, normals, materialIds, 0.42, 1.18, 0.1, 0.42, 0.4, 0.42, 1);
  blob(positions, normals, materialIds, -0.36, 1.22, -0.28, 0.4, 0.38, 0.4, 1);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}

// Камень: куб с фиксированными по таблице сдвигами углов (детерминизм
// меша) — цвет теперь тоже приходит из инстанса (см. ROCK_TONES), поэтому
// materialId=1 везде, ствола-эквивалента у камня нет.
const ROCK_JITTER: Vec3[] = [
  [-0.05, 0.02, 0.04], [0.06, -0.03, -0.02], [0.03, 0.04, 0.06], [-0.04, -0.02, -0.05],
  [0.05, 0.06, -0.03], [-0.06, 0.03, 0.02], [-0.02, -0.04, 0.05], [0.04, 0.05, -0.04],
];
export function buildRockMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], materialIds: number[] = [];
  const hx = 0.5, hy = 0.34, hz = 0.5;
  const base: Vec3[] = [
    [-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz],
    [-hx, hy * 2, -hz], [hx, hy * 2, -hz], [hx, hy * 2, hz], [-hx, hy * 2, hz],
  ];
  const c: Vec3[] = base.map((p, i) => [p[0] + ROCK_JITTER[i][0], p[1] + ROCK_JITTER[i][1], p[2] + ROCK_JITTER[i][2]]);
  const quad = (a: Vec3, b: Vec3, cc: Vec3, d: Vec3) => {
    pushTri(positions, normals, materialIds, a, b, cc, 1);
    pushTri(positions, normals, materialIds, a, cc, d, 1);
  };
  quad(c[0], c[1], c[5], c[4]);
  quad(c[1], c[2], c[6], c[5]);
  quad(c[2], c[3], c[7], c[6]);
  quad(c[3], c[0], c[4], c[7]);
  quad(c[4], c[5], c[6], c[7]);
  quad(c[3], c[2], c[1], c[0]);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), materialIds: new Float32Array(materialIds), vertexCount: positions.length / 3 };
}
