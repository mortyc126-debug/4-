// Общий сбор союза (Фаза 53) — деление войск и окна сбора.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. У сбора есть одно место, где ошибка не видна
// глазом и не падает с исключением: РАЗДЕЛ УЦЕЛЕВШИХ между участниками
// (splitSurvivorsByParts в mp-tick). Ошибка там не рвёт ничего — она просто
// возвращает людям не то число воинов, что ушло, и заметить это можно только
// сложив всё вручную. Поэтому первая половина проверки считает именно суммы:
// сколько ушло в бой, столько и разошлось по замкам, ни воином больше.
//
// Вторая половина — обычная страховка окон (тот же приём, что и
// check_cartouche.mjs): созыв, присоединение и список сборов обязаны
// нарисоваться и показать нужные кнопки.
//
// Запуск:
//   node tools/check_rally.mjs                 (только счёт долей)
//   npx http-server -p 8099 . &                (и тогда ещё и окна)
//   node tools/check_rally.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';

let bad = 0;
const ok = (b) => (b ? '✓' : '✗');
const check = (label, cond, note) => {
  if (!cond) bad++;
  console.log('  ' + ok(cond) + ' ' + label + (note ? '  — ' + note : ''));
};

// ---------------------------------------------------------------------------
// Часть 1. Деление уцелевших и добычи. Функции берём ИЗ ИСХОДНИКА mp-tick,
// а не переписываем сюда: копия проверяла бы саму себя.
const tick = readFileSync('supabase/functions/mp-tick/index.js', 'utf8');
const cut = (name) => {
  const at = tick.indexOf('function ' + name + '(');
  if (at < 0) throw new Error('в mp-tick нет функции ' + name);
  let i = tick.indexOf('{', at), depth = 0;
  for (let j = i; j < tick.length; j++) {
    if (tick[j] === '{') depth++;
    else if (tick[j] === '}') { depth--; if (!depth) return tick.slice(at, j + 1); }
  }
  throw new Error('не закрылась ' + name);
};
const TKEYS = ['inf', 'arc', 'cav', 'sie'];
const sandbox = new Function('TKEYS',
  cut('largestRemainder') + '\n' + cut('splitSurvivorsByParts') +
  '\nreturn { largestRemainder, splitSurvivorsByParts };')(TKEYS);
const { largestRemainder, splitSurvivorsByParts } = sandbox;

const U = (o) => { const u = {}; TKEYS.forEach((t) => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = (o[t + i]) || 0; }); return u; };
const tot = (u) => TKEYS.reduce((s, t) => s + [1, 2, 3, 4, 5].reduce((a, i) => a + (u[t][i] || 0), 0), 0);
const add = (a, b) => { const o = U({}); TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) o[t][i] = a[t][i] + b[t][i]; }); return o; };

console.log('Доли: наибольшие остатки');
check('сумма кусков равна целому (нечётный случай)',
  largestRemainder(10, [1, 1, 1], 3).reduce((a, b) => a + b, 0) === 10,
  JSON.stringify(largestRemainder(10, [1, 1, 1], 3)));
check('ноль делится в ноль', largestRemainder(0, [5, 5], 10).every((n) => n === 0));
check('пустой знаменатель не рождает войск', largestRemainder(7, [0, 0], 0).every((n) => n === 0));
check('одна доля забирает всё', JSON.stringify(largestRemainder(9, [4], 4)) === '[9]');
{
  const r = largestRemainder(100, [1, 99], 100);
  check('мелкая доля не пропадает целиком', r[0] >= 1 && r[0] + r[1] === 100, JSON.stringify(r));
}

console.log('\nРаздел уцелевших между участниками');
{
  // Три соратника с разным составом — ровно тот случай, ради которого делится
  // каждая клетка отдельно: у одного только осадные, у другого только конница.
  const parts = [
    { player_id: 1, units: U({ inf1: 1000, arc2: 500 }) },
    { player_id: 2, units: U({ cav3: 300 }) },
    { player_id: 3, units: U({ sie1: 120, inf1: 3 }) },
  ];
  const sent = parts.reduce((a, p) => add(a, p.units), U({}));
  // Половина пехоты и все осадные полегли, конница цела.
  const surv = U({ inf1: 500, arc2: 500, cav3: 300, sie1: 0 });
  const mine = splitSurvivorsByParts(surv, parts);
  check('всего вернулось ровно столько, сколько уцелело',
    mine.reduce((s, u) => s + tot(u), 0) === tot(surv),
    mine.map(tot).join(' + ') + ' vs ' + tot(surv));
  check('никто не получил чужого рода войск',
    mine.every((u, k) => TKEYS.every((t) => [1, 2, 3, 4, 5].every((i) =>
      u[t][i] === 0 || parts[k].units[t][i] > 0))));
  check('никому не вернулось больше, чем он привёл',
    mine.every((u, k) => TKEYS.every((t) => [1, 2, 3, 4, 5].every((i) =>
      u[t][i] <= parts[k].units[t][i]))));
  check('уцелевшая конница целиком у того, кто её привёл',
    mine[1].cav[3] === 300 && mine[0].cav[3] === 0 && mine[2].cav[3] === 0);
  check('павшие осадные никому не вернулись', mine.every((u) => u.sie[1] === 0));
  check('пехоту поделили по долям (1000 : 3)',
    mine[0].inf[1] + mine[2].inf[1] === 500 && mine[0].inf[1] > mine[2].inf[1],
    mine[0].inf[1] + ' / ' + mine[2].inf[1]);
  check('исходная сумма сбора не изменилась', tot(sent) === 1923, String(tot(sent)));
}
{
  // Полный разгром: не вернулся никто.
  const parts = [{ player_id: 1, units: U({ inf1: 10 }) }, { player_id: 2, units: U({ inf1: 10 }) }];
  const mine = splitSurvivorsByParts(U({}), parts);
  check('после полного разгрома не возвращается никто', mine.every((u) => tot(u) === 0));
}
{
  // Победа без потерь: у каждого своё, до последнего воина.
  const parts = [{ player_id: 1, units: U({ inf1: 7, cav5: 13 }) }, { player_id: 2, units: U({ inf1: 11 }) }];
  const surv = U({ inf1: 18, cav5: 13 });
  const mine = splitSurvivorsByParts(surv, parts);
  check('победа без потерь возвращает каждому его же отряд',
    tot(mine[0]) === 20 && tot(mine[1]) === 11 && mine[0].cav[5] === 13);
}

// ---------------------------------------------------------------------------
// Часть 2. Окна сбора. Нужен поднятый http-server; без него — тихо пропускаем,
// чтобы счёт долей выше можно было гонять и без браузера.
let up = false;
try { up = (await fetch('http://localhost:8099/index.html')).ok; } catch (_) { /* нет сервера */ }
if (!up) {
  console.log('\n(окна не проверены: подними `npx http-server -p 8099 .`)');
  console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
  process.exit(bad ? 1 : 0);
}

const PW = [process.env.PW_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs',
            '/usr/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const c of PW) { try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) {} }
if (!chromium) { console.error('playwright не найден; укажите PW_PATH'); process.exit(2); }
const CHROME = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ...(existsSync('/opt/pw-browsers') ? readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium-'))
      .map((d) => '/opt/pw-browsers/' + d + '/chrome-linux/chrome') : [])].filter(Boolean).find((p) => existsSync(p));

const now = Date.now() / 1000;
const un = (n = 0) => { const u = {}; TKEYS.forEach((t) => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = n; }); return u; };
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
await page.route('**/functions/v1/**', (r) => r.request().url().includes('mp-join')
  ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, world_id: 'w1', player }) })
  : r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await page.route('**/engine/dist/**', (r) => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

const r = await page.evaluate(() => {
  const out = {};
  const acts = (html) => { const d = document.createElement('div'); d.innerHTML = html;
    return [...d.querySelectorAll('[data-mp]')].map((n) => n.dataset.mp); };
  const txt = (html) => { const d = document.createElement('div'); d.innerHTML = html;
    return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

  mpState.camps = [
    { x: 102, y: 101, t: 'camp', data: { lv: 4 } },
    { x: 103, y: 101, t: 'regfort', data: { region: 6, region_name: 'Зелёные Земли', shrine: 'Житница Предвечных',
                                            tier: 3, state: 'barb', alliance_id: null, razed_at: null } },
    { x: 103, y: 102, t: 'regfort', data: { region: 7, region_name: 'Великая Степь', shrine: 'Ханская Ставка',
                                            tier: 3, state: 'razed', alliance_id: null, razed_at: null } },
  ];
  mpState.neighbors = [{ id: 9, nick: 'Гутрум', race: 'dwarf', x: 104, y: 103, is_bot: false,
                         hall: '9', gen: '0', shield_until: 0, rating: 1200, rating_battles: 12 }];
  mpState.allyOf = { 7: { id: 11, name: 'Орден Багровой Зари', tag: 'ЗАРЯ', emblem: null, role: 'r5' } };
  mpSnapCache = null; mpSnapRefs = null;

  // --- Кнопка «Сбор союза» в панели мира ---------------------------------
  const el = document.getElementById('cartouche');
  const panel = (cell) => { sel = cell; selMarch = null; renderCartoucheMp();
    return [...el.querySelectorAll('[data-mp]')].map((n) => n.dataset.mp); };
  mpState.ally = null; mpState.allyRole = '';
  out.безСоюзаКнопкиНет = !panel({ x: 102, y: 101 }).includes('cartrallypick');
  mpState.ally = { id: 11, name: 'Орден Багровой Зари', tag: 'ЗАРЯ', members_max: 30, power: 1 };
  mpState.allyRole = 'r5';
  out.сборНаЛагерь = panel({ x: 102, y: 101 }).includes('cartrallypick');
  out.сборНаКрепость = panel({ x: 103, y: 101 }).includes('cartrallypick');
  out.наРазорённуюНеСозывают = !panel({ x: 103, y: 102 }).includes('cartrallypick');
  out.сборНаГород = panel({ x: 104, y: 103 }).includes('cartrallypick');

  // --- Окно созыва --------------------------------------------------------
  let threw = null, html = '';
  try { mpOpenMarchModal('rally', '103,101'); html = mpMarchSheetHtml(); } catch (e) { threw = String(e && e.message || e); }
  out.созывНеУпал = !threw; out.созывПодробности = threw || '';
  out.созывНеПуст = html.length > 200;
  out.созывНазвалЦель = /Житница Предвечных/.test(txt(html));
  out.созывДаётСроки = acts(html).filter((a) => a === 'rallymin').length === 4;
  out.созывДаётКнопку = acts(html).includes('rallystart');
  out.созывПоказалВместимость = /Вместимость сбора/.test(txt(html));
  // Срок переключается и держится.
  mpMarchCtx.minutes = 360;
  out.срокДержится = /Ждём соратников/.test(txt(mpMarchSheetHtml()));

  // Без Центра Альянса — не кнопка, а объяснение.
  const wasLv = mpState.player.state.b.alliance;
  mpState.player.state.b.alliance = 0;
  const noCenter = mpMarchSheetHtml();
  out.безЦентраОбъяснили = /Центр Альянса/.test(txt(noCenter)) && !acts(noCenter).includes('rallystart');
  mpState.player.state.b.alliance = wasLv;

  // --- Список сборов и присоединение -------------------------------------
  out.пустойСписокНеУпал = (() => { try { mpState.rallies = []; return /Сборы/.test(txt(mpRalliesHtml())); }
                                    catch (e) { out.списокОшибка = String(e); return false; } })();
  mpState.rallies = [{
    id: 5, alliance_id: 11, leader_id: 9, tx: 103, ty: 101, target_kind: 'regfort',
    target_name: 'Житница Предвечных', gather_until: new Date(Date.now() + 8 * 60000).toISOString(),
    state: 'gather', march_id: null, cap: 51000, has_gen: true,
    alliance_rally_parts: [
      { player_id: 9, units: { inf: { 1: 4000 } }, joined_at: new Date().toISOString(), players: { id: 9, nick: 'Гутрум', race: 'dwarf' } },
    ],
  }, {
    // Свой собственный сбор, ещё стоящий: у него обязана быть «Распустить».
    id: 7, alliance_id: 11, leader_id: 7, tx: 102, ty: 101, target_kind: 'camp',
    target_name: 'Лагерь варваров', gather_until: new Date(Date.now() + 3 * 60000).toISOString(),
    state: 'gather', march_id: null, cap: 51000, has_gen: false,
    alliance_rally_parts: [
      { player_id: 7, units: { inf: { 1: 200 } }, joined_at: new Date().toISOString(), players: { id: 7, nick: 'Витольд', race: 'human' } },
    ],
  }, {
    // Уже выступивший — им управлять нельзя ни созвавшему, ни участнику.
    id: 6, alliance_id: 11, leader_id: 7, tx: 102, ty: 101, target_kind: 'camp',
    target_name: 'Лагерь варваров', gather_until: new Date(Date.now() - 60000).toISOString(),
    state: 'march', march_id: 99, cap: 51000, has_gen: false,
    alliance_rally_parts: [
      { player_id: 7, units: { inf: { 1: 200 } }, joined_at: new Date().toISOString(), players: { id: 7, nick: 'Витольд', race: 'human' } },
    ],
  }];
  let lh = '';
  try { lh = mpRalliesHtml(); } catch (e) { out.списокОшибка = String(e && e.message || e); }
  out.списокНеПуст = lh.length > 200;
  out.чужойСборЗовётПрисоединиться = acts(lh).includes('rallyopen');
  out.своимСборомМожноРаспустить = acts(lh).includes('rallycancel');
  // У вышедшего (id 6) не должно быть НИ ОДНОЙ своей кнопки — ни созвавшему,
  // ни участнику: «сбором в отличие от одиночного марша управлять нельзя».
  out.вышедшимНеУправляют = !new RegExp("data-mp='(rallyopen|rallycancel|rallywithdraw)' data-id='6'").test(lh);
  out.списокНазвалСозвавшего = /Гутрум/.test(txt(lh));
  // fmt() крупные числа пишет как «51.0K» — сверяемся с ним же, а не с
  // придуманным видом: иначе проверка ловила бы форматирование, а не смысл.
  out.списокПоказалЁмкость = txt(lh).includes('из ' + fmt(51000));

  // Окно присоединения.
  let jh = '', jthrew = null;
  try { mpOpenMarchModal('rallyjoin', '5'); jh = mpMarchSheetHtml(); } catch (e) { jthrew = String(e && e.message || e); }
  out.присоединениеНеУпало = !jthrew; out.присоединениеПодробности = jthrew || '';
  out.присоединениеДаётКнопку = acts(jh).includes('rallyjoin');
  out.присоединениеНазвалоСозвавшего = /Гутрум/.test(txt(jh));
  out.присоединениеБезПолководца = !/Взять полководца/.test(txt(jh));
  // Полный сбор — вместо кнопки объяснение.
  mpState.rallies[0].cap = 4000;
  const full = mpMarchSheetHtml();
  out.полныйСборНеПускает = /полон/i.test(txt(full)) && !acts(full).includes('rallyjoin');
  return out;
});

console.log('\nОшибок страницы:', errors.length ? errors.slice(0, 3) : 'нет');
if (errors.length) bad++;

console.log('\nКнопка «Сбор союза» в панели мира:');
check('без союза её нет', r.безСоюзаКнопкиНет);
check('на лагере варваров есть', r.сборНаЛагерь);
check('на крепости области есть', r.сборНаКрепость);
check('на разорённой крепости нет', r.наРазорённуюНеСозывают);
check('на чужом городе есть', r.сборНаГород);

console.log('\nОкно созыва:');
check('не упало', r.созывНеУпал, r.созывПодробности);
check('нарисовалось', r.созывНеПуст);
check('назвало цель по имени', r.созывНазвалЦель);
check('дало все четыре срока', r.созывДаётСроки);
check('дало кнопку «Созвать сбор»', r.созывДаётКнопку);
check('показало вместимость', r.созывПоказалВместимость);
check('срок переключается', r.срокДержится);
check('без Центра Альянса объясняет, а не молчит', r.безЦентраОбъяснили);

console.log('\nСписок сборов:');
check('пустой список не падает', r.пустойСписокНеУпал, r.списокОшибка || '');
check('нарисовался', r.списокНеПуст, r.списокОшибка || '');
check('в чужой сбор зовёт присоединиться', r.чужойСборЗовётПрисоединиться);
check('свой сбор можно распустить', r.своимСборомМожноРаспустить);
check('вышедшим сбором управлять нельзя', r.вышедшимНеУправляют);
check('назвал созвавшего', r.списокНазвалСозвавшего);
check('показал вместимость', r.списокПоказалЁмкость);

console.log('\nОкно присоединения:');
check('не упало', r.присоединениеНеУпало, r.присоединениеПодробности);
check('дало кнопку «Присоединиться»', r.присоединениеДаётКнопку);
check('назвало созвавшего', r.присоединениеНазвалоСозвавшего);
check('полководца у присоединяющегося не спрашивает', r.присоединениеБезПолководца);
check('полный сбор объясняет, а не молчит', r.полныйСборНеПускает);

await b.close();
console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
process.exit(bad ? 1 : 0);
