// =============================================================================
// Замер пустой полосы внизу текстур декора — Фаза 32.
// =============================================================================
// Куст и трава — это billboard-карточки без ствола (см. decorMesh.ts): вся их
// геометрия — прямоугольник с натянутой картинкой. Если у картинки внизу есть
// полностью прозрачное поле, видимое растение начинается выше основания
// карточки — и висит в воздухе. Ровно на это автор и пожаловался.
//
// Лечится сдвигом карточки вниз на высоту этой полосы (BUSH_TEX_PAD/
// GRASS_TEX_PAD в decorMesh.ts), но само число — свойство КАРТИНКИ, а не
// кода: заменили картинку — число устарело, и куст снова повиснет либо
// уйдёт в землю. Этот скрипт его и меряет.
//
//     node tools/measure_decor_padding.mjs
//
// Порог альфы тот же, по которому шейдер выбрасывает пиксель (a < 0.5, см.
// DECOR_SHADER в engine/src/renderer.ts) — меряем ровно то, что видно.
//
// Деревьев это не касается: у них есть ствол — настоящая геометрия от самой
// земли, — и он их держит независимо от полей на картинке кроны. Они тут
// показаны для сравнения, править их не нужно.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "textures", "decor");
const CUTOFF = 128; // 0.5 в шейдере

// Минимальный разбор PNG: только то, что нужно для альфы — IHDR, IDAT,
// распаковка zlib и обратная фильтрация построчно. Тащить зависимость ради
// одного канала одного формата незачем.
function readPngAlpha(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("не PNG");
  let off = 8, w = 0, h = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (depth !== 8) throw new Error("поддерживается только 8 бит на канал, тут " + depth);
  if (interlace !== 0) throw new Error("чересстрочный PNG не поддерживается");
  const channels = color === 6 ? 4 : color === 4 ? 2 : color === 2 ? 3 : 1;
  if (channels !== 4 && channels !== 2) return { w, h, alpha: null }; // без альфы мерить нечего
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(w * h);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    raw.copy(cur, 0, p, p + stride); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let v = cur[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) out[y * w + x] = cur[x * channels + (channels - 1)];
    prev.set(cur);
  }
  return { w, h, alpha: out };
}

const files = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".png")).sort();
console.log("Пустая полоса внизу текстур декора (порог альфы 0.5, как в шейдере)\n");
console.log("текстура            размер     строк снизу   доля высоты");
for (const name of files) {
  const { w, h, alpha } = readPngAlpha(readFileSync(join(DIR, name)));
  if (!alpha) { console.log(`${name.padEnd(20)}${(w + "x" + h).padEnd(11)}без альфы`); continue; }
  let bottom = -1;
  for (let y = h - 1; y >= 0 && bottom < 0; y--) {
    for (let x = 0; x < w; x++) if (alpha[y * w + x] >= CUTOFF) { bottom = y; break; }
  }
  const pad = bottom < 0 ? h : h - 1 - bottom;
  console.log(`${name.padEnd(20)}${(w + "x" + h).padEnd(11)}${String(pad).padEnd(14)}${(pad / h * 100).toFixed(2)}%   (${pad}/${h})`);
}
console.log("\nПравки нужны только тем, у кого нет ствола — bush.png и grass_tuft.png:");
console.log("BUSH_TEX_PAD / GRASS_TEX_PAD в engine/src/decorMesh.ts.");
