/* =========================================================================
   Рендер настоящих .glb-моделей (те же файлы, что уже использует живая
   игра — models/castles/*.glb) через WebGPU: свой пайплайн с текстурой
   (аналог modelProg в obyom-3d-infinite.html), общий VP из uniform-буфера
   плюс собственная модельная матрица на каждый инстанс модели.
   ========================================================================= */
import type { ParsedGLB } from "./glb";
import type { Mat4 } from "./mat4";
import { SHADOW_MAP_SIZE, type ShadowResources } from "./renderer";

// Модели (города/лагеря/точки) тени не бросают (отдельный, более тяжёлый
// кусок работы — см. ShadowResources в renderer.ts), но ПРИНИМАТЬ обязаны:
// иначе постройка, стоящая в тени склона или дерева, оставалась бы ярко
// освещённой посреди уже затенённой земли вокруг неё — единственный объект
// в кадре без тени. light/shadowSamp/shadowTex — та же карта и та же
// shadowFactor (3×3 PCF), что и у TERRAIN_SHADER/DECOR_SHADER в renderer.ts
// (дословная копия — общего WGSL-модуля на оба файла тут не заводили).
const MODEL_SHADER = /* wgsl */ `
// vp раньше жил в том же per-instance Uniforms, что и model — draw() ниже
// переписывал ЭТИ ЖЕ 64 байта в буфер КАЖДОГО инстанса КАЖДЫЙ кадр, хотя
// VP один и тот же для всей сцены за кадр (та же матрица, что и у
// terrain/marker в renderer.ts, там она давно в общем uniformBuf, не по
// одному на объект). С отсечением по экрану/дальности (main.ts,
// isModelOnScreen) одновременно видимых зданий может быть несколько
// десятков — столько же лишних writeBuffer на один и тот же VP, каждый
// кадр. Вынесен в отдельный общий буфер (см. vpBuf/setVP ниже, тот же
// приём, что уже применялся к fogBuf) — модельная матрица остаётся
// per-instance (она и правда своя у каждого здания), но пишется ОДИН раз
// при создании инстанса и больше никогда не трогается (здания не двигаются
// сами по себе) — draw() теперь не пишет в GPU-буфер вообще, только меняет
// bind group/vertex buffers и рисует.
@group(0) @binding(0) var<uniform> vp: mat4x4f;
struct Fog { eye: vec4f, color: vec4f };
struct Light { vp: mat4x4f };
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;
@group(0) @binding(3) var<uniform> fog: Fog;
@group(0) @binding(4) var<uniform> light: Light;
@group(0) @binding(5) var shadowSamp: sampler_comparison;
@group(0) @binding(6) var shadowTex: texture_depth_2d;
@group(0) @binding(7) var<uniform> model: mat4x4f;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldNormal: vec3f,
  @location(2) worldPos: vec3f,
  @location(3) lightClip: vec4f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VOut {
  var out: VOut;
  let world = model * vec4f(pos, 1.0);
  out.pos = vp * world;
  out.uv = uv;
  // модельная матрица тут без неравномерного масштаба — обычной 3x3 части достаточно для нормали
  out.worldNormal = normalize((model * vec4f(normal, 0.0)).xyz);
  out.worldPos = world.xyz;
  out.lightClip = light.vp * world;
  return out;
}

fn shadowFactor(clip: vec4f) -> f32 {
  let ndc = clip.xyz / clip.w;
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0 || ndc.z < 0.0 || ndc.z > 1.0) {
    return 1.0;
  }
  let uv = vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  let bias = 0.0025;
  let texel = 1.0 / ${SHADOW_MAP_SIZE.toFixed(1)};
  var sum = 0.0;
  for (var dy = -1; dy <= 1; dy = dy + 1) {
    for (var dx = -1; dx <= 1; dx = dx + 1) {
      sum = sum + textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(dx), f32(dy)) * texel, ndc.z - bias);
    }
  }
  return sum / 9.0;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let ndotl = max(0.0, dot(in.worldNormal, sun));
  let shadow = shadowFactor(in.lightClip);
  // Тот же полусферный ambient, что и в TERRAIN_SHADER/DECOR_SHADER
  // (renderer.ts) — та же палитра там же держится в синхроне при правке.
  // Без этого здания/лагеря светились бы плоским скаляром 0.35, как земля
  // раньше — заметный разнобой, если земля вокруг уже цветная в тени, а
  // постройка на ней — просто темнее сама себя.
  let skyTint = vec3f(0.42, 0.37, 0.28);
  let groundTint = vec3f(0.20, 0.16, 0.13);
  let sunLightColor = vec3f(0.85, 0.70, 0.48);
  let hemi = mix(groundTint, skyTint, clamp(in.worldNormal.y * 0.5 + 0.5, 0.0, 1.0));
  let lighting = hemi + sunLightColor * ndotl * shadow;
  let base = textureSample(tex, samp, in.uv);
  let lit = base.rgb * lighting;
  // Туман — тот же расчёт, что и у рельефа/маркеров (см. renderer.ts):
  // здания/лагеря вдали тоже должны таять в дымке, а не обрываться резким
  // контуром на фоне уже затуманенной земли под ними.
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), base.a);
}
`;

export interface GpuModel {
  vao: {
    posBuf: GPUBuffer;
    nrmBuf: GPUBuffer;
    uvBuf: GPUBuffer;
    idxBuf: GPUBuffer;
    indexFormat: GPUIndexFormat;
    indexCount: number;
  };
  texture: GPUTexture;
}

export async function uploadGLB(device: GPUDevice, parsed: ParsedGLB): Promise<GpuModel> {
  const posBuf = device.createBuffer({ size: parsed.positions.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(posBuf, 0, parsed.positions);
  const nrmBuf = device.createBuffer({ size: parsed.normals.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(nrmBuf, 0, parsed.normals);
  const uvBuf = device.createBuffer({ size: parsed.uvs.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(uvBuf, 0, parsed.uvs);
  // WebGPU требует, чтобы размер записи в буфер (не только размер самого
  // буфера) был кратен 4 байтам. У Uint16Array-индексов (2 байта на штуку)
  // это ломается на моделях с НЕЧЁТНЫМ числом индексов — ровно то, на чём
  // упали лагерь и обе точки ресурсов (у замка индексов оказалось чётное
  // число, потому там и не заметили). Досыпаем один нулевой индекс до
  // кратного 4 байтам размера; на indexCount (используется в drawIndexed)
  // это не влияет — он по-прежнему исходный, лишний хвост просто не
  // читается растеризацией.
  const idxBytes = parsed.indices.byteLength;
  const idxAligned = Math.ceil(idxBytes / 4) * 4;
  const idxBuf = device.createBuffer({ size: idxAligned, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  if (idxAligned === idxBytes) {
    device.queue.writeBuffer(idxBuf, 0, parsed.indices);
  } else {
    const padded = new Uint8Array(idxAligned);
    padded.set(new Uint8Array(parsed.indices.buffer, parsed.indices.byteOffset, idxBytes));
    device.queue.writeBuffer(idxBuf, 0, padded);
  }

  // Модели замков несут полноразмерные (4096×4096) JPEG-текстуры — то, что
  // разумно для GLB, отданного целиком браузеру на растеризацию через
  // <img>/CSS, тяжеловато для прямой закачки в GPU здесь: в этой песочнице
  // полноразмерная закачка стабильно роняла соединение с GPU-процессом
  // ("A valid external Instance reference no longer exists"). Даунскейл до
  // разумного превью-размера — тот же смысл, что и gltfpack/KTX2 из
  // исследования (сжимать то, что грузится в GPU), только средствами
  // самого браузера при декодировании, без отдельного билд-инструмента.
  const PREVIEW_MAX = 1024;
  const rawBitmap = await createImageBitmap(new Blob([parsed.imageBytes], { type: parsed.imageMimeType }));
  const scale = Math.min(1, PREVIEW_MAX / Math.max(rawBitmap.width, rawBitmap.height));
  const bitmap =
    scale < 1
      ? await createImageBitmap(rawBitmap, {
          resizeWidth: Math.round(rawBitmap.width * scale),
          resizeHeight: Math.round(rawBitmap.height * scale),
          resizeQuality: "medium",
        })
      : rawBitmap;
  if (scale < 1) rawBitmap.close();
  const texture = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [bitmap.width, bitmap.height]);
  bitmap.close();

  return {
    vao: {
      posBuf,
      nrmBuf,
      uvBuf,
      idxBuf,
      indexFormat: parsed.indices instanceof Uint16Array ? "uint16" : "uint32",
      indexCount: parsed.indices.length,
    },
    texture,
  };
}

export function createModelPipeline(device: GPUDevice, format: GPUTextureFormat, shadow: ShadowResources) {
  const module = device.createShaderModule({ code: MODEL_SHADER });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
      entryPoint: "vs",
      buffers: [
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
        { arrayStride: 3 * 4, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
        { arrayStride: 2 * 4, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
      ],
    },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "linear" });
  // Один общий буфер тумана на ВСЕ инстансы (не по одному на инстанс, как
  // model — цвет и плотность тумана, да и позиция камеры, одни и те же
  // для всей сцены за кадр). Пишется раз в кадр через setFog(), а не
  // дублируется в per-instance буфере каждого замка/лагеря/точки.
  const fogBuf = device.createBuffer({ size: 8 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  function setFog(eye: [number, number, number], color: [number, number, number], density: number) {
    const data = new Float32Array([eye[0], eye[1], eye[2], 0, color[0], color[1], color[2], density]);
    device.queue.writeBuffer(fogBuf, 0, data);
  }
  // vpBuf — тот же приём, что и у fogBuf выше (см. её комментарий и
  // комментарий у MODEL_SHADER): один общий буфер VP на все инстансы,
  // пишется РАЗ ЗА КАДР через setVP(), а не по одному writeBuffer на
  // каждую видимую модель в draw() ниже.
  const vpBuf = device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  function setVP(vp: Mat4) {
    device.queue.writeBuffer(vpBuf, 0, vp);
  }

  // Буфер/bind group на каждый ИНСТАНС модели заводятся ОДИН раз (см.
  // createInstance), а не на каждый draw() каждый кадр — тот самый "лишний
  // вызов на объект", от которого в живой игре как раз избавлялись
  // инстансингом маркеров (см. renderer.ts), сюда так заходить не должен.
  // Модельная матрица (позиция здания на карте) не меняется сама по себе
  // после создания — пишется тут ровно один раз и больше никогда не
  // трогается, draw() ниже вообще не делает writeBuffer.
  function createInstance(model: GpuModel, modelMat: Mat4): ModelInstance {
    const modelBuf = device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(modelBuf, 0, modelMat);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: vpBuf } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: model.texture.createView() },
        { binding: 3, resource: { buffer: fogBuf } },
        { binding: 4, resource: { buffer: shadow.lightBuf } },
        { binding: 5, resource: shadow.shadowSampler },
        { binding: 6, resource: shadow.shadowView },
        { binding: 7, resource: { buffer: modelBuf } },
      ],
    });
    return { model, modelBuf, bindGroup };
  }

  function draw(pass: GPURenderPassEncoder, instance: ModelInstance) {
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, instance.bindGroup);
    pass.setVertexBuffer(0, instance.model.vao.posBuf);
    pass.setVertexBuffer(1, instance.model.vao.nrmBuf);
    pass.setVertexBuffer(2, instance.model.vao.uvBuf);
    pass.setIndexBuffer(instance.model.vao.idxBuf, instance.model.vao.indexFormat);
    pass.drawIndexed(instance.model.vao.indexCount);
  }

  return { createInstance, draw, setFog, setVP };
}

export interface ModelInstance {
  model: GpuModel;
  modelBuf: GPUBuffer;
  bindGroup: GPUBindGroup;
}
