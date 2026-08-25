// Запуск Edge Function на подставной базе — см. README.md рядом.
//
//     node tools/fnlab/run.mjs <функция> <сценарий>
//
// Функция берётся из supabase/functions/<имя>/index.js как есть: подменяются
// только три вещи, которых нет вне Deno, — импорт клиента Supabase, Deno.env
// и Deno.serve. Сам код функции не трогается ни на строку.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeDb } from "./fakedb.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const [, , fnName, scenarioName] = process.argv;
if (!fnName) {
  console.error("нужно имя функции, например: node tools/fnlab/run.mjs mp-tick build");
  process.exit(2);
}

// ---- состояние игрока -------------------------------------------------------
const TK = ["inf", "arc", "cav", "sie"];
const u0 = () => { const u = {}; TK.forEach((t) => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = 0; }); return u; };
// Обычное состояние живого игрока среднего развития.
const baseState = () => ({
  race: "undead",
  b: { hall: 3, wall: 2, farm: [2, 2, 0, 0], lumber: [2, 3, 0, 0], quarry: [2, 0, 0, 0], mine: [2, 0, 0, 0],
       store: 3, barracks: 3, range: 2, stable: 2, siege: 2, hospital: [2, 0, 0, 0], academy: 3,
       garrison: 2, scout: 1, forge: 0, portal: 0, market: 0, alliance: 0 },
  layout: [{ b: "lumber", plot: 0, gx: 7, gy: 16 }, { b: "academy", plot: null, gx: 1, gy: 12 }],
  queues: [null, null], train: { inf: null, arc: null, cav: null, sie: null },
  troops: u0(), wounded: u0(), heal: null, rsch: null, craft: null,
  res: { food: 53800, wood: 55000, stone: 101300, gold: 126600 }, resAt: Date.now() / 1000 - 3600,
  gen: { lv: 4, xp: 120, pts: 5, tal: {}, id: 1, away: null }, gear: {}, tech: {},
  inventory: {}, materials: { ore: [0,0,0,0,0], leather: [0,0,0,0,0], bone: [0,0,0,0,0], ebony: [0,0,0,0,0] },
  tomes: {}, amber: 0, kp: 0, kpByTier: { 1:0, 2:0, 3:0, 4:0, 5:0 },
});
// Состояние ДО поздних фаз: нет прочности/высшей мощи/раскладки города, часть
// ключей построек отсутствует, multi-здание записано скаляром. Именно такие
// строки и лежат в живой базе у давних игроков.
const legacyState = () => {
  const st = baseState();
  delete st.layout; delete st.b.forge; delete st.b.portal; delete st.b.market; delete st.b.alliance;
  st.b.quarry = 2; st.b.mine = 2; st.b.hospital = 2;
  return st;
};

const past = new Date(Date.now() - 60000).toISOString();
const world = { id: "w-1", seed: 12345, epoch0: new Date(Date.now() - 864e5 * 5).toISOString(),
                created_at: new Date(Date.now() - 864e5 * 5).toISOString() };
const mkPlayer = (state) => ({ id: 7, world_id: "w-1", auth_uid: "uid-1", is_bot: false, race: "undead",
  nick: "Мармелад", name: "", x: 1420, y: 830, shield_until: 0, power: 0, state,
  created_at: new Date(Date.now() - 864e5 * 3).toISOString(), updated_at: past, dead_at: null });
const buildEvent = (slot) => ({ id: 1, world_id: "w-1", fire_at: past, type: "build",
  data: { player_id: 7, slot }, processed: false, claimed_at: null, created_at: past });

const SCENARIOS = {
  "mp-join": {
    poll:   () => ({ tables: { worlds:[world], players:[mkPlayer(baseState())], marches:[], map_cells:[], events:[] } }),
    legacy: () => ({ tables: { worlds:[world], players:[mkPlayer(legacyState())], marches:[], map_cells:[], events:[] } }),
    march:  () => ({ tables: { worlds:[world], players:[mkPlayer(baseState())], map_cells:[], events:[],
      marches:[{ id:3, world_id:"w-1", player_id:7, mode:"gather", state:"go", tx:1430, ty:840, t0:0, t1:0,
                 units:{ inf:{1:120}, arc:{1:80}, cav:{}, sie:{} }, data:{} }] } }),
  },
  "mp-tick": {
    build: () => { const st = baseState();
      st.queues[0] = { b:"lumber", plot:0, lv:3, t0:Date.now()/1000-60, t1:Date.now()/1000-1 };
      return { tables:{ worlds:[world], players:[mkPlayer(st)], marches:[], map_cells:[], mail:[], events:[buildEvent(0)] } }; },
    "build-new": () => { const st = baseState();
      st.queues[1] = { b:"forge", plot:null, lv:1, t0:Date.now()/1000-60, t1:Date.now()/1000-1 };
      return { tables:{ worlds:[world], players:[mkPlayer(st)], marches:[], map_cells:[], mail:[], events:[buildEvent(1)] } }; },
    legacy: () => { const st = legacyState();
      st.queues[0] = { b:"lumber", plot:0, lv:3, t0:Date.now()/1000-60, t1:Date.now()/1000-1 };
      return { tables:{ worlds:[world], players:[mkPlayer(st)], marches:[], map_cells:[], mail:[], events:[buildEvent(0)] } }; },
  },
};

const list = SCENARIOS[fnName];
if (!list) { console.error("нет сценариев для " + fnName + ". Есть: " + Object.keys(SCENARIOS).join(", ")); process.exit(2); }
const make = list[scenarioName || Object.keys(list)[0]];
if (!make) { console.error("нет сценария «" + scenarioName + "». Есть: " + Object.keys(list).join(", ")); process.exit(2); }

// ---- подготовка функции -----------------------------------------------------
const srcPath = join(ROOT, "supabase", "functions", fnName, "index.js");
let src = readFileSync(srcPath, "utf8");
src = src.replace(/^import \{ createClient \}.*$/m, "const createClient = () => globalThis.__FAKE_CLIENT__;");
src = src.replace(/Deno\.env\.get\(([^)]*)\)/g, "(globalThis.__ENV__[$1] ?? null)");
src = src.replace("Deno.serve(", "globalThis.__HANDLER__ = (");
const dir = mkdtempSync(join(tmpdir(), "fnlab-"));
const modPath = join(dir, "fn.mjs");
writeFileSync(modPath, src + "\nexport const handler = globalThis.__HANDLER__;\n");

// ---- прогон -----------------------------------------------------------------
const { tables } = make();
const { client, db, log } = makeDb(tables);
globalThis.__FAKE_CLIENT__ = client;
globalThis.__ENV__ = { SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "anon",
                       SUPABASE_SERVICE_ROLE_KEY: "svc", MP_TICK_SECRET: null };

const { handler } = await import(pathToFileURL(modPath).href);
const req = new Request("http://x/" + fnName, { method: "POST",
  headers: { Authorization: "Bearer tok", "Content-Type": "application/json" }, body: "{}" });

console.log("функция: " + fnName + "   сценарий: " + (scenarioName || Object.keys(list)[0]) + "\n");
try {
  const res = await handler(req);
  const body = await res.json();
  console.log("HTTP " + res.status + (body.err ? "  ОШИБКА: " + body.err : "  ok"));
  if (body.player) console.log("мощь в ответе: " + body.player.power + ", высшая: " + body.player.state.peakPower);
  else console.log("ответ: " + JSON.stringify(body).slice(0, 300));
} catch (e) {
  console.log("ИСКЛЮЧЕНИЕ: " + e.message);
  console.log((e.stack || "").split("\n").slice(1, 6).join("\n"));
  process.exitCode = 1;
}
const p = db.players[0];
if (p) {
  console.log("\nсостояние игрока после вызова:");
  console.log("  постройки: " + JSON.stringify(p.state.b));
  console.log("  очередь:   " + JSON.stringify(p.state.queues));
  console.log("  прочность: " + JSON.stringify(p.state.bhp || {}));
  console.log("  мощь:      " + p.power + " (высшая " + (p.state.peakPower ?? "—") + ")");
}
console.log("\nобращений к базе: " + log.length);
