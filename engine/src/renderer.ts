/* =========================================================================
   Два пайплайна на одной VP-матрице (перспективная камера, не плоское
   отображение координат, как в самом первом кадре): рельеф — обычная
   решётка треугольников, маркеры городов/лагерей/точек — настоящий
   инстансинг (один draw() на все сущности разом, приём из исследования,
   который убирает узкое место "draw call на модель" в старом WebGL2-
   рендере). VP лежит в общем uniform-буфере, чтобы оба пайплайна двигались
   одной камерой без рассинхрона.

   Туман по расстоянию — общий для рельефа и маркеров (и для .glb-моделей,
   см. modelRenderer.ts) FogUniforms-буфер (позиция камеры + цвет/плотность
   тумана): вдали цвет фрагмента подмешивается к цвету тумана, тот же цвет,
   что и очистка канвы (см. main.ts) — плавный переход в "небо", а не резкий
   обрыв рельефа. Заодно прячет стык между детальными ближними чанками и
   грубым дальним кольцом рельефа (см. main.ts, FAR_*), а до этого прятал
   бы и саму границу дальнего кольца (пустоту за её пределами) — до тумана
   мир обрывался в черноту, что и было первой жалобой с реального
   устройства.
   ========================================================================= */
import type { MeshData } from "./terrainMesh";
import { buildConiferMesh, buildBroadleafMesh, buildRockMesh, type DecorMesh } from "./decorMesh";

const TERRAIN_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;

struct VOut { @builtin(position) pos: vec4f, @location(0) color: vec3f, @location(1) worldPos: vec3f, @location(2) normal: vec3f };

@vertex
fn vs(@location(0) pos: vec3f, @location(1) color: vec3f, @location(2) normal: vec3f) -> VOut {
  var out: VOut;
  out.pos = u.vp * vec4f(pos, 1.0);
  out.color = color;
  out.worldPos = pos;
  out.normal = normal;
  return out;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // Затенение — тут, не на CPU (см. terrainMesh.ts): нормаль пришла с CPU
  // ужё сглаженной (аналитический градиент heightAt в точке), а тут ещё и
  // интерполируется между вершинами треугольника — мягкий переход, а не
  // одна плоская яркость на весь треугольник.
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let n = normalize(in.normal);
  let diffuse = max(0.35, dot(n, sun));
  let lit = in.color * diffuse;
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), 1.0);
}
`;

const MARKER_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;

struct VOut { @builtin(position) pos: vec4f, @location(0) color: vec3f, @location(1) worldPos: vec3f };

@vertex
fn vs(@location(0) localPos: vec3f, @location(1) worldPos: vec3f, @location(2) scale: f32, @location(3) color: vec3f) -> VOut {
  var out: VOut;
  let wp = worldPos + localPos * scale;
  out.pos = u.vp * vec4f(wp, 1.0);
  out.color = color;
  out.worldPos = wp;
  return out;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(in.color, fog.color.rgb, f), 1.0);
}
`;

// Деревья/камни — тот же инстансинг-приём, что и маркеры (localPos +
// per-instance transform), но с настоящим освещением по нормали (как
// рельеф, см. TERRAIN_SHADER) вместо плоского цвета — иначе на солнечной
// стороне острова силуэты деревьев выглядели бы плоскими наклейками.
// Поворот только вокруг Y (yaw) — простая 2D-матрица поворота на CPU не
// нужна, тут же в шейдере, применяется и к позиции, и к нормали одинаково.
//
// materialId вместо запечённого в меш цвета (см. decorMesh.ts): ствол
// (materialId=0) всегда одного и того же бурого тона — TRUNK_COLOR ниже —
// а крона/камень (materialId=1) красится цветом ИНСТАНСА, выбранным на CPU
// из палитры PINE/LEAF/ROCK_TONES (main.ts) — разнообразие оттенков без
// разной геометрии на каждый оттенок.
const DECOR_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
const TRUNK_COLOR = vec3f(0.35, 0.26, 0.17);

struct VOut { @builtin(position) pos: vec4f, @location(0) color: vec3f, @location(1) worldPos: vec3f, @location(2) normal: vec3f };

@vertex
fn vs(
  @location(0) localPos: vec3f, @location(1) localNormal: vec3f, @location(2) materialId: f32,
  @location(3) worldPos: vec3f, @location(4) scale: f32, @location(5) yaw: f32, @location(6) tintColor: vec3f
) -> VOut {
  var out: VOut;
  let c = cos(yaw); let s = sin(yaw);
  let rp = vec3f(localPos.x * c - localPos.z * s, localPos.y, localPos.x * s + localPos.z * c);
  let rn = vec3f(localNormal.x * c - localNormal.z * s, localNormal.y, localNormal.x * s + localNormal.z * c);
  let wp = worldPos + rp * scale;
  out.pos = u.vp * vec4f(wp, 1.0);
  out.color = select(TRUNK_COLOR, tintColor, materialId > 0.5);
  out.worldPos = wp;
  out.normal = rn;
  return out;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let n = normalize(in.normal);
  let diffuse = max(0.35, dot(n, sun));
  let lit = in.color * diffuse;
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), 1.0);
}
`;

export interface MarkerEntity {
  x: number;
  y: number; // высота (мир, метры) — уже посчитанная (рельеф под меткой + запас)
  z: number; // мировой Z (игровой Y)
  color: [number, number, number];
}

// Декор (деревья/камни) — тот же инстансинг, что и маркеры. Ствол всегда
// одного бурого тона (см. TRUNK_COLOR в DECOR_SHADER), а крона/камень
// красятся цветом ИНСТАНСА (color) — выбор конкретного оттенка из палитры
// PINE/LEAF/ROCK_TONES решает main.ts при генерации, не renderer.
export interface DecorEntity {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  color: [number, number, number];
  kind: "conifer" | "broadleaf" | "rock";
}

export interface Renderer {
  // Рельеф стримится кусками (чанками) вокруг камеры — не одним куском на
  // всю сцену (см. main.ts, менеджер чанков): setTerrainChunk кладёт/обновляет
  // конкретный кусок по его ключу ("cx,cy"), removeTerrainChunk убирает кусок,
  // вышедший из радиуса выгрузки.
  setTerrainChunk(key: string, mesh: MeshData): void;
  removeTerrainChunk(key: string): void;
  setMarkers(entities: MarkerEntity[]): void;
  // Деревья/камни — сплошной список обоих видов разом, делится на два
  // инстанс-буфера внутри (см. DECOR_SHADER — общий пайплайн, общий
  // локальный меш свой у дерева и у камня). Вызывающая сторона (main.ts)
  // не обязана знать про это разделение.
  setDecor(entities: DecorEntity[]): void;
  setVP(vp: Float32Array): void;
  // Позиция камеры + цвет/плотность тумана — общие для рельефа и маркеров.
  // density — коэффициент экспоненциального затухания (см. TERRAIN_SHADER):
  // чем больше, тем ближе начинается дымка.
  setFog(eye: [number, number, number], color: [number, number, number], density: number): void;
  // drawExtra — вызывается ВНУТРИ того же render pass, что рельеф и маркеры
  // (общий depth-буфер, единая VP-камера), после них: сюда вешаются
  // настоящие .glb-модели (см. main.ts/modelRenderer.ts) без отдельного
  // прохода ради экономии на очистке/depth-тексте.
  frame(clearColor: GPUColorDict, drawExtra?: (pass: GPURenderPassEncoder) => void): void;
}

// Простая "метка-пирамидка" остриём вверх — 4 боковые грани, без дна
// (снизу её всё равно никогда не видно). Тот же приём, что и октаэдры
// маршей в живой игре (pushMarchOctahedron), только проще геометрия.
const PIN_BASE = 0.5, PIN_HEIGHT = 1.4;
// prettier-ignore
const LOCAL_PIN = new Float32Array([
  0,PIN_HEIGHT,0,  PIN_BASE,0,0,        0,0,PIN_BASE,
  0,PIN_HEIGHT,0,  0,0,PIN_BASE,        -PIN_BASE,0,0,
  0,PIN_HEIGHT,0,  -PIN_BASE,0,0,       0,0,-PIN_BASE,
  0,PIN_HEIGHT,0,  0,0,-PIN_BASE,       PIN_BASE,0,0,
]);
const PIN_VERTS = LOCAL_PIN.length / 3;
const INST_STRIDE_FLOATS = 7; // x,y,z, scale, r,g,b

export function createRenderer(device: GPUDevice, ctx: GPUCanvasContext, format: GPUTextureFormat): Renderer {
  const uniformBuf = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  // eye (xyz, w не используется) + цвет тумана (rgb) с плотностью в w —
  // общий для рельефа и маркеров буфер, отдельный от VP: меняется реже
  // (только позиция камеры, не сама матрица), но проще держать оба в одном
  // месте, чем плодить третий набор entries на пайплайн.
  const fogBuf = device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ---- рельеф ----
  const terrainModule = device.createShaderModule({ code: TERRAIN_SHADER });
  const terrainPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: terrainModule,
      entryPoint: "vs",
      buffers: [
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x3" }] },
      ],
    },
    fragment: { module: terrainModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const terrainBindGroup = device.createBindGroup({
    layout: terrainPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: fogBuf } },
    ],
  });
  // Map кусков рельефа по ключу чанка вместо одной пары буферов на всю
  // сцену — потоковая подгрузка/выгрузка вокруг камеры (см. main.ts): при
  // бесконечном мире держать вершины всей когда-либо увиденной территории
  // в одном буфере не получится.
  interface TerrainChunk { posBuf: GPUBuffer; colBuf: GPUBuffer; nrmBuf: GPUBuffer; vertexCount: number }
  const terrainChunks = new Map<string, TerrainChunk>();

  // ---- маркеры (инстансинг) ----
  const markerModule = device.createShaderModule({ code: MARKER_SHADER });
  const localPinBuf = device.createBuffer({
    size: LOCAL_PIN.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(localPinBuf, 0, LOCAL_PIN);
  const markerPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: markerModule,
      entryPoint: "vs",
      buffers: [
        { arrayStride: 3 * 4, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
        {
          arrayStride: INST_STRIDE_FLOATS * 4,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x3" },
            { shaderLocation: 2, offset: 3 * 4, format: "float32" },
            { shaderLocation: 3, offset: 4 * 4, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: markerModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const markerBindGroup = device.createBindGroup({
    layout: markerPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: fogBuf } },
    ],
  });
  let instBuf: GPUBuffer | null = null;
  let instCapacity = 0;
  let instanceCount = 0;

  // ---- декор (деревья/камни, инстансинг) ----
  // x,y,z, scale, yaw, color.rgb — цвет кроны/камня теперь атрибут
  // ИНСТАНСА (см. DECOR_SHADER), не запечён в меш: одна геометрия хвойного/
  // лиственного дерева переиспользуется под любой оттенок из палитры
  // PINE/LEAF/ROCK_TONES (main.ts решает, какой).
  const DECOR_INST_STRIDE_FLOATS = 8;
  const decorModule = device.createShaderModule({ code: DECOR_SHADER });
  function uploadDecorMesh(mesh: DecorMesh) {
    const buf = device.createBuffer({
      size: Math.max(mesh.vertexCount * 7 * 4, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    // Один буфер на локальный меш: pos(3)+normal(3)+materialId(1) переплетены
    // подряд на вершину — геометрия строится один раз при старте, не каждый
    // кадр, поэтому собрать один interleaved Float32Array тут же на CPU
    // проще, чем городить раздельные vertex-буферы ради статичного меша.
    const interleaved = new Float32Array(mesh.vertexCount * 7);
    for (let i = 0; i < mesh.vertexCount; i++) {
      interleaved.set(mesh.positions.subarray(i * 3, i * 3 + 3), i * 7);
      interleaved.set(mesh.normals.subarray(i * 3, i * 3 + 3), i * 7 + 3);
      interleaved[i * 7 + 6] = mesh.materialIds[i];
    }
    device.queue.writeBuffer(buf, 0, interleaved);
    return buf;
  }
  interface DecorKindState { mesh: DecorMesh; localBuf: GPUBuffer; instBuf: GPUBuffer | null; instCapacity: number; instanceCount: number }
  const decorKinds = new Map<DecorEntity["kind"], DecorKindState>([
    ["conifer", { mesh: buildConiferMesh(), localBuf: null as any, instBuf: null, instCapacity: 0, instanceCount: 0 }],
    ["broadleaf", { mesh: buildBroadleafMesh(), localBuf: null as any, instBuf: null, instCapacity: 0, instanceCount: 0 }],
    ["rock", { mesh: buildRockMesh(), localBuf: null as any, instBuf: null, instCapacity: 0, instanceCount: 0 }],
  ]);
  for (const state of decorKinds.values()) state.localBuf = uploadDecorMesh(state.mesh);
  const decorPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: decorModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 7 * 4,
          stepMode: "vertex",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
            { shaderLocation: 2, offset: 6 * 4, format: "float32" },
          ],
        },
        {
          arrayStride: DECOR_INST_STRIDE_FLOATS * 4,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 3, offset: 0, format: "float32x3" },
            { shaderLocation: 4, offset: 3 * 4, format: "float32" },
            { shaderLocation: 5, offset: 4 * 4, format: "float32" },
            { shaderLocation: 6, offset: 5 * 4, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: decorModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const decorBindGroup = device.createBindGroup({
    layout: decorPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: fogBuf } },
    ],
  });

  // ---- глубина ----
  let depthTex: GPUTexture | null = null;
  let depthView: GPUTextureView | null = null;
  function ensureDepth() {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    if (depthTex && depthTex.width === w && depthTex.height === h) return;
    depthTex?.destroy();
    depthTex = device.createTexture({
      size: [w, h],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    depthView = depthTex.createView();
  }

  function setTerrainChunk(key: string, mesh: MeshData) {
    const prev = terrainChunks.get(key);
    prev?.posBuf.destroy();
    prev?.colBuf.destroy();
    prev?.nrmBuf.destroy();
    const posBuf = device.createBuffer({
      size: Math.max(mesh.positions.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const colBuf = device.createBuffer({
      size: Math.max(mesh.colors.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const nrmBuf = device.createBuffer({
      size: Math.max(mesh.normals.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(posBuf, 0, mesh.positions);
    device.queue.writeBuffer(colBuf, 0, mesh.colors);
    device.queue.writeBuffer(nrmBuf, 0, mesh.normals);
    terrainChunks.set(key, { posBuf, colBuf, nrmBuf, vertexCount: mesh.vertexCount });
  }

  function removeTerrainChunk(key: string) {
    const chunk = terrainChunks.get(key);
    if (!chunk) return;
    chunk.posBuf.destroy();
    chunk.colBuf.destroy();
    chunk.nrmBuf.destroy();
    terrainChunks.delete(key);
  }

  function setMarkers(entities: MarkerEntity[]) {
    instanceCount = entities.length;
    const data = new Float32Array(instanceCount * INST_STRIDE_FLOATS);
    entities.forEach((e, i) => {
      const o = i * INST_STRIDE_FLOATS;
      data[o] = e.x;
      data[o + 1] = e.y;
      data[o + 2] = e.z;
      data[o + 3] = 1.0;
      data[o + 4] = e.color[0];
      data[o + 5] = e.color[1];
      data[o + 6] = e.color[2];
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

  function writeDecorInstances(entities: DecorEntity[], state: DecorKindState) {
    const count = entities.length;
    const data = new Float32Array(count * DECOR_INST_STRIDE_FLOATS);
    entities.forEach((e, i) => {
      const o = i * DECOR_INST_STRIDE_FLOATS;
      data[o] = e.x; data[o + 1] = e.y; data[o + 2] = e.z;
      data[o + 3] = e.scale; data[o + 4] = e.yaw;
      data[o + 5] = e.color[0]; data[o + 6] = e.color[1]; data[o + 7] = e.color[2];
    });
    state.instanceCount = count;
    if (count > state.instCapacity) {
      state.instBuf?.destroy();
      state.instCapacity = Math.max(count, 8);
      state.instBuf = device.createBuffer({
        size: state.instCapacity * DECOR_INST_STRIDE_FLOATS * 4,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (state.instBuf && data.byteLength > 0) device.queue.writeBuffer(state.instBuf, 0, data);
  }

  function setDecor(entities: DecorEntity[]) {
    for (const [kind, state] of decorKinds) {
      writeDecorInstances(entities.filter((e) => e.kind === kind), state);
    }
  }

  function setVP(vp: Float32Array) {
    device.queue.writeBuffer(uniformBuf, 0, vp);
  }

  function setFog(eye: [number, number, number], color: [number, number, number], density: number) {
    const data = new Float32Array([eye[0], eye[1], eye[2], 0, color[0], color[1], color[2], density]);
    device.queue.writeBuffer(fogBuf, 0, data);
  }

  function frame(clearColor: GPUColorDict, drawExtra?: (pass: GPURenderPassEncoder) => void) {
    ensureDepth();
    const encoder = device.createCommandEncoder();
    const view = ctx.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view, clearValue: clearColor, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: {
        view: depthView!,
        depthClearValue: 1.0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    if (terrainChunks.size > 0) {
      pass.setPipeline(terrainPipeline);
      pass.setBindGroup(0, terrainBindGroup);
      for (const chunk of terrainChunks.values()) {
        if (chunk.vertexCount === 0) continue;
        pass.setVertexBuffer(0, chunk.posBuf);
        pass.setVertexBuffer(1, chunk.colBuf);
        pass.setVertexBuffer(2, chunk.nrmBuf);
        pass.draw(chunk.vertexCount);
      }
    }

    if (instanceCount > 0 && instBuf) {
      pass.setPipeline(markerPipeline);
      pass.setBindGroup(0, markerBindGroup);
      pass.setVertexBuffer(0, localPinBuf);
      pass.setVertexBuffer(1, instBuf);
      pass.draw(PIN_VERTS, instanceCount);
    }

    let anyDecor = false;
    for (const state of decorKinds.values()) if (state.instanceCount > 0) { anyDecor = true; break; }
    if (anyDecor) {
      pass.setPipeline(decorPipeline);
      pass.setBindGroup(0, decorBindGroup);
      for (const state of decorKinds.values()) {
        if (state.instanceCount === 0 || !state.instBuf) continue;
        pass.setVertexBuffer(0, state.localBuf);
        pass.setVertexBuffer(1, state.instBuf);
        pass.draw(state.mesh.vertexCount, state.instanceCount);
      }
    }

    drawExtra?.(pass);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  return { setTerrainChunk, removeTerrainChunk, setMarkers, setDecor, setVP, setFog, frame };
}
