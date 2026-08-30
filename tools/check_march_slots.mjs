// Панели отрядов: обоз виден обеим сторонам, чужой марш обведён красным,
// а сами панели в Городе и в Мире стоят на одном месте (не прыгают при
// переключении вкладки).
const PW_CANDIDATES = [process.env.PW_PATH, 'playwright',
  '/opt/node22/lib/node_modules/playwright/index.mjs',
  '/usr/lib/node_modules/playwright/index.mjs',
  '/usr/local/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c.startsWith('/') ? 'file://' + c : c)); break; } catch (_) {}
}
if (!chromium) { console.error('playwright не найден; укажите PW_PATH'); process.exit(2); }
const now=Date.now()/1000, iso=(s)=>new Date(Date.now()-s*1000).toISOString();
const TK=['inf','arc','cav','sie'];
const units=(n=0)=>{const u={};TK.forEach(t=>{u[t]={};for(let i=1;i<=5;i++)u[t][i]=n;});return u;};
const state={ race:'human',
  b:{ hall:12, wall:5, farm:[6,0,0,0], lumber:[5,0,0,0], quarry:[4,0,0,0], mine:[3,0,0,0],
      store:6, barracks:5, range:0, stable:0, siege:3, hospital:[4,0,0,0], academy:6,
      garrison:3, scout:2, forge:0, portal:0, market:5, alliance:0 },
  layout:[{b:'market',plot:null,gx:13,gy:12}], queues:[null,null],
  train:{inf:null,arc:null,cav:null,sie:null},
  troops:units(100), wounded:units(), heal:null, rsch:null, craft:null,
  res:{food:80000,wood:40000,stone:12000,gold:5000}, resAt:now,
  gen:{lv:5,xp:0,pts:5,tal:{},id:0,away:null}, gear:{}, tech:{}, inventory:{},
  materials:{ore:[0,0,0,0,0],leather:[0,0,0,0,0],bone:[0,0,0,0,0],ebony:[0,0,0,0,0]},
  tomes:{}, amber:0 };
const player={ id:7, world_id:'w1', auth_uid:'u1', is_bot:false, race:'human', nick:'Тестовый', name:'',
  x:120, y:-40, shield_until:0, power:0, state,
  created_at:iso(864e2), updated_at:new Date().toISOString(), dead_at:null };
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
page.on('console', m=>{ if(m.type()==='error'){ const t=m.text(); if(!/Failed to load resource/.test(t)) errors.push('CONSOLE: '+t); } });
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', r => r.fulfill({status:200,contentType:'application/javascript',body:'/* stub */'}));
await page.route('**/functions/v1/**', r => r.request().url().includes('mp-join')
  ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,world_id:'w1',player})})
  : r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})}));
await page.route('**/engine/dist/**', r => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3500);
console.log('ошибок страницы:', errors.length, errors.slice(0,4));

const r = await page.evaluate(()=>{
  const t=Date.now()/1000;
  const u=(n)=>{const o={};['inf','arc','cav','sie'].forEach(k=>{o[k]={};for(let i=1;i<=5;i++)o[k][i]=n;});return o;};
  const empty={inf:{},arc:{},cav:{},sie:{}};
  mpState.neighbors=[{id:9,race:'undead',nick:'Гроза',x:150,y:-20,hall:10,gen:1,shield_until:0}];
  // свой обоз туда и свой же на обратной дороге
  mpState.marches=[
    {id:101,player_id:7,mode:'trade',state:'go',  t0:t-10,t1:t+50,tx:150,ty:-20,units:empty,
     data:{sent:{food:5000,wood:5000},net:{food:3450,wood:3450},from:{x:120,y:-40},dist:40,spd:160}},
    {id:102,player_id:7,mode:'trade',state:'back',t0:t-5, t1:t+40,tx:120,ty:-40,units:empty,
     data:{sent:{},net:{},delivered:true,from:{x:150,y:-20},dist:40,spd:160}},
    {id:103,player_id:7,mode:'attack',state:'go', t0:t-5, t1:t+90,tx:150,ty:-20,units:u(10),data:{}},
  ];
  // чужие: обоз к нам (дружеский) и штурм (враждебный)
  mpState.incoming=[
    {id:201,player_id:9,mode:'trade', state:'go',   t0:t-10,t1:t+30,tx:120,ty:-40,units:empty,
     data:{to_id:7,net:{food:1000},from:{x:150,y:-20}}},
    {id:202,player_id:9,mode:'attack',state:'go',   t0:t-10,t1:t+70,tx:120,ty:-40,units:u(20),data:{defender_id:7}},
    {id:203,player_id:9,mode:'attack',state:'siege',t0:t-99,t1:t-9, tx:120,ty:-40,units:u(20),data:{defender_id:7}},
  ];
  const host=document.createElement('div');
  const read=(html)=>{ host.innerHTML=html; return [...host.querySelectorAll('.slotcell')].map(c=>({
    icon:((c.querySelector('img')||{}).getAttribute?.('src')||'').split('/').pop(),
    cls:c.className, title:c.getAttribute('title')||''})); };
  const out={};
  // Город: панель собирается строкой внутри folio.
  out.город=read(mpRenderFieldArmy());
  // Мир: та же панель пишется в готовый узел, но только во вкладке "Мир".
  toggleView(); lastMpFieldArmyWorld=""; mpRenderFieldArmyWorld();
  out.мир=read(($('#fieldarmy-world')||{}).innerHTML||"");
  toggleView();
  // где стоят панели в Городе и в Мире
  const box=(id)=>{const e=document.getElementById(id); if(!e) return null;
    const s=getComputedStyle(e); return {top:s.top,left:s.left,right:s.right,gap:s.gap};};
  out.панели={brigades:box('brigades'), brigadesWorld:box('brigades-world'),
              fieldarmy:box('fieldarmy'), fieldarmyWorld:box('fieldarmy-world')};
  const snap=mpBuildWorldSnapshot();
  out.вСнимке=snap.marches.map(m=>m.id+':'+m.mode);
  return out;
});
const p=(a)=>a.forEach(c=>console.log('   ', c.icon.padEnd(20), (c.cls.replace('slotcell','').trim()||'—').padEnd(8), c.title.slice(0,72)));
console.log('\nГород:'); p(r.город);
console.log('Мир:');   p(r.мир);
console.log('\nпанели:', JSON.stringify(r.панели));
console.log('в 3D-снимке:', r.вСнимке.join(', '));

const fail=[];
// fmt() разделяет разряды НЕРАЗРЫВНЫМ пробелом — сравниваем по обычному.
const norm=(t)=>t.replace(/\u00a0/g,' ');
const own=r.город.map(c=>({...c, title:norm(c.title)}));
if(!own.some(c=>c.icon==='icon-trade.png' && c.title.includes('Еда 5 000'))) fail.push('свой обоз с грузом не показан');
if(!own.some(c=>c.icon==='icon-trade.png' && c.title.includes('порожняком')))  fail.push('обоз на обратной дороге не показан');
if(!own.some(c=>c.cls.includes('friend') && c.title.startsWith('Обоз от')))   fail.push('чужой обоз не помечен как дружеский');
if(own.filter(c=>c.cls.includes('foe')).length!==2)                            fail.push('враждебные марши не обведены (ждали 2)');
// Состав и подсветка обязаны совпадать; подсказка в Мире длиннее на
// "нажмите, чтобы проследить камерой" — это намеренно, её и не сверяем.
const скелет=(a)=>JSON.stringify(a.map(c=>[c.icon,c.cls]));
if(скелет(r.город)!==скелет(r.мир))                                           fail.push('Город и Мир показывают разное');
const P=r.панели;
if(P.brigades.top!==P.brigadesWorld.top || P.fieldarmy.top!==P.fieldarmyWorld.top) fail.push('панели стоят на разной высоте');
if(P.brigades.gap!==P.brigadesWorld.gap)                                       fail.push('разные зазоры между слотами');
if(r.вСнимке.some(s=>s.endsWith(':trade')))                                    fail.push('обоз попал в 3D-мир');
console.log('\n'+(fail.length?'ПРОВАЛЫ:\n  '+fail.join('\n  '):'✓ всё сходится'));
await b.close();
