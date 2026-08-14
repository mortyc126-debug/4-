/* =========================================================================
   Декоративные пропсы (деревья/камни) — процедурная низкополигональная
   геометрия, как и весь остальной мир (см. terrain.ts): никаких новых
   .glb-файлов, просто пара треугольных примитивов, собранных один раз при
   старте (см. renderer.ts — общий локальный меш, инстансированный, как
   пин-маркеры). Цвет запечён В МЕШЕ по вершинам (не приходит из инстанса,
   в отличие от маркеров) — крона/ствол/камень должны быть разного цвета
   внутри ОДНОГО инстанса, а не одного сплошного тона.
   ========================================================================= */
import { cross, sub, norm, type Vec3 } from "./mat4";

export interface DecorMesh {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  vertexCount: number;
}

function pushTri(pos: number[], nrm: number[], col: number[], a: Vec3, b: Vec3, c: Vec3, color: Vec3) {
  const n = norm(cross(sub(b, a), sub(c, a)));
  for (const p of [a, b, c]) {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    col.push(color[0], color[1], color[2]);
  }
}

function cone(pos: number[], nrm: number[], col: number[], sides: number, radius: number, height: number, baseY: number, color: Vec3) {
  const apex: Vec3 = [0, baseY + height, 0];
  const base: Vec3[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    base.push([Math.cos(a) * radius, baseY, Math.sin(a) * radius]);
  }
  for (let i = 0; i < sides; i++) {
    const b0 = base[i], b1 = base[(i + 1) % sides];
    pushTri(pos, nrm, col, apex, b0, b1, color);
  }
  const center: Vec3 = [0, baseY, 0];
  for (let i = 0; i < sides; i++) {
    const b0 = base[i], b1 = base[(i + 1) % sides];
    pushTri(pos, nrm, col, center, b1, b0, color); // обратная навивка — низ смотрит вниз
  }
}

function box(pos: number[], nrm: number[], col: number[], hx: number, hy: number, hz: number, baseY: number, color: Vec3) {
  const y0 = baseY, y1 = baseY + hy * 2;
  const c: Vec3[] = [
    [-hx, y0, -hz], [hx, y0, -hz], [hx, y0, hz], [-hx, y0, hz],
    [-hx, y1, -hz], [hx, y1, -hz], [hx, y1, hz], [-hx, y1, hz],
  ];
  const quad = (a: Vec3, b: Vec3, cc: Vec3, d: Vec3) => {
    pushTri(pos, nrm, col, a, b, cc, color);
    pushTri(pos, nrm, col, a, cc, d, color);
  };
  quad(c[0], c[1], c[5], c[4]); // -z
  quad(c[1], c[2], c[6], c[5]); // +x
  quad(c[2], c[3], c[7], c[6]); // +z
  quad(c[3], c[0], c[4], c[7]); // -x
  quad(c[4], c[5], c[6], c[7]); // +y
}

// Ель: тонкий бурый ствол + широкий тёмно-зелёный конус кроны. Простая
// низкополигональная форма (6-гранный конус), а не что-то более сложное —
// декор фоновый, крупных деталей вблизи не разглядеть, и таких инстансов
// на сцене может быть много разом (см. плотность в main.ts).
const TRUNK_COLOR: Vec3 = [0.35, 0.26, 0.17];
const CANOPY_COLOR: Vec3 = [0.22, 0.36, 0.17];
export function buildTreeMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  box(positions, normals, colors, 0.09, 0.5, 0.09, 0, TRUNK_COLOR);
  cone(positions, normals, colors, 6, 0.85, 1.9, 0.55, CANOPY_COLOR);
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), vertexCount: positions.length / 3 };
}

// Камень: куб с прыгающими по фиксированной (не случайной на лету — детерминизм
// меша) таблице смещений углами — не идеальный кубик, но и не полноценный
// procедурный блоб: дешёвая неровность формы почти бесплатно.
const ROCK_COLOR: Vec3 = [0.4, 0.38, 0.34];
const ROCK_JITTER: Vec3[] = [
  [-0.05, 0.02, 0.04], [0.06, -0.03, -0.02], [0.03, 0.04, 0.06], [-0.04, -0.02, -0.05],
  [0.05, 0.06, -0.03], [-0.06, 0.03, 0.02], [-0.02, -0.04, 0.05], [0.04, 0.05, -0.04],
];
export function buildRockMesh(): DecorMesh {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [];
  const hx = 0.5, hy = 0.34, hz = 0.5;
  const base: Vec3[] = [
    [-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz],
    [-hx, hy * 2, -hz], [hx, hy * 2, -hz], [hx, hy * 2, hz], [-hx, hy * 2, hz],
  ];
  const c: Vec3[] = base.map((p, i) => [p[0] + ROCK_JITTER[i][0], p[1] + ROCK_JITTER[i][1], p[2] + ROCK_JITTER[i][2]]);
  const quad = (a: Vec3, b: Vec3, cc: Vec3, d: Vec3) => {
    pushTri(positions, normals, colors, a, b, cc, ROCK_COLOR);
    pushTri(positions, normals, colors, a, cc, d, ROCK_COLOR);
  };
  quad(c[0], c[1], c[5], c[4]);
  quad(c[1], c[2], c[6], c[5]);
  quad(c[2], c[3], c[7], c[6]);
  quad(c[3], c[0], c[4], c[7]);
  quad(c[4], c[5], c[6], c[7]);
  quad(c[3], c[2], c[1], c[0]); // низ — почти всегда в земле, но чтобы не было дырки на склоне
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), vertexCount: positions.length / 3 };
}
