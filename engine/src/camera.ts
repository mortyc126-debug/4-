/* =========================================================================
   Орбитальная камера с управлением: перетаскивание (мышь/один палец) —
   вращение вокруг цели, колесо/щипок двумя пальцами — масштаб. Панорама
   (сдвиг cam.target по плоскости земли) — жест сдвига двумя пальцами
   (составляющая движения помимо изменения расстояния между пальцами, т.е.
   можно одновременно щипать и панорамировать) плюс WASD/стрелки для отладки
   с клавиатуры на десктопе. Нужна теперь, когда мир не заканчивается на
   границе одного острова (см. main.ts — потоковая подгрузка рельефа) —
   раньше цель камеры была неподвижной точкой демо-сцены. Автооблёт из
   прошлого шага остаётся, но останавливается, как только игрок хоть раз
   тронул экран/клавиатуру, и не включается заново.
   ========================================================================= */

export interface OrbitCamera {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
}

// dx/dz — единичное направление на плоскости экрана ("вправо"/"вперёд по
// экрану"), не мировые оси — panByScreenDelta ниже сама поворачивает их по
// текущему yaw камеры.
const PAN_KEYS: Record<string, [number, number]> = {
  w: [0, -1], arrowup: [0, -1],
  s: [0, 1], arrowdown: [0, 1],
  a: [-1, 0], arrowleft: [-1, 0],
  d: [1, 0], arrowright: [1, 0],
};
const KEY_PAN_SPEED = 900; // «экранных пикселей» в секунду — тот же порядок, что и скорость жеста пальцем
// Раньше было 160 — с реального устройства пришёл скриншот с гигантской
// чёрной пустотой у горизонта: при typical pitch чем дальше камера (dist),
// тем дальше от цели луч в верхний край экрана бьёт в землю (пропорционально
// dist), а рельеф стримится (см. main.ts) лишь на ограниченный радиус вокруг
// цели. 100 — верхняя практическая граница вместе с дальним грубым кольцом
// рельефа (см. main.ts, FAR_*): без него даже дефолтный зум был на грани.
const MAX_DIST = 100;

export function attachOrbitControls(canvas: HTMLCanvasElement, cam: OrbitCamera) {
  let autoOrbit = true;
  let dragging = false;
  let lastX = 0, lastY = 0;
  const pts = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0, pinchStartCamDist = 0;
  let pinchMid: { x: number; y: number } | null = null;

  function stopAuto() {
    autoOrbit = false;
  }

  // Сдвигает cam.target по плоскости земли вдоль ЭКРАННЫХ осей текущего
  // вида (право/вперёд камеры на плоскости XZ), не в мировых X/Z напрямую —
  // иначе при повороте камеры (yaw) жест «вправо» перестаёт соответствовать
  // видимому «вправо» на экране. Масштаб — от cam.dist: чем дальше камера
  // отдалена, тем быстрее должен идти сдвиг, чтобы жест ощущался одинаково
  // на любом зуме (тот же приём, что и в zoomAt() старого 2D-рендера).
  function panByScreenDelta(dx: number, dy: number) {
    if (dx === 0 && dy === 0) return;
    stopAuto();
    const scale = cam.dist * 0.0018;
    const rightX = Math.cos(cam.yaw), rightZ = -Math.sin(cam.yaw);
    const fwdX = -Math.sin(cam.yaw), fwdZ = -Math.cos(cam.yaw);
    cam.target[0] += (-rightX * dx - fwdX * dy) * scale;
    cam.target[2] += (-rightZ * dx - fwdZ * dy) * scale;
  }

  canvas.addEventListener("pointerdown", (e) => {
    stopAuto();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // Редкий случай (или синтетическое событие в тестах) — без захвата
      // жест всё ещё работает через обычные слушатели, но состояние
      // вращения/щипка/панорамы ниже не должно остаться неинициализированным
      // из-за брошенного исключения (иначе pinchStartDist/pinchStartCamDist
      // остаются нулями, и следующий pointermove с pts.size>=2 обнуляет
      // cam.dist до минимума — настоящий баг, не только тестовый артефакт).
    }
    if (pts.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (pts.size === 2) {
      dragging = false;
      const [a, b] = [...pts.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartCamDist = cam.dist;
      pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.dist = Math.max(8, Math.min(MAX_DIST, pinchStartCamDist * (pinchStartDist / Math.max(12, d))));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinchMid) panByScreenDelta(mid.x - pinchMid.x, mid.y - pinchMid.y);
      pinchMid = mid;
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    cam.yaw -= dx * 0.006;
    cam.pitch = Math.max(0.12, Math.min(1.4, cam.pitch + dy * 0.006));
  });

  function release(e: PointerEvent) {
    pts.delete(e.pointerId);
    dragging = pts.size === 1;
    if (pts.size < 2) pinchMid = null;
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stopAuto();
      cam.dist = Math.max(8, Math.min(MAX_DIST, cam.dist * (e.deltaY < 0 ? 0.9 : 1.11)));
    },
    { passive: false }
  );

  // Клавиатура — отладка на десктопе (на телефоне панорама жестом выше).
  // Набор зажатых клавиш, сдвиг применяется ежекадрово через update() (см.
  // main.ts draw()), а не по одному событию keydown — иначе зажатая клавиша
  // не даёт плавного непрерывного движения.
  const heldKeys = new Set<string>();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k in PAN_KEYS) {
      heldKeys.add(k);
      stopAuto();
    }
  });
  window.addEventListener("keyup", (e) => {
    heldKeys.delete(e.key.toLowerCase());
  });
  let lastUpdateMs: number | null = null;
  function update(nowMs: number) {
    if (lastUpdateMs === null) {
      lastUpdateMs = nowMs;
      return;
    }
    const dt = Math.min(0.1, (nowMs - lastUpdateMs) / 1000);
    lastUpdateMs = nowMs;
    if (heldKeys.size === 0) return;
    let dx = 0, dy = 0;
    for (const k of heldKeys) {
      const [kx, ky] = PAN_KEYS[k];
      dx += kx;
      dy += ky;
    }
    if (dx === 0 && dy === 0) return;
    panByScreenDelta(dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt);
  }

  return {
    isAutoOrbiting: () => autoOrbit,
    stopAuto,
    update,
  };
}
