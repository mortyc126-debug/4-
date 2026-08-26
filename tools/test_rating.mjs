// Стенд для правил рейтинга (_shared/rating.js). Запуск: node tools/test_rating.mjs
// Проверяет столб званий на дыры между полосами, ключи сезонов, все ветки
// счёта боя (в том числе те, на которых формула уже дважды ломалась: штраф
// киту за совсем беззащитную цель и подвиг слабого против пустого города —
// у них ОДИН И ТОТ ЖЕ мелкий k_поле, но противоположный смысл), калибровку и
// затухание.
import * as R from '../supabase/functions/_shared/rating.js';
let failed=0;
const ok=(c,m)=>{ if(!c) failed++; console.log((c?'  ok  ':'ПРОВАЛ')+'  '+m); };
process.on('exit',()=>{ if(failed){ console.log('\nПРОВАЛОВ: '+failed); process.exitCode=1; } else console.log('\nвсё сошлось'); });

console.log('--- столб ---');
for(const v of [0,153,154,769,770,1539,1540,3849,3850,4619,4620,5499,5500,9999])
  console.log(String(v).padStart(5)+' -> '+R.rankOf(v).full);
for(const v of [-1,-153,-769,-770,-2309,-5499,-5500,-9999])
  console.log(String(v).padStart(5)+' -> '+R.rankOf(v).full);

console.log('--- границы сходятся ---');
const tables=[[R.RANKS_UP,1],[R.RANKS_DOWN,-1]];
for(const [t,sign] of tables) for(let i=0;i<t.length-1;i++)
  ok(t[i].to+1===t[i+1].from, (sign>0?'вверх':'вниз')+': '+t[i].name+' -> '+t[i+1].name+' без дыры');
ok(R.rankOf(0).full==='Рекрут V','ноль = Рекрут V');
ok(R.rankOf(769).full==='Рекрут I','769 = Рекрут I');
ok(R.rankOf(-1).full==='Бесчестный V','-1 = Бесчестный V');
ok(R.rankOf(-769).full==='Бесчестный I','-769 = Бесчестный I');
ok(R.rankOf(6000).full==='Титан','Титан без ступени');

console.log('--- сезоны ---');
for(const d of ['2026-01-15','2026-03-01','2026-06-30','2026-09-01','2026-12-05'])
  console.log(d+' -> '+R.seasonKeyAt(d+'T12:00:00Z')+'  '+R.seasonTitle(R.seasonKeyAt(d+'T12:00:00Z')));
ok(R.seasonKeyAt('2025-12-05T00:00:00Z')==='2026-winter','декабрь уходит в зиму следующего года');
console.log('пересчёт: 5800 -> '+R.seasonReset(5800)+' ('+R.rankOf(R.seasonReset(5800)).full+')');
console.log('пересчёт: -1800 -> '+R.seasonReset(-1800)+' ('+R.rankOf(R.seasonReset(-1800)).full+')');

console.log('--- счёт боя ---');
const S=(o)=>R.scoreBattle(o);
const eq={attField:1000,defField:1000,attPower:50000,defPower:50000,attRating:1000};
let r=S({...eq,winner:'att'}); ok(r.attDelta===25&&r.defDelta===-25,'равный: нападающий победил +25/-25 ('+r.reason+')');
r=S({...eq,winner:'def'});    ok(r.attDelta===-25&&r.defDelta===25,'равный: защитник победил');

// кит подкрутил марш под новичка: поле 1:1, державы 10:1
const whale={attField:1000,defField:1000,attPower:500000,defPower:50000,attRating:5800};
r=S({...whale,winner:'att'}); ok(r.attDelta===-116&&r.defDelta===0,'кит с подкрученным маршем: '+r.attDelta+'/'+r.defDelta+' ('+r.reason+')');
r=S({...whale,winner:'def'}); ok(r.attDelta===-50&&r.defDelta===50,'кит не взял новичка: '+r.attDelta+'/'+r.defDelta+' ('+r.reason+')');

// новичок сам напал на кита (подстава — кит в обороне)
const grief={attField:400,defField:5000,attPower:50000,defPower:500000,attRating:0};
r=S({...grief,winner:'def'}); ok(r.attDelta===0&&r.defDelta===0,'подстава альта в кита: обоим ноль ('+r.reason+')');
r=S({...grief,winner:'att'}); ok(r.attDelta===50&&r.defDelta===-50,'слабый взял кита: +50/-50 ('+r.reason+')');

// кит бьёт СОВСЕМ беззащитного — штраф всё равно обязан быть
r=S({attField:5000,defField:20,attPower:500000,defPower:50000,attRating:5800,winner:'att'});
ok(r.counted&&r.attDelta===-116,'кит бьёт беззащитного: штраф не отменяется ('+r.reason+' '+r.attDelta+')');

// кит оставил пустой город, альт "победил" — скармливание не проходит
r=S({attField:300,defField:10,attPower:50000,defPower:500000,attRating:0,winner:'att'});
ok(!r.counted&&r.reason==='бой без боя','пустой город кита альту ничего не даёт');

// равные, защитник эвакуировал город — не избиение, никому ничего
r=S({attField:5000,defField:30,attPower:500000,defPower:480000,attRating:3000,winner:'att'});
ok(!r.counted&&r.reason==='поле не сошлось','эвакуация у равного: обоим ноль, штрафа нет');

// равные, нападающий пришёл малым отрядом на пробу и лёг
r=S({attField:200,defField:5000,attPower:500000,defPower:480000,attRating:3000,winner:'def'});
ok(!r.counted&&r.reason==='поле не сошлось','проба малым отрядом у равного: обоим ноль');

// потолок пары
r=S({...eq,winner:'att',pairBattles:4}); ok(!r.counted&&r.reason==='потолок пары','пятый бой за час не считается');

console.log('--- штраф по рангам ---');
for(const v of [5800,3500,1000,300,0,-3000]) console.log(String(v).padStart(6)+' -> -'+R.raidPenalty(v));

console.log('--- калибровка ---');
ok(R.applyDelta(10,3,-25)===0,'новичок не уходит ниже нуля');
ok(R.applyDelta(10,10,-25)===-15,'после калибровки уходит');

console.log('--- затухание ---');
const day=86400000, now=Date.now();
ok(R.decayRating(5800,now-13*day,now).rating===5800,'13 суток — не трогает');
ok(R.decayRating(5800,now-20*day,now).rating===5800-25*6,'20 суток — минус 6 дней');
ok(R.decayRating(3000,now-100*day,now).rating===3000,'ниже порога не трогает');
ok(R.decayRating(3900,now-1000*day,now).rating===3850,'пол на границе Властелина');
