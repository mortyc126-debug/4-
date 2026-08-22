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
import { ortho, look, mul, type Vec3, type Mat4 } from "./mat4";

// Направление НА солнце — должно дословно совпадать с "sun" внутри
// TERRAIN_SHADER/DECOR_SHADER (обычная подсветка по нормали) и здесь же
// определяет, откуда теневая камера "смотрит" на сцену: одно и то же
// солнце и красит поверхности, и отбрасывает тени, иначе они бы не
// совпадали по направлению (тень падала бы не в ту сторону от подсветки).
const SUN_DIR: Vec3 = (() => {
  const [x, y, z] = [0.62, 0.38, 0.3];
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
})();
// Ортографическая "камера" солнца следует за целью игрока (см. setSunTarget),
// не за всей бесконечной картой — полный охват невозможен и не нужен:
// видимая в любой момент область — то же окно, что уже покрывает ближний
// детальный рельеф (CHUNK_SIZE×LOAD_RADIUS в main.ts, ~48 клеток от камеры
// в каждую сторону). EXTENT чуть шире этого радиуса, с запасом на то, что
// сам объект-кастер может стоять чуть за кромкой видимой области, а тень
// от него — падать в кадр.
export const SHADOW_MAP_SIZE = 2048;
const SHADOW_EXTENT = 60;
const SHADOW_DIST = 100; // расстояние от цели до "глаза" теневой камеры вдоль SUN_DIR
const SHADOW_NEAR = 1;
const SHADOW_FAR = 220;

// Суша красится настоящими текстурами (см. textures.ts/textures/ground/*),
// не запечённым на CPU градиентом цвета — 7 текстур участвуют в смеси по
// высоте (elevation, те же пороги, что раньше вёл groundColor():
// 0.06/0.55/0.74), по влажности региона и по лесным пятнам/снежным пикам —
// раньше низина в любой точке карты красилась ОДНОЙ и той же травой, автор
// заметил, что мир выглядит "хаотично раскиданным и равномерно
// перемешанным". На месте старой ступеньки grass→dry_meadow по высоте —
// смесь grass/dry_meadow по влажности в ЛЮБОЙ точке низины: пышный луг там,
// где влажно, сухая степь там, где сухо, читаемые издалека пятна, а не одна
// и та же трава-везде. Внутри лесных пятен равнина темнеет до forestFloor —
// земля под пологом леса читается лесной, не той же травой. На самых
// высоких и при этом "холодных" (coldnessAt) пиках — настоящая снежная
// текстура (не каждая гора снежная — разные хребты по-разному холодны, та
// же логика "не всё одинаковое"). texSnow/texForestFloor — те же две
// текстуры, что автор прислал по промптам из предыдущего ответа этой
// сессии (снег и лесная подстилка).
//
// Влажность и лесистость (in.moistureFrac/in.forestFrac) теперь настоящие
// данные (ESA WorldCover, см. terrain.ts:moistureAt/forestMaskAt) — CPU
// считает их в вершинах меша (terrainMesh.ts) и кладёт атрибутами, шейдер
// просто интерполирует, WGSL-порт для них не нужен. hash2/noiseAt/
// coldnessAt — единственное, что ещё честный WGSL-порт одноимённых функций
// terrain.ts (тот же SEED=12345, то же смещение +921) — coldnessAt остался
// процедурным (нет открытого climate-датасета, доступного из этой
// песочницы, см. её комментарий в terrain.ts), не общий импорт — между TS и
// WGSL кода не разделить, тот же приём дублирования с синхронной правкой,
// что и у collisionOk между index.html/mp-*.
// Вода текстуры не сэмплит вообще — она плоская и цвет ей уже посчитан на
// CPU (см. terrainMesh.ts), waterFlag просто выбирает, какую ветку взять.
const TERRAIN_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
struct Fog { eye: vec4f, color: vec4f };
struct Light { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var texSand: texture_2d<f32>;
@group(0) @binding(4) var texGrass: texture_2d<f32>;
@group(0) @binding(5) var texDry: texture_2d<f32>;
@group(0) @binding(6) var texScree: texture_2d<f32>;
@group(0) @binding(7) var texRock: texture_2d<f32>;
@group(0) @binding(8) var<uniform> light: Light;
@group(0) @binding(9) var shadowSamp: sampler_comparison;
@group(0) @binding(10) var shadowTex: texture_depth_2d;
@group(0) @binding(11) var texSnow: texture_2d<f32>;
@group(0) @binding(12) var texForestFloor: texture_2d<f32>;
// desert/marsh/tundraMoss — вторая партия текстур по промптам автора этой
// сессии (см. комментарий выше TERRAIN_SHADER, moistureAt/coldnessAt):
// раньше засушливая низина, заболоченный берег и холодный склон ниже
// снеговой линии рисовались той же травой/сушняком/голым камнем, что и
// везде — biome-поля уже были посчитаны, не хватало именно текстур под них.
@group(0) @binding(13) var texDesert: texture_2d<f32>;
@group(0) @binding(14) var texMarsh: texture_2d<f32>;
@group(0) @binding(15) var texTundraMoss: texture_2d<f32>;
// Вода была чисто процедурной (рябь синусоидами + плоский цвет, без единой
// текстуры) — texWaterDetail добавляет настоящую поверхностную деталь
// (см. использование в fs() воды ниже), не заменяя рябь/Френель, а
// домешиваясь поверх них.
@group(0) @binding(16) var texWaterDetail: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f, @location(0) waterColor: vec3f, @location(1) worldPos: vec3f,
  @location(2) normal: vec3f, @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32,
  @location(6) lightClip: vec4f, @location(7) forestFrac: f32, @location(8) moistureFrac: f32,
};

@vertex
fn vs(
  @location(0) pos: vec3f, @location(1) waterColor: vec3f, @location(2) normal: vec3f,
  @location(3) uv: vec2f, @location(4) elevation: f32, @location(5) waterFlag: f32, @location(6) forestFrac: f32,
  @location(7) moistureFrac: f32
) -> VOut {
  var out: VOut;
  out.pos = u.vp * vec4f(pos, 1.0);
  out.waterColor = waterColor;
  out.worldPos = pos;
  out.normal = normal;
  out.uv = uv;
  out.elevation = elevation;
  out.waterFlag = waterFlag;
  out.lightClip = light.vp * vec4f(pos, 1.0);
  out.forestFrac = forestFrac;
  out.moistureFrac = moistureFrac;
  return out;
}
// Доля света, дошедшая до точки: 1.0 — на свету, 0.0 — в тени. clip —
// позиция точки в клип-пространстве СОЛНЦА (ортографическая проекция, см.
// setSunTarget ниже), не основной камеры. За пределами теневой карты
// (ndc вне [-1,1] по XY или [0,1] по Z) точка вне охвата карты — считаем
// освещённой, а не тёмной: обрыв на границе куда заметнее, чем отсутствие
// тени там, где её и не считали. 3×3 PCF (усреднение по соседним текс
// елям) смягчает ступенчатую границу тени — с одной выборкой на пиксель
// карты 2048×2048 на объекте с чётким краем (дерево, скала) была бы
// заметная лесенка.
// ---- Порт terrain.ts:hash2/noise/coldnessAt (см. комментарий выше
// TERRAIN_SHADER — держать в синхроне с исходником при правке). moistureAt
// раньше был тут же — теперь настоящие данные (moisture.bin, см.
// terrain.ts), приходит как атрибут вершины in.moistureFrac, WGSL-версия
// не нужна (тот же приём, что и у forestFrac).
// bitcast<u32> от i32 даёт то же двоичное представление отрицательных
// координат, что и неявный ToInt32/ToUint32 в JS-версии — умножение в u32
// в WGSL переполняется (wrap) по модулю 2^32 так же, как усечение до
// младших 32 бит в JS, поэтому результат совпадает бит-в-бит.
fn hash2(xi: i32, yi: i32, s: i32) -> f32 {
  var h: u32 = bitcast<u32>(xi) * 374761393u + bitcast<u32>(yi) * 668265263u + bitcast<u32>(s) * 1274126177u;
  h = h ^ (h >> 13u);
  h = h * 1274126177u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}
fn noiseAt(x: f32, y: f32, s: i32) -> f32 {
  let xi = floor(x); let yi = floor(y);
  let xf = x - xi; let yf = y - yi;
  let u = xf * xf * (3.0 - 2.0 * xf);
  let v = yf * yf * (3.0 - 2.0 * yf);
  let xii = i32(xi); let yii = i32(yi);
  let a = hash2(xii, yii, s); let b = hash2(xii + 1, yii, s);
  let c = hash2(xii, yii + 1, s); let d = hash2(xii + 1, yii + 1, s);
  return (a * (1.0 - u) + b * u) * (1.0 - v) + (c * (1.0 - u) + d * u) * v;
}
fn coldnessAt(x: f32, y: f32) -> f32 {
  return noiseAt(x / 260.0, y / 260.0, 13266); // SEED+921
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
  // Затенение — тут, не на CPU (см. terrainMesh.ts): нормаль пришла с CPU
  // ужё сглаженной (аналитический градиент heightAt в точке), а тут ещё и
  // интерполируется между вершинами треугольника — мягкий переход, а не
  // одна плоская яркость на весь треугольник.
  let sun = normalize(vec3f(0.62, 0.38, 0.30));
  let n = normalize(in.normal);
  let ndotl = max(0.0, dot(n, sun));
  let shadow = shadowFactor(in.lightClip);
  // Раньше ambient был плоским скаляром (max(0.35, ...)) — тень читалась
  // просто как более тёмная версия ТОЙ ЖЕ текстуры, без единого намёка на
  // атмосферу. Автор прямым текстом: мир должен выглядеть как у AAA-игр, а
  // не "на отъебись" — здесь та самая разница. Полусферный ambient вместо
  // скаляра: тон зависит от того, куда смотрит нормаль (n.y) — вверх, к
  // "небу" (светлее, ближе к тёплой золотой дымке FOG_COLOR ниже) или вниз,
  // к "земле" (темнее, глубже, тот же золотисто-пергаментный дух, что и
  // тема интерфейса, GILT в index.html, просто в тени). Прямой свет солнца
  // добавляется ПОВЕРХ этого как отдельный тёплый golden-hour тон, а не
  // просто множитель яркости — тень и свет теперь разного ЦВЕТА, не только
  // разной яркости одного и того же цвета. Числа держать в одном
  // семействе тона с FOG_COLOR (main.ts) и SUN_LIGHT ниже — та же палитра,
  // что и у DECOR_SHADER/MODEL_SHADER (modelRenderer.ts), иначе здания и
  // деревья светились бы иначе, чем земля под ними.
  let skyTint = vec3f(0.42, 0.37, 0.28);
  let groundTint = vec3f(0.20, 0.16, 0.13);
  let sunLightColor = vec3f(0.85, 0.70, 0.48);
  let hemi = mix(groundTint, skyTint, clamp(n.y * 0.5 + 0.5, 0.0, 1.0));
  let lighting = hemi + sunLightColor * ndotl * shadow;

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
    let base = mix(in.waterColor * (1.0 + ripple), fog.color.rgb * 1.3, grazing * 0.5);
    // Лёгкая настоящая деталь поверх (не взамен) процедурной ряби/Френеля —
    // своя UV-сетка (не in.uv, у неё период GROUND_TILE земли, слишком
    // крупный для воды) с медленным сдвигом по времени, только по X —
    // течение в одну сторону читается честнее, чем дрейф по диагонали без
    // всякого направления. Низкий вес (0.16) — деталь, не замена цвета.
    let waterUV = in.worldPos.xz * 0.12 + vec2f(time * 0.015, 0.0);
    let detailC = textureSampleLevel(texWaterDetail, samp, waterUV, 0.0).rgb;
    albedo = mix(base, base * (0.7 + detailC * 0.6), 0.16);
  } else {
    // Знаменатель был (1.0-0.235) — под старый синтетический потолок высоты
    // ~1.0. Настоящие данные высот (terrain.ts) регулярно доходят до ~2.34
    // — со старым знаменателем весь мир выше ~0.765 щёлкал бы в t=1 (голый
    // камень/снег) независимо от настоящей высоты, единообразно серым.
    let t = clamp((in.elevation - 0.235) / (2.34 - 0.235), 0.0, 1.0);
    // textureSample (неявный LOD через производные) запрещён WGSL внутри
    // неоднородного (per-fragment, зависящего от varying) control flow —
    // это уже раз было настоящей причиной чёрного экрана (см. коммент у
    // DECOR_SHADER — та же проблема была и там). Раньше это обходили веткой
    // if/else if, каждая из которых сэмплила только 2 нужные текстуры —
    // теперь сэмплим все 5 БЕЗУСЛОВНО (textureSampleLevel и так не требует
    // производных, ветвление было не обязательным, только экономило
    // выборки) и смешиваем чистой математикой — заодно снимает сам вопрос
    // о однородности control flow: сэмплы больше не внутри if вообще.
    let sandC = textureSampleLevel(texSand, samp, in.uv, 0.0).rgb;
    let grassC = textureSampleLevel(texGrass, samp, in.uv, 0.0).rgb;
    let dryC = textureSampleLevel(texDry, samp, in.uv, 0.0).rgb;
    let screeC = textureSampleLevel(texScree, samp, in.uv, 0.0).rgb;
    let rockC = textureSampleLevel(texRock, samp, in.uv, 0.0).rgb;
    let snowC = textureSampleLevel(texSnow, samp, in.uv, 0.0).rgb;
    let forestFloorC = textureSampleLevel(texForestFloor, samp, in.uv, 0.0).rgb;
    let desertC = textureSampleLevel(texDesert, samp, in.uv, 0.0).rgb;
    let marshC = textureSampleLevel(texMarsh, samp, in.uv, 0.0).rgb;
    let tundraMossC = textureSampleLevel(texTundraMoss, samp, in.uv, 0.0).rgb;
    // "Цвет равнины" в ЭТОЙ точке — не всегда grass: сухая степь (dryC) и
    // пышный луг (grassC) смешиваются по moistureAt (см. комментарий выше
    // TERRAIN_SHADER) — та самая замена одной ступеньки по высоте на
    // читаемое региональное пятно. desertC — третий, ещё более сухой полюс:
    // dryC ("сухой луг") сам по себе не читается как настоящая пустыня —
    // при moist→0 подмешиваем к нему desertC (трещины/дюны, без травы
    // вообще), к moist=0.3 полностью переходя обратно на dryC/grassC-мешь.
    // Дальше в лесных пятнах это же поле "равнины" темнеет до forestFloorC:
    // земля под пологом леса читается лесной, не той же травой, что и
    // открытый луг рядом. in.forestFrac — НАСТОЯЩАЯ доля древесного покрова
    // (ESA WorldCover, см. terrain.ts:forestMaskAt) — та же величина, что
    // main.ts читает для расстановки самих деревьев, интерполированная с
    // вершин как обычный атрибут (см. terrainMesh.ts), а не пересчитанная
    // тут заново синтетическим шумом, как было раньше (два независимых
    // приближения одного и того же поля неизбежно расходились — деревья
    // стояли не совсем там, где земля уже читалась лесной).
    let moist = in.moistureFrac;
    let dryPole = mix(desertC, dryC, smoothstep(0.0, 0.3, moist));
    let forest = in.forestFrac;
    var lowland = mix(mix(dryPole, grassC, moist), forestFloorC, forest);
    // Топь — узкое кольцо НИЗКОЙ (но не пляжной — не пересекается с
    // sand-переходом ниже) высоты при высокой влажности: не "весь низкий
    // берег топкий", а именно сырые низины у воды в сыром регионе. Бугор
    // (не порог) по t — сначала растёт от 0.02, потом гаснет к 0.24, чтобы
    // не тянуться в предгорья.
    let wetT = smoothstep(0.02, 0.12, t) * (1.0 - smoothstep(0.12, 0.24, t)) * smoothstep(0.55, 0.85, moist);
    lowland = mix(lowland, marshC, wetT);
    var albedoLand: vec3f;
    if (t < 0.06) {
      albedoLand = mix(sandC, lowland, t / 0.06);
    } else if (t < 0.55) {
      albedoLand = lowland;
    } else if (t < 0.74) {
      albedoLand = mix(lowland, screeC, (t - 0.55) / 0.19);
    } else {
      albedoLand = mix(screeC, rockC, min(1.0, (t - 0.74) / 0.26));
    }
    // Мох/лишайник на холодных склонах НИЖЕ снеговой линии — coldnessAt то
    // же поле, что и у снега ниже (не высота горы решает, а региональный
    // "климат": один голый каменистый склон, соседний — мшистый). Кэп 0.7 —
    // не полностью замещает scree/rock текстуру, только тонирует пятнами,
    // сама скальная порода остаётся видна.
    let cold = coldnessAt(in.worldPos.x, in.worldPos.z);
    let mossT = smoothstep(0.55, 0.72, t) * smoothstep(0.3, 0.65, cold) * 0.7;
    let withMoss = mix(albedoLand, tundraMossC, mossT);
    // Иней на самых высоких пиках — но не на каждом одинаково: та же
    // coldnessAt, часть хребтов остаётся голым камнем, другая часть —
    // заснежена, как на настоящей карте кампании, а не "снег строго после
    // такой-то отметки везде". Настоящая текстура (texSnow) вместо прежнего
    // плоского белого тона.
    let snowT = smoothstep(0.9, 1.0, t) * smoothstep(0.35, 0.75, cold);
    albedo = mix(withMoss, snowC, snowT);
  }

  let lit = albedo * lighting;
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
struct Light { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<uniform> fog: Fog;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var trunkTex: texture_2d<f32>;
@group(0) @binding(4) var canopyTex: texture_2d<f32>;
@group(0) @binding(5) var<uniform> light: Light;
@group(0) @binding(6) var shadowSamp: sampler_comparison;
@group(0) @binding(7) var shadowTex: texture_depth_2d;

struct VOut {
  @builtin(position) pos: vec4f, @location(0) worldPos: vec3f, @location(1) normal: vec3f,
  @location(2) uv: vec2f, @location(3) materialId: f32, @location(4) shade: f32, @location(5) tintColor: vec3f,
  @location(6) lightClip: vec4f,
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
  out.lightClip = light.vp * vec4f(wp, 1.0);
  return out;
}
// Дословная копия shadowFactor из TERRAIN_SHADER — отдельные строки
// шейдеров (createShaderModule компилирует каждую независимо), общий
// WGSL-модуль на оба пайплайна тут не заводили нигде в файле, дублирование
// тут того же порядка, что и у тумана (см. MARKER_SHADER/TERRAIN_SHADER).
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
  // всё равно ловил бы рассеянный свет с других сторон — раньше поднимали
  // плоский ambient-пол (0.6 вместо 0.35) для карточек. Теперь ambient не
  // плоский скаляр, а полусферный тон (тот же приём и та же палитра, что
  // и в TERRAIN_SHADER — держать в синхроне при правке, иначе деревья
  // светились бы другим тоном, чем земля под ними): canopyBoost — тот же
  // избыточный "пол" для карточек кроны/травы/куста, просто как добавка к
  // цветному ambient, а не замена скаляра другим скаляром.
  let canopyBoost = select(0.0, 0.22, in.materialId > 0.5);
  let ndotl = max(0.0, dot(n, sun));
  let shadow = shadowFactor(in.lightClip);
  let skyTint = vec3f(0.42, 0.37, 0.28);
  let groundTint = vec3f(0.20, 0.16, 0.13);
  let sunLightColor = vec3f(0.85, 0.70, 0.48);
  let hemi = mix(groundTint, skyTint, clamp(n.y * 0.5 + 0.5, 0.0, 1.0)) + vec3f(canopyBoost);
  let lighting = hemi + sunLightColor * ndotl * shadow;
  let lit = base.rgb * lighting * in.shade;
  let d = distance(in.worldPos, fog.eye.xyz);
  let k = d * fog.color.w; let f = clamp(1.0 - exp(-k * k), 0.0, 1.0);
  return vec4f(mix(lit, fog.color.rgb, f), 1.0);
}
`;

// ---- теневая карта: depth-only проход ДО основного кадра, из "глаз"
// солнца (ортографическая проекция — параллельный пучок, как и положено
// солнцу, см. setSunTarget ниже) в отдельную depth-текстуру. Рельеф и
// декор — то, что реально бросает узнаваемую тень (холм на долину, дерево
// на траву) — единственные два кастера; сами .glb-модели (города/лагеря/
// точки) сюда осознанно не включены (см. план сессии: тени для них — уже
// отдельный, куда более тяжёлый кусок работы через modelRenderer.ts, не
// оправдан для маленьких построек с их и так узнаваемым силуэтом).
//
// Рельефу тут не нужен фрагментный шейдер вообще — суша непрозрачна,
// глубина сама себя пишет через builtin, fragment-стадия у пайплайна ниже
// просто отсутствует (легально в WebGPU, когда нет цветовых таргетов).
const TERRAIN_SHADOW_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@vertex
fn vs(@location(0) pos: vec3f) -> @builtin(position) vec4f {
  return u.vp * vec4f(pos, 1.0);
}
`;

// Декору, в отличие от рельефа, нужен фрагментный шейдер даже в теневом
// проходе — крона/трава/куст (materialId=1) это плоскость с alpha-cutout
// текстурой (см. DECOR_SHADER), а не честный объём: депth-only без выреза
// по альфе отбросил бы тень целого прямоугольника карточки, а не силуэт
// листвы. Ствол (materialId=0) — просто непрозрачная геометрия, ему тест
// не нужен, sampler на trunkTex в этом проходе поэтому не заводим вовсе.
const DECOR_SHADOW_SHADER = /* wgsl */ `
struct Uniforms { vp: mat4x4f };
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var canopyTex: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) materialId: f32 };

@vertex
fn vs(
  @location(0) localPos: vec3f, @location(2) materialId: f32, @location(4) uv: vec2f,
  @location(5) worldPos: vec3f, @location(6) scale: vec3f, @location(7) yaw: f32
) -> VOut {
  var out: VOut;
  let c = cos(yaw); let s = sin(yaw);
  let rp = vec3f(localPos.x * c - localPos.z * s, localPos.y, localPos.x * s + localPos.z * c) * scale;
  out.pos = u.vp * vec4f(worldPos + rp, 1.0);
  out.uv = uv;
  out.materialId = materialId;
  return out;
}
@fragment
fn fs(in: VOut) {
  if (in.materialId > 0.5) {
    let a = textureSampleLevel(canopyTex, samp, in.uv, 0.0).a;
    if (a < 0.5) { discard; }
  }
}
`;

// ---- небо: раньше канва просто чистилась в плоский FOG_COLOR — ни горизонта,
// ни солнца, ни облаков, только сплошной цвет фона. Полноценный купол неба
// (сфера/кубическая карта) не нужен — дешевле full-screen треугольник (3
// вершины без вершинного буфера, классический приём) с лучом обзора,
// восстановленным ПРЯМО ПО ПИКСЕЛЮ в фрагментном шейдере через тот же базис
// камеры (xAxis/yAxis/zAxis + tanHalf/aspect), что уже считает pixelRay() в
// main.ts для выбора сущности под пальцем — те же формулы, ту же картину,
// что игрок и так видит корректно (клик по объекту уже проверен этим
// базисом), поэтому доверяю ему и тут без отдельной 3D-геометрии купола.
// Рисуется ПЕРВЫМ в основном проходе (см. frame() ниже), с выключенной
// записью глубины и depthCompare "always" — земля/декор/здания, отрисованные
// следом, перекрывают его как обычно через свой depth-тест.
//
// Солнце — не отдельный спрайт-биллборд (тот требовал бы собственной
// геометрии четырёхугольника, разворачиваемой к камере каждый кадр), а
// аналитический диск/гало ПРЯМО в этом же фрагментном шейдере: угол между
// лучом обзора и фиксированным направлением на солнце (то самое SUN_DIR, что
// уже освещает рельеф/декор/здания — держать в одном семействе, иначе
// светящаяся точка в небе не совпадала бы с направлением теней на земле).
// Резкий smoothstep — маленький яркий диск, широкий pow — мягкое гало вокруг.
//
// Облака — тайловый слой (textures/sky/clouds.png, с альфой) поверх базового
// неба, спроецированный той же equirectangular UV, что и само небо, с
// медленным сдвигом по времени (только по долготе — единое направление
// дрейфа, не хаотичный снос) и затуханием у горизонта (dir.y около 0) —
// иначе плоская проекция тянула бы текстуру в нечитаемые полосы на грани
// экрана купола.
const SKY_SHADER = /* wgsl */ `
struct SkyCam { xAxis: vec4f, yAxis: vec4f, zAxis: vec4f, params: vec4f };
@group(0) @binding(0) var<uniform> cam: SkyCam;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var texSky: texture_2d<f32>;
@group(0) @binding(3) var texClouds: texture_2d<f32>;

struct VOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f };

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VOut;
  // z=0.9999 (не ровно 1.0) — небольшой запас от самой границы clip-объёма
  // NDC z∈[0,1] на случай погрешности округления на границе на слабом/
  // софтверном драйвере; depthCompare:"always" всё равно не сравнивает эту
  // глубину ни с чем, запас нужен только чтобы примитив не срезало клиппингом.
  out.pos = vec4f(corners[vi], 0.9999, 1.0);
  out.ndc = corners[vi];
  return out;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let tanHalf = cam.params.x;
  let aspect = cam.params.y;
  let time = cam.params.z;
  let dir = normalize(in.ndc.x * aspect * tanHalf * cam.xAxis.xyz + in.ndc.y * tanHalf * cam.yAxis.xyz - cam.zAxis.xyz);
  let u = atan2(dir.x, dir.z) / 6.28318531 + 0.5;
  let v = clamp(0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265, 0.0, 1.0);
  var color = textureSampleLevel(texSky, samp, vec2f(u, v), 0.0).rgb;

  // Тот же SUN_DIR, что и в TERRAIN_SHADER/DECOR_SHADER/MODEL_SHADER —
  // держать в синхроне при правке общего направления света.
  let sunDir = normalize(vec3f(0.62, 0.38, 0.30));
  let sunDot = dot(dir, sunDir);
  let sunColor = vec3f(1.0, 0.92, 0.75);
  let sunDisc = smoothstep(0.9985, 0.9997, sunDot);
  let sunGlow = pow(max(0.0, sunDot), 220.0) * 0.6;
  color = mix(color, sunColor, sunDisc) + sunColor * sunGlow;

  let cloudUV = vec2f(u * 3.0 + time * 0.006, v * 1.5);
  let cloudTex = textureSampleLevel(texClouds, samp, cloudUV, 0.0);
  let cloudAlpha = cloudTex.a * smoothstep(0.05, 0.35, dir.y);
  color = mix(color, cloudTex.rgb, cloudAlpha);

  return vec4f(color, 1.0);
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
  // Куда сейчас смотрит игрок (cam.target из main.ts, не позиция глаза
  // камеры) — ортографическая теневая камера следует за этой точкой (см.
  // SHADOW_EXTENT выше): пересчитывает light-VP и решает, какие чанки
  // рельефа вообще стоит рисовать в теневой проход (см. frame() ниже),
  // остальное вне SHADOW_EXTENT от неё тени всё равно бы не бросило в
  // кадр. Достаточно дёшево, чтобы звать каждый кадр, как setVP/setFog.
  setSunTarget(x: number, z: number): void;
  // Базис камеры для фонового неба (см. SKY_SHADER) — те же xAxis/yAxis/
  // zAxis/tanHalf/aspect, что main.ts:pixelRay() уже считает для клика по
  // сущности, плюс время (секунды) для дрейфа облаков.
  setSkyCamera(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3, tanHalf: number, aspect: number, timeSec: number): void;
  // Даёт настоящим .glb-моделям (main.ts/modelRenderer.ts) доступ к той же
  // теневой карте, что уже используют рельеф/декор — модели тени не
  // бросают (отдельный, более тяжёлый кусок работы, осознанно не сделан в
  // этом проходе), но ПРИНИМАТЬ их обязаны: иначе город/лагерь, стоящий
  // прямо в тени склона или дерева, выглядел бы приклеенным поверх сцены —
  // единственный объект без тени в кадре, где тени уже повсюду на земле.
  getShadowResources(): ShadowResources;
  // drawExtra — вызывается ВНУТРИ того же render pass, что рельеф и маркеры
  // (общий depth-буфер, единая VP-камера), после них: сюда вешаются
  // настоящие .glb-модели (см. main.ts/modelRenderer.ts) без отдельного
  // прохода ради экономии на очистке/depth-тексте.
  frame(clearColor: GPUColorDict, drawExtra?: (pass: GPURenderPassEncoder) => void): void;
}

export interface ShadowResources {
  lightBuf: GPUBuffer;
  shadowView: GPUTextureView;
  shadowSampler: GPUSampler;
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

  // ---- тень ----
  // lightBuf несёт ту же mat4x4f, что и uniformBuf, только это VP теневой
  // (ортографической) камеры солнца, а не игрока — используется дважды:
  // как единственный uniform у depth-only проходов рельефа/декора (см.
  // TERRAIN_SHADOW_SHADER/DECOR_SHADOW_SHADER) и как ДОПОЛНИТЕЛЬНАЯ entry в
  // основных bind group рельефа/декора (см. ниже), чтобы их вершинные
  // шейдеры могли посчитать lightClip для сэмплинга тени во фрагментном.
  const lightBuf = device.createBuffer({
    size: 16 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const shadowTex = device.createTexture({
    size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE],
    format: "depth32float",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const shadowView = shadowTex.createView();
  // compare: "less" — тот же смысл, что и depthCompare пайплайнов: сэмпл
  // возвращает 1.0, когда СОХРАНЁННАЯ в карте глубина МЕНЬШЕ переданного
  // порога (ndc.z - bias в шейдере), то есть между светом и точкой карты
  // НЕТ более близкого к свету объекта — точка освещена.
  const shadowSampler = device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" });
  let lightVP: Mat4 = ortho(-1, 1, -1, 1, 0.1, 1);
  let sunTargetX = 0, sunTargetZ = 0;
  function setSunTarget(x: number, z: number) {
    sunTargetX = x; sunTargetZ = z;
    const eye: Vec3 = [x + SUN_DIR[0] * SHADOW_DIST, SUN_DIR[1] * SHADOW_DIST, z + SUN_DIR[2] * SHADOW_DIST];
    const view = look(eye, [x, 0, z], [0, 1, 0]);
    const proj = ortho(-SHADOW_EXTENT, SHADOW_EXTENT, -SHADOW_EXTENT, SHADOW_EXTENT, SHADOW_NEAR, SHADOW_FAR);
    lightVP = mul(proj, view);
    device.queue.writeBuffer(lightBuf, 0, lightVP);
  }

  // ---- рельеф ----
  // Настоящие текстуры земли (см. textures/ground/*, сгенерированы нейросетью
  // по промптам этой сессии) вместо запечённого на CPU градиента цвета —
  // грузим ДО создания пайплайна/bind group (см. createRenderer теперь
  // async), тот же порядок, что и у моделей в main.ts: сцена не должна
  // начинать рисоваться, пока не готовы её текстуры.
  // texSnow/texForestFloor — те же две из промптов автора этой сессии (см.
  // комментарий выше TERRAIN_SHADER): раньше снег был плоским процедурным
  // тоном (mix к белому), лесная подстилка не существовала вовсе (густой
  // лес стоял на обычной grass/dry_meadow, как и открытое поле).
  const [texSand, texGrass, texDry, texScree, texRock, texSnow, texForestFloor, texDesert, texMarsh, texTundraMoss, texWaterDetail] = await Promise.all([
    loadTexture(device, "/textures/ground/sand.png"),
    loadTexture(device, "/textures/ground/grass.png"),
    loadTexture(device, "/textures/ground/dry_meadow.png"),
    loadTexture(device, "/textures/ground/scree.png"),
    loadTexture(device, "/textures/ground/rock.png"),
    loadTexture(device, "/textures/ground/snow.png"),
    loadTexture(device, "/textures/ground/forest_floor.png"),
    loadTexture(device, "/textures/ground/desert.png"),
    loadTexture(device, "/textures/ground/marsh.png"),
    loadTexture(device, "/textures/ground/tundra_moss.png"),
    loadTexture(device, "/textures/water/detail.png"),
  ]);
  const groundSampler = device.createSampler({ addressModeU: "repeat", addressModeV: "repeat", magFilter: "linear", minFilter: "linear" });
  const terrainModule = device.createShaderModule({ code: TERRAIN_SHADER });
  const terrainPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: terrainModule,
      entryPoint: "vs",
      // Один interleaved буфер на чанк (pos+color+normal+uv+elevation+water+
      // forestFrac+moistureFrac подряд на вершину), не восемь раздельных —
      // раньше на ~130
      // одновременно загруженных чанков (ближние+дальнее кольцо) выходило
      // до 780 отдельных GPU-буферов только на рельеф; у слабого/софтверного
      // GPU-драйвера (в т.ч. в этой песочнице, см. коммит про device.lost)
      // само количество объектов даёт заметные накладные расходы, не только
      // байты. См. TerrainChunk/setTerrainChunk ниже — тот же приём
      // interleaving, что уже был у декора.
      buffers: [
        {
          arrayStride: 15 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x3" },
            { shaderLocation: 1, offset: 3 * 4, format: "float32x3" },
            { shaderLocation: 2, offset: 6 * 4, format: "float32x3" },
            { shaderLocation: 3, offset: 9 * 4, format: "float32x2" },
            { shaderLocation: 4, offset: 11 * 4, format: "float32" },
            { shaderLocation: 5, offset: 12 * 4, format: "float32" },
            { shaderLocation: 6, offset: 13 * 4, format: "float32" },
            { shaderLocation: 7, offset: 14 * 4, format: "float32" },
          ],
        },
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
      { binding: 8, resource: { buffer: lightBuf } },
      { binding: 9, resource: shadowSampler },
      { binding: 10, resource: shadowView },
      { binding: 11, resource: texSnow.createView() },
      { binding: 12, resource: texForestFloor.createView() },
      { binding: 13, resource: texDesert.createView() },
      { binding: 14, resource: texMarsh.createView() },
      { binding: 15, resource: texTundraMoss.createView() },
      { binding: 16, resource: texWaterDetail.createView() },
    ],
  });

  // ---- небо (см. комментарий у SKY_SHADER выше) — full-screen треугольник,
  // рисуется первым в основном проходе (см. frame() ниже), своя маленькая
  // uniform-структура SkyCam (базис камеры + tanHalf/aspect/время), без
  // вершинного буфера вообще (3 вершины из vertex_index).
  const [texSky, texClouds] = await Promise.all([
    loadTexture(device, "/textures/sky/sky.png"),
    loadTexture(device, "/textures/sky/clouds.png"),
  ]);
  const skySampler = device.createSampler({ addressModeU: "repeat", addressModeV: "clamp-to-edge", magFilter: "linear", minFilter: "linear" });
  const skyCamBuf = device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const skyModule = device.createShaderModule({ code: SKY_SHADER });
  const skyPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: skyModule, entryPoint: "vs" },
    fragment: { module: skyModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    // depthWriteEnabled:false + "always" — небо рисуется первым, но не
    // может выиграть depth-тест ни у чего, что нарисуется следом (земля/
    // декор/здания честно перекрывают его через свой обычный тест).
    depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
  });
  const skyBindGroup = device.createBindGroup({
    layout: skyPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: skyCamBuf } },
      { binding: 1, resource: skySampler },
      { binding: 2, resource: texSky.createView() },
      { binding: 3, resource: texClouds.createView() },
    ],
  });
  // xAxis/yAxis/zAxis/tanHalf/aspect — тот же базис, что main.ts:pixelRay()
  // уже считает для рейкаста по клику (см. комментарий у SKY_SHADER) —
  // вызывающая сторона (main.ts:draw()) передаёт готовые векторы, тут
  // только упаковка в uniform-буфер.
  function setSkyCamera(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3, tanHalf: number, aspect: number, timeSec: number) {
    const data = new Float32Array([
      xAxis[0], xAxis[1], xAxis[2], 0,
      yAxis[0], yAxis[1], yAxis[2], 0,
      zAxis[0], zAxis[1], zAxis[2], 0,
      tanHalf, aspect, timeSec, 0,
    ]);
    device.queue.writeBuffer(skyCamBuf, 0, data);
  }
  // Depth-only проход для теневой карты (см. TERRAIN_SHADOW_SHADER выше) —
  // тот же вершинный буфер чанка (interleaved, позиция в первых 3 float),
  // но со своим пайплайном/bind group: НЕ переиспользуем terrainPipeline
  // ни для чего, кроме основного прохода — у него уже есть весь набор
  // текстур/тумана, который тут не нужен и не должен участвовать в
  // компиляции depth-only варианта.
  const terrainShadowModule = device.createShaderModule({ code: TERRAIN_SHADOW_SHADER });
  const terrainShadowPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: terrainShadowModule,
      entryPoint: "vs",
      // Тот же interleaved-буфер, что и у основного пайплайна (см.
      // setTerrainChunk ниже) — stride обязан совпадать (15*4), даже
      // читая только позицию: иначе шаг между вершинами разъедется с тем,
      // как буфер реально упакован, и глубина возьмётся из чужого байта.
      buffers: [{ arrayStride: 15 * 4, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }],
    },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
  });
  const terrainShadowBindGroup = device.createBindGroup({
    layout: terrainShadowPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: lightBuf } }],
  });
  // Map кусков рельефа по ключу чанка вместо одной пары буферов на всю
  // сцену — потоковая подгрузка/выгрузка вокруг камеры (см. main.ts): при
  // бесконечном мире держать вершины всей когда-либо увиденной территории
  // в одном буфере не получится. minX/maxX/minZ/maxZ — AABB чанка в мировых
  // координатах (заполняется в setTerrainChunk ниже) — используются только
  // для того, чтобы теневой проход мог пропускать чанки заведомо вне
  // SHADOW_EXTENT от текущей цели камеры (см. frame()), а не гонять через
  // depth-only пайплайн вообще все загруженные чанки, включая дальнее
  // грубое кольцо (см. main.ts FAR_*), которое почти никогда не пересекает
  // тень настолько тесную, как окно ближнего рельефа.
  interface TerrainChunk { buf: GPUBuffer; vertexCount: number; minX: number; maxX: number; minZ: number; maxZ: number }
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
    mesh: DecorMesh; localBuf: GPUBuffer; instBuf: GPUBuffer | null; instCapacity: number; instanceCount: number;
    bindGroup: GPUBindGroup; shadowBindGroup: GPUBindGroup;
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
  // Общий vertex-layout для основного и теневого пайплайнов декора — можно
  // объявлять больше атрибутов, чем реально читает конкретный вершинный
  // шейдер (DECOR_SHADOW_SHADER использует только часть локаций, см. выше),
  // лишние entries тут не мешают: WebGPU валидирует только то, что шейдер
  // ДЕЙСТВИТЕЛЬНО использует, и одна и та же пара GPU-буферов (localBuf +
  // instBuf конкретного вида) подходит под оба пайплайна без переделки.
  const decorVertexBuffers: GPUVertexBufferLayout[] = [
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
  ];
  const decorPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: decorModule, entryPoint: "vs", buffers: decorVertexBuffers },
    fragment: { module: decorModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
  });
  const decorShadowModule = device.createShaderModule({ code: DECOR_SHADOW_SHADER });
  const decorShadowPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module: decorShadowModule, entryPoint: "vs", buffers: decorVertexBuffers },
    fragment: { module: decorShadowModule, entryPoint: "fs", targets: [] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" },
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
        { binding: 5, resource: { buffer: lightBuf } },
        { binding: 6, resource: shadowSampler },
        { binding: 7, resource: shadowView },
      ],
    });
    const shadowBindGroup = device.createBindGroup({
      layout: decorShadowPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: lightBuf } },
        { binding: 1, resource: decorSampler },
        { binding: 2, resource: decorTextures[spec.canopy].createView() },
      ],
    });
    decorKinds.set(kind, { mesh, localBuf: uploadDecorMesh(mesh), instBuf: null, instCapacity: 0, instanceCount: 0, bindGroup, shadowBindGroup });
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
    prev?.buf.destroy();
    const buf = device.createBuffer({
      size: Math.max(mesh.vertexCount * 15 * 4, 4),
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const interleaved = new Float32Array(mesh.vertexCount * 15);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < mesh.vertexCount; i++) {
      const px = mesh.positions[i * 3], pz = mesh.positions[i * 3 + 2];
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
      interleaved.set(mesh.positions.subarray(i * 3, i * 3 + 3), i * 15);
      interleaved.set(mesh.colors.subarray(i * 3, i * 3 + 3), i * 15 + 3);
      interleaved.set(mesh.normals.subarray(i * 3, i * 3 + 3), i * 15 + 6);
      interleaved.set(mesh.uvs.subarray(i * 2, i * 2 + 2), i * 15 + 9);
      interleaved[i * 15 + 11] = mesh.elevations[i];
      interleaved[i * 15 + 12] = mesh.waterFlags[i];
      interleaved[i * 15 + 13] = mesh.forestFracs[i];
      interleaved[i * 15 + 14] = mesh.moistureFracs[i];
    }
    device.queue.writeBuffer(buf, 0, interleaved);
    terrainChunks.set(key, { buf, vertexCount: mesh.vertexCount, minX, maxX, minZ, maxZ });
  }

  function removeTerrainChunk(key: string) {
    const chunk = terrainChunks.get(key);
    if (!chunk) return;
    chunk.buf.destroy();
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

    // ---- теневой проход: depth-only в shadowTex, отдельный render pass ДО
    // основного (общий encoder — одна отправка на GPU, не два submit()).
    // Терраин-чанки культятся по AABB (см. TerrainChunk выше) против
    // SHADOW_EXTENT вокруг цели камеры — дальнее грубое кольцо рельефа
    // (main.ts, FAR_*) почти всегда снаружи этого окна и не тратит впустую
    // draw call на тень, которую всё равно никто не увидит.
    {
      const shadowPass = encoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      const sMinX = sunTargetX - SHADOW_EXTENT, sMaxX = sunTargetX + SHADOW_EXTENT;
      const sMinZ = sunTargetZ - SHADOW_EXTENT, sMaxZ = sunTargetZ + SHADOW_EXTENT;
      if (terrainChunks.size > 0) {
        shadowPass.setPipeline(terrainShadowPipeline);
        shadowPass.setBindGroup(0, terrainShadowBindGroup);
        for (const chunk of terrainChunks.values()) {
          if (chunk.vertexCount === 0) continue;
          if (chunk.maxX < sMinX || chunk.minX > sMaxX || chunk.maxZ < sMinZ || chunk.minZ > sMaxZ) continue;
          shadowPass.setVertexBuffer(0, chunk.buf);
          shadowPass.draw(chunk.vertexCount);
        }
      }
      let anyDecorShadow = false;
      for (const state of decorKinds.values()) if (state.instanceCount > 0) { anyDecorShadow = true; break; }
      if (anyDecorShadow) {
        shadowPass.setPipeline(decorShadowPipeline);
        for (const state of decorKinds.values()) {
          if (state.instanceCount === 0 || !state.instBuf) continue;
          shadowPass.setBindGroup(0, state.shadowBindGroup);
          shadowPass.setVertexBuffer(0, state.localBuf);
          shadowPass.setVertexBuffer(1, state.instBuf);
          shadowPass.draw(state.mesh.vertexCount, state.instanceCount);
        }
      }
      shadowPass.end();
    }

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

    // Небо — первым, до земли: перекрывается обычным depth-тестом всего,
    // что рисуется дальше (см. depthCompare:"always" у skyPipeline — само
    // небо ни у чего не выигрывает).
    pass.setPipeline(skyPipeline);
    pass.setBindGroup(0, skyBindGroup);
    pass.draw(3);

    if (terrainChunks.size > 0) {
      pass.setPipeline(terrainPipeline);
      pass.setBindGroup(0, terrainBindGroup);
      for (const chunk of terrainChunks.values()) {
        if (chunk.vertexCount === 0) continue;
        pass.setVertexBuffer(0, chunk.buf);
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

  function getShadowResources(): ShadowResources {
    return { lightBuf, shadowView, shadowSampler };
  }

  return { setTerrainChunk, removeTerrainChunk, setMarkers, setDecor, setVP, setFog, setSunTarget, setSkyCamera, getShadowResources, frame };
}
