// Сверка таблиц Торгового поста: клиент, серверная функция и страница вики,
// которую прислал автор. Копии, сделанные руками, не умеют замечать, что
// разошлись, — этот прогон умеет.
import { readFileSync } from "node:fs";

// Из страницы вики (Rise of Kingdoms Wiki, Buildings/Trading Post).
const WIKI = [
  [10000,35],[30000,34],[60000,33],[100000,32],[160000,31],
  [240000,30],[320000,29],[400000,28],[500000,27],[600000,26],
  [800000,25],[1000000,24],[1200000,23],[1400000,22],[1600000,21],
  [1800000,20],[2000000,19],[2200000,18],[2400000,17],[2600000,16],
  [2800000,15],[3000000,14],[3500000,12],[4000000,10],[10000000,8],
];

function grab(file, name) {
  const src = readFileSync(file, "utf8");
  const re = new RegExp(name + "\\s*=\\s*\\[([\\s\\S]*?)\\]");
  const m = src.match(re);
  if (!m) throw new Error(name + " не найдена в " + file);
  return m[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
}

const copies = {
  "index.html":            [grab("index.html", "TRADE_CAP"), grab("index.html", "TRADE_TAX_PCT")],
  "mp-trade/index.js":     [grab("supabase/functions/mp-trade/index.js", "TRADE_CAP"),
                            grab("supabase/functions/mp-trade/index.js", "TRADE_TAX_PCT")],
};

let bad = 0;
for (const [who, [cap, tax]] of Object.entries(copies)) {
  const errs = [];
  if (cap.length !== 25) errs.push("в потолке " + cap.length + " строк вместо 25");
  if (tax.length !== 25) errs.push("в налоге " + tax.length + " строк вместо 25");
  for (let i = 0; i < 25; i++) {
    if (cap[i] !== WIKI[i][0]) errs.push("ур." + (i + 1) + " потолок " + cap[i] + " вместо " + WIKI[i][0]);
    // Налог в долях, сверяем с процентами страницы с запасом на двоичное представление.
    if (tax[i] !== WIKI[i][1]) errs.push("ур." + (i + 1) + " налог " + tax[i] + "% вместо " + WIKI[i][1] + "%");
  }
  if (errs.length) { bad++; console.log("РАСХОЖДЕНИЯ — " + who + ":\n  " + errs.join("\n  ")); }
  else console.log("совпадает со страницей: " + who);
}
if (bad) process.exitCode = 1;
else {
  console.log("\nОбе копии совпадают со страницей вики.");
  const [c, t] = copies["index.html"];
  console.log("\nуровень   поднимает      налог   доедет из полного обоза");
  for (const lv of [1, 5, 10, 15, 20, 24, 25]) {
    const cap = c[lv - 1], tax = t[lv - 1];
    console.log(String(lv).padStart(5) + "   " + String(cap).padStart(10) + "   " +
      String(tax).padStart(5) + "%   " + String(Math.floor((cap * (100 - tax)) / 100)).padStart(10));
  }
}
