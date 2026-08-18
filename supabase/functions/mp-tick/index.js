// =============================================================================
// mp-tick — Фаза 2: серверный тикер. Вызывается по расписанию из pg_cron
// (см. migrations/0002_phase2_tick.sql — cron.schedule + pg_net дергает эту
// функцию раз в минуту HTTP-запросом), а не браузером. Разбирает события,
// у которых fire_at уже наступил, ровно так же, как EV{...} в index.html
// разбирает W.events — только это происходит НЕЗАВИСИМО от того, открыт ли
// у кого-то браузер, что и было целью Фазы 2 ("сервер сам считает время").
//
// Умеет type:"train" (зеркало EV.train, index.html:4821-4826), type:"build"
// (зеркало EV.build, index.html:4814-4819, см. mp-build), type:
// "march_arrive"/"march_home" (зеркало EV.arrive->arriveMarch->battleCity
// и EV.home, см. mp-attack — марш с настоящим временем в пути, Фаза 4) и
// type:"heal" (зеркало EV.heal, index.html:4867-4873, см. mp-heal —
// лечение раненых в лазарете, Фаза 4, седьмой кусочек), type:
// "scout_arrive" (зеркало EV.scouted, index.html:4877-4893, см. mp-scout —
// разведка чужого города, Фаза 4, восьмой кусочек) и type:"research"
// (зеркало EV.research, index.html:4840-4844, см. mp-research — дерево
// исследований Академии, Фаза 5). Остальные типы событий (craft/gathered/
// ...) будут добавляться сюда по одному по мере переноса самих действий,
// каждый — отдельным case, по образцу ниже.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — Dashboard-редактор Edge
// Functions не подтягивает относительные импорты на общую папку, поэтому
// здесь код самодостаточен (копия, а не импорт). При деплое через Supabase
// CLI можно вернуть импорт как в репозитории.
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

const BATCH = 200;

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    // Лёгкая защита от постороннего вызова извне — pg_cron передаёт этот
    // секрет заголовком (см. миграцию 0002), обычный клиент его не знает.
    // Сама обработка идемпотентна и безопасна (события помечаются processed
    // сразу и не пересчитываются дважды), секрет — просто чтобы не грузить
    // функцию почём зря.
    const secret = Deno.env.get("MP_TICK_SECRET");
    if (secret && req.headers.get("x-tick-secret") !== secret) {
      return jsonResponse({ err: "forbidden" }, 403);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: due, error: dueErr } = await admin
      .from("events").select("*")
      .eq("processed", false)
      .lte("fire_at", new Date().toISOString())
      .order("fire_at", { ascending: true })
      .limit(BATCH);
    if (dueErr) return jsonResponse({ err: dueErr.message }, 500);
    if (!due || !due.length) return jsonResponse({ ok: true, processed: 0 });

    let processed = 0;
    const errors = [];
    for (const ev of due) {
      try {
        if (ev.type === "train") await applyTrain(admin, ev);
        else if (ev.type === "build") await applyBuild(admin, ev);
        else if (ev.type === "march_arrive") await applyMarchArrive(admin, ev);
        else if (ev.type === "march_home") await applyMarchHome(admin, ev);
        else if (ev.type === "heal") await applyHeal(admin, ev);
        else if (ev.type === "scout_arrive") await applyScoutArrive(admin, ev);
        else if (ev.type === "research") await applyResearch(admin, ev);
        else if (ev.type === "gathered") await applyGathered(admin, ev);
        else if (ev.type === "node_respawn") await applyNodeRespawn(admin, ev);
        else if (ev.type === "camp_respawn") await applyCampRespawn(admin, ev);
        // else: неизвестный/ещё не перенесённый тип — оставляем как есть,
        // не помечаем processed, чтобы не потерять событие молча; заберётся
        // следующим тиком после того, как для него появится case.
        else { continue; }
        await admin.from("events").update({ processed: true }).eq("id", ev.id);
        processed++;
      } catch (e) {
        errors.push({ id: ev.id, err: String(e && e.message || e) });
      }
    }
    return jsonResponse({ ok: true, processed, total: due.length, errors });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});

// Зеркало EV.train(d) из index.html:4821-4826.
async function applyTrain(admin, ev) {
  const playerId = ev.data && ev.data.player_id;
  const type = ev.data && ev.data.type;
  if (playerId == null || !type) return;
  const { data: row, error } = await admin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw error;
  if (!row) return; // игрока удалили — событие просто гасится, как и в клиенте (p не найден -> return)
  const p = row.state;
  const T = p.train && p.train[type];
  if (!T) return; // уже разобрано/отменено
  p.troops[T.type][T.tier] = (p.troops[T.type][T.tier] || 0) + T.n;
  p.train[type] = null;
  const { error: updErr } = await admin
    .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (updErr) throw updErr;
}

// Зеркало EV.heal(d) из index.html:4867-4873 — Фаза 4, седьмой кусочек.
// n клампится по фактическому p.wounded на МОМЕНТ ЗАВЕРШЕНИЯ (не по тому,
// что было на момент старта лечения) — тот же принцип "текущее состояние,
// не снимок", что и у march_arrive; на практике p.wounded[type][tier] не
// может УМЕНЬШИТЬСЯ между стартом и завершением (кроме этого же лечения —
// а p.heal гарантированно один на игрока), но защититься не вредно.
async function applyHeal(admin, ev) {
  const playerId = ev.data && ev.data.player_id;
  if (playerId == null) return;
  const { data: row, error } = await admin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw error;
  if (!row) return;
  const p = row.state;
  const H = p.heal;
  if (!H) return; // уже разобрано/отменено
  if (!p.wounded) p.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  if (!p.wounded[H.type]) p.wounded[H.type] = {};
  if (!p.troops[H.type]) p.troops[H.type] = {};
  const n = Math.min(H.n, p.wounded[H.type][H.tier] || 0);
  p.wounded[H.type][H.tier] = (p.wounded[H.type][H.tier] || 0) - n;
  p.troops[H.type][H.tier] = (p.troops[H.type][H.tier] || 0) + n;
  p.heal = null;
  const { error: updErr } = await admin
    .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (updErr) throw updErr;
}

// Зеркало EV.research(d) из index.html:4840-4844 — Фаза 5, Академия. Просто
// переносит уровень из p.rsch в p.tech и освобождает очередь — сами эффекты
// исследования (n.field/n.effects через bonuses()) сюда не входят, см.
// заголовок mp-research.
async function applyResearch(admin, ev) {
  const playerId = ev.data && ev.data.player_id;
  if (playerId == null) return;
  const { data: row, error } = await admin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw error;
  if (!row) return;
  const p = row.state;
  const R = p.rsch;
  if (!R) return; // уже разобрано/отменено
  if (!p.tech) p.tech = {};
  p.tech[R.id] = R.lv;
  p.rsch = null;
  const { error: updErr } = await admin
    .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (updErr) throw updErr;
}

// index.html RES — нужен здесь только для сборки snap.res (se>=1), больше
// нигде в mp-tick не используется, поэтому не в общих const'ах выше.
const SCOUT_RES = ["food", "wood", "stone", "gold"];
// Зеркало EV.scouted(d)/scoutSnapshot(p,q) из index.html:4877-4893/5237-5282
// — Фаза 4, восьмой кусочек (разведка чужого города, см. mp-scout), глубина
// донесения подключена в Фазе 6 (продолжение): se=p.tech.mil_scout2 (0-5) —
// ЭТО НЕ bonuses(p).scoutBonus (тот процент, от mil_scout1+mil_scout2
// вместе, — декоративное поле, реально нигде в клиенте не читается для
// глубины донесения; глубину задаёт СЫРОЙ уровень mil_scout2, отдельно от
// bonuses()). Честно НЕ перенесено: wallHp/wallMax (se>=2) — сама механика
// прочности стены как отдельного, регенерирующего пула HP ещё не перенесена
// на сервер вообще (в общем мире есть только УРОВЕНЬ стены, p.b.wall);
// genLv/genTal/gearPower/gear (se>=2/5) — генералы/снаряжение не перенесены,
// честно null/0/[] (то же самое случилось бы и в одиночной игре у игрока
// без выбранного генерала: genLv тоже null). Лазутчик не возвращается домой
// — марш удаляется сразу после снятия показаний, независимо от исхода.
async function applyScoutArrive(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  if (!m || m.state !== "go") return; // уже разобрано/отменено
  await admin.from("marches").delete().eq("id", m.id);

  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) return; // хозяина нет — некому писать донесение

  const defenderId = m.data && m.data.defender_id;
  const { data: defRow, error: dErr } = defenderId == null
    ? { data: null, error: null }
    : await admin.from("players").select("*").eq("id", defenderId).maybeSingle();
  if (dErr) throw dErr;
  if (!defRow) {
    // Цель пропала между отправкой и прибытием — зеркало "Лазутчик не нашёл
    // города на месте" (index.html:4883), только письмо всё равно кладём
    // (в клиенте это просто logg() без почты — но там игрок сам за столом,
    // а здесь письмо единственный канал узнать об исходе вообще).
    const { error: mailErr } = await admin.from("mail").insert({
      world_id: m.world_id, player_id: attRow.id, kind: "scout", data: { found: false },
    });
    if (mailErr) throw mailErr;
    return;
  }

  const attP = attRow.state || {};
  const se = (attP.tech && attP.tech.mil_scout2) || 0;
  const defP = defRow.state;
  const hallLv = Array.isArray(defP.b && defP.b.hall) ? Math.max(0, ...defP.b.hall) : ((defP.b && defP.b.hall) || 0);
  const total = unitsTotal(defP.troops || {});
  const nowSec = Date.now() / 1000;

  const data = {
    found: true, opponent_id: defRow.id, opponent_nick: defRow.nick,
    hall: hallLv, shielded: defRow.shield_until > nowSec, total, se,
  };
  const bAt = (bk) => Array.isArray(defP.b && defP.b[bk]) ? Math.max(0, ...defP.b[bk]) : ((defP.b && defP.b[bk]) || 0);
  if (se >= 1) {
    data.res = {};
    SCOUT_RES.forEach((r) => { data.res[r] = (defP.res && defP.res[r]) || 0; });
  }
  if (se >= 2) {
    data.wall = bAt("wall");
    data.genLv = null; // генералы не перенесены — как и в одиночной игре у игрока без выбранного генерала
  }
  if (se >= 3) {
    data.academy = bAt("academy");
    data.byType = TKEYS.map((t) => ({ t, n: [1, 2, 3, 4, 5].reduce((s, i) => s + ((defP.troops[t] && defP.troops[t][i]) || 0), 0) })).filter((x) => x.n > 0);
  }
  if (se >= 4) {
    data.garrison = bAt("garrison");
    data.byTier = TKEYS.map((t) => {
      const parts = [];
      for (let i = 1; i <= 5; i++) { const n = (defP.troops[t] && defP.troops[t][i]) || 0; if (n) parts.push({ i, n }); }
      return { t, parts };
    }).filter((x) => x.parts.length);
  }
  if (se >= 5) {
    data.genTal = null; data.gearPower = 0; data.gear = [];
    let wounded = 0;
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) wounded += (defP.wounded && defP.wounded[t] && defP.wounded[t][i]) || 0; });
    data.wounded = wounded;
  }

  const { error: mailErr } = await admin.from("mail").insert({
    world_id: m.world_id, player_id: attRow.id, kind: "scout", data,
  });
  if (mailErr) throw mailErr;
}

// Зеркало EV.build(d) из index.html:4814-4819. plot!=null у hospital
// (единственное multi-здание среди перенесённых — см. mp-build), null у
// остальных 8 (barracks/range/stable/siege/hall/wall/store/academy).
async function applyBuild(admin, ev) {
  const playerId = ev.data && ev.data.player_id;
  const slot = ev.data && ev.data.slot;
  if (playerId == null || slot == null) return;
  const { data: row, error } = await admin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw error;
  if (!row) return;
  const p = row.state;
  const q = p.queues[slot];
  if (!q) return; // уже разобрано/отменено
  if (q.plot != null) {
    // Самоисцеление той же старой формы, что и в mp-build (см. комментарий
    // там) — на случай, если запись когда-то попала в очередь до починки.
    if (!Array.isArray(p.b[q.b])) p.b[q.b] = [p.b[q.b] || 0, 0, 0, 0];
    p.b[q.b][q.plot] = q.lv;
  } else {
    p.b[q.b] = q.lv;
  }
  p.queues[slot] = null;
  const { error: updErr } = await admin
    .from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
  if (updErr) throw updErr;
}

// =============================================================================
// PvP-бой (единственный обмен ударами, НЕ resolveBattle() — см. подробный
// разбор в _shared/rules.js и в заголовке mp-attack) — буквальная копия
// оттуда, самодостаточная копия (см. пояснение о Dashboard-редакторе выше).
const TKEYS = ["inf", "arc", "cav", "sie"];
const RES = ["food", "wood", "stone", "gold"]; // Фаза 8, кусочек 1 — applyMarchHome зачисляет добычу сбора
// Фаза 8, кусочек 3 — респаун истощённой точки/разгромленного лагеря.
// Те же задержки, что CFG.NODE_RESPAWN/CFG.RESPAWN_CAMP в index.html:
// 1717-1718 (45мин/1ч). Новое место — небольшое смещение от старого
// (не полноценный findFreeCellInChunk с перебором чанка, как в index.html
// — тот же честный уровень упрощения, что и у seedNodesAround/
// seedCampsAround в mp-join): upsert с ignoreDuplicates молча пропускает
// редкую коллизию координат, следующий respawn всё равно рано или поздно
// найдёт свободное место где-то ещё.
const NODE_RESPAWN_SEC = 3600, CAMP_RESPAWN_SEC = 2700;
const RESPAWN_MIN_R = 3, RESPAWN_MAX_R = 12;
function respawnOffset(ox, oy) {
  const ang = Math.random() * Math.PI * 2;
  const r = RESPAWN_MIN_R + Math.random() * (RESPAWN_MAX_R - RESPAWN_MIN_R);
  return { x: Math.round(ox + Math.cos(ang) * r), y: Math.round(oy + Math.sin(ang) * r) };
}
async function applyNodeRespawn(admin, ev) {
  const ox = ev.data && ev.data.x, oy = ev.data && ev.data.y;
  if (ox == null || oy == null) return;
  const { x, y } = respawnOffset(ox, oy);
  const lv = 1 + Math.floor(Math.random() * 3); // тот же диапазон, что seedNodesAround в mp-join
  const amount = Math.round(6000 * Math.pow(2.6, lv - 1));
  const res = RES[Math.floor(Math.random() * RES.length)];
  const { error } = await admin.from("map_cells").upsert(
    { world_id: ev.world_id, x, y, t: "node", data: { res, lv, amount, max: amount } },
    { onConflict: "world_id,x,y", ignoreDuplicates: true },
  );
  if (error) throw error;
}
async function applyCampRespawn(admin, ev) {
  const ox = ev.data && ev.data.x, oy = ev.data && ev.data.y;
  if (ox == null || oy == null) return;
  const { x, y } = respawnOffset(ox, oy);
  const lv = 1 + Math.floor(Math.random() * 5); // тот же диапазон, что seedCampsAround в mp-join
  const { error } = await admin.from("map_cells").upsert(
    { world_id: ev.world_id, x, y, t: "camp", data: { lv } },
    { onConflict: "world_id,x,y", ignoreDuplicates: true },
  );
  if (error) throw error;
}
const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20];
const TROOP_TYPES = {
  inf: { atk: 34, def: 46, hp: 44, speed: 1.00, magicAtk: 8, magicDef: 18, beats: "arc", losesTo: "cav" },
  arc: { atk: 50, def: 30, hp: 36, speed: 1.10, magicAtk: 20, magicDef: 8, beats: "cav", losesTo: "inf" },
  cav: { atk: 46, def: 34, hp: 40, speed: 1.70, magicAtk: 12, magicDef: 12, beats: "inf", losesTo: "arc" },
  sie: { atk: 24, def: 20, hp: 60, speed: 0.60, magicAtk: 26, magicDef: 6, beats: null, losesTo: null },
};
const RACE_TROOP_MOD = {
  dwarf: { inf: { atk: 1.05, def: 1.05, hp: 1.05 } },
  human: { cav: { atk: 1.05, def: 1.05, hp: 1.05 } },
  elf: { arc: { atk: 1.05, def: 1.05, hp: 1.05 } },
  undead: { sie: { atk: 2.20 * 1.05, def: 1.05, hp: 1.05, speed: 1.20 } },
};
const troopMod = (race, t, stat) => (RACE_TROOP_MOD[race] && RACE_TROOP_MOD[race][t] && RACE_TROOP_MOD[race][t][stat]) || 1;

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
// index.html:1305 WALL_TABLE — только колонка hp нужна для wallDefBonus.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const WALL_TABLE = [
  { hp: 15000 }, { hp: 15500 }, { hp: 16000 }, { hp: 16500 }, { hp: 17000 },
  { hp: 17500 }, { hp: 18250 }, { hp: 19000 }, { hp: 19750 }, { hp: 20500 },
  { hp: 21250 }, { hp: 22000 }, { hp: 22750 }, { hp: 23500 }, { hp: 24250 },
  { hp: 25000 }, { hp: 26000 }, { hp: 27000 }, { hp: 28000 }, { hp: 29000 },
  { hp: 30000 }, { hp: 31000 }, { hp: 32000 }, { hp: 33000 }, { hp: 40000 },
];
// index.html:2895 tableAt / index.html:2904 wallDefBonus — см. подробный
// комментарий в _shared/rules.js (буквальная копия оттуда).
function tableAt(tbl, lv, field) {
  const i = clamp(lv, 1, tbl.length) - 1;
  const lo = Math.floor(i), hi = Math.min(tbl.length - 1, lo + 1), f = i - lo;
  const a = field ? tbl[lo][field] : tbl[lo], b = field ? tbl[hi][field] : tbl[hi];
  return a + (b - a) * f;
}
function wallDefBonus(lv) {
  if (lv <= 0) return 0;
  const hp = tableAt(WALL_TABLE, lv, "hp"), hp1 = WALL_TABLE[0].hp, hpMax = WALL_TABLE[WALL_TABLE.length - 1].hp;
  return 0.125 * (hp - hp1) / (hpMax - hp1);
}
// index.html:1335 WATCH_TABLE — только колонка atk нужна для garrisonVolley.
const tblRow = (tbl, lv) => tbl[clamp(Math.round(lv), 1, tbl.length) - 1];
const WATCH_TABLE = [
  { atk: 1000 }, { atk: 1500 }, { atk: 2000 }, { atk: 3000 }, { atk: 4000 },
  { atk: 5000 }, { atk: 6000 }, { atk: 16000 }, { atk: 20000 }, { atk: 24000 },
  { atk: 28000 }, { atk: 32000 }, { atk: 36000 }, { atk: 40000 }, { atk: 66000 },
  { atk: 72000 }, { atk: 78000 }, { atk: 84000 }, { atk: 90000 }, { atk: 96000 },
  { atk: 136000 }, { atk: 144000 }, { atk: 152000 }, { atk: 160000 }, { atk: 500000 },
];
// index.html:4057 garrisonVolley — см. подробный комментарий в
// _shared/rules.js (буквальная копия оттуда).
function garrisonVolley(defGarrisonLv, attS) {
  if (defGarrisonLv <= 0) return null;
  const dmg = tblRow(WATCH_TABLE, defGarrisonLv).atk;
  const out = {};
  TKEYS.forEach((t) => {
    if (attS[t].n <= 0) { out[t] = 0; return; }
    const share = dmg * (attS[t].hp / Math.max(1, attS.totalHp));
    const mitig = 1 + (attS[t].def / Math.max(1, attS[t].n)) / 70;
    out[t] = share / mitig;
  });
  return out;
}
const COUNTER_UP = 1.5, COUNTER_DOWN = 0.7;
function counterMult(from, to) {
  const T = TROOP_TYPES[from];
  if (T.beats === to) return COUNTER_UP;
  if (T.losesTo === to) return COUNTER_DOWN;
  return 1;
}
const SIDE_TYPE_ATK = { inf: "atkInf", arc: "atkArc", cav: "atkCav", sie: "atkSie" };
const SIDE_TYPE_DEF = { inf: "defInf", arc: "defArc", cav: "defCav", sie: "defSie" };
const SIDE_TYPE_MATK = { inf: "matkInf", arc: "matkArc", cav: "matkCav", sie: "matkSie" };
const SIDE_TYPE_MDEF = { inf: "mdefInf", arc: "mdefArc", cav: "mdefCav", sie: "mdefSie" };
// index.html:3974 sideStats — Фаза 6: принимает готовый B (bonuses(p) или
// bonuses(p,true) для защитника), см. подробный комментарий в _shared/rules.js.
function sideStats(units, race, B) {
  const s = {};
  TKEYS.forEach((t) => {
    let atk = 0, def = 0, matk = 0, mdef = 0, hp = 0, n = 0;
    const atkMod = 1 + (B[SIDE_TYPE_ATK[t]] || 0), defMod = 1 + (B[SIDE_TYPE_DEF[t]] || 0);
    const matkMod = 1 + (B[SIDE_TYPE_MATK[t]] || 0), mdefMod = 1 + (B[SIDE_TYPE_MDEF[t]] || 0);
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      if (!c) continue;
      const w = TIER_MULT[i - 1];
      let a = TROOP_TYPES[t].atk * w * troopMod(race, t, "atk") * atkMod;
      if (t === "arc") a *= 1 + (B.archer || 0);
      const d = TROOP_TYPES[t].def * w * troopMod(race, t, "def") * defMod;
      const ma = TROOP_TYPES[t].magicAtk * w * troopMod(race, t, "atk") * matkMod;
      const md = TROOP_TYPES[t].magicDef * w * troopMod(race, t, "def") * mdefMod;
      atk += c * a * (1 + B.atk); def += c * d * (1 + B.def);
      matk += c * ma * (1 + B.matk); mdef += c * md * (1 + B.mdef);
      hp += c * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp") * (1 + B.hp);
      n += c;
    }
    s[t] = { atk, def, matk, mdef, hp, n };
  });
  s.totalHp = TKEYS.reduce((a, t) => a + s[t].hp, 0);
  s.totalN = TKEYS.reduce((a, t) => a + s[t].n, 0);
  return s;
}
// defWallLv — уровень стены защитника; wallBonus — bonuses(p).wallBonus
// (Фаза 6, было захардкожено 0), см. подробный комментарий в _shared/rules.js.
function dmgTo(attS, defS, defWallLv = 0, wallBonus = 0) {
  const defWall = 1 + wallDefBonus(defWallLv) * (1 + wallBonus);
  const out = {};
  TKEYS.forEach((dt) => {
    if (defS[dt].n <= 0) { out[dt] = 0; return; }
    let d = 0, dm = 0;
    TKEYS.forEach((at) => {
      if (attS[at].n <= 0) return;
      const share = defS[dt].hp / Math.max(1, defS.totalHp);
      d += attS[at].atk * counterMult(at, dt) * share;
      dm += attS[at].matk * counterMult(at, dt) * share;
    });
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70 * defWall;
    const mitigM = 1 + (defS[dt].mdef / Math.max(1, defS[dt].n)) / 70 * defWall;
    out[dt] = d / mitig + dm / mitigM;
  });
  return out;
}
// hpBonus — сырой B.hp, тот же множитель, что sideStats уже применила к
// totalHp (см. _shared/rules.js) — держит hpTotal (знаменатель доли потерь)
// согласованным с тем пулом HP, из которого dmgTo() реально считал урон.
function applyLosses(units, dmgByType, race, hpBonus = 0) {
  const lost = { inf: {}, arc: {}, cav: {}, sie: {} };
  let hpLost = 0;
  TKEYS.forEach((t) => {
    let hpTotal = 0;
    for (let i = 1; i <= 5; i++) hpTotal += ((units[t] && units[t][i]) || 0) * TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp") * (1 + hpBonus);
    if (hpTotal <= 0 || !dmgByType[t]) { for (let i = 1; i <= 5; i++) lost[t][i] = 0; return; }
    const dmg = Math.min(dmgByType[t], hpTotal);
    hpLost += dmg;
    const frac = dmg / hpTotal;
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      lost[t][i] = Math.min(c, Math.round(c * frac));
    }
  });
  return { units: lost, hpLost };
}
// Фаза 6: attP/defP теперь полные объекты игрока (race+b+gen+tech), не
// голые строки расы — нужны для bonuses(attP)/bonuses(defP,true) (defP
// считается С defending=true — 5-я эпоха, defMods). См. подробный
// комментарий в _shared/rules.js.
function resolvePvp(attUnits, attP, defUnits, defP, defWallLv = 0, defGarrisonLv = 0) {
  const attB = bonuses(attP), defB = bonuses(defP, true);
  const attS = sideStats(attUnits, attP.race, attB), defS = sideStats(defUnits, defP.race, defB);
  const dmgToDef = dmgTo(attS, defS, defWallLv, defB.wallBonus), dmgToAtt = dmgTo(defS, attS);
  const openG = garrisonVolley(defGarrisonLv, attS);
  if (openG) TKEYS.forEach((t) => { dmgToAtt[t] = (dmgToAtt[t] || 0) + (openG[t] || 0); });
  const defLoss = applyLosses(defUnits, dmgToDef, defP.race, defB.hp);
  const attLoss = applyLosses(attUnits, dmgToAtt, attP.race, attB.hp);
  const defHpLeft = Math.max(0, defS.totalHp - defLoss.hpLost);
  const attHpLeft = Math.max(0, attS.totalHp - attLoss.hpLost);
  const winner = defHpLeft <= 0 && attHpLeft > 0 ? "att" : attHpLeft <= 0 && defHpLeft > 0 ? "def" : (attHpLeft > defHpLeft ? "att" : "def");
  return { attLoss: attLoss.units, defLoss: defLoss.units, attHpLeft, defHpLeft, winner };
}
// index.html:2867 HOSPITAL_CAP_TABLE / hospitalCap / totalHospitalCap —
// сколько раненых вмещает лазарет (сумма по всем 4 построенным участкам,
// см. Фаза 5, пятый кусочек).
const HOSPITAL_CAP_TABLE = [
  7500, 8250, 9000, 10000, 11000, 12250, 13500, 15000, 16500,
  18250, 20000, 22000, 24000, 26500, 29000, 32000, 35000, 38500, 42000, 46000, 50000,
  54500, 59500, 65000, 75000,
];
const hospitalCap = (lv) => (lv <= 0 ? 0 : tblRow(HOSPITAL_CAP_TABLE, lv));
function totalHospitalCap(p) {
  const plots = p.b && p.b.hospital;
  return (Array.isArray(plots) ? plots : [plots || 0]).reduce((s, lv) => s + hospitalCap(lv), 0);
}
// index.html:4340 SLIGHT_WOUND_FRAC / index.html:4351 hospitalSplit — часть
// потерь (loss, уже вычтенных из активного войска резолвPvp) отделывается
// лёгким испугом и НЕМЕДЛЕННО возвращается в строй (slight, 12%, лазарет не
// нужен), часть едет в лазарет (hurt, копится в p.wounded — само лечение,
// healUnit, ещё не перенесено на сервер, честная заглушка, раненые там и
// остаются), остаток, что не влез в лазарет, гибнет насовсем (dead).
// mode:"siege-attack" (штурмующий чужой город) — гибель насмерть без
// исключений, той же логике, что index.html:4352-4359; в общем мире это
// всегда атакующий марш — у защитника всегда обычный режим (лазарет свой,
// дома). bonuses(p).hosp/mercy — Фаза 6, настоящий подсчёт (без
// defending=true, дословно как в index.html:4360 — hospitalSplit не только
// для обороны города).
const SLIGHT_WOUND_FRAC = 0.12;
function hospitalSplit(p, loss, mode) {
  if (mode === "siege-attack") {
    const deadUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
    let dead = 0;
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) { const n = (loss[t] && loss[t][i]) || 0; deadUnits[t][i] = n; dead += n; } });
    return { dead, hurt: 0, slight: 0, slightUnits: { inf: {}, arc: {}, cav: {}, sie: {} }, deadUnits, hurtUnits: { inf: {}, arc: {}, cav: {}, sie: {} } };
  }
  const B = bonuses(p);
  const cap = Math.round(totalHospitalCap(p) * (1 + B.hosp + B.mercy));
  let inHosp = 0;
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) inHosp += (p.wounded && p.wounded[t] && p.wounded[t][i]) || 0; });
  let dead = 0, hurt = 0, slight = 0;
  const slightUnits = { inf: {}, arc: {}, cav: {}, sie: {} }, deadUnits = { inf: {}, arc: {}, cav: {}, sie: {} }, hurtUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      let n = (loss[t] && loss[t][i]) || 0;
      slightUnits[t][i] = 0; hurtUnits[t][i] = 0; deadUnits[t][i] = 0;
      if (!n) continue;
      const sl = Math.round(n * SLIGHT_WOUND_FRAC);
      if (sl > 0) { slightUnits[t][i] = sl; slight += sl; n -= sl; }
      const room = Math.max(0, cap - inHosp);
      const w = Math.min(n, room);
      inHosp += w;
      hurtUnits[t][i] = w; hurt += w;
      const d = n - w;
      deadUnits[t][i] = d; dead += d;
    }
  });
  return { dead, hurt, slight, slightUnits, deadUnits, hurtUnits };
}
function unitsSub(units, loss) {
  const out = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) out[t][i] = Math.max(0, ((units[t] && units[t][i]) || 0) - ((loss[t] && loss[t][i]) || 0)); });
  return out;
}
function unitsAdd(units, extra) {
  const out = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) out[t][i] = ((units[t] && units[t][i]) || 0) + ((extra[t] && extra[t][i]) || 0); });
  return out;
}
function unitsTotal(units) {
  return TKEYS.reduce((s, t) => s + [1, 2, 3, 4, 5].reduce((s2, i) => s2 + ((units[t] && units[t][i]) || 0), 0), 0);
}

// Фаза 8, кусочек 2 — лагеря варваров. BANDIT_TROOPS/banditTier/banditArmy
// дословно из index.html:3187-3195 — тот же гарнизон, что и в одиночной
// игре, для того же уровня лагеря. BANDIT_XP не перенесён: в общем мире
// нет ни одного источника опыта генерала вообще (Фаза 7 — "5 очков висят
// неистраченными"), начислять его неоткуда и незачем, честный пробел, а
// не забывчивость.
const BANDIT_TROOPS = [20000,23000,26000,29000,32000,35000,38000,42000,46000,50000,55000,60000,66000,73000,80000,88000,96000,105000,115000,125000,135000,145000,157000,170000,185000,200000,215000,230000,245000,260000];
const banditTier = (lv) => (lv <= 5 ? 1 : lv <= 12 ? 2 : lv <= 20 ? 3 : 4);
function banditArmy(lv) {
  const u = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) u[t][i] = 0; });
  const i = Math.max(1, Math.min(30, Math.round(lv)));
  const tier = banditTier(i), n = BANDIT_TROOPS[i - 1];
  u.inf[tier] = Math.round(n * 0.45); u.arc[tier] = Math.round(n * 0.30); u.cav[tier] = Math.round(n * 0.25);
  return u;
}
// Разбойники не имеют ни расы, ни бонусов вообще — тот же явный ноль, что
// D.B={atk:0,def:0,hp:0,matk:0,mdef:0,archer:0,raise:0} в index.html:5139
// (arriveMarch, ветка camp/fort). Явные нули, не пустой объект — sideStats
// делает "(1+B.atk)" без страховки ||0, пустой объект дал бы NaN.
const BANDIT_B = { atk: 0, def: 0, hp: 0, matk: 0, mdef: 0, archer: 0 };
// Зеркало ветки camp/fort в arriveMarch (index.html:5133-5158) — но не
// resolveBattle() целиком (раундовый бой с погодой и т.д., см. заголовок
// resolvePvp выше), а тот же однообменный resolvePvp, что и у PvP —
// честная общая упрощённая боевая модель общего мира, не два разных стиля
// боя под одной крышей.
function resolveBanditRaid(attUnits, attP, campLv) {
  const attB = bonuses(attP);
  const bandUnits = banditArmy(campLv);
  const attS = sideStats(attUnits, attP.race, attB), bandS = sideStats(bandUnits, null, BANDIT_B);
  const dmgToBand = dmgTo(attS, bandS), dmgToAtt = dmgTo(bandS, attS); // лагерь без стены/башни — defWallLv/wallBonus по умолчанию 0
  const bandLoss = applyLosses(bandUnits, dmgToBand, null, 0);
  const attLoss = applyLosses(attUnits, dmgToAtt, attP.race, attB.hp);
  const bandHpLeft = Math.max(0, bandS.totalHp - bandLoss.hpLost);
  const attHpLeft = Math.max(0, attS.totalHp - attLoss.hpLost);
  const winner = bandHpLeft <= 0 && attHpLeft > 0 ? "att" : attHpLeft <= 0 && bandHpLeft > 0 ? "band" : (attHpLeft > bandHpLeft ? "att" : "band");
  return { attLoss: attLoss.units, winner };
}
// index.html:5148-5150 — та же добыча с разгромленного лагеря, что и в
// одиночной игре (книги опыта генерала — bookDrop — не перенесены по той
// же причине, что и BANDIT_XP выше).
function banditLoot(campLv) {
  const base = Math.round(1800 * Math.pow(1.28, campLv - 1));
  const loot = {};
  RES.forEach((r) => { loot[r] = Math.round(base * (r === "gold" ? 0.25 : r === "stone" ? 0.6 : 1)); });
  return loot;
}

// Зеркало arriveMarch->battleCity (index.html:5018/5363) для mode:"attack" —
// бой при подходе, затем зеркало recallMarch (index.html:4770) — обратная
// дорога с выжившими. gather/camp/fort/scout — не перенесены, mp-attack
// заводит только mode:"attack".
async function applyMarchArrive(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  if (!m || m.state !== "go") return; // уже разобрано/отменено

  // Фаза 8, кусочек 1 — марш на сбор ресурсов: отряд дошёл до точки, но
  // это не бой (нет defender_id) — начинается отдельный отсчёт сбора,
  // см. applyGatherStart/applyGathered ниже. Ветка целиком отдельная от
  // боевой логики (которая ниже подряд читает defenderId/defRow) — иначе
  // gather-марш прошёл бы через неё как "бой без защитника" и вернулся бы
  // домой пустым, ничего не собрав.
  if (m.mode === "gather") { await applyGatherStart(admin, m); return; }
  // Фаза 8, кусочек 2 — поход на лагерь варваров: бой с готовым уровнем
  // лагеря (m.data.camp_lv, снят на отправке в mp-raid), не с игроком —
  // отдельная функция ниже, та же причина отдельной ветки, что у gather.
  if (m.mode === "raid") { await applyRaidArrive(admin, m); return; }

  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; } // хозяина нет — некому возвращать

  const defenderId = m.data && m.data.defender_id;
  const { data: defRow, error: dErr } = defenderId == null
    ? { data: null, error: null }
    : await admin.from("players").select("*").eq("id", defenderId).maybeSingle();
  if (dErr) throw dErr;

  const nowSec = Date.now() / 1000;
  let survivors = m.units;
  // Цель пропала или встала под щит уже после отправки марша — бой не
  // случается, отряд просто разворачивается (как recallMarch без боя).
  if (defRow && !(defRow.shield_until > nowSec)) {
    const attP = attRow.state, defP = defRow.state;
    // Самоисцеление легаси-записей — см. тот же комментарий в mp-attack/mp-train.
    attP.race = attP.race || attRow.race;
    defP.race = defP.race || defRow.race;
    const defWallLv = (defP.b && typeof defP.b.wall === "number") ? defP.b.wall : 0;
    const defGarrisonLv = (defP.b && typeof defP.b.garrison === "number") ? defP.b.garrison : 0;
    const result = resolvePvp(m.units, attP, defP.troops, defP, defWallLv, defGarrisonLv);
    defP.troops = unitsSub(defP.troops, result.defLoss);
    // Фаза 4, шестой кусочек: лазарет защитника (index.html:4351/4411-4423)
    // — часть потерь не гибнет насмерть. Слегка раненые (12%) немедленно
    // возвращаются в строй, тяжелораненые (в пределах вместимости лазарета)
    // едут в p.wounded, и только сверх вместимости гибнут по-настоящему.
    // Атакующий (mode:"siege-attack" по смыслу — марш к чужому городу) такой
    // защиты не имеет, теряет войска насмерть целиком, как и раньше.
    if (!defP.wounded) defP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
    TKEYS.forEach((t) => { if (!defP.wounded[t]) defP.wounded[t] = {}; });
    const hs = hospitalSplit(defP, result.defLoss, "hospital");
    defP.troops = unitsAdd(defP.troops, hs.slightUnits);
    defP.wounded = unitsAdd(defP.wounded, hs.hurtUnits);
    survivors = unitsSub(m.units, result.attLoss);

    const { error: updD } = await admin.from("players").update({ state: defP, updated_at: new Date().toISOString() }).eq("id", defRow.id);
    if (updD) throw updD;

    const summary = {
      winner: result.winner, sent: m.units, attLoss: result.attLoss, defLoss: result.defLoss,
      attHpLeft: Math.round(result.attHpLeft), defHpLeft: Math.round(result.defHpLeft),
      defDead: hs.dead, defHurt: hs.hurt, defSlight: hs.slight,
    };
    const mailRows = [
      { world_id: m.world_id, player_id: attRow.id, kind: "battle", data: { role: "attacker", opponent_id: defRow.id, opponent_nick: defRow.nick, ...summary } },
      { world_id: m.world_id, player_id: defRow.id, kind: "battle", data: { role: "defender", opponent_id: attRow.id, opponent_nick: attRow.nick, ...summary } },
    ];
    const { error: mailErr } = await admin.from("mail").insert(mailRows);
    if (mailErr) throw mailErr;
  }

  // Обратная дорога — зеркало recallMarch: те же расстояние/скорость, что
  // и туда (dist/spd сохранены в m.data при отправке — тот же путь назад),
  // минимум 15с вместо 20с (index.html:4775 — recallMarch считает мягче
  // sendMarch, тот же порог тут).
  if (unitsTotal(survivors) <= 0) { await admin.from("marches").delete().eq("id", m.id); return; }
  const dist = (m.data && m.data.dist) || 0, spd = (m.data && m.data.spd) || 1;
  const travelBack = Math.max(15, (dist / spd) * 60);
  const { error: updM } = await admin.from("marches")
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack, units: survivors }).eq("id", m.id);
  if (updM) throw updM;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "march_home", data: { march_id: m.id },
  });
  if (evErr) throw evErr;
}

// Зеркало EV.home (index.html:4947) — выжившие возвращаются в домашний
// гарнизон, марш снимается с карты.
async function applyMarchHome(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  if (!m || m.state !== "back") return;

  const { data: row, error } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (error) throw error;
  if (row) {
    const p = row.state;
    p.troops = unitsAdd(p.troops, m.units);
    // Фаза 8, кусочек 1 — зеркало gain(p,m.carry) из EV.home (index.html:
    // 4959-4964). Только gather-марши несут m.data.carry (см. applyGathered
    // ниже) — у атакующих маршей этого поля никогда не было и не будет,
    // для них ничего не меняется.
    if (m.data && m.data.carry) {
      RES.forEach((r) => { if (m.data.carry[r]) p.res[r] = (p.res[r] || 0) + m.data.carry[r]; });
    }
    const { error: updErr } = await admin.from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) throw updErr;
  }
  await admin.from("marches").delete().eq("id", m.id);
}

// Фаза 8, кусочек 1 — отряд дошёл до точки сбора: начинается отдельный
// отсчёт сбора (gather_secs посчитан заранее в mp-gather, на отправке —
// зависит от бонусов игрока на тот момент, тот же принцип "снимок при
// отправке", что и у dist/spd для дороги). Зеркало перехода
// m.state="gather" в arriveMarch (index.html:5030-5031).
async function applyGatherStart(admin, m) {
  const nowSec = Date.now() / 1000;
  const gatherSecs = Math.max(0, (m.data && m.data.gather_secs) || 0);
  const { error: updM } = await admin.from("marches")
    .update({ state: "gather", t0: nowSec, t1: nowSec + gatherSecs }).eq("id", m.id);
  if (updM) throw updM;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + gatherSecs) * 1000).toISOString(),
    type: "gathered", data: { march_id: m.id },
  });
  if (evErr) throw evErr;
}

// Фаза 8, кусочек 1 — сбор закончен: отряд разворачивается домой с
// добычей (m.data.take/res, посчитаны в mp-gather — количество уже
// списано с точки авансом при отправке, здесь пересчитывать нечего).
// Зеркало EV.gathered (index.html:4970-4977) — без переноса respawn
// истощённой точки (см. заголовок mp-gather, честное упрощение №3).
async function applyGathered(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  if (!m || m.state !== "gather") return; // уже разобрано/отозвано

  const nowSec = Date.now() / 1000;
  const dist = (m.data && m.data.dist) || 0, spd = (m.data && m.data.spd) || 1;
  const travelBack = Math.max(15, (dist / spd) * 60);
  const carry = {}; if (m.data && m.data.res) carry[m.data.res] = m.data.take || 0;
  const { error: updM } = await admin.from("marches")
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack, data: { ...m.data, carry } }).eq("id", m.id);
  if (updM) throw updM;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "march_home", data: { march_id: m.id },
  });
  if (evErr) throw evErr;

  // Фаза 8, кусочек 3 — точка истощена (amount уже списан до нуля в
  // mp-gather на отправке) — сносим клетку и заводим respawn, зеркало
  // mapDelete+schedule(CFG.NODE_RESPAWN,"nodeback",...) из index.html
  // (EV.gathered, index.html:4993-4997). Раньше (кусочек 1) пустая точка
  // просто оставалась на карте навсегда — честный пробел, закрытый здесь.
  const cellX = m.data && m.data.cell_x, cellY = m.data && m.data.cell_y;
  if (cellX != null && cellY != null) {
    const { data: cell } = await admin.from("map_cells")
      .select("data").eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY).maybeSingle();
    if (cell && (cell.data && cell.data.amount) <= 0) {
      await admin.from("map_cells").delete().eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY);
      await admin.from("events").insert({
        world_id: m.world_id, fire_at: new Date((nowSec + NODE_RESPAWN_SEC) * 1000).toISOString(),
        type: "node_respawn", data: { x: cellX, y: cellY },
      });
    }
  }
}


// Фаза 8, кусочек 2 — отряд дошёл до лагеря варваров: бой разрешается
// сразу (resolveBanditRaid, однообменный — см. заголовок функции выше),
// результат зачисляется игроку НЕМЕДЛЕННО (не ждёт возвращения марша
// домой — тот же принцип "текущее состояние, не снимок", что и у обороны
// города): лёгкие потери (hospitalSplit, mode:"hospital" — НЕ
// "siege-attack", лагерь не чужой город) сразу возвращаются в строй/
// лазарет, а домой физически марширует остаток, который вообще не
// пострадал (unitsSub(m.units, attLoss) — attLoss уже разложен
// hospitalSplit'ом на "лёгкие"/"лазарет"/"насмерть", сумма которых и есть
// attLoss, так что вычесть его целиком из отправленных войск и добавить
// "лёгких" назад отдельно — не двойной счёт, а то же число, разложенное на
// "уже дома" и "ещё в пути").
async function applyRaidArrive(admin, m) {
  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; }

  const attP = attRow.state;
  attP.race = attP.race || attRow.race;
  if (!attP.wounded) attP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!attP.wounded[t]) attP.wounded[t] = {}; });

  const cellX = m.data && m.data.cell_x, cellY = m.data && m.data.cell_y;
  const { data: cell, error: cErr } = await admin.from("map_cells")
    .select("*").eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY).maybeSingle();
  if (cErr) throw cErr;

  const nowSec = Date.now() / 1000;
  let survivors = m.units, carry = {};
  // Лагерь уже разгромлен кем-то другим, пока отряд шёл — бой не
  // случается, отряд просто разворачивается пустым (как gather на
  // истощённую точку, как attack на пропавшего защитника).
  if (cell && (cell.t === "camp" || cell.t === "fort")) {
    const campLv = (m.data && m.data.camp_lv) || 1;
    const result = resolveBanditRaid(m.units, attP, campLv);
    const hs = hospitalSplit(attP, result.attLoss, "hospital");
    attP.troops = unitsAdd(attP.troops, hs.slightUnits);
    attP.wounded = unitsAdd(attP.wounded, hs.hurtUnits);
    survivors = unitsSub(m.units, result.attLoss);

    if (result.winner === "att") {
      carry = banditLoot(campLv);
      await admin.from("map_cells").delete().eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY);
      // Фаза 8, кусочек 3 — зеркало mapDelete+schedule(CFG.RESPAWN_CAMP,
      // "respawn",...) из index.html (arriveMarch, camp/fort-ветка,
      // index.html:5151-5152). Раньше (кусочек 2) разгромленный лагерь
      // просто исчезал навсегда — честный пробел, закрытый здесь.
      await admin.from("events").insert({
        world_id: m.world_id, fire_at: new Date((nowSec + CAMP_RESPAWN_SEC) * 1000).toISOString(),
        type: "camp_respawn", data: { x: cellX, y: cellY },
      });
    }

    const { error: mailErr } = await admin.from("mail").insert({
      world_id: m.world_id, player_id: attRow.id, kind: "raid",
      data: { camp_lv: campLv, win: result.winner === "att", loot: carry, attLoss: result.attLoss, dead: hs.dead, hurt: hs.hurt, slight: hs.slight },
    });
    if (mailErr) throw mailErr;
  }

  const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
  if (updA) throw updA;

  if (unitsTotal(survivors) <= 0) { await admin.from("marches").delete().eq("id", m.id); return; }
  const dist = (m.data && m.data.dist) || 0, spd = (m.data && m.data.spd) || 1;
  const travelBack = Math.max(15, (dist / spd) * 60);
  const { error: updM } = await admin.from("marches")
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack, units: survivors, data: { ...m.data, carry } }).eq("id", m.id);
  if (updM) throw updM;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "march_home", data: { march_id: m.id },
  });
  if (evErr) throw evErr;
}
