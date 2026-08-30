// Фаза 50 — крепости варваров: размещение и путь до карты.
//
// Две разные проверки в одном месте, потому что ломаются они парой.
//
// 1. РАЗМЕЩЕНИЕ, без браузера: шестнадцать координат из миграции 0013
//    сверяются с настоящим рельефом (heightmap/elevation-v6.bin) и разметкой
//    регионов (worldgen/regions/regions-v1.bin) по тем же трём правилам, по
//    которым index.html ставит лагеря и точки: не вода, не круча, своя
//    область. Это не паранойя: три из шестнадцати авторских «столиц» правил
//    НЕ проходили и были сдвинуты — а если регионы когда-нибудь перегенерят
//    (worldgen/regions/PLAN.md прямо предупреждает, что нумерация переживёт
//    перегенерацию не один в один), крепости молча окажутся в море.
//    Заодно сверяется, что координаты в миграции совпадают с тем, что сейчас
//    считает tools/gen_region_forts.mjs.
//
// 2. ПУТЬ ДО КАРТЫ, в браузере: строка map_cells вида t:"regfort" должна
//    дойти до снимка мира (mpWorldSnapshot) со ступенью, областью и святыней,
//    а панель по тапу — показать крепость, а не промолчать и не предложить
//    «Атаковать» (боя с ней ещё нет, и кнопка увела бы войско на убой).
//
// Запуск:
//   npx http-server -p 8099 . &
//   node tools/check_region_forts.mjs
import { readFileSync } from 'node:fs';
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// 1. Размещение
// ---------------------------------------------------------------------------
const W = 2400, H = 1200, HALFX = W / 2, HALFZ = H / 2, ELEV_SCALE = 2.5, SEA = 0.235;
const STEEP_SAMPLE_R = 3, STEEP_MAX_RISE = 0.11;
const elBuf = readFileSync('heightmap/elevation-v6.bin');
const el = new Uint16Array(elBuf.buffer, elBuf.byteOffset, elBuf.byteLength / 2);
const reg = new Uint8Array(readFileSync('worldgen/regions/regions-v1.bin'));

function bil(px, py) {
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const fx = px - x0, fy = py - y0;
  const i00 = y0 * W + x0, i10 = y0 * W + x1, i01 = y1 * W + x0, i11 = y1 * W + x1;
  const e0 = el[i00] + (el[i10] - el[i00]) * fx, e1 = el[i01] + (el[i11] - el[i01]) * fx;
  return (e0 + (e1 - e0) * fy) * (ELEV_SCALE / 65535);
}
function hAt(x, y) {
  const cx = x + 0.5, cy = y + 0.5;
  if (cx < -HALFX || cx >= HALFX || cy < -HALFZ || cy >= HALFZ) return 0;
  return bil(cx + HALFX, cy + HALFZ);
}
const isWater = (x, y) => hAt(x, y) < SEA;
function isSteep(x, y) {
  const c = hAt(x, y);
  for (let dy = -STEEP_SAMPLE_R; dy <= STEEP_SAMPLE_R; dy++)
    for (let dx = -STEEP_SAMPLE_R; dx <= STEEP_SAMPLE_R; dx++) {
      if (!dx && !dy) continue;
      if (Math.abs(hAt(x + dx, y + dy) - c) > STEEP_MAX_RISE) return true;
    }
  return false;
}
function regionAt(x, y) {
  const px = Math.round(x) + HALFX, py = Math.round(y) + HALFZ;
  if (px < 0 || py < 0 || px >= W || py >= H) return 255;
  return reg[py * W + px];
}

// Координаты берём ИЗ МИГРАЦИИ — она источник правды для живой базы, а не
// генератор: генератор можно перезапустить, а посеянные крепости уже стоят.
const sql = readFileSync('supabase/migrations/0013_region_forts.sql', 'utf8');
const rowRe = /\(\s*(\d+),\s*(\d+),\s*(-?\d+),\s*(-?\d+),\s*'([^']+)',\s*'([^']+)'\)/g;
const seen = new Map();
for (const m of sql.matchAll(rowRe)) {
  const [, region, tier, x, y, name, shrine] = m;
  // В миграции список повторён дважды (delete и insert) — берём по одному.
  seen.set(+region, { region: +region, tier: +tier, x: +x, y: +y, name, shrine });
}
const forts = [...seen.values()].sort((a, b) => a.region - b.region);

let bad = 0;
const ok = (b) => (b ? '✓' : '✗');
const check = (label, cond) => { if (!cond) bad++; console.log('  ' + ok(cond) + ' ' + label); };

console.log('Размещение шестнадцати крепостей:');
check('в миграции ровно 16 крепостей (' + forts.length + ')', forts.length === 16);
const water = forts.filter((f) => isWater(f.x, f.y));
const steep = forts.filter((f) => isSteep(f.x, f.y));
const wrong = forts.filter((f) => regionAt(f.x, f.y) !== f.region - 1);
check('ни одна не в воде' + (water.length ? ': ' + water.map((f) => f.name).join(', ') : ''), !water.length);
check('ни одна не на круче' + (steep.length ? ': ' + steep.map((f) => f.name).join(', ') : ''), !steep.length);
check('каждая в своей области' + (wrong.length ? ': ' + wrong.map((f) => f.name).join(', ') : ''), !wrong.length);
const tiers = { 1: 0, 2: 0, 3: 0 };
forts.forEach((f) => { tiers[f.tier]++; });
// Разбиение из worldgen/regions/SHRINES.md: четыре великих твердыни (по шесть
// соседей у региона), шесть средних, шесть малых.
check(`ступеней 3/2/1 — ${tiers[3]}/${tiers[2]}/${tiers[1]} (ждём 4/6/6)`,
      tiers[3] === 4 && tiers[2] === 6 && tiers[1] === 6);
const dup = forts.length - new Set(forts.map((f) => f.x + ',' + f.y)).size;
check('нет двух крепостей на одной клетке', dup === 0);
// Миграция и генератор обязаны сходиться: разъедутся — и следующий, кто
// перезапустит генератор, посеет крепости не туда, где они уже стоят.
const gen = JSON.parse(execFileSync('node', ['tools/gen_region_forts.mjs', '--json'], { encoding: 'utf8' }));
const same = gen.length === forts.length && gen.every((g) => {
  const f = seen.get(g.region);
  return f && f.x === g.x && f.y === g.y && f.tier === g.tier && f.shrine === g.shrine;
});
check('миграция совпадает с tools/gen_region_forts.mjs', same);

// ---------------------------------------------------------------------------
// 2. Путь до карты
// ---------------------------------------------------------------------------
const PW = [process.env.PW_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs',
            '/usr/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const c of PW) { try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) {} }
if (!chromium) { console.error('\nplaywright не найден — вторая половина проверки пропущена'); process.exit(bad ? 1 : 0); }
const CHROME = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ...(existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-'))
      .map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome') : [])].filter(Boolean).find((p) => existsSync(p));

const now = Date.now() / 1000;
const TK = ['inf', 'arc', 'cav', 'sie'];
const units = (n = 0) => { const u = {}; TK.forEach((t) => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = n; }); return u; };
const state = { race: 'human',
  b: { hall: 12, wall: 5, farm: [6, 0, 0, 0], lumber: [5, 0, 0, 0], quarry: [4, 0, 0, 0], mine: [3, 0, 0, 0],
       store: 6, barracks: 8, range: 0, stable: 0, siege: 3, hospital: [4, 0, 0, 0], academy: 8,
       garrison: 3, scout: 2, forge: 0, portal: 0, market: 5, alliance: 3 },
  layout: [], queues: [], train: { inf: null, arc: null, cav: null, sie: null },
  troops: units(500), wounded: units(), heal: null, rsch: null, craft: null,
  res: { food: 9e6, wood: 9e6, stone: 9e6, gold: 9e6 }, resAt: now,
  gen: { lv: 5, xp: 0, pts: 5, tal: {}, id: 0, away: null }, gear: {}, tech: {}, inventory: {},
  materials: { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] },
  tomes: {}, amber: 0 };
// Игрок стоит рядом с крепостью Зелёных Земель — чтобы она попала в радиус.
const green = seen.get(6);
const player = { id: 7, world_id: 'w1', auth_uid: 'u1', is_bot: false, race: 'human', nick: 'Витольд', name: '',
  x: green.x + 4, y: green.y + 4, shield_until: 0, power: 18600, state,
  created_at: new Date(Date.now() - 864e5).toISOString(), updated_at: new Date().toISOString(), dead_at: null };
const STUB = `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'t'}},error:null}),signInAnonymously:async()=>({data:{session:{access_token:'t'}},error:null})},from:()=>makeQB()})};
function makeQB(){const p=Promise.resolve({data:[],error:null});const x=new Proxy(function(){},{get(_t,k){if(k==='then')return p.then.bind(p);if(k==='catch')return p.catch.bind(p);if(k==='finally')return p.finally.bind(p);return()=>x},apply(){return x}});return x}`;

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await b.newPage({ viewport: { width: 430, height: 932 } });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await page.route('**/functions/v1/**', (r) => r.request().url().includes('mp-join')
  ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, world_id: 'w1', player }) })
  : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.route('**/engine/dist/**', (r) => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const r = await page.evaluate((forts) => {
  const out = {};
  // Кладём крепости ровно в том виде, в каком их отдаёт map_cells.
  mpState.camps = forts.map((f) => ({ x: f.x, y: f.y, t: 'regfort', data: {
    region: f.region, region_name: f.name, shrine: f.shrine, tier: f.tier,
    state: 'barb', alliance_id: null, razed_at: null } }));
  mpSnapCache = null; mpSnapRefs = null;
  const snap = mpWorldSnapshot();
  const cells = Object.values(snap.map).filter((c) => c.t === 'regfort');
  out.вСнимке = cells.length;
  out.поТирам = {}; cells.forEach((c) => { out.поТирам[c.tier] = (out.поТирам[c.tier] || 0) + 1; });
  const one = cells.find((c) => c.region === 6);
  out.святыня = one ? one.shrine : '';
  out.область = one ? one.regionName : '';
  // Панель по тапу. renderCartoucheMp читает выбранную клетку из sel и пишет
  // в #cartouche — ставим выбор ровно так же, как это делает тап по карте.
  const host = document.getElementById('cartouche');
  sel = { x: one.x, y: one.y }; selMarch = null;
  renderCartoucheMp();
  const txt = (host.textContent || '').replace(/\s+/g, ' ').trim();
  out.панельТекст = txt;
  out.панельЕстьСвятыня = /Житница Предвечных/.test(txt);
  out.панельЕстьОбласть = /Зелёные Земли/.test(txt);
  out.панельВеликая = /Великая твердыня/.test(txt);
  out.панельДержат = /варвары/.test(txt);
  out.панельСила = /Сила крепости/.test(txt);
  // РАЗБОРОМ, а не по innerHTML: браузер нормализует кавычки атрибутов в
  // двойные, и регулярка с одинарными не совпадала НИКОГДА — проверка
  // «кнопки нет» проходила впустую всё время, пока кнопки и правда не было.
  const hasRaid = () => !!host.querySelector("[data-mp='cartraidpick']");
  out.панельЕстьАтака = hasRaid();
  // Разорённую крепость штурмовать нечем — варваров в ней нет.
  mpState.camps = mpState.camps.map((c) => c.data.region === 6
    ? { ...c, data: { ...c.data, state: 'razed', razed_at: new Date().toISOString() } } : c);
  mpSnapCache = null; mpSnapRefs = null;
  renderCartoucheMp();
  out.разорённаяБезАтаки = !hasRaid();
  // Подсказок в панели больше нет вовсе (автор: «убери подсказки отовсюду,
  // они в игре не нужны»), поэтому проверяем не текст-пояснение, а то, что
  // на разорённом месте предлагают ДЕЛО: заложить крепость союза. Без союза
  // на его месте — единственная оставшаяся строка, объясняющая, что кнопки
  // нет: она заменяет собой кнопку, а не стоит рядом с ней.
  out.разорённаяЗовётСтроить = /Крепость на этом месте ставит союз|data-mp="fortstart"/
    .test(host.innerHTML + host.textContent);
  return out;
}, forts);

console.log('\nПуть до карты:');
console.log('  ошибок страницы:', errs.length, errs.slice(0, 2));
if (errs.length) bad++;
check('все 16 доходят до снимка мира (' + r.вСнимке + ')', r.вСнимке === 16);
check('ступени в снимке ' + JSON.stringify(r.поТирам), r.поТирам[3] === 4 && r.поТирам[2] === 6 && r.поТирам[1] === 6);
check('святыня доехала: ' + r.святыня, r.святыня === 'Житница Предвечных');
check('область доехала: ' + r.область, r.область === 'Зелёные Земли');
console.log('\nПанель по тапу:');
console.log('   ', r.панельТекст.slice(0, 160));
check('названа святыня', r.панельЕстьСвятыня);
check('названа область', r.панельЕстьОбласть);
check('ступень подписана словами', r.панельВеликая);
check('сказано, кто держит', r.панельДержат);
check('названа сила крепости', r.панельСила);
check('кнопка «Атаковать» есть — запрета на одиночку нет', r.панельЕстьАтака);
check('у разорённой крепости атаки нет', r.разорённаяБезАтаки);
check('на разорённом месте предлагают заложить крепость', r.разорённаяЗовётСтроить);

await b.close();
console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
process.exit(bad ? 1 : 0);
