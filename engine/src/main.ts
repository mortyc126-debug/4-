/* =========================================================================
   Честная перспективная камера (управляемая — см. camera.ts) над куском
   ТОГО ЖЕ рельефа, что и в живой игре (тот же SEED, см. terrain.ts) —
   остров узнаваем. Город/лагерь/точки — настоящие .glb-модели той же игры
   (см. glb.ts/modelRenderer.ts), стоят прямо на рельефе на своей мировой
   высоте. Метки-пирамидки из ранних шагов прототипа отсюда убраны — ни
   одна сущность в них больше не нуждается.
   ========================================================================= */
import { createWorld, addEntity, addComponent, query } from "bitecs";
import { createRenderer } from "./renderer";
import { buildTerrainPatch } from "./terrainMesh";
import { heightAt, HMAX } from "./terrain";
import { mul, persp, look, modelMatrix, type Vec3 } from "./mat4";
import { attachOrbitControls, type OrbitCamera } from "./camera";
import { loadGLB } from "./glb";
import { uploadGLB, createModelPipeline, type GpuModel, type ModelInstance } from "./modelRenderer";
import { loadRealEntities } from "./realData";

const statusEl = document.getElementById("status") as HTMLDivElement;
function setStatus(lines: string[]) {
  statusEl.textContent = lines.join("\n");
}

async function main() {
  const lines: string[] = [];

  // ---- bitECS: настоящие данные партии, если движок открыт внутри игры
  // (см. realData.ts — читает window.parent.W), иначе те же четыре
  // придуманные сущности демо, что и раньше. Масштаб моделей — как в
  // живой игре (город 10×, лагерь/точка 5×, форт покрупнее — 6.5×).
  const real = loadRealEntities();
  const usingReal = real !== null;
  const seedEntities =
    real ??
    [
      { x: 43, y: 14, kind: 0 as const, model: "/models/castles/human-1.glb", scale: 10 },
      { x: 50, y: 20, kind: 1 as const, model: "/models/camps/barbarians.glb", scale: 5 },
      { x: 55, y: 12, kind: 2 as const, model: "/models/resources/farm.glb", scale: 5 },
      { x: 30, y: 30, kind: 2 as const, model: "/models/resources/quarry.glb", scale: 5 },
    ];
  lines.push(usingReal ? `данные: настоящая партия, сущностей — ${seedEntities.length}` : "данные: демо (window.parent.W недоступен)");

  const world = createWorld();
  const Position = { x: [] as number[], y: [] as number[] };
  const Kind = { value: [] as number[] }; // 0=city 1=camp 2=node
  const modelPathOf = new Map<number, string>();
  const modelScaleOf = new Map<number, number>();
  for (const e of seedEntities) {
    const eid = addEntity(world);
    addComponent(world, eid, Position);
    addComponent(world, eid, Kind);
    Position.x[eid] = e.x;
    Position.y[eid] = e.y;
    Kind.value[eid] = e.kind;
    modelPathOf.set(eid, e.model);
    modelScaleOf.set(eid, e.scale);
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

  // ---- рельеф: кусок вокруг сущностей демо, тот же остров, что и в игре;
  // с настоящими данными сущности разбросаны по всей карте (CFG.MAP=100
  // в живой игре) — рельеф строим на весь размер. Ни то, ни другое пока
  // не чанкуется/не стримится, как в живом 3D (это отдельный будущий шаг,
  // сейчас цель — увидеть настоящую партию целиком хоть одним куском).
  const PATCH = usingReal ? { x0: 0, y0: 0, x1: 100, y1: 100 } : { x0: 15, y0: 0, x1: 70, y1: 45 };
  const mesh = buildTerrainPatch(PATCH.x0, PATCH.y0, PATCH.x1, PATCH.y1, 1);
  lines.push(`рельеф: патч ${PATCH.x1 - PATCH.x0}×${PATCH.y1 - PATCH.y0} клеток, ${mesh.vertexCount} вершин`);
  setStatus(lines);

  const renderer = createRenderer(device, ctx, format);
  renderer.setTerrain(mesh);

  // ---- настоящие 3D-модели (те же .glb, что и в живой игре) для ВСЕХ
  // сущностей — метка-пирамидка из прошлых шагов больше не нужна ни для
  // кого. Путь абсолютный от корня сайта: этот прототип живёт в
  // /engine/dist/, а модели — в /models/ у корня репозитория, который
  // Render отдаёт целиком как одну статику.
  //
  // Кэш по пути к файлу: с настоящей партией десятки лагерей/точек делят
  // одну и ту же модель (barbarians.glb на все лагеря/форты и т.п.) —
  // без кэша каждый инстанс заново качал бы и парсил тот же файл. Тот же
  // приём, что и modelCache в живом obyom-3d-infinite.html.
  //
  // Грузим и закачиваем всё в GPU ДО первого кадра цикла отрисовки, не
  // параллельно с ним: в тестах закачка текстуры ПОСЛЕ нескольких секунд
  // непрерывного рендера стабильно валила WebGPU-соединение именно в этой
  // песочнице ("A valid external Instance reference no longer exists") —
  // тот же вызов с тем же файлом отрабатывал без единой ошибки, если
  // делался до старта цикла. Не тратить GPU на рендер кадров, пока сцена
  // ещё не готова, — разумно само по себе, не только обход этой
  // особенности песочницы.
  const modelPipeline = createModelPipeline(device, format);
  const modelCache = new Map<string, Promise<GpuModel>>();
  function getModel(path: string): Promise<GpuModel> {
    let p = modelCache.get(path);
    if (!p) {
      p = loadGLB(path).then((parsed) => uploadGLB(device, parsed));
      modelCache.set(path, p);
    }
    return p;
  }
  // Прогрев кэша ДО цикла инстансов: с настоящей партией уникальных путей
  // мало (десятки — расы×эпохи городов + по одному на лагерь/точки), но при
  // последовательном await внутри цикла первый инстанс каждого нового пути
  // блокирует все последующие сущности до своей полной загрузки — на 1433
  // сущностях (проверено синтетическим прогоном той же плотности, что и в
  // реальной партии) это стабильно давало ~4.8с до кадра. Запуск всех
  // уникальных путей ПАРАЛЛЕЛЬНО сокращает это до времени самой медленной
  // отдельной модели вместо суммы всех. Всё ещё строго до
  // requestAnimationFrame(draw) — см. комментарий ниже про сбой
  // copyExternalImageToTexture при закачке параллельно с уже идущим циклом
  // рендера.
  const uniquePaths = new Set(Array.from(found, (eid) => modelPathOf.get(eid)!));
  await Promise.allSettled(Array.from(uniquePaths, (p) => getModel(p)));
  const instances: ModelInstance[] = [];
  let loadedCount = 0, failedCount = 0;
  for (const eid of found) {
    const wx = Position.x[eid], wz = Position.y[eid];
    const groundY = heightAt(wx, wz) * HMAX;
    const mat = modelMatrix(wx, groundY, wz, 0, modelScaleOf.get(eid) ?? 5);
    const path = modelPathOf.get(eid)!;
    try {
      const gm = await getModel(path);
      instances.push(modelPipeline.createInstance(gm, mat));
      loadedCount++;
    } catch (err) {
      failedCount++;
      lines.push(`модель: ошибка на ${path} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  lines.push(`модели: загружено ${loadedCount}/${found.length}${failedCount ? ", ошибок: " + failedCount : ""}`);
  setStatus(lines);

  // ---- камера: с настоящими данными старт — у своего города (та же
  // логика, что уже прижилась в живой 3D-вкладке после жалобы "почему
  // камера стартует у 0:0, а не у моего города"), без данных — центр
  // демо-патча. Управляемая — перетаскивание вращает, колесо/щипок
  // масштабирует (см. camera.ts); пока не тронули экран — тихо продолжает
  // медленный автооблёт, чтобы страница не выглядела застывшей картинкой.
  const own = real?.find((e) => e.own);
  const cx = own ? own.x : (PATCH.x0 + PATCH.x1) / 2;
  const cz = own ? own.y : (PATCH.y0 + PATCH.y1) / 2;
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
    renderer.frame({ r: 0.043, g: 0.039, b: 0.035, a: 1 }, (pass) => {
      for (const inst of instances) modelPipeline.draw(pass, inst, vp);
    });
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
