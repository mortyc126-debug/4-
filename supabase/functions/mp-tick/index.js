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
// лечение раненых в лазарете, Фаза 4, седьмой кусочек) и type:
// "scout_arrive" (зеркало EV.scouted, index.html:4877-4893, см. mp-scout —
// разведка чужого города, Фаза 4, восьмой кусочек). Остальные типы
// событий (research/craft/gathered/...) будут добавляться сюда по одному
// по мере переноса самих действий (Фаза 5), каждый — отдельным case, по
// образцу ниже.
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

// Зеркало EV.scouted(d) из index.html:4877-4893 — Фаза 4, восьмой кусочек
// (разведка чужого города, см. mp-scout). Лазутчик не возвращается домой —
// марш удаляется сразу после снятия показаний, независимо от исхода
// (совпадает с клиентом: "обратной дороги ему не рисуем, он один и
// налегке, возвращать домой нечего"). se (глубина донесения, от
// p.tech.mil_scout2) всегда 0 — исследования ещё не перенесены на сервер,
// см. заголовок mp-scout; при se=0 донесение несёт ровно то же, что и в
// index.html на этом тире — только общее число войск.
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

  const defP = defRow.state;
  const hallLv = Array.isArray(defP.b && defP.b.hall) ? Math.max(0, ...defP.b.hall) : ((defP.b && defP.b.hall) || 0);
  const total = unitsTotal(defP.troops || {});
  const nowSec = Date.now() / 1000;

  const { error: mailErr } = await admin.from("mail").insert({
    world_id: m.world_id, player_id: attRow.id, kind: "scout",
    data: {
      found: true, opponent_id: defRow.id, opponent_nick: defRow.nick,
      hall: hallLv, shielded: defRow.shield_until > nowSec, total,
    },
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
function sideStats(units, race) {
  const s = {};
  TKEYS.forEach((t) => {
    let atk = 0, def = 0, matk = 0, mdef = 0, hp = 0, n = 0;
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      if (!c) continue;
      const w = TIER_MULT[i - 1];
      atk += c * TROOP_TYPES[t].atk * w * troopMod(race, t, "atk");
      def += c * TROOP_TYPES[t].def * w * troopMod(race, t, "def");
      matk += c * TROOP_TYPES[t].magicAtk * w * troopMod(race, t, "atk");
      mdef += c * TROOP_TYPES[t].magicDef * w * troopMod(race, t, "def");
      hp += c * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp");
      n += c;
    }
    s[t] = { atk, def, matk, mdef, hp, n };
  });
  s.totalHp = TKEYS.reduce((a, t) => a + s[t].hp, 0);
  s.totalN = TKEYS.reduce((a, t) => a + s[t].n, 0);
  return s;
}
// defWallLv — уровень стены защитника (index.html:4142/4208, см. подробный
// комментарий в _shared/rules.js). Умножает дробь def/70, не всё (1+...).
function dmgTo(attS, defS, defWallLv = 0) {
  const defWall = 1 + wallDefBonus(defWallLv) * (1 + 0);
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
function applyLosses(units, dmgByType, race) {
  const lost = { inf: {}, arc: {}, cav: {}, sie: {} };
  let hpLost = 0;
  TKEYS.forEach((t) => {
    let hpTotal = 0;
    for (let i = 1; i <= 5; i++) hpTotal += ((units[t] && units[t][i]) || 0) * TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp");
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
function resolvePvp(attUnits, attRace, defUnits, defRace, defWallLv = 0, defGarrisonLv = 0) {
  const attS = sideStats(attUnits, attRace), defS = sideStats(defUnits, defRace);
  const dmgToDef = dmgTo(attS, defS, defWallLv), dmgToAtt = dmgTo(defS, attS);
  const openG = garrisonVolley(defGarrisonLv, attS);
  if (openG) TKEYS.forEach((t) => { dmgToAtt[t] = (dmgToAtt[t] || 0) + (openG[t] || 0); });
  const defLoss = applyLosses(defUnits, dmgToDef, defRace);
  const attLoss = applyLosses(attUnits, dmgToAtt, attRace);
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
// дома). bonuses(p).hosp/mercy временно = 0, та же заглушка везде.
const SLIGHT_WOUND_FRAC = 0.12;
function hospitalSplit(p, loss, mode) {
  if (mode === "siege-attack") {
    const deadUnits = { inf: {}, arc: {}, cav: {}, sie: {} };
    let dead = 0;
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) { const n = (loss[t] && loss[t][i]) || 0; deadUnits[t][i] = n; dead += n; } });
    return { dead, hurt: 0, slight: 0, slightUnits: { inf: {}, arc: {}, cav: {}, sie: {} }, deadUnits, hurtUnits: { inf: {}, arc: {}, cav: {}, sie: {} } };
  }
  const cap = Math.round(totalHospitalCap(p) * (1 + 0));
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
    const defWallLv = (defP.b && typeof defP.b.wall === "number") ? defP.b.wall : 0;
    const defGarrisonLv = (defP.b && typeof defP.b.garrison === "number") ? defP.b.garrison : 0;
    const result = resolvePvp(m.units, attP.race, defP.troops, defP.race, defWallLv, defGarrisonLv);
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
    const { error: updErr } = await admin.from("players").update({ state: p, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (updErr) throw updErr;
  }
  await admin.from("marches").delete().eq("id", m.id);
}
