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
    // Фаза 21 — застолбить событие ПЕРЕД обработкой (миграция
    // 0005_realtime_battles.sql, events.claimed_at). Раньше между этим SELECT
    // и записью processed:true в конце цикла было окно гонки: два
    // параллельных запуска mp-tick (плановый pg_cron + подтолкнутый
    // mp-join'ом активного игрока, см. supabase/README.md) МОГЛИ выбрать одну
    // и ту же строку events и применить её дважды. Для одноразовых событий
    // это была маловероятная царапина; для боя, растянутого на несколько
    // events'ов type:'battle_round' подряд (см. runPvpBattleRounds выше), то
    // же самое окно открывается заново на каждый раунд — задвоенный раунд
    // означает задвоенные потери. Один атомарный UPDATE ... WHERE
    // processed=false AND (claimed_at IS NULL OR старше 60с) — конкурентный
    // такой же UPDATE той же строки просто не найдёт её в своём WHERE (первый
    // уже успел проставить свежий claimed_at), self-healing через 60с, если
    // клеймившая функция упала посреди обработки.
    const leaseExpiredIso = new Date(Date.now() - 60000).toISOString();
    for (const ev of due) {
      try {
        const { data: claimed, error: claimErr } = await admin
          .from("events").update({ claimed_at: new Date().toISOString() })
          .eq("id", ev.id).eq("processed", false)
          .or(`claimed_at.is.null,claimed_at.lt.${leaseExpiredIso}`)
          .select("id");
        if (claimErr) throw claimErr;
        if (!claimed || !claimed.length) continue; // кто-то другой уже забрал это событие — пропускаем

        if (ev.type === "train") await applyTrain(admin, ev);
        else if (ev.type === "build") await applyBuild(admin, ev);
        else if (ev.type === "march_arrive") await applyMarchArrive(admin, ev);
        else if (ev.type === "battle_round") await applyBattleRound(admin, ev);
        else if (ev.type === "march_home") await applyMarchHome(admin, ev);
        else if (ev.type === "heal") await applyHeal(admin, ev);
        else if (ev.type === "scout_arrive") await applyScoutArrive(admin, ev);
        else if (ev.type === "research") await applyResearch(admin, ev);
        else if (ev.type === "craft") await applyCraft(admin, ev);
        else if (ev.type === "gathered") await applyGathered(admin, ev);
        else if (ev.type === "node_respawn") await applyNodeRespawn(admin, ev);
        else if (ev.type === "camp_respawn") await applyCampRespawn(admin, ev);
        else if (ev.type === "ambient_seed") await applyAmbientSeed(admin, ev);
        // else: неизвестный/ещё не перенесённый тип — оставляем как есть,
        // не помечаем processed, чтобы не потерять событие молча; заберётся
        // следующим тиком после того, как для него появится case (claimed_at
        // тем временем сам остынет через 60с).
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

// index.html:2246 CRAFT_CHANCE — шанс успеха ковки по редкости 1..5, тот
// же порядок величин, что и CRAFT_MAT_NEED в mp-craft (дословная копия,
// эти два файла не импортируют друг друга — тот же принцип self-contained
// копий, что и везде в этом наборе функций).
const CRAFT_CHANCE = [1.0, 0.9, 0.75, 0.55, 0.35];
// Фаза 11: кусочек 1 — Горн, добыча материалов (kind:"material"); кусочек
// 3 — ковка снаряжения (kind:"item"). Зеркало EV.craft(d) (index.html:
// 4845-4861) целиком теперь здесь. Экипировка/снятие/разбор скованного —
// отдельные следующие кусочки, эта функция только доводит предмет до
// склада (p.inventory) при удаче.
async function applyCraft(admin, ev) {
  const playerId = ev.data && ev.data.player_id;
  if (playerId == null) return;
  const { data: row, error } = await admin.from("players").select("*").eq("id", playerId).maybeSingle();
  if (error) throw error;
  if (!row) return;
  const p = row.state;
  const c = p.craft;
  if (!c) return; // уже разобрано/отменено
  if (c.kind === "material") {
    if (!p.materials) p.materials = { ore: [0, 0, 0, 0, 0], leather: [0, 0, 0, 0, 0], bone: [0, 0, 0, 0, 0], ebony: [0, 0, 0, 0, 0] };
    if (!p.materials[c.mat]) p.materials[c.mat] = [0, 0, 0, 0, 0];
    p.materials[c.mat][0] = (p.materials[c.mat][0] || 0) + c.n;
  } else if (c.kind === "item") {
    // index.html:4852-4858 — удача решает Math.random() (см. заголовок
    // mp-craft/index.js насчёт выбора не-seeded PRNG для разовой ковки).
    // Неудача — материал и золото уже списаны на отправке (mp-craft),
    // здесь просто ничего не прибавляется, как и в источнике ("материал и
    // время утрачены").
    if (Math.random() < CRAFT_CHANCE[c.rarity - 1]) {
      if (!p.inventory) p.inventory = {};
      if (!p.inventory[c.slot]) p.inventory[c.slot] = {};
      if (!p.inventory[c.slot][c.order]) p.inventory[c.slot][c.order] = [0, 0, 0, 0, 0];
      p.inventory[c.slot][c.order][c.rarity - 1] = (p.inventory[c.slot][c.order][c.rarity - 1] || 0) + 1;
    }
  }
  p.craft = null;
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

// Фаза 15 — фоновый respawn НЕ по истощению: автор попросил ту же механику,
// что и в RoK, "украденную и адаптированную" — карта сама подсевает новые
// точки/лагеря по расписанию, не дожидаясь, пока кто-то выберет старые до
// дна (respawnOffset выше срабатывает только ПОСЛЕ чьей-то добычи — далеко
// от городов, куда ещё никто не дошёл, точек как не было, так и нет).
//
// Самоподдерживающаяся цепочка событий (тот же приём, что и node_respawn/
// camp_respawn) — КАЖДЫЙ отработавший ambient_seed сам заводит следующий
// через AMBIENT_SEED_INTERVAL_SEC, независимо от того, реально ли досеял
// что-то в этот раз (см. return-ветки ниже — досев может быть пропущен, а
// цепочка всё равно продолжается). Первое звено заводится один раз в
// mp-join при создании мира (или миграцией 0003 — для уже существующего).
//
// Анти-переизбыток — ДВЕ независимые защиты, обе дешёвые (по одному
// count-запросу, без выгрузки самих строк):
//   1. Потолок пропорционален числу игроков (не абсолютное число) — чем
//      больше народу в мире, тем больше точек ему разумно нужно, тем же
//      духом, что и density-по-удалению-от-столицы в RoK, только тут проще
//      (пропорция к населению, не к географии).
//   2. Малая порция за раз (2 точки + 1 лагерь на КАЖДОЕ звено цепочки, раз
//      в AMBIENT_SEED_INTERVAL_SEC=10 минут) — даже если потолок далёк,
//      карта не зальётся точками за один тик.
// Анти-нагрузка на сервер — сама работа приходится не на каждый тик
// (BATCH=200 событий, могут прилетать раз в 15с), а на раз в 10 минут (эта
// цепочка сама себя планирует не чаще) — по стоимости не отличается от
// любого другого события в этой же таблице.
//
// Честное упрощение (тот же уровень, что и у respawnOffset выше — тот
// тоже не проверяет воду): без isRealWater — полный перенос рельефной
// воды сюда значил бы дублировать hash2/noise/ridge/rwHeightAt из mp-join
// (~80 строк) ради ambient-точек, у которых и так есть запасной путь —
// следующее звено цепочки просто попробует другое случайное место.
const AMBIENT_SEED_INTERVAL_SEC = 600; // 10 минут — не тема "раз в секунду", это фоновый прирост контента, не отклик на действие игрока
const AMBIENT_NODE_MIN_R = 30, AMBIENT_NODE_MAX_R = 90; // шире собственного кольца новичка (8-25) — свободная территория МЕЖДУ городами, не чей-то персональный задний двор
const AMBIENT_NODE_PER_PLAYER = 3, AMBIENT_NODE_FLOOR = 20; // потолок узлов = max(20, игроков×3)
const AMBIENT_CAMP_PER_PLAYER = 1.5, AMBIENT_CAMP_FLOOR = 10;
const AMBIENT_NODE_BATCH = 2, AMBIENT_CAMP_BATCH = 1;
async function applyAmbientSeed(admin, ev) {
  const worldId = ev.world_id;
  try {
    const { count: playerCount } = await admin.from("players").select("id", { count: "exact", head: true }).eq("world_id", worldId);
    const { count: nodeCount } = await admin.from("map_cells").select("x", { count: "exact", head: true }).eq("world_id", worldId).eq("t", "node");
    const { count: campCount } = await admin.from("map_cells").select("x", { count: "exact", head: true }).eq("world_id", worldId).in("t", ["camp", "fort"]);
    const nodeCap = Math.max(AMBIENT_NODE_FLOOR, Math.round((playerCount || 0) * AMBIENT_NODE_PER_PLAYER));
    const campCap = Math.max(AMBIENT_CAMP_FLOOR, Math.round((playerCount || 0) * AMBIENT_CAMP_PER_PLAYER));

    if ((nodeCount || 0) < nodeCap || (campCount || 0) < campCap) {
      // Центр для случайного смещения — реальный игрок (не центр карты, не
      // 0,0) — новые точки ложатся рядом с уже освоенной территорией, а не
      // в произвольной пустоте, куда ещё никто не добрался.
      const { data: players } = await admin.from("players").select("x,y").eq("world_id", worldId).limit(200);
      if (players && players.length) {
        if ((nodeCount || 0) < nodeCap) {
          const rows = [];
          for (let i = 0; i < AMBIENT_NODE_BATCH; i++) {
            const c = players[Math.floor(Math.random() * players.length)];
            const ang = Math.random() * Math.PI * 2, r = AMBIENT_NODE_MIN_R + Math.random() * (AMBIENT_NODE_MAX_R - AMBIENT_NODE_MIN_R);
            const x = Math.round(c.x + Math.cos(ang) * r), y = Math.round(c.y + Math.sin(ang) * r);
            const lv = 1 + Math.floor(Math.random() * 3);
            const amount = Math.round(6000 * Math.pow(2.6, lv - 1));
            const res = RES[Math.floor(Math.random() * RES.length)];
            rows.push({ world_id: worldId, x, y, t: "node", data: { res, lv, amount, max: amount } });
          }
          await admin.from("map_cells").upsert(rows, { onConflict: "world_id,x,y", ignoreDuplicates: true });
        }
        if ((campCount || 0) < campCap) {
          const rows = [];
          for (let i = 0; i < AMBIENT_CAMP_BATCH; i++) {
            const c = players[Math.floor(Math.random() * players.length)];
            const ang = Math.random() * Math.PI * 2, r = AMBIENT_NODE_MIN_R + Math.random() * (AMBIENT_NODE_MAX_R - AMBIENT_NODE_MIN_R);
            const x = Math.round(c.x + Math.cos(ang) * r), y = Math.round(c.y + Math.sin(ang) * r);
            const lv = 1 + Math.floor(Math.random() * 5);
            rows.push({ world_id: worldId, x, y, t: "camp", data: { lv } });
          }
          await admin.from("map_cells").upsert(rows, { onConflict: "world_id,x,y", ignoreDuplicates: true });
        }
      }
    }
  } finally {
    // Цепочка продолжается ДАЖЕ если досев выше пропущен (потолок достигнут)
    // или упал (players-запрос пуст/ошибка внутри try) — finally, не конец
    // try-блока, чтобы редкий сбой одного звена не оборвал respawn навсегда.
    await admin.from("events").insert({
      world_id: worldId, fire_at: new Date(Date.now() + AMBIENT_SEED_INTERVAL_SEC * 1000).toISOString(),
      type: "ambient_seed", data: {},
    });
  }
}
const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20];
// load — index.html:2583-2588 TROOP_TYPES (там же атк/защ/хп/скорость/магия,
// но load не переносился в этот файл раньше — combat-математике он не
// нужен, добавлен здесь ради carryCap в PvP-грабеже, см. applyMarchArrive.
const TROOP_TYPES = {
  inf: { atk: 34, def: 46, hp: 44, load: 6, speed: 1.00, magicAtk: 8, magicDef: 18, beats: "arc", losesTo: "cav" },
  arc: { atk: 50, def: 30, hp: 36, load: 8, speed: 1.10, magicAtk: 20, magicDef: 8, beats: "cav", losesTo: "inf" },
  cav: { atk: 46, def: 34, hp: 40, load: 5, speed: 1.70, magicAtk: 12, magicDef: 12, beats: "inf", losesTo: "arc" },
  sie: { atk: 24, def: 20, hp: 60, load: 30, speed: 0.60, magicAtk: 26, magicDef: 6, beats: null, losesTo: null },
};
const RACE_TROOP_MOD = {
  dwarf: { inf: { atk: 1.05, def: 1.05, hp: 1.05 } },
  human: { cav: { atk: 1.05, def: 1.05, hp: 1.05 } },
  elf: { arc: { atk: 1.05, def: 1.05, hp: 1.05 } },
  // load:0.80 — честный размен нежити: осадные бьют вдвое сильнее, но возят
  // на 20% меньше (index.html:2725). Раньше этой строки тут не было, а
  // carryCap в applyMarchArrive ниже множит именно на troopMod(...,"load") —
  // без неё нежить уносила из разграбленного города и лагеря на 25% больше,
  // чем та же нежить в одиночке, получая силу без обратной стороны.
  undead: { sie: { atk: 2.20 * 1.05, def: 1.05, hp: 1.05, speed: 1.20, load: 0.80 } },
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
//   4. portalMarchBonus(p.b.portal) — Портал теперь настоящее здание общего
//      мира (mp-build, отдельный кусочек после Фазы 11 — единственное
//      здание без собственной ценовой кривой и в источнике, работает через
//      общую BUILD_TABLE), p.b.portal — реальный уровень, не всегда 0.
//   5. Бонусы дерева исследований (ACADEMY_TREE[*].field/effects, по
//      p.tech) — уже перенесено в Фазе 5, здесь наконец подключается.
//
// Устарело (оставлено видимым нарочно — см. ниже, а не удалено молча):
// раньше здесь было написано, что талантовые бонусы генерала (w1-w5/d1-d5/
// g1-g3/g4-g5, index.html:3760-3767) и GENERAL_TREE (город/армия, index.html:
// 3780-3787) НЕ считаются, потому что вложить очки в общем мире было
// неоткуда (p.gen.tal всегда {}). Это больше не так: mp-talent (Фаза 10,
// кусочек 2) даёт реально тратить очки в p.gen.tal, и блок ниже
// (`const T=(p.gen&&p.gen.tal)||{}` и всё, что после него) их честно читает
// и применяет — не ноль. Смотрите сам код bonuses() ниже, а не этот
// комментарий, если нужно проверить, что именно считается.
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
  // index.html:3760-3767 TALENTS (war/dev/gath) — Фаза 10, кусочек 3: раньше
  // p.gen.tal было гарантированно {} (очков взять было неоткуда), теперь
  // mp-talent (кусочек 2) реально его заполняет — здесь наконец читаем эффект.
  const T = (p.gen && p.gen.tal) || {};
  const g = (id) => T[id] || 0;
  b.atk += g("w1") * .02; b.def += g("w2") * .02; b.hp += g("w3") * .02;
  b.bandit += g("w4") * .05; b.mercy += g("w5") * .03;
  b.build *= 1 + g("d1") * .03; b.prodFW += g("d2") * .04; b.prodSG += g("d3") * .04;
  b.hosp += g("d4") * .05; b.cap += g("d5") * .04;
  b.load += g("g1") * .04; b.gather += g("g2") * .04; b.march *= 1 + g("g3") * .03;
  b.gatherFW = g("g4") * .05; b.gatherSG = g("g5") * .05;
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
  // index.html:3780-3787 GENERAL_TREE (город/армия) — тот же T, что и выше.
  const GENERAL_TREE_NODES = [
    { id: "gt_c1", per: .03, kind: "mult", field: "build" },
    { id: "gt_c2", per: .03, kind: "add", field: "buildCostCut" },
    { id: "gt_c3", per: .04, kind: "add", field: "trainSpeed" },
    { id: "gt_c4", per: .03, kind: "add", field: "prodAll" },
    { id: "gt_c5", per: .03, kind: "add", field: "cap" },
    { id: "gt_a1", per: .03, kind: "add", field: "genAtkMod" },
    { id: "gt_a2", per: .03, kind: "add", field: "genDefMod" },
    { id: "gt_a3", per: .03, kind: "add", field: "genHpMod" },
    { id: "gt_a4", per: .02, kind: "add", field: "atk" },
    { id: "gt_a5", per: .02, kind: "add", field: "def" },
    { id: "gt_a6", per: .02, kind: "add", field: "hp" },
    { id: "gt_a7", per: .03, kind: "mult", field: "march" },
    { id: "gt_a8", per: .03, kind: "add", field: "load" },
    { id: "gt_a9", per: .05, kind: "add", field: "bandit" },
    { id: "gt_a10", per: .03, kind: "add", field: "mercy" },
  ];
  const multAcc2 = {};
  GENERAL_TREE_NODES.forEach((n) => {
    const lv = T[n.id] || 0; if (!lv) return;
    const inc = n.per * lv;
    if (n.kind === "mult") multAcc2[n.field] = (multAcc2[n.field] || 0) + inc;
    else b[n.field] = (b[n.field] || 0) + inc;
  });
  Object.keys(multAcc2).forEach((f) => b[f] *= (1 + multAcc2[f]));
  return b;
}

// index.html:3790 production() — теперь считает через полноценный bonuses(p)
// вместо голых PROD_TABLE-чисел (тот же самый B, что течёт и в trainSpeed/
// build/heal у остальных функций этого файла). handicap (p.isBot) в общем
// мире не нужен — ботов здесь нет (см. syncRes выше).
// PROD_BLD/PROD_MULT/PROD_TABLE/prodRate/plotCap — до этого кусочка
// отсутствовали в файле целиком (production() ссылалась на них и упала бы
// ReferenceError'ом при первом же реальном вызове — а вызовов не было,
// функция была мёртвым кодом с самого своего появления). Нужны здесь для
// syncRes/capacity ниже — грабёж при победе в PvP должен видеть актуальный
// склад защитника и уважать его защиту от разграбления, как в источнике.
const PROD_BLD = { food: "farm", wood: "lumber", stone: "quarry", gold: "mine" };
const PROD_MULT = { food: 1, wood: 1, stone: 0.75, gold: 0.5 };
const PROD_TABLE = [
  400, 430, 470, 520, 580, 650, 730, 830, 950, 1100, 1300, 1550, 1850, 2200, 2700,
  3200, 3700, 4300, 5000, 5800, 6700, 7800, 9000, 10400, 20800,
];
const prodRate = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv));
const plotCap = (lv) => (lv <= 0 ? 0 : tblRow(PROD_TABLE, lv) * 10);
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
function plotFillCap(p) {
  const out = {};
  RES.forEach((r) => {
    const plots = p.b[PROD_BLD[r]];
    let extra = 0;
    (Array.isArray(plots) ? plots : [plots || 0]).forEach((lv) => { extra += plotCap(lv) * PROD_MULT[r]; });
    out[r] = Math.round(extra);
  });
  return out;
}
// index.html:1293-1295/2798 STORE_TABLE/storeCap — защита Склада от
// разграбления. index.html:3820-3826 capacity(p) — своя вместимость на
// каждый ресурс (склад + защита участков), используется ДВАЖДы в
// источнике: как потолок для syncRes (добыча не копится сверх него) и как
// защищённый минимум при грабеже (battleCity — грабить можно только то,
// что выше этой планки). Оба смысла ниже, как и в источнике.
const STORE_TABLE = [
  300000, 320000, 350000, 380000, 410000, 450000, 500000, 550000, 600000,
  650000, 700000, 750000, 800000, 850000, 900000, 1000000, 1100000, 1200000, 1300000, 1400000,
  1500000, 1600000, 1800000, 2000000, 2500000,
];
const storeCap = (lv) => tblRow(STORE_TABLE, Math.max(1, lv));
function capacity(p) {
  const B = bonuses(p), base = Math.round(storeCap((p.b && p.b.store) || 0) * (1 + B.cap));
  const extra = plotFillCap(p);
  const out = {};
  RES.forEach((r) => { out[r] = base + extra[r]; });
  return out;
}
// index.html:3838-3844 syncRes(p) — довести p.res до текущего момента
// перед грабежом (иначе атакующий видел бы устаревший снимок склада с
// момента последнего ДЕЙСТВИЯ защитника, а не реальный на секунду боя).
function syncRes(p, nowSec) {
  const dt = (nowSec - (p.resAt || 0)) / 3600;
  if (dt <= 0) { p.resAt = nowSec; return; }
  const pr = production(p), cap = plotFillCap(p);
  RES.forEach((r) => {
    const add = Math.min(pr[r] * dt, cap[r]);
    p.res[r] = Math.max(0, (p.res[r] || 0) + add);
  });
  p.resAt = nowSec;
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
// _shared/rules.js (буквальная копия оттуда). Фаза 9, кусочек 2: не
// хватало множителя BATTLE_PACE (index.html:4066) — в однообменной модели
// (Фаза 4) это было незаметно (масштаб урона не менял исход одного
// обмена), теперь, когда бой раундовый, залп без этого множителя бил
// вчетверо сильнее источника. Честный баг, не упрощение — исправлен.
function garrisonVolley(defGarrisonLv, attS) {
  if (defGarrisonLv <= 0) return null;
  const dmg = tblRow(WATCH_TABLE, defGarrisonLv).atk;
  const out = {};
  TKEYS.forEach((t) => {
    if (attS[t].n <= 0) { out[t] = 0; return; }
    const share = dmg * (attS[t].hp / Math.max(1, attS.totalHp));
    const mitig = 1 + (attS[t].def / Math.max(1, attS[t].n)) / 70;
    out[t] = share * BATTLE_PACE / mitig;
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
// index.html:4041 volleyDamage — венец эльфов (firstStrike, epoch 5):
// досрочный залп ВСЕХ лучников до начала общей схватки, без ответа со
// стороны обычного боя (защитник получает удар раньше, чем успевает
// ударить сам). attUnits/attRace/attB — стреляющая сторона (используются
// её живые лучники и её собственные atk/archer-бонусы), defS — снимок
// цели (её HP-доли решают, кому именно из родов войск достанется залп),
// defWallLv/wallBonus — стена цели (0/0, если целится по чистому полю).
function volleyDamage(attUnits, attRace, attB, defS, defWallLv = 0, wallBonus = 0) {
  if (!attB.firstStrike) return null;
  const c = attUnits.arc || {};
  let atk = 0, n = 0;
  for (let i = 1; i <= 5; i++) {
    const cnt = c[i] || 0; if (!cnt) continue;
    atk += cnt * TROOP_TYPES.arc.atk * TIER_MULT[i - 1] * troopMod(attRace, "arc", "atk") * (1 + (attB.archer || 0)) * (1 + attB.atk);
    n += cnt;
  }
  if (n <= 0) return null;
  const defWall = 1 + wallDefBonus(defWallLv) * (1 + wallBonus);
  const out = {};
  TKEYS.forEach((dt) => {
    if (defS[dt].n <= 0) { out[dt] = 0; return; }
    const d = atk * counterMult("arc", dt) * (defS[dt].hp / Math.max(1, defS.totalHp));
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70 * defWall;
    out[dt] = d * BATTLE_PACE / mitig;
  });
  return out;
}
const SIDE_TYPE_ATK = { inf: "atkInf", arc: "atkArc", cav: "atkCav", sie: "atkSie" };
const SIDE_TYPE_DEF = { inf: "defInf", arc: "defArc", cav: "defCav", sie: "defSie" };
const SIDE_TYPE_MATK = { inf: "matkInf", arc: "matkArc", cav: "matkCav", sie: "matkSie" };
const SIDE_TYPE_MDEF = { inf: "mdefInf", arc: "mdefArc", cav: "mdefCav", sie: "mdefSie" };
// index.html:2603-2614 DISCIPLINE/RACE_DISCIPLINE_BONUS/disciplineThreshold
// — дословно. Доля потерь ТИПА-ТИРА войск (от его стартового числа В ЭТОМ
// БОЮ, не за раунд) — после превышения порога тир "дрогнул" на весь
// оставшийся бой (атака/защита −30%, не смертельно и не навсегда снаружи
// боя). Порог растёт по тирам (элита держится дольше) и у каждой расы
// свой род войск держится чуть дольше остальных; нежить не ломается по
// осадным вообще ("immune").
const DISCIPLINE = {
  inf: [65, 72, 78, 84, 90], arc: [40, 48, 55, 62, 70], cav: [55, 60, 65, 70, 78], sie: [75, 78, 81, 84, 88],
};
const RACE_DISCIPLINE_BONUS = { dwarf: { inf: 15 }, human: { cav: 15 }, elf: { arc: 15 }, undead: { sie: "immune" } };
function disciplineThreshold(t, i, race) {
  const bonus = RACE_DISCIPLINE_BONUS[race] && RACE_DISCIPLINE_BONUS[race][t];
  if (bonus === "immune") return Infinity;
  return (DISCIPLINE[t][i - 1] + (bonus || 0)) / 100;
}
// index.html:4317-4328 checkDiscipline — дословно, но БЕЗ хроники (broke
// список имён нигде не читается в MP — тут нет боевого лога). start —
// СТАРТОВЫЙ состав стороны на начало всего боя (не текущий, не за раунд);
// lossTotal — накопленные потери с начала боя (attLossTotal/defLossTotal
// в resolvePvp/resolveBanditRaid ниже — они уже считались, просто раньше
// никем не читались); broken — мутируется на месте, тот же объект и до, и
// после вызова, ровно как f.broken в источнике.
function checkDiscipline(start, lossTotal, race, broken) {
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      if (broken[t][i]) continue;
      const startN = (start[t] && start[t][i]) || 0; if (!startN) continue;
      const thr = disciplineThreshold(t, i, race); if (thr === Infinity) continue;
      const lostN = (lossTotal[t] && lossTotal[t][i]) || 0;
      if (lostN / startN > thr) broken[t][i] = 1;
    }
  });
}
// index.html:3974 sideStats — Фаза 6: принимает готовый B (bonuses(p) или
// bonuses(p,true) для защитника), см. подробный комментарий в _shared/rules.js.
// broken — Фаза 9, кусочек 3: необязательный четвёртый параметр (index.html:
// 3987 f.broken) — если тир сломлен, его вклад в atk/def/matk/mdef (НЕ в
// hp — дисциплина не убивает, только бьёт хуже) умножается на 0.70, тем же
// способом, что и остальные модификаторы этого же цикла.
// risen — Фаза 9, кусочек 7: необязательный пятый параметр (index.html:
// 3998-4007 f.risen) — поднятые скелеты (undead, см. applyRaise ниже):
// дерутся на ПОЛОВИНУ статов своего рода/тира, НЕ подчиняются discipline
// brk (в источнике брейк тоже не трогает risen-ветку — своя нежить не
// "дрогнет", она уже мертва), но добавляются в HP-пул и в n наравне с
// живыми, поэтому и достаются противнику как цель, и добавляют силы удара.
function sideStats(units, race, B, broken, risen) {
  const s = {};
  TKEYS.forEach((t) => {
    let atk = 0, def = 0, matk = 0, mdef = 0, hp = 0, n = 0;
    const atkMod = 1 + (B[SIDE_TYPE_ATK[t]] || 0), defMod = 1 + (B[SIDE_TYPE_DEF[t]] || 0);
    const matkMod = 1 + (B[SIDE_TYPE_MATK[t]] || 0), mdefMod = 1 + (B[SIDE_TYPE_MDEF[t]] || 0);
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      const w = TIER_MULT[i - 1];
      if (c) {
        const brk = broken && broken[t] && broken[t][i] ? 0.70 : 1;
        let a = TROOP_TYPES[t].atk * w * troopMod(race, t, "atk") * atkMod;
        if (t === "arc") a *= 1 + (B.archer || 0);
        const d = TROOP_TYPES[t].def * w * troopMod(race, t, "def") * defMod;
        const ma = TROOP_TYPES[t].magicAtk * w * troopMod(race, t, "atk") * matkMod;
        const md = TROOP_TYPES[t].magicDef * w * troopMod(race, t, "def") * mdefMod;
        atk += c * a * brk * (1 + B.atk); def += c * d * brk * (1 + B.def);
        matk += c * ma * brk * (1 + B.matk); mdef += c * md * brk * (1 + B.mdef);
        hp += c * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp") * (1 + B.hp);
        n += c;
      }
      const rc = (risen && risen[t] && risen[t][i]) || 0;
      if (rc) {
        let ra = TROOP_TYPES[t].atk * w * troopMod(race, t, "atk") * atkMod * 0.5;
        if (t === "arc") ra *= 1 + (B.archer || 0);
        atk += rc * ra * (1 + B.atk);
        def += rc * TROOP_TYPES[t].def * w * troopMod(race, t, "def") * defMod * 0.5 * (1 + B.def);
        matk += rc * TROOP_TYPES[t].magicAtk * w * troopMod(race, t, "atk") * matkMod * 0.5 * (1 + B.matk);
        mdef += rc * TROOP_TYPES[t].magicDef * w * troopMod(race, t, "def") * mdefMod * 0.5 * (1 + B.mdef);
        hp += rc * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp") * 0.5 * (1 + B.hp);
        n += rc;
      }
    }
    s[t] = { atk, def, matk, mdef, hp, n };
  });
  s.totalHp = TKEYS.reduce((a, t) => a + s[t].hp, 0);
  s.totalN = TKEYS.reduce((a, t) => a + s[t].n, 0);
  return s;
}
// index.html:3902-3918 armyPower — дословно: та же взвешенная сумма всех
// пяти статов (не только HP), что и в клиентском "силе войска" везде
// по игре. Нужна здесь для честной ничьей (см. заголовок resolvePvp) —
// раньше (Фаза 6-9.1) ничья решалась по остатку totalHp, что ближе, но не
// то же самое, что и в источнике (_shared/rules.js честно отмечал это
// приближение отдельным комментарием — он теперь устарел, см. правку там же).
function armyPower(units, B, race) {
  let v = 0;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      const n = (units[t] && units[t][i]) || 0; if (!n) continue;
      let a = TROOP_TYPES[t].atk * TIER_MULT[i - 1] * troopMod(race, t, "atk") * (1 + ((B && B[SIDE_TYPE_ATK[t]]) || 0));
      if (t === "arc") a *= 1 + ((B && B.archer) || 0);
      const d = TROOP_TYPES[t].def * TIER_MULT[i - 1] * troopMod(race, t, "def") * (1 + ((B && B[SIDE_TYPE_DEF[t]]) || 0));
      const ma = TROOP_TYPES[t].magicAtk * TIER_MULT[i - 1] * troopMod(race, t, "magicAtk") * (1 + ((B && B[SIDE_TYPE_MATK[t]]) || 0));
      const md = TROOP_TYPES[t].magicDef * TIER_MULT[i - 1] * troopMod(race, t, "magicDef") * (1 + ((B && B[SIDE_TYPE_MDEF[t]]) || 0));
      const hp = TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp");
      v += n * (a * (1 + (B ? B.atk : 0)) + d * (1 + (B ? B.def : 0)) + ma * (1 + (B ? B.matk : 0)) + md * (1 + (B ? B.mdef : 0)) + hp * (1 + (B ? B.hp : 0)));
    }
  });
  return Math.round(v / 150); // T1 пехота без бонусов = 150 суммарных статов -> ~1 сила за юнита T1
}
// index.html:1716 CFG.BATTLE_PACE — общий множитель, замедляющий урон ОДНОГО
// раунда, чтобы бой из Фазы 9, кусочек 1 реально растягивался на несколько
// раундов, а не решался в первом же (без него — как оказалось после
// кусочка 1 — было именно так, см. заголовок resolvePvp ниже).
const BATTLE_PACE = 0.45;
// index.html:4100-4108 BATTLE_WEATHER — дословно: общая для ОБЕИХ сторон
// погода за бой (не "везение одной стороны"), бьёт по РОДУ войск
// атакующего в конкретном ударе (см. wMod(at) в dmgTo ниже), веса w —
// вероятность выпадения (ясно намеренно вдвое вероятнее всего остального).
const BATTLE_WEATHER = [
  { id: "clear", w: 50, name: "Ясно", mod: {} },
  { id: "rain", w: 11, name: "Проливной дождь", mod: { arc: 0.82 } },
  { id: "mud", w: 11, name: "Распутица", mod: { cav: 0.82 } },
  { id: "fog", w: 9, name: "Густой туман", mod: { arc: 0.85, sie: 0.80 } },
  { id: "wind", w: 8, name: "Порывистый ветер", mod: { arc: 0.88, sie: 0.88 } },
  { id: "heat", w: 7, name: "Палящий зной", mod: { inf: 0.92, arc: 0.92, cav: 0.92, sie: 0.92 } },
  { id: "storm", w: 4, name: "Гроза", mod: { arc: 0.85 }, jitter: 0.14 },
];
// index.html:2692 mulberry — тот же генератор, дословно.
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// index.html:4118 battleRng сеет от W.seed/W.t — единого "тика мира"
// одиночной игры, которого у общего мира нет (mp-tick резолвит каждое
// событие в свой момент по расписанию, не по общему такту). Честная
// замена: сеем от РЕАЛЬНОГО времени резолва + id марша/сторон — тот же
// смысл ("разные бои — разная погода"), без требования побитовой
// воспроизводимости по несуществующему здесь "тику".
function battleRngMp(marchId) {
  const s = (Date.now() ^ Math.imul((marchId || 0) | 0, 2654435761)) | 0;
  return mulberry(s);
}
// index.html:4123 pickWeather — дословно.
function pickWeather(rnd) {
  const total = BATTLE_WEATHER.reduce((s, x) => s + x.w, 0);
  let r = rnd() * total;
  for (const x of BATTLE_WEATHER) { r -= x.w; if (r <= 0) return x; }
  return BATTLE_WEATHER[0];
}
// defWallLv — уровень стены защитника; wallBonus — bonuses(p).wallBonus
// (Фаза 6, было захардкожено 0), см. подробный комментарий в _shared/rules.js.
// wMod(at) — index.html:4204 — погода бьёт по роду войск БЬЮЩЕГО (мокрая
// тетива у лучника), одинаково применяется к обеим сторонам. shake —
// index.html:4218 roll(), разброс ±jitter вокруг единицы на раунд, свой
// для каждого вызова dmgTo (у каждой стороны свой бросок).
function dmgTo(attS, defS, defWallLv = 0, wallBonus = 0, wMod = null, shake = 1) {
  const defWall = 1 + wallDefBonus(defWallLv) * (1 + wallBonus);
  const out = {};
  TKEYS.forEach((dt) => {
    if (defS[dt].n <= 0) { out[dt] = 0; return; }
    let d = 0, dm = 0;
    TKEYS.forEach((at) => {
      if (attS[at].n <= 0) return;
      const share = defS[dt].hp / Math.max(1, defS.totalHp);
      const w = wMod ? wMod(at) : 1;
      d += attS[at].atk * counterMult(at, dt) * share * w;
      dm += attS[at].matk * counterMult(at, dt) * share * w;
    });
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70 * defWall;
    const mitigM = 1 + (defS[dt].mdef / Math.max(1, defS[dt].n)) / 70 * defWall;
    out[dt] = (d / mitig + dm / mitigM) * BATTLE_PACE * shake;
  });
  return out;
}
// hpBonus — сырой B.hp, тот же множитель, что sideStats уже применила к
// totalHp (см. _shared/rules.js) — держит hpTotal (знаменатель доли потерь)
// согласованным с тем пулом HP, из которого dmgTo() реально считал урон.
// risen — необязательный пятый параметр (по умолчанию null). rnd —
// обязательный шестой: тот же самый посевной battleRngMp(marchId), что уже
// красит погоду/roll() в resolvePvp/resolveBanditRaid — см. их заголовки.
// index.html:4424-4460 applyDamage — источник раньше (и эта функция вслед за
// ним) убивал строго по возрастанию тира — младшие бойцы гибли первыми и
// полностью, старшие вообще не рисковали, пока младшие не выбиты подчистую
// (и поднятые скелеты не рисковали вовсе, пока жив хоть один ЖИВОЙ боец —
// см. историю этого файла). Автор пожаловался: в настоящем бою так не
// бывает, задевает вперемешку, а не по расписанию "сначала дешёвые". Теперь
// оба источника (index.html и этот файл) считают одинаково: живые (1-5) и
// поднятые скелеты (1-5, половина HP) этого рода войск — один общий пул
// целей, урон делится между ними пропорционально доле в общем HP пула, но
// с собственным случайным разбросом на каждую группу (0.5..1.5 вокруг её
// "честной" доли) — крупная группа в среднем теряет больше, но не железно.
// Раздельной очерёдности "сначала живые" больше нет ни там, ни тут — то,
// из-за чего эти два места раньше расходились (см. историю этого
// комментария), теперь просто не может разойтись: правило одно и то же.
function applyLosses(units, dmgByType, race, hpBonus = 0, risen = null, rnd) {
  const lost = { inf: {}, arc: {}, cav: {}, sie: {} };
  const lostRisen = { inf: {}, arc: {}, cav: {}, sie: {} };
  let hpLost = 0;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) { lost[t][i] = 0; lostRisen[t][i] = 0; }
    const d = dmgByType[t];
    if (!d || d <= 0) return;
    const pool = [];
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      if (c > 0) pool.push({ live: true, i, ehp: TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp") * (1 + hpBonus), n: c });
    }
    if (risen) for (let i = 1; i <= 5; i++) {
      const rc = (risen[t] && risen[t][i]) || 0;
      if (rc > 0) pool.push({ live: false, i, ehp: TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp") * 0.5 * (1 + hpBonus), n: rc });
    }
    if (!pool.length) return;
    const hpTotal = pool.reduce((s, p) => s + p.n * p.ehp, 0);
    if (hpTotal <= 0) return;
    const dmgUsed = Math.min(d, hpTotal);
    hpLost += dmgUsed;
    let wsum = 0;
    pool.forEach((p) => { p.w = (p.n * p.ehp) * (0.5 + rnd()); wsum += p.w; });
    if (wsum <= 0) return;
    pool.forEach((p) => {
      const share = dmgUsed * (p.w / wsum);
      const kill = Math.min(p.n, Math.round(share / p.ehp));
      if (kill <= 0) return;
      if (p.live) lost[t][p.i] = kill; else lostRisen[t][p.i] = kill;
    });
  });
  return { units: lost, risen: lostRisen, hpLost };
}
// index.html:2187-2263 GEAR_SLOTS/GEAR_PCT_*/gearItemStats/gearBonus —
// дословно. Фаза 11, кусочек 4: снаряжение теперь можно надеть (mp-equip),
// поэтому p.gear[slot] больше не гарантированно пусто — gearBonus(p)
// наконец считает не только ноль. Только cat нужен здесь (какой стат
// первичный/вторичный/третичный по типу предмета) — имя/материал слота
// сюда не относятся.
const GEAR_SLOT_CAT = {
  helmet: "armor", chest: "armor", gloves: "armor", pants: "armor", boots: "armor",
  handL: "weapon", handR: "weapon", acc1: "acc", acc2: "acc",
};
const GEAR_PCT_PRIMARY = [0.010, 0.025, 0.040, 0.075, 0.11];
const GEAR_PCT_SECONDARY = [0.005, 0.012, 0.022, 0.045, 0.075];
const GEAR_PCT_TERTIARY = [0.0025, 0.006, 0.011, 0.0225, 0.0375];
function gearItemStats(cat, order, r) {
  const P = GEAR_PCT_PRIMARY[r - 1], S = GEAR_PCT_SECONDARY[r - 1], T = GEAR_PCT_TERTIARY[r - 1];
  if (cat === "armor") return order === "bastion" ? { def: P, hp: S } : { hp: P, def: S };
  if (cat === "weapon") {
    if (order === "storm") return { atk: r === 5 ? 0.15 : P };
    return { atk: P, def: S };
  }
  return order === "bastion" ? { hp: P, def: S, atk: T } : { atk: P, hp: S, def: T };
}
function gearBonus(p) {
  const out = { atk: 0, def: 0, hp: 0 };
  Object.keys(GEAR_SLOT_CAT).forEach((slotId) => {
    const it = p.gear && p.gear[slotId]; if (!it) return;
    const st = gearItemStats(GEAR_SLOT_CAT[slotId], it.order, it.rarity);
    out.atk += st.atk || 0; out.def += st.def || 0; out.hp += st.hp || 0;
  });
  return out;
}
// index.html:3706 genStats — эфемерный боевой снимок полководца (atk/def/
// hp), НЕ p.gen (постоянная запись игрока: lv/xp/pts/tal). Строится заново
// на каждый вызов resolvePvp/resolveBanditRaid из p.gen.lv — как и в
// источнике, полководец не "лечится между боями" и не "умирает навсегда":
// каждый следующий бой начинается с полным HP независимо от исхода
// предыдущего.
function genStats(p) {
  if (!p.gen || p.gen.id == null) return null;
  const B = bonuses(p), lv = p.gen.lv || 1, g = Math.pow(lv, 1.15);
  const gear = gearBonus(p); // теперь проценты — умножаем, а не прибавляем флэтом
  return {
    hp: Math.round((250 + 30 * g) * (1 + B.genHpMod) * (1 + gear.hp)),
    atk: Math.round((200 + 40 * g) * (1 + B.genAtkMod) * (1 + gear.atk)),
    def: Math.round((170 + 30 * g) * (1 + B.genDefMod) * (1 + gear.def)),
  };
}
// index.html:4070 generalDamage — полководец бьёт по всем родам войск
// сразу, вне треугольника контр (не считается ни "пехотой", ни "лучником").
// gen — снимок genStats() выше, а не p.gen; hp<=0 просто гасит урон до
// конца ЭТОГО боя, не убивает полководца навсегда.
function generalDamage(gen, defS) {
  if (!gen || gen.hp <= 0) return null;
  const out = {};
  TKEYS.forEach((dt) => {
    if (defS[dt].n <= 0) { out[dt] = 0; return; }
    const share = gen.atk * (defS[dt].hp / Math.max(1, defS.totalHp));
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70;
    out[dt] = share * BATTLE_PACE / mitig;
  });
  return out;
}
// index.html:4082 damageToGeneral — получает урон от ВСЕХ родов войск
// противника усреднённо (под прикрытием собственной армии — не тонет в
// общем количестве вражеских ударов, как тонул бы обычный боец).
function damageToGeneral(gen, enemyS) {
  if (!gen || gen.hp <= 0 || enemyS.totalN <= 0) return 0;
  const avgAtk = TKEYS.reduce((s, t) => s + enemyS[t].atk, 0) / enemyS.totalN;
  const mitig = 1 + gen.def / 70;
  return avgAtk * BATTLE_PACE * 0.4 / mitig;
}
// index.html:4129 resolveBattle — Фаза 9, кусочек 1: настоящий раундовый
// бой (до ROUND_CAP схваток подряд, войска тают постепенно) вместо
// единственного обмена ударами, которым эта функция была с Фазы 4.
// Кусочек 2: добавлена погода (BATTLE_WEATHER/pickWeather/wMod/jitter,
// дословно index.html:4100-4167) — раз на весь бой, бьёт по роду войск
// бьющего в каждом ударе каждого раунда, плюс мелкий раунд-к-раунду
// разброс (roll(), шире в грозу) — и найден/исправлен честный баг
// кусочка 1: не было множителя BATTLE_PACE (index.html:4210), из-за чего
// бои решались быстрее источника (см. заголовок BATTLE_PACE выше).
// Кусочек 3: слом дисциплины (checkDiscipline/sideStats(...,broken), см.
// их заголовки выше) — тир, потерявший в этом бою больше своего порога
// (растёт по тирам, у своей расы свой род войск держится дольше), бьётся
// −30% атаки/защиты до конца боя. Проверяется КАЖДЫЙ раунд по накопленным
// потерям (attLossTotal/defLossTotal, которые уже считались и раньше —
// просто раньше никто их не читал для этого), как и в источнике.
// Кусочек 4: урон по/от полководцам в бою (generalDamage/damageToGeneral/
// genStats выше) — изначально работало на условии "игрок вообще выбрал
// полководца" (mp-pickgen, Фаза 7); отдельным более поздним кусочком
// исправлено на честное "выбрал И привёз именно в ЭТОТ бой" (attHasGen/
// defP.gen.away — см. заголовок resolvePvp ниже) — раньше полководец
// участвовал одновременно везде, где угодно, без реального перемещения.
// Кусочек 5: первый залп лучников без ответа (elf firstStrike, эпоха 5,
// volleyDamage выше) — до общей схватки, наравне с уже существовавшим
// залпом Сторожевой башни; и контрудар гарнизона (dwarf, эпоха 5, ТОЛЬКО
// при обороне) — доля урона, нанесённого атакующим в этом раунде, летит
// обратно в него же по HP-долям его войск (см. комментарий у if(defB.counter)
// внутри цикла).
// Кусочек 6: досрочное отступление атакующего (rout, index.html:4260-4265)
// — потеряв больше 72% состава, с которым вошёл в ЭТОТ бой, атакующий
// уходит, не дожидаясь ROUND_CAP и не добивая защитника. И честная ничья
// по armyPower (index.html:3902-3918/4267-4275) вместо приближения по
// остатку totalHp — если обе стороны уцелели (round cap или rout), решает
// взвешенная сила оставшихся войск, а не просто HP; полное истребление
// стороны по-прежнему решает исход напрямую, тут не изменилось ничего.
// Кусочек 7 (последний в Фазе 9): поднятие нежити прямо в бою
// (raiseSkeletons/applyRaise выше) — только undead. ЧЕСТНОЕ ДОПОЛНИТЕЛЬНОЕ
// упрощение поверх уже принятого в Фазе 6: sideStats/applyLosses получили
// пятый параметр risen (см. их заголовки) — поднятые скелеты дерутся на
// половину статов и делят с живыми ОДИН общий HP-пул, тающий одной долей,
// а не "сперва живые, потом поднятые" двумя последовательными циклами,
// как applyDamage источника. Урон от контрудара/полководцев/залпов
// по-прежнему бьёт только по живым — risen расходует только основной
// обмен урона каждого раунда.
// Фаза 6: attP/defP теперь полные объекты игрока (race+b+gen+tech), не
// голые строки расы — нужны для bonuses(attP)/bonuses(defP,true) (defP
// считается С defending=true — 5-я эпоха, defMods). См. подробный
// комментарий в _shared/rules.js.
// marchId — Фаза 9, кусочек 2: сеет battleRngMp (см. её заголовок), без
// него дефолт 0 — детерминированная (но не менее честная) погода на бой.
const ROUND_CAP = 60; // index.html:4190 while(round<60) — то же число

// =============================================================================
// Фаза 21 — бой во времени. Раньше resolvePvp() (ниже была одна функция)
// честно проигрывала все раунды до исхода ЗА ОДИН вызов, внутри одного
// applyMarchArrive — мгновенный результат, автор попросил растянуть на
// реальное время (1-2 минуты в зависимости от размера армий), с живыми
// полосками HP по ходу и возможностью отступить, не дожидаясь конца
// (см. mp-recall). Вся боевая математика НИЖЕ дословно та же, что была в
// старой resolvePvp (просто раньше это был один while(round<ROUND_CAP), а
// теперь — initPvpBattle() один раз при завязке боя (заводит state — то же,
// что раньше было локальными let/const) + runPvpBattleRounds(state,...)
// на каждый вызов mp-tick, которая продолжает с того раунда, на котором
// остановилась в прошлый раз, и обрабатывает НЕ БОЛЬШЕ roundsBudget раундов
// за один вызов (см. battleRoundsPerTick ниже) — если бой не завершился,
// applyBattleRound переставляет marches.data.battle на следующий тик через
// events (type:'battle_round'), как applyAmbientSeed сам себя переставляет.
//
// attB/defB и полководцы (genStats) считаются ЗАНОВО на каждый вызов из
// ТЕКУЩЕГО attP/defP, а не замораживаются на момент завязки боя — если
// защитник за эти 1-2 минуты успеет исследовать что-то в Академии или
// поднять уровень стены, это честно скажется на следующем же раунде уже
// идущего боя (то самое "всё на всё влияет", о чём просил автор). А вот
// САМ СОСТАВ гарнизона (кто физически стоит в строю) — заморожен на момент
// завязки: свежепостроенные/обученные за время осады войска в ЭТОТ бой не
// вступают, они просто ждут своей очереди в казармах, как и раньше (когда
// бой был мгновенным, они физически не успевали появиться за миллисекунды
// одного вызова — теперь просто явно то же самое поведение на более
// длинном окне).
//
// state — целиком JSON-сериализуемый (никаких функций/классов), лежит в
// marches.data.battle между вызовами. attGenHpFrac/defGenHpFrac — не
// абсолютное HP полководца, а ДОЛЯ от максимума (0..1): максимум может
// чуть плыть от вызова к вызову (снаряжение/бонусы живые, см. выше), доля
// же остаётся честной вне зависимости от того, что при этом произошло с
// максимумом.
function pvpTotalTroops(attUnits, defUnits) { return unitsTotal(attUnits) + unitsTotal(defUnits); }

function initPvpBattle(attUnits, attP, defUnits, defP, defWallLv, defGarrisonLv, marchId, attHasGen) {
  const attB = bonuses(attP), defB = bonuses(defP, true);
  let attU = attUnits, defU = defUnits;
  let attLossTotal = { inf: {}, arc: {}, cav: {}, sie: {} }, defLossTotal = { inf: {}, arc: {}, cav: {}, sie: {} };
  const attBroken = { inf: {}, arc: {}, cav: {}, sie: {} }, defBroken = { inf: {}, arc: {}, cav: {}, sie: {} };
  const attRisen = { inf: {}, arc: {}, cav: {}, sie: {} }, defRisen = { inf: {}, arc: {}, cav: {}, sie: {} };
  const attRaisedCum = { inf: {}, arc: {}, cav: {}, sie: {} }, defRaisedCum = { inf: {}, arc: {}, cav: {}, sie: {} };
  const rnd = battleRngMp(marchId);
  const weather = pickWeather(rnd);
  const wMod = (t) => (weather.mod && weather.mod[t]) || 1;
  const jit = weather.jitter || 0.05;
  const roll = () => 1 + (rnd() * 2 - 1) * jit;
  // index.html:4169-4188 первый залп лучников (elf firstStrike) + залп
  // Сторожевой башни защитника — ДО общей схватки, один раз на весь бой,
  // здесь и остаются (не часть раундового цикла — переносить их в
  // runPvpBattleRounds незачем, они уже применены раз и навсегда к
  // стартовому состоянию state).
  const openA = volleyDamage(attU, attP.race, attB, sideStats(defU, defP.race, defB), defWallLv, defB.wallBonus);
  if (openA) {
    const scaled = {}; TKEYS.forEach((t) => { scaled[t] = (openA[t] || 0) * wMod("arc") * roll(); });
    const l = applyLosses(defU, scaled, defP.race, defB.hp, null, rnd);
    defU = unitsSub(defU, l.units); defLossTotal = unitsAdd(defLossTotal, l.units);
  }
  const openD = volleyDamage(defU, defP.race, defB, sideStats(attU, attP.race, attB));
  if (openD) {
    const scaled = {}; TKEYS.forEach((t) => { scaled[t] = (openD[t] || 0) * wMod("arc") * roll(); });
    const l = applyLosses(attU, scaled, attP.race, attB.hp, null, rnd);
    attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
  }
  const openG = garrisonVolley(defGarrisonLv, sideStats(attU, attP.race, attB));
  if (openG) {
    const l = applyLosses(attU, openG, attP.race, attB.hp, null, rnd);
    attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
  }
  checkDiscipline(attUnits, attLossTotal, attP.race, attBroken);
  checkDiscipline(defUnits, defLossTotal, defP.race, defBroken);
  const attStartN = unitsTotal(attUnits);
  const attStartHp = sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp;
  const defStartHp = sideStats(defU, defP.race, defB, defBroken, defRisen).totalHp;
  const totalTroops = pvpTotalTroops(attUnits, defUnits);
  const ticksBudget = battleTicksBudget(totalTroops);
  return {
    marchId, round: 0, ticksBudget, weather,
    attU, defU, attStartUnits: attUnits, defStartUnits: defUnits, attStartN,
    attLossTotal, defLossTotal, attBroken, defBroken,
    attRisen, defRisen, attRaisedCum, defRaisedCum,
    attHasGen, attGenHpFrac: null, defGenHpFrac: null, attGenMaxHp: null, defGenMaxHp: null,
    attStartHp: Math.round(attStartHp), defStartHp: Math.round(defStartHp),
    attHpLeft: Math.round(attStartHp), defHpLeft: Math.round(defStartHp),
    concluded: false, winner: null,
  };
}

// Продолжает бой из state на месте, где остановился, максимум roundsBudget
// новых раундов за этот вызов (может завершиться раньше — полное
// истребление стороны/rout/ROUND_CAP, см. concluded ниже). Мутирует state и
// возвращает его же (тот же объект, что и передан — так удобнее вызывающему
// коду mp-tick, не нужно разбираться, где копия, а где нет).
// Фаза 22 — "развёртывание армии": автор попросил честную доводку полоски
// (не гадать по прошлому тренду, как раньше, а плавно доводить от уже
// показанного значения до уже ИЗВЕСТНОГО нового — оно всё равно посчитано
// сразу, 15с тут не задержка расчёта, а темп подачи готового результата).
// revealFrom* — значения ДО этого куска раундов (то, что клиент уже видит
// сейчас), state.attHpLeft/defHpLeft ниже как и раньше становятся ПОСЛЕ —
// клиент линейно интерполирует между ними от revealStart до revealAt
// (см. mpBattleInterp в index.html). Для самого первого куска (сразу после
// initPvpBattle) revealFrom = attStartHp/defStartHp (100%, войска ещё
// стоят "начальным строем") — тот самый эффект "развёртывания": реального
// урона ещё не видно, пока не домотает до настоящего первого столкновения.
function runPvpBattleRounds(state, attP, defP, defWallLv, defGarrisonLv, roundsBudget) {
  state.revealFromAttHp = state.attHpLeft; state.revealFromDefHp = state.defHpLeft;
  state.revealFromAttGenFrac = state.attGenHpFrac; state.revealFromDefGenFrac = state.defGenHpFrac;
  const attB = bonuses(attP), defB = bonuses(defP, true);
  const weather = state.weather;
  const wMod = (t) => (weather.mod && weather.mod[t]) || 1;
  const jit = weather.jitter || 0.05;
  const rnd = battleRngMp(state.marchId); // см. заголовок battleRngMp — сеет от Date.now(), каждый вызов уже свежий поток
  const roll = () => 1 + (rnd() * 2 - 1) * jit;

  const attGenMax = state.attHasGen ? genStats(attP) : null;
  const defGenMax = (defP.gen && defP.gen.away == null) ? genStats(defP) : null;
  let attGen = attGenMax ? { ...attGenMax } : null;
  let defGen = defGenMax ? { ...defGenMax } : null;
  if (attGen && state.attGenHpFrac != null) attGen.hp = Math.max(0, Math.round(attGenMax.hp * state.attGenHpFrac));
  if (defGen && state.defGenHpFrac != null) defGen.hp = Math.max(0, Math.round(defGenMax.hp * state.defGenHpFrac));

  let attU = state.attU, defU = state.defU;
  let attLossTotal = state.attLossTotal, defLossTotal = state.defLossTotal;
  const attBroken = state.attBroken, defBroken = state.defBroken;
  const attRisen = state.attRisen, defRisen = state.defRisen;
  const attRaisedCum = state.attRaisedCum, defRaisedCum = state.defRaisedCum;

  let roundsThisCall = 0;
  while (state.round < ROUND_CAP && roundsThisCall < roundsBudget) {
    const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), defS = sideStats(defU, defP.race, defB, defBroken, defRisen);
    if (attS.totalN <= 0 || defS.totalN <= 0) break;
    state.round++; roundsThisCall++;
    const dmgToDef = dmgTo(attS, defS, defWallLv, defB.wallBonus, wMod, roll());
    const dmgToAtt = dmgTo(defS, attS, 0, 0, wMod, roll());
    const defLoss = applyLosses(defU, dmgToDef, defP.race, defB.hp, defRisen, rnd);
    const attLoss = applyLosses(attU, dmgToAtt, attP.race, attB.hp, attRisen, rnd);
    defU = unitsSub(defU, defLoss.units); defLossTotal = unitsAdd(defLossTotal, defLoss.units);
    attU = unitsSub(attU, attLoss.units); attLossTotal = unitsAdd(attLossTotal, attLoss.units);
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) { defRisen[t][i] = Math.max(0, (defRisen[t][i] || 0) - (defLoss.risen[t][i] || 0)); attRisen[t][i] = Math.max(0, (attRisen[t][i] || 0) - (attLoss.risen[t][i] || 0)); } });
    if (defB.counter) {
      const totalDmgToDef = TKEYS.reduce((s, t) => s + (dmgToDef[t] || 0), 0);
      const extra = totalDmgToDef * defB.counter;
      if (extra > 0) {
        const reflect = {};
        TKEYS.forEach((t) => { if (attS[t].n > 0) reflect[t] = extra * (attS[t].hp / Math.max(1, attS.totalHp)); });
        const l = applyLosses(attU, reflect, attP.race, attB.hp, null, rnd);
        attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
      }
    }
    const genDmgToDef = generalDamage(attGen, defS);
    if (genDmgToDef) {
      const l = applyLosses(defU, genDmgToDef, defP.race, defB.hp, null, rnd);
      defU = unitsSub(defU, l.units); defLossTotal = unitsAdd(defLossTotal, l.units);
    }
    const genDmgToAtt = generalDamage(defGen, attS);
    if (genDmgToAtt) {
      const l = applyLosses(attU, genDmgToAtt, attP.race, attB.hp, null, rnd);
      attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
    }
    if (attGen) attGen.hp = Math.max(0, attGen.hp - damageToGeneral(attGen, defS));
    if (defGen) defGen.hp = Math.max(0, defGen.hp - damageToGeneral(defGen, attS));
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
    checkDiscipline(state.defStartUnits, defLossTotal, defP.race, defBroken);
    applyRaise(defP, defB, "hospital", defLossTotal, defRisen, defRaisedCum);
    applyRaise(attP, attB, "siege-attack", attLossTotal, attRisen, attRaisedCum);
    if (unitsTotal(attU) / Math.max(1, state.attStartN) < 0.28) break;
  }

  state.attU = attU; state.defU = defU;
  state.attLossTotal = attLossTotal; state.defLossTotal = defLossTotal;
  state.attGenHpFrac = attGen ? attGen.hp / Math.max(1, attGenMax.hp) : null;
  state.defGenHpFrac = defGen ? defGen.hp / Math.max(1, defGenMax.hp) : null;
  state.attGenMaxHp = attGenMax ? attGenMax.hp : null;
  state.defGenMaxHp = defGenMax ? defGenMax.hp : null;
  state.attHpLeft = Math.round(sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp);
  state.defHpLeft = Math.round(sideStats(defU, defP.race, defB, defBroken, defRisen).totalHp);
  // revealAt — тот же момент, на который progressOrFinalizePvpBattle ставит
  // следующий events(type:'battle_round') (BATTLE_TICK_SECONDS), не своя
  // отдельная константа — клиент домотает ровно к моменту, когда появится
  // СЛЕДУЮЩЕЕ настоящее число, без досрочной остановки и без зависшего
  // "почти доехал, но опоздал".
  state.revealStart = Date.now();
  state.revealAt = state.revealStart + BATTLE_TICK_SECONDS * 1000;

  const attAlive = unitsTotal(attU), defAlive = unitsTotal(defU);
  const routed = attAlive > 0 && defAlive > 0 && (attAlive / Math.max(1, state.attStartN) < 0.28);
  state.concluded = attAlive <= 0 || defAlive <= 0 || routed || state.round >= ROUND_CAP;
  if (state.concluded) {
    const powA = armyPower(attU, attB, attP.race), powD = armyPower(defU, defB, defP.race);
    state.winner = attAlive > 0 && defAlive <= 0 ? "att" : defAlive > 0 && attAlive <= 0 ? "def" : (powA > powD ? "att" : "def");
  }
  return state;
}
// Темп "живого" боя — см. миграцию 0005_realtime_battles.sql и заголовок
// выше. Тиков всего от 2 (мелкая стычка, часто хватает и одного — раунды
// заканчиваются раньше бюджета) до 8 (~2 мин, огромные армии); раундов за
// один вызов — весь ROUND_CAP, поделенный на бюджет тиков, но не меньше 4 и
// не больше 15 (иначе либо гигант тонет в раундах дольше двух минут, либо
// мелкая стычка разрешается за один вызов без единого "живого" обновления
// полоски HP — не тот эффект, ради которого всё затевалось).
const BATTLE_MIN_TICKS = 2, BATTLE_MAX_TICKS = 8;
const BATTLE_MIN_ROUNDS_PER_TICK = 4, BATTLE_MAX_ROUNDS_PER_TICK = 15;
function battleTicksBudget(totalTroops) {
  return clamp(Math.round(2 + Math.log10(Math.max(1, totalTroops))), BATTLE_MIN_TICKS, BATTLE_MAX_TICKS);
}
function battleRoundsPerTick(ticksBudget) {
  return clamp(Math.ceil(ROUND_CAP / Math.max(1, ticksBudget)), BATTLE_MIN_ROUNDS_PER_TICK, BATTLE_MAX_ROUNDS_PER_TICK);
}
// Интервал между продолжениями боя — тот же порядок, что и pg_cron
// (0003_faster_tick.sql, сейчас 15с). Не обязано совпадать один в один —
// events.fire_at сам подождёт следующего подходящего запуска mp-tick
// (плановый или толкнутый mp-join), просто не имеет смысла ставить его
// короче реального интервала тикера.
const BATTLE_TICK_SECONDS = 15;
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
// index.html:4396-4410 raiseSkeletons — Фаза 9, кусочек 7: только undead
// (B.raise/B.raiseHurt ненулевые — обе расовые эпохи 1/4 + Кармилла, у
// остальных трёх рас всегда 0, функция тут же выходит). rate — доля
// НАСМЕРТЬ погибших (dead), которая встаёт скелетами; rateHurt (венец
// "Пробуждение кургана") — ОТДЕЛЬНЫЙ параллельный источник: часть
// тяжелораненых (hurt, которые и так едут в лазарет как обычно, никуда не
// деваются) тоже встаёт на время боя. lossTotal — НАКОПЛЕННЫЕ потери с
// начала боя (attLossTotal/defLossTotal), не только этого раунда — тем же
// принципом, что и checkDiscipline. raisedCum — сколько уже поднято
// суммарно (по этому же tотal), чтобы не поднимать дважды один и тот же
// "бюджет" мертвецов: раз в раунд считаем ДОЛЖНО-БЫТЬ-ПОДНЯТО от текущего
// lossTotal и добавляем в risen только РАЗНИЦУ с уже поднятым.
function applyRaise(p, B, mode, lossTotal, risen, raisedCum) {
  const rate = B.raise || 0, rateHurt = B.raiseHurt || 0;
  if (rate <= 0 && rateHurt <= 0) return;
  const hs = hospitalSplit(p, lossTotal, mode);
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      const shouldDead = Math.floor((hs.deadUnits[t][i] || 0) * rate);
      const shouldHurt = rateHurt > 0 ? Math.floor((hs.hurtUnits[t][i] || 0) * rateHurt) : 0;
      const should = shouldDead + shouldHurt;
      const already = raisedCum[t][i] || 0;
      if (should > already) {
        risen[t][i] = (risen[t][i] || 0) + (should - already);
        raisedCum[t][i] = should;
      }
    }
  });
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
// дословно из index.html:5271-5276 — тот же гарнизон, что и в одиночной
// игре, для того же уровня лагеря. ~~BANDIT_XP не перенесён~~ — закрыто в
// Фазе 10, кусочек 1 (см. addXp/BANDIT_XP ниже, applyRaidArrive начисляет
// его победителю).
// Раньше здесь стояли 30 записей (уровни 26-30 придуманы, у источника их
// нет) — источник (index.html:5271-5272) обрывается на 25, том же
// CFG.MAX_LEVEL, что клэмпит уровень лагеря везде в одиночной игре
// (index.html:1845/3109). Лишние записи были мертвы (лагеря сеются только
// 1..5, см. seedCampsAround в mp-join), но если диапазон генерации лагерей
// когда-нибудь расширят только здесь — у клиента для уровня >25 данных бы
// не нашлось. Обрезано до тех же 25, что и в источнике.
const BANDIT_TROOPS = [20000,23000,26000,29000,32000,35000,38000,42000,46000,50000,55000,60000,66000,73000,80000,88000,96000,105000,115000,125000,135000,145000,157000,170000,185000];
const banditTier = (lv) => (lv <= 5 ? 1 : lv <= 12 ? 2 : lv <= 20 ? 3 : 4);
// Фаза 10, кусочек 1 — опыт и уровень генерала. Дословно из index.html:
// 2979-2985 (GEN_XP_NEED/genXpNeed) и addXp — тот же
// суммарный ~50.12 млн опыта к 60 уровню, интерполированный по контрольным
// точкам легендарного командира. BANDIT_XP — index.html:5272, опыт за
// победу над лагерем разбойников, тот же индекс (уровень лагеря 1..25), что
// у BANDIT_TROOPS выше.
const GEN_XP_NEED=[210,210,276,483,846,1482,2594,4541,7950,7950,7950,7950,8449,10471,12978,16084,19935,24707,30621,30621,33942,40093,47360,55943,66083,78060,92207,108919,128659,128659,142186,163193,187303,214974,246734,283186,323079,370524,424937,424937,478776,540017,609091,687001,774876,873992,985786,1111879,1254102,1660595,1909956,2196763,2526638,2906048,3921926,4612964,5425762,6381774,7506234];
const genXpNeed = (lv) => GEN_XP_NEED[lv - 1] || GEN_XP_NEED[GEN_XP_NEED.length - 1];
const BANDIT_XP=[100,120,140,160,180,200,220,240,260,300,330,360,390,420,450,480,510,540,570,600,640,680,720,760,800];
// ~~Только уровень/опыт/очки~~ — трата очков (mp-talent, Фаза 10 кусочек 2)
// и эффект вложенных талантов в bonuses() (Фаза 10, кусочек 3, см. bonuses()
// в этом же файле) закрыты; addXp тут по-прежнему только копит очки в
// p.gen.pts — трата отдельным действием, addXp её не делает и не обязана.
function addXp(p, xp) {
  if (!p.gen) p.gen = { lv: 1, xp: 0, pts: 5, tal: {}, id: null, away: null }; // самоисцеление легаси-записей
  p.gen.xp = (p.gen.xp || 0) + xp;
  const cap = Math.min(60, epochOf(p.b && p.b.hall) * 12);
  while (p.gen.xp >= genXpNeed(p.gen.lv) && p.gen.lv < cap) {
    p.gen.xp -= genXpNeed(p.gen.lv);
    p.gen.lv++; p.gen.pts = (p.gen.pts || 0) + 1;
  }
}
function banditArmy(lv) {
  const u = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) u[t][i] = 0; });
  const i = Math.max(1, Math.min(25, Math.round(lv)));
  const tier = banditTier(i), n = BANDIT_TROOPS[i - 1];
  u.inf[tier] = Math.round(n * 0.45); u.arc[tier] = Math.round(n * 0.30); u.cav[tier] = Math.round(n * 0.25);
  return u;
}
// Разбойники не имеют ни расы, ни бонусов вообще — тот же явный ноль, что
// D.B={atk:0,def:0,hp:0,matk:0,mdef:0,archer:0,raise:0} в index.html:5139
// (arriveMarch, ветка camp/fort). Явные нули, не пустой объект — sideStats
// делает "(1+B.atk)" без страховки ||0, пустой объект дал бы NaN.
const BANDIT_B = { atk: 0, def: 0, hp: 0, matk: 0, mdef: 0, archer: 0 };
// Зеркало ветки camp/fort в arriveMarch (index.html:5133-5158). Контрудара
// гарнизона нет — BANDIT_B не считает bonuses(...,true), у лагеря попросту
// не может взяться B.counter. Но собственный первый залп АТАКУЮЩЕГО (elf
// firstStrike) — не завязан на защитника: эльф стреляет первым по любой
// цели, лагерь варваров не исключение (сам лагерь ответным первым залпом не
// бьёт — у BANDIT_B нет поля firstStrike, volleyDamage тихо вернёт null).
// attP.race=null для лагеря (banditArmy) — disciplineThreshold(t,i,null)
// просто не находит расового бонуса (RACE_DISCIPLINE_BONUS[null]===
// undefined), даёт голый порог без надбавки. У самого лагеря НЕТ
// полководца (banditArmy — просто гарнизон, не игрок) — бьёт и получает
// удары только полководец АТАКУЮЩЕГО, если тот его выбрал.
//
// Фаза 21, продолжение — то же самое (живой бой во времени, полоски HP,
// отступление), что и у PvP выше (см. заголовок initPvpBattle/
// runPvpBattleRounds): initRaidBattle/runRaidBattleRounds — resumable-версия
// той же математики, что раньше была одной синхронной resolveBanditRaid().
// state named ТЕМИ ЖЕ полями, что и у PvP-версии (attHpLeft/defHpLeft/
// attStartHp/defStartHp/attGenHpFrac/defGenHpFrac/round/weather/
// retreatRequested) — здесь "def" это лагерь (BANDIT_B, без бонусов, без
// полководца — defGenHpFrac всегда null), не игрок, но клиентский
// mpHpBarHtml() ничего об этом не знает и рисует что дали, тот же код без
// раздвоения на "рендер для PvP"/"рендер для рейда". Победитель — "att" или
// "band" (не "def", как у PvP) — та же метка, что была у resolveBanditRaid,
// downstream-код (finalizeRaidBattle) сравнивает именно с "att".
function initRaidBattle(attUnits, attP, campLv, marchId, attHasGen) {
  const attB = bonuses(attP);
  const bandStart = banditArmy(campLv);
  let attU = attUnits, bandU = bandStart;
  let attLossTotal = { inf: {}, arc: {}, cav: {}, sie: {} }, bandLossTotal = { inf: {}, arc: {}, cav: {}, sie: {} };
  const attBroken = { inf: {}, arc: {}, cav: {}, sie: {} }, bandBroken = { inf: {}, arc: {}, cav: {}, sie: {} };
  // Фаза 9, кусочек 7 — только у атакующего может быть risen (undead
  // игрок); у BANDIT_B нет полей raise/raiseHurt вообще, лагерь никогда не
  // поднимает своих.
  const attRisen = { inf: {}, arc: {}, cav: {}, sie: {} }, attRaisedCum = { inf: {}, arc: {}, cav: {}, sie: {} };
  const rnd = battleRngMp(marchId);
  const weather = pickWeather(rnd);
  const wMod = (t) => (weather.mod && weather.mod[t]) || 1;
  const jit = weather.jitter || 0.05;
  const roll = () => 1 + (rnd() * 2 - 1) * jit;
  const openA = volleyDamage(attU, attP.race, attB, sideStats(bandU, null, BANDIT_B));
  if (openA) {
    const scaled = {}; TKEYS.forEach((t) => { scaled[t] = (openA[t] || 0) * wMod("arc") * roll(); });
    const l = applyLosses(bandU, scaled, null, 0, null, rnd);
    bandU = unitsSub(bandU, l.units); bandLossTotal = unitsAdd(bandLossTotal, l.units);
    checkDiscipline(bandStart, bandLossTotal, null, bandBroken);
  }
  const attStartN = unitsTotal(attUnits);
  const attStartHp = sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp;
  const bandStartHp = sideStats(bandU, null, BANDIT_B, bandBroken).totalHp;
  const ticksBudget = battleTicksBudget(unitsTotal(attUnits) + unitsTotal(bandStart));
  return {
    marchId, round: 0, ticksBudget, weather, campLv,
    attU, defU: bandU, attStartUnits: attUnits, defStartUnits: bandStart, attStartN,
    attLossTotal, defLossTotal: bandLossTotal, attBroken, defBroken: bandBroken,
    attRisen, attRaisedCum,
    attHasGen, attGenHpFrac: null, defGenHpFrac: null, attGenMaxHp: null, defGenMaxHp: null,
    attStartHp: Math.round(attStartHp), defStartHp: Math.round(bandStartHp),
    attHpLeft: Math.round(attStartHp), defHpLeft: Math.round(bandStartHp),
    concluded: false, winner: null,
  };
}

// Продолжает рейд из state — та же схема, что и runPvpBattleRounds, только
// без wall/garrison/counter/defRisen (лагерь ими не пользуется вообще).
// Фаза 22 — "развёртывание армии" (см. заголовок runPvpBattleRounds выше,
// то же самое здесь).
function runRaidBattleRounds(state, attP, roundsBudget) {
  state.revealFromAttHp = state.attHpLeft; state.revealFromDefHp = state.defHpLeft;
  state.revealFromAttGenFrac = state.attGenHpFrac; state.revealFromDefGenFrac = state.defGenHpFrac;
  const attB = bonuses(attP);
  const weather = state.weather;
  const wMod = (t) => (weather.mod && weather.mod[t]) || 1;
  const jit = weather.jitter || 0.05;
  const rnd = battleRngMp(state.marchId); // см. заголовок battleRngMp — сеет от Date.now(), каждый вызов уже свежий поток
  const roll = () => 1 + (rnd() * 2 - 1) * jit;

  const attGenMax = state.attHasGen ? genStats(attP) : null;
  let attGen = attGenMax ? { ...attGenMax } : null;
  if (attGen && state.attGenHpFrac != null) attGen.hp = Math.max(0, Math.round(attGenMax.hp * state.attGenHpFrac));

  let attU = state.attU, bandU = state.defU;
  let attLossTotal = state.attLossTotal, bandLossTotal = state.defLossTotal;
  const attBroken = state.attBroken, bandBroken = state.defBroken;
  const attRisen = state.attRisen, attRaisedCum = state.attRaisedCum;

  let roundsThisCall = 0;
  while (state.round < ROUND_CAP && roundsThisCall < roundsBudget) {
    const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), bandS = sideStats(bandU, null, BANDIT_B, bandBroken);
    if (attS.totalN <= 0 || bandS.totalN <= 0) break;
    state.round++; roundsThisCall++;
    const dmgToBand = dmgTo(attS, bandS, 0, 0, wMod, roll()); // лагерь без стены/башни
    const dmgToAtt = dmgTo(bandS, attS, 0, 0, wMod, roll());
    const bandLoss = applyLosses(bandU, dmgToBand, null, 0, null, rnd);
    const attLoss = applyLosses(attU, dmgToAtt, attP.race, attB.hp, attRisen, rnd);
    bandU = unitsSub(bandU, bandLoss.units); bandLossTotal = unitsAdd(bandLossTotal, bandLoss.units);
    attU = unitsSub(attU, attLoss.units); attLossTotal = unitsAdd(attLossTotal, attLoss.units);
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) attRisen[t][i] = Math.max(0, (attRisen[t][i] || 0) - (attLoss.risen[t][i] || 0)); });
    const genDmgToBand = generalDamage(attGen, bandS);
    if (genDmgToBand) {
      const l = applyLosses(bandU, genDmgToBand, null, 0, null, rnd);
      bandU = unitsSub(bandU, l.units); bandLossTotal = unitsAdd(bandLossTotal, l.units);
    }
    if (attGen) attGen.hp = Math.max(0, attGen.hp - damageToGeneral(attGen, bandS));
    checkDiscipline(state.defStartUnits, bandLossTotal, null, bandBroken);
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
    // index.html:5061 A.mode="hospital" — рейд на лагерь не штурм чужого
    // города, у атакующего лазарет работает как обычно (в отличие от PvP,
    // где он "siege-attack"), поэтому и raiseHurt тут для него реален.
    applyRaise(attP, attB, "hospital", attLossTotal, attRisen, attRaisedCum);
    if (unitsTotal(attU) / Math.max(1, state.attStartN) < 0.28) break; // rout, index.html:5066 — тоже roundует с бандитами
  }

  state.attU = attU; state.defU = bandU;
  state.attLossTotal = attLossTotal; state.defLossTotal = bandLossTotal;
  state.attGenHpFrac = attGen ? attGen.hp / Math.max(1, attGenMax.hp) : null;
  state.attGenMaxHp = attGenMax ? attGenMax.hp : null;
  state.attHpLeft = Math.round(sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp);
  state.defHpLeft = Math.round(sideStats(bandU, null, BANDIT_B, bandBroken).totalHp);
  state.revealStart = Date.now();
  state.revealAt = state.revealStart + BATTLE_TICK_SECONDS * 1000;

  const attAlive = unitsTotal(attU), bandAlive = unitsTotal(bandU);
  const routed = attAlive > 0 && bandAlive > 0 && (attAlive / Math.max(1, state.attStartN) < 0.28);
  state.concluded = attAlive <= 0 || bandAlive <= 0 || routed || state.round >= ROUND_CAP;
  if (state.concluded) {
    const powA = armyPower(attU, attB, attP.race), powBand = armyPower(bandU, BANDIT_B, null);
    state.winner = attAlive > 0 && bandAlive <= 0 ? "att" : bandAlive > 0 && attAlive <= 0 ? "band" : (powA > powBand ? "att" : "band");
  }
  return state;
}
// index.html:5148-5150 — та же добыча с разгромленного лагеря, что и в
// одиночной игре.
function banditLoot(campLv) {
  const base = Math.round(1800 * Math.pow(1.28, campLv - 1));
  const loot = {};
  RES.forEach((r) => { loot[r] = Math.round(base * (r === "gold" ? 0.25 : r === "stone" ? 0.6 : 1)); });
  return loot;
}
// index.html:5113-5123 — книги опыта генерала: выпадают с разгромленных
// лагерей разбойников СВЕРХ обычного опыта (bookDrop уже перенесённого
// addXp/BANDIT_XP выше), суммарная ценность = уровень_лагеря*100,
// разбивается жадно от крупного номинала к мелкому. Раньше честно не
// переносилось "по той же причине, что и BANDIT_XP" — причина исчезла в
// Фазе 10, кусочек 1 (addXp/BANDIT_XP там уже перенесены), а bookDrop
// саму так и не подключили следом — закрывается здесь.
const TOME_VALUES = [20000, 10000, 5000, 1000, 500, 100];
function bookDrop(total) {
  const drops = {};
  TOME_VALUES.forEach((v) => { while (total >= v) { drops[v] = (drops[v] || 0) + 1; total -= v; } });
  return drops;
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
  //
  // Фаза 25 — бои за точки ресурсов (RoK-механика по просьбе автора): точка
  // может быть уже занята чужим маршем (state:"gather" в тех же
  // координатах) — тогда вместо старта сбора завязывается полевой бой
  // между ДВУМЯ МАРШИРУЮЩИМИ ОТРЯДАМИ (не с домашним гарнизоном занявшего
  // точку — тот вообще не при делах), тем же движком, что и PvP/рейд
  // (initPvpBattle/runPvpBattleRounds, см. их заголовки), но wallLv/
  // garrisonLv=0 (в поле укреплений нет) и hospital-режим ОБЕИМ сторонам
  // (см. finalizeNodeBattle) — автор явно попросил "потери как при битве в
  // поле... без смертей", не siege-attack, как у штурма города.
  if (m.mode === "gather") {
    const { data: occ, error: occErr } = await admin.from("marches").select("*")
      .eq("world_id", m.world_id).eq("mode", "gather").eq("state", "gather")
      .eq("tx", m.tx).eq("ty", m.ty).neq("player_id", m.player_id).limit(1).maybeSingle();
    if (occErr) throw occErr;
    if (occ) { await applyNodeContestArrive(admin, m, occ); return; }
    await applyGatherStart(admin, m); return;
  }
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
  // Цель пропала или встала под щит уже после отправки марша — бой не
  // случается, отряд просто разворачивается (как recallMarch без боя).
  if (!defRow || defRow.shield_until > nowSec) {
    await sendSurvivorsHome(admin, m, nowSec, m.units, {});
    return;
  }

  const attP = attRow.state, defP = defRow.state;
  // Самоисцеление легаси-записей — см. тот же комментарий в mp-attack/mp-train.
  attP.race = attP.race || attRow.race;
  defP.race = defP.race || defRow.race;
  const defWallLv = (defP.b && typeof defP.b.wall === "number") ? defP.b.wall : 0;
  const defGarrisonLv = (defP.b && typeof defP.b.garrison === "number") ? defP.b.garrison : 0;
  const attHasGen = !!(m.data && m.data.has_gen);
  // Фаза 24 — извещение о завязке боя ДО первого куска раундов: обеим
  // сторонам сразу письмо "армия настигла цель, начинается развёртывание"
  // (kind:"siege_event", data.phase:"start") — та же честная информация,
  // что уже даёт "Входящие атаки" (mpRefreshIncoming) точкой на карте,
  // только теперь ещё и в почте, человеческим текстом. Письмо не про исход
  // (тот придёт отдельно, kind:"battle", см. finalizePvpBattle) — просто
  // "бой начался, идёт развёртывание", ровно то, что происходит прямо
  // сейчас (revealFrom=100% у обеих полосок, см. runPvpBattleRounds).
  const { error: startMailErr } = await admin.from("mail").insert([
    { world_id: m.world_id, player_id: attRow.id, kind: "siege_event",
      data: { phase: "start", role: "attacker", mode: "attack", opponent_id: defRow.id, opponent_nick: defRow.nick } },
    { world_id: m.world_id, player_id: defRow.id, kind: "siege_event",
      data: { phase: "start", role: "defender", mode: "attack", opponent_id: attRow.id, opponent_nick: attRow.nick } },
  ]);
  if (startMailErr) throw startMailErr;
  // Фаза 21 — завязка боя (защитник + гарнизон СНИМАЮТСЯ снимком здесь, на
  // весь бой, см. заголовок initPvpBattle/runPvpBattleRounds выше) и сразу
  // первый кусок раундов — мелкая стычка часто укладывается в один этот
  // вызов целиком (state.concluded=true), крупная — нет, тогда march
  // уходит в state:'siege' и продолжается events'ом type:'battle_round'.
  const state = initPvpBattle(m.units, attP, defP.troops, defP, defWallLv, defGarrisonLv, m.id, attHasGen);
  runPvpBattleRounds(state, attP, defP, defWallLv, defGarrisonLv, battleRoundsPerTick(state.ticksBudget));
  await progressOrFinalizePvpBattle(admin, m, attRow, defRow, attP, defP, state, nowSec);
}

// Обратная дорога — зеркало recallMarch: те же расстояние/скорость, что
// и туда (dist/spd сохранены в m.data при отправке — тот же путь назад),
// минимум 15с вместо 20с (index.html:4775 — recallMarch считает мягче
// sendMarch, тот же порог тут). Общий хвост для "боя не было" (защитник
// пропал/под щитом), для честного конца PvP-боя (finalizePvpBattle ниже) и
// для рейда на лагерь (applyRaidArrive) — раньше это было три копии одного
// и того же 6-строчного куска, теперь один.
async function sendSurvivorsHome(admin, m, nowSec, survivors, carry) {
  if (unitsTotal(survivors) <= 0) { await admin.from("marches").delete().eq("id", m.id); return; }
  const { battle, ...restData } = m.data || {};
  const dist = (m.data && m.data.dist) || 0, spd = (m.data && m.data.spd) || 1;
  const travelBack = Math.max(15, (dist / spd) * 60);
  const { error: updM } = await admin.from("marches")
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack, units: survivors, data: { ...restData, carry } }).eq("id", m.id);
  if (updM) throw updM;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "march_home", data: { march_id: m.id },
  });
  if (evErr) throw evErr;
}

// Общий "остаёмся в siege ещё на один тик" — вынесено, чтобы не дублировать
// между PvP и рейдом (см. progressOrFinalizePvpBattle/
// progressOrFinalizeRaidBattle ниже).
async function persistBattleSiege(admin, m, state, nowSec) {
  const { error: updM } = await admin.from("marches")
    .update({ state: "siege", data: { ...m.data, battle: state } }).eq("id", m.id);
  if (updM) throw updM;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + BATTLE_TICK_SECONDS) * 1000).toISOString(),
    type: "battle_round", data: { march_id: m.id },
  });
  if (evErr) throw evErr;
}

// Фаза 21 — после каждого куска раундов (первого, из applyMarchArrive, или
// продолжения, из applyBattleRound): бой либо уже завершился (concluded),
// либо нет — тогда march переходит (или остаётся) в state:'siege' с
// state боя внутри data.battle, и следующий кусок переставляется на
// events (type:'battle_round', тот же приём, что applyAmbientSeed сам себя
// переставляет) через BATTLE_TICK_SECONDS.
async function progressOrFinalizePvpBattle(admin, m, attRow, defRow, attP, defP, state, nowSec) {
  if (state.concluded) {
    // Фаза 22/23 — не финализируем МГНОВЕННО в тот же вызов, где раунд
    // "добил" исход (wipe/rout/ROUND_CAP — ИЛИ прощальный залп отступления,
    // см. applyRetreatVolley) — иначе march пропал бы из "Входящих атак"/
    // "Отрядов в поле" ДО того, как клиент успел бы доматать последнюю
    // доводку полоски (revealFrom->attHpLeft) до настоящего конца — некрасивый
    // обрыв на полпути. Один лишний цикл "остаёмся в siege"
    // (state.pendingFinalize) даёт этому последнему рывку доиграть, ПОТОМ
    // настоящий финал — автор явно попросил и на отступление тоже дать
    // те же 15с "на побег", а не рвать бой мгновенно по кнопке.
    if (!state.pendingFinalize) {
      state.pendingFinalize = true;
      await persistBattleSiege(admin, m, state, nowSec);
      return;
    }
    await finalizePvpBattle(admin, m, attRow, defRow, attP, defP, state, nowSec);
    return;
  }
  await persistBattleSiege(admin, m, state, nowSec);
}

// Честный конец PvP-боя (state.concluded===true) — дословно тот хвост, что
// раньше шёл сразу после resolvePvp() внутри applyMarchArrive, просто
// читает из state вместо result и переиспользует sendSurvivorsHome для
// дороги домой. Общий для обоих путей завершения: бой решился с первого же
// куска раундов (applyMarchArrive) или спустя несколько events'ов
// battle_round (applyBattleRound) — на исход это не влияет никак, только
// на то, сколько реального времени бой занял.
async function finalizePvpBattle(admin, m, attRow, defRow, attP, defP, state, nowSec) {
  defP.troops = unitsSub(defP.troops, state.defLossTotal);
  // Фаза 4, шестой кусочек: лазарет защитника (index.html:4351/4411-4423)
  // — часть потерь не гибнет насмерть. Слегка раненые (12%) немедленно
  // возвращаются в строй, тяжелораненые (в пределах вместимости лазарета)
  // едут в p.wounded, и только сверх вместимости гибнут по-настоящему.
  // Атакующий (mode:"siege-attack" по смыслу — марш к чужому городу) такой
  // защиты не имеет, теряет войска насмерть целиком, как и раньше.
  if (!defP.wounded) defP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!defP.wounded[t]) defP.wounded[t] = {}; });
  const hs = hospitalSplit(defP, state.defLossTotal, "hospital");
  defP.troops = unitsAdd(defP.troops, hs.slightUnits);
  defP.wounded = unitsAdd(defP.wounded, hs.hurtUnits);
  const survivors = unitsSub(state.attStartUnits, state.attLossTotal);
  let carry = {};

  // Фаза 10, кусочек 1 — опыт генерала за победу над игроком (только
  // атакующему, зеркало addXp(att,...) в battleCity, index.html:5093 —
  // защитник опыта за отражение штурма не получает, как и в клиенте).
  if (state.winner === "att") {
    addXp(attP, Math.round(200 + (defP.b && defP.b.hall || 0) * 60));
    // index.html:5385-5391 battleCity — грабёж склада защитника. syncRes(defP)
    // сначала — иначе грабился бы устаревший снимок с момента последнего
    // ДЕЙСТВИЯ защитника, а не реальный на секунду ЗАВЕРШЕНИЯ боя (не
    // завязки — за 1-2 минуты боя защитник мог и подкопить ресурсов).
    syncRes(defP, nowSec);
    let carryCap = 0;
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) carryCap += (survivors[t][i] || 0) * TROOP_TYPES[t].load * TIER_MULT[i - 1] * troopMod(attP.race, t, "load"); });
    const prot = capacity(defP);
    RES.forEach((r) => {
      const take = Math.min(Math.max(0, (defP.res[r] || 0) - prot[r]), carryCap / 4);
      carry[r] = Math.round(take);
      defP.res[r] = (defP.res[r] || 0) - take;
    });
    // index.html:5393-5403 — полный разгром бьёт по прочности стены и при
    // обнулении переносит столицу защитника (relocate). Сознательно НЕ
    // переносится — щит мира и перенос столицы исключены из общего мира
    // ещё раньше (не были закончены даже в одиночной игре), тот же
    // принцип, что и у wallHp вообще.
  }
  // index.html:4950-4957 EV.home — генерал возвращается домой вместе с
  // отрядом НЕЗАВИСИМО от исхода похода. Если весь посланный отряд полёг
  // (survivors пуст), sendSurvivorsHome удаляет марш немедленно, минуя
  // домашний путь и applyMarchHome (см. её заголовок) — той развязки, что
  // освобождает away, тогда не будет вовсе, поэтому освобождаем прямо
  // здесь, пока ещё знаем survivors. Проверка на attP.gen.away===m.id — не
  // отобрать генерала у НОВОГО похода из-за завершения старого.
  if (state.attHasGen && unitsTotal(survivors) <= 0 && attP.gen && attP.gen.away === m.id) attP.gen.away = null;
  const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
  if (updA) throw updA;
  const { error: updD } = await admin.from("players").update({ state: defP, updated_at: new Date().toISOString() }).eq("id", defRow.id);
  if (updD) throw updD;

  const summary = {
    winner: state.winner, sent: state.attStartUnits, attLoss: state.attLossTotal, defLoss: state.defLossTotal,
    attHpLeft: state.attHpLeft, defHpLeft: state.defHpLeft,
    defDead: hs.dead, defHurt: hs.hurt, defSlight: hs.slight,
    rounds: state.round, weather: state.weather.id, weatherName: state.weather.name,
    loot: carry, // {} при поражении/ничьей — RES.forEach выше не заполнил ни рубля
    retreated: !!state.retreated, // Фаза 21 — честное отступление кнопкой, не обычное поражение (см. mp-recall)
  };
  const mailRows = [
    { world_id: m.world_id, player_id: attRow.id, kind: "battle", data: { role: "attacker", opponent_id: defRow.id, opponent_nick: defRow.nick, ...summary } },
    { world_id: m.world_id, player_id: defRow.id, kind: "battle", data: { role: "defender", opponent_id: attRow.id, opponent_nick: attRow.nick, ...summary } },
  ];
  const { error: mailErr } = await admin.from("mail").insert(mailRows);
  if (mailErr) throw mailErr;

  await sendSurvivorsHome(admin, m, nowSec, survivors, carry);
}

// Фаза 21 — продолжение боя, растянутого на несколько тиков (см. заголовок
// initPvpBattle/runPvpBattleRounds и миграцию 0005). Один общий тип события
// (type:'battle_round') на оба режима — PvP и рейд на лагерь — различаются
// по m.mode, тем же способом, что и applyMarchArrive выше различает
// gather/raid/attack. Каждая ветка перечитывает игроков заново на каждый
// вызов (bonuses/полководцы честно "живые"), но состав войск/потери/
// дисциплину/раунд берёт из m.data.battle, куда их оставил предыдущий вызов.
//
// Фаза 23 — "прощальный залп". Автор: "при отступлении игрок получает ещё
// урон в один раунд, но не отвечает, так как отступает" — армия уже
// повернула спиной, защитник (или лагерь) бьёт вслед, встречного удара нет.
// Тот же dmgTo/applyLosses, что и обычный раунд боя, но только ОДНА
// сторона (defS→attS), вторая половина обмена (attS→defS) просто не
// считается вовсе — не "урон умножен на 0", а честно не вызвана.
function applyRetreatVolley(state, attP, defP) {
  state.revealFromAttHp = state.attHpLeft; state.revealFromDefHp = state.defHpLeft;
  state.revealFromAttGenFrac = state.attGenHpFrac; state.revealFromDefGenFrac = state.defGenHpFrac;

  const attB = bonuses(attP), defB = bonuses(defP, true);
  const weather = state.weather;
  const wMod = (t) => (weather.mod && weather.mod[t]) || 1;
  const jit = weather.jitter || 0.05;
  const rnd = battleRngMp(state.marchId);
  const roll = () => 1 + (rnd() * 2 - 1) * jit;

  const attGenMax = state.attHasGen ? genStats(attP) : null;
  const defGenMax = (defP.gen && defP.gen.away == null) ? genStats(defP) : null;
  let attGen = attGenMax ? { ...attGenMax } : null;
  let defGen = defGenMax ? { ...defGenMax } : null;
  if (attGen && state.attGenHpFrac != null) attGen.hp = Math.max(0, Math.round(attGenMax.hp * state.attGenHpFrac));
  if (defGen && state.defGenHpFrac != null) defGen.hp = Math.max(0, Math.round(defGenMax.hp * state.defGenHpFrac));

  let attU = state.attU, defU = state.defU;
  let attLossTotal = state.attLossTotal;
  const attBroken = state.attBroken, defBroken = state.defBroken;
  const attRisen = state.attRisen, defRisen = state.defRisen;

  const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), defS = sideStats(defU, defP.race, defB, defBroken, defRisen);
  if (attS.totalN > 0 && defS.totalN > 0) {
    state.round++;
    // Стена/башня в dmgTo митигируют урон, получаемый ЦЕЛЬЮ (см. её 3-й/4-й
    // параметр в runPvpBattleRounds выше) — здесь цель атакующий, у него их
    // никогда не было, поэтому 0,0, тем же порядком, что и dmgToAtt там.
    const dmgToAtt = dmgTo(defS, attS, 0, 0, wMod, roll());
    const attLoss = applyLosses(attU, dmgToAtt, attP.race, attB.hp, attRisen, rnd);
    attU = unitsSub(attU, attLoss.units); attLossTotal = unitsAdd(attLossTotal, attLoss.units);
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) attRisen[t][i] = Math.max(0, (attRisen[t][i] || 0) - (attLoss.risen[t][i] || 0)); });
    // Полководец защитника ещё бьёт вслед; полководец атакующего сам не
    // бьёт (нет generalDamage(attGen,defS)), но всё ещё под общим огнём —
    // как и рядовые бойцы, получает урон пассивно.
    const genDmgToAtt = generalDamage(defGen, attS);
    if (genDmgToAtt) {
      const l = applyLosses(attU, genDmgToAtt, attP.race, attB.hp, null, rnd);
      attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
    }
    if (attGen) attGen.hp = Math.max(0, attGen.hp - damageToGeneral(attGen, defS));
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
  }

  state.attU = attU; state.attLossTotal = attLossTotal;
  if (attGen) { state.attGenHpFrac = attGen.hp / Math.max(1, attGenMax.hp); state.attGenMaxHp = attGenMax.hp; }
  state.attHpLeft = Math.round(sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp);
  state.defHpLeft = Math.round(sideStats(defU, defP.race, defB, defBroken, defRisen).totalHp);
  state.revealStart = Date.now();
  state.revealAt = state.revealStart + BATTLE_TICK_SECONDS * 1000;
}
// Зеркало applyRetreatVolley выше, для рейдов — лагерь бьёт вслед
// отступающему, у него нет полководца (только generalDamage от attGen тут
// вообще неприменим — бить некому, лагерь получает урон только своими
// бойцами, которых в retreat-раунде не бьют вовсе).
function applyRaidRetreatVolley(state, attP) {
  state.revealFromAttHp = state.attHpLeft; state.revealFromDefHp = state.defHpLeft;
  state.revealFromAttGenFrac = state.attGenHpFrac; state.revealFromDefGenFrac = state.defGenHpFrac;

  const attB = bonuses(attP);
  const weather = state.weather;
  const wMod = (t) => (weather.mod && weather.mod[t]) || 1;
  const jit = weather.jitter || 0.05;
  const rnd = battleRngMp(state.marchId);
  const roll = () => 1 + (rnd() * 2 - 1) * jit;

  const attGenMax = state.attHasGen ? genStats(attP) : null;
  let attGen = attGenMax ? { ...attGenMax } : null;
  if (attGen && state.attGenHpFrac != null) attGen.hp = Math.max(0, Math.round(attGenMax.hp * state.attGenHpFrac));

  let attU = state.attU, bandU = state.defU;
  let attLossTotal = state.attLossTotal;
  const attBroken = state.attBroken, bandBroken = state.defBroken;
  const attRisen = state.attRisen;

  const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), bandS = sideStats(bandU, null, BANDIT_B, bandBroken);
  if (attS.totalN > 0 && bandS.totalN > 0) {
    state.round++;
    const dmgToAtt = dmgTo(bandS, attS, 0, 0, wMod, roll());
    const attLoss = applyLosses(attU, dmgToAtt, attP.race, attB.hp, attRisen, rnd);
    attU = unitsSub(attU, attLoss.units); attLossTotal = unitsAdd(attLossTotal, attLoss.units);
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) attRisen[t][i] = Math.max(0, (attRisen[t][i] || 0) - (attLoss.risen[t][i] || 0)); });
    if (attGen) attGen.hp = Math.max(0, attGen.hp - damageToGeneral(attGen, bandS));
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
  }

  state.attU = attU; state.attLossTotal = attLossTotal;
  if (attGen) { state.attGenHpFrac = attGen.hp / Math.max(1, attGenMax.hp); state.attGenMaxHp = attGenMax.hp; }
  state.attHpLeft = Math.round(sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp);
  state.defHpLeft = Math.round(sideStats(bandU, null, BANDIT_B, bandBroken).totalHp);
  state.revealStart = Date.now();
  state.revealAt = state.revealStart + BATTLE_TICK_SECONDS * 1000;
}
async function applyBattleRound(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  // Марш мог быть отозван мид-боя (mp-recall переводит его в 'back' и сам
  // честно завершает бой досрочно, см. её заголовок) или state.concluded
  // уже разобран каким-то прошлым (задвоенным?) вызовом — тот же принцип
  // самоохраны, что и m.state!=="go" в applyMarchArrive.
  if (!m || m.state !== "siege" || !m.data || !m.data.battle) return;
  if (m.mode === "raid") { await applyRaidBattleRound(admin, m); return; }
  // Фаза 25 — бой за точку ресурсов: атакующий марш остаётся mode:"gather"
  // на всём протяжении (не переименовывается в "attack"), state:"siege"
  // отличает его от обычного "дошёл до точки — начал собирать".
  if (m.mode === "gather") { await applyNodeBattleRound(admin, m); return; }
  await applyPvpBattleRound(admin, m);
}

async function applyPvpBattleRound(admin, m) {
  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; } // хозяина нет — некому возвращать
  const { data: defRow, error: dErr } = await admin.from("players").select("*").eq("id", m.data.defender_id).maybeSingle();
  if (dErr) throw dErr;
  if (!defRow) {
    // В этой игре строки players не удаляются никогда — на практике сюда
    // дойти нельзя, но лучше честно оборвать бой и вернуть уцелевших на
    // текущий момент, чем упасть на null.b/null.race где-то внутри bonuses().
    const state = m.data.battle;
    await sendSurvivorsHome(admin, m, Date.now() / 1000, unitsSub(state.attStartUnits, state.attLossTotal), {});
    return;
  }

  const attP = attRow.state, defP = defRow.state;
  attP.race = attP.race || attRow.race;
  defP.race = defP.race || defRow.race;
  const defWallLv = (defP.b && typeof defP.b.wall === "number") ? defP.b.wall : 0;
  const defGarrisonLv = (defP.b && typeof defP.b.garrison === "number") ? defP.b.garrison : 0;
  const state = m.data.battle;
  const nowSec = Date.now() / 1000;
  // Фаза 21 — отступление кнопкой (mp-recall помечает m.data.battle.
  // retreatRequested, см. её заголовок). Бой обрывается ПРЯМО СЕЙЧАС, без
  // единого нового раунда — "отступить, пока не поздно" в буквальном
  // смысле, а не "доиграть этот раунд и уйти". Отступивший забирает ровно
  // то, что уцелело к моменту нажатия кнопки; защитник формально победитель
  // (штурм не удался), но без трофеев — как и при обычном поражении
  // атакующего (loot в finalizePvpBattle полагается только winner:"att").
  if (state.retreatRequested && !state.concluded) {
    // Фаза 24 — извещение о начале отступления, тем же приёмом, что и
    // "начинается развёртывание" в applyMarchArrive: обеим сторонам сразу,
    // ДО прощального залпа — "неудача уже решена, но поле боя ещё не
    // покинуто" (ровно то, что и происходит следующие 15с, см. заголовок
    // progressOrFinalizePvpBattle насчёт лишнего цикла).
    const { error: retreatMailErr } = await admin.from("mail").insert([
      { world_id: m.world_id, player_id: attRow.id, kind: "siege_event",
        data: { phase: "retreat", role: "attacker", mode: "attack", opponent_id: defRow.id, opponent_nick: defRow.nick } },
      { world_id: m.world_id, player_id: defRow.id, kind: "siege_event",
        data: { phase: "retreat", role: "defender", mode: "attack", opponent_id: attRow.id, opponent_nick: attRow.nick } },
    ]);
    if (retreatMailErr) throw retreatMailErr;
    // Фаза 23 — прощальный залп (см. её заголовок), потом бой завершается,
    // но НЕ мгновенно: как и естественный конец (Фаза 22), даёт клиенту
    // один лишний цикл в state:"siege", чтобы честно доиграть полоску и
    // показать "Отступление" — см. снятый ниже бонус !state.retreated в
    // progressOrFinalizePvpBattle (раньше отступление финализировалось
    // мгновенно, автор попросил тоже дать ему 15с "на побег").
    applyRetreatVolley(state, attP, defP);
    state.concluded = true; state.winner = "def"; state.retreated = true;
  } else if (!state.concluded) {
    // !state.concluded — Фаза 22: если бой уже завершился ПРОШЛЫМ вызовом
    // (state.pendingFinalize=true, см. progressOrFinalizePvpBattle) и этот
    // вызов — тот самый "лишний" цикл ради доигрывания полоски, новых
    // раундов считать не нужно (и нельзя — при исходе "rout" обе стороны
    // всё ещё живы, повторный запуск while-цикла продолжил бы бой дальше
    // точки отступления, что неверно).
    runPvpBattleRounds(state, attP, defP, defWallLv, defGarrisonLv, battleRoundsPerTick(state.ticksBudget));
  }
  await progressOrFinalizePvpBattle(admin, m, attRow, defRow, attP, defP, state, nowSec);
}

// Фаза 21 — зеркало applyPvpBattleRound, для рейдов на лагерь варваров:
// лагерь — не игрок, у него нет строки players/RLS, поэтому здесь нет
// второго db-fetch и "живых" бонусов защитника — BANDIT_B/banditArmy(campLv)
// уже зафиксированы в state на завязке (initRaidBattle), как и раньше.
async function applyRaidBattleRound(admin, m) {
  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; }

  const attP = attRow.state;
  attP.race = attP.race || attRow.race;
  const state = m.data.battle;
  const nowSec = Date.now() / 1000;
  // Отступление кнопкой — тот же приём, что и у PvP-версии выше (см. её
  // комментарий и applyRetreatVolley/applyRaidRetreatVolley): один
  // прощальный залп лагеря вслед, потом "band" формально победитель (рейд
  // не удался, без трофеев), финал — не мгновенно, тем же лишним циклом.
  if (state.retreatRequested && !state.concluded) {
    // Фаза 24 — то же извещение, что и у PvP (см. applyPvpBattleRound).
    const { error: retreatMailErr } = await admin.from("mail").insert({
      world_id: m.world_id, player_id: attRow.id, kind: "siege_event",
      data: { phase: "retreat", role: "attacker", mode: "raid", camp_lv: state.campLv },
    });
    if (retreatMailErr) throw retreatMailErr;
    applyRaidRetreatVolley(state, attP);
    state.concluded = true; state.winner = "band"; state.retreated = true;
  } else if (!state.concluded) {
    // !state.concluded — Фаза 22, см. тот же комментарий в applyPvpBattleRound.
    runRaidBattleRounds(state, attP, battleRoundsPerTick(state.ticksBudget));
  }
  await progressOrFinalizeRaidBattle(admin, m, attRow, attP, state, nowSec);
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
    // 4959-4964). gather/raid-марши несут m.data.carry с самого начала
    // (см. applyGathered/applyRaidArrive); PvP-марши — с грабежа склада
    // при победе (см. applyMarchArrive выше, добыча/отсутствие добычи
    // одним и тем же полем carry). Если поля нет вовсе (m.data.carry
    // undefined) — ничего не меняется, как и раньше.
    if (m.data && m.data.carry) {
      RES.forEach((r) => { if (m.data.carry[r]) p.res[r] = (p.res[r] || 0) + m.data.carry[r]; });
    }
    // index.html:4950-4957 EV.home — генерал возвращается вместе с
    // отрядом независимо от того, как поход закончился (дошёл сам, был
    // отозван, или это выжившие после боя — applyMarchArrive/
    // applyRaidArrive добираются сюда обычным путём марша "back", только
    // полный ноль выживших освобождает away раньше, см. их заголовки).
    // Проверка на p.gen.away===m.id, а не просто m.data.has_gen — не
    // отобрать генерала у НОВОГО похода из-за возврата старого.
    if (m.data && m.data.has_gen && p.gen && p.gen.away === m.id) p.gen.away = null;
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

// Фаза 25 — завязка боя за точку ресурсов (см. комментарий в
// applyMarchArrive выше). "occ" — марш, УЖЕ стоящий на точке (state:
// "gather"), не игрок как таковой — домашний гарнизон занявшего точку
// вообще не участвует, дерётся только то, что физически там стоит.
async function applyNodeContestArrive(admin, m, occ) {
  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; }
  const { data: occRow, error: oErr } = await admin.from("players").select("*").eq("id", occ.player_id).maybeSingle();
  if (oErr) throw oErr;
  // Хозяин точки испарился (строки players не удаляются никогда — на
  // практике сюда дойти нельзя, честная защита от null вместо падения) —
  // начинаем сбор как обычно, как будто точка свободна.
  if (!occRow) { await applyGatherStart(admin, m); return; }

  const attP = attRow.state, occP = occRow.state;
  attP.race = attP.race || attRow.race;
  occP.race = occP.race || occRow.race;
  const attHasGen = !!(m.data && m.data.has_gen);
  const occHasGen = !!(occ.data && occ.data.has_gen);

  // Фаза 24 — то же извещение "начинается развёртывание", что и у PvP/
  // рейда (см. их комментарии в applyMarchArrive/applyRaidArrive).
  const { error: startMailErr } = await admin.from("mail").insert([
    { world_id: m.world_id, player_id: attRow.id, kind: "siege_event",
      data: { phase: "start", role: "attacker", mode: "node", opponent_id: occRow.id, opponent_nick: occRow.nick } },
    { world_id: m.world_id, player_id: occRow.id, kind: "siege_event",
      data: { phase: "start", role: "defender", mode: "node", opponent_id: attRow.id, opponent_nick: attRow.nick } },
  ]);
  if (startMailErr) throw startMailErr;

  // wallLv/garrisonLv=0 — в чистом поле укреплений нет ни у кого, тот же
  // движок, что и у PvP-штурма (initPvpBattle/runPvpBattleRounds), просто
  // без городских бонусов защитника. occMarchId/occPlayerId — чем
  // applyNodeBattleRound/finalizeNodeBattle опознают чужой марш при
  // продолжении (в отличие от PvP, тут "защитник" — не m.data.defender_id,
  // а конкретный марш occ, домашняя строка игрока для боя не более важна,
  // чем у атакующего).
  const state = initPvpBattle(m.units, attP, occ.units, occP, 0, 0, m.id, attHasGen);
  state.occMarchId = occ.id; state.occPlayerId = occRow.id; state.defHasGen = occHasGen;
  runPvpBattleRounds(state, attP, occP, 0, 0, battleRoundsPerTick(state.ticksBudget));
  await progressOrFinalizeNodeBattle(admin, m, attRow, occRow, attP, occP, state, Date.now() / 1000);
}

// Продолжение боя за точку — зеркало applyPvpBattleRound, читает occRow по
// state.occPlayerId (не по m.data.defender_id, которого тут нет вовсе).
async function applyNodeBattleRound(admin, m) {
  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; }
  const state = m.data.battle;
  const { data: occRow, error: oErr } = await admin.from("players").select("*").eq("id", state.occPlayerId).maybeSingle();
  if (oErr) throw oErr;
  if (!occRow) {
    await sendSurvivorsHome(admin, m, Date.now() / 1000, unitsSub(state.attStartUnits, state.attLossTotal), {});
    return;
  }

  const attP = attRow.state, occP = occRow.state;
  attP.race = attP.race || attRow.race;
  occP.race = occP.race || occRow.race;
  const nowSec = Date.now() / 1000;
  if (state.retreatRequested && !state.concluded) {
    const { error: retreatMailErr } = await admin.from("mail").insert([
      { world_id: m.world_id, player_id: attRow.id, kind: "siege_event",
        data: { phase: "retreat", role: "attacker", mode: "node", opponent_id: occRow.id, opponent_nick: occRow.nick } },
      { world_id: m.world_id, player_id: occRow.id, kind: "siege_event",
        data: { phase: "retreat", role: "defender", mode: "node", opponent_id: attRow.id, opponent_nick: attRow.nick } },
    ]);
    if (retreatMailErr) throw retreatMailErr;
    applyRetreatVolley(state, attP, occP);
    state.concluded = true; state.winner = "def"; state.retreated = true;
  } else if (!state.concluded) {
    runPvpBattleRounds(state, attP, occP, 0, 0, battleRoundsPerTick(state.ticksBudget));
  }
  await progressOrFinalizeNodeBattle(admin, m, attRow, occRow, attP, occP, state, nowSec);
}

// Зеркало progressOrFinalizePvpBattle — тот же лишний цикл ради доигрывания
// полоски (Фаза 22/23), см. её подробный комментарий. Марш-оккупант (occ)
// перечитывается заново только на настоящем финале — на промежуточных
// раундах его состав живёт только внутри state.defU, сама строка marches
// оккупанта не трогается вплоть до исхода.
async function progressOrFinalizeNodeBattle(admin, m, attRow, occRow, attP, occP, state, nowSec) {
  if (state.concluded) {
    if (!state.pendingFinalize) {
      state.pendingFinalize = true;
      await persistBattleSiege(admin, m, state, nowSec);
      return;
    }
    const { data: occMarch, error: omErr } = await admin.from("marches").select("*").eq("id", state.occMarchId).maybeSingle();
    if (omErr) throw omErr;
    if (!occMarch) {
      // Марш-оккупант пропал между боем и финалом (честная защита —
      // recall блокирует state:"siege" тем же способом, что и у PvP, но
      // на практике лучше не падать на null). Атакующий получает то, что
      // уцелело, точка остаётся ничьей.
      await sendSurvivorsHome(admin, m, nowSec, unitsSub(state.attStartUnits, state.attLossTotal), {});
      return;
    }
    await finalizeNodeBattle(admin, m, attRow, occRow, occMarch, attP, occP, state, nowSec);
    return;
  }
  await persistBattleSiege(admin, m, state, nowSec);
}

// Честный конец боя за точку. RoK-механика по просьбе автора: бой решает
// ТОЛЬКО право сбора — hospital-режим ОБЕИМ сторонам (не siege-attack, как
// у штурма города — там гибнет насмерть только атакующий), без грабежа
// склада (тут нечего грабить, точка — не чей-то город). Победитель
// остаётся собирать (его марш продолжает уже идущий отсчёт, если он и был
// оккупантом, либо стартует новый — если атакующий отбил точку), проигравший
// уходит домой с тем, что уцелело.
async function finalizeNodeBattle(admin, m, attRow, occRow, occMarch, attP, occP, state, nowSec) {
  if (!attP.wounded) attP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!attP.wounded[t]) attP.wounded[t] = {}; });
  if (!occP.wounded) occP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!occP.wounded[t]) occP.wounded[t] = {}; });

  const attHs = hospitalSplit(attP, state.attLossTotal, "hospital");
  attP.troops = unitsAdd(attP.troops, attHs.slightUnits);
  attP.wounded = unitsAdd(attP.wounded, attHs.hurtUnits);
  const occHs = hospitalSplit(occP, state.defLossTotal, "hospital");
  occP.troops = unitsAdd(occP.troops, occHs.slightUnits);
  occP.wounded = unitsAdd(occP.wounded, occHs.hurtUnits);

  const attSurvivors = unitsSub(state.attStartUnits, state.attLossTotal);
  const occSurvivors = unitsSub(state.defStartUnits, state.defLossTotal);

  if (state.attHasGen && unitsTotal(attSurvivors) <= 0 && attP.gen && attP.gen.away === m.id) attP.gen.away = null;
  if (state.defHasGen && unitsTotal(occSurvivors) <= 0 && occP.gen && occP.gen.away === occMarch.id) occP.gen.away = null;

  const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
  if (updA) throw updA;
  const { error: updO } = await admin.from("players").update({ state: occP, updated_at: new Date().toISOString() }).eq("id", occRow.id);
  if (updO) throw updO;

  const summary = {
    winner: state.winner, sent: state.attStartUnits, attLoss: state.attLossTotal, defLoss: state.defLossTotal,
    attHpLeft: state.attHpLeft, defHpLeft: state.defHpLeft,
    rounds: state.round, weather: state.weather.id, weatherName: state.weather.name,
    retreated: !!state.retreated, res: (m.data && m.data.res) || null,
  };
  const mailRows = [
    { world_id: m.world_id, player_id: attRow.id, kind: "node_battle", data: { role: "attacker", opponent_id: occRow.id, opponent_nick: occRow.nick, ...summary } },
    { world_id: m.world_id, player_id: occRow.id, kind: "node_battle", data: { role: "defender", opponent_id: attRow.id, opponent_nick: attRow.nick, ...summary } },
  ];
  const { error: mailErr } = await admin.from("mail").insert(mailRows);
  if (mailErr) throw mailErr;

  // Марш-оккупант в любом исходе теряет только то, что реально полегло в
  // этом бою (occSurvivors) — его units обновляем в базе всегда, отдельно
  // от того, кто победил.
  const { error: updOccM } = await admin.from("marches").update({ units: occSurvivors }).eq("id", occMarch.id);
  if (updOccM) throw updOccM;

  if (state.winner === "att") {
    // Атакующий отбил точку — оккупант уходит домой с уцелевшими, атакующий
    // сам занимает место и стартует сбор (тот же applyGatherStart, что и у
    // обычного прихода на свободную точку). data.battle — уже отыгранное
    // состояние боя — вычищаем явно, иначе повисло бы мёртвым грузом в
    // строке до следующего sendSurvivorsHome (та чистит battle сама, но
    // applyGatherStart/applyGathered — нет, не их забота).
    await sendSurvivorsHome(admin, occMarch, nowSec, occSurvivors, {});
    const { battle, ...cleanData } = m.data || {};
    const { error: updAttM } = await admin.from("marches").update({ units: attSurvivors, data: cleanData }).eq("id", m.id);
    if (updAttM) throw updAttM;
    await applyGatherStart(admin, { ...m, data: cleanData });
  } else {
    // Оккупант устоял — продолжает УЖЕ ИДУЩИЙ отсчёт сбора как ни в чём не
    // бывало (t0/t1/state не трогаем, только что обновлённый units уже
    // учитывает потери). Атакующий уходит домой с тем, что уцелело от штурма.
    await sendSurvivorsHome(admin, m, nowSec, attSurvivors, {});
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
  const attHasGen = !!(m.data && m.data.has_gen);
  // Лагерь уже разгромлен кем-то другим, пока отряд шёл — бой не
  // случается, отряд просто разворачивается пустым (как gather на
  // истощённую точку, как attack на пропавшего защитника).
  if (!(cell && (cell.t === "camp" || cell.t === "fort"))) {
    await sendSurvivorsHome(admin, m, nowSec, m.units, {});
    return;
  }

  const campLv = (m.data && m.data.camp_lv) || 1;
  // Фаза 24 — то же извещение "начинается развёртывание", что и у PvP (см.
  // её комментарий в applyMarchArrive) — только одной стороне: у лагеря
  // варваров нет игрока, некому слать вторую копию.
  const { error: startMailErr } = await admin.from("mail").insert({
    world_id: m.world_id, player_id: attRow.id, kind: "siege_event",
    data: { phase: "start", role: "attacker", mode: "raid", camp_lv: campLv },
  });
  if (startMailErr) throw startMailErr;
  // Фаза 21 — та же завязка "первый кусок раундов сразу, дальше по
  // необходимости" (см. заголовок initRaidBattle/runRaidBattleRounds выше и
  // applyMarchArrive насчёт PvP-версии) — мелкий лагерь часто укладывается
  // в этот один вызов целиком, крупный форт растягивается через
  // state:'siege' + events (type:'battle_round'), тем же кодом, что и PvP.
  const state = initRaidBattle(m.units, attP, campLv, m.id, attHasGen);
  runRaidBattleRounds(state, attP, battleRoundsPerTick(state.ticksBudget));
  await progressOrFinalizeRaidBattle(admin, m, attRow, attP, state, nowSec);
}

// Фаза 21 — зеркало progressOrFinalizePvpBattle выше, для рейдов. Фаза 22:
// та же отложенная финализация на один лишний цикл (state.pendingFinalize),
// чтобы клиент успел доиграть последнюю доводку полоски — см. подробный
// комментарий в progressOrFinalizePvpBattle.
async function progressOrFinalizeRaidBattle(admin, m, attRow, attP, state, nowSec) {
  if (state.concluded) {
    // Фаза 23 — отступление тоже ждёт лишний цикл, см. progressOrFinalizePvpBattle.
    if (!state.pendingFinalize) {
      state.pendingFinalize = true;
      await persistBattleSiege(admin, m, state, nowSec);
      return;
    }
    await finalizeRaidBattle(admin, m, attRow, attP, state, nowSec);
    return;
  }
  await persistBattleSiege(admin, m, state, nowSec);
}

// Честный конец рейда (state.concluded===true) — дословно тот же хвост, что
// раньше шёл сразу после resolveBanditRaid() внутри applyRaidArrive, просто
// читает из state вместо result. cellX/cellY/campLv берутся из m.data —
// они не меняются за время боя (тот же снимок, что и на отправке, см.
// mp-raid), поэтому их не нужно нести в самом state.
async function finalizeRaidBattle(admin, m, attRow, attP, state, nowSec) {
  const hs = hospitalSplit(attP, state.attLossTotal, "hospital");
  attP.troops = unitsAdd(attP.troops, hs.slightUnits);
  attP.wounded = unitsAdd(attP.wounded, hs.hurtUnits);
  const survivors = unitsSub(state.attStartUnits, state.attLossTotal);

  const cellX = m.data && m.data.cell_x, cellY = m.data && m.data.cell_y;
  const campLv = (m.data && m.data.camp_lv) || 1;
  let carry = {}, tomeDrops = {};
  if (state.winner === "att") {
    carry = banditLoot(campLv);
    addXp(attP, BANDIT_XP[Math.max(1, Math.min(25, campLv)) - 1]); // Фаза 10, кусочек 1 (25 = CFG.MAX_LEVEL, см. BANDIT_TROOPS выше)
    // index.html:5074-5077 — книги опыта СВЕРХ обычного addXp выше.
    tomeDrops = bookDrop(campLv * 100);
    if (!attP.tomes) attP.tomes = {};
    for (const v in tomeDrops) attP.tomes[v] = (attP.tomes[v] || 0) + tomeDrops[v];
    await admin.from("map_cells").delete().eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY);
    // Фаза 8, кусочек 3 — зеркало mapDelete+schedule(CFG.RESPAWN_CAMP,
    // "respawn",...) из index.html (arriveMarch, camp/fort-ветка,
    // index.html:5151-5152).
    await admin.from("events").insert({
      world_id: m.world_id, fire_at: new Date((nowSec + CAMP_RESPAWN_SEC) * 1000).toISOString(),
      type: "camp_respawn", data: { x: cellX, y: cellY },
    });
  }

  const { error: mailErr } = await admin.from("mail").insert({
    world_id: m.world_id, player_id: attRow.id, kind: "raid",
    data: {
      camp_lv: campLv, win: state.winner === "att", loot: carry, tomes: tomeDrops,
      attLoss: state.attLossTotal, dead: hs.dead, hurt: hs.hurt, slight: hs.slight, rounds: state.round,
      retreated: !!state.retreated, // Фаза 21 — честное отступление кнопкой, не обычное поражение (см. mp-recall)
    },
  });
  if (mailErr) throw mailErr;

  // index.html:4950-4957 — та же логика, что и в applyMarchArrive выше
  // (см. её заголовок): если весь отряд полёг, домашнего пути и
  // applyMarchHome не будет, освобождаем away прямо здесь.
  if (state.attHasGen && unitsTotal(survivors) <= 0 && attP.gen && attP.gen.away === m.id) attP.gen.away = null;
  const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
  if (updA) throw updA;

  await sendSurvivorsHome(admin, m, nowSec, survivors, carry);
}
