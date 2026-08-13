/* =========================================================================
   Рендер настоящих .glb-моделей (те же файлы, что уже использует живая
   игра — models/castles/*.glb) через WebGPU: свой пайплайн с текстурой
   (аналог modelProg в obyom-3d-infinite.html), общий VP из uniform-буфера
   плюс собственная модельная матрица на каждый инстанс модели.
   ========================================================================= */
import type { ParsedGLB } from "./glb";
import type { Mat4 } from "./mat4";

const MODEL_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f, model: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var tex: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldNormal: vec3f,
};

@vertex
fn vs(@location(0) pos: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f) -> VOut {
  var out: VOut;
  let world = u.model * vec4f(pos, 1.0);
  out.pos = u.vp * world;
  out.uv = uv;
  // модельная матрица тут без неравномерного масштаба — обычной 3x3 части достаточно для нормали
  out.worldNormal = normalize((u.model * vec4f(normal, 0.0)).xyz);
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let diffuse = max(0.35, dot(in.worldNormal, sun));
  let base = textureSample(tex, samp, in.uv);
  return vec4f(base.rgb * diffuse, base.a);
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

export function createModelPipeline(device: GPUDevice, format: GPUTextureFormat) {
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

  // Буфер/bind group на каждый ИНСТАНС модели заводятся ОДИН раз (см.
  // createInstance), а не на каждый draw() каждый кадр — тот самый "лишний
  // вызов на объект", от которого в живой игре как раз избавлялись
  // инстансингом маркеров (см. renderer.ts), сюда так заходить не должен.
  // Каждый кадр меняется только VP (позиция объекта на карте не двигается
  // сама по себе) — записываем только эти 16 float, не весь буфер.
  function createInstance(model: GpuModel, modelMat: Mat4): ModelInstance {
    const uniformBuf = device.createBuffer({ size: 32 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(uniformBuf, 16 * 4, modelMat);
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: model.texture.createView() },
      ],
    });
    return { model, uniformBuf, bindGroup };
  }

  function draw(pass: GPURenderPassEncoder, instance: ModelInstance, vp: Mat4) {
    device.queue.writeBuffer(instance.uniformBuf, 0, vp);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, instance.bindGroup);
    pass.setVertexBuffer(0, instance.model.vao.posBuf);
    pass.setVertexBuffer(1, instance.model.vao.nrmBuf);
    pass.setVertexBuffer(2, instance.model.vao.uvBuf);
    pass.setIndexBuffer(instance.model.vao.idxBuf, instance.model.vao.indexFormat);
    pass.drawIndexed(instance.model.vao.indexCount);
  }

  return { createInstance, draw };
}

export interface ModelInstance {
  model: GpuModel;
  uniformBuf: GPUBuffer;
  bindGroup: GPUBindGroup;
}
