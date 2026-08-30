// Крепость союза и казна (Фаза 55): возврат варваров, панель места, казна,
// цвет территории.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. У места крепости теперь ЧЕТЫРЕ состояния
// (варвары / разорено / строится / стоит), и панель мира — единственное
// место, откуда с ним вообще можно что-то сделать. Ветка панели ломается
// особенно подло: исключение рвёт функцию ДО put(), панель остаётся пустой и
// просто не открывается — ни ошибки, ни следа (так уже было дважды, см.
// шапку check_cartouche.mjs).
//
// И второе: цвет территории. Движок про союзы и гербы не знает — он получает
// готовый массив цветов по номеру области из mpWorldSnapshot. Если тот
// соберёт его неверно, шейдер честно покрасит не ту область не тем цветом, и
// никакая проверка шейдера этого не поймает.
//
// Запуск:
//   npx http-server -p 8099 . &
//   node tools/check_fort.mjs
import { existsSync, readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (v) => (v ? '✓' : '✗');
const check = (label, cond, note) => { if (!cond) bad++; console.log('  ' + ok(cond) + ' ' + label + (note ? '  — ' + note : '')); };

// ---------------------------------------------------------------------------
// Часть 1. Возврат варваров и заморозка таймера стройкой.
//
// Автор: «когда крепость альянса строится, то таймер варваров замораживается.
// И да, они могут так вечность держать, при насыщенной игре навряд ли такое
// будет». Заморозка — самое незаметное место всей фазы: она не рисуется и не
// падает, она просто ЛИБО ЕСТЬ, ЛИБО НЕТ, и узнать об её отсутствии можно
// только тем, что у кого-то посреди стройки на голову сели варвары.
//
// Функции берём ИЗ ИСХОДНИКА mp-tick, а базу подменяем на записную книжку:
// копия проверяла бы саму себя, а живой Postgres ради шести случаев поднимать
// незачем.
const tick = readFileSync('supabase/functions/mp-tick/index.js', 'utf8');
const cutFn = (name) => {
  const at = tick.indexOf('async function ' + name + '(');
  if (at < 0) throw new Error('в mp-tick нет функции ' + name);
  let depth = 0;
  for (let j = tick.indexOf('{', at); j < tick.length; j++) {
    if (tick[j] === '{') depth++;
    else if (tick[j] === '}') { depth--; if (!depth) return tick.slice(at, j + 1); }
  }
  throw new Error('не закрылась ' + name);
};
// Фаза 56 — сюда же приезд подкрепления: у него единственная в фазе
// арифметика, которую нельзя проверить глазом (дележ отряда, влезающего в
// крепость не целиком), и она обязана сходиться до воина.
const TKEYS = ['inf', 'arc', 'cav', 'sie'];
const unitsTotal = (u) => TKEYS.reduce((n, t) => n + [1, 2, 3, 4, 5]
  .reduce((a, i) => a + ((u && u[t] && u[t][i]) || 0), 0), 0);
const unitsAdd = (a, b2) => { const o = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++)
    o[t][i] = ((a && a[t] && a[t][i]) || 0) + ((b2 && b2[t] && b2[t][i]) || 0); }); return o; };
const sentHome = [];
const tickFns = new Function(
  'REGFORT_RESPAWN_SEC', 'REGFORT_ALLY_CAP', 'FORT_CAP', 'TKEYS', 'unitsTotal', 'unitsAdd',
  'sendSurvivorsHome', 'largestRemainder',
  cutFn('applyRegfortRespawn') + '\n' + cutFn('applyRegfortBuilt') + '\n' +
  cutFn('applyReinfArrive') + '\n' + cutFn('fortFalls') +
  '\nreturn { applyRegfortRespawn, applyRegfortBuilt, applyReinfArrive, fortFalls };')(
    12 * 3600, 2000000, 2000000, TKEYS, unitsTotal, unitsAdd,
    async (_a, _m, _n, units) => { sentHome.push(unitsTotal(units)); },
    new Function('nTotal', 'shares', 'total',
      readFileSync('supabase/functions/mp-tick/index.js', 'utf8')
        .match(/function largestRemainder[\s\S]*?\n}/)[0]
        .replace(/^function largestRemainder\([^)]*\)\s*{/, '').replace(/}$/, '')));

// Записная книжка вместо базы: отдаёт клетку и союз, запоминает всё, что в неё
// писали. maybeSingle разобран отдельно — без него выборка клетки получила бы
// массив там, где ждёт одну строку.
function fakeDb(cell, alliance, garrison) {
  const wrote = { cells: [], events: [], chat: [], garrison: [], mail: [], deleted: [] };
  const qb = (table) => {
    const st = { single: false, op: null, payload: null };
    const res = () => {
      if (st.op === 'insert') return { data: null, error: null };
      const rows = table === 'map_cells' ? (cell ? [cell] : [])
                 : table === 'alliances' ? (alliance ? [alliance] : [])
                 : table === 'alliance_fort_garrison' ? (garrison || []) : [];
      return st.single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
    };
    const proxy = new Proxy(function () {}, {
      get(_t, k) {
        if (k === 'then') return (a, b) => Promise.resolve(res()).then(a, b);
        if (k === 'catch') return (a) => Promise.resolve(res()).catch(a);
        if (k === 'finally') return (a) => Promise.resolve(res()).finally(a);
        if (k === 'maybeSingle' || k === 'single') return () => { st.single = true; return proxy; };
        if (k === 'insert') return (p) => {
          st.op = 'insert';
          if (table === 'events') wrote.events.push(p);
          if (table === 'alliance_chat') wrote.chat.push(p);
          if (table === 'mail') wrote.mail.push(p);
          return proxy;
        };
        if (k === 'upsert') return (p) => {
          st.op = 'insert';
          if (table === 'alliance_fort_garrison') wrote.garrison.push(p);
          return proxy;
        };
        if (k === 'delete') return () => { st.op = 'delete'; wrote.deleted.push(table); return proxy; };
        if (k === 'update') return (p) => {
          st.op = 'update';
          if (table === 'map_cells') wrote.cells.push(p.data);
          return proxy;
        };
        return () => proxy;
      },
      apply() { return proxy; },
    });
    return proxy;
  };
  return { admin: { from: (t) => qb(t) }, wrote };
}

const nowS = Date.now() / 1000;
const mkCell = (d) => ({ t: 'regfort', data: Object.assign(
  { region: 11, region_name: 'Стальные Горы', shrine: 'Кузня Предков', tier: 3 }, d) });
const ALLIANCE = { id: 11, disbanded_at: null };
const respawnEv = (razedAt) => ({ world_id: 'w1', data: { x: 103, y: 102, razed_at: razedAt } });

console.log('Возврат варваров и заморозка таймера:');
{
  // Идёт стройка, срок ещё не вышел: варвары НЕ приходят, а часовой
  // перевешивается за срок стройки.
  const f = fakeDb(mkCell({ state: 'building', alliance_id: 11, razed_at: nowS - 43200,
                            build_t0: nowS - 3600, build_t1: nowS + 36000 }), ALLIANCE);
  await tickFns.applyRegfortRespawn(f.admin, respawnEv(nowS - 43200));
  check('во время стройки варвары не возвращаются', f.wrote.cells.length === 0,
    JSON.stringify(f.wrote.cells[0] || null));
  const ev = f.wrote.events[0];
  check('часовой перевешен за срок стройки',
    f.wrote.events.length === 1 && ev.type === 'regfort_respawn' &&
    Date.parse(ev.fire_at) / 1000 > nowS + 36000,
    ev ? ev.fire_at : 'события нет');
}
{
  // Событие достройки потерялось, срок давно прошёл — часовой достраивает сам.
  const f = fakeDb(mkCell({ state: 'building', alliance_id: 11, razed_at: nowS - 90000,
                            build_t0: nowS - 80000, build_t1: nowS - 4000 }), ALLIANCE);
  await tickFns.applyRegfortRespawn(f.admin, respawnEv(nowS - 90000));
  const w = f.wrote.cells[0];
  check('просроченную стройку часовой достраивает сам',
    !!w && w.state === 'ally' && w.alliance_id === 11 && w.cap === 2000000,
    JSON.stringify(w));
  check('и место не остаётся разорённым', !f.wrote.cells.some((c) => c.state === 'razed'));
}
{
  // Срока стройки нет вовсе (испорченные данные) — тот же исход, не вечное
  // перевешивание часового.
  const f = fakeDb(mkCell({ state: 'building', alliance_id: 11, razed_at: nowS - 90000 }), ALLIANCE);
  await tickFns.applyRegfortRespawn(f.admin, respawnEv(nowS - 90000));
  check('стройка без срока не вешает часового по кругу',
    f.wrote.cells.length === 1 && f.wrote.cells[0].state === 'ally' && f.wrote.events.length === 0);
}
{
  // Место просто разорено и то самое — варвары приходят.
  const f = fakeDb(mkCell({ state: 'razed', alliance_id: null, razed_at: 111 }), null);
  await tickFns.applyRegfortRespawn(f.admin, respawnEv(111));
  check('к разорённому и не начатому месту варвары возвращаются',
    f.wrote.cells.length === 1 && f.wrote.cells[0].state === 'barb' &&
    f.wrote.cells[0].razed_at === null, JSON.stringify(f.wrote.cells[0]));
}
{
  // Разорение уже другое (место успели отбить и разорить заново) — старое
  // событие молчит.
  const f = fakeDb(mkCell({ state: 'razed', alliance_id: null, razed_at: 222 }), null);
  await tickFns.applyRegfortRespawn(f.admin, respawnEv(111));
  check('часовой от прежнего разорения не срабатывает', f.wrote.cells.length === 0);
}
{
  // Крепость уже стоит — часовому делать нечего.
  const f = fakeDb(mkCell({ state: 'ally', alliance_id: 11, razed_at: null }), ALLIANCE);
  await tickFns.applyRegfortRespawn(f.admin, respawnEv(111));
  check('под готовой крепостью варвары не всплывают', f.wrote.cells.length === 0);
}
{
  // Достройка гасит razed_at: иначе в клетке осталась бы метка, по которой
  // сверяются часовые.
  const f = fakeDb(mkCell({ state: 'building', alliance_id: 11, razed_at: nowS - 5000,
                            build_t0: nowS - 5000, build_t1: nowS - 10 }), ALLIANCE);
  await tickFns.applyRegfortBuilt(f.admin, { world_id: 'w1',
    data: { x: 103, y: 102, alliance_id: 11, t1: nowS - 10 } });
  const w = f.wrote.cells[0];
  check('достройка гасит метку разорения', !!w && w.state === 'ally' && w.razed_at === null,
    JSON.stringify(w));
  check('союз извещён о крепости', f.wrote.chat.length === 1);
}
{
  // Союз распустился, пока строили, — место возвращается варварам своим
  // чередом, а не достраивается в пустоту.
  const f = fakeDb(mkCell({ state: 'building', alliance_id: 11, razed_at: nowS - 5000,
                            build_t0: nowS - 5000, build_t1: nowS - 10 }),
                   { id: 11, disbanded_at: new Date().toISOString() });
  await tickFns.applyRegfortBuilt(f.admin, { world_id: 'w1',
    data: { x: 103, y: 102, alliance_id: 11, t1: nowS - 10 } });
  const w = f.wrote.cells[0];
  check('стройка распущенного союза не достраивается',
    !!w && w.state === 'razed' && w.alliance_id === null, JSON.stringify(w));
  check('и место получает новый срок возврата варваров',
    f.wrote.events.length === 1 && f.wrote.events[0].type === 'regfort_respawn');
}


console.log('\nПодкрепление приходит в крепость:');
const allyCell = (d) => ({ x: 103, y: 104, t: 'regfort', data: Object.assign(
  { region: 11, region_name: 'Стальные Горы', shrine: 'Кузня Предков', tier: 3,
    state: 'ally', alliance_id: 11 }, d) });
const mkUnits = (o) => { const u = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) u[t][i] = o[t + i] || 0; }); return u; };
const reinfMarch = (units) => ({ id: 1, world_id: 'w1', player_id: 7, mode: 'reinf', tx: 103, ty: 104,
  units, data: { cell_x: 103, cell_y: 104, alliance_id: 11, dist: 5, spd: 30 } });
{
  const f = fakeDb(allyCell({}), null, []);
  sentHome.length = 0;
  await tickFns.applyReinfArrive(f.admin, reinfMarch(mkUnits({ inf1: 1000, cav3: 500 })));
  const g = f.wrote.garrison[0];
  check('пустая крепость принимает отряд целиком',
    !!g && unitsTotal(g.units) === 1500 && g.player_id === 7 && g.alliance_id === 11,
    JSON.stringify(g && { n: unitsTotal(g.units), p: g.player_id }));
  check('союз извещён о подкреплении', f.wrote.chat.length === 1);
  check('домой при этом ничего не разворачивается', sentHome.length === 0);
}
{
  // Уже стоящий отряд того же игрока СКЛАДЫВАЕТСЯ, а не затирается.
  const f = fakeDb(allyCell({}), null,
    [{ player_id: 7, units: mkUnits({ inf1: 200 }) }]);
  sentHome.length = 0;
  await tickFns.applyReinfArrive(f.admin, reinfMarch(mkUnits({ inf1: 300 })));
  check('свой прежний отряд не затирается, а пополняется',
    unitsTotal(f.wrote.garrison[0].units) === 500,
    String(unitsTotal(f.wrote.garrison[0].units)));
}
{
  // Крепость полна — отряд разворачивается, и игроку об этом пишут.
  const f = fakeDb(allyCell({}), null,
    [{ player_id: 9, units: mkUnits({ inf5: 2000000 }) }]);
  sentHome.length = 0;
  await tickFns.applyReinfArrive(f.admin, reinfMarch(mkUnits({ inf1: 1000 })));
  check('в полную крепость отряд не влезает и идёт домой',
    f.wrote.garrison.length === 0 && sentHome[0] === 1000);
  check('и игроку об этом приходит письмо', f.wrote.mail.length === 1);
}
{
  // Влезает не всё: часть встаёт в гарнизон, остаток идёт домой — и сумма
  // обязана сойтись до воина.
  const f = fakeDb(allyCell({}), null,
    [{ player_id: 9, units: mkUnits({ inf5: 1999400 }) }]);
  sentHome.length = 0;
  await tickFns.applyReinfArrive(f.admin, reinfMarch(mkUnits({ inf1: 1000, cav3: 1000 })));
  const took = unitsTotal(f.wrote.garrison[0].units);
  check('в крепость встаёт ровно то, что влезло', took === 600, String(took));
  check('остаток разворачивается домой, ни воина не потеряв',
    sentHome[0] === 1400 && took + sentHome[0] === 2000, took + ' + ' + sentHome[0]);
}
{
  // Крепость за дорогу пала (или сменила хозяина) — вставать некуда.
  const f = fakeDb(allyCell({ state: 'razed', alliance_id: null }), null, []);
  sentHome.length = 0;
  await tickFns.applyReinfArrive(f.admin, reinfMarch(mkUnits({ inf1: 700 })));
  check('в павшую крепость отряд не встаёт, а идёт домой',
    f.wrote.garrison.length === 0 && sentHome[0] === 700);
}
{
  // Крепость перешла другому союзу — то же самое.
  const f = fakeDb(allyCell({ alliance_id: 12 }), null, []);
  sentHome.length = 0;
  await tickFns.applyReinfArrive(f.admin, reinfMarch(mkUnits({ inf1: 700 })));
  check('в чужую крепость подкрепление не встаёт', sentHome[0] === 700);
}

console.log('\nКрепость пала:');
{
  const cd = { region: 11, region_name: 'Стальные Горы', shrine: 'Кузня Предков', tier: 3,
               state: 'ally', alliance_id: 11, built_at: 1 };
  const f = fakeDb({ x: 103, y: 104, t: 'regfort', data: cd }, null, []);
  await tickFns.fortFalls(f.admin, 'w1', { x: 103, y: 104 }, cd, { id: 9, nick: 'Гутрум' },
    Date.now() / 1000, [{ player_id: 7 }, { player_id: 8 }], null);
  const w = f.wrote.cells[0];
  check('место снова разорено и ничьё',
    !!w && w.state === 'razed' && w.alliance_id === null && w.built_at === null, JSON.stringify(w));
  check('варварам назначен новый срок возврата',
    f.wrote.events.length === 1 && f.wrote.events[0].type === 'regfort_respawn');
  check('гарнизон снесён', f.wrote.deleted.includes('alliance_fort_garrison'));
  check('союзу сказано, кто взял', f.wrote.chat.length === 1 && /Гутрум/.test(f.wrote.chat[0].body));
  check('каждому державшему войска написали', f.wrote.mail.length === 2);
}

console.log('');


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
const un = (n = 0) => { const u = {}; TK.forEach((t) => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = n; }); return u; };
const state = { race: 'human',
  b: { hall: 12, wall: 5, farm: [6, 0, 0, 0], lumber: [5, 0, 0, 0], quarry: [4, 0, 0, 0], mine: [3, 0, 0, 0],
       store: 6, barracks: 8, range: 0, stable: 0, siege: 3, hospital: [4, 0, 0, 0], academy: 8,
       garrison: 3, scout: 2, forge: 0, portal: 0, market: 5, alliance: 4 },
  layout: [], queues: [], train: { inf: null, arc: null, cav: null, sie: null },
  troops: un(500), wounded: un(), heal: null, rsch: null, craft: null,
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
const sent = [];
await page.route('**/functions/v1/**', (r) => {
  const u = r.request().url();
  if (u.includes('mp-join')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, world_id: 'w1', player }) });
  let body = null;
  try { body = JSON.parse(r.request().postData() || 'null'); } catch (_) {}
  sent.push({ fn: u.split('/').pop(), body });
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
await page.route('**/engine/dist/**', (r) => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const res = await page.evaluate(() => {
  mpStopPolling();
  const out = {};
  const nowS = Date.now() / 1000;
  const el = document.getElementById('cartouche');
  // Четыре состояния места крепости, все на соседних клетках.
  const rf = (x, y, d) => ({ x, y, t: 'regfort', data: Object.assign(
    { region: 11, region_name: 'Стальные Горы', shrine: 'Кузня Предков', tier: 3, alliance_id: null, razed_at: null }, d) });
  mpState.camps = [
    rf(103, 101, { state: 'barb' }),
    rf(103, 102, { state: 'razed', razed_at: nowS - 600 }),
    rf(103, 103, { state: 'building', alliance_id: 11, build_t0: nowS - 600, build_t1: nowS + 1800 }),
    rf(103, 104, { state: 'ally', alliance_id: 11 }),
    rf(103, 105, { state: 'ally', alliance_id: 12 }),   // чужая — цель, а не подкрепление
  ];
  mpState.fortGarrison = [
    { x: 103, y: 104, player_id: 7, units: { inf: { 1: 40000 } }, sent_at: new Date().toISOString(),
      players: { id: 7, nick: 'Витольд', race: 'human' } },
    { x: 103, y: 104, player_id: 9, units: { inf: { 1: 15000 } }, sent_at: new Date().toISOString(),
      players: { id: 9, nick: 'Гутрум', race: 'dwarf' } },
  ];
  mpState.allyOf = { 7: { id: 11, name: 'Орден Багровой Зари', tag: 'ЗАРЯ',
                          emblem: { s: 1, d: 0, c: 0, t1: 2, t2: 0, t3: 0 }, role: 'r5' } };
  mpState.ally = { id: 11, name: 'Орден Багровой Зари', tag: 'ЗАРЯ', members_max: 30, power: 1,
                   emblem: { s: 1, d: 0, c: 0, t1: 2, t2: 0, t3: 0 },
                   res: { food: 0, wood: 0, stone: 0, gold: 0 } };
  mpState.allyRole = 'r5';
  mpState.allyMembers = [
    { player_id: 7, role: 'r5', joined_at: new Date().toISOString(), donated: 120000,
      players: { id: 7, nick: 'Витольд', race: 'human', power: 18600, dead_at: null } },
    { player_id: 9, role: 'r1', joined_at: new Date().toISOString(), donated: 40000,
      players: { id: 9, nick: 'Гутрум', race: 'dwarf', power: 9100, dead_at: null } }];
  mpSnapCache = null; mpSnapRefs = null;

  const panel = (x, y) => { sel = { x, y }; selMarch = null;
    let threw = null;
    try { renderCartoucheMp(); } catch (e) { threw = String(e && e.message || e); }
    return { threw, txt: (el.textContent || '').replace(/\s+/g, ' ').trim(),
             acts: [...el.querySelectorAll('[data-mp]')].map((n) => n.dataset.mp),
             dis: [...el.querySelectorAll('[data-mp]')].filter((n) => n.disabled).map((n) => n.dataset.mp) };
  };

  // --- Пустая казна: закладывать нечем ------------------------------------
  const razedPoor = panel(103, 102);
  out.razedНеУпал = !razedPoor.threw; out.razedПодробности = razedPoor.threw || '';
  out.razedНазвалЦену = /Стоит казне/.test(razedPoor.txt);
  out.razedНазвалСрок = /Срок при 2 соратн/.test(razedPoor.txt);
  out.пустаяКазнаГаситКнопку = razedPoor.acts.includes('fortstart') && razedPoor.dis.includes('fortstart');
  out.пустаяКазнаОбъяснила = /не хватает/.test(razedPoor.txt);

  // --- Полная казна: кнопка живая ----------------------------------------
  mpState.ally.res = { food: 9e6, wood: 9e6, stone: 9e6, gold: 9e6 };
  const razedRich = panel(103, 102);
  out.полнаяКазнаЖивойКнопкой = razedRich.acts.includes('fortstart') && !razedRich.dis.includes('fortstart');

  // --- Ступень: рядовой видит цену, но заложить не может ------------------
  mpState.allyRole = 'r1';
  const razedR1 = panel(103, 102);
  out.рядовойВидитЦену = /Стоит казне/.test(razedR1.txt);
  out.рядовойНеЗакладывает = razedR1.dis.includes('fortstart') && /глава и заместител/i.test(razedR1.txt);
  mpState.allyRole = 'r5';

  // --- Без союза ----------------------------------------------------------
  const keepAlly = mpState.ally;
  mpState.ally = null;
  const razedNoAlly = panel(103, 102);
  out.безСоюзаНетКнопки = !razedNoAlly.acts.includes('fortstart') && /Вступите в союз/.test(razedNoAlly.txt);
  mpState.ally = keepAlly;

  // --- Стройка ------------------------------------------------------------
  const building = panel(103, 103);
  out.стройкаНеУпала = !building.threw; out.стройкаПодробности = building.threw || '';
  out.стройкаНазвалаСоюз = /Орден Багровой Зари/.test(building.txt);
  out.стройкаПоказалаОстаток = /Готова через/.test(building.txt);
  out.стройкаДаётДоложить = building.acts.includes('forthelp');
  out.стройкаБезЗаложить = !building.acts.includes('fortstart');
  // Дружинник стройку не торопит.
  mpState.allyRole = 'r2';
  const buildingR2 = panel(103, 103);
  out.дружинникНеТоропит = !buildingR2.acts.includes('forthelp') && /старейшин/i.test(buildingR2.txt);
  mpState.allyRole = 'r5';

  // --- Готовая крепость ---------------------------------------------------
  const ally = panel(103, 104);
  out.крепостьНеУпала = !ally.threw; out.крепостьПодробности = ally.threw || '';
  out.крепостьНазвалаСоюз = /Орден Багровой Зари/.test(ally.txt);
  out.крепостьБезУровня = !/Уровень/.test(ally.txt);
  out.крепостьНазвалаВместимость = /2\.00M|2 000 000/.test(ally.txt);
  out.крепостьОткрываетСоюз = ally.acts.includes('allyview');

  // --- Гарнизон: своя крепость и чужая ------------------------------------
  out.свояПоказалаГарнизон = /Гарнизон/.test(ally.txt) && /55\.0K/.test(ally.txt);
  out.свояПоказалаМойОтряд = /Ваш отряд/.test(ally.txt) && /40\.0K/.test(ally.txt);
  out.свояДаётПодкрепление = ally.acts.includes('cartreinfpick');
  out.свояДаётЗабрать = ally.acts.includes('fortrecall');
  out.поСвоейНеБьют = !ally.acts.includes('cartraidpick') && !ally.acts.includes('cartrallypick');
  const foreign = panel(103, 105);
  out.чужаяНеУпала = !foreign.threw; out.чужаяПодробности = foreign.threw || '';
  out.чужуюШтурмуют = foreign.acts.includes('cartraidpick');
  out.наЧужуюСозываютСбор = foreign.acts.includes('cartrallypick');
  out.чужойГарнизонНеВиден = !/Гарнизон/.test(foreign.txt);
  out.вЧужуюНеШлютПодкрепление = !foreign.acts.includes('cartreinfpick');

  // Окно подкрепления.
  let rh = '', rthrew = null;
  try { mpOpenMarchModal('reinf', '103,104'); rh = mpMarchSheetHtml(); }
  catch (e) { rthrew = String(e && e.message || e); }
  const rd = document.createElement('div'); rd.innerHTML = rh;
  const rtxt = (rd.textContent || '').replace(/\s+/g, ' ').trim();
  const racts = [...rd.querySelectorAll('[data-mp]')].map((n) => n.dataset.mp);
  out.окноПодкрепленияНеУпало = !rthrew; out.окноПодкрепленияПодробности = rthrew || '';
  out.окноНазвалоКрепость = /Кузня Предков/.test(rtxt);
  out.окноПоказалоЗанятость = /55\.0K/.test(rtxt) && /2\.00M/.test(rtxt);
  out.окноДаётОтправить = racts.includes('fortsend');
  // Полная крепость — вместо кнопки объяснение.
  mpState.fortGarrison[0].units = { inf: { 1: 2000000 } };
  const full = mpMarchSheetHtml();
  const fd = document.createElement('div'); fd.innerHTML = full;
  out.полнаяКрепостьНеПускает = /полна/i.test((fd.textContent || '')) &&
    ![...fd.querySelectorAll('[data-mp]')].some((n) => n.dataset.mp === 'fortsend');
  mpState.fortGarrison[0].units = { inf: { 1: 40000 } };
  // В чужую крепость окно не открывается вовсе.
  mpOpenMarchModal('reinf', '103,105');
  const alien = mpMarchSheetHtml();
  out.вЧужуюОкноНеОткрыть = /другого союза/i.test(alien);
  // Модалку закрываем по-настоящему: mpOpenMarchModal её ОТКРЫЛА, и
  // оставленная открытой она перехватывает нажатия у всего, что проверяется
  // дальше (на этом и попались — «Пожертвовать» не докликивалось).
  mpMarchCtx = null;
  document.getElementById('building-modal').classList.remove('open');

  // --- Варвары: прежние кнопки на месте -----------------------------------
  const barb = panel(103, 101);
  out.варварыАтака = barb.acts.includes('cartraidpick');
  out.варварыСбор = barb.acts.includes('cartrallypick');
  out.варварыБезЗаложить = !barb.acts.includes('fortstart');

  // --- Казна в экране союза ----------------------------------------------
  let bankHtml = '', bankThrew = null;
  try { bankHtml = mpAllyBankHtml(); } catch (e) { bankThrew = String(e && e.message || e); }
  const bd = document.createElement('div'); bd.innerHTML = bankHtml;
  const bankTxt = (bd.textContent || '').replace(/\s+/g, ' ').trim();
  out.казнаНеУпала = !bankThrew; out.казнаПодробности = bankThrew || '';
  out.казнаПоказалаЧисла = /9\.00M/.test(bankTxt);
  out.казнаДаётФорму = ['food', 'wood', 'stone', 'gold'].every((r) => bd.querySelector('#mp-give-' + r));
  out.казнаНазвалаЖертвователей = /Витольд/.test(bankTxt) && /120\.0K/.test(bankTxt);
  out.жертвователиПоУбыванию = bankTxt.indexOf('Витольд') < bankTxt.indexOf('Гутрум');

  // --- Цвет территории в снимке мира --------------------------------------
  mpSnapCache = null; mpSnapRefs = null;
  const snap = mpWorldSnapshot();
  out.естьЦвета = Array.isArray(snap.regionOwners) && snap.regionOwners.length === 16;
  const c11 = snap.regionOwners && snap.regionOwners[11];
  // Червлень из HERALD_TINCTURE — #8e2b22.
  out.цветПоЗнамени = !!c11 && Math.abs(c11.r - 0x8e / 255) < 0.01 &&
    Math.abs(c11.g - 0x2b / 255) < 0.01 && Math.abs(c11.b - 0x22 / 255) < 0.01;
  out.цветТолькоЗахваченной = !!c11 && snap.regionOwners.filter(Boolean).length === 1;
  // Стройка — ещё не владение: цвет появляется только когда крепость встала.
  mpState.camps[3].data.state = 'building';
  mpSnapCache = null; mpSnapRefs = null;
  out.стройкаНеКрасит = mpWorldSnapshot().regionOwners.every((c) => !c);
  mpState.camps[3].data.state = 'ally';

  return out;
});

console.log('Ошибок страницы:', errors.length ? errors.slice(0, 3) : 'нет');
if (errors.length) bad++;

console.log('\nРазорённое место:');
check('панель не упала', res.razedНеУпал, res.razedПодробности);
check('назвала цену казне', res.razedНазвалЦену);
check('назвала срок по числу соратников', res.razedНазвалСрок);
check('с пустой казной кнопка гаснет', res.пустаяКазнаГаситКнопку);
check('и объясняет, чего не хватает', res.пустаяКазнаОбъяснила);
check('с полной казной кнопка живая', res.полнаяКазнаЖивойКнопкой);
check('рядовой видит цену', res.рядовойВидитЦену);
check('но заложить не может, и это подписано', res.рядовойНеЗакладывает);
check('без союза кнопки нет вовсе', res.безСоюзаНетКнопки);

console.log('\nСтройка:');
check('панель не упала', res.стройкаНеУпала, res.стройкаПодробности);
check('назвала строящий союз', res.стройкаНазвалаСоюз);
check('показала остаток срока', res.стройкаПоказалаОстаток);
check('даёт доложить из казны', res.стройкаДаётДоложить);
check('заложить второй раз не предлагает', res.стройкаБезЗаложить);
check('дружинник стройку не торопит', res.дружинникНеТоропит);

console.log('\nГотовая крепость:');
check('панель не упала', res.крепостьНеУпала, res.крепостьПодробности);
check('назвала владельца', res.крепостьНазвалаСоюз);
check('уровня у неё нет', res.крепостьБезУровня);
check('назвала вместимость 2 000 000', res.крепостьНазвалаВместимость);
check('открывает карточку союза', res.крепостьОткрываетСоюз);

console.log('\nГарнизон — своя крепость:');
check('показала гарнизон', res.свояПоказалаГарнизон);
check('и отдельно мой отряд в нём', res.свояПоказалаМойОтряд);
check('даёт отправить подкрепление', res.свояДаётПодкрепление);
check('даёт забрать свой отряд', res.свояДаётЗабрать);
check('по своей не бьют', res.поСвоейНеБьют);

console.log('\nГарнизон — чужая крепость:');
check('панель не упала', res.чужаяНеУпала, res.чужаяПодробности);
check('её штурмуют', res.чужуюШтурмуют);
check('и на неё созывают сбор', res.наЧужуюСозываютСбор);
check('чужой гарнизон отсюда не виден', res.чужойГарнизонНеВиден);
check('подкрепление в чужую не шлют', res.вЧужуюНеШлютПодкрепление);

console.log('\nОкно подкрепления:');
check('не упало', res.окноПодкрепленияНеУпало, res.окноПодкрепленияПодробности);
check('назвало крепость', res.окноНазвалоКрепость);
check('показало занятость и потолок', res.окноПоказалоЗанятость);
check('даёт кнопку «Отправить»', res.окноДаётОтправить);
check('полная крепость объясняет, а не молчит', res.полнаяКрепостьНеПускает);
check('в чужую крепость окно не открыть', res.вЧужуюОкноНеОткрыть);

console.log('\nВарвары (прежние кнопки не пострадали):');
check('«Атаковать» на месте', res.варварыАтака);
check('«Сбор союза» на месте', res.варварыСбор);
check('«Заложить» тут не предлагают', res.варварыБезЗаложить);

console.log('\nКазна союза:');
check('раздел не упал', res.казнаНеУпала, res.казнаПодробности);
check('показала числа казны', res.казнаПоказалаЧисла);
check('дала форму на все четыре ресурса', res.казнаДаётФорму);
check('назвала жертвователей', res.казнаНазвалаЖертвователей);
check('щедрые сверху', res.жертвователиПоУбыванию);

console.log('\nЦвет территории (снимок мира → движок):');
check('массив на шестнадцать областей', res.естьЦвета);
check('цвет взят из знамени владельца', res.цветПоЗнамени);
check('ничейные области не окрашены', res.цветТолькоЗахваченной);
check('стройка ещё не красит — только готовая крепость', res.стройкаНеКрасит);

// Пожертвование уходит на сервер тем, чем набрано.
await page.evaluate(() => { openMenuModal('alliance'); mpRerender(); });
await page.waitForTimeout(400);
const hasForm = await page.evaluate(() => !!document.querySelector('#mp-give-food'));
check('форма казны дошла до живого экрана союза', hasForm);
if (hasForm) {
  await page.fill('#mp-give-food', '50000');
  await page.fill('#mp-give-stone', '25000');
  await page.click("[data-mp='allydonate']");
  await page.waitForTimeout(400);
  const d = sent.find((s) => s.body && s.body.op === 'donate');
  check('«Пожертвовать» шлёт набранное', !!d && d.body.res.food === 50000 && d.body.res.stone === 25000,
    JSON.stringify(d && d.body));
}

await b.close();
console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
process.exit(bad ? 1 : 0);
