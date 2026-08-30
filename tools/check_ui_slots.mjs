// Фаза 38: слот исследования, мгновенное освобождение бригад, "Переместить"
// внизу карточки, донесение разведки без тегов, пауза мира под координатами.
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
  b:{ hall:12, wall:5, farm:[6,0,0,0], lumber:[5,0,0,0], quarry:[4,0,0,0], mine:[3,0,0,0],
      store:6, barracks:8, range:0, stable:0, siege:3, hospital:[4,0,0,0], academy:8,
      garrison:3, scout:2, forge:0, portal:0, market:5, alliance:0 },
  layout:[{b:'barracks',plot:null,gx:5,gy:12},{b:'academy',plot:null,gx:1,gy:12},
          {b:'market',plot:null,gx:13,gy:12}],
  // Первая бригада ещё строит, вторая ТОЛЬКО ЧТО закончила (t1 в прошлом).
  queues:[{b:'barracks',plot:null,lv:9,t0:now-100,t1:now+300},
          {b:'store',plot:null,lv:7,t0:now-400,t1:now-5}],
  train:{inf:null,arc:null,cav:null,sie:null},
  troops:units(50), wounded:units(), heal:null,
  rsch:{id:'eco_food1',lv:2,t0:now-100,t1:now+300}, craft:null,
  res:{food:9e6,wood:9e6,stone:9e6,gold:9e6}, resAt:now,
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
  const folio=document.getElementById('folio');
  folio.innerHTML=mpRenderFreeformCity();

  // --- слоты бригад и исследования -------------------------------------
  const br=folio.querySelector('#brigades');
  const cells=[...br.querySelectorAll('.slotcell')];
  out.слотов=cells.length;
  out.видСлотов=cells.map(c=>{
    const img=(c.querySelector('img')||{}).src||'';
    return img.split('/').pop().replace('.png','')+(c.classList.contains('empty')?'(пусто)':'');
  });
  const rs=cells.find(c=>((c.querySelector('img')||{}).src||'').includes('icon-research'));
  out.уИсследованияЕстьТаймер = !!(rs && rs.querySelector('.timer') && rs.querySelector('.timer').textContent.trim());
  out.уИсследованияЕстьПолоска = !!(rs && rs.querySelector('.progress i'));
  out.полоскаШирина = rs ? rs.querySelector('.progress i').style.width : null;
  out.слотПоследний = cells[cells.length-1]===rs;

  // Академия свободна — слот пропадает.
  const был=mpState.player.state.rsch;
  mpState.player.state.rsch=null;
  folio.innerHTML=mpRenderFreeformCity();
  out.безИсследованияСлотов=folio.querySelectorAll('#brigades .slotcell').length;
  mpState.player.state.rsch=был;

  // --- карточка здания: "Переместить" в самом низу ----------------------
  const card=mpBuildingModalHtmlFor('market',null);   // не в очереди — кнопка должна быть
  const iRel=card.indexOf("data-mp='relocatestart'");
  out.переместитьЕсть = iRel>=0;
  out.переместитьПослеНабора = iRel > Math.max(card.indexOf("data-mp='tradeopen'"), card.indexOf("bm-hp"));
  out.переместитьВКонце = iRel > card.length*0.75;

  // --- донесение разведки ------------------------------------------------
  const iso=(s)=>new Date(Date.now()-s*1000).toISOString();
  mpState.scoutMail=[{id:1,world_id:'w1',player_id:7,kind:'scout',created_at:iso(60),
    data:{found:true,opponent_nick:'Вакс',hall:1,shielded:true,se:0,total:0,
          x:150,y:-20,power:18600}}];
  const e=mpMailScoutEntry(mpState.scoutMail[0]);
  const host=document.createElement('div'); host.innerHTML=e.detailHtml;
  out.разведкаПодпись=e.sub;
  out.разведкаТекст=(host.textContent||'').replace(/\s+/g,' ').trim();
  out.естьТеги=/mil_scout|Маскировк/.test(out.разведкаТекст);
  out.естьЩит=/щит/i.test(out.разведкаТекст+' '+out.разведкаПодпись);
  out.естьКоординаты=/150/.test(out.разведкаТекст)&&/-20/.test(out.разведкаТекст);
  out.естьМощь=/18\.6K|18 600/.test(out.разведкаТекст+' '+out.разведкаПодпись);

  // --- пауза мира под окном координат ------------------------------------
  document.getElementById('app').className='view-world';
  mpSyncWorld3DPause();
  out.паузаДо=!!window.__world3dPaused;
  mpOpenLocate();
  await new Promise(r=>setTimeout(r,40));
  out.паузаСОкном=!!window.__world3dPaused;
  mpCloseLocate();
  await new Promise(r=>setTimeout(r,40));
  out.паузаПосле=!!window.__world3dPaused;
  document.getElementById('app').className='view-city';
  return out;
});
console.log('ошибок страницы:', errors.length, errors.slice(0,3));
console.log('слотов в столбце:', r.слотов, r.видСлотов);
console.log('  вторая бригада (стройка кончилась) показана пустой:',
  r.видСлотов.filter(v=>v.includes('(пусто)')).length===1 ? '✓' : '✗');
console.log('  исследование последним:', r.слотПоследний?'✓':'✗',
  ', таймер:', r.уИсследованияЕстьТаймер?'✓':'✗',
  ', полоска:', r.уИсследованияЕстьПолоска?'✓ ('+r.полоскаШирина+')':'✗');
console.log('  без исследования слотов:', r.безИсследованияСлотов, r.безИсследованияСлотов===2?'✓':'✗');
console.log('«Переместить»: есть', r.переместитьЕсть, ', после набора войск:', r.переместитьПослеНабора?'✓':'✗',
  ', в последней четверти карточки:', r.переместитьВКонце?'✓':'✗');
console.log('разведка подпись:', r.разведкаПодпись);
console.log('разведка текст:', r.разведкаТекст);
console.log('  теги/подсказки:', r.естьТеги?'✗ ЕСТЬ':'✓ нет',
  ', щит:', r.естьЩит?'✗ ЕСТЬ':'✓ нет',
  ', координаты:', r.естьКоординаты?'✓':'✗',
  ', мощь:', r.естьМощь?'✓':'✗');
console.log('пауза мира: до окна', r.паузаДо, '| с окном', r.паузаСОкном, '| после', r.паузаПосле,
  (!r.паузаДо&&r.паузаСОкном&&!r.паузаПосле)?'✓':'✗');
await b.close();
