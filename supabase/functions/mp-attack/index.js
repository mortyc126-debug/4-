// =============================================================================
// mp-attack — Фаза 4, второй кусочек: отправляет марш с настоящим временем
// в пути (было: мгновенный бой, см. историю коммитов). Зеркало sendMarch
// из index.html:4646 — считает то же расстояние/скорость, списывает
// отправленные войска из домашнего гарнизона сразу (как и в клиенте),
// заводит строку в marches и событие "march_arrive" в events, которое
// разберёт mp-tick, когда войско дойдёт (тот же тикер, что уже разбирает
// набор/постройки, см. supabase/README.md, Фаза 2). Сам бой (resolvePvp) и
// обратная дорога — там же, в mp-tick, см. подробный разбор ограничений
// боевой модели в _shared/rules.js ("PvP-бой" — не resolveBattle()).
//
// Честное упрощение: расстояние по прямой (Math.hypot), а не waterPath() —
// клетки местности (map_cells) в общем мире ещё не сгенерированы, обходить
// пока нечего.
//
// Тело запроса: { defender_id: number, units: {inf:{1:n,...},arc:{...},
//                  cav:{...},sie:{...}} }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js и ../_shared/rules.js —
// Dashboard-редактор Edge Functions не подтягивает относительные импорты на
// общую папку, поэтому здесь код самодостаточен (копия, а не импорт). При
// деплое через Supabase CLI можно вернуть импорты как в репозитории.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
function handleOptions(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  return null;
}

const TKEYS = ["inf", "arc", "cav", "sie"];
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } }; // index.html RACE_TROOP_MOD — только нежить меняет скорость (осада)
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
const marchSlots = (hall) => (hall >= 22 ? 5 : hall >= 17 ? 4 : hall >= 11 ? 3 : hall >= 5 ? 2 : 1);
// index.html:2854 epochOf — эпоха ратуши (1..5), нужна для bonuses() ниже
// (расовые эпохальные способности).
const epochOf = (hall) => (hall >= 25 ? 5 : hall >= 19 ? 4 : hall >= 13 ? 3 : hall >= 7 ? 2 : 1);
// Дерево исследований (только сама структура ACADEMY_TREE — таблицы
// стоимости/времени/мощи (RS_*) сюда не нужны, bonuses() ниже смотрит
// только на n.id/n.field/n.total/n.max/n.effects/n.unlock) — дословная
// копия из index.html:2024-2153, тот же кусок данных, что и в mp-research
// (полная версия с RS_*-таблицами — там, эта функция им не пользуется).
const ACADEMY_TREE = {
  eco: [
    // Было max:3 — в RoK и Quarrying, и Metallurgy однoуровневые (чистый анлок
    // без цифры), а в RESEARCH_TABLE на них теперь ровно одна точная строка.
    // Оставлен свой небольшой бонус (0.05, не из таблички — как раньше).
    {id:"eco_stone0",name:"Горное дело",max:1,wave:1,branch:"eco",field:"prodStone",total:0.05},
    {id:"eco_gold0",  name:"Промысел",   max:1,wave:1,branch:"eco",field:"prodGold", total:0.05},
    {id:"eco_food1",  name:"Ирригация",  max:5,wave:1,branch:"eco",field:"prodFood", total:0.15},
    {id:"eco_wood1",  name:"Лесное дело",max:5,wave:1,branch:"eco",field:"prodWood", total:0.15},
    {id:"eco_build1", name:"Кладка",     max:5,wave:1,branch:"eco",field:"build",kind:"mult",total:0.15},
    {id:"eco_stone1", name:"Резец",      max:5,wave:1,branch:"eco",field:"prodStone",total:0.15,requires:["eco_stone0"]},
    {id:"eco_gold1",  name:"Металлообработка",max:5,wave:1,branch:"eco",field:"prodGold",total:0.15,requires:["eco_gold0"]},
    {id:"eco_rsch1",  name:"Письменность",max:5,wave:1,branch:"eco",field:"researchSpeed",total:0.10},
    {id:"eco_gfood1", name:"Серп",       max:5,wave:1,branch:"eco",field:"gatherFW",total:0.15},
    {id:"eco_gwood1", name:"Топор",      max:5,wave:1,branch:"eco",field:"gatherFW",total:0.15},
    {id:"eco_gstone1",name:"Тачка",      max:5,wave:1,branch:"eco",field:"gatherSG",total:0.15},
    {id:"eco_ggold1", name:"Промывка",   max:5,wave:1,branch:"eco",field:"gatherSG",total:0.15},
    {id:"eco_load1",  name:"Колесо",     max:5,wave:1,branch:"eco",field:"load",total:0.15},
    {id:"eco_cap1",   name:"Многослойная кладка",max:5,wave:1,branch:"eco",field:"cap",total:0.15},
    // Донатная ветка (Янтарь). В RoK её аналог (Jewelry) — чистый анлок без
    // своего бонуса, тир 7, требует Multilayer Structure 4; здесь — как и
    // Горное дело/Промысел (тоже бывшие RoK-анлоки без цифр) — превращён в
    // узел с небольшим собственным бонусом, а не голый флаг. Сбор янтаря на
    // карте НЕ гейтится этим узлом (см. обсуждение) — открыт всем с начала
    // игры; тут только бонус к скорости сбора, как и у остальной тройки.
    // Было max:3 (по образцу старых eco_stone0/gold0) — но у Jewelry в
    // табличке только 1 строка, а 2-3 уровень тогда проваливались в
    // формулу-заглушку с абсурдным провалом цены. Как и у stone0/gold0,
    // оставлен один уровень с тем же принципом (свой бонус 0.05 не из
    // таблички, у самой Jewelry цифры нет — только цена/время/мощь).
    {id:"eco_amber0", name:"Промысел янтаря",max:1,wave:1,branch:"eco",field:"gatherAmber",total:0.05},
    {id:"eco_crown_dwarf", name:"Венец: Родовые копи",  max:5,wave:4,branch:"eco",race:"dwarf",gen:1,
      requires:["eco_stone2","eco_gold2"], effects:[{field:"prodStone",total:0.10},{field:"prodGold",total:0.10}]},
    {id:"eco_crown_human", name:"Венец: Казённый оброк", max:5,wave:4,branch:"eco",race:"human",gen:1,
      requires:["eco_gold2"], field:"prodGold", total:0.15},
    {id:"eco_crown_elf",   name:"Венец: Дары рощи",      max:5,wave:4,branch:"eco",race:"elf",gen:1,
      requires:["eco_food2","eco_wood2"], effects:[{field:"prodFood",total:0.10},{field:"prodWood",total:0.10}]},
    {id:"eco_crown_undead",name:"Венец: Голод погоста",  max:5,wave:4,branch:"eco",race:"undead",gen:1,
      requires:["eco_gall2"], effects:[{field:"raise",total:0.10},{field:"mercy",total:0.05}]},
    {id:"eco_wood2",  name:"Лесопилка",  max:10,wave:2,branch:"eco",field:"prodWood",total:0.55,requires:["eco_wood1"]},
    {id:"eco_food2",  name:"Плуг",       max:10,wave:2,branch:"eco",field:"prodFood",total:0.55,requires:["eco_food1"]},
    {id:"eco_gwood2", name:"Пилорама",   max:10,wave:2,branch:"eco",field:"gatherFW",total:0.35,requires:["eco_gwood1"]},
    {id:"eco_build2", name:"Инженерия",  max:10,wave:2,branch:"eco",field:"build",kind:"mult",total:0.35,requires:["eco_build1"]},
    {id:"eco_gfood2", name:"Коса",       max:10,wave:2,branch:"eco",field:"gatherFW",total:0.35,requires:["eco_gfood1"]},
    {id:"eco_rsch2",  name:"Математика", max:10,wave:2,branch:"eco",field:"researchSpeed",total:0.15,requires:["eco_rsch1"]},
    {id:"eco_gold2",  name:"Монетное дело",max:10,wave:2,branch:"eco",field:"prodGold",total:0.55,requires:["eco_gold1"]},
    {id:"eco_stone2", name:"Открытый разрез",max:10,wave:2,branch:"eco",field:"prodStone",total:0.55,requires:["eco_stone1"]},
    {id:"eco_ggold2", name:"Шахтное дело",max:10,wave:2,branch:"eco",field:"gatherSG",total:0.35,requires:["eco_ggold1"]},
    {id:"eco_gall2",  name:"Механизация",max:10,wave:2,branch:"eco",field:"gather",total:0.25,requires:["eco_gfood1","eco_gstone1"]},
    {id:"eco_gstone2",name:"Каменная пила",max:10,wave:2,branch:"eco",field:"gatherSG",total:0.35,requires:["eco_gstone1"]},
    // Была requires:["eco_load1","eco_cap1"] — второй пункт ссылался на чужую
    // линию (защита склада), нет ни в RoK-цепочке Carriage (там Machinery),
    // ни в собственном паттерне дерева (везде "2" требует только свою "1").
    {id:"eco_load2",  name:"Повозка",    max:10,wave:2,branch:"eco",field:"load",total:0.25,requires:["eco_load1"]},
    // Огранка (Cutting & Polishing, RoK тир 13, тот же тир что и Повозка) —
    // точный макс. бонус +35%, подтверждён по вики отдельно от таблицы
    // стоимости/времени тира (та сама по себе не была доступна источнику).
    {id:"eco_amber1", name:"Огранка",    max:10,wave:2,branch:"eco",field:"gatherAmber",total:0.35,requires:["eco_amber0"]},
  ],
  mil: [
    {id:"mil_atk_inf1",name:"Пехота, атака I",   max:5, wave:1,branch:"mil",
      effects:[{field:"atkInf",total:0.10},{field:"matkInf",total:0.05}]},
    {id:"mil_atk_inf2",name:"Пехота, атака II",  max:10,wave:2,branch:"mil",requires:["mil_atk_inf1"],
      effects:[{field:"atkInf",total:0.20},{field:"matkInf",total:0.10}]},
    {id:"mil_atk_arc1",name:"Лучники, атака I",  max:5, wave:1,branch:"mil",
      effects:[{field:"atkArc",total:0.10},{field:"matkArc",total:0.05}]},
    {id:"mil_atk_arc2",name:"Лучники, атака II", max:10,wave:2,branch:"mil",requires:["mil_atk_arc1"],
      effects:[{field:"atkArc",total:0.20},{field:"matkArc",total:0.10}]},
    {id:"mil_atk_cav1",name:"Кавалерия, атака I",max:5, wave:1,branch:"mil",
      effects:[{field:"atkCav",total:0.10},{field:"matkCav",total:0.05}]},
    {id:"mil_atk_cav2",name:"Кавалерия, атака II",max:10,wave:2,branch:"mil",requires:["mil_atk_cav1"],
      effects:[{field:"atkCav",total:0.20},{field:"matkCav",total:0.10}]},
    {id:"mil_atk_sie1",name:"Осада, атака I",    max:5, wave:1,branch:"mil",
      effects:[{field:"atkSie",total:0.10},{field:"matkSie",total:0.05}]},
    {id:"mil_atk_sie2",name:"Осада, атака II",   max:10,wave:2,branch:"mil",requires:["mil_atk_sie1"],
      effects:[{field:"atkSie",total:0.20},{field:"matkSie",total:0.10}]},
    {id:"mil_def_inf1",name:"Пехота, защита I",   max:5, wave:1,branch:"mil",
      effects:[{field:"defInf",total:0.10},{field:"mdefInf",total:0.05}]},
    {id:"mil_def_inf2",name:"Пехота, защита II",  max:10,wave:2,branch:"mil",requires:["mil_def_inf1"],
      effects:[{field:"defInf",total:0.20},{field:"mdefInf",total:0.10}]},
    {id:"mil_def_arc1",name:"Лучники, защита I",  max:5, wave:1,branch:"mil",
      effects:[{field:"defArc",total:0.10},{field:"mdefArc",total:0.05}]},
    {id:"mil_def_arc2",name:"Лучники, защита II", max:10,wave:2,branch:"mil",requires:["mil_def_arc1"],
      effects:[{field:"defArc",total:0.20},{field:"mdefArc",total:0.10}]},
    {id:"mil_def_cav1",name:"Кавалерия, защита I",max:5, wave:1,branch:"mil",
      effects:[{field:"defCav",total:0.10},{field:"mdefCav",total:0.05}]},
    {id:"mil_def_cav2",name:"Кавалерия, защита II",max:10,wave:2,branch:"mil",requires:["mil_def_cav1"],
      effects:[{field:"defCav",total:0.20},{field:"mdefCav",total:0.10}]},
    {id:"mil_def_sie1",name:"Осада, защита I",    max:5, wave:1,branch:"mil",
      effects:[{field:"defSie",total:0.10},{field:"mdefSie",total:0.05}]},
    {id:"mil_def_sie2",name:"Осада, защита II",   max:10,wave:2,branch:"mil",requires:["mil_def_sie1"],
      effects:[{field:"defSie",total:0.20},{field:"mdefSie",total:0.10}]},
    {id:"mil_atk_all1",name:"Атака войск I",  max:10,wave:2,branch:"mil",
      requires:["mil_atk_inf1","mil_atk_arc1","mil_atk_cav1","mil_atk_sie1"],
      effects:[{field:"atk",total:0.15},{field:"matk",total:0.075}]},
    {id:"mil_atk_all2",name:"Атака войск II", max:10,wave:3,branch:"mil",requires:["mil_atk_all1"],
      effects:[{field:"atk",total:0.25},{field:"matk",total:0.125}]},
    {id:"mil_def_all1",name:"Защита войск I", max:10,wave:2,branch:"mil",
      requires:["mil_def_inf1","mil_def_arc1","mil_def_cav1","mil_def_sie1"],
      effects:[{field:"def",total:0.15},{field:"mdef",total:0.075}]},
    {id:"mil_def_all2",name:"Защита войск II",max:10,wave:3,branch:"mil",requires:["mil_def_all1"],
      effects:[{field:"def",total:0.25},{field:"mdef",total:0.125}]},
    {id:"mil_hp_all1", name:"Здоровье войск I", max:10,wave:2,branch:"mil",field:"hp",total:0.15,
      requires:["mil_atk_all1","mil_def_all1"]},
    {id:"mil_hp_all2", name:"Здоровье войск II",max:10,wave:3,branch:"mil",field:"hp",total:0.25,requires:["mil_hp_all1"]},
    {id:"mil_trainspd",name:"Дисциплина обучения",max:1,wave:1,branch:"mil",field:"trainSpeed",total:0.20},
    {id:"mil_march1",  name:"Следопытство", max:5,wave:1,branch:"mil",field:"march",kind:"mult",total:0.15},
    // Была wave:1 — единственная "2"-нода во всём военном дереве без обычного
    // сдвига волны на 1 против своей "1" (везде x1→x2 поднимает волну, здесь
    // почему-то нет), и по факту это RoK-тир 9 (Cartography) против тира 4
    // у Следопытства — разрыв не меньше, чем у остальных таких пар.
    {id:"mil_march2",  name:"Картография",  max:5,wave:2,branch:"mil",field:"march",kind:"mult",total:0.15,requires:["mil_march1"]},
    {id:"mil_scout1",  name:"Слежка",       max:5,wave:1,branch:"mil",field:"scoutBonus",total:5},
    // Та же история: RoK-тир 7 (Camouflage) против тира 4 у Слежки, но была wave:1.
    {id:"mil_scout2",  name:"Маскировка",   max:5,wave:2,branch:"mil",field:"scoutBonus",total:5,requires:["mil_scout1"]},
    {id:"mil_crown_dwarf", name:"Венец: Секира предков", max:5,wave:4,branch:"mil",race:"dwarf",gen:0,
      requires:["mil_atk_inf2","mil_def_inf2"], effects:[{field:"atkInf",total:0.15},{field:"defInf",total:0.15}]},
    {id:"mil_crown_human", name:"Венец: Королевский указ",max:5,wave:4,branch:"mil",race:"human",gen:0,
      requires:["mil_atk_cav2","mil_def_cav2"], effects:[{field:"atkCav",total:0.15},{field:"defCav",total:0.15}]},
    {id:"mil_crown_elf",   name:"Венец: Лунная тетива",  max:5,wave:4,branch:"mil",race:"elf",gen:0,
      requires:["mil_atk_arc2","mil_def_arc2"], effects:[{field:"atkArc",total:0.15},{field:"defArc",total:0.15}]},
    {id:"mil_crown_undead",name:"Венец: Пир кургана",    max:5,wave:4,branch:"mil",race:"undead",gen:0,
      requires:["mil_atk_sie2","mil_def_sie2"], effects:[{field:"atkSie",total:0.15},{field:"defSie",total:0.15}]},
    ...["inf","arc","cav","sie"].flatMap(t=>[2,3,4,5].map(tier=>({
      id:"mil_tier_"+t+tier, name:({inf:"Пехота",arc:"Лучники",cav:"Кавалерия",sie:"Осада"}[t])+" T"+tier, max:1,
      wave:tier-1, branch:"mil", unlock:{type:t,tier},
      requires: tier>2 ? ["mil_tier_"+t+(tier-1)] : undefined
    }))),
  ],
};
// bonuses(p, defending) — Фаза 6. Честная (не упрощённая) часть центрального
// агрегатора бонусов клиента (index.html:3731-3789). Порядок и формулы —
// дословно оттуда, но перенесена НЕ вся функция целиком: часть слагаемых
// зависит от системы генералов, которая на сервер физически не может дать
// иного значения, кроме нейтрального (см. по пунктам ниже) — портить эти
// куски НЕЧЕГО, у них нет отдельных настоящих чисел, которые здесь
// проверялись бы отдельно.
//
// Что реально считается (все данные — дословная копия из index.html):
//   1. Расовый "минус" (RACES[race].minus, index.html:1743-1759).
//   2. Расовые эпохальные способности (RACE_EPOCHS, index.html:1767-1832) —
//      по числу открытых эпох (epochOf(p.b.hall)), плюс defMods 5-й эпохи
//      ТОЛЬКО при обороне (defending=true).
//   3. Бонус выбранного генерала — genOf(p)=GENERALS[p.race][p.gen.id||0]
//      (index.html:2345). Фаза 7: выбор генерала подключён по-настоящему
//      (mp-pickgen) — p.gen.id больше не всегда null, GENERALS ниже несёт
//      ОБЕ записи на расу (не только index 0), apply() читается по
//      реальному p.gen.id||0, как в клиенте.
//   4. portalMarchBonus(p.b.portal) — Портал не входит в постройки общего
//      мира (нет в BUILD_MP_BLDS/BKEYS этого модуля), поэтому p.b.portal
//      всегда отсутствует — передаётся 0 явно (portalMarchBonus(0)=0), это
//      не заглушка отдельного бонуса, а честный факт "здания ещё нет".
//   5. Бонусы дерева исследований (ACADEMY_TREE[*].field/effects, по
//      p.tech) — уже перенесено в Фазе 5, здесь наконец подключается.
//
// Что НЕ считается, и почему это математически, а не по недосмотру, ноль:
//   - Талантовые бонусы генерала (w1-w5/d1-d5/g1-g3/g4-g5, index.html:
//     3760-3767) и GENERAL_TREE (город/армия, index.html:3780-3787) — оба
//     читают ТОЛЬКО p.gen.tal. В общем мире система вложения очков таланта
//     не заведена вообще: p.gen.tal у каждого игрока всегда {} (mp-join),
//     очков взять неоткуда. T[id]||0 для любого id из пустого объекта — это
//     буквально 0, то есть эти два блока клиента при p.gen.tal={} дают
//     нулевой вклад АБСОЛЮТНО ТОЧНО, не приближённо — переносить их сюда
//     значило бы скопировать код, который на сервере гарантированно не
//     умеет посчитать ничего, кроме нуля. Поэтому они просто опущены, а не
//     скопированы ради видимости полноты.
// index.html:2283-2344 GENERALS — оба генерала на расу (name — только для
// mp-pickgen'а ответа/сверки, косметика apply не нужна серверу).
const GENERALS = {
  human: [
    { name: "Король Алдрик", apply: (b) => { b.atk += .15; b.def += .08; } },
    { name: "Королева Астрид", apply: (b) => { b.prodGold += .15; b.prodAll += .05; } },
  ],
  dwarf: [
    { name: "Дорвальд Каменный Трон", apply: (b) => { b.def += .08; b.wallBonus += .08; } },
    { name: "Гимрод Быстрая Секира", apply: (b) => { b.march += .10; b.wallBonus = 0; } },
  ],
  elf: [
    { name: "Ильвен Хрустальный Щит", apply: (b) => { b.def += .10; b.archer = 0; } },
    { name: "Тариэль Вечная", apply: (b) => { b.archer += .15; b.march += .05; } },
  ],
  undead: [
    { name: "Владислав фон Морвейн", apply: (b) => { b.def += .10; b.healSpeed = 1; } }, // обнуляет расовую скидку лазарета (RACE_EPOCHS.undead[1])
    { name: "Кармилла", apply: (b) => { b.raise += .15; b.mercy += .05; } },
  ],
};
// index.html:1736-1759 RACES[*].minus (без name/color/desc — косметика клиента).
const RACES_MINUS = {
  human:  { field: "prodGold", kind: "frac", value: -0.15 },
  dwarf:  { field: "march",    kind: "mult", value: 0.90 },
  elf:    { field: "def",      kind: "frac", value: -0.10 },
  undead: { field: "def",      kind: "frac", value: -0.10 },
};
// index.html:1767-1832 RACE_EPOCHS — mods (действуют всегда, как только
// открыта эпоха), defMods (только у 5-й эпохи, только при обороне).
const RACE_EPOCHS = {
  human: [
    { mods: [{ field: "build", kind: "mult", value: 1.05 }] },
    { mods: [{ field: "prodAll", kind: "frac", value: 0.05 }] },
    { mods: [{ field: "trainSpeed", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "buildCostCut", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "atk", kind: "frac", value: 0.08 }, { field: "def", kind: "frac", value: 0.08 }] },
  ],
  dwarf: [
    { mods: [{ field: "prodStone", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "prodGold", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "def", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "wallBonus", kind: "frac", value: 0.10 }] },
    { mods: [], defMods: [{ field: "def", kind: "add", value: 0.20 }, { field: "counter", kind: "add", value: 0.15 }] },
  ],
  elf: [
    { mods: [{ field: "prodFood", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "prodWood", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "march", kind: "mult", value: 1.10 }] },
    { mods: [{ field: "archer", kind: "frac", value: 0.15 }] },
    { mods: [{ field: "firstStrike", kind: "frac", value: 1 }] },
  ],
  undead: [
    { mods: [{ field: "raise", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "heal", kind: "mult", value: 0.70 }, { field: "healSpeed", kind: "mult", value: 0.5 }] },
    { mods: [{ field: "mercy", kind: "frac", value: 0.10 }] },
    { mods: [{ field: "raise", kind: "frac", value: 0.25 }] },
    { mods: [], defMods: [{ field: "raiseHurt", kind: "abs", value: 0.40 }] },
  ],
};
// index.html:2909 portalMarchBonus.
const portalMarchBonus = (lv) => (lv <= 0 ? 0 : lv <= 10 ? lv * 0.005 : 10 * 0.005 + (lv - 10) * 0.01);

function bonuses(p, defending = false) {
  const b = {
    build: 1, march: 1, heal: 1, healSpeed: 1,
    atk: 0, def: 0, hp: 0, archer: 0, raise: 0, raiseHurt: 0, gather: 0, load: 0, hosp: 0, cap: 0,
    prodFW: 0, prodSG: 0, bandit: 0, mercy: 0,
    gatherAmber: 0,
    prodAll: 0, prodFood: 0, prodWood: 0, prodStone: 0, prodGold: 0,
    trainSpeed: 0, buildCostCut: 0, wallBonus: 0, counter: 0, firstStrike: 0,
    researchSpeed: 0, scoutBonus: 0,
    atkInf: 0, atkArc: 0, atkCav: 0, atkSie: 0, defInf: 0, defArc: 0, defCav: 0, defSie: 0,
    matkInf: 0, matkArc: 0, matkCav: 0, matkSie: 0, mdefInf: 0, mdefArc: 0, mdefCav: 0, mdefSie: 0,
    matk: 0, mdef: 0,
    genAtkMod: 0, genDefMod: 0, genHpMod: 0,
  };
  const mn = RACES_MINUS[p.race];
  if (mn.kind === "mult") b[mn.field] *= mn.value; else b[mn.field] = (b[mn.field] || 0) + mn.value;
  const epoch = epochOf(p.b && p.b.hall), track = RACE_EPOCHS[p.race];
  for (let i = 0; i < epoch; i++) {
    (track[i].mods || []).forEach((m) => {
      if (m.kind === "mult") b[m.field] *= m.value; else b[m.field] = m.value;
    });
  }
  if (defending && epoch >= 5 && track[4].defMods) {
    track[4].defMods.forEach((m) => {
      if (m.kind === "abs") b[m.field] = m.value; else b[m.field] = (b[m.field] || 0) + m.value;
    });
  }
  GENERALS[p.race][(p.gen && p.gen.id) || 0].apply(b);
  b.march *= 1 + portalMarchBonus((p.b && p.b.portal) || 0);
  const tech = p.tech || {};
  const multAcc = {};
  [ACADEMY_TREE.eco, ACADEMY_TREE.mil].forEach((arr) => arr.forEach((n) => {
    const lv = tech[n.id] || 0; if (!lv || n.unlock) return;
    const list = n.effects || [{ field: n.field, total: n.total, kind: n.kind }];
    list.forEach((e) => {
      const inc = e.total * (lv / n.max);
      if (e.kind === "mult") multAcc[e.field] = (multAcc[e.field] || 0) + inc;
      else b[e.field] = (b[e.field] || 0) + inc;
    });
  }));
  Object.keys(multAcc).forEach((f) => b[f] *= (1 + multAcc[f]));
  return b;
}

// index.html:3790 production() — теперь считает через полноценный bonuses(p)
// вместо голых PROD_TABLE-чисел (тот же самый B, что течёт и в trainSpeed/
// build/heal у остальных функций этого файла). handicap (p.isBot) в общем
// мире не нужен — ботов здесь нет (см. syncRes выше).
function production(p) {
  const B = bonuses(p), out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let base = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { if (lv > 0) base += prodRate(lv); });
    let v = base * PROD_MULT[r];
    v *= 1 + B.prodAll;
    v *= 1 + (r === "food" ? B.prodFood : r === "wood" ? B.prodWood : r === "stone" ? B.prodStone : B.prodGold);
    v *= 1 + ((r === "food" || r === "wood") ? B.prodFW : B.prodSG);
    out[r] = v;
  });
  return out;
}

// marchBonus — bonuses(p).march (Фаза 6, настоящий подсчёт: раса/эпоха
// рас/дефолтный генерал/дерево исследований mil_march1/mil_march2), см.
// bonuses() ниже.
function marchSpeed(units, race, marchBonus = 1) {
  let s = 99;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      if ((units[t] && units[t][i]) > 0) s = Math.min(s, TROOP_SPEED[t] * troopSpeedMod(race, t));
    }
  });
  if (s > 90) s = 1;
  return s * MARCH_SPEED_SCALE * marchBonus;
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !user) return jsonResponse({ err: "Не авторизован" }, 401);

    let body = {};
    try { body = await req.json(); } catch (_) { /* noop */ }
    const defenderId = Number(body.defender_id);
    const reqUnits = body.units && typeof body.units === "object" ? body.units : {};
    if (!Number.isFinite(defenderId)) return jsonResponse({ err: "Не указан защитник" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: attRow, error: aErr } = await admin
      .from("players").select("*").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (aErr) return jsonResponse({ err: aErr.message }, 500);
    if (!attRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);
    if (defenderId === attRow.id) return jsonResponse({ err: "Нельзя атаковать самого себя" }, 400);

    const { data: defRow, error: dErr } = await admin
      .from("players").select("id,x,y,shield_until").eq("world_id", world.id).eq("id", defenderId).maybeSingle();
    if (dErr) return jsonResponse({ err: dErr.message }, 500);
    if (!defRow) return jsonResponse({ err: "Защитник не найден" }, 400);
    const nowSec = Date.now() / 1000;
    if (defRow.shield_until > nowSec) return jsonResponse({ err: "Город под щитом мира — атака невозможна" }, 400);

    const attP = attRow.state;
    // Самоисцеление легаси-записей — см. тот же комментарий в mp-train/mp-heal/mp-build.
    attP.race = attP.race || attRow.race;

    // Лимит отрядов в поле — marchSlots(hall), считаем текущие незавершённые
    // марши игрока. Фаза 8, кусочек 1: пул общий с mode:"gather" (новый
    // mp-gather) — то же "Отряды в поле" в клиенте, что и у похода; раньше,
    // до сбора ресурсов, тут был только "attack", отдельно считать сбор
    // было неоткуда.
    const hallLv = Array.isArray(attP.b.hall) ? Math.max(0, ...attP.b.hall) : attP.b.hall;
    const { count: busy, error: busyErr } = await admin
      .from("marches").select("id", { count: "exact", head: true })
      .eq("world_id", world.id).eq("player_id", attRow.id).in("mode", ["attack", "gather"]);
    if (busyErr) return jsonResponse({ err: busyErr.message }, 500);
    if ((busy || 0) >= marchSlots(hallLv)) return jsonResponse({ err: "Все отряды заняты" }, 400);

    // Собираем и проверяем отправляемую часть гарнизона: не больше, чем
    // реально есть дома, и хотя бы один боец.
    const sendUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
    let totalSend = 0;
    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) {
        const want = Math.max(0, Math.round(Number((reqUnits[t] && reqUnits[t][i]) || 0)));
        const have = (attP.troops[t] && attP.troops[t][i]) || 0;
        const n = Math.min(want, have);
        sendUnits[t][i] = n; totalSend += n;
      }
    });
    if (totalSend <= 0) return jsonResponse({ err: "Отправьте хотя бы одного воина" }, 400);

    // Дословно sendMarch из index.html:4646-4681 (без waterPath/portalShortcut
    // /generала/предупреждения защитника — см. заголовок файла и README).
    const dist = Math.hypot(defRow.x - attRow.x, defRow.y - attRow.y);
    const B = bonuses(attP);
    const spd = marchSpeed(sendUnits, attP.race, B.march);
    const travel = Math.max(20, (dist / spd) * 60);

    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) attP.troops[t][i] = Math.max(0, (attP.troops[t][i] || 0) - sendUnits[t][i]);
    });
    const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
    if (updA) return jsonResponse({ err: updA.message }, 500);

    const { data: march, error: mErr } = await admin.from("marches").insert({
      world_id: world.id, player_id: attRow.id, mode: "attack", state: "go",
      tx: defRow.x, ty: defRow.y, t0: nowSec, t1: nowSec + travel,
      units: sendUnits, data: { defender_id: defRow.id, dist, spd },
    }).select().single();
    if (mErr) return jsonResponse({ err: mErr.message }, 500);

    const { error: evErr } = await admin.from("events").insert({
      world_id: world.id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
      type: "march_arrive", data: { march_id: march.id },
    });
    if (evErr) return jsonResponse({ err: evErr.message }, 500);

    return jsonResponse({ ok: true, march_id: march.id, eta: travel });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
