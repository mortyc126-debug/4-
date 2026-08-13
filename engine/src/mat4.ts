/* =========================================================================
   Матрицы 4×4 в столбцовом порядке — дословный порт M4 из
   obyom-3d-infinite.html (та же арифметика, тот же порядок), плюс vec3
   помощники sub/cross/norm/dot оттуда же.
   ========================================================================= */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array; // 16 чисел, столбцовый порядок

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  return o;
}

export function persp(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const t = 1 / Math.tan(fovy / 2);
  return new Float32Array([
    t / aspect, 0, 0, 0,
    0, t, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

// Модельная матрица: масштаб -> поворот по Y (yaw) -> перенос. Урезанный
// вариант M4.modelTilt из obyom-3d-infinite.html без наклона по XZ — тот
// нужен был только для процедурной посадки на негладкий рельеф, здесь
// пока не требуется.
export function modelMatrix(tx: number, ty: number, tz: number, yaw: number, scale: number): Mat4 {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return new Float32Array([
    cy * scale, 0, -sy * scale, 0,
    0, scale, 0, 0,
    sy * scale, 0, cy * scale, 0,
    tx, ty, tz, 1,
  ]);
}

export function look(eye: Vec3, center: Vec3, up: Vec3): Mat4 {
  const z = norm(sub(eye, center));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}
