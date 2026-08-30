// Крепость союза и казна (Фаза 55): панель места, казна, цвет территории.
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

let bad = 0;
const ok = (v) => (v ? '✓' : '✗');
const check = (label, cond, note) => { if (!cond) bad++; console.log('  ' + ok(cond) + ' ' + label + (note ? '  — ' + note : '')); };

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
