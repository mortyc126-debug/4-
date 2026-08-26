

// вырезаем чистые функции недели

// Стенд для разбора недель в mp-weekly. Запуск: node tools/test_weeks.mjs
// Границы ISO-8601 — то место, где ошибка на единицу тише всего: 2026-W01
// начинается 29 декабря 2025, а 2026-W53 вообще существует. Ошибись тут — и
// одна и та же неделя однажды оплатится дважды под разными ключами.
// _weekmod.mjs — те же три функции, вырезанные из mp-weekly/index.js
// (сама функция самодостаточна и импортов не терпит, см. её заголовок).
import {isoWeekKey,isoWeekRange,isoWeekRangeFromKey} from './_weekmod.mjs';
let bad=0; const ok=(c,m)=>{ if(!c) bad++; console.log((c?'  ok  ':'ПРОВАЛ')+'  '+m); };
const D=s=>new Date(s+'T12:00:00Z');
// известные точки ISO-8601
ok(isoWeekKey(D('2026-01-01'))==='2026-W01','1 янв 2026 (чт) -> 2026-W01, дал '+isoWeekKey(D('2026-01-01')));
ok(isoWeekKey(D('2025-12-29'))==='2026-W01','29 дек 2025 (пн) -> 2026-W01, дал '+isoWeekKey(D('2025-12-29')));
ok(isoWeekKey(D('2027-01-03'))==='2026-W53','3 янв 2027 (вс) -> 2026-W53, дал '+isoWeekKey(D('2027-01-03')));
ok(isoWeekKey(D('2026-08-26'))==='2026-W35','26 авг 2026 (ср) -> 2026-W35, дал '+isoWeekKey(D('2026-08-26')));
// туда-обратно на год вперёд
let mism=0;
for(let i=0;i<400;i++){
  const d=new Date(Date.UTC(2026,0,1)+i*86400000);
  const key=isoWeekKey(d), r1=isoWeekRange(d), r2=isoWeekRangeFromKey(key);
  if(!r2 || r1.from.getTime()!==r2.from.getTime()) { if(mism<3) console.log('  расхождение '+d.toISOString().slice(0,10)+' '+key+' '+r1.from.toISOString()+' vs '+(r2&&r2.from.toISOString())); mism++; }
}
ok(mism===0,'ключ и диапазон сходятся все 400 дней (расхождений '+mism+')');
// границы: понедельник 00:00, ровно 7 суток
const r=isoWeekRange(D('2026-08-26'));
ok(r.from.getUTCDay()===1&&r.from.getUTCHours()===0,'начало недели — понедельник 00:00 UTC');
ok(r.to-r.from===7*86400000,'ровно семь суток');
console.log(bad?'\nПРОВАЛОВ: '+bad:'\nвсё сошлось');
process.exitCode=bad?1:0;
