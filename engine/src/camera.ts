/* =========================================================================
   Орбитальная камера с управлением: перетаскивание (мышь/один палец) —
   вращение вокруг цели, колесо/щипок двумя пальцами — масштаб. Пока без
   панорамирования цели (это отдельный, более поздний шаг — там, где
   появится настоящий бесконечный мир, как в obyom-3d-infinite.html) —
   сейчас достаточно "покрутить и посмотреть" вокруг фиксированной точки.
   Автооблёт из прошлого шага остаётся, но останавливается, как только
   игрок хоть раз тронул экран, и не включается заново.
   ========================================================================= */

export interface OrbitCamera {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
}

export function attachOrbitControls(canvas: HTMLCanvasElement, cam: OrbitCamera) {
  let autoOrbit = true;
  let dragging = false;
  let lastX = 0, lastY = 0;
  const pts = new Map<number, { x: number; y: number }>();
  let pinchStartDist = 0, pinchStartCamDist = 0;

  function stopAuto() {
    autoOrbit = false;
  }

  canvas.addEventListener("pointerdown", (e) => {
    stopAuto();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pts.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    } else if (pts.size === 2) {
      dragging = false;
      const [a, b] = [...pts.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartCamDist = cam.dist;
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      cam.dist = Math.max(8, Math.min(160, pinchStartCamDist * (pinchStartDist / Math.max(12, d))));
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
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stopAuto();
      cam.dist = Math.max(8, Math.min(160, cam.dist * (e.deltaY < 0 ? 0.9 : 1.11)));
    },
    { passive: false }
  );

  return {
    isAutoOrbiting: () => autoOrbit,
  };
}
