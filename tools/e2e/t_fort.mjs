// Крепость союза (закладка, помощь стройке, достройка, цвет области),
// гарнизон (отправка, прибытие, возврат) и общий сбор (созыв,
// присоединение, выход, выступление, бой). Всё — через панель клетки и окно
// похода; ожидания по времени проматываются (ff), события разбирает
// настоящий mp-tick.
// гарнизон (отправка, прибытие, возврат) и общий сбор (созыв, присоединение, выход, выступление, бой).
import { launch, openPlayer, patchState, openAlliance, sleep, q, ff, checker } from './harness.mjs';
const { check, done } = checker();
const b = await launch();
const A = await openPlayer(b, { nick: 'Глава', race: 0 });
const B = await openPlayer(b, { nick: 'Соратник', race: 1 });
for (const P of [A, B]) P.on('dialog', (d) => d.accept());
const big = (n) => { const u = {}; for (const t of ['inf', 'arc', 'cav', 'sie']) { u[t] = {}; for (let i = 1; i <= 5; i++) u[t][i] = 0; } u.inf[5] = n; u.cav[5] = n; u.arc[5] = n; return u; };
await patchState(A.pid, (s) => { s.b.alliance = 5; s.amber = 900; s.troops = big(20000); s.b.hall = 20; });
await patchState(B.pid, (s) => { s.troops = big(20000); s.b.hall = 20; });
const refresh = async (...ps) => { for (const P of ps) await P.evaluate(() => mpRefreshAll(true)); await sleep(300); };
await refresh(A, B);
for (const P of [A, B]) await P.evaluate(() => { if (!document.querySelector('#app').classList.contains('view-world')) toggleView(); try { mpHideLoading(); } catch (_) {} });
await A.evaluate(() => mpDoAlly('create', { name: 'Орден Зари', tag: 'ЗАРЯ', motto: '', open: true, emblem: { s: 1, d: 0, c: 0, t1: 4, t2: 0, t3: 0 } }, ''));
const [ally] = await q('select id from alliances');
await B.evaluate((id) => mpDoAlly('join', { allianceId: id }, ''), ally.id);
await A.evaluate((id) => mpDoAlly('role', { playerId: id, role: 'r3' }, ''), B.pid);
check('союз из двух, B старейшина', (await q("select role from alliance_members where player_id=$1", [B.pid]))[0]?.role === 'r3');

// --- Крепость ---
const forts = await q("select x,y,data from map_cells where t='regfort' order by x,y");
check('крепости областей посеяны в мир', forts.length === 16, 'штук ' + forts.length);
const F = forts[0], T = forts[1];
await q("update map_cells set data = jsonb_set(data,'{state}','\"razed\"') where t='regfort' and x=$1 and y=$2", [F.x, F.y]);
await q("update alliances set res='{\"food\":9000000,\"wood\":9000000,\"stone\":9000000,\"gold\":9000000}'");
await refresh(A, B);
await A.evaluate(({ x, y }) => renderCartoucheFor(x, y), F); await sleep(300);
const hasStart = await A.evaluate(() => !!document.querySelector("#cartouche [data-mp='fortstart']"));
check('панель разорённой крепости: у главы есть «Заложить»', hasStart, await A.evaluate(() => (document.querySelector('#cartouche')?.textContent || '').replace(/\s+/g, ' ').slice(0, 160)));
if (hasStart) { await A.locator("#cartouche [data-mp='fortstart']").tap(); await A.waitForFunction(() => !mpAllyBusy); await sleep(500); }
let cell = (await q('select data from map_cells where x=$1 and y=$2', [F.x, F.y]))[0].data;
check('крепость заложена: стройка идёт', cell.state === 'building' && Number(cell.alliance_id) === Number(ally.id), JSON.stringify({ state: cell.state, a: cell.alliance_id }) + ' ' + (await A.evaluate(() => mpAllyErr) || ''));
const bank1 = (await q('select res from alliances'))[0].res;
check('стоимость списана с казны', bank1.food < 9000000, JSON.stringify(bank1));
// Помощь стройке — старейшина B
await refresh(B);
await B.evaluate(({ x, y }) => renderCartoucheFor(x, y), F); await sleep(300);
const hasHelp = await B.evaluate(() => !!document.querySelector("#cartouche [data-mp='forthelp']"));
check('у старейшины есть «Доложить в стройку»', hasHelp, await B.evaluate(() => (document.querySelector('#cartouche')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200)));
if (hasHelp) {
  const inp = await B.evaluate(() => [...document.querySelectorAll('#cartouche input')].map((i) => i.id));
  if (inp.length) await B.fill('#' + inp[0], '100000');
  const t1before = cell.build_t1;
  await B.locator("#cartouche [data-mp='forthelp']").tap(); await sleep(1200);
  cell = (await q('select data from map_cells where x=$1 and y=$2', [F.x, F.y]))[0].data;
  check('помощь стройке ускорила её', cell.build_t1 < t1before, `было ${Math.round(t1before)} стало ${Math.round(cell.build_t1)} ` + (await B.evaluate(() => mpAllyErr || mpState.err) || ''));
}
check('событие достройки — в очереди', (await q("select count(*)::int n from events where type='regfort_built' and not processed"))[0].n >= 1);
await ff(['regfort_built']);
cell = (await q('select data from map_cells where x=$1 and y=$2', [F.x, F.y]))[0].data;
check('крепость достроена', cell.state && cell.state !== 'building' && cell.state !== 'razed', 'state=' + cell.state);
await refresh(A);
const owners = await A.evaluate(() => mpBuildWorldSnapshot ? (mpBuildWorldSnapshot().regionOwners || []).filter(Boolean).length : -1);
check('область окрасилась в цвет союза (для 3D)', owners >= 1, 'окрашено областей: ' + owners);

// --- Гарнизон ---
await A.evaluate(({ x, y }) => renderCartoucheFor(x, y), F); await sleep(300);
const hasReinf = await A.evaluate(() => !!document.querySelector("#cartouche [data-mp='cartreinfpick']"));
check('в панели своей крепости есть «Подкрепление»', hasReinf);
if (hasReinf) {
  await A.locator("#cartouche [data-mp='cartreinfpick']").tap(); await sleep(400);
  await A.locator("#building-modal [data-mp='marchall']").first().tap().catch(() => {}); await sleep(300);
  await A.evaluate(() => { const u = mpMarchCtx.units; for (const t in u) for (const i in u[t]) u[t][i] = 0; u.inf[5] = 5000; mpRerender(); }); await sleep(200);
  await A.locator("#building-modal [data-mp='fortsend']").tap(); await sleep(1200);
  const m = await q("select id, mode, state from marches where player_id=$1", [A.pid]);
  check('подкрепление вышло маршем', m.some((x) => x.mode === 'reinf'), JSON.stringify(m) + ' ' + (await A.evaluate(() => mpState.err) || ''));
  await ff(['march_arrive']);
  const g = await q('select units from alliance_fort_garrison where player_id=$1', [A.pid]);
  check('отряд встал в гарнизон', g.length === 1 && g[0].units.inf[5] === 5000, JSON.stringify(g.map((r) => r.units.inf)));
  await refresh(A);
  await A.evaluate(({ x, y }) => renderCartoucheFor(x, y), F); await sleep(300);
  const hasRecall = await A.evaluate(() => !!document.querySelector("#cartouche [data-mp='fortrecall']"));
  check('в панели есть «Забрать свой отряд»', hasRecall, await A.evaluate(() => (document.querySelector('#cartouche')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200)));
  if (hasRecall) {
    await A.locator("#cartouche [data-mp='fortrecall']").tap(); await sleep(1200);
    check('гарнизон снят', (await q('select 1 from alliance_fort_garrison where player_id=$1', [A.pid])).length === 0, await A.evaluate(() => mpState.err) || '');
    await ff(['march_home']);
    const [tr] = await q("select (state->'troops'->'inf'->>'5')::int n from players where id=$1", [A.pid]);
    check('отряд вернулся домой целиком', tr.n === 20000, 'inf T5 = ' + tr.n);
  }
}

// --- Общий сбор на варварскую крепость T ---
await A.evaluate(({ x, y }) => renderCartoucheFor(x, y), T); await sleep(300);
const hasRally = await A.evaluate(() => !!document.querySelector("#cartouche [data-mp='cartrallypick']"));
check('у варварской крепости есть «Сбор»', hasRally, await A.evaluate(() => (document.querySelector('#cartouche')?.textContent || '').replace(/\s+/g, ' ').slice(0, 200)));
if (hasRally) {
  await A.locator("#cartouche [data-mp='cartrallypick']").tap(); await sleep(400);
  await A.locator("#building-modal [data-mp='rallymin'][data-mn='5']").tap().catch(() => {}); await sleep(200);
  await A.locator("#building-modal [data-mp='marchall']").first().tap().catch(() => {}); await sleep(300);
  await A.evaluate(() => { const u = mpMarchCtx.units; for (const t in u) for (const i in u[t]) u[t][i] = 0; u.inf[5] = 20000; u.cav[5] = 10000; mpRerender(); }); await sleep(200);
  await A.locator("#building-modal [data-mp='rallystart']").tap(); await sleep(1500);
  const r = await q('select * from alliance_rallies');
  check('сбор созван', r.length === 1, (await A.evaluate(() => mpState.err)) || JSON.stringify(r.map((x) => x.state)));
  if (r.length) {
    await refresh(B); await openAlliance(B);
    const hasJoin = await B.evaluate(() => !!document.querySelector("#menu-modal-body [data-mp='rallyopen']"));
    check('B видит сбор и кнопку «Присоединиться»', hasJoin);
    if (hasJoin) {
      await B.locator("#menu-modal-body [data-mp='rallyopen']").first().tap(); await sleep(400);
      await B.evaluate(() => { const u = mpMarchCtx.units; for (const t in u) for (const i in u[t]) u[t][i] = 0; u.inf[5] = 15000; mpRerender(); }); await sleep(200);
      await B.locator("#building-modal [data-mp='rallyjoin']").tap(); await sleep(1500);
      check('B отправил войска в сбор', (await q('select count(*)::int n from alliance_rally_parts'))[0].n === 2, (await B.evaluate(() => mpState.err)) || '');
      await ff(['march_arrive']);   // войска B дошли до точки сбора (если сбор ждёт у главы)
      await refresh(B); await openAlliance(B);
      const hasOut = await B.evaluate(() => !!document.querySelector("#menu-modal-body [data-mp='rallywithdraw']"));
      check('B может выйти из сбора', hasOut);
      if (hasOut) {
        await B.locator("#menu-modal-body [data-mp='rallywithdraw']").first().tap(); await sleep(1200);
        check('B вышел из сбора', (await q('select count(*)::int n from alliance_rally_parts'))[0].n === 1, (await B.evaluate(() => mpState.err)) || '');
        await ff(['march_home']);
      }
    }
    await ff(['rally_launch']);
    const r2 = (await q('select state, march_id from alliance_rallies'))[0];
    check('сбор выступил', r2 && (r2.state === 'march' || r2.march_id), JSON.stringify(r2));
    await ff(['march_arrive', 'battle_round', 'march_home'], 80);
    const fortT = (await q('select data from map_cells where x=$1 and y=$2', [T.x, T.y]))[0].data;
    const r3 = await q('select state from alliance_rallies');
    const mailA = await q("select kind, data->>'mode' mode from mail where player_id=$1 order by id desc limit 5", [A.pid]);
    check('бой сбора с варварами прошёл', mailA.length > 0, 'крепость: ' + fortT.state + '; сбор: ' + JSON.stringify(r3) + '; письма A: ' + mailA.map((m) => m.kind + (m.mode ? ':' + m.mode : '')).join(','));
    const leftEv = (await q("select type, count(*)::int n from events where not processed group by type")).map((e) => e.type + ':' + e.n).join(', ');
    console.log('     необработанные события после боя:', leftEv || 'нет');
  }
}
for (const [n, P] of [['A', A], ['B', B]]) if (P.errors.length) console.log('ошибки страницы', n, P.errors.slice(0, 4));
const gl = await (await fetch('http://localhost:54321/__log')).json();
const bad = gl.filter((x) => x.status >= 500);
if (bad.length) console.log('ответы 5xx от функций:', bad.slice(0, 5));
await b.close(); process.exit(done());
