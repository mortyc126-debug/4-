// =============================================================================
// mp-tick — Фаза 2: серверный тикер. Вызывается по расписанию из pg_cron
// (см. migrations/0002_phase2_tick.sql — cron.schedule + pg_net дергает эту
// функцию раз в минуту HTTP-запросом), а не браузером. Разбирает события,
// у которых fire_at уже наступил, ровно так же, как EV{...} в index.html
// разбирает W.events — только это происходит НЕЗАВИСИМО от того, открыт ли
// у кого-то браузер, что и было целью Фазы 2 ("сервер сам считает время").
//
// Умеет type:"train" (зеркало EV.train, index.html:4821-4826), type:"build"
// (зеркало EV.build, index.html:4814-4819, см. mp-build) и type:
// "march_arrive"/"march_home" (зеркало EV.arrive->arriveMarch->battleCity
// и EV.home, см. mp-attack — марш с настоящим временем в пути, Фаза 4).
// Остальные типы событий (research/craft/heal/gathered/scouted/...) будут
// добавляться сюда по одному по мере переноса самих действий (Фаза 5),
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
function resolvePvp(attUnits, attRace, defUnits, defRace, defWallLv = 0) {
  const attS = sideStats(attUnits, attRace), defS = sideStats(defUnits, defRace);
  const dmgToDef = dmgTo(attS, defS, defWallLv), dmgToAtt = dmgTo(defS, attS);
  const defLoss = applyLosses(defUnits, dmgToDef, defRace);
  const attLoss = applyLosses(attUnits, dmgToAtt, attRace);
  const defHpLeft = Math.max(0, defS.totalHp - defLoss.hpLost);
  const attHpLeft = Math.max(0, attS.totalHp - attLoss.hpLost);
  const winner = defHpLeft <= 0 && attHpLeft > 0 ? "att" : attHpLeft <= 0 && defHpLeft > 0 ? "def" : (attHpLeft > defHpLeft ? "att" : "def");
  return { attLoss: attLoss.units, defLoss: defLoss.units, attHpLeft, defHpLeft, winner };
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
    const result = resolvePvp(m.units, attP.race, defP.troops, defP.race, defWallLv);
    defP.troops = unitsSub(defP.troops, result.defLoss);
    survivors = unitsSub(m.units, result.attLoss);

    const { error: updD } = await admin.from("players").update({ state: defP, updated_at: new Date().toISOString() }).eq("id", defRow.id);
    if (updD) throw updD;

    const summary = {
      winner: result.winner, sent: m.units, attLoss: result.attLoss, defLoss: result.defLoss,
      attHpLeft: Math.round(result.attHpLeft), defHpLeft: Math.round(result.defHpLeft),
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
