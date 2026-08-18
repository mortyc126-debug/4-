// =============================================================================
// mp-attack — Фаза 4: PvP-бой между двумя живыми игроками, разрешается
// сервером один раз, оба видят один и тот же результат (см. supabase/
// README.md, "Фаза 4"). НЕ resolveBattle() из index.html — тот раунд за
// раундом считает погоду, слом дисциплины, урон полководцам, поднятие
// нежити прямо в бою, контрудар гарнизона и оборону стены; здесь —
// единственный обмен ударами по настоящим базовым характеристикам войск
// (те же TROOP_TYPES/TIER_MULT/COUNTER_UP/DOWN, что и в index.html), без
// марша (бьёт мгновенно, без времени в пути — марш-система ещё не
// перенесена), без стены/полководцев/погоды/раундов. Честное приближение,
// не точная замена — см. подробный разбор в _shared/rules.js.
//
// Атакует часть домашнего гарнизона нападающего (выбирается в теле
// запроса) против ВСЕГО домашнего гарнизона защитника (маршей ещё нет —
// "в пути" войск не бывает, всё либо дома, либо участвует в этом самом
// бою). Потери списываются напрямую у обеих сторон, оба получают запись в
// mail с одинаковым итогом.
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
const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20];
const TROOP_TYPES = {
  inf: { atk: 34, def: 46, hp: 44, magicAtk: 8, magicDef: 18, beats: "arc", losesTo: "cav" },
  arc: { atk: 50, def: 30, hp: 36, magicAtk: 20, magicDef: 8, beats: "cav", losesTo: "inf" },
  cav: { atk: 46, def: 34, hp: 40, magicAtk: 12, magicDef: 12, beats: "inf", losesTo: "arc" },
  sie: { atk: 24, def: 20, hp: 60, magicAtk: 26, magicDef: 6, beats: null, losesTo: null },
};
const RACE_TROOP_MOD = {
  dwarf: { inf: { atk: 1.05, def: 1.05, hp: 1.05 } },
  human: { cav: { atk: 1.05, def: 1.05, hp: 1.05 } },
  elf: { arc: { atk: 1.05, def: 1.05, hp: 1.05 } },
  undead: { sie: { atk: 2.20 * 1.05, def: 1.05, hp: 1.05 } },
};
const troopMod = (race, t, stat) => (RACE_TROOP_MOD[race] && RACE_TROOP_MOD[race][t] && RACE_TROOP_MOD[race][t][stat]) || 1;
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
function dmgTo(attS, defS) {
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
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70;
    const mitigM = 1 + (defS[dt].mdef / Math.max(1, defS[dt].n)) / 70;
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
function resolvePvp(attUnits, attRace, defUnits, defRace) {
  const attS = sideStats(attUnits, attRace), defS = sideStats(defUnits, defRace);
  const dmgToDef = dmgTo(attS, defS), dmgToAtt = dmgTo(defS, attS);
  const defLoss = applyLosses(defUnits, dmgToDef, defRace);
  const attLoss = applyLosses(attUnits, dmgToAtt, attRace);
  const defHpLeft = Math.max(0, defS.totalHp - defLoss.hpLost);
  const attHpLeft = Math.max(0, attS.totalHp - attLoss.hpLost);
  const winner = defHpLeft <= 0 && attHpLeft > 0 ? "att" : attHpLeft <= 0 && defHpLeft > 0 ? "def" : (attHpLeft > defHpLeft ? "att" : "def");
  return { attLoss: attLoss.units, defLoss: defLoss.units, attHpLeft, defHpLeft, winner };
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
      .from("players").select("*").eq("world_id", world.id).eq("id", defenderId).maybeSingle();
    if (dErr) return jsonResponse({ err: dErr.message }, 500);
    if (!defRow) return jsonResponse({ err: "Защитник не найден" }, 400);

    // Собираем и проверяем отправляемую часть гарнизона: не больше, чем
    // реально есть дома, и хотя бы один боец.
    const attP = attRow.state, defP = defRow.state;
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

    const result = resolvePvp(sendUnits, attP.race, defP.troops, defP.race);

    // Потери списываются напрямую — марша и времени в пути нет (см.
    // заголовок файла), выжившие возвращаются мгновенно, поэтому у
    // нападающего домой не переносится "гарнизон минус отправленные", а
    // только "гарнизон минус потери".
    TKEYS.forEach((t) => {
      for (let i = 1; i <= 5; i++) {
        attP.troops[t][i] = Math.max(0, (attP.troops[t][i] || 0) - (result.attLoss[t][i] || 0));
        defP.troops[t][i] = Math.max(0, (defP.troops[t][i] || 0) - (result.defLoss[t][i] || 0));
      }
    });

    const { error: updA } = await admin.from("players").update({ state: attP, updated_at: new Date().toISOString() }).eq("id", attRow.id);
    if (updA) return jsonResponse({ err: updA.message }, 500);
    const { error: updD } = await admin.from("players").update({ state: defP, updated_at: new Date().toISOString() }).eq("id", defRow.id);
    if (updD) return jsonResponse({ err: updD.message }, 500);

    const summary = {
      winner: result.winner,
      sent: sendUnits, attLoss: result.attLoss, defLoss: result.defLoss,
      attHpLeft: Math.round(result.attHpLeft), defHpLeft: Math.round(result.defHpLeft),
    };
    const mailRows = [
      { world_id: world.id, player_id: attRow.id, kind: "battle", data: { role: "attacker", opponent_id: defRow.id, opponent_nick: defRow.nick, ...summary } },
      { world_id: world.id, player_id: defRow.id, kind: "battle", data: { role: "defender", opponent_id: attRow.id, opponent_nick: attRow.nick, ...summary } },
    ];
    const { error: mailErr } = await admin.from("mail").insert(mailRows);
    if (mailErr) return jsonResponse({ err: mailErr.message }, 500);

    return jsonResponse({ ok: true, ...summary });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
