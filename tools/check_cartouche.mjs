// Панель мира (renderCartoucheMp): каждая ветка обязана нарисоваться.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. Панель — одна функция с десятком ветвей по типу
// клетки, и ломается она особенно подло: исключение внутри рвёт функцию ДО
// put(), панель остаётся пустой и просто не открывается. Ни ошибки на экране,
// ни следа — тап по клетке будто не сработал.
//
// Так уже было дважды. Последний раз — Фаза 44 удалила mpPairBattlesLeft
// вместе с соседним куском, оставив два вызова в ветке чужого города: с того
// дня тап по ЛЮБОМУ живому соседу падал с ReferenceError, и ни «Разведать», ни
// «Атака» не рисовались вообще. Заметили это только по репорту автора
// («не показываются менюшки других правителей»).
//
// Проверка поэтому идёт грубым, но верным способом: подставить клетку каждого
// типа, вызвать панель и убедиться, что она не бросила и не осталась пустой.
//
// Запуск:
//   npx http-server -p 8099 . &
//   node tools/check_cartouche.mjs
import { existsSync, readdirSync } from 'node:fs';

const PW = [process.env.PW_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs',
            '/usr/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const c of PW) { try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) {} }
if (!chromium) { console.error('playwright не найден; укажите PW_PATH'); process.exit(2); }
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
const player = { id: 7, world_id: 'w1', auth_uid: 'u1', is_bot: false, race: 'human', nick: 'Витольд', name: '',
  x: 100, y: 100, shield_until: 0, power: 18600, state,
  created_at: new Date(Date.now() - 864e5).toISOString(), updated_at: new Date().toISOString(), dead_at: null };
const STUB = `window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'t'}},error:null}),signInAnonymously:async()=>({data:{session:{access_token:'t'}},error:null})},from:()=>makeQB()})};
function makeQB(){const p=Promise.resolve({data:[],error:null});const x=new Proxy(function(){},{get(_t,k){if(k==='then')return p.then.bind(p);if(k==='catch')return p.catch.bind(p);if(k==='finally')return p.finally.bind(p);return()=>x},apply(){return x}});return x}`;

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await b.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await page.route('**/functions/v1/**', (r) => r.request().url().includes('mp-join')
  ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, world_id: 'w1', player }) })
  : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.route('**/engine/dist/**', (r) => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const res = await page.evaluate(() => {
  const out = [];
  const el = document.getElementById('cartouche');
  // Живой сосед в том же виде, в каком его отдаёт mpRefreshNeighbors: строки,
  // а не числа (hall и gen приходят из jsonb как текст) — на этом уже
  // спотыкались, и подставлять сюда «удобные» числа значило бы проверять не
  // то, что бывает на самом деле.
  mpState.neighbors = [{ id: 9, nick: 'Гутрум', race: 'dwarf', x: 104, y: 103, is_bot: false,
                         hall: '9', gen: '0', shield_until: 0, rating: 1200, rating_battles: 12 },
                       { id: 10, nick: 'Подщитом', race: 'elf', x: 106, y: 103, is_bot: false,
                         hall: '7', gen: null, shield_until: Date.now() / 1000 + 3600, rating: 0, rating_battles: 0 }];
  mpState.nodes = [{ x: 101, y: 101, t: 'node', data: { res: 'food', lv: 3, amount: 5000, max: 9000 } },
                   { x: 101, y: 102, t: 'node', data: { res: 'gold', lv: 2, amount: 0, max: 9000 } }];
  mpState.camps = [
    { x: 102, y: 101, t: 'camp', data: { lv: 4 } },
    { x: 102, y: 102, t: 'fort', data: { lv: 18 } },
    { x: 103, y: 101, t: 'regfort', data: { region: 6, region_name: 'Зелёные Земли', shrine: 'Житница Предвечных',
                                            tier: 3, state: 'barb', alliance_id: null, razed_at: null } },
    { x: 103, y: 102, t: 'regfort', data: { region: 7, region_name: 'Великая Степь', shrine: 'Ханская Ставка',
                                            tier: 3, state: 'razed', alliance_id: null, razed_at: new Date().toISOString() } },
    { x: 103, y: 104, t: 'regfort', data: { region: 10, region_name: 'Открытые Равнины', shrine: 'Курган Павших',
                                            tier: 3, state: 'ally', alliance_id: 11, razed_at: null } },
  ];
  mpSnapCache = null; mpSnapRefs = null;
  const cases = [
    ['пустошь',              { x: 120, y: 120 }],
    ['своя столица',         { x: 100, y: 100 }],
    ['чужой правитель',      { x: 104, y: 103 }],
    ['правитель под щитом',  { x: 106, y: 103 }],
    ['точка с ресурсом',     { x: 101, y: 101 }],
    ['истощённая точка',     { x: 101, y: 102 }],
    ['лагерь варваров',      { x: 102, y: 101 }],
    ['форт варваров',        { x: 102, y: 102 }],
    ['крепость варваров',    { x: 103, y: 101 }],
    ['крепость разорённая',  { x: 103, y: 102 }],
    ['крепость союзная',     { x: 103, y: 104 }],
  ];
  for (const [name, cell] of cases) {
    sel = cell; selMarch = null;
    let threw = null;
    try { renderCartoucheMp(); } catch (e) { threw = String(e && e.message || e); }
    const html = el.innerHTML, txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    out.push({ name, threw,
               // Своя столица — единственная, где пустая панель ПРАВИЛЬНА.
               empty: !html,
               acts: [...el.querySelectorAll('[data-mp]')].map((n) => n.dataset.mp),
               txt: txt.slice(0, 90) });
  }
  return out;
});

let bad = 0;
const ok = (b) => (b ? '✓' : '✗');
console.log('ошибок страницы:', errors.length ? errors.slice(0, 3) : 'нет');
if (errors.length) bad++;
console.log('\nВетки панели мира:');
for (const c of res) {
  // Пустая панель допустима только у своей столицы (там показывать нечего).
  const mustDraw = c.name !== 'своя столица';
  const good = !c.threw && (mustDraw ? !c.empty : c.empty);
  if (!good) bad++;
  console.log('  ' + ok(good) + ' ' + c.name.padEnd(22) +
    (c.threw ? 'УПАЛА: ' + c.threw
             : c.empty ? '(пусто, как и должно)'
                       : '[' + (c.acts.join(', ') || 'без кнопок') + ']'));
  if (!c.threw && !c.empty) console.log('      ' + c.txt);
}

// Отдельно — то, ради чего проверка и заведена: у живого соседа обязаны быть
// обе кнопки, а под щитом — только разведка.
const foe = res.find((c) => c.name === 'чужой правитель');
const shielded = res.find((c) => c.name === 'правитель под щитом');
console.log('\nЧужой правитель:');
const c1 = foe && foe.acts.includes('cartattackpick') && foe.acts.includes('cartscout');
if (!c1) bad++;
console.log('  ' + ok(c1) + ' есть и «Разведать», и «Атака»');
const c2 = shielded && shielded.acts.includes('cartscout') && !shielded.acts.includes('cartattackpick');
if (!c2) bad++;
console.log('  ' + ok(c2) + ' под щитом — разведка есть, атаки нет');

await b.close();
console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
process.exit(bad ? 1 : 0);
