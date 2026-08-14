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
import { buildSpruceMesh, buildPineMesh, buildBroadleafMesh, buildBirchMesh, buildDeadTreeMesh, buildBushMesh, buildGrassMesh, buildRockMesh, type DecorMesh } from "./decorMesh";
import { loadTexture } from "./textures";

// Суша красится настоящими текстурами (см. textures.ts/textures/ground/*),
// не запечённым на CPU градиентом цвета — 5 текстур смешиваются по высоте
// (elevation, тот же порог, что раньше вёл groundColor(): 0.06/0.52/0.72),
// в каждой точке участвуют максимум 2 соседние по высоте зоны, поэтому не
// нужно смешивать все 5 сразу. Вода текстуры не сэмплит вообще — она
// плоская и цвет ей уже посчитан на CPU (см. terrainMesh.ts), waterFlag
// просто выбирает, какую ветку взять.
const TERRAIN_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var texSand: texture_2d<f32>;
@group(0) @binding(4) var texGrass: texture_2d<f32>;
@group(0) @binding(5) var texDry: texture_2d<f32>;
@group(0) @binding(6) var texScree: texture_2d<f32>;
@group(0) @binding(7) var texRock: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f, @location(0) waterColor: vec3f, @location(1) worldPos: vec3f,
  @location(2) normal: vec3f, @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32,
};

@vertex
fn vs(
  @location(0) pos: vec3f, @location(1) waterColor: vec3f, @location(2) normal: vec3f,
  @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32
) -> VOut {
  var out: VOut;
  out.pos = u.vp * vec4f(pos, 1.0);
  out.waterColor = waterColor;
  out.worldPos = pos;
  out.normal = normal;
  out.uv = uv;
  out.elevation = elevation;
  out.waterFlag = waterFlag;
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

  var albedo: vec3f;
  if (in.waterFlag > 0.5) {
    // Воде нет смысла давать статичную текстуру-плитку — вода должна
    // двигаться, а не быть узнаваемо повторяющимся узором. Вместо текстуры —
    // процедурная рябь (две пересекающиеся синусоиды, сдвигаются со
    // временем, fog.eye.w — секунды с начала работы страницы, см. main.ts)
    // плюс грубый Френель: чем более "в упор" смотрит камера на воду (луч
    // почти параллелен поверхности), тем ярче блик — то самое "небо
    // отражается в воде под острым углом", без честного отражения.
    let time = fog.eye.w;
    let ripple = sin(in.worldPos.x * 1.6 + time * 1.3) * cos(in.worldPos.z * 1.4 + time * 1.05) * 0.05
               + sin(in.worldPos.x * 0.5 - in.worldPos.z * 0.7 + time * 0.6) * 0.03;
    let viewDir = normalize(fog.eye.xyz - in.worldPos);
    let grazing = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 4.0);
    albedo = mix(in.waterColor * (1.0 + ripple), fog.color.rgb * 1.3, grazing * 0.5);
  } else {
    let t = clamp((in.elevation - 0.235) / (1.0 - 0.235), 0.0, 1.0);
    var a: vec3f; var b: vec3f; var blend: f32;
    // textureSample (неявный LOD через производные) запрещён WGSL внутри
    // неоднородного (per-fragment, зависящего от varying) control flow —
    // отсюда и была настоящая причина чёрного экрана: шейдер вообще не
    // компилировался (см. коммент у DECOR_SHADER — та же проблема была и
    // там), пайплайн/bind group становились невалидными, terrain и decor
    // молча переставали рисоваться целиком. textureSampleLevel с явным LOD
    // не требует производных и разрешён в любом control flow — мипмапов у
    // текстур всё равно нет, LOD 0 корректен сам по себе, не костыль.
    if (t < 0.06) {
      a = textureSampleLevel(texSand, samp, in.uv, 0.0).rgb; b = textureSampleLevel(texGrass, samp, in.uv, 0.0).rgb; blend = t / 0.06;
    } else if (t < 0.52) {
      a = textureSampleLevel(texGrass, samp, in.uv, 0.0).rgb; b = textureSampleLevel(texDry, samp, in.uv, 0.0).rgb; blend = (t - 0.06) / 0.46;
    } else if (t < 0.72) {
      a = textureSampleLevel(texDry, samp, in.uv, 0.0).rgb; b = textureSampleLevel(texScree, samp, in.uv, 0.0).rgb; blend = (t - 0.52) / 0.2;
    } else {
      a = textureSampleLevel(texScree, samp, in.uv, 0.0).rgb; b = textureSampleLevel(texRock, samp, in.uv, 0.0).rgb; blend = min(1.0, (t - 0.72) / 0.28);
    }
    albedo = mix(a, b, blend);
  }

  let lit = albedo * diffuse;
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
// materialId (см. decorMesh.ts) — какую из ДВУХ текстур ЭТОГО вида
// сэмплить: 0=ствол (trunkTex), 1=крона/куст/трава/камень (canopyTex,
// альфа-вырез — пиксели с низкой альфой не рисуются вовсе, discard, а не
// смешивание, иначе пришлось бы сортировать плоскости по глубине). Обе
// текстуры приходят в bind group КОНКРЕТНОГО вида (см. decorKinds ниже) —
// геометрия одна и та же (buildSpruceMesh и т.п.), но у ели/сосны/дуба/
// берёзы разные bind group с разными картинками в этих двух слотах,
// поэтому сама геометрия не должна знать, какая у неё кора/крона.
// tintColor — цвет ИНСТАНСА (палитра на CPU, main.ts) — лёгкий множитель
// поверх настоящей текстуры, не замена ей (небольшой разброс тона между
// соседними инстансами одной и той же карточки). Масштаб — vec3, не
// скаляр: неравномерное растяжение по осям даёт заметно разные силуэты у
// инстансов ОДНОЙ и той же геометрии почти бесплатно. shade — запечённый в
// вершину множитель яркости, см. decorMesh.ts.
const DECOR_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var trunkTex: texture_2d<f32>;
@group(0) @binding(4) var canopyTex: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f, @location(0) worldPos: vec3f, @location(1) normal: vec3f,
  @location(2) uv: vec2f, @location(3) materialId: f32, @location(4) shade: f32, @location(5) tintColor: vec3f,
};

@vertex
fn vs(
  @location(0) localPos: vec3f, @location(1) localNormal: vec3f, @location(2) materialId: f32, @location(3) shade: f32, @location(4) uv: vec2f,
  @location(5) worldPos: vec3f, @location(6) scale: vec3f, @location(7) yaw: f32, @location(8) tintColor: vec3f
) -> VOut {
  var out: VOut;
  let c = cos(yaw); let s = sin(yaw);
  let rp = vec3f(localPos.x * c - localPos.z * s, localPos.y, localPos.x * s + localPos.z * c) * scale;
  let rn = vec3f(localNormal.x * c - localNormal.z * s, localNormal.y, localNormal.x * s + localNormal.z * c);
  let wp = worldPos + rp;
  out.pos = u.vp * vec4f(wp, 1.0);
  out.worldPos = wp;
  out.normal = rn;
  out.uv = uv;
  out.materialId = materialId;
  out.shade = shade;
  out.tintColor = tintColor;
  return out;
}
@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // textureSampleLevel (не textureSample), см. коммент в TERRAIN_SHADER —
  // тут ветвление по materialId ещё явнее, обычный textureSample тут
  // вообще не компилируется.
  var base: vec4f;
  if (in.materialId > 0.5) {
    base = textureSampleLevel(canopyTex, samp, in.uv, 0.0);
    if (base.a < 0.5) { discard; }
    base = vec4f(base.rgb * in.tintColor, 1.0);
  } else {
    base = textureSampleLevel(trunkTex, samp, in.uv, 0.0);
  }
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let n = normalize(in.normal);
  // У карточек кроны/травы/куста (materialId=1) нормаль — это нормаль
  // ПЛОСКОСТИ, а не настоящего объёма листвы: если плоскость развёрнута
  // случайным yaw инстанса боком к солнцу, честный diffuse-пол 0.35 из
  // TERRAIN_SHADER гасил её почти до черноты — в реальности объём листвы
  // всё равно ловил бы рассеянный свет с других сторон. Пол повыше (0.6)
  // только для карточек — ствол (materialId=0) остаётся на обычном 0.35,
  // у него честная объёмная геометрия (гранёный конус), настоящая
  // светотень там уместна и без этой поправки.
  let diffuseFloor = select(0.35, 0.6, in.materialId > 0.5);
  let diffuse = max(diffuseFloor, dot(n, sun));
  let lit = base.rgb * diffuse * in.shade;
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

// Декор (деревья/камни/трава) — тот же инстансинг, что и маркеры, но ствол
// и крона/куст/трава/камень — настоящие текстуры (см. DECOR_SHADER,
// textures/decor/*): color тут — не полный цвет, а лёгкий тон-множитель
// ПОВЕРХ текстуры (палитра выбирается на CPU, main.ts). scale — вектор (не
// скаляр): позволяет растягивать одну и ту же геометрию неравномерно по
// осям для разнообразия силуэта без новых мешей.
export interface DecorEntity {
  x: number;
  y: number;
  z: number;
  scale: [number, number, number];
  yaw: number;
  color: [number, number, number];
  kind: "spruce" | "pine" | "broadleaf" | "autumn" | "birch" | "dead" | "bush" | "rock" | "grass";
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
  // timeSec — секунды с начала работы страницы, для процедурной анимации
  // ряби воды (см. TERRAIN_SHADER) — текстуры у воды нет и не будет
  // (статичная плитка выглядела бы хуже честной анимированной ряби), время
  // передаётся тем же общим fog-буфером, что и позиция камеры/туман,
  // отдельного uniform под одно число заводить не стали — eye.w всё равно
  // не использовался.
  setFog(eye: [number, number, number], color: [number, number, number], density: number, timeSec: number): void;
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

export async function createRenderer(device: GPUDevice, ctx: GPUCanvasContext, format: GPUTextureFormat): Promise<Renderer> {
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
  // Настоящие текстуры земли (см. textures/ground/*, сгенерированы нейросетью
  // по промптам этой сессии) вместо запечённого на CPU градиента цвета —
  // грузим ДО создания пайплайна/bind group (см. createRenderer теперь
  // async), тот же порядок, что и у моделей в main.ts: сцена не должна
  // начинать рисоваться, пока не готовы её текстуры.
  const [texSand, texGrass, texDry, texScree, texRock] = await Promise.all([
    loadTexture(device, "/textures/ground/sand.png"),
    loadTexture(device, "/textures/ground/grass.png"),
    loadTexture(device, "/textures/ground/dry_meadow.png"),
    loadTexture(device, "/textures/ground/scree.png"),
    loadTexture(device, "/textures/ground/rock.png"),
  ]);
  const groundSampler = device.createSampler({ addressModeU: "repeat", addressModeV: "repeat", magFilter: "linear", minFilter: "linear" });
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
        { arrayStride: 2 * 4, attributes: [{ shaderLocation: 3, offset: 0, format: "float32x2" }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: "float32" }] },
        { arrayStride: 4, attributes: [{ shaderLocation: 5, offset: 0, format: "float32" }] },
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
      { binding: 2, resource: groundSampler },
      { binding: 3, resource: texSand.createView() },
      { binding: 4, resource: texGrass.createView() },
      { binding: 5, resource: texDry.createView() },
      { binding: 6, resource: texScree.createView() },
      { binding: 7, resource: texRock.createView() },
    ],
  });
  // Map кусков рельефа по ключу чанка вместо одной пары буферов на всю
  // сцену — потоковая подгрузка/выгрузка вокруг камеры (см. main.ts): при
  // бесконечном мире держать вершины всей когда-либо увиденной территории
  // в одном буфере не получится.
  interface TerrainChunk {
    posBuf: GPUBuffer; colBuf: GPUBuffer; nrmBuf: GPUBuffer; uvBuf: GPUBuffer; elevBuf: GPUBuffer; waterBuf: GPUBuffer; vertexCount: number;
  }
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

  // ---- декор (деревья/камни/трава, инстансинг) ----
  // x,y,z, scale.xyz, yaw, color.rgb — тон-множитель ИНСТАНСА поверх
  // настоящей текстуры (см. DECOR_SHADER), а scale — вектор, не скаляр
  // (неравномерное растяжение по осям).
  const DECOR_INST_STRIDE_FLOATS = 10;
  const decorModule = device.createShaderModule({ code: DECOR_SHADER });
  function uploadDecorMesh(mesh: DecorMesh) {
    const buf = device.createBuffer({
      size: Math.max(mesh.vertexCount * 10 * 4, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    // Один буфер на локальный меш: pos(3)+normal(3)+materialId(1)+shade(1)+
    // uv(2) переплетены подряд на вершину — геометрия строится один раз при
    // старте, не каждый кадр, поэтому собрать один interleaved
    // Float32Array тут же на CPU проще, чем городить раздельные vertex-
    // буферы ради статичного меша.
    const interleaved = new Float32Array(mesh.vertexCount * 10);
    for (let i = 0; i < mesh.vertexCount; i++) {
      interleaved.set(mesh.positions.subarray(i * 3, i * 3 + 3), i * 10);
      interleaved.set(mesh.normals.subarray(i * 3, i * 3 + 3), i * 10 + 3);
      interleaved[i * 10 + 6] = mesh.materialIds[i];
      interleaved[i * 10 + 7] = mesh.shades[i];
      interleaved.set(mesh.uvs.subarray(i * 2, i * 2 + 2), i * 10 + 8);
    }
    device.queue.writeBuffer(buf, 0, interleaved);
    return buf;
  }
  interface DecorKindState {
    mesh: DecorMesh; localBuf: GPUBuffer; instBuf: GPUBuffer | null; instCapacity: number; instanceCount: number; bindGroup: GPUBindGroup;
  }
  // Текстуры декора (см. textures/decor/*, сгенерированы нейросетью по
  // промптам этой сессии) — уникальных файлов меньше, чем видов (bark.png
  // делят ель/сосна/дуб/сухостой/куст/трава/камень, у берёзы своя), грузим
  // каждый файл ОДИН раз и переиспользуем GPUTexture между bind group'ами
  // разных видов, а не заново фетчим один и тот же PNG по нескольку раз.
  // "rock" тут не грузится отдельным fetch'ем вовсе — это та же гранитная
  // текстура, что и у рельефа (texRock выше), незачем качать те же ~1МБ
  // с телефона дважды.
  const decorTexPaths = {
    bark: "/textures/decor/bark.png",
    birchBark: "/textures/decor/birch_bark.png",
    conifer: "/textures/decor/conifer_a.png",
    conifer2: "/textures/decor/conifer_b.png",
    broadleaf: "/textures/decor/broadleaf.png",
    autumn: "/textures/decor/autumn.png",
    birchLeaf: "/textures/decor/birch_leaf.png",
    bush: "/textures/decor/bush.png",
    grassTuft: "/textures/decor/grass_tuft.png",
  };
  type DecorTexKey = keyof typeof decorTexPaths | "rock";
  const decorTexEntries = await Promise.all(
    (Object.entries(decorTexPaths) as [DecorTexKey, string][]).map(async ([key, path]) => [key, await loadTexture(device, path)] as const)
  );
  const decorTextures = { ...Object.fromEntries(decorTexEntries), rock: texRock } as Record<DecorTexKey, GPUTexture>;
  const decorSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  // canopy у "dead"/"bush"/"grass"/"rock" — либо не используется вообще
  // (у сухостоя нет materialId=1 вершин), либо это и есть весь смысл вида;
  // trunk у "bush"/"grass"/"rock" точно так же не используется (нет
  // materialId=0 вершин) — какой текстурой заполнить неиспользуемый слот,
  // не важно, лишь бы валидный bind group.
  const decorKindSpec: Record<DecorEntity["kind"], { trunk: DecorTexKey; canopy: DecorTexKey }> = {
    spruce: { trunk: "bark", canopy: "conifer" },
    pine: { trunk: "bark", canopy: "conifer2" },
    broadleaf: { trunk: "bark", canopy: "broadleaf" },
    autumn: { trunk: "bark", canopy: "autumn" },
    birch: { trunk: "birchBark", canopy: "birchLeaf" },
    dead: { trunk: "bark", canopy: "bark" },
    bush: { trunk: "bark", canopy: "bush" },
    grass: { trunk: "bark", canopy: "grassTuft" },
    rock: { trunk: "bark", canopy: "rock" },
  };
  const decorMeshBuilders: Record<DecorEntity["kind"], () => DecorMesh> = {
    spruce: buildSpruceMesh, pine: buildPineMesh, broadleaf: buildBroadleafMesh, autumn: buildBroadleafMesh,
    birch: buildBirchMesh, dead: buildDeadTreeMesh, bush: buildBushMesh, grass: buildGrassMesh, rock: buildRockMesh,
  };
  const decorPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: decorModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 10 * 4,
          stepMode: "vertex",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
            { shaderLocation: 2, offset: 6 * 4, format: "float32" },
            { shaderLocation: 3, offset: 7 * 4, format: "float32" },
            { shaderLocation: 4, offset: 8 * 4, format: "float32x2" },
          ],
        },
        {
          arrayStride: DECOR_INST_STRIDE_FLOATS * 4,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 5, offset: 0, format: "float32x3" },
            { shaderLocation: 6, offset: 3 * 4, format: "float32x3" },
            { shaderLocation: 7, offset: 6 * 4, format: "float32" },
            { shaderLocation: 8, offset: 7 * 4, format: "float32x3" },
          ],
        },
      ],
    },
    fragment: { module: decorModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const decorKinds = new Map<DecorEntity["kind"], DecorKindState>();
  for (const kind of Object.keys(decorKindSpec) as DecorEntity["kind"][]) {
    const mesh = decorMeshBuilders[kind]();
    const spec = decorKindSpec[kind];
    const bindGroup = device.createBindGroup({
      layout: decorPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: fogBuf } },
        { binding: 2, resource: decorSampler },
        { binding: 3, resource: decorTextures[spec.trunk].createView() },
        { binding: 4, resource: decorTextures[spec.canopy].createView() },
      ],
    });
    decorKinds.set(kind, { mesh, localBuf: uploadDecorMesh(mesh), instBuf: null, instCapacity: 0, instanceCount: 0, bindGroup });
  }

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
    prev?.uvBuf.destroy();
    prev?.elevBuf.destroy();
    prev?.waterBuf.destroy();
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
    const uvBuf = device.createBuffer({
      size: Math.max(mesh.uvs.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const elevBuf = device.createBuffer({
      size: Math.max(mesh.elevations.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const waterBuf = device.createBuffer({
      size: Math.max(mesh.waterFlags.byteLength, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(posBuf, 0, mesh.positions);
    device.queue.writeBuffer(colBuf, 0, mesh.colors);
    device.queue.writeBuffer(nrmBuf, 0, mesh.normals);
    device.queue.writeBuffer(uvBuf, 0, mesh.uvs);
    device.queue.writeBuffer(elevBuf, 0, mesh.elevations);
    device.queue.writeBuffer(waterBuf, 0, mesh.waterFlags);
    terrainChunks.set(key, { posBuf, colBuf, nrmBuf, uvBuf, elevBuf, waterBuf, vertexCount: mesh.vertexCount });
  }

  function removeTerrainChunk(key: string) {
    const chunk = terrainChunks.get(key);
    if (!chunk) return;
    chunk.posBuf.destroy();
    chunk.colBuf.destroy();
    chunk.nrmBuf.destroy();
    chunk.uvBuf.destroy();
    chunk.elevBuf.destroy();
    chunk.waterBuf.destroy();
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
      data[o + 3] = e.scale[0]; data[o + 4] = e.scale[1]; data[o + 5] = e.scale[2];
      data[o + 6] = e.yaw;
      data[o + 7] = e.color[0]; data[o + 8] = e.color[1]; data[o + 9] = e.color[2];
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

  function setFog(eye: [number, number, number], color: [number, number, number], density: number, timeSec: number) {
    const data = new Float32Array([eye[0], eye[1], eye[2], timeSec, color[0], color[1], color[2], density]);
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
        pass.setVertexBuffer(3, chunk.uvBuf);
        pass.setVertexBuffer(4, chunk.elevBuf);
        pass.setVertexBuffer(5, chunk.waterBuf);
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
      // Bind group теперь СВОЙ на каждый вид (разные текстуры коры/кроны,
      // см. decorKindSpec выше) — переключается перед draw() этого вида, не
      // один общий на все сразу, как раньше.
      for (const state of decorKinds.values()) {
        if (state.instanceCount === 0 || !state.instBuf) continue;
        pass.setBindGroup(0, state.bindGroup);
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
