/* =========================================================================
   Шаг 0 нового движка: не рендер мира, а доказательство, что сама связка
   WebGPU + bitECS + Vite/TS вообще заводится в этом окружении, прежде чем
   переносить сюда хоть одну строчку логики из obyom-3d-infinite.html.
   Компонент City/CampOrNode ниже — заготовка под реальную форму W.map
   ({t, x, y, ...}), не финальная схема: цель прямо сейчас — увидеть кадр
   на экране и непустой результат ECS-запроса в одном месте.
   ========================================================================= */
import { createWorld, addEntity, addComponent, query } from "bitecs";

const statusEl = document.getElementById("status") as HTMLDivElement;
function setStatus(lines: string[]) {
  statusEl.textContent = lines.join("\n");
}

async function main() {
  const lines: string[] = [];

  // ---- bitECS: минимальный мир с горсткой сущностей той же формы,
  // что и настоящие структуры карты (город/лагерь/точка). ----
  const world = createWorld();
  const Position = { x: [] as number[], y: [] as number[] };
  const Kind = { value: [] as number[] }; // 0=city 1=camp 2=node

  const KIND_NAME = ["city", "camp", "node"];
  const seedEntities: Array<{ x: number; y: number; kind: number }> = [
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
  const found = query(world, [Position, Kind]);
  lines.push(`bitECS: мир создан, сущностей найдено запросом — ${found.length}`);
  for (const eid of found) {
    lines.push(`  #${eid} ${KIND_NAME[Kind.value[eid]]} @ ${Position.x[eid]},${Position.y[eid]}`);
  }

  // ---- WebGPU: запрос адаптера/устройства и один очищенный кадр. ----
  if (!("gpu" in navigator)) {
    lines.push("WebGPU: navigator.gpu отсутствует — браузер/контекст не поддерживает.");
    setStatus(lines);
    return;
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    lines.push("WebGPU: адаптер не найден (requestAdapter вернул null).");
    setStatus(lines);
    return;
  }
  const device = await adapter.requestDevice();
  const canvas = document.getElementById("gpu") as HTMLCanvasElement;
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    lines.push("WebGPU: canvas.getContext('webgpu') вернул null.");
    setStatus(lines);
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

  lines.push(`WebGPU: устройство получено, формат канвы — ${format}`);
  setStatus(lines);

  let frame = 0;
  function draw() {
    frame++;
    const t = frame / 60;
    const encoder = device.createCommandEncoder();
    const view = ctx!.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.05 + 0.03 * Math.sin(t), g: 0.04, b: 0.03, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.end();
    device.queue.submit([encoder.finish()]);
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
