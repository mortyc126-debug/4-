// Жизнь союза на четырёх игроках — всё через кнопки экрана союза: основание
// закрытого союза, заявка (подать/отозвать/отклонить/принять), приглашение
// (отклонить/принять), чат, старшинство и права, мастерская герба, порядок
// приёма, вступление в открытый, казна, исключение, выход, передача
// главенства, роспуск.
import { launch, openPlayer, patchState, openAlliance, sleep, q, checker } from './harness.mjs';
const { check, done } = checker();
const b = await launch();
const A = await openPlayer(b, { nick: 'Глава', race: 0 });
const B = await openPlayer(b, { nick: 'Заявитель', race: 1 });
const C = await openPlayer(b, { nick: 'Гость', race: 2 });
const D = await openPlayer(b, { nick: 'Четвёртый', race: 3 });
for (const P of [A, B, C, D]) P.on('dialog', (d) => d.accept());
await patchState(A.pid, (s) => { s.b.alliance = 3; s.amber = 900; });
const refresh = async (...ps) => { for (const P of ps) { await P.evaluate(() => mpRefreshAll(true)); } await sleep(300); };
const ui = (P) => P.evaluate(() => (document.querySelector('#menu-modal-body')?.textContent || '').replace(/\s+/g, ' '));
const tapMenu = async (P, sel) => { await P.locator('#menu-modal-body ' + sel).first().scrollIntoViewIfNeeded(); await P.locator('#menu-modal-body ' + sel).first().tap(); await P.waitForFunction(() => !mpAllyBusy, null, { timeout: 15000 }); await sleep(300); };
const has = (P, sel) => P.evaluate((s) => !!document.querySelector('#menu-modal-body ' + s), sel);
const err = (P) => P.evaluate(() => mpAllyErr);
const okMsg = (P) => P.evaluate(() => mpAllyOk);

await refresh(A); await openAlliance(A);
await tapMenu(A, "[data-mp='allynonetab'][data-t='create']");
await A.fill('#mp-ally-name', 'Орден Зари'); await A.fill('#mp-ally-tag', 'заря'); await A.fill('#mp-ally-motto', 'Свет из пепла');
await A.locator('#mp-ally-open').uncheck();
await tapMenu(A, "[data-mp='allytint'][data-f='t1'][data-v='2']");
await tapMenu(A, "[data-mp='allycreate']");
const [ally] = await q('select * from alliances');
check('основание: союз создан', !!ally, ally && `${ally.name} [${ally.tag}] open=${ally.open}`);
check('основание: закрытый (галочка снята)', ally && ally.open === false);
check('основание: цвет поля флага записан', ally && ally.emblem && ally.emblem.t1 === 2, JSON.stringify(ally && ally.emblem));
const [amb] = await q("select (state->>'amber')::int a from players where id=$1", [A.pid]);
check('основание: списано 500 янтаря', amb.a === 400, 'осталось ' + amb.a);
const [memA] = await q('select role from alliance_members where player_id=$1', [A.pid]);
check('основание: основатель — глава r5', memA && memA.role === 'r5');
check('основание: экран переключился на «состою»', /Совет союза|Соратники/.test(await ui(A)) && !(await has(A, "[data-mp='allycreate']")));
check('основание: метка сохранена как набрана', ally && ally.tag === 'заря', ally && ally.tag);

// --- Заявка B ---
await refresh(B); await openAlliance(B);
await tapMenu(B, "[data-mp='allynonetab'][data-t='join']");
check('B видит союз в списке', /Орден Зари/.test(await ui(B)));
await tapMenu(B, `[data-mp='allyjoin'][data-id='${ally.id}']`);
let apps = await q('select * from alliance_applications');
check('B: заявка подана (союз закрытый)', apps.length === 1 && Number(apps[0].player_id) === B.pid, 'ответ: ' + (await okMsg(B) || await err(B)));
check('B: кнопка сменилась на «Отозвать»', await has(B, `[data-mp='allycancel'][data-id='${ally.id}']`));
await tapMenu(B, `[data-mp='allycancel'][data-id='${ally.id}']`);
check('B: заявка отозвана', (await q('select * from alliance_applications')).length === 0);
await tapMenu(B, `[data-mp='allyjoin'][data-id='${ally.id}']`);
await refresh(A);
check('A видит заявку B', await has(A, `[data-mp='allyaccept'][data-id='${B.pid}']`));
// Отклонить и снова подать — проверка обеих кнопок.
await tapMenu(A, `[data-mp='allyreject'][data-id='${B.pid}']`);
check('A: заявка отклонена', (await q('select * from alliance_applications')).length === 0);
await refresh(B); await tapMenu(B, "[data-mp='allynonetab'][data-t='join']");
await tapMenu(B, `[data-mp='allyjoin'][data-id='${ally.id}']`);
await refresh(A);
await tapMenu(A, `[data-mp='allyaccept'][data-id='${B.pid}']`);
const memB = await q('select role from alliance_members where player_id=$1', [B.pid]);
check('A: принял B — B в союзе новиком r1', memB.length === 1 && memB[0].role === 'r1', JSON.stringify(memB));
await refresh(B);
check('B: экран сменился на «состою»', /Соратники/.test(await ui(B)));

// --- Приглашение C ---
await A.evaluate((id) => mpDoAlly('invite', { playerId: id }, 'Приглашение отправлено.'), C.pid); await sleep(500);
check('A: приглашение C отправлено', (await q('select * from alliance_invites where player_id=$1', [C.pid])).length === 1, await err(A) || '');
await refresh(C); await openAlliance(C);
check('C видит приглашение', await has(C, `[data-mp='allyinviteok'][data-id='${ally.id}']`));
await tapMenu(C, `[data-mp='allyinviteno'][data-id='${ally.id}']`);
check('C отклонил приглашение', (await q('select * from alliance_invites where player_id=$1', [C.pid])).length === 0);
await A.evaluate((id) => mpDoAlly('invite', { playerId: id }, ''), C.pid); await sleep(500);
await refresh(C);
await tapMenu(C, `[data-mp='allyinviteok'][data-id='${ally.id}']`);
const memC = await q('select role from alliance_members where player_id=$1', [C.pid]);
check('C принял приглашение — в союзе', memC.length === 1, JSON.stringify(memC) + ' ' + (await err(C) || ''));

// --- Чат ---
await A.fill('#menu-modal-body #mp-ally-say', 'Сбор на востоке').catch(() => {});
const sayInput = await A.evaluate(() => !!document.querySelector('#mp-ally-say'));
if (sayInput) await tapMenu(A, "[data-mp='allysay']");
const chat = await q("select body, kind from alliance_chat order by id");
check('чат: реплика главы записана', chat.some((c) => c.body === 'Сбор на востоке'), sayInput ? '' : 'поля #mp-ally-say нет');
await refresh(B);
check('чат: B видит реплику', /Сбор на востоке/.test(await ui(B)) || /Сбор на востоке/.test(await B.evaluate(() => document.body.textContent)));
check('чат: системные строки о событиях есть', chat.filter((c) => c.kind === 'system').length >= 2, chat.filter((c) => c.kind === 'system').map((c) => c.body).join(' | ').slice(0, 200));

// --- Роли ---
await refresh(A);
const upBtn = `[data-mp='allyrole'][data-id='${B.pid}']`;
const roles = await A.evaluate((s) => [...document.querySelectorAll('#menu-modal-body ' + s)].map((n) => n.dataset.role), upBtn);
check('A видит кнопки старшинства B', roles.length > 0, roles.join(','));
// повышаем B до r4 по шагам
for (let i = 0; i < 4; i++) {
  const r = (await q('select role from alliance_members where player_id=$1', [B.pid]))[0].role; if (r === 'r4') break;
  const up = await A.evaluate((id) => { const bs = [...document.querySelectorAll(`#menu-modal-body [data-mp='allyrole'][data-id='${id}']`)]; const cur = { r1: 1, r2: 2, r3: 3, r4: 4 };
    return bs.map((n) => n.dataset.role).find((x) => x && +x.slice(1) > 0) && bs.map((n) => n.dataset.role); }, B.pid);
  const target = up && up.sort().reverse()[0];
  if (!target) break;
  await tapMenu(A, `[data-mp='allyrole'][data-id='${B.pid}'][data-role='${target}']`);
}
const rB = (await q('select role from alliance_members where player_id=$1', [B.pid]))[0].role;
check('B повышен до заместителя r4', rB === 'r4', 'роль ' + rB + ' ' + (await err(A) || ''));
// Заместитель исключает новика C? — сначала права проверим у C (новика)
await refresh(C);
check('C (новик) не видит кнопки исключения', !(await has(C, "[data-mp='allykick']")));
const cKick = await C.evaluate((id) => mpDoAlly('kick', { playerId: id }, ''), B.pid); await sleep(300);
check('C (новик) не может исключить заместителя (сервер отказал)', (await q('select 1 from alliance_members where player_id=$1', [B.pid])).length === 1, await err(C) || '');

// --- Герб внутри союза ---
await refresh(A);
const hasWorkshop = await has(A, "[data-mp='allyemblem']");
check('мастерская герба есть у главы', hasWorkshop);
if (hasWorkshop) {
  await tapMenu(A, "[data-mp='allyemblem'][data-f='c'][data-v='7']");
  await tapMenu(A, "[data-mp='allytint'][data-f='t3'][data-v='5']");
  await A.evaluate(() => mpRefreshAll(true)); await sleep(800);
  const dr = await A.evaluate(() => mpAllyEmblemDraft);
  check('черновик герба переживает опрос (в союзе)', dr && dr.c === 7 && dr.t3 === 5, JSON.stringify(dr));
  await tapMenu(A, "[data-mp='allyemblemsave']");
  const em = (await q('select emblem from alliances'))[0].emblem;
  check('герб записан в базу', em.c === 7 && em.t3 === 5 && em.t1 === 2, JSON.stringify(em));
}
await refresh(C);
check('C (новик) не видит мастерскую герба', !(await has(C, "[data-mp='allyemblemsave']")));

// --- Порядок союза (девиз / открытость) ---
const editIds = await A.evaluate(() => [...document.querySelectorAll('#menu-modal-body input, #menu-modal-body textarea, #menu-modal-body select')].map((n) => n.id).filter(Boolean));
check('поля «Порядок союза»', editIds.length > 0, editIds.join(','));
if (editIds.includes('mp-ally-edit-motto') || editIds.some((x) => /motto/.test(x))) {
  const mid = editIds.find((x) => /motto/.test(x) && !/say/.test(x));
  await A.fill('#' + mid, 'Новый девиз');
  const openId = editIds.find((x) => /open/.test(x)); if (openId) await A.locator('#' + openId).check();
  await tapMenu(A, "[data-mp='allyedit']");
  const a2 = (await q('select motto, open from alliances'))[0];
  check('порядок: девиз и открытость записаны', a2.motto === 'Новый девиз' && (openId ? a2.open === true : true), JSON.stringify(a2) + ' ' + (await err(A) || ''));
}

// --- D вступает в открытый союз сразу ---
await refresh(D); await openAlliance(D);
await tapMenu(D, "[data-mp='allynonetab'][data-t='join']");
await tapMenu(D, `[data-mp='allyjoin'][data-id='${ally.id}']`);
check('D вступил в открытый союз без заявки', (await q('select 1 from alliance_members where player_id=$1', [D.pid])).length === 1, await okMsg(D) || await err(D) || '');

// --- Казна ---
await refresh(B);
const donIds = await B.evaluate(() => [...document.querySelectorAll('#menu-modal-body input')].map((n) => n.id).filter((x) => /give/.test(x)));
check('поля пожертвования видны соратнику', donIds.length > 0, donIds.join(','));
if (donIds.length) {
  const [before] = await q("select (state->'res'->>'food')::float f from players where id=$1", [B.pid]);
  for (const id of donIds) await B.fill('#' + id, /food/.test(id) ? '1000' : '0');
  await tapMenu(B, "[data-mp='allydonate']");
  const bank = (await q('select res from alliances'))[0].res;
  const [after] = await q("select (state->'res'->>'food')::float f from players where id=$1", [B.pid]);
  check('казна: пожертвование дошло', bank && bank.food >= 1000, JSON.stringify(bank) + ' ' + (await err(B) || await okMsg(B) || ''));
  check('казна: у B списано', after.f <= before.f - 1000 + 1e-6 || after.f < before.f, `было ${Math.round(before.f)} стало ${Math.round(after.f)}`);
}

// --- Исключение / выход / передача / роспуск ---
await refresh(B);
const bCanKickC = await has(B, `[data-mp='allykick'][data-id='${C.pid}']`);
check('заместитель B видит «исключить» у новика C', bCanKickC);
if (bCanKickC) await tapMenu(B, `[data-mp='allykick'][data-id='${C.pid}']`);
check('C исключён', (await q('select 1 from alliance_members where player_id=$1', [C.pid])).length === 0, await err(B) || '');
await refresh(C);
check('C: экран снова «вы сами по себе»', /сами по себе|Основать союз/.test(await ui(C)));
await refresh(D); await openAlliance(D);
await tapMenu(D, "[data-mp='allyleave']");
check('D вышел сам', (await q('select 1 from alliance_members where player_id=$1', [D.pid])).length === 0, await err(D) || '');
// Передача главенства B
await refresh(A);
const heirOk = await A.evaluate((id) => { const s = document.querySelector('#mp-ally-heir'); if (!s) return 'нет списка'; s.value = String(id); return [...s.options].map((o) => o.value).includes(String(id)) ? 'ok' : 'нет в списке'; }, B.pid);
check('список наследников есть и содержит B', heirOk === 'ok', heirOk);
if (heirOk === 'ok') await tapMenu(A, "[data-mp='allyhand']");
const rr = await q('select player_id, role from alliance_members order by role desc');
const lead = (await q('select leader_id from alliances'))[0].leader_id;
check('главенство передано B', Number(lead) === B.pid && rr.find((r) => Number(r.player_id) === B.pid)?.role === 'r5', JSON.stringify(rr) + ' leader=' + lead + ' ' + (await err(A) || ''));
// Роспуск новым главой
await refresh(B); await openAlliance(B);
const canDisband = await has(B, "[data-mp='allydisband']");
check('новый глава видит «распустить»', canDisband);
if (canDisband) await tapMenu(B, "[data-mp='allydisband']");
const disb = (await q('select disbanded_at from alliances'))[0];
check('союз распущен', !!disb.disbanded_at, await err(B) || '');
check('состав очищен', (await q('select count(*)::int n from alliance_members'))[0].n === 0);
await refresh(A);
check('A после роспуска — снова сам по себе', /сами по себе|Основать союз/.test(await ui(A)));
const mails = await q("select player_id, kind from mail where kind like 'ally%' or kind='alliance' or kind='note'");
check('письма о событиях союза разосланы', mails.length > 0, mails.map((m) => m.kind).join(',').slice(0, 120));

for (const [n, P] of [['A', A], ['B', B], ['C', C], ['D', D]]) if (P.errors.length) console.log('ошибки страницы', n, P.errors.slice(0, 3));
await b.close(); process.exit(done());
