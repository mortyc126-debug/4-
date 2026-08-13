/* =========================================================================
   Шаг 1: настоящий кадр — не просто очистка канвы цветом (это уже было),
   а honest-to-god растеризация треугольников через пайплайн WebGPU. Каждая
   ECS-сущность становится маленьким цветным треугольником-меткой на своих
   мировых координатах (x,y из Position, тот же диапазон 0..100, что и
   CFG.MAP в живой игре) — и рисуется НАСТОЯЩИМ инстансингом (stepMode:
   "instance"): одна и та же локальная геометрия треугольника, один draw()
   на все сущности разом, per-instance атрибут только несёт позицию/цвет.
   Это тот самый приём из исследования (см. артефакт «Реактор»), который
   структурно убирает узкое место "один draw call на модель" — здесь он
   проверяется на первом кадре, а не откладывается до переноса лагерей.
   ========================================================================= */

const SHADER = /* wgsl */ `
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(@location(0) localPos: vec2f, @location(1) worldPos: vec2f, @location(2) color: vec3f) -> VOut {
  // Мировые координаты 0..100 (как CFG.MAP в игре) -> clip space -1..1.
  // Y инвертирован: в игровых координатах Y растёт вниз, в clip space — вверх.
  let clipX = (worldPos.x / 100.0) * 2.0 - 1.0;
  let clipY = 1.0 - (worldPos.y / 100.0) * 2.0;
  var out: VOut;
  out.pos = vec4f(localPos * 0.05 + vec2f(clipX, clipY), 0.0, 1.0);
  out.color = color;
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
`;

export interface MarkerEntity {
  x: number;
  y: number;
  color: [number, number, number];
}

export interface Renderer {
  setEntities(entities: MarkerEntity[]): void;
  frame(clearColor: GPUColorDict): void;
}

// Локальный треугольник-метка (остриём вверх) — общая геометрия одного
// инстанса, накладывается на worldPos/color каждой сущности в шейдере.
const LOCAL_TRI = new Float32Array([0, 1, -0.85, -0.8, 0.85, -0.8]);
const INST_STRIDE_FLOATS = 5; // x, y, r, g, b

export function createRenderer(device: GPUDevice, ctx: GPUCanvasContext, format: GPUTextureFormat): Renderer {
  const module = device.createShaderModule({ code: SHADER });

  const localBuf = device.createBuffer({
    size: LOCAL_TRI.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(localBuf, 0, LOCAL_TRI);

  let instBuf: GPUBuffer | null = null;
  let instCapacity = 0;
  let instanceCount = 0;

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 2 * 4,
          stepMode: "vertex",
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: INST_STRIDE_FLOATS * 4,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x2" },
            { shaderLocation: 2, offset: 2 * 4, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  function setEntities(entities: MarkerEntity[]) {
    instanceCount = entities.length;
    const data = new Float32Array(instanceCount * INST_STRIDE_FLOATS);
    entities.forEach((e, i) => {
      const o = i * INST_STRIDE_FLOATS;
      data[o] = e.x;
      data[o + 1] = e.y;
      data[o + 2] = e.color[0];
      data[o + 3] = e.color[1];
      data[o + 4] = e.color[2];
    });
    if (instanceCount > instCapacity) {
      instBuf?.destroy();
      instCapacity = Math.max(instanceCount, 8);
      instBuf = device.createBuffer({
        size: instCapacity * INST_STRIDE_FLOATS * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (instBuf && data.byteLength > 0) device.queue.writeBuffer(instBuf, 0, data);
  }

  function frame(clearColor: GPUColorDict) {
    const encoder = device.createCommandEncoder();
    const view = ctx.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: clearColor, loadOp: "clear", storeOp: "store" }],
    });
    if (instanceCount > 0 && instBuf) {
      pass.setPipeline(pipeline);
      pass.setVertexBuffer(0, localBuf);
      pass.setVertexBuffer(1, instBuf);
      pass.draw(3, instanceCount); // 3 вершины на инстанс, instanceCount инстансов — один draw call на всех
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { setEntities, frame };
}
