// Фаза 49 — союзы: экран «Альянс», таблица мира, вкладка почты.
//
// Проверяет РИСОВАНИЕ и ПРОВОДКУ, а не сервер: mpState набивается вручную,
// как будто выборки из mp-alliance/RLS уже пришли, и дальше смотрим, что
// экран собирается тем, чем должен, и что каждая нарисованная кнопка союза
// доходит до своего обработчика. Именно эта пара и разъезжается молча:
// разметку добавили, а слушателю про новый data-mp не сказали (ровно так уже
// ломался выбор полководца, см. Фазу 20 в supabase/README.md).
//
// Запуск:
//   npx http-server -p 8099 . &   # или любой статический сервер в корне
//   node tools/check_alliance.mjs
//
// Playwright ищется по нескольким местам, а не одним жёстким путём: у
// соседних проверок в tools/ он вписан абсолютным путём во временную папку
// той сессии, что их писала, и после её удаления они не запускаются вовсе.
// PW_PATH в окружении перекрывает поиск.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const PW_CANDIDATES = [
  process.env.PW_PATH,
  'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs',
].filter(Boolean);
let chromium = null;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) { /* дальше */ }
}
if (!chromium) { console.error('playwright не найден; укажите PW_PATH=/путь/к/playwright/index.mjs'); process.exit(2); }

// Тот же поиск для самого браузера: имя папки с версией меняется от сборки
// к сборке (chromium-1194 и т.д.), а безверсионная ссылка есть не всегда.
const require_ = createRequire(import.meta.url);
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  ...(existsSync('/opt/pw-browsers')
      ? require_('node:fs').readdirSync('/opt/pw-browsers')
          .filter(d => d.startsWith('chromium-'))
          .map(d => '/opt/pw-browsers/' + d + '/chrome-linux/chrome')
      : []),
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find(p => existsSync(p));

const now = Date.now() / 1000;
const TK = ['inf', 'arc', 'cav', 'sie'];
const units = (n = 0) => { const u = {}; TK.forEach(t => { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = n; }); return u; };
const mkState = (allianceLv) => ({
  race: 'human',
  b: { hall: 12, wall: 5, farm: [6, 0, 0, 0], lumber: [5, 0, 0, 0], quarry: [4, 0, 0, 0], mine: [3, 0, 0, 0],
       store: 6, barracks: 8, range: 0, stable: 0, siege: 3, hospital: [4, 0, 0, 0], academy: 8,
       garrison: 3, scout: 2, forge: 0, portal: 0, market: 5, alliance: allianceLv },
  layout: [{ b: 'barracks', plot: null, gx: 5, gy: 12 }],
  queues: [], train: { inf: null, arc: null, cav: null, sie: null },
  troops: units(50), wounded: units(), heal: null, rsch: null, craft: null,
  res: { food: 9e6, wood: 9e6, stone: 9e6, gold: 9e6 }, resAt: now,
  gen: { lv: 5, xp: 0, pts: 5, tal: {}, id: 0, away: null }, gear: {}, tech: {}, inventory: {},
  materials: { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] },
  tomes: {}, amber: 900,
});
const player = {
  id: 7, world_id: 'w1', auth_uid: 'u1', is_bot: false, race: 'human', nick: 'Витольд', name: '',
  x: 120, y: -40, shield_until: 0, power: 18600, state: mkState(0),
  created_at: new Date(Date.now() - 864e5).toISOString(),
  updated_at: new Date().toISOString(), dead_at: null,
};

// Тот же приём, что и у остальных проверок в tools/: supabase-js подменён
// заглушкой, любая выборка отвечает пустотой — данные для экрана мы кладём в
// mpState сами.
const STUB = `
window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data:{ session:{ access_token:'tok' } }, error:null }),
          signInAnonymously: async () => ({ data:{ session:{ access_token:'tok' } }, error:null }) },
  from: () => makeQB() }) };
function makeQB(){ const p = Promise.resolve({ data: [], error: null });
  const proxy = new Proxy(function(){}, { get(_t,k){
    if(k==='then') return p.then.bind(p); if(k==='catch') return p.catch.bind(p);
    if(k==='finally') return p.finally.bind(p); return () => proxy; }, apply(){ return proxy; } });
  return proxy; }
`;

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (!/Failed to load resource/.test(t)) errors.push('CONSOLE: ' + t);
});
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stub */' }));
await page.route('**/functions/v1/**', r => r.request().url().includes('mp-join')
  ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, world_id: 'w1', player }) })
  : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
await page.route('**/engine/dist/**', r => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

const r = await page.evaluate(({ stateNoCenter, stateWithCenter }) => {
  const out = {};
  // Два готовых состояния города: без Центра Альянса и с третьим уровнем.
  const mkState = (lv) => JSON.parse(JSON.stringify(lv ? stateWithCenter : stateNoCenter));
  const text = (html) => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };
  const acts = (html) => { const d = document.createElement('div'); d.innerHTML = html;
    return [...d.querySelectorAll('[data-mp]')].map(n => n.dataset.mp); };
  const enabled = (html, act) => { const d = document.createElement('div'); d.innerHTML = html;
    const n = d.querySelector("[data-mp='" + act + "']"); return n ? !n.disabled : null; };

  const P = mpState.player;
  const reset = () => {
    mpState.ally = null; mpState.allyRole = ''; mpState.allyMembers = []; mpState.allyApps = [];
    mpState.allyChat = []; mpState.allyList = []; mpState.allyMyApps = []; mpState.allianceMail = [];
    mpAllyErr = null; mpAllyOk = null;
  };

  // --- 1. Не в союзе, Центра Альянса нет ---------------------------------
  reset();
  P.state = mkState(0);
  let h = mpAllianceHtml();
  out.безЦентра_текст = /Нужен Центр Альянса/.test(text(h));
  out.безЦентра_формыНет = acts(h).indexOf('allycreate') < 0;
  // Список союзов теперь на второй вкладке — переключаемся, как игрок.
  mpAllyNoneTab = 'join'; const hJoin0 = mpAllianceHtml(); mpAllyNoneTab = 'create';
  out.безЦентра_пустойСписок = /не основано ни одного союза/.test(text(hJoin0));
  out.вкладкиЕсть = (h.match(/data-mp='allynonetab'/g) || []).length === 2;
  out.вкладкаПоУмолчаниюОснование = /Основать союз/.test(text(h));

  // --- 2. Не в союзе, Центр есть, в мире два союза -----------------------
  P.state = mkState(3);   // 20 + 4*3 = 32 места
  mpState.allyList = [
    { id: 11, name: 'Орден Багровой Зари', tag: 'ЗАРЯ', motto: 'Свет из пепла', open: true, min_power: 0, members: 4, members_max: 30, power: 120000 },
    { id: 12, name: 'Тихий Дозор', tag: 'ДОЗР', motto: '', open: false, min_power: 0, members: 30, members_max: 30, power: 90000 },
  ];
  h = mpAllianceHtml();
  out.сЦентром_формаЕсть = acts(h).indexOf('allycreate') >= 0;
  out.сЦентром_мест30 = /Мест в союзе — 30/.test(text(h));
  // Флаг выбирается там же, где имя, — на вкладке основания.
  out.создание_флагЗдесьЖе = acts(h).indexOf('allyemblem') >= 0 && acts(h).indexOf('allytint') >= 0;
  out.создание_цветПоляПодписан = /им же окрасятся ваши земли/i.test(text(h));
  out.создание_ценаЯнтарь = /500 янтаря/.test(text(h)) && /У вас 900/.test(text(h));
  out.создание_кнопкаЖива = enabled(h, 'allycreate') === true;
  // Не хватает янтаря — кнопка гаснет и сказано, сколько недостаёт.
  P.state.amber = 100;
  const hPoor = mpAllianceHtml();
  out.создание_безЯнтаряГаснет = enabled(hPoor, 'allycreate') === false;
  out.создание_сказаноСколькоНеХватает = /Не хватает 400/.test(text(hPoor));
  P.state.amber = 900;
  // Дальше — вкладка со списком союзов.
  mpAllyNoneTab = 'join';
  h = mpAllianceHtml();
  out.сЦентром_вступить = acts(h).indexOf('allyjoin') >= 0;
  // Полный союз кнопку вступления не показывает вовсе — сервер всё равно
  // откажет, а нажимаемая кнопка, которая всегда отвечает отказом, хуже её
  // отсутствия.
  out.сЦентром_полныйБезКнопки = (h.match(/data-mp='allyjoin'/g) || []).length === 1;
  out.сЦентром_полноПодписано = /Полно/.test(text(h));
  // Поданная заявка меняет кнопку на «Отозвать».
  mpState.allyMyApps = [{ alliance_id: 11, created_at: new Date().toISOString() }];
  h = mpAllianceHtml();
  out.заявка_отозвать = acts(h).indexOf('allycancel') >= 0;

  // --- 2б. Приглашения ----------------------------------------------------
  // Показываются НАД вкладками, на любой из них: приглашение может протухнуть
  // (союз наполнится), и прятать его за переключателем нельзя.
  mpState.allyMyApps = [];
  mpState.allyInvites = [{ alliance_id: 12, created_at: new Date().toISOString(), by_nick: 'Гутрум',
    alliances: { id: 12, name: 'Тихий Дозор', tag: 'ДОЗР', emblem: null, members: 5, members_max: 30, power: 90000 } }];
  const hInvCreate = (mpAllyNoneTab = 'create', mpAllianceHtml());
  const hInvJoin = (mpAllyNoneTab = 'join', mpAllianceHtml());
  out.приглашение_наОбеихВкладках =
    acts(hInvCreate).indexOf('allyinviteok') >= 0 && acts(hInvJoin).indexOf('allyinviteok') >= 0;
  out.приглашение_ктоПозвал = /позвал Гутрум/.test(text(hInvJoin));
  out.приглашение_можноОтказаться = acts(hInvJoin).indexOf('allyinviteno') >= 0;
  mpState.allyInvites = [];
  mpAllyNoneTab = 'join';

  // --- 3. В союзе соратником ---------------------------------------------
  reset();
  const ally = { id: 11, world_id: 'w1', name: 'Орден Багровой Зари', tag: 'ЗАРЯ',
    motto: 'Свет из пепла', open: true, min_power: 0, members: 3, members_max: 30,
    power: 120000, leader_id: 9 };
  const mem = (id, nick, role, days) => ({ player_id: id, role, joined_at: new Date(Date.now() - days * 864e5).toISOString(),
    players: { id, nick, race: 'human', power: 40000, x: 0, y: 0, rating: 0, rating_battles: 0, dead_at: null } });
  // allyRole и роль своей строки в составе всегда согласованы — их обе
  // ставит mpRefreshAlliance из ОДНОЙ выборки членства. Расходиться им негде,
  // и стенд не должен изображать состояние, которого не бывает.
  mpState.ally = ally; mpState.allyRole = 'r1';
  mpState.allyMembers = [mem(9, 'Гутрум', 'r5', 30), mem(8, 'Эльна', 'r4', 20), mem(7, 'Витольд', 'r1', 2)];
  // Как отдаёт база (order created_at desc + limit) — свежие первыми;
  // переворачивает показ, а не клиент (см. .ally-chat, column-reverse).
  mpState.allyChat = [
    { id: 3, kind: 'say', player_id: 7, nick: 'Витольд', body: 'Иду.', created_at: new Date(Date.now() - 6e4).toISOString() },
    { id: 2, kind: 'say', player_id: 9, nick: 'Гутрум', body: 'Собираемся на востоке.', created_at: new Date(Date.now() - 6e5).toISOString() },
    { id: 1, kind: 'system', player_id: null, nick: '', body: 'Союз основан. Глава — Гутрум.', created_at: new Date(Date.now() - 3e6).toISOString() },
  ];
  // Заявка есть, но соратнику её не показывают (RLS её ему и не отдаст —
  // проверка роли тут про то, что рисовать).
  mpState.allyApps = [{ player_id: 5, created_at: new Date().toISOString(), players: { id: 5, nick: 'Проситель', race: 'elf', power: 1000 } }];
  h = mpAllianceHtml();
  const a3 = acts(h);
  out.соратник_метка = /\[ЗАРЯ\]/.test(text(h));
  out.соратник_составВидит = /Гутрум/.test(text(h)) && /Эльна/.test(text(h));
  out.соратник_ролиПодписаны = /Глава/.test(text(h)) && /Заместитель/.test(text(h)) && /Новик/.test(text(h));
  out.соратник_чатЕсть = /Собираемся на востоке/.test(text(h)) && /Союз основан/.test(text(h));
  // Порядок в разметке — свежие первыми: на этом держится column-reverse,
  // и перепутать его молча — значит открыть чат на самой старой реплике.
  out.соратник_чатСвежиеПервыми = text(h).indexOf('Иду.') < text(h).indexOf('Союз основан');
  out.соратник_можетСказать = a3.indexOf('allysay') >= 0;
  out.соратник_заявокНеВидит = a3.indexOf('allyaccept') < 0;
  out.соратник_порядкаНеВидит = a3.indexOf('allyedit') < 0;
  out.соратник_неИсключает = a3.indexOf('allykick') < 0;
  out.соратник_неРаспускает = a3.indexOf('allydisband') < 0;
  out.соратник_можетУйти = enabled(h, 'allyleave') === true;

  // --- 4. В союзе старейшиной --------------------------------------------
  // Я — старейшина, надо мной глава, подо мной один соратник: исключить
  // можно ровно его, главу нельзя.
  mpState.allyRole = 'r4';
  mpState.allyMembers = [mem(9, 'Гутрум', 'r5', 30), mem(7, 'Витольд', 'r4', 2), mem(8, 'Эльна', 'r2', 20)];
  h = mpAllianceHtml();
  const a4 = acts(h);
  out.старейшина_видитЗаявки = a4.indexOf('allyaccept') >= 0 && a4.indexOf('allyreject') >= 0;
  out.старейшина_правитПорядок = a4.indexOf('allyedit') >= 0;
  out.старейшина_исключаетМладшего = (h.match(/data-mp='allykick'/g) || []).length === 1;
  out.старейшина_неРаздаётРоли = a4.indexOf('allyrole') < 0;
  out.старейшина_неРаспускает = a4.indexOf('allydisband') < 0;

  // --- 5. В союзе главой ---------------------------------------------------
  // Я — глава, подо мной старейшина и соратник: оба исключаемы, обоим можно
  // сменить роль (по две кнопки на каждого — «повысить/разжаловать» и
  // «отдать союз»).
  mpState.allyRole = 'r5';
  mpState.allyMembers = [mem(7, 'Витольд', 'r5', 2), mem(8, 'Эльна', 'r4', 20), mem(9, 'Гутрум', 'r2', 30)];
  h = mpAllianceHtml();
  const a5 = acts(h);
  out.глава_раздаётРоли = a5.indexOf('allyrole') >= 0;
  // Лестница из пяти ступеней: шаг вверх и шаг вниз, каждый — только если
  // ему есть куда. У заместителя (r4) вверх дороги нет — выше только глава, а
  // главой делает лишь передача союза; значит одна кнопка. У дружинника (r2)
  // обе. Итого три на двоих — а не «по одной на каждого», как было при двух
  // ступенях.
  out.глава_ролевыхКнопок = (h.match(/data-mp='allyrole'/g) || []).length;
  const roleTargets = (html) => { const d = document.createElement('div'); d.innerHTML = html;
    return [...d.querySelectorAll("[data-mp='allyrole']")].map(n => n.dataset.role).sort(); };
  out.глава_кудаВедутРоли = roleTargets(h).join(',');
  // Разбором, а не регулярным выражением: «нет allyhand внутри строки
  // состава» — вопрос о вложенности, и по плоскому тексту он не проверяется
  // (любой .* пролезет через всю разметку до кнопки, стоящей ниже списка).
  const inRows = (html, act) => { const d = document.createElement('div'); d.innerHTML = html;
    return d.querySelectorAll(".rank-row [data-mp='" + act + "']").length; };
  out.глава_передачаНеВСоставе = inRows(h, 'allyhand') === 0;
  out.глава_передачаВРасставании = a5.indexOf('allyhand') >= 0;
  // В выборе наследника — оба соратника, себя в нём нет.
  const heirSel = (h.match(/<select id='mp-ally-heir'>([^]*?)<\/select>/)||[])[1]||'';
  out.глава_наследников = (heirSel.match(/<option/g)||[]).length;
  out.глава_себяНетВНаследниках = heirSel.indexOf("value='7'") < 0;
  out.глава_исключаетДвоих = (h.match(/data-mp='allykick'/g) || []).length === 2;
  out.глава_распускает = a5.indexOf('allydisband') >= 0;
  // Глава не уходит просто так, пока в союзе есть кто-то ещё.
  out.глава_уйтиНельзя = enabled(h, 'allyleave') === false;
  out.глава_объяснено = /передав старшинство/.test(text(h));
  // Последний в союзе — уйти можно (союз распустится сам).
  mpState.allyMembers = [mem(7, 'Витольд', 'r5', 2)];
  h = mpAllianceHtml();
  out.одинВСоюзе_уйтиМожно = enabled(h, 'allyleave') === true;

  // --- 5б. Метка на кнопке меню «Альянс» ----------------------------------
  // Метится только неразобранное — заявки, и только у тех, кто их разбирает.
  mpState.allyApps = [{ player_id: 5, created_at: new Date().toISOString(), players: { id: 5, nick: 'Бранд', race: 'elf', power: 1000 } }];
  mpState.allyMembers = [mem(7, 'Витольд', 'r5', 2), mem(8, 'Эльна', 'r4', 20)];
  mpState.allyRole = 'r5';  out.метка_главе = menuBadges().alliance;
  mpState.allyRole = 'r4';  out.метка_заместителю = menuBadges().alliance;
  mpState.allyRole = 'r1';  out.метка_соратнику = menuBadges().alliance;
  mpState.ally = null; mpState.allyRole = ''; mpState.allyApps = [];
  out.метка_безСоюза = menuBadges().alliance;
  mpState.ally = ally; mpState.allyRole = 'r5';

  // --- 5в. Герб союза ------------------------------------------------------
  // Собирается на canvas из трёх лент-масок и отдаётся разметке как data:URL
  // (см. heraldUrl). Проверяем: атласы доехали, сборка даёт картинку, кэш
  // отдаёт ТУ ЖЕ строку на тот же герб и РАЗНУЮ на разный, мусор не роняет
  // сборку, и мастерская рисует ровно столько кадров, сколько их в лентах.
  out.герб_атласыЕсть = heraldReady === true;
  const em1 = { s: 3, d: 0, c: 1, t1: 2, t2: 0, t3: 1 };
  const u1 = heraldUrl(em1), u2 = heraldUrl({ ...em1 }), u3 = heraldUrl({ ...em1, t1: 4 });
  out.герб_рисуется = /^data:image\/png;base64,/.test(u1);
  out.герб_кэшТотЖе = u1 === u2;
  out.герб_другойЦветДругаяКартинка = u1 !== u3;
  // Мусор из базы (null, обрезок, число вне ленты) обязан не ронять сборку:
  // союз мог быть основан до этой правки, и герба у него нет вовсе.
  out.герб_мусорНеРонит = ['', null, undefined, {}, { s: 999, d: -3, c: 1e9, t1: 'x' }]
    .every(v => { try { return /^data:image/.test(heraldUrl(v)); } catch (_) { return false; } });
  out.герб_поумолчанию = JSON.stringify(heraldSane(null)) === JSON.stringify(HERALD_DEFAULT);

  // Мастерская — только заместителю и выше, и кадров ровно по лентам.
  mpState.ally = { ...ally, emblem: em1 };
  mpState.allyRole = 'r5'; mpAllyEmblemDraft = null;
  let hw = mpAllianceHtml();
  const cells = (html, f) => { const d = document.createElement('div'); d.innerHTML = html;
    return d.querySelectorAll("[data-mp='allyemblem'][data-f='" + f + "']").length; };
  out.герб_формЩита = cells(hw, 's');
  out.герб_делений = cells(hw, 'd');        // +1 на «гладкое поле»
  out.герб_фигур = cells(hw, 'c');          // +1 на «без фигуры»
  const tints = (html, f) => { const d = document.createElement('div'); d.innerHTML = html;
    return d.querySelectorAll("[data-mp='allytint'][data-f='" + f + "']").length; };
  out.герб_тинктур = tints(hw, 't1');
  // Пока черновика нет — записывать нечего, кнопок нет.
  out.герб_безЧерновикаНетКнопок = !/data-mp='allyemblemsave'/.test(hw);
  // Черновик — и кнопки появились, а щит показывает уже его, не записанное.
  mpAllyEmblemDraft = { ...em1, t1: 4 };
  hw = mpAllianceHtml();
  out.герб_сЧерновикомЕстьКнопки = /data-mp='allyemblemsave'/.test(hw) && /data-mp='allyemblemreset'/.test(hw);
  out.герб_щитПоказываетЧерновик = hw.indexOf(heraldUrl({ ...em1, t1: 4 })) >= 0;
  mpAllyEmblemDraft = null;
  // Соратнику мастерская не показывается вовсе.
  mpState.allyRole = 'r1';
  out.герб_новикуНеПоказан = !/data-mp='allyemblem'/.test(mpAllianceHtml());
  mpState.allyRole = 'r5'; mpState.ally = ally;

  // --- 6. Таблица мира «Альянс» -------------------------------------------
  const board = MP_BOARDS.find(b => b.id === 'alliance');
  out.таблица_неЗаглушка = !!board && !board.stub && board.table === 'alliances';
  out.таблица_строка = board ? text(board.rowHtml({ id: 11, name: 'Орден Багровой Зари', tag: 'ЗАРЯ', members: 4, members_max: 30, power: 120000 }, 0, true)) : '';
  out.таблица_естьМетка = /ЗАРЯ/.test(out.таблица_строка);
  out.таблица_естьСостав = /4\/30/.test(out.таблица_строка);
  out.таблица_мойСоюз = board ? board.mineId() : null;
  // Ни у одной из девяти таблиц не осталось заглушки — ветка stub мертва.
  out.таблица_заглушекНет = MP_BOARDS.every(b => !b.stub);

  // --- 7. Вкладка почты «Альянс» -------------------------------------------
  mpState.allianceMail = [{ id: 501, created_at: new Date().toISOString(), kind: 'alliance',
    data: { title: 'Вас приняли в союз', body: 'Союз «Орден Багровой Зари» [ЗАРЯ] принял вашу заявку.' } }];
  const entries = mpMailAllianceEntries();
  out.почта_писем = entries.length;
  out.почта_заголовок = entries.length ? entries[0].title : '';
  out.почта_открывается = !!mpMailEntryById(501);

  // --- 8. Проводка: у каждой нарисованной кнопки есть обработчик ----------
  // Собираем все data-mp со ВСЕХ состояний экрана и сверяем с ветками
  // handleMpAct по её же исходнику. Это ровно тот разрыв, на котором уже
  // ломался выбор полководца в Фазе 20.
  const drawn = new Set();
  // Заявка обязана быть: без неё не рисуются allyaccept/allyreject, и
  // проверка проводки молча перестала бы их проверять.
  mpState.allyApps = [{ player_id: 5, created_at: new Date().toISOString(),
                        players: { id: 5, nick: 'Бранд', race: 'elf', power: 1000 } }];
  mpState.ally = ally; mpState.allyRole = 'r5';
  mpState.allyMembers = [mem(9, 'Гутрум', 'r2', 30), mem(8, 'Эльна', 'r4', 20), mem(7, 'Витольд', 'r5', 2)];
  acts(mpAllianceHtml()).forEach(a => drawn.add(a));
  // С черновиком герба — иначе «Записать»/«Отменить» не рисуются и в
  // проверку проводки не попадут.
  mpAllyEmblemDraft = { s: 2, d: 3, c: 4, t1: 1, t2: 2, t3: 3 };
  acts(mpAllianceHtml()).forEach(a => drawn.add(a));
  mpAllyEmblemDraft = null;
  reset(); P.state = mkState(3); P.state.amber = 900;
  mpState.allyList = [{ id: 11, name: 'Орден', tag: 'ЗАРЯ', motto: '', open: true, min_power: 0, members: 1, members_max: 30, power: 1 }];
  mpState.allyInvites = [{ alliance_id: 12, by_nick: 'Гутрум',
    alliances: { id: 12, name: 'Дозор', tag: 'ДОЗР', emblem: null, members: 1, members_max: 30, power: 1 } }];
  // Обе вкладки: на одной форма основания с гербом, на другой список союзов.
  for (const t of ['create', 'join']) { mpAllyNoneTab = t; acts(mpAllianceHtml()).forEach(a => drawn.add(a)); }
  mpState.allyMyApps = [{ alliance_id: 11 }];
  mpAllyNoneTab = 'join';
  acts(mpAllianceHtml()).forEach(a => drawn.add(a));
  // Карточка чужого союза — свои две кнопки (назад и вступление).
  mpAllyView = 12;
  mpAllyViewData = { alliance: { id: 12, name: 'Дозор', tag: 'ДОЗР', motto: '', open: true,
                                 members_max: 30, power: 1, emblem: null, disbanded_at: null },
                     members: [{ player_id: 8, role: 'r5', joined_at: new Date().toISOString(),
                                 players: { id: 8, nick: 'Эльна', race: 'elf', power: 1, dead_at: null } }] };
  acts(mpAllianceHtml()).forEach(a => drawn.add(a));
  mpAllyView = null; mpAllyViewData = null;
  const src = handleMpAct.toString();
  out.кнопкиЭкрана = [...drawn].filter(a => a.indexOf('ally') === 0).sort();
  out.безОбработчика = out.кнопкиЭкрана.filter(a => src.indexOf("data-mp='" + a + "'") < 0);

  // --- 9. Кнопка помощи у стройки больше не врёт про «союзов нет» ---------
  P.state = mkState(3);
  P.state.queues = [{ b: 'store', plot: null, lv: 7, t0: Date.now() / 1000 - 100, t1: Date.now() / 1000 + 300 }];
  const card = mpBuildingModalHtmlFor('store', null);
  out.помощь_безСоюза = /Сначала нужен союз/.test(text(card));
  mpState.ally = ally;
  const card2 = mpBuildingModalHtmlFor('store', null);
  out.помощь_вСоюзе = /Сама помощь ещё делается/.test(text(card2));
  out.помощь_неВрёт = !/Союзов в игре пока нет/.test(text(card) + text(card2));
  return out;
}, { stateNoCenter: mkState(0), stateWithCenter: mkState(3) });

const ok = (b) => b ? '✓' : '✗';
let bad = 0;
const check = (label, cond) => { if (!cond) bad++; console.log('  ' + ok(cond) + ' ' + label); };

console.log('ошибок страницы:', errors.length, errors.slice(0, 3));
if (errors.length) bad++;

console.log('\nНе в союзе, Центра Альянса нет:');
check('сказано, что нужен Центр Альянса', r.безЦентра_текст);
check('формы основания нет', r.безЦентра_формыНет);
check('пустой список союзов подписан', r.безЦентра_пустойСписок);
check('вкладок ровно две', r.вкладкиЕсть);
check('по умолчанию открыто основание', r.вкладкаПоУмолчаниюОснование);

console.log('\nНе в союзе, Центр Альянса 3 уровня:');
check('форма основания есть', r.сЦентром_формаЕсть);
check('мест в союзе — тридцать, не по зданию', r.сЦентром_мест30);
check('флаг выбирается там же, где имя', r.создание_флагЗдесьЖе);
check('цвет поля подписан как цвет земель', r.создание_цветПоляПодписан);
check('цена 500 янтаря и остаток показаны', r.создание_ценаЯнтарь);
check('с янтарём кнопка основания жива', r.создание_кнопкаЖива);
check('без янтаря кнопка гаснет', r.создание_безЯнтаряГаснет);
check('и сказано, сколько не хватает', r.создание_сказаноСколькоНеХватает);
check('в открытый союз можно вступить', r.сЦентром_вступить);
check('у полного союза кнопки вступления нет', r.сЦентром_полныйБезКнопки);
check('полный союз подписан «Полно»', r.сЦентром_полноПодписано);
check('поданная заявка даёт «Отозвать»', r.заявка_отозвать);

console.log('\nПриглашения:');
check('видны на обеих вкладках', r.приглашение_наОбеихВкладках);
check('сказано, кто позвал', r.приглашение_ктоПозвал);
check('можно отказаться', r.приглашение_можноОтказаться);

console.log('\nВ союзе новиком (r1, младшая ступень):');
check('метка союза видна', r.соратник_метка);
check('состав виден', r.соратник_составВидит);
check('ступени подписаны именами (Глава / Заместитель / Новик)', r.соратник_ролиПодписаны);
check('чат и летопись союза видны', r.соратник_чатЕсть);
check('в разметке свежие реплики первыми (под column-reverse)', r.соратник_чатСвежиеПервыми);
check('может сказать в чат', r.соратник_можетСказать);
check('заявок не видит', r.соратник_заявокНеВидит);
check('порядок союза не правит', r.соратник_порядкаНеВидит);
check('никого не исключает', r.соратник_неИсключает);
check('союз не распускает', r.соратник_неРаспускает);
check('уйти может', r.соратник_можетУйти);

console.log('\nВ союзе заместителем (r4):');
check('видит и разбирает заявки', r.старейшина_видитЗаявки);
check('правит порядок приёма', r.старейшина_правитПорядок);
check('исключает только младшего (одного из двух)', r.старейшина_исключаетМладшего);
check('роли не раздаёт', r.старейшина_неРаздаётРоли);
check('союз не распускает', r.старейшина_неРаспускает);

console.log('\nВ союзе главой:');
check('раздаёт роли', r.глава_раздаётРоли);
check('ролевых кнопок три: заместителю вниз, дружиннику вверх и вниз (' + r.глава_ролевыхКнопок + ')',
      r.глава_ролевыхКнопок === 3);
check('и ведут они на r3,r3,r1 (' + r.глава_кудаВедутРоли + ')', r.глава_кудаВедутРоли === 'r1,r3,r3');
check('передача союза не засоряет строки состава', r.глава_передачаНеВСоставе);
check('передача союза есть в «Расставании»', r.глава_передачаВРасставании);
check('в наследниках оба соратника (' + r.глава_наследников + ')', r.глава_наследников === 2);
check('себя в наследниках нет', r.глава_себяНетВНаследниках);
check('исключает обоих младших', r.глава_исключаетДвоих);
check('распускает союз', r.глава_распускает);
check('уйти не может, пока союз не пуст', r.глава_уйтиНельзя);
check('и это объяснено словами', r.глава_объяснено);
check('оставшись один — уйти может', r.одинВСоюзе_уйтиМожно);

console.log('\nГерб союза:');
check('атласы геральдики загрузились', r.герб_атласыЕсть);
check('герб собирается в картинку', r.герб_рисуется);
check('тот же герб — та же строка (кэш)', r.герб_кэшТотЖе);
check('другая тинктура — другая картинка', r.герб_другойЦветДругаяКартинка);
check('null и мусор из базы не роняют сборку', r.герб_мусорНеРонит);
check('у союза без герба — герб по умолчанию', r.герб_поумолчанию);
check('форм щита ' + r.герб_формЩита + ' (ждали 11)', r.герб_формЩита === 11);
check('делений ' + r.герб_делений + ' (24 + «гладкое поле»)', r.герб_делений === 25);
check('фигур ' + r.герб_фигур + ' (40 + «без фигуры»)', r.герб_фигур === 41);
check('тинктур ' + r.герб_тинктур + ' (ждали 9)', r.герб_тинктур === 9);
check('без черновика кнопок записи нет', r.герб_безЧерновикаНетКнопок);
check('с черновиком есть «Записать» и «Отменить»', r.герб_сЧерновикомЕстьКнопки);
check('щит показывает черновик, а не записанное', r.герб_щитПоказываетЧерновик);
check('новику мастерская не показана', r.герб_новикуНеПоказан);

console.log('\nМетка на кнопке «Альянс»:');
check('главе видна заявка (' + r.метка_главе + ')', r.метка_главе === 1);
check('заместителю видна заявка (' + r.метка_заместителю + ')', r.метка_заместителю === 1);
check('соратнику метки нет (' + r.метка_соратнику + ')', r.метка_соратнику === 0);
check('без союза метки нет (' + r.метка_безСоюза + ')', r.метка_безСоюза === 0);

console.log('\nТаблица мира «Альянс»:');
check('не заглушка, читает alliances', r.таблица_неЗаглушка);
check('в строке есть метка', r.таблица_естьМетка);
check('в строке есть состав', r.таблица_естьСостав);
check('заглушек не осталось ни у одной таблицы', r.таблица_заглушекНет);
console.log('    строка:', r.таблица_строка);

console.log('\nВкладка почты «Альянс»:');
check('письмо разобрано', r.почта_писем === 1);
check('заголовок на месте: ' + r.почта_заголовок, /приняли в союз/i.test(r.почта_заголовок));
check('открывается по id', r.почта_открывается);

console.log('\nПроводка кнопок:');
console.log('    нарисовано:', r.кнопкиЭкрана.join(', '));
check('у каждой есть ветка в handleMpAct', r.безОбработчика.length === 0);
// Кнопок на экране шестнадцать, а операций на сервере двенадцать: allyhand
// (передача союза) шлёт тот же op "role" со своим выбором наследника и
// переспросом, а три кнопки герба (выбор кадра, выбор тинктуры, отмена)
// вообще ничего не шлют — правят черновик. Число сторожит от тихой потери
// кнопки при правке экрана.
// Число сторожит от ТИХОЙ ПОТЕРИ кнопки при правке экрана, поэтому проверка
// на равенство, а не на «не меньше»: пропавшая кнопка так же интересна, как и
// новая. Появление новой — не поломка, а повод дописать ей проверку и
// поправить это число (22 — Фаза 55 добавила «Пожертвовать»).
check('в проверку попали все двадцать две кнопки союза (' + r.кнопкиЭкрана.length + ')',
      r.кнопкиЭкрана.length === 22);
if (r.безОбработчика.length) console.log('    БЕЗ ОБРАБОТЧИКА:', r.безОбработчика.join(', '));

console.log('\nКнопка помощи у идущей стройки:');
check('без союза зовёт завести союз', r.помощь_безСоюза);
check('в союзе честно говорит, что помощь ещё делается', r.помощь_вСоюзе);
check('старой неправды «Союзов в игре пока нет» больше нет', r.помощь_неВрёт);

// ---------------------------------------------------------------------------
// Выбранный флаг переживает такт опроса.
//
// ЗАЧЕМ ОТДЕЛЬНО. Автор сообщил: «не могу флаг выбрать, он обновляется
// постоянно». Черновик герба стирался в mpRefreshAlliance на КАЖДОМ опросе у
// того, кто ещё не в союзе, — то есть ровно у того, кто основывает союз и
// выбирает флаг. Строка эта верна была до Фазы 52, пока мастерская жила
// только внутри союза; Фаза 52 перенесла выбор в форму основания, а строку
// снять забыли.
//
// Прежняя проверка выше этого поймать НЕ МОГЛА, и вот почему: немая заглушка
// supabase отдаёт на maybeSingle() `{data: []}`, а пустой массив ИСТИНЕН —
// mpRefreshAlliance уходила в ветку «я в союзе» и до сломанной строки не
// доходила ни разу. Поэтому здесь заглушка своя, знающая таблицы: только с
// ней «я не в союзе» — это настоящее «не в союзе».
const draft = await page.evaluate(async () => {
  const out = {};
  mpStopPolling();
  const fx = { alliance_members: [], alliances: [], alliance_applications: [],
               alliance_chat: [], alliance_rallies: [], alliance_fort_garrison: [] };
  const realFrom = sb.from.bind(sb);
  sb.from = (table) => {
    const st = { single: false };
    const res = () => { const rows = fx[table] || [];
      return st.single ? { data: rows.length ? rows[0] : null, error: null } : { data: rows, error: null }; };
    const x = new Proxy(function () {}, { get(_t, k) {
      if (k === 'then') return (a, b) => Promise.resolve(res()).then(a, b);
      if (k === 'catch') return (a) => Promise.resolve(res()).catch(a);
      if (k === 'finally') return (a) => Promise.resolve(res()).finally(a);
      if (k === 'maybeSingle' || k === 'single') return () => { st.single = true; return x; };
      return () => x;
    }, apply() { return x; } });
    return x;
  };

  mpState.ally = null; mpState.allyRole = ''; mpAllyEmblemDraft = null;
  mpAllyNoneTab = 'create';
  openMenuModal('alliance');
  // Выбираем флаг ТАК ЖЕ, как игрок: нажатием на настоящую кнопку в разметке.
  // По полю И по значению: у трёх лент выбора (щит/деление/фигура) один и тот
  // же data-mp, и без data-f селектор берёт первую попавшуюся — на этом уже
  // споткнулись, проверка утверждала про фигуру, а нажимала щит.
  const pick = (mp, f, v) => {
    const b = document.querySelector("#menu-modal-body [data-mp='" + mp +
      "'][data-f='" + f + "'][data-v='" + v + "']");
    if (!b) return false;
    b.click();
    return true;
  };
  out.кнопкиЕсть = pick('allytint', 't1', 4) && pick('allyemblem', 'c', 7);
  out.выборЛёг = !!mpAllyEmblemDraft && mpAllyEmblemDraft.t1 === 4;
  const before = JSON.stringify(mpAllyEmblemDraft);

  // Такт опроса — настоящий, тот самый, что стирал выбор.
  await mpRefreshAlliance();
  out.выборПережилОпрос = JSON.stringify(mpAllyEmblemDraft) === before;
  // И ещё несколько тактов подряд, как оно и бывает.
  await mpRefreshAlliance(); await mpRefreshAlliance();
  out.выборПережилТриОпроса = JSON.stringify(mpAllyEmblemDraft) === before;
  // Экран после опроса всё ещё показывает выбранное, а не герб по умолчанию.
  out.экранПоказываетВыбранное = mpAllyEmblemNow(null).t1 === 4 && mpAllyEmblemNow(null).c === 7;

  // Союз появился — черновик формы основания своё отслужил.
  fx.alliance_members = [{ player_id: 7, alliance_id: 11, role: 'r5', joined_at: new Date().toISOString(),
                           donated: 0, players: { id: 7, nick: 'Витольд', race: 'human', dead_at: null } }];
  fx.alliances = [{ id: 11, world_id: 'w1', name: 'Орден', tag: 'ЗАРЯ', motto: '', open: true, min_power: 0,
                    members: 1, members_max: 30, power: 1, emblem: { s: 1, d: 0, c: 0, t1: 2, t2: 0, t3: 0 },
                    leader_id: 7, disbanded_at: null, res: { food: 0, wood: 0, stone: 0, gold: 0 } }];
  await mpRefreshAlliance();
  out.вСоюзеЧерновикСброшен = mpAllyEmblemDraft === null;
  // ...и мастерская открывается с гербом самого союза.
  out.мастерскаяСГербомСоюза = mpAllyEmblemNow(mpState.ally).t1 === 2;

  // Уход из союза черновик тоже не оставляет.
  mpAllyEmblemDraft = { s: 3, d: 0, c: 0, t1: 5, t2: 0, t3: 0 };
  fx.alliance_members = []; fx.alliances = [];
  await mpRefreshAlliance();
  out.послеВыходаЧерновикаНет = mpAllyEmblemDraft === null;

  sb.from = realFrom;
  return out;
});

console.log('\nВыбранный флаг переживает опрос:');
check('кнопки флага на месте', draft.кнопкиЕсть);
check('нажатие ложится в черновик', draft.выборЛёг);
check('такт опроса выбор не стирает', draft.выборПережилОпрос);
check('и три такта подряд тоже', draft.выборПережилТриОпроса);
check('экран показывает выбранное, а не герб по умолчанию', draft.экранПоказываетВыбранное);
check('союз появился — черновик основания сброшен', draft.вСоюзеЧерновикСброшен);
check('мастерская открывается с гербом союза', draft.мастерскаяСГербомСоюза);
check('после выхода из союза черновика не остаётся', draft.послеВыходаЧерновикаНет);

await browser.close();
console.log('\n' + (bad ? bad + ' проверок не прошло' : 'все проверки прошли'));
process.exit(bad ? 1 : 0);
