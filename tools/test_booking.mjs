// Стенд для брони точки сбора (gatherBooked). Запуск: node tools/test_booking.mjs
//
// Резерв точки списывается ПРИ ОТПРАВКЕ отряда (mp-gather уменьшает amount
// сразу), и вернуть его обязаны три места: конец сбора, снятие со сбора и
// увод отряда с дороги. Ошибка в любую сторону дорого стоит: не вернули —
// жила навсегда показывается истощённой; вернули лишнее — ресурсы появляются
// из воздуха. Поэтому предикат проверяется отдельно и на всех состояниях.
//
// gatherBooked живёт дословной копией в mp-redirect и mp-recall (редактор
// Edge Functions в Dashboard не тянет импорты) — стенд заодно сверяет, что
// копии не разъехались.
import fs from "fs";

function pick(file) {
  const src = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const i = src.indexOf("function gatherBooked(m) {");
  if (i < 0) throw new Error("gatherBooked не найдена в " + file);
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) return src.slice(i, k + 1); }
  }
  throw new Error("не разобрал тело в " + file);
}
const a = pick("../supabase/functions/mp-redirect/index.js");
const b = pick("../supabase/functions/mp-recall/index.js");

let failed = 0;
const ok = (c, m) => { if (!c) failed++; console.log((c ? "  ok  " : "ПРОВАЛ") + "  " + m); };
ok(a === b, "копии в mp-redirect и mp-recall совпадают дословно");

const gatherBooked = new Function("m", pick("../supabase/functions/mp-redirect/index.js") + "\nreturn gatherBooked(m);");
const M = (state, data) => ({ state, data });
const cell = { take: 500, cell_x: 10, cell_y: 20 };

console.log("--- новые марши, флаг проставлен ---");
ok(gatherBooked(M("go",     { ...cell, booked: true })),  "идёт к точке — резерв за нами");
ok(gatherBooked(M("gather", { ...cell, booked: true })),  "копает — резерв за нами");
ok(!gatherBooked(M("back",  { ...cell, booked: false })), "везёт добычу домой — резерв ВЫБРАН, возвращать нечего");
ok(!gatherBooked(M("go",    { ...cell, booked: false })), "уже вернули — второй раз не возвращаем");

console.log("--- старые марши, флага нет ---");
ok(gatherBooked(M("go",     { ...cell })), "идёт к точке — считаем за нами (прежнее поведение)");
ok(gatherBooked(M("gather", { ...cell })), "копает — считаем за нами");
ok(!gatherBooked(M("back",  { ...cell })), "везёт домой — НЕ возвращаем: добыча уже у отряда");
ok(!gatherBooked(M("hold",  { ...cell })), "стоит на позиции — не сбор");

console.log("--- вырожденные ---");
ok(!gatherBooked(M("go", { take: 0, cell_x: 1, cell_y: 2, booked: true })), "нулевой резерв");
ok(!gatherBooked(M("go", { take: 500, booked: true })), "точка неизвестна — координат нет");
ok(!gatherBooked(M("go", null)), "марш без данных");
ok(!gatherBooked(null), "марша нет вовсе");

process.on("exit", () => {
  if (failed) { console.log("\nПРОВАЛОВ: " + failed); process.exitCode = 1; }
  else console.log("\nвсё сошлось");
});
