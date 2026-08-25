/* =========================================================================
   Строит вершинный буфер чанка рельефа ТЕМ ЖЕ кодом, что и движок
   (buildTerrainPatch из engine/src/terrainMesh.ts, поверх настоящих
   heightmap/*.bin), и кладёт его в .vtx для офлайн-рендера — см.
   tools/render_terrain.py рядом.

   Формат — тот же interleaved, что и setTerrainChunk в renderer.ts:
   pos(3) color(3) normal(3) uv(2) elevation(1) water(1) forest(1)
   moisture(1) = 15 float на вершину, без индексов (меш нерандексованный).

   Модули движка нужно сперва собрать в один ESM-файл, иначе node не
   разрешит относительные импорты .ts:

     printf 'export { loadHeightmapData, heightAt, HMAX } from "/путь/engine/src/terrain";\nexport { buildTerrainPatch } from "/путь/engine/src/terrainMesh";\n' > /tmp/entry.ts
     npx esbuild /tmp/entry.ts --bundle --format=esm --outfile=/tmp/mods/engine.mjs
     node tools/gen_terrain_chunk.mjs /tmp/mods 930 120 40 1 /tmp/chunk
   ========================================================================= */
import fs from "fs";
globalThis.fetch = async (u) => {
  const p = "/home/user/4-" + u;
  const b = fs.readFileSync(p);
  return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
};
const terrain = await import(process.argv[2] + "/engine.mjs");
const mesh = terrain;
await terrain.loadHeightmapData();
const [cx, cz, half, step] = process.argv.slice(3, 7).map(Number);
const m = mesh.buildTerrainPatch(cx - half, cz - half, cx + half, cz + half, step, 0);
// Тот же interleaved формат, что и setTerrainChunk в renderer.ts:
// pos(3) color(3) normal(3) uv(2) elevation(1) water(1) forest(1) moisture(1) = 15
const n = m.vertexCount;
const out = new Float32Array(n * 15);
for (let i = 0; i < n; i++) {
  const o = i * 15;
  out[o] = m.positions[i*3]; out[o+1] = m.positions[i*3+1]; out[o+2] = m.positions[i*3+2];
  out[o+3] = m.colors[i*3]; out[o+4] = m.colors[i*3+1]; out[o+5] = m.colors[i*3+2];
  out[o+6] = m.normals[i*3]; out[o+7] = m.normals[i*3+1]; out[o+8] = m.normals[i*3+2];
  out[o+9] = m.uvs[i*2]; out[o+10] = m.uvs[i*2+1];
  out[o+11] = m.elevations[i]; out[o+12] = m.waterFlags[i];
  out[o+13] = m.forestFracs[i]; out[o+14] = m.moistureFracs[i];
}
fs.writeFileSync(process.argv[7] + ".vtx", Buffer.from(out.buffer));
console.log("вершин:", n, "| высота в центре:", terrain.heightAt(cx, cz).toFixed(3), "* HMAX", terrain.HMAX);
