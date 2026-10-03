// Замер 3D-мира: кадры в секунду на НАСТОЯЩЕМ движке (engine/dist) и, по
// желанию, снимки нескольких видов для сравнения картинки до и после правки.
//
// Долго считалось, что WebGPU в песочнице нет вовсе (см. шапку
// wgsl_check.mjs). Он есть, но только у обычного, не headless, Chromium:
// headless и любые флаги с SwiftShader теряют устройство через пару секунд
// ("A valid external Instance reference no longer exists"), а обычный хром
// на виртуальном дисплее работает часами. Отсюда и запуск через xvfb-run.
//
// Рендер при этом программный (видеокарту эмулирует процессор), поэтому
// абсолютные цифры смысла не имеют — только сравнение двух сборок в одном и
// том же окружении. И одна оговорка: у программного рендера нет кэша текстур
// и узкой шины памяти, поэтому мипмапы тут выглядят чуть дороже, а на
// настоящей видеокарте телефона они, наоборот, экономят.
//
// Запуск (статический сервер — из корня репозитория):
//   (setsid python3 -m http.server 8799 >/dev/null 2>&1 </dev/null &)
//   xvfb-run -a -s '-screen 0 1280x1024x24' node tools/bench_world.mjs [флаги]
// Флаги:
//   --dir engine/dist      какая сборка движка (можно собрать вторую рядом)
//   --gfx '{"res":0.75}'   настройки графики (как window.__gfx у родителя)
//   --pan                  мерить на движущейся камере, а не на неподвижной
//   --shots out/prefix     снять пять видов в out/prefix-<вид>.png; время
//                          заморожено, так что два прогона совпадают до пикселя
// PW_PATH — путь к playwright, если он не стоит рядом; PW_CHROME — к хрому.
import { existsSync, readdirSync } from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = arg('--dir', 'engine/dist'), GFX = arg('--gfx', ''), SHOTS = arg('--shots', '');
const PAN = process.argv.includes('--pan');
const PW = [process.env.PW_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium;
for (const c of PW) { try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) {} }
if (!chromium) { console.error('playwright не найден; укажите PW_PATH'); process.exit(2); }
let exe = process.env.PW_CHROME;
if (!exe && existsSync('/opt/pw-browsers')) {
  const d = readdirSync('/opt/pw-browsers').find((x) => /^chromium-\d+$/.test(x));
  if (d) exe = `/opt/pw-browsers/${d}/chrome-linux/chrome`;
}
const b = await chromium.launch({ executablePath: exe, headless: false, args: ['--enable-unsafe-webgpu', '--no-sandbox', '--ignore-gpu-blocklist'] });
// Окно: 412×780 для замера кадров (на нём сняты цифры в supabase/README.md,
// Фаза 59), 412×600 для снимков.
const ctx = await b.newContext({ viewport: { width: 412, height: SHOTS ? 600 : 780 } });
await ctx.addInitScript(({ g, freeze }) => {
  if (g) window.__gfx = Object.assign({ v: 1 }, JSON.parse(g));
  if (freeze) { const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => cb(1000)); }
}, { g: GFX, freeze: !!SHOTS });
const p = await ctx.newPage();
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await p.route('**/*', (r) => (r.request().url().startsWith('http://localhost') ? r.continue() : r.abort()));
await p.goto(`http://localhost:8799/${DIR}/index.html`);
for (let i = 0; i < 80; i++) { if (await p.evaluate(() => !!window.__engineReady).catch(() => false)) break; await p.waitForTimeout(500); }
if (SHOTS) {
  // Равнина у демо-замка, крупный план, дальний обзор, лесные холмы и самая
  // высокая точка карты (осыпь, камень, снег — все полосы шейдера земли).
  const views = [{ n: 'start' }, { n: 'close', x: 44, z: 16, dist: 22 }, { n: 'far', x: 20, z: 0, dist: 100 },
    { n: 'hills', x: -150, z: 60, dist: 70 }, { n: 'mount', x: -184, z: 464, dist: 85 }];
  for (const v of views) {
    if (v.x !== undefined) await p.evaluate((v) => window.goToWorldPos(v.x, v.z, { dist: v.dist }), v);
    await p.waitForTimeout(v.n === 'start' ? 14000 : 11000);
    await p.locator('canvas').first().screenshot({ path: `${SHOTS}-${v.n}.png` });
  }
} else {
  await p.waitForTimeout(10000);
  const r = await p.evaluate(async (pan) => {
    const ft = []; let last = performance.now(), run = true;
    (function t(x) { ft.push(x - last); last = x; if (run) requestAnimationFrame(t); })(last);
    let x = 0, z = 0; const iv = pan ? setInterval(() => { x += 2; z += 1; window.goToWorldPos(x, z, { dist: 60 }); }, 50) : null;
    await new Promise((res) => setTimeout(res, 10000)); run = false; if (iv) clearInterval(iv);
    const f = ft.slice(3).sort((a, b) => a - b);
    return { fps: +(1000 / (f.reduce((a, b) => a + b, 0) / f.length)).toFixed(1), median_ms: +f[f.length >> 1].toFixed(1), p95_ms: +f[Math.floor(f.length * 0.95)].toFixed(1) };
  }, PAN);
  console.log(JSON.stringify(r));
}
if (errs.length) console.log('ошибки:', errs.slice(0, 5));
await b.close();
