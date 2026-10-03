// Пограничные случаи союза: отказы сервера и что видит игрок, разметка в
// девизе и чате, пределы (заместители, места, порог мощи, казна).
import { launch, openPlayer, patchState, openAlliance, sleep, q, checker } from './harness.mjs';
const { check, done } = checker();
const call = (P, body) => P.evaluate((b) => mpCall('mp-alliance', b).then((j) => ({ ok: true, j })).catch((e) => ({ ok: false, err: e.message })), body);
const b = await launch();
const P = [];
for (let i = 0; i < 7; i++) P.push(await openPlayer(b, { nick: 'Игрок' + (i + 1), race: i % 4 }));
const [A, B, C, D, E, F, G] = P;
const em = { s: 1, d: 0, c: 0, t1: 3, t2: 0, t3: 0 };
let r = await call(A, { op: 'create', name: 'Орден Зари', tag: 'ЗАРЯ', motto: '', open: true, emblem: em });
check('без Центра Альянса — отказ', !r.ok, r.err);
await patchState(A.pid, (s) => { s.b.alliance = 1; s.amber = 100; });
r = await call(A, { op: 'create', name: 'Орден Зари', tag: 'ЗАРЯ', motto: '', open: true, emblem: em });
check('без янтаря — отказ', !r.ok, r.err);
await patchState(A.pid, (s) => { s.amber = 2000; });
r = await call(A, { op: 'create', name: '<b>Орден</b>', tag: 'ЗАРЯ', motto: '', open: true, emblem: em });
check('разметка в имени — отказ', !r.ok, r.err);
r = await call(A, { op: 'create', name: 'Ор', tag: 'ЗАРЯ', motto: '', open: true, emblem: em });
check('слишком короткое имя — отказ', !r.ok, r.err);
r = await call(A, { op: 'create', name: 'Орден Зари', tag: 'ЗАРЯ', motto: '', open: true, emblem: { s: 99, d: 0, c: 0, t1: 0, t2: 0, t3: 0 } });
const [bad] = await q('select id, emblem from alliances order by id desc limit 1');
check('герб вне диапазона — союз основан с гербом по умолчанию (так задумано)', r.ok && bad && bad.emblem === null, JSON.stringify(bad));
await call(A, { op: 'disband' });
await patchState(A.pid, (s) => { s.amber = 2000; });
r = await call(A, { op: 'create', name: 'Орден Зари', tag: 'ЗАРЯ', motto: '<img src=x onerror=window.__x=1>', open: true, emblem: em });
check('основание с нормальными данными', r.ok, r.err || '');
const [ally] = await q('select id from alliances where disbanded_at is null');
await patchState(B.pid, (s) => { s.b.alliance = 1; s.amber = 2000; });
r = await call(B, { op: 'create', name: 'орден зари', tag: 'ДРУГ', motto: '', open: true, emblem: em });
check('то же имя в другом регистре — отказ', !r.ok, r.err);
r = await call(B, { op: 'create', name: 'Другой Орден', tag: 'заря', motto: '', open: true, emblem: em });
check('та же метка в другом регистре — отказ', !r.ok, r.err);
const [ambB] = await q("select (state->>'amber')::int a from players where id=$1", [B.pid]);
check('неудачное основание янтарь не списало', ambB.a === 2000, 'янтарь ' + ambB.a);
r = await call(A, { op: 'join', allianceId: ally.id });
check('вступить, уже состоя в союзе — отказ', !r.ok, r.err);
// Порог мощи
await call(A, { op: 'edit', minPower: 999999999 });
r = await call(B, { op: 'join', allianceId: ally.id });
check('мощи меньше порога — отказ', !r.ok, r.err);
await call(A, { op: 'edit', minPower: 0 });
for (const X of [B, C, D, E, F]) { const rr = await call(X, { op: 'join', allianceId: ally.id }); if (!rr.ok) console.log('   вступление не прошло:', rr.err); }
check('пятеро вступили', (await q('select count(*)::int n from alliance_members'))[0].n === 6);
// Лимит заместителей
const okR4 = [];
for (const X of [B, C, D, E, F]) okR4.push(await call(A, { op: 'role', playerId: X.pid, role: 'r4' }));
check('четыре заместителя назначены', okR4.slice(0, 4).every((x) => x.ok), okR4.slice(0, 4).map((x) => x.err || 'ok').join(','));
check('пятый заместитель — отказ', !okR4[4].ok, okR4[4].err);
// Полный союз
await q('update alliances set members_max = 6');
r = await call(G, { op: 'join', allianceId: ally.id });
check('союз полон — вступить нельзя', !r.ok, r.err);
await q('update alliances set members_max = 30');
// Глава не уходит просто так; заместитель не исключает главу
r = await call(A, { op: 'leave' });
check('глава при соратниках не уходит', !r.ok, r.err);
r = await call(B, { op: 'kick', playerId: A.pid });
check('заместитель не исключает главу', !r.ok, r.err);
r = await call(B, { op: 'kick', playerId: C.pid });
check('заместитель не исключает равного', !r.ok, r.err);
// Чат и казна
r = await call(B, { op: 'say', body: '   ' });
check('пустая реплика — отказ', !r.ok, r.err);
r = await call(B, { op: 'say', body: '<img src=x onerror=window.__x=1>' });
check('реплика с разметкой принята как текст', r.ok, r.err || '');
r = await call(B, { op: 'donate', res: { food: 1 } });
check('пожертвование меньше минимума — отказ', !r.ok, r.err);
const [fb] = await q("select (state->'res'->>'food')::float f from players where id=$1", [C.pid]);
r = await call(C, { op: 'donate', res: { food: 1e12 } });
const [fa] = await q("select (state->'res'->>'food')::float f from players where id=$1", [C.pid]);
const bank = (await q('select res from alliances'))[0].res;
check('пожертвование больше, чем есть, — берётся остаток', r.ok && fa.f >= 0 && fa.f < fb.f, `было ${Math.round(fb.f)} стало ${Math.round(fa.f)}; казна ${JSON.stringify(bank)} ${r.err || ''}`);
// Разметка в девизе и чате — экран союза и список
for (const X of [A, G]) { await X.evaluate(() => mpRefreshAll(true)); await openAlliance(X); await sleep(400); }
await G.evaluate(() => { mpAllyNoneTab = 'join'; mpRerender(); }); await sleep(400);
await sleep(800);
const xss = await Promise.all([A, G].map((X) => X.evaluate(() => !!window.__x)));
check('разметка из девиза и чата не исполнилась', !xss[0] && !xss[1], 'A=' + xss[0] + ' G=' + xss[1]);
check('девиз показан как текст', /onerror/.test(await G.evaluate(() => document.querySelector('#menu-modal-body')?.textContent || '')));
// Глава уходит последним — союз сам распускается
for (const X of [B, C, D, E, F]) await call(X, { op: 'leave' });
r = await call(A, { op: 'leave' });
const [st] = await q('select disbanded_at, members from alliances');
check('последний ушёл — союз распущен', r.ok && !!st.disbanded_at, (r.err || '') + ' ' + JSON.stringify(st));
r = await call(B, { op: 'create', name: 'Орден Зари', tag: 'ЗАРЯ', motto: '', open: true, emblem: em });
check('имя и метка распущенного союза свободны', r.ok, r.err || '');
for (const [i, X] of P.entries()) if (X.errors.length) console.log('ошибки страницы', i, X.errors.slice(0, 3));
await b.close(); process.exit(done());
