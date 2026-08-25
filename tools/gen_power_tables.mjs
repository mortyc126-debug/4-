// =============================================================================
// Генератор таблиц мощи для сервера — Фаза 31.
// =============================================================================
// Мощь (power) до сих пор считалась ТОЛЬКО в браузере: колонка players.power
// в базе никогда не заполнялась, а весь расчёт жил в index.html (power()/
// mpPower()). Для рейтингов и для итога на экране гибели она нужна на
// сервере, а серверные функции самодостаточны (Dashboard-редактор не тянет
// относительные импорты, см. любой заголовок supabase/functions/*).
//
// Копировать в них таблицы построек (19 штук по 25 строк) и исследований
// целиком — это десятки килобайт в каждую функцию, причём ради ОДНОГО поля
// .power из каждой строки. Поэтому здесь из index.html вынимается ровно оно:
// компактные массивы чисел, по одному на здание и на технологию.
//
// Почему генератор, а не копия руками: у копии нет способа заметить, что
// исходная таблица в index.html изменилась, а её отражение на сервере — нет.
// Тут это одна команда:
//
//     node tools/gen_power_tables.mjs            # напечатать блок
//     node tools/gen_power_tables.mjs --check    # сверить с тем, что в коде
//
// --check читает уже вставленные копии (_shared/rules.js, mp-join, mp-tick) и
// падает с ненулевым кодом, если хоть одна разошлась с index.html.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "index.html"), "utf8");

// Вырезаем нужные объявления из index.html и выполняем их в изоляции. Парсить
// JS регулярками ради таблиц чисел смысла нет — это и есть JS, пусть его
// разбирает сам движок; сторонних зависимостей и побочных эффектов в этих
// объявлениях нет, только литералы массивов и объектов.
function slice(startMarker, endMarker) {
  const i = src.indexOf(startMarker);
  if (i < 0) throw new Error("не найдено начало: " + startMarker);
  const j = src.indexOf(endMarker, i);
  if (j < 0) throw new Error("не найден конец: " + endMarker);
  return src.slice(i, j);
}

const parts = [
  slice("const BUILD_TABLE=[", "const PROD_TABLE="),
  slice("const WALL_TABLE=[", "const BUILDING_TABLE={"),
  slice("const BUILDING_TABLE={", "const CFG = {"),
  // Один кусок на RS_*-массивы И RESEARCH_TABLE разом: она объявлена сразу
  // за ними, до RESEARCH_GROWTH, и вырезать её отдельно значило бы объявить
  // те же имена дважды.
  slice("const RS_BALLISTICS =", "const RESEARCH_GROWTH="),
  slice("const RESEARCH_GROWTH=", "function researchTime"),
  slice("const ACADEMY_TREE = {", "function tierUnlockedFor"),
  slice("const GEAR_POWER=", "function gearItemStats"),
  slice("const UNIT_POWER=", "const TROOP_TYPES = {"),
];
const evaluated = new Function(parts.join("\n") + `
  return { BUILDING_TABLE, RESEARCH_TABLE, ACADEMY_TREE, GEAR_POWER, UNIT_POWER,
           RESEARCH_POWER_WAVE, RESEARCH_POWER_BASE };
`)();

const { BUILDING_TABLE, RESEARCH_TABLE, ACADEMY_TREE, GEAR_POWER, UNIT_POWER,
        RESEARCH_POWER_WAVE, RESEARCH_POWER_BASE } = evaluated;

// --- Мощь построек: по одному массиву на здание, индекс = уровень-1 --------
const buildPower = {};
for (const bk of Object.keys(BUILDING_TABLE)) {
  buildPower[bk] = BUILDING_TABLE[bk].map((r) => r.power || 0);
}

// --- Мощь исследований: по одному массиву на технологию -------------------
// Узлы, у которых нет строки в RESEARCH_TABLE, считаются формулой-запасом
// (см. researchPower в index.html) — их сюда не кладём вовсе, формула
// повторена в самом коде мощи.
const rschPower = {};
for (const id of Object.keys(RESEARCH_TABLE)) {
  rschPower[id] = RESEARCH_TABLE[id].map((r) => r.power || 0);
}
// Ветка/волна нужны той самой формуле-запасу — по одному числу на узел,
// дешевле, чем тащить на сервер весь ACADEMY_TREE ради двух полей.
const rschMeta = {};
for (const arr of [ACADEMY_TREE.eco, ACADEMY_TREE.mil]) {
  for (const n of arr) rschMeta[n.id] = [n.wave, n.branch === "mil" ? 1 : 0];
}

const rows = (o) => Object.keys(o).map((k) => `  ${k}: [${o[k].join(",")}],`).join("\n");

const out = `// --- НАЧАЛО СГЕНЕРИРОВАННОГО БЛОКА (tools/gen_power_tables.mjs) ---
// Таблицы мощи, вынутые из index.html. НЕ ПРАВИТЬ РУКАМИ: правьте исходные
// таблицы в index.html и перегенерируйте (node tools/gen_power_tables.mjs).
// Сверить, не разошлись ли копии: node tools/gen_power_tables.mjs --check
const POWER_BUILD = {
${rows(buildPower)}
};
const POWER_RSCH = {
${rows(rschPower)}
};
// id технологии -> [волна, ветка] (0=eco, 1=mil) для формулы-запаса у узлов
// без своей строки в таблице (см. researchPower в index.html).
const POWER_RSCH_META = {
${Object.keys(rschMeta).map((k) => `  ${k}: [${rschMeta[k].join(",")}],`).join("\n")}
};
const POWER_RSCH_WAVE = {${Object.keys(RESEARCH_POWER_WAVE).map((k) => `${k}:${RESEARCH_POWER_WAVE[k]}`).join(",")}};
const POWER_RSCH_BASE = [${RESEARCH_POWER_BASE.eco},${RESEARCH_POWER_BASE.mil}];
const POWER_UNIT = [${UNIT_POWER.join(",")}];
const POWER_GEAR = [${GEAR_POWER.join(",")}];
// --- КОНЕЦ СГЕНЕРИРОВАННОГО БЛОКА ---`;

const TARGETS = [
  "supabase/functions/_shared/rules.js",
  "supabase/functions/mp-join/index.js",
  "supabase/functions/mp-tick/index.js",
];
const BEGIN = "// --- НАЧАЛО СГЕНЕРИРОВАННОГО БЛОКА (tools/gen_power_tables.mjs) ---";
const END = "// --- КОНЕЦ СГЕНЕРИРОВАННОГО БЛОКА ---";

if (process.argv.includes("--check")) {
  let bad = 0;
  for (const rel of TARGETS) {
    let text;
    try { text = readFileSync(join(ROOT, rel), "utf8"); }
    catch { console.error("НЕТ ФАЙЛА:      " + rel); bad++; continue; }
    const i = text.indexOf(BEGIN), j = text.indexOf(END);
    if (i < 0 || j < 0) { console.error("НЕТ БЛОКА:      " + rel); bad++; continue; }
    const have = text.slice(i, j + END.length);
    // export const в rules.js — единственное отличие копии от эталона.
    if (have.replace(/^export const /gm, "const ") === out) console.log("совпадает:      " + rel);
    else { console.error("РАСХОЖДЕНИЕ:    " + rel); bad++; }
  }
  if (bad) {
    console.error("\nСервер считает мощь не так, как игра. Перегенерируйте блок и вставьте его в перечисленные файлы.");
    process.exit(1);
  }
  console.log("\nВсе копии совпадают с index.html.");
} else {
  console.log(out);
}
