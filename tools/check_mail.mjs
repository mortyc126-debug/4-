// Прогон всех видов писем: ищем в готовом тексте "undefined", "NaN",
// "[object" и голые HTML-теги, попавшие в подпись как текст.
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
  b:{ hall:8, wall:5, farm:[6,0,0,0], lumber:[5,0,0,0], quarry:[4,0,0,0], mine:[3,0,0,0],
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

const r = await page.evaluate(async ()=>{
  const u=(n)=>{const o={};['inf','arc','cav','sie'].forEach(t=>{o[t]={};for(let i=1;i<=5;i++)o[t][i]=n;});return o;};
  const iso=(s)=>new Date(Date.now()-s*1000).toISOString();
  const mk=(id,kind,data,ago)=>({id,world_id:'w1',player_id:7,kind,data,created_at:iso(ago||600)});

  // Сбор: все пять видов точек, включая ЯНТАРЬ — на нём автор и поймал "undefined".
  mpState.gatherMail=[
    mk(1,'gather',{res:'amber',amount:65,x:130,y:-50}),
    mk(2,'gather',{res:'food', amount:12000,x:131,y:-51}),
    mk(3,'gather',{res:'wood', amount:9000, x:132,y:-52}),
    mk(4,'gather',{res:'stone',amount:8000, x:133,y:-53}),
    mk(5,'gather',{res:'gold', amount:400,  x:134,y:-54}),
  ];
  mpState.scoutMail=[ mk(10,'scout',{found:true,opponent_nick:'Сосед',hall:12,shielded:false,
      res:{food:1,wood:2,stone:3,gold:4},troops:u(10),x:150,y:-20}) ];
  mpState.raidMail=[ mk(20,'raid',{camp_lv:9,win:true,slight:10,hurt:5,dead:2,start:100,
      x:140,y:-30,power:1000,foe:800}) ];
  mpState.nodeBattleMail=[ mk(30,'node_battle',{role:'attacker',winner:'att',opponent_nick:'Гроза',
      attLoss:u(3),defLoss:u(4),attStart:100,defStart:90,res:'gold',x:141,y:-31}) ];
  // Полное боевое письмо: с расами (включает длинную ветку разбора),
  // хроникой раундов и сводкой разрушений — самая богатая разметкой часть.
  mpState.mail=[ mk(40,'battle',{role:'attacker',winner:'att',opponent_nick:'Гроза',
      attLoss:u(3),defLoss:u(5),attStart:200,defStart:180,
      attDead:10,attHurt:5,attSlight:3,defDead:20,defHurt:6,defSlight:4,
      attPower:5000,defPower:4000,
      attRace:'human',defRace:'undead',
      attCoords:{x:120,y:-40},defCoords:{x:150,y:-20},
      attGen:{id:0,lv:5},defGen:{id:1,lv:7},
      attBuffs:{},defBuffs:{},
      weather:'rain',weatherName:'Дождь',
      log:[
        {r:0,kind:'weather',text:'Дождь. Тетивы отсырели.',side:null},
        {r:1,kind:'volley', text:'Атакующие: лучники дали залп ещё до сшибки — пало 40.',side:'att'},
        {r:2,kind:'tower',  text:'Сторожевая башня бьёт по осадным — пало 5.',side:'def'},
        {r:3,kind:'panic',  text:'Конница дрогнула.',side:'def'},
        {r:4,kind:'breach', text:'Поле за нападавшими. Осадные орудия подтягивают к стенам — 30 в строю.',side:'att'},
        {r:5,kind:'ruin',   text:'Казармы (12 ур.) обрушены таранами.',side:'att'},
        {r:6,kind:'end',    text:'Город пал.',side:'att'},
      ],
      demolish:{
        ruined:[{name:'Казармы',lv:12},{name:'Рынок',lv:8}],
        damaged:[{name:'Ратуша',hp:4200,max:19500},{name:'Стена',lv:9,hp:9000,max:12000}],
      },
      }) ];
  mpState.siegeMail=[ mk(50,'siege_event',{phase:'start',role:'defender',mode:'attack',
      opponent_id:9,opponent_nick:'Гроза'}) ];
  mpState.tradeMail=[
    mk(60,'trade',{role:'receiver',from_nick:'Сосед',from_race:'elf',
      got:{food:3450,wood:3450,stone:0,gold:0},tax:0.31,x:130,y:-50}),
    mk(61,'trade',{role:'sender',to_nick:'Сосед',to_race:'elf',
      sent:{food:5000,wood:5000,stone:0,gold:0},net:{food:3450,wood:3450,stone:0,gold:0},
      tax:0.31,x:130,y:-50}),
    mk(62,'trade',{role:'sender',lost:true,to_nick:'Бедолага',sent:{food:5000},net:{food:3450}}),
  ];
  // Квитанции размена — все четыре ресурса в обе стороны, чтобы поймать и
  // ставку 1 (еда->дерево), и 0,75, и 0,5, и «некрасивую» 0,67 (камень->золото).
  mpState.barterMail=[
    mk(63,'barter',{from:'food',to:'wood', gave:1000,got:690, rate:1,   tax:0.31,lost:310,market_lv:5}),
    mk(64,'barter',{from:'food',to:'stone',gave:1000,got:517, rate:0.75,tax:0.31,lost:233,market_lv:5}),
    mk(65,'barter',{from:'wood',to:'gold', gave:1000,got:345, rate:0.5, tax:0.31,lost:155,market_lv:5}),
    mk(66,'barter',{from:'stone',to:'gold',gave:1000,got:460, rate:2/3, tax:0.31,lost:207,market_lv:5}),
    mk(67,'barter',{from:'gold',to:'food', gave:1000,got:1380,rate:2,   tax:0.31,lost:620,market_lv:25}),
  ];
  mpState.scoutedMail=[
    mk(68,'scouted',{by_nick:'Сосед',se:3,x:130,y:-50}),
    mk(69,'scouted',{by_nick:'Тихоня',se:0}),
  ];
  mpState.noteMail=[ mk(70,'note',{title:'Весть',body:'Простой текст'}) ];
  mpState.pmMail=[ mk(80,'pm',{role:'recipient',from_nick:'Сосед',subject:'Тема',body:'Здравствуй'}) ];

  const out={ строки:[], подозрительные:[] };
  const host=document.createElement('div');
  for(const [вкладка,fn] of [['report',mpMailReportEntries],['personal',mpMailPersonalEntries],
                             ['system',mpMailSystemEntries],['sent',mpMailSentEntries]]){
    let list; try{ list=fn(); }catch(e){ out.подозрительные.push(вкладка+': ИСКЛЮЧЕНИЕ '+e.message); continue; }
    for(const e of list){
      let rowHtml; try{ rowHtml=mpMailRowHtml(e); }catch(err){ out.подозрительные.push(вкладка+'#'+e.id+': строка упала '+err.message); continue; }
      host.innerHTML=rowHtml;
      const tt=(host.querySelector('.tt')||{}).textContent||'';
      const sb=(host.querySelector('.sb')||{}).textContent||'';
      out.строки.push({вкладка, id:e.id, title:tt, sub:sb});
      const плохо=[];
      for(const s of ['undefined','NaN','[object','&lt;','&gt;','&amp;','&#'])
        if(tt.includes(s)||sb.includes(s)) плохо.push(s);
      if(/<[a-z/]/i.test(tt)||/<[a-z/]/i.test(sb)) плохо.push('голый тег');
      if(плохо.length) out.подозрительные.push(вкладка+'#'+e.id+' ['+плохо.join(', ')+'] title="'+tt+'" sub="'+sb+'"');
      // Развёрнутая карточка письма — там же живут детали.
      let d; try{ d=e.detailHtml; }catch(err){ out.подозрительные.push(вкладка+'#'+e.id+': detail упал '+err.message); continue; }
      if(d){
        host.innerHTML=d;
        const txt=host.textContent||'';
        const плохо2=[];
        for(const s of ['undefined','NaN','[object'])
          if(txt.includes(s)) плохо2.push(s);
        if(/<[a-z/]/i.test(txt)) плохо2.push('голый тег в тексте');
        if(плохо2.length) out.подозрительные.push(вкладка+'#'+e.id+' ДЕТАЛИ ['+плохо2.join(', ')+'] «'+txt.slice(0,160)+'»');
      }
    }
  }
  // Весь экран почты целиком, по каждой вкладке и с раскрытым письмом —
  // там живут детали, шапка, вкладки и форма нового письма.
  out.экран=[];
  for(const вкладка of ['report','personal','system','sent','alliance','compose']){
    mpMailCat=вкладка; mpMailOpenId=null;
    let html; try{ html=mpMailScreenHtml(); }catch(e){ out.подозрительные.push('экран '+вкладка+': ИСКЛЮЧЕНИЕ '+e.message); continue; }
    host.innerHTML=html;
    const txt=host.textContent||'';
    const плохо=[];
    for(const s of ['undefined','NaN','[object']) if(txt.includes(s)) плохо.push(s);
    if(/<[a-z/]/i.test(txt)) плохо.push('голый тег в тексте');
    out.экран.push({вкладка, длина:txt.length});
    if(плохо.length) out.подозрительные.push('экран '+вкладка+' ['+плохо.join(', ')+']');
  }
  // Каждое письмо раскрытым.
  mpMailCat='report';
  for(const id of [40,10,20,30,1,2,60,61,62]){
    mpMailOpenId=id;
    let html; try{ html=mpMailScreenHtml(); }catch(e){ out.подозрительные.push('раскрытое #'+id+': ИСКЛЮЧЕНИЕ '+e.message); continue; }
    host.innerHTML=html;
    const txt=host.textContent||'';
    const плохо=[];
    for(const s of ['undefined','NaN','[object']) if(txt.includes(s)) плохо.push(s);
    if(/<[a-z/]/i.test(txt)) плохо.push('голый тег в тексте');
    if(плохо.length) out.подозрительные.push('раскрытое #'+id+' ['+плохо.join(', ')+'] «'+
      txt.replace(/\s+/g,' ').slice(0,200)+'»');
  }
  mpMailOpenId=null; mpMailCat='report';

  // Устойчивость: письмо с ПОЛОМАННЫМИ данными не должно уносить весь ящик.
  mpMailEntryCache.clear();
  mpState.mail=[...mpState.mail, {id:999,world_id:'w1',player_id:7,kind:'battle',
    created_at:iso(10), data:{role:'attacker',winner:'att',opponent_nick:'Кривой',
      attRace:'human',defRace:'undead',attCoords:{x:1,y:1},defCoords:{x:2,y:2},
      attGen:{id:0,lv:5},defGen:{id:1,lv:7},
      attBuffs:{},defBuffs:{},   // неполный снимок — раньше ронял всю почту
      attLoss:u(1),defLoss:u(1),attStart:10,defStart:10}}];
  mpMailCat='report'; mpMailOpenId=999;
  let битое; try{ битое=mpMailScreenHtml(); }catch(e){ битое='ИСКЛЮЧЕНИЕ: '+e.message; }
  out.кривоеПисьмо = битое.startsWith('ИСКЛЮЧЕНИЕ') ? битое : 'экран собрался, длина '+битое.length;
  mpMailOpenId=null;
  // И список рядом с ним тоже должен уцелеть.
  let список; try{ список=mpMailScreenHtml(); out.списокСКривым='собрался, писем '+
    (список.match(/class='mail-row/g)||[]).length; }
  catch(e){ out.списокСКривым='ИСКЛЮЧЕНИЕ: '+e.message; }

  // Пауза объёмного мира.
  const app=document.getElementById('app');
  closeMenuModal(); app.className='view-world'; mpSyncWorld3DPause();
  out.пауза={ мирБезМодалки: !!window.__world3dPaused };
  openMenuModal('mail');
  await new Promise(r=>setTimeout(r,30));
  out.пауза.мирСПочтой = !!window.__world3dPaused;
  closeMenuModal();
  await new Promise(r=>setTimeout(r,30));
  out.пауза.послеЗакрытия = !!window.__world3dPaused;
  app.className='view-city'; mpSyncWorld3DPause();
  openMenuModal('mail');
  await new Promise(r=>setTimeout(r,30));
  out.пауза.городСПочтой = !!window.__world3dPaused;
  closeMenuModal(); app.className='view-city'; mpSyncWorld3DPause();
  return out;
});
console.log('ошибок страницы:', errors.length, errors.slice(0,3));
console.log('писем отрисовано:', r.строки.length);
for(const s of r.строки) console.log('  ['+s.вкладка+'#'+s.id+'] '+s.title+' | '+s.sub);
console.log('кривое письмо:', r.кривоеПисьмо);
console.log('список рядом с кривым:', r.списокСКривым);
console.log('пауза мира:', JSON.stringify(r.пауза));
console.log('экранов собрано:', (r.экран||[]).map(e=>e.вкладка+':'+e.длина).join(', '));
console.log('\nПОДОЗРИТЕЛЬНОЕ ('+r.подозрительные.length+'):');
for(const s of r.подозрительные) console.log('  ✗ '+s);
if(!r.подозрительные.length) console.log('  чисто');
await b.close();
