// Стенд боёвки: гоняет НАСТОЯЩИЙ resolveBattle() из index.html в headless-
// браузере и печатает, сколько раундов идёт бой и какие стороны несут потери
// по нескольким типовым раскладам. Нужен, чтобы правка боевых формул не
// растягивала и не схлопывала бой втихую: снимок «до» сравнивается со
// снимком «после» глазами.
//
// Именно им подобран CFG.BATTLE_PACE после отмены магической атаки: без
// магии урон общей схватки падал примерно в полтора раза (у неё почти не
// было смягчения — магическая защита у всех была втрое ниже обычной), и темп
// поднят ровно на измеренную долю, чтобы длина боя осталась прежней.
//
// Запуск (сервер поднимается ИЗ КОРНЯ репозитория, иначе картинки и модули
// отдаются 404):
//   (setsid python3 -m http.server 8799 >/dev/null 2>&1 </dev/null &)
//   PLAYWRIGHT_MJS=<путь>/node_modules/playwright/index.mjs node tools/test_battle.mjs
//
// PLAYWRIGHT_MJS нужен, только если playwright не стоит рядом; PW_CHROME —
// если браузер лежит не там, где его кладёт песочница.
const { chromium } = await import(process.env.PLAYWRIGHT_MJS || 'playwright');
const b = await chromium.launch({
  executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({viewport:{width:430,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
await p.route('**/*', r=> r.request().url().startsWith('http://localhost') ? r.continue() : r.abort());
await p.goto('http://localhost:8799/index.html?sp=1');
await p.waitForTimeout(7000);

const out = await p.evaluate(()=>{
  const mkU=(o)=>{const u={};TKEYS.forEach(t=>{u[t]={};for(let i=1;i<=5;i++)u[t][i]=0});
    for(const k in o){const t=k.slice(0,3),i=+k.slice(3);u[t][i]=o[k];} return u;};
  // Голый игрок: раса, пустые здания/исследования/генерал — чтобы мерить
  // именно формулу боя, а не чужие бонусы.
  // Голый игрок = копия своего, у которого обнулены здания, исследования и
  // таланты: мерим формулу боя, а не чужие бонусы. Обе стороны одинаковы.
  const base=me();
  const mkP=(id,race)=>{
    const q=JSON.parse(JSON.stringify(base));
    q.id=id; q.race=race; q.name="Сторона"+id;
    BKEYS.forEach(k=>{ q.b[k]=Array.isArray(q.b[k])?[0,0,0,0]:0 });
    q.tech={}; q.gen={id:0,lv:1,xp:0,pts:0,tal:{},away:null};
    q.gear={}; q.troops=mkU({}); q.wounded=mkU({});
    return q;
  };
  const cases=[
    ["пехота Т1 1000 vs 1000",      {inf1:1000},{inf1:1000}],
    ["пехота Т5 1000 vs 1000",      {inf5:1000},{inf5:1000}],
    ["лучники Т3 vs конница Т3",    {arc3:1000},{cav3:1000}],
    ["конница Т4 vs пехота Т4",     {cav4:1000},{inf4:1000}],
    ["смешанная Т4 vs смешанная Т4",{inf4:400,arc4:300,cav4:250,sie4:50},{inf4:400,arc4:300,cav4:250,sie4:50}],
    ["осадные Т5 vs пехота Т5",     {sie5:1000},{inf5:1000}],
    ["пехота Т5 vs осадные Т5",     {inf5:1000},{sie5:1000}],
    ["разнотирье",                  {inf1:200,inf3:200,arc2:200,arc5:100,cav3:200,cav5:100,sie3:100},
                                    {inf2:300,inf5:100,arc3:200,arc4:100,cav2:200,cav4:100,sie5:50}],
  ];
  const rows=[];
  cases.forEach(([name,ua,ud],ci)=>{
    // Погода добавляет разброс — усредняем по 25 прогонам, меняя W.t (в seed).
    let rounds=0, lossA=0, lossD=0, winA=0, N=25;
    for(let k=0;k<N;k++){
      W.t = 1000 + k*97 + ci*7919;
      const pa=mkP(101+ci*2,"human"), pd=mkP(102+ci*2,"human");
      const A=makeForce(mkU(ua),pa,{name:"A"}), D=makeForce(mkU(ud),pd,{name:"D",defending:true});
      const r=resolveBattle(A,D,{});
      rounds+=r.rounds;
      lossA+=countUnits(r.lossA); lossD+=countUnits(r.lossD);
      if(r.win==="A") winA++;
    }
    const na=countUnits(mkU(ua)), nd=countUnits(mkU(ud));
    rows.push(name.padEnd(30)+" раундов "+(rounds/N).toFixed(1).padStart(5)+
      "   потери A "+(100*lossA/N/na).toFixed(1).padStart(5)+"%"+
      "   потери D "+(100*lossD/N/nd).toFixed(1).padStart(5)+"%"+
      "   побед A "+winA+"/"+N);
  });
  return rows.join("\n");
});
console.log(out);
if(errs.length) console.log("ОШИБКИ:\n"+errs.join("\n"));
await b.close();
