/* =========================================================================
   Камера — управление перенесено дословно из прошлого прототипа
   (obyom-3d-infinite.html, см. блок "Камера: орбита вокруг подвижной цели"):
   один палец двигает саму ЦЕЛЬ по земле — как обычная карта, к этому все
   привыкли; поворот, наклон и масштаб отданы двум пальцам разом (щипок —
   масштаб, разворот пальцев друг вокруг друга — поворот, совместное
   движение вверх/вниз — наклон), чтобы случайное лёгкое дрожание одного
   пальца при обычном перемещении не дёргало угол обзора. Прежняя схема
   этого движка (один палец — вращение, два — зум+панорама) была первым
   черновым приближением и ощущалась хуже старой — заменена полностью, а
   не дополнена.

   Единственное намеренное отличие от оригинала — верхняя граница зума
   (MAX_DIST): там было 240, здесь меньше — калибровано под потоковую
   подгрузку рельефа этого движка (см. main.ts, FAR_*), которая, в отличие
   от старого рендера, не тянет детальную/грубую сетку сколь угодно далеко;
   реальный скриншот с чёрной пустотой у горизонта на 240 показал бы её
   снова. Автооблёт (idle-вращение, пока никто не тронул экран) — тоже
   местное дополнение этого движка, в оригинале его не было; останавливается
   тем же способом (stopAuto), что и в остальных жестах.
   ========================================================================= */
import { heightAt, HMAX, WORLD_HALF_X, WORLD_HALF_Z } from "./terrain";

export interface OrbitCamera {
  yaw: number;
  pitch: number;
  dist: number;
  target: [number, number, number];
}

const MIN_DIST = 9;
// Было 240 (как в оригинале) — с реального устройства пришёл скриншот с
// гигантской чёрной пустотой у горизонта: при типичном pitch чем дальше
// камера (dist), тем дальше от цели луч в верхний край экрана бьёт в землю
// (пропорционально dist), а рельеф стримится (см. main.ts) лишь на
// ограниченный радиус вокруг цели — тогда снизили до 100, впритык под тогдашний
// радиус дальнего кольца.
//
// Автор с реального устройства (уже на настоящем рельефе, не процедурном):
// просит отдалить камеру сильнее — быстрее перемещаться по (теперь намного
// большему) миру и охватывать взглядом рельеф/окружение целиком, не только
// вблизи. Панорама уже масштабируется от dist (см. panTargetBy — k=dist*
// 0.0022), так что простое увеличение потолка само по себе ускоряет
// перемещение. 140 — не обратно к 240 (та планка ни разу не проверялась
// вместе с дальним кольцом) и не максимум, который вообще можно было бы
// выжать: та же самая просьба этой сессии, буквально абзацем раньше по
// хронологии, — "проверь карту на зависание, важно быстродействие". Больше
// dist means больше рендерится дальних (пусть и грубых) чанков каждый
// кадр — намеренно взят умеренный шаг (было 100, +40%), а не сразу
// удвоение, пока нет обратной связи с устройства, что нынешний прирост не
// просадил кадры. FAR_LOAD_RADIUS/FAR_UNLOAD_RADIUS в main.ts подняты
// пропорционально (см. её комментарий) — видимая на этом dist земля
// остаётся внутри того, что реально загружено и отрисовано, не оставляя
// новой чёрной пустоты по тем же причинам, что и раньше.
const MAX_DIST = 140;
const TAP_MOVE = 10; // px — сдвиг пальца больше этого расстояния значит "это уже не тап, а жест"
const TAP_TIME = 380; // ms — дольше этого значит "это уже не тап, а долгое удержание"

// dx/dy — единичное направление на плоскости экрана, тот же смысл, что и
// (e.clientX-drag.x)/(drag.y-e.clientY) у панорамы одним пальцем ниже —
// клавиатура (отладка на десктопе, оригинал её не знал) просто эмулирует
// тот же жест поэлементно, а не отдельную формулу.
const PAN_KEYS: Record<string, [number, number]> = {
  d: [1, 0], arrowright: [1, 0],
  a: [-1, 0], arrowleft: [-1, 0],
  w: [0, 1], arrowup: [0, 1],
  s: [0, -1], arrowdown: [0, -1],
};
const KEY_PAN_SPEED = 700; // «экранных пикселей» в секунду — тот же порядок, что и скорость жеста пальцем

export function attachOrbitControls(canvas: HTMLCanvasElement, cam: OrbitCamera) {
  let autoOrbit = true;
  const pts = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; tx: number; tz: number } | null = null;
  let pinch: { d: number; y: number; dist: number; yaw: number; pitch: number; angle: number } | null = null;
  let tapCand: { x: number; y: number; t: number } | null = null;
  let onTap: ((clientX: number, clientY: number) => void) | null = null;
  // Зовётся ТОЛЬКО из настоящих жестов ниже (pointerdown/wheel/keydown) —
  // никогда программно — поэтому main.ts вешает сюда сброс режима слежения
  // за походом (startFollowMarch): "пока не прервёшь" из запроса пользователя
  // и есть "прервёшь" = тронул камеру руками, тот же сигнал, что уже
  // останавливает автооблёт.
  let onInteract: (() => void) | null = null;

  function stopAuto() {
    autoOrbit = false;
    onInteract?.();
  }

  function mid(): { x: number; y: number; d: number } {
    const a = [...pts.values()];
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) };
  }
  function twistAngle(): number {
    const a = [...pts.values()];
    return Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x);
  }

  // Сдвигает cam.target по плоскости земли на dxScreen/dyScreen "экранных"
  // единиц (dyScreen>0 — тот же смысл, что "потянул вверх по экрану"),
  // масштаб — от cam.dist (дальше камера — быстрее сдвиг, жест ощущается
  // одинаково на любом зуме), поворот — на текущий yaw (иначе при
  // развёрнутой камере "вправо" на экране перестаёт быть "вправо" в мире).
  // Дословно формула из прошлого прототипа. Высота цели (target[1])
  // подтягивается под рельеф под ней в конце — камера не проваливается и
  // не зависает в воздухе при переезде через холм/впадину.
  function panTargetBy(dxScreen: number, dyScreen: number) {
    const k = cam.dist * 0.0022;
    const dx = dxScreen * k, dy = dyScreen * k;
    const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    // Автор: «мир ограниченный... придётся добавить ограничения, чтобы не
    // улетать дальше». Клэмп тут, а не только океаном по краю (см.
    // terrain.ts) — сам по себе океан не блокирует панораму, камера всё
    // равно может уйти в пустоту, где рельеф дальше не подгружен ни в одном
    // чанке (см. main.ts). Мир теперь прямоугольный (реальная область шире
    // по долготе, чем по широте, см. terrain.ts) — свой предел на каждую ось.
    cam.target[0] = Math.max(-WORLD_HALF_X, Math.min(WORLD_HALF_X, cam.target[0] - (dx * c - dy * s)));
    cam.target[2] = Math.max(-WORLD_HALF_Z, Math.min(WORLD_HALF_Z, cam.target[2] + (dx * s + dy * c)));
    cam.target[1] = heightAt(cam.target[0], cam.target[2]) * HMAX + 1;
  }

  canvas.addEventListener("pointerdown", (e) => {
    // Без этого браузер на телефоне забирает бо́льшую часть жеста себе
    // (нативный скролл/панорама страницы) ещё до того, как движение дойдёт
    // до pointermove — на практике это выглядело как "моё движение пальцем
    // превращается в миллиметр сдвига камеры". touch-action:none у канвы
    // (см. index.html) решает то же самое на уровне CSS — вместе надёжнее
    // одного способа, тот же приём, что и в прошлом прототипе (там оба
    // обработчика тоже звали preventDefault()).
    e.preventDefault();
    stopAuto();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      // Редкий случай (или синтетическое событие в тестах) — без захвата
      // жест всё ещё работает через обычные слушатели, но состояние
      // панорамы/щипка ниже не должно остаться неинициализированным из-за
      // брошенного исключения (иначе следующий pointermove мог бы обнулить
      // cam.dist или дёрнуть камеру от несуществующего состояния).
    }
    if (pts.size === 1) {
      drag = { x: e.clientX, y: e.clientY, tx: cam.target[0], tz: cam.target[2] };
      tapCand = { x: e.clientX, y: e.clientY, t: performance.now() };
    } else if (pts.size === 2) {
      drag = null;
      tapCand = null;
      const m = mid();
      pinch = { d: m.d, y: m.y, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch, angle: twistAngle() };
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    e.preventDefault();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (tapCand && Math.hypot(e.clientX - tapCand.x, e.clientY - tapCand.y) > TAP_MOVE) tapCand = null;
    if (pts.size >= 2 && pinch) {
      const m = mid();
      cam.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, pinch.dist * (pinch.d / Math.max(12, m.d))));
      cam.yaw = pinch.yaw + (twistAngle() - pinch.angle);
      cam.pitch = Math.max(0.08, Math.min(1.42, pinch.pitch + (m.y - pinch.y) * 0.005));
      return;
    }
    if (!drag) return;
    // Не инкрементально (не от предыдущего move) — от ЗАФИКСИРОВАННОЙ на
    // pointerdown/предыдущей смене числа пальцев точки старта (drag.x/y/tx/
    // tz), тот же приём, что и в оригинале: не накапливает ошибку округления
    // за долгий жест, и поведение не зависит от частоты pointermove-событий.
    // panTargetBy сдвигает ОТ ТЕКУЩЕГО target — откатываем target к точке
    // старта drag перед вызовом, тогда результат совпадает с формулой
    // оригинала (target = drag-точка ± полный накопленный сдвиг пальца).
    cam.target[0] = drag.tx;
    cam.target[2] = drag.tz;
    panTargetBy(e.clientX - drag.x, drag.y - e.clientY);
  });

  function lift(e: PointerEvent) {
    if (tapCand && pts.size === 1 && performance.now() - tapCand.t < TAP_TIME) {
      onTap?.(tapCand.x, tapCand.y);
    }
    tapCand = null;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) {
      drag = null;
    } else if (pts.size === 1) {
      const a = [...pts.values()][0];
      drag = { x: a.x, y: a.y, tx: cam.target[0], tz: cam.target[2] };
    }
  }
  canvas.addEventListener("pointerup", lift);
  canvas.addEventListener("pointercancel", lift);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stopAuto();
      cam.dist = Math.max(MIN_DIST, Math.min(MAX_DIST, cam.dist * (e.deltaY < 0 ? 0.9 : 1.11)));
    },
    { passive: false }
  );

  // Клавиатура — отладка на десктопе (на телефоне панорама пальцем выше;
  // в оригинале этого не было). Набор зажатых клавиш, сдвиг применяется
  // ежекадрово через update() (см. main.ts draw()), а не по одному событию
  // keydown — иначе зажатая клавиша не даёт плавного непрерывного движения.
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
    if (heldKeys.size === 0 || drag) return; // палец на экране — приоритет у него, не мешаем клавиатурой
    let dx = 0, dy = 0;
    for (const k of heldKeys) {
      const [kx, ky] = PAN_KEYS[k];
      dx += kx;
      dy += ky;
    }
    if (dx === 0 && dy === 0) return;
    panTargetBy(dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt);
  }

  return {
    isAutoOrbiting: () => autoOrbit,
    stopAuto,
    update,
    // Тап — короткое (< TAP_TIME) касание одним пальцем, почти без сдвига
    // (< TAP_MOVE): main.ts вешает сюда выбор сущности под пальцем вместо
    // родного "click" — родной click не всегда надёжно отличает тап от
    // только что случившейся панорамы тем же пальцем (тот же приём, что и
    // tryTap()/lift() в прошлом прототипе).
    onTap(fn: (clientX: number, clientY: number) => void) {
      onTap = fn;
    },
    onInteract(fn: () => void) {
      onInteract = fn;
    },
  };
}
