/* =========================================================================
   Шаг 2 нового движка: настоящий 3D-кадр — не плоская проекция координат
   в клип-спейс (как в шаге 1), а честная перспективная камера над куском
   ТОГО ЖЕ рельефа, что и в живой игре (тот же SEED, см. terrain.ts) —
   остров узнаваем. Маркеры городов/лагерей/точек стоят прямо на рельефе
   (высота берётся из heightAt в их мировой точке) и рисуются настоящим
   инстансингом на одной VP-матрице с рельефом.
   ========================================================================= */
import { createWorld, addEntity, addComponent, query } from "bitecs";
import { createRenderer, type MarkerEntity } from "./renderer";
import { buildTerrainPatch } from "./terrainMesh";
import { heightAt, HMAX } from "./terrain";
import { mul, persp, look, type Vec3 } from "./mat4";
import { attachOrbitControls, type OrbitCamera } from "./camera";

const statusEl = document.getElementById("status") as HTMLDivElement;
function setStatus(lines: string[]) {
  statusEl.textContent = lines.join("\n");
}

async function main() {
  const lines: string[] = [];

  // ---- bitECS: та же горстка сущностей, что и в шаге 1. ----
  const world = createWorld();
  const Position = { x: [] as number[], y: [] as number[] };
  const Kind = { value: [] as number[] }; // 0=city 1=camp 2=node
  const KIND_COLOR: Record<number, [number, number, number]> = {
    0: [0.85, 0.68, 0.29], // город — gilt
    1: [0.63, 0.16, 0.2], // лагерь — garnet
    2: [0.29, 0.55, 0.38], // точка — verdigris
  };
  const seedEntities = [
    { x: 43, y: 14, kind: 0 },
    { x: 50, y: 20, kind: 1 },
    { x: 55, y: 12, kind: 2 },
    { x: 30, y: 30, kind: 2 },
  ];
  for (const e of seedEntities) {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Kind);
    Position.x[eid] = e.x;
    Position.y[eid] = e.y;
    Kind.value[eid] = e.kind;
  }
  const found = Array.from(query(world, [Position, Kind]));
  lines.push(`bitECS: сущностей — ${found.length}`);

  // ---- WebGPU ----
  if (!("gpu" in navigator)) {
    setStatus([...lines, "WebGPU: navigator.gpu отсутствует."]);
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    setStatus([...lines, "WebGPU: адаптер не найден."]);
    return;
  }
  const device = await adapter.requestDevice();
  const canvas = document.getElementById("gpu") as HTMLCanvasElement;
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    setStatus([...lines, "WebGPU: getContext('webgpu') вернул null."]);
    return;
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  }
  resize();
  window.addEventListener("resize", resize);
  ctx.configure({ device, format, alphaMode: "opaque" });
  lines.push(`WebGPU: устройство получено, формат — ${format}`);

  // ---- рельеф: кусок вокруг маркеров, тот же остров, что и в игре ----
  const PATCH = { x0: 15, y0: 0, x1: 70, y1: 45 };
  const mesh = buildTerrainPatch(PATCH.x0, PATCH.y0, PATCH.x1, PATCH.y1, 1);
  lines.push(`рельеф: патч ${PATCH.x1 - PATCH.x0}×${PATCH.y1 - PATCH.y0} клеток, ${mesh.vertexCount} вершин`);
  setStatus(lines);

  const renderer = createRenderer(device, ctx, format);
  renderer.setTerrain(mesh);

  const markers: MarkerEntity[] = found.map((eid) => {
    const wx = Position.x[eid], wz = Position.y[eid];
    const groundY = heightAt(wx, wz) * HMAX;
    return { x: wx, y: groundY, z: wz, color: KIND_COLOR[Kind.value[eid]] };
  });
  renderer.setMarkers(markers);

  // ---- камера: орбита вокруг центра патча, теперь управляемая —
  // перетаскивание вращает, колесо/щипок масштабирует (см. camera.ts).
  // Пока не тронули экран — тихо продолжает медленный автооблёт из
  // прошлого шага, чтобы страница не выглядела застывшей картинкой.
  const cx = (PATCH.x0 + PATCH.x1) / 2, cz = (PATCH.y0 + PATCH.y1) / 2;
  const cy = heightAt(cx, cz) * HMAX;
  const cam: OrbitCamera = { yaw: 0, pitch: 0.55, dist: 42, target: [cx, cy + 2, cz] };
  const controls = attachOrbitControls(canvas, cam);

  function draw(tMs: number) {
    if (controls.isAutoOrbiting()) cam.yaw = tMs * 0.00015;
    const eye: Vec3 = [
      cam.target[0] + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      cam.target[1] + Math.sin(cam.pitch) * cam.dist,
      cam.target[2] + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    ];
    const aspect = canvas.width / Math.max(1, canvas.height);
    const vp = mul(persp(0.72, aspect, 0.5, 300), look(eye, cam.target, [0, 1, 0]));
    renderer.setVP(vp);
    renderer.frame({ r: 0.043, g: 0.039, b: 0.035, a: 1 });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  (window as any).__engineReady = true;
  (window as any).__ecsFound = found.length;
}

main().catch((err) => {
  setStatus([`Ошибка: ${err instanceof Error ? err.message : String(err)}`]);
  console.error(err);
});
