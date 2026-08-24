// Печёт КОМПАКТНУЮ карту воды для сервера (supabase/functions/*).
//
// Зачем: Edge Functions судят о воде по процедурной формуле (rwHeightAt) —
// у них нет настоящих данных высот. Замер показал, что эта формула не видит
// 96% настоящей воды: сервер спокойно ставит точки/лагеря прямо в реки, а
// игрок видит их в воде, потому что 3D рисует НАСТОЯЩИЙ рельеф.
//
// Сам heightmap/elevation-v6.bin — 5.76 МБ, в функцию его не зашить и качать
// на каждый вызов незачем. Здесь он сжимается до битовой маски с шагом
// WATER_MASK_STEP клеток: 1 бит на блок, блок считается водой, если мокра
// ЛЮБАЯ его клетка (консервативно — лучше лишний запас у берега, чем точка
// в реке). Получается ~29 КБ base64 — столько не жалко зашить прямо в файл
// функции, и никаких внешних загрузок в рантайме.
//
// Запуск:  node worldgen/bake_water_mask.mjs
// Результат печатается в worldgen/water_mask_v1.txt (base64 одной строкой)
// и вставляется в supabase/functions/*/index.js как WATER_MASK_B64.
import fs from "fs";

const W=2400, H=1200, ELEV_SCALE=2.5, SEA=0.235;
const STEP=4;                       // клеток мира на один бит маски
const src=fs.readFileSync("heightmap/elevation-v6.bin");
const elev=new Uint16Array(src.buffer, src.byteOffset, src.byteLength/2);
if(elev.length!==W*H) throw new Error("размер elevation-v6.bin не совпал: "+elev.length);

const mw=Math.ceil(W/STEP), mh=Math.ceil(H/STEP);
const bits=new Uint8Array(Math.ceil(mw*mh/8));
let wet=0;
for(let by=0;by<mh;by++) for(let bx=0;bx<mw;bx++){
  let any=false;
  for(let dy=0;dy<STEP&&!any;dy++) for(let dx=0;dx<STEP&&!any;dx++){
    const px=bx*STEP+dx, py=by*STEP+dy;
    if(px<W&&py<H && elev[py*W+px]*(ELEV_SCALE/65535)<SEA) any=true;
  }
  if(any){ const i=by*mw+bx; bits[i>>3]|=1<<(i&7); wet++; }
}
const b64=Buffer.from(bits).toString("base64");
fs.writeFileSync("worldgen/water_mask_v1.txt", b64);
console.log(`сетка ${mw}x${mh} (шаг ${STEP} кл), воды ${(100*wet/(mw*mh)).toFixed(1)}%`);
console.log(`маска: ${(bits.length/1024).toFixed(0)} КБ сырых -> ${(b64.length/1024).toFixed(0)} КБ base64`);
console.log("записано: worldgen/water_mask_v1.txt");
