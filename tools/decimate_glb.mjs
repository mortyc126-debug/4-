/* =========================================================================
   Подготовка моделей походов к отдаче в игру.

   Автор рисует и выгружает фигуры генералов/армий/разведчиков в models/
   generals/*.glb «как есть» из редактора: по ~17 МБ штука (полмиллиона
   треугольников и три 2K-текстуры — normal/basecolor/roughness-metallic),
   269 МБ на все шестнадцать. В браузер такое не отдашь: для сравнения,
   модели замков, которые в игре уже живут, весят 2-3 МБ при ~20 тыс.
   треугольников.

   Что тут делается:
     1. От материала отвязываются все карты, кроме базового цвета — движок
        (engine/src/glb.ts) читает ТОЛЬКО baseColorTexture, остальные две
        лежали мёртвым грузом на 1.6 МБ;
     2. сетка упрощается meshoptimizer'ом до TARGET_TRIS треугольников;
     3. базовая текстура пережимается в JPEG со стороной не больше TEX;
     4. prune() выкидывает всё, на что после этого никто не ссылается.

   Раскладка вершин принудительно SEPARATE: gltf-transform по умолчанию
   пишет чересстрочно, а движок ждёт три отдельных плотных вершинных буфера
   (см. комментарий у accArr в engine/src/glb.ts — теперь он и чересстрочные
   переживёт, но плодить лишнюю работу на загрузке незачем).

   Пакеты не в зависимостях репозитория — инструмент разовый, ставится по
   месту:
     npm i @gltf-transform/core @gltf-transform/functions meshoptimizer sharp

   Запуск (соответствие имён — в march_models_map.txt рядом):
     node tools/decimate_glb.mjs "models/generals/Алдрик.glb" models/marches/gen-human-0.glb
   Переменные окружения: TARGET_TRIS (по умолчанию 20000), TEX (1024).
   ========================================================================= */
import { NodeIO, VertexLayout } from "@gltf-transform/core";
import { simplify, textureCompress, prune, dedup, weld, resample } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const TARGET_TRIS = Number(process.env.TARGET_TRIS || 20000);
const TEX = Number(process.env.TEX || 1024);

const [src, dst] = process.argv.slice(2);
await MeshoptSimplifier.ready;
// SEPARATE, а не по умолчанию INTERLEAVED: движковый разборщик
// (engine/src/glb.ts) читает каждый атрибут как ПЛОТНЫЙ типизированный
// массив (new Float32Array(bin, off, count*n)), да и сам WebGPU-пайплайн
// в modelRenderer.ts объявляет три отдельных вершинных буфера с шагом
// 12/12/8 байт. Чересстрочная раскладка (byteStride=32 на все три
// атрибута) молча дала бы кашу вместо модели.
const io = new NodeIO().setVertexLayout(VertexLayout.SEPARATE);
const doc = await io.read(src);
const root = doc.getRoot();

// исходная статистика
let tris0 = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const i = p.getIndices();
  tris0 += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3;
}

// движок (engine/src/glb.ts) читает ТОЛЬКО baseColorTexture — normal/rm
// в GLB лежат мёртвым грузом (1.6 МБ на модель). Отвязываем их от материала,
// prune() потом выкинет и картинки, и bufferView'ы.
for (const mat of root.listMaterials()) {
  mat.setNormalTexture(null);
  mat.setMetallicRoughnessTexture(null);
  mat.setOcclusionTexture(null);
  mat.setEmissiveTexture(null);
}

await doc.transform(
  dedup(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TARGET_TRIS / tris0), error: 0.02, lockBorder: false }),
  textureCompress({ encoder: sharp, targetFormat: "jpeg", resize: [TEX, TEX], quality: 82 }),
  prune(),
);

let tris1 = 0, verts1 = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  const i = p.getIndices();
  tris1 += (i ? i.getCount() : p.getAttribute("POSITION").getCount()) / 3;
  verts1 += p.getAttribute("POSITION").getCount();
}
// габариты — чтобы понимать, в каком масштабе ставить модель в мир
const pos = root.listMeshes()[0].listPrimitives()[0].getAttribute("POSITION");
const mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9], e = [0,0,0];
for (let k = 0; k < pos.getCount(); k++) { pos.getElement(k, e); for (let a=0;a<3;a++){ if(e[a]<mn[a])mn[a]=e[a]; if(e[a]>mx[a])mx[a]=e[a]; } }

await io.write(dst, doc);
const s0 = fs.statSync(src).size, s1 = fs.statSync(dst).size;
console.log(`${path.basename(dst).padEnd(18)} ${(s0/1048576).toFixed(1)}MB -> ${(s1/1048576).toFixed(2)}MB | tris ${tris0} -> ${tris1} | verts ${verts1} | bbox ${mn.map(v=>v.toFixed(2))} .. ${mx.map(v=>v.toFixed(2))}`);
