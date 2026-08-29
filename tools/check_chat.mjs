// Чат (Фаза 54): док в основных окнах, полное окно, разговоры, мини-профиль.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. Док чата — первый узел игры, который живёт СОСЕДОМ
// #app и показывается селектором соседства от #app.view-city/.view-world (тот
// же приём, что у #mp-build-fab — и там на нём уже спотыкались: потомковый
// селектор просто не совпадал ни разу, поймали Playwright-проверкой). Ошибка
// такого рода не падает и не видна в коде: узел есть, разметка есть, а на
// экране пусто. Поэтому видимость дока тут проверяется в БРАУЗЕРЕ, а не по
// исходнику.
//
// Второе, ради чего она заведена: три новых узла (док, окно, мини-профиль)
// лежат ВНЕ модалок, и ни один из прежних слушателей до их data-mp-кнопок не
// достаёт. Ровно так уже дважды ломались #building-modal и #menu-modal-body.
// Поэтому здесь всё нажимается по-настоящему, мышью, а не вызовом функции.
//
// Запуск:
//   npx http-server -p 8099 . &
//   node tools/check_chat.mjs
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
// Подставной supabase — но, в отличие от соседних проверок, ЗНАЮЩИЙ ТАБЛИЦЫ:
// отдаёт то, что лежит в window.__fx[<таблица>]. Без этого любое действие
// чата стирало бы фикстуру: mpDoChat после успеха честно перечитывает ленты,
// а немой заглушке отвечать нечем, кроме пустоты. Ровно на этом сначала и
// попались — «личный разговор открылся» падало не из-за кода, а из-за стенда.
// maybeSingle/single тоже разобраны: без них выборка «моё членство в союзе»
// получала бы массив там, где ждёт одну строку.
const STUB = `window.__fx={};
window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'t'}},error:null}),signInAnonymously:async()=>({data:{session:{access_token:'t'}},error:null})},from:(t)=>makeQB(t)})};
function makeQB(table){
  const st={single:false};
  const res=()=>{ const rows=(window.__fx&&window.__fx[table])||[];
    return st.single?{data:rows.length?rows[0]:null,error:null,count:rows.length}
                    :{data:rows,error:null,count:rows.length}; };
  const x=new Proxy(function(){},{get(_t,k){
    if(k==='then') return (a,b)=>Promise.resolve(res()).then(a,b);
    if(k==='catch') return (a)=>Promise.resolve(res()).catch(a);
    if(k==='finally') return (a)=>Promise.resolve(res()).finally(a);
    if(k==='maybeSingle'||k==='single') return ()=>{ st.single=true; return x; };
    return ()=>x;
  },apply(){return x}});
  return x;
}`;

const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await b.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
// Что ушло на сервер — собираем, чтобы проверить не только «кнопка нажалась»,
// но и «улетело именно то, что надо».
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

// Опрос глушим: подставная выборка отдаёт пустоту и стёрла бы фикстуру на
// первом же такте (на этом уже попались, снимая экраны).
await page.evaluate(() => {
  mpStopPolling();
  const ago = (n) => new Date(Date.now() - n * 1000).toISOString();
  const ALLY = { id: 11, world_id: 'w1', name: 'Орден Багровой Зари', tag: 'ЗАРЯ', motto: '', open: true,
                 min_power: 0, members: 2, members_max: 30, power: 27700, leader_id: 7, emblem: null,
                 disbanded_at: null };
  window.__fx = {
    alliances: [ALLY],
    alliance_members: [{ player_id: 7, alliance_id: 11, role: 'r5', joined_at: ago(9999),
                         alliances: ALLY,
                         players: { id: 7, nick: 'Витольд', race: 'human', power: 18600, x: 100, y: 100,
                                    rating: 1000, rating_battles: 3, dead_at: null } },
                       { player_id: 9, alliance_id: 11, role: 'r1', joined_at: ago(8888),
                         alliances: ALLY,
                         players: { id: 9, nick: 'Гутрум', race: 'dwarf', power: 9100, x: 104, y: 103,
                                    rating: 1200, rating_battles: 12, dead_at: null } }],
    alliance_applications: [],
    alliance_chat: [{ id: 2, alliance_id: 11, player_id: 9, nick: 'Гутрум', kind: 'say',
                      body: 'Сбор через час', created_at: ago(20) }],
    alliance_rallies: [],
    world_chat: [
      { id: 5, world_id: 'w1', player_id: 9,  nick: 'Гутрум',   tag: 'ЗАРЯ', race: 'dwarf',  kind: 'say', body: 'Кто идёт на Житницу?', created_at: ago(30) },
      { id: 4, world_id: 'w1', player_id: 12, nick: 'Аэлинор',  tag: '',     race: 'elf',    kind: 'say', body: 'Три жилы на востоке',  created_at: ago(120) },
      { id: 3, world_id: 'w1', player_id: null, nick: '',       tag: '',     race: '',       kind: 'system', body: 'Мир открыт.',       created_at: ago(300) },
      { id: 2, world_id: 'w1', player_id: 14, nick: 'Морхольт', tag: 'ТЕНЬ', race: 'undead', kind: 'say', body: 'Пустошь наша',         created_at: ago(600) },
      { id: 1, world_id: 'w1', player_id: 9,  nick: 'Гутрум',   tag: 'ЗАРЯ', race: 'dwarf',  kind: 'say', body: 'старая строка',        created_at: ago(900) }],
    chat_dm: [
      { id: 3, world_id: 'w1', from_id: 9,  to_id: 7, from_nick: 'Гутрум',  body: 'Дай камня взаймы', read_at: null,   created_at: ago(60) },
      { id: 2, world_id: 'w1', from_id: 7,  to_id: 9, from_nick: 'Витольд', body: 'Сколько надо?',    read_at: ago(50), created_at: ago(50) },
      { id: 1, world_id: 'w1', from_id: 12, to_id: 7, from_nick: 'Аэлинор', body: 'Привет!',          read_at: null,   created_at: ago(400) }],
    friends: [{ lo_id: 7, hi_id: 9,  by_id: 9,  state: 'ok',      created_at: ago(9999) },
              { lo_id: 7, hi_id: 12, by_id: 12, state: 'pending', created_at: ago(500) }],
  };
  mpState.neighbors = [{ id: 9, nick: 'Гутрум', race: 'dwarf', x: 104, y: 103, is_bot: false,
                         hall: '9', gen: '0', shield_until: 0, rating: 1200, rating_battles: 12, power: 9100 }];
});
// Ленты набираются НАСТОЯЩИМИ выборками из подставной базы — тем же путём,
// каким они наберутся в игре.
await page.evaluate(async () => {
  await Promise.all([mpRefreshAlliance(), mpRefreshAllyOf(), mpRefreshWorldChat(),
                     mpRefreshDm(), mpRefreshFriends()]);
  mpRerender();
});
await page.waitForTimeout(300);

let bad = 0;
const ok = (b) => (b ? '✓' : '✗');
const check = (label, cond, note) => { if (!cond) bad++; console.log('  ' + ok(cond) + ' ' + label + (note ? '  — ' + note : '')); };
const vis = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return false;
  const st = getComputedStyle(el);
  return st.display !== 'none' && st.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
}, sel);
const txt = (sel) => page.evaluate((s) => {
  const el = document.querySelector(s); return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
}, sel);

console.log('Ошибок страницы:', errors.length ? errors.slice(0, 3) : 'нет');
if (errors.length) bad++;

// --- Док в основных окнах -------------------------------------------------
console.log('\nДок чата в основных окнах:');
check('виден в Городе', await vis('#chat-dock'));
const dockBox = await page.evaluate(() => {
  const d = document.querySelector('#chat-dock').getBoundingClientRect();
  const l = document.querySelector('#view-toggle').getBoundingClientRect();
  const r = document.querySelector('#menu-btn').getBoundingClientRect();
  return { d: [d.left, d.right, d.bottom], l: l.right, r: r.left, w: innerWidth };
});
check('стоит снизу по центру, не залезая на круглые кнопки',
  dockBox.d[0] > dockBox.l && dockBox.d[1] < dockBox.r && dockBox.d[2] > 700,
  'кнопки ' + Math.round(dockBox.l) + '..' + Math.round(dockBox.r) + ', док ' +
  Math.round(dockBox.d[0]) + '..' + Math.round(dockBox.d[1]));
await page.evaluate(() => { $('#app').classList.remove('view-city'); $('#app').classList.add('view-world'); mpRerender(); });
await page.waitForTimeout(150);
check('виден в Мире', await vis('#chat-dock'));
await page.evaluate(() => { $('#app').classList.remove('view-world'); $('#app').classList.add('view-city'); mpRerender(); });
await page.waitForTimeout(150);

const dockTabs = await page.evaluate(() => [...document.querySelectorAll('#chat-dock-tabs button')]
  .map((n) => ({ mp: n.dataset.mp, t: n.dataset.t, txt: n.textContent.trim() })));
check('вкладок ровно две — «Глобальный» и «Альянс»',
  dockTabs.filter((t) => t.mp === 'chatdocktab').length === 2 &&
  dockTabs[0].txt === 'Глобальный' && dockTabs[1].txt === 'Альянс',
  dockTabs.map((t) => t.txt).join(' | '));
// Счётчик складывает непрочитанные личные (две) и приглашения дружить (одно).
check('непрочитанное личное и приглашения показаны счётчиком',
  dockTabs.some((t) => t.mp === 'chatopen' && /3/.test(t.txt)),
  dockTabs.map((t) => t.txt).join(' | '));
const lineN = await page.evaluate(() => document.querySelectorAll('#chat-dock .cd-line').length);
check('показаны последние 3-4 строки', lineN >= 3 && lineN <= 4, String(lineN));
const dockTxt = await txt('#chat-dock-lines');
check('последняя реплика — самая свежая (снизу)', /Кто идёт на Житницу/.test(dockTxt));
check('метка союза в доке видна', /\[ЗАРЯ\]/.test(dockTxt));

// Вкладка альянса переключает ленту — нажатием, а не вызовом функции.
await page.click("#chat-dock-tabs button[data-t='ally']");
await page.waitForTimeout(150);
check('вкладка «Альянс» переключает ленту', /Сбор через час/.test(await txt('#chat-dock-lines')));
await page.click("#chat-dock-tabs button[data-t='world']");
await page.waitForTimeout(150);

// Без союза вкладки альянса быть не должно.
await page.evaluate(() => { window.__ally = mpState.ally; mpState.ally = null; mpRerender(); });
await page.waitForTimeout(150);
check('без союза вкладка «Альянс» не рисуется',
  !(await page.evaluate(() => !!document.querySelector("#chat-dock-tabs button[data-t='ally']"))));
await page.evaluate(() => { mpState.ally = window.__ally; mpRerender(); });
await page.waitForTimeout(150);

// --- Полное окно ----------------------------------------------------------
console.log('\nПолное окно по клику на док:');
await page.click('#chat-dock-lines');
await page.waitForTimeout(250);
check('открылось', await vis('#chat-modal'));
const rail = await page.evaluate(() => [...document.querySelectorAll('#chat-rail button')]
  .map((n) => ({ th: n.dataset.th, txt: n.textContent.trim(), on: n.classList.contains('on') })));
check('в полосе есть мир, союз и друзья',
  rail.some((r) => r.th === 'world') && rail.some((r) => r.th === 'ally') && rail.some((r) => r.th === 'friends'),
  rail.map((r) => r.txt).join(' | '));
check('подразделы по правителям — оба собеседника',
  rail.some((r) => r.th === 'dm:9') && rail.some((r) => r.th === 'dm:12'),
  rail.filter((r) => String(r.th).startsWith('dm:')).map((r) => r.txt).join(', '));
check('непрочитанное помечено у нужных разговоров',
  /1/.test((rail.find((r) => r.th === 'dm:9') || {}).txt || '') &&
  /1/.test((rail.find((r) => r.th === 'dm:12') || {}).txt || ''));
const bodyTxt = await txt('#chat-body');
check('мировая лента показана целиком', /Кто идёт на Житницу/.test(bodyTxt) && /старая строка/.test(bodyTxt));
check('системная строка не подписана ником', /Мир открыт/.test(bodyTxt));

// Переключение на личный разговор — кликом по подразделу.
await page.click("#chat-rail button[data-th='dm:9']");
await page.waitForTimeout(250);
check('личный разговор открылся', /Дай камня взаймы/.test(await txt('#chat-body')));
check('заголовок окна назвал собеседника', /Гутрум/.test(await txt('#chat-title')));
check('открытие разговора сняло «непрочитано»',
  sent.some((s) => s.fn === 'mp-chat' && s.body && s.body.op === 'dmread' && s.body.withId === 9),
  JSON.stringify(sent.filter((s) => s.body && s.body.op === 'dmread').map((s) => s.body)));

// Отправка уходит туда, куда открыт разговор.
await page.fill('#chat-say', 'Пришлю тысячу');
await page.click("#chat-modal [data-mp='chatsay']");
await page.waitForTimeout(350);
const dm = sent.find((s) => s.body && s.body.op === 'dm');
check('реплика в личном ушла собеседнику, а не в мир',
  !!dm && dm.body.toId === 9 && dm.body.body === 'Пришлю тысячу', JSON.stringify(dm && dm.body));
check('поле очистилось после успеха', (await page.inputValue('#chat-say')) === '');

await page.click("#chat-rail button[data-th='ally']");
await page.waitForTimeout(200);
await page.fill('#chat-say', 'Иду');
await page.press('#chat-say', 'Enter');           // Enter отправляет
await page.waitForTimeout(350);
const asay = sent.find((s) => s.fn === 'mp-alliance' && s.body && s.body.op === 'say');
check('в союзной ленте Enter шлёт в mp-alliance, а не в мировой чат',
  !!asay && asay.body.body === 'Иду', JSON.stringify(asay && asay.body));

await page.click("#chat-rail button[data-th='world']");
await page.waitForTimeout(200);
await page.fill('#chat-say', 'Всем привет');
await page.click("#chat-modal [data-mp='chatsay']");
await page.waitForTimeout(350);
const wsay = sent.find((s) => s.fn === 'mp-chat' && s.body && s.body.op === 'say');
check('реплика в мировой ленте ушла в mp-chat', !!wsay && wsay.body.body === 'Всем привет');

// --- Друзья ---------------------------------------------------------------
console.log('\nРаздел «Друзья»:');
await page.click("#chat-rail button[data-th='friends']");
await page.waitForTimeout(250);
const frTxt = await txt('#chat-body');
check('приглашение показано отдельно от дружбы', /Зовут в друзья/.test(frTxt) && /Друзья/.test(frTxt));
check('говорить в списке нечего — строка ввода спрятана', !(await vis('#chat-modal .cm-foot')));
await page.click("#chat-body [data-mp='friendok']");
await page.waitForTimeout(350);
const fok = sent.find((s) => s.body && s.body.op === 'friendok');
check('«Принять» шлёт friendok на позвавшего', !!fok && fok.body.playerId === 12, JSON.stringify(fok && fok.body));

// --- Мини-профиль по нику -------------------------------------------------
console.log('\nМини-профиль по клику на ник:');
await page.click("#chat-rail button[data-th='world']");
await page.waitForTimeout(200);
await page.click("#chat-body [data-mp='chatwho'][data-id='9']");
await page.waitForTimeout(250);
check('открылся', await vis('#mini-profile'));
const mini = await page.evaluate(() => ({
  txt: (document.querySelector('#mini-profile').textContent || '').replace(/\s+/g, ' ').trim(),
  acts: [...document.querySelectorAll('#mini-profile [data-mp]')].map((n) => n.dataset.mp) }));
check('есть «Чат», «Письмо» и кнопка дружбы',
  mini.acts.includes('chatdm') && mini.acts.includes('cartmail') &&
  (mini.acts.includes('friendadd') || mini.acts.includes('friendno') || mini.acts.includes('friendok')),
  mini.acts.join(', '));
check('назвал союз и звание', /Орден Багровой Зари/.test(mini.txt) && /Звание/.test(mini.txt), mini.txt.slice(0, 80));
check('у друга кнопка «Расстаться», а не «Добавить»',
  mini.acts.includes('friendno') && !mini.acts.includes('friendadd'));
// Незнакомец — кнопка «Добавить в друзья».
await page.click("#chat-body [data-mp='chatwho'][data-id='14']");
await page.waitForTimeout(250);
const mini2 = await page.evaluate(() => [...document.querySelectorAll('#mini-profile [data-mp]')].map((n) => n.dataset.mp));
check('незнакомца зовут в друзья', mini2.includes('friendadd'), mini2.join(', '));
await page.click("#mini-profile [data-mp='friendadd']");
await page.waitForTimeout(350);
const fadd = sent.find((s) => s.body && s.body.op === 'friendadd');
check('«Добавить в друзья» шлёт friendadd на него', !!fadd && fadd.body.playerId === 14, JSON.stringify(fadd && fadd.body));

// Уход на другой экран закрывает окна чата.
await page.click("#chat-body [data-mp='chatwho'][data-id='9']");
await page.waitForTimeout(200);
await page.click("#mini-profile [data-mp='cartmail']");
await page.waitForTimeout(300);
check('уход в почту закрыл и мини-профиль, и окно чата',
  !(await vis('#mini-profile')) && !(await vis('#chat-modal')));

// --- Док не мешает модалкам ----------------------------------------------
console.log('\nДок и модалки:');
check('при открытом меню док спрятан', !(await vis('#chat-dock')));
await page.evaluate(() => { closeMenuModal(); mpRerender(); });
await page.waitForTimeout(250);
check('меню закрыли — док вернулся', await vis('#chat-dock'));

await b.close();
console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
process.exit(bad ? 1 : 0);
