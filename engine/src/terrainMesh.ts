/* =========================================================================
   Меш рельефа: обычная (не инстансированная) решётка треугольников —
   вторая техника рендера после маркеров, показывает, что пайплайн не
   завязан на один-единственный приём. Вода — отдельная плоская подложка
   на уровне SEA (не следует сырой высоте, как и в живой игре), суша —
   вершины приподняты по heightAt(x,y)*HMAX. Простое плоское затенение
   по нормали треугольника и направлению "солнца" — то же SUN, что и в
   obyom-3d-infinite.html, чтобы рельеф не выглядел плоским мультяшным
   пятном.
   ========================================================================= */
import { heightAt, isWater, groundColor, waterColor, SEA, HMAX } from "./terrain";
import { cross, norm, sub, type Vec3 } from "./mat4";

export interface MeshData {
  positions: Float32Array;
  colors: Float32Array;
  vertexCount: number;
}

const SUN: Vec3 = norm([0.62, 0.38, 0.3]);

function shade(color: [number, number, number], normal: Vec3): [number, number, number] {
  const d = Math.max(0.35, normal[0] * SUN[0] + normal[1] * SUN[1] + normal[2] * SUN[2]);
  return [color[0] * d, color[1] * d, color[2] * d];
}

export function buildTerrainPatch(x0: number, y0: number, x1: number, y1: number, step = 1): MeshData {
  const cols = Math.round((x1 - x0) / step);
  const rows = Math.round((y1 - y0) / step);
  const positions: number[] = [];
  const colors: number[] = [];

  function vertexAt(x: number, y: number): { p: Vec3; c: [number, number, number]; water: boolean } {
    const e = heightAt(x, y);
    const water = e < SEA;
    const p: Vec3 = water ? [x, SEA * HMAX, y] : [x, e * HMAX, y];
    const c = water ? waterColor((SEA - e) * 3) : groundColor(e);
    return { p, c, water };
  }

  function pushTri(a: { p: Vec3; c: [number, number, number] }, b: { p: Vec3; c: [number, number, number] }, c: { p: Vec3; c: [number, number, number] }) {
    const n = norm(cross(sub(b.p, a.p), sub(c.p, a.p)));
    for (const v of [a, b, c]) {
      const shaded = shade(v.c, n);
      positions.push(v.p[0], v.p[1], v.p[2]);
      colors.push(shaded[0], shaded[1], shaded[2]);
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = x0 + i * step, y = y0 + j * step;
      const v00 = vertexAt(x, y);
      const v10 = vertexAt(x + step, y);
      const v01 = vertexAt(x, y + step);
      const v11 = vertexAt(x + step, y + step);
      pushTri(v00, v10, v11);
      pushTri(v00, v11, v01);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    vertexCount: positions.length / 3,
  };
}

export { isWater };
