// Общие помощники сквозного стенда (см. шапку up.sh): игрок в браузере со
// своей анонимной сессией, SQL к базе стенда, промотка событий тикера.
import pg from 'pg';
import { existsSync, readdirSync } from 'node:fs';
// Playwright и Chromium — тем же поиском, что и в tools/check_*.mjs.
const PW = [process.env.PW_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs',
  '/opt/node22/lib/node_modules/playwright/index.mjs', '/usr/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const c of PW) { try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) { /* дальше */ } }
if (!chromium) { console.error('playwright не найден; укажите PW_PATH'); process.exit(2); }
let CHROME = process.env.PW_CHROME;
if (!CHROME && existsSync('/opt/pw-browsers')) {
  const d = readdirSync('/opt/pw-browsers').find((x) => /^chromium-\d+$/.test(x));
  if (d) CHROME = `/opt/pw-browsers/${d}/chrome-linux/chrome`;
}
export const db = new pg.Pool({ host: 'localhost', port: 5499, user: 'postgres', database: 'game' });
export const q = async (sql, args) => (await db.query(sql, args)).rows;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REMOTE = 'https://xzuwqgpwzlmpglnuijio.supabase.co';
export async function launch() {
  return chromium.launch(CHROME ? { executablePath: CHROME } : {});
}
export async function openPlayer(browser, { nick, race = 0, w = 412, h = 880 }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|engine/.test(m.text())) page.errors.push('CONSOLE ' + m.text().slice(0, 300)); });
  await page.route('**/*', async (r) => {
    const u = r.request().url();
    if (u.startsWith(REMOTE)) { const resp = await r.fetch({ url: u.replace(REMOTE, 'http://localhost:54321') }); return r.fulfill({ response: resp }); }
    if (!u.startsWith('http://localhost:8799')) return r.abort();
    if (u.includes('/engine/dist/')) return r.abort();   // 3D здесь не нужен
    return r.continue();
  });
  await page.goto('http://localhost:8799/index.html');
  // Летопись: народ → полководец → имя.
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => ({
      joined: !!(window.mpState && mpState.joined && mpState.player),
      ob: !!document.querySelector('#onboard.open'),
      name: !!document.querySelector('#ob-name'),
      race: document.querySelectorAll("[data-ob='race']").length,
      gen: document.querySelectorAll("[data-ob='gen']").length,
    }));
    if (st.joined) break;
    if (st.ob) {
      if (st.name) { await page.fill('#ob-name', nick); await page.click("[data-ob='done'],[data-ob='next']"); }
      else if (st.race) { await page.locator("[data-ob='race']").nth(race).click(); await page.click("[data-ob='next']").catch(() => {}); }
      else if (st.gen) { await page.locator("[data-ob='gen']").first().click(); await page.click("[data-ob='next']").catch(() => {}); }
    }
    await sleep(500);
  }
  page.pid = await page.evaluate(() => mpState.player && mpState.player.id);
  if (!page.pid) throw new Error('игрок ' + nick + ' не вошёл: ' + JSON.stringify(page.errors));
  return page;
}
// Правка состояния игрока «руками сервера» (как будто он отстроился/накопил).
export async function patchState(pid, fn) {
  const [row] = await q('select state from players where id=$1', [pid]);
  const st = row.state; fn(st);
  await q('update players set state=$2, updated_at=now() where id=$1', [pid, st]);
}
export async function openAlliance(page) {
  await page.evaluate(() => openMenuModal('alliance'));
  await sleep(400);
}
export const txt = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((n) => n.textContent.replace(/\s+/g, ' ').trim()), sel);

// Промотать события тикера: срок — «сейчас», затем mp-tick, пока не обработаются.
export const tick = async () => { await fetch('http://localhost:54321/functions/v1/mp-tick', { method: 'POST', body: '{}' }).then((r) => r.json()).catch(() => null); };
export async function ff(types, rounds = 30) {
  for (let i = 0; i < rounds; i++) {
    await q("update events set fire_at=now()-interval '1 second', claimed_at=null where not processed and type = any($1)", [types]);
    await tick();
    if (!(await q('select count(*)::int n from events where not processed and type = any($1)', [types]))[0].n) return true;
    await sleep(150);
  }
  return false;
}
// Сводка проверок сценария: печатает строку на каждую и итог в конце.
export function checker() {
  const res = [];
  const check = (name, ok, extra = '') => { res.push(!!ok); console.log((ok ? 'OK   ' : 'FAIL ') + name + (extra ? '  — ' + extra : '')); };
  const done = () => { const n = res.filter(Boolean).length; console.log(`\nИТОГО: ${n}/${res.length} OK`); return n === res.length ? 0 : 1; };
  return { check, done };
}
