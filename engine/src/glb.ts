/* =========================================================================
   Разбор GLB — дословный порт loadGLB() из obyom-3d-infinite.html (тот же
   ручной парсинг JSON+BIN чанков, те же accessor'ы), только без GL-вызовов
   в конце: тут только данные (позиции/нормали/UV/индексы/картинка), сама
   загрузка в GPU — отдельно, в modelRenderer.ts, и уже под WebGPU.
   ========================================================================= */

export interface ParsedGLB {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array;
  imageBytes: ArrayBuffer;
  imageMimeType: string;
}

const CTYPE: Record<number, any> = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export async function loadGLB(url: string): Promise<ParsedGLB> {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("не glTF-контейнер: " + url);
  const length = dv.getUint32(8, true);
  let off = 12;
  let json: any = null;
  let bin: ArrayBuffer | null = null;
  while (off < length) {
    const clen = dv.getUint32(off, true), ctype = dv.getUint32(off + 4, true);
    const cdata = buf.slice(off + 8, off + 8 + clen);
    if (ctype === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(cdata));
    else if (ctype === 0x004e4942) bin = cdata;
    off += 8 + clen;
  }
  if (!json || !bin) throw new Error("GLB без JSON/BIN чанка: " + url);

  const acc = (i: number) => json.accessors[i];
  const bv = (i: number) => json.bufferViews[i];
  function accArr(i: number) {
    const a = acc(i), v = bv(a.bufferView), Ctor = CTYPE[a.componentType];
    const byteOff = (v.byteOffset || 0) + (a.byteOffset || 0);
    return new Ctor(bin!, byteOff, a.count * NCOMP[a.type]);
  }

  const prim = json.meshes[0].primitives[0];
  const positions = accArr(prim.attributes.POSITION) as Float32Array;
  const normals = accArr(prim.attributes.NORMAL) as Float32Array;
  const uvs = accArr(prim.attributes.TEXCOORD_0) as Float32Array;
  const indices = accArr(prim.indices) as Uint16Array | Uint32Array;

  const mat = json.materials[prim.material];
  const bcIdx = mat.pbrMetallicRoughness.baseColorTexture.index;
  const img = json.images[json.textures[bcIdx].source];
  const iv = bv(img.bufferView);
  const imageBytes = bin.slice(iv.byteOffset || 0, (iv.byteOffset || 0) + iv.byteLength);

  return { positions, normals, uvs, indices, imageBytes, imageMimeType: img.mimeType };
}
