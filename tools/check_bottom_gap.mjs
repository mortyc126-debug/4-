// Проверяем две вещи: (1) правило dvh реально применилось, (2) на экране без
// системной полосы (env=0) ничего не сдвинулось ни на пиксель.
const PW_CANDIDATES = [process.env.PW_PATH, 'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) {}
}
if (!chromium) { console.error('playwright не найден; укажите PW_PATH'); process.exit(2); }
const now=Date.now()/1000;
const TK=['inf','arc','cav','sie'];
const units=(n=0)=>{const u={};TK.forEach(t=>{u[t]={};for(let i=1;i<=5;i++)u[t][i]=n;});return u;};
const state={ race:'human',
  b:{ hall:8, wall:5, farm:[6,0,0,0], lumber:[5,0,0,0], quarry:[4,0,0,0], mine:[3,0,0,0],
      store:6, barracks:5, range:0, stable:0, siege:3, hospital:[4,0,0,0], academy:6,
      garrison:3, scout:2, forge:0, portal:0, market:5, alliance:0 },
  layout:[{b:'academy',plot:null,gx:1,gy:12},{b:'market',plot:null,gx:13,gy:12}],
  queues:[null,null], train:{inf:null,arc:null,cav:null,sie:null},
  troops:units(100), wounded:units(), heal:null,
  rsch:{id:'eco_food1',lv:2,t0:now-100,t1:now+300}, craft:null,
  res:{food:80000,wood:40000,stone:12000,gold:5000}, resAt:now,
  gen:{lv:5,xp:0,pts:5,tal:{},id:0,away:null}, gear:{}, tech:{}, inventory:{},
  materials:{ore:[0,0,0,0,0],leather:[0,0,0,0,0],bone:[0,0,0,0,0],ebony:[0,0,0,0,0]},
  tomes:{}, amber:0 };
const player={ id:7, world_id:'w1', auth_uid:'u1', is_bot:false, race:'human', nick:'Тестовый', name:'',
  x:120, y:-40, shield_until:0, power:0, state,
  created_at:new Date(Date.now()-864e5).toISOString(), updated_at:new Date().toISOString(), dead_at:null };
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
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage({ viewport:{width:430,height:932} });
const errors=[];
page.on('pageerror', e=>errors.push('PAGEERROR: '+e.message));
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', r => r.fulfill({status:200,contentType:'application/javascript',body:'/* stub */'}));
await page.route('**/functions/v1/**', r => r.request().url().includes('mp-join')
  ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,world_id:'w1',player})})
  : r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})}));
await page.route('**/engine/dist/**', r => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3500);

const r = await page.evaluate(()=>{
  const out={ окно:innerHeight, документ:document.documentElement.clientHeight };
  out.правилоDvhПоддержано = CSS.supports('height','100dvh');
  const h=el=>el?Math.round(el.getBoundingClientRect().height):null;
  out.высоты={ html:h(document.documentElement), body:h(document.body), app:h(document.getElementById('app')) };
  const bot=id=>{ const el=document.getElementById(id); if(!el) return null;
    const cs=getComputedStyle(el);
    return { bottom:cs.bottom, доНиза:Math.round(innerHeight-el.getBoundingClientRect().bottom) }; };
  out.кнопки={ 'menu-btn':bot('menu-btn'), 'view-toggle':bot('view-toggle'),
               'mp-build-fab':bot('mp-build-fab'), 'mp-rsch-fab':bot('mp-rsch-fab'),
               'side-menu':bot('side-menu') };
  // Карта должна доходить ровно до низа окна.
  const wrap=document.querySelector('#folio #citymap-wrap');
  out.низКарты = wrap ? Math.round(wrap.getBoundingClientRect().bottom) : null;
  out.зазорПодКартой = wrap ? Math.round(innerHeight - wrap.getBoundingClientRect().bottom) : null;

  // Доказательство, что правило работает: на телефоне <html> берёт МЕНЬШУЮ
  // высоту, чем видимая область, — здесь такого браузера нет, поэтому
  // подменяем высоту <html> вручную. Раньше #app послушно съёжился бы за
  // ней (height:100% меряется от предка) и открыл бы ту самую полосу; с
  // height:100dvh он обязан остаться во всё окно.
  const wrapBefore = wrap ? Math.round(wrap.getBoundingClientRect().height) : null;
  const appBefore = Math.round(document.getElementById('app').getBoundingClientRect().height);
  document.documentElement.style.height='400px';
  const appH = Math.round(document.getElementById('app').getBoundingClientRect().height);
  const wrapH = wrap ? Math.round(wrap.getBoundingClientRect().height) : null;
  document.documentElement.style.height='';
  out.приУкороченномHtml={ app:appH, карта:wrapH, окно:innerHeight,
                           былоApp:appBefore, былоКарта:wrapBefore };
  return out;
});
console.log('ошибок страницы:', errors.length, errors.slice(0,2));
console.log('окно', r.окно, ', clientHeight', r.документ, ', dvh поддержан:', r.правилоDvhПоддержано);
console.log('высоты html/body/#app:', JSON.stringify(r.высоты));
console.log('низ карты', r.низКарты, ', зазор под ней', r.зазорПодКартой, r.зазорПодКартой===0?'✓':'✗');
for(const [k,v] of Object.entries(r.кнопки)) console.log('  '+k.padEnd(14)+' bottom='+(v&&v.bottom)+'  до низа окна '+(v&&v.доНиза)+'px');
const t=r.приУкороченномHtml;
console.log('\nпроверка правила: <html> насильно укорочен до 400px');
console.log('  #app: было '+t.былоApp+'px, стало '+t.app+'px (окно '+t.окно+'px)');
console.log('  карта: было '+t.былоКарта+'px, стало '+t.карта+'px');
console.log('  ' + (t.app===t.былоApp && t.карта===t.былоКарта && t.app===t.окно
  ? '✓ высота держится за окно, а не за предка — полосе взяться неоткуда'
  : '✗ съёжился за предком — правило не сработало'));
await b.close();
