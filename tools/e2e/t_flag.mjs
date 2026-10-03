// Основание союза и выбор флага — то, на что автор жаловался: «флаг спадает
// постоянно». Касаниями, как с телефона, и с ожиданием нескольких тактов
// опроса (быстрый — 5 с, медленный — 10 с; до Фазы 57 медленный стирал
// выбранный флаг). Следит, чтобы не слетали ни флаг, ни набранное имя, чтобы
// окно не прыгало и узлы формы не пересоздавались, и чтобы союз записался
// ровно с тем гербом, который выбран.
import { launch, openPlayer, patchState, openAlliance, sleep, q, checker } from './harness.mjs';
const { check, done } = checker();
const b = await launch();
const A = await openPlayer(b, { nick: 'Витольд', w: 390, h: 844 });
await patchState(A.pid, (s) => { s.b.alliance = 3; s.amber = 900; });
await A.evaluate(() => mpRefreshAll(true));
await openAlliance(A);
await A.tap("[data-mp='allynonetab'][data-t='create']"); await sleep(300);
check('форма основания с флагом на месте', await A.evaluate(() => !!document.querySelector('#mp-ally-name') &&
  document.querySelectorAll("[data-mp='allyemblem']").length > 0 && document.querySelectorAll("[data-mp='allytint']").length === 27));
await A.fill('#mp-ally-name', 'Орден Зари'); await A.fill('#mp-ally-tag', 'ЗАРЯ'); await A.fill('#mp-ally-motto', 'Свет из пепла');
const want = { s: 3, d: 2, c: 5, t1: 4, t2: 1, t3: 6 };
for (const [f, v] of Object.entries(want)) {
  const sel = `[data-mp='${f[0] === 't' ? 'allytint' : 'allyemblem'}'][data-f='${f}'][data-v='${v}']`;
  await A.locator(sel).scrollIntoViewIfNeeded(); await A.tap(sel); await sleep(250);
}
// Метки на узлах: если перерисовка пересоздаст элемент целиком, метка пропадёт.
await A.evaluate(() => { document.querySelector('#mp-ally-name').__mark = 1; document.querySelector('.herald-shop').__mark = 1; });
const scrollTop = () => A.evaluate(() => Math.round(document.querySelector('#menu-modal').scrollTop));
const state = () => A.evaluate(() => ({
  name: document.querySelector('#mp-ally-name')?.value, tag: document.querySelector('#mp-ally-tag')?.value,
  on: Object.fromEntries([...document.querySelectorAll('.herald-cell.on,.herald-tint.on')].map((n) => [n.dataset.f, +n.dataset.v])),
  kept: document.querySelector('#mp-ally-name')?.__mark === 1 && document.querySelector('.herald-shop')?.__mark === 1,
  preview: !!document.querySelector('.herald-shop .preview img'),
}));
const top0 = await scrollTop();
await sleep(25000);   // пять быстрых и два медленных такта опроса
const s = await state();
check('выбранный флаг держится после тактов опроса', JSON.stringify(s.on) === JSON.stringify(want), JSON.stringify(s.on));
check('набранные имя и метка держатся', s.name === 'Орден Зари' && s.tag === 'ЗАРЯ', s.name + ' / ' + s.tag);
check('узлы формы не пересоздаются', s.kept);
check('окно не прыгает', Math.abs((await scrollTop()) - top0) < 2);
check('превью герба нарисовано', s.preview);
// Серия быстрых касаний — в том числе попадающих на такт опроса.
for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 0, 3]) { await A.tap(`[data-mp='allytint'][data-f='t1'][data-v='${v}']`); await sleep(700); }
want.t1 = 3;
check('серия касаний: остаётся последний выбор', await A.evaluate(() => +document.querySelector('.herald-tint.on[data-f=t1]')?.dataset.v) === 3);
await A.tap("[data-mp='allycreate']"); await sleep(2500);
const [ally] = await q('select name, tag, motto, emblem from alliances');
check('союз основан', !!ally, ally && ally.name);
check('герб записан ровно таким, как выбран', ally && JSON.stringify(Object.fromEntries(Object.keys(want).map((k) => [k, ally.emblem[k]]))) === JSON.stringify(want), JSON.stringify(ally && ally.emblem));
check('без ошибок на странице', !A.errors.length, A.errors.slice(0, 3).join(' | '));
await b.close(); process.exit(done());
