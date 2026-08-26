// Карусель обучения: остаётся ли она там, куда её пролистали.
import { chromium } from '/tmp/claude-0/-home-user-4-/0c66050f-a4e4-5e44-901a-3d7a97a7b9fc/scratchpad/node_modules/playwright/index.mjs';
const now=Date.now()/1000;
const TK=['inf','arc','cav','sie'];
const units=(n=0)=>{const u={};TK.forEach(t=>{u[t]={};for(let i=1;i<=5;i++)u[t][i]=n;});return u;};
const tech={}; ['inf','arc','cav','sie'].forEach(t=>{for(let i=2;i<=5;i++) tech['mil_tier_'+t+i]=1;});
const state={ race:'human',
  b:{ hall:25, wall:5, farm:[6,0,0,0], lumber:[5,0,0,0], quarry:[4,0,0,0], mine:[3,0,0,0],
      store:6, barracks:25, range:0, stable:0, siege:3, hospital:[4,0,0,0], academy:25,
      garrison:3, scout:2, forge:0, portal:0, market:5, alliance:0 },
  layout:[{b:'barracks',plot:null,gx:5,gy:12}], queues:[null,null],
  train:{inf:null,arc:null,cav:null,sie:null},
  troops:units(500), wounded:units(), heal:null, rsch:null, craft:null,
  res:{food:9e8,wood:9e8,stone:9e8,gold:9e8}, resAt:now,
  gen:{lv:5,xp:0,pts:5,tal:{},id:0,away:null}, gear:{}, tech, inventory:{},
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
page.on('console', m=>{ if(m.type()==='error'){ const t=m.text(); if(!/Failed to load resource/.test(t)) errors.push('CONSOLE: '+t); } });
await page.addInitScript(STUB);
await page.route('**/vendor/supabase-js-*.min.js', r => r.fulfill({status:200,contentType:'application/javascript',body:'/* stub */'}));
await page.route('**/functions/v1/**', r => r.request().url().includes('mp-join')
  ? r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,world_id:'w1',player})})
  : r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})}));
await page.route('**/engine/dist/**', r => r.abort());
await page.goto('http://localhost:8099/index.html', { waitUntil:'domcontentloaded' });
await page.waitForTimeout(3500);

const r = await page.evaluate(async ()=>{
  const out={};
  mpOpenUnitCarousel('inf');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const track=()=>document.getElementById('uc-track');
  const карточки=()=>[...track().querySelectorAll('.uc-card')];
  const кто=()=>{ const t=track(); let best=0,bd=1e9;
    карточки().forEach((c,i)=>{ const d=Math.abs(c.offsetLeft-t.scrollLeft); if(d<bd){bd=d;best=i;} });
    return best+1; };
  out.открылосьНа=кто();
  out.доступныйМакс=tierUnlockedFor(mpFullShim(mpState.player,mpState.player.state),'inf');
  out.активныйТир=mpTrainCtx.tier;
  // Кнопки на карточках: есть ли чем вообще воспользоваться на Т1..Т4.
  out.кнопкиПоТирам=карточки().map((c,i)=>{
    const b=c.querySelector('.uc-go');
    return (i+1)+':'+(b?(b.dataset.mode||'форма'):'НЕТ');
  });
  // Листаем на Т1 и прогоняем тик опроса.
  track().scrollLeft=карточки()[0].offsetLeft;
  out.послеПрокрутки=кто();
  mpRerenderNow();
  await new Promise(r=>setTimeout(r,40));
  out.послеТика=кто();
  // Ещё три тика подряд — как за три секунды реального опроса. Между ними
  // МЕНЯЕМ ресурсы: именно так и бывает вживую (добыча капает каждую
  // секунду), и именно от этого меняется текст в активной карточке —
  // "Время набора", остатки в требованиях. Смена высоты в контейнере со
  // scroll-snap заставляет браузер переснапиться.
  for(let i=0;i<3;i++){
    mpState.player.state.res.food -= 1234567;
    mpState.player.state.res.wood -= 987654;
    mpRerenderNow();
    await new Promise(r=>setTimeout(r,20));
  }
  out.послеТрёхТиков=кто();
  // И крайний случай: ресурсов стало НЕ хватать — активная карточка
  // меняет вид целиком (форма -> "Не хватает ресурсов"), высота прыгает.
  mpState.player.state.res={food:0,wood:0,stone:0,gold:0};
  mpTrainCtx.max=0; mpTrainCtx.n=0;
  mpRerenderNow();
  await new Promise(r=>setTimeout(r,40));
  out.послеОбнуленияРесурсов=кто();
  out.скроллТрека=Math.round(track().scrollLeft);
  out.снап=getComputedStyle(track()).scrollSnapType;
  return out;
});
console.log('ошибок страницы:', errors.length, errors.slice(0,3));
console.log('доступный максимум тира:', r.доступныйМакс, ', активный в контексте:', r.активныйТир);
console.log('карусель открылась на Т'+r.открылосьНа);
console.log('кнопки по тирам:', r.кнопкиПоТирам.join('  '));
console.log('пролистали на Т'+r.послеПрокрутки+'  →  после тика Т'+r.послеТика+
  '  →  после трёх тиков с меняющимися ресурсами Т'+r.послеТрёхТиков+
  '  →  после обнуления ресурсов Т'+r.послеОбнуленияРесурсов);
console.log('scroll-snap-type:', r.снап, ', scrollLeft:', r.скроллТрека);
const ок = r.послеТика===1 && r.послеТрёхТиков===1 && r.послеОбнуленияРесурсов===1;
console.log(ок ? '✓ остаётся там, куда пролистали' : '✗ УЕЗЖАЕТ ОБРАТНО');
await b.close();
