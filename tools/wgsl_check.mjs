/* =========================================================================
   Валидация всех WGSL-шейдеров движка без запуска WebGPU.

   WGSL компилируется только в рантайме, уже на устройстве игрока: опечатка в
   шейдере не ловится ни tsc, ни сборкой vite — она доезжает до человека
   чёрным экраном. В песочнице, где эти шейдеры правятся, WebGPU нет вовсе
   (navigator.gpu отсутствует даже у headless-хрома), так что проверить их
   живьём тут нечем.

   Скрипт вытаскивает все литералы вида  const NAME = /* wgsl *\/ `...`  из
   engine/src/*.ts, подставляет немногочисленные JS-вставки ${...} и
   прогоняет каждый через naga — тот же валидатор, что стоит за WebGPU в
   браузере (проект wgpu).

     cargo install naga-cli
     node tools/wgsl_check.mjs <куда-класть-.wgsl> <SHADOW_MAP_SIZE>
   ========================================================================= */
// Вытаскивает все WGSL-шейдеры из engine/src/*.ts и прогоняет их через naga
// (валидатор из того же wgpu, что стоит за WebGPU в браузере). WebGPU в этой
// песочнице нет вовсе, а WGSL компилируется только в рантайме — без такой
// проверки ошибка в шейдере доезжает до игрока чёрным экраном.
import fs from "fs"; import { execFileSync } from "child_process";
import path from "path";
const OUT = process.argv[2];
const CONST = { SHADOW_MAP_SIZE: Number(process.argv[3]) };
let bad = 0, n = 0;
for (const f of fs.readdirSync("engine/src").filter(x => x.endsWith(".ts"))) {
  const src = fs.readFileSync(path.join("engine/src", f), "utf8");
  const re = /const\s+(\w+)\s*=\s*\/\* wgsl \*\/\s*`([\s\S]*?)`;/g;
  let m;
  while ((m = re.exec(src))) {
    const [, name, raw] = m;
    // подставляем те немногие JS-вставки, что есть в шейдерах
    const code = raw.replace(/\$\{([^}]*)\}/g, (_, expr) => {
      const fn = new Function(...Object.keys(CONST), "return (" + expr + ");");
      return String(fn(...Object.values(CONST)));
    });
    const tmp = path.join(OUT, `${f.replace(/\.ts$/, "")}.${name}.wgsl`);
    fs.writeFileSync(tmp, code);
    n++;
    try {
      execFileSync("naga", ["--stdin-file-path", tmp, tmp], { stdio: ["ignore", "pipe", "pipe"] });
      console.log("OK   " + f + " / " + name);
    } catch (e) {
      bad++;
      console.log("БЕДА " + f + " / " + name);
      console.log((e.stderr || e.stdout || "").toString().split("\n").slice(0, 18).map(l => "     " + l).join("\n"));
    }
  }
}
console.log(bad ? `\nРЕЗУЛЬТАТ: ${bad} из ${n} шейдеров не проходят валидацию` : `\nРЕЗУЛЬТАТ: OK, все ${n} шейдеров валидны`);
process.exit(bad ? 1 : 0);
