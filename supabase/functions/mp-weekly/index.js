// =============================================================================
// mp-weekly — недельные награды за боевой рейтинг.
// =============================================================================
// Правила — docs/RANKS.md, раздел «Недельный янтарь». Автор: «раз в неделю до
// 1000 янтаря, как пассивный бонус, для стимула расти», по образцу
// индивидуального рейтинга RoK.
//
// Два котла:
//   • десятка мира по рейтингу — 1000, 800, 700, 600, 500, 400, 300, 250, 150, 100;
//   • за прирост рейтинга за неделю — 300, 200, 100.
//
// Порог участия (см. «Защита от фарма»): Ратуша >= 10 и не меньше трёх
// ЗАСЧИТАННЫХ боёв за эту же неделю. Первое отсекает раскачанного альта,
// второе — того, кто однажды забрался наверх и с тех пор собирает янтарь,
// ничего не делая. Без второго условия десятка была бы вечной вотчиной китов.
//
// Из котла за прирост десятка по рейтингу исключается НАРОЧНО: этот котёл на
// то и заведён, чтобы поднимающемуся было за чем тянуться, а не чтобы те же
// десять человек получали дважды.
//
// Зовётся по расписанию (pg_cron, миграция 0010) в понедельник 00:05 UTC и
// считает награды за ПРОШЕДШУЮ неделю. Повторный вызов безопасен: уникальный
// ключ weekly_awards_slot_idx не даст выплатить одно и то же место дважды.
//
// Обвязка — самодостаточная копия, как и во всех остальных функциях этой
// папки: редактор в Dashboard относительных импортов не тянет.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tick-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---- размеры котлов --------------------------------------------------------
const RATING_POT = [1000, 800, 700, 600, 500, 400, 300, 250, 150, 100];
const GROWTH_POT = [300, 200, 100];
// Порог участия.
const MIN_HALL = 10, MIN_WEEK_BATTLES = 3, CALIBRATION_BATTLES = 10;

// ---- неделя по ISO-8601 ----------------------------------------------------
// Неделя начинается с понедельника; первая неделя года — та, в которой
// четверг. Своя реализация, а не «семь дней назад»: границы обязаны быть
// одними и теми же при любом времени запуска, иначе одна и та же неделя
// однажды оплатилась бы дважды под разными ключами.
function isoWeekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Четверг той же недели — он и решает, к какому году неделя относится.
  const day = (t.getUTCDay() + 6) % 7;            // пн=0 … вс=6
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((t - firstThursday) / (7 * 86400000));
  return t.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
// Начало и конец недели (понедельник 00:00 UTC — следующий понедельник 00:00).
function isoWeekRange(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day);
  const from = new Date(t);
  const to = new Date(t.getTime() + 7 * 86400000);
  return { from, to };
}
// Обратное преобразование: из ключа '2026-W35' — в понедельник той недели.
// Нужно для ручной доплаты за конкретную неделю: без него запрос к журналу
// уходил бы вообще без границ и считал бы прирост за всё время.
function isoWeekRangeFromKey(key) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(key || ""));
  if (!m) return null;
  const year = +m[1], week = +m[2];
  // Понедельник недели 1 — тот, на чьей неделе лежит 4 января.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4.getTime() - day * 86400000);
  const from = new Date(week1Mon.getTime() + (week - 1) * 7 * 86400000);
  return { from, to: new Date(from.getTime() + 7 * 86400000) };
}

// ---- сезоны ----------------------------------------------------------------
// Дословно из ../_shared/rating.js: настоящие времена года по три месяца,
// декабрь уходит в зиму следующего года.
function seasonKeyAt(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
  if (m === 12) return (y + 1) + "-winter";
  if (m <= 2) return y + "-winter";
  if (m <= 5) return y + "-spring";
  if (m <= 8) return y + "-summer";
  return y + "-autumn";
}
const SEASON_NAMES = { winter: "Зимы", spring: "Весны", summer: "Лета", autumn: "Осени" };
function seasonTitle(key) {
  const p = String(key || "").split("-");
  return SEASON_NAMES[p[1]] ? "Сезон " + SEASON_NAMES[p[1]] + " " + p[0] : String(key || "");
}
const SEASON_CHRONICLE_TOP = 10;

// Летопись сезона — светлый разворот той же таблицы chronicles, где лежит
// «Летопись павших». Строку из летописи нельзя отобрать, её можно только не
// заслужить, поэтому она и выбрана наградой (docs/RANKS.md, «Награды»).
async function writeSeasonChronicle(admin, worldId, seasonNow) {
  // Какие сезоны уже завершились и ещё не записаны. Обычно ноль или один.
  const { data: players, error: pErr } = await admin.from("players")
    .select("id,nick,race,rating_peak,rating_season,state").eq("world_id", worldId);
  if (pErr) throw pErr;
  const results = new Map();       // season -> [{nick, race, rating}]
  const add = (season, row) => {
    if (!season || season === seasonNow) return;
    if (!results.has(season)) results.set(season, []);
    results.get(season).push(row);
  };
  for (const p of (players || [])) {
    // Ещё не пересчитан: его высшее за тот сезон лежит прямо в колонке.
    if (p.rating_season && p.rating_season !== seasonNow && (p.rating_peak || 0) > 0) {
      add(p.rating_season, { nick: p.nick || "", race: p.race || "", rating: Math.round(p.rating_peak || 0) });
    }
    // Уже пересчитан: то же самое число легло в печать сезона.
    const seals = (p.state && Array.isArray(p.state.seals)) ? p.state.seals : [];
    for (const sl of seals) add(sl.season, { nick: p.nick || "", race: p.race || "", rating: Math.round(sl.rating || 0) });
  }
  for (const [season, rows] of results) {
    const { data: was, error: cErr } = await admin.from("chronicles")
      .select("id").eq("world_id", worldId).eq("kind", "season")
      .contains("data", { season }).limit(1);
    if (cErr) throw cErr;
    if (was && was.length) continue;                 // уже записано
    // Дубли по нику (у игрока может быть и колонка, и печать за тот же сезон)
    // схлопываем, оставляя большее число.
    const best = new Map();
    for (const r of rows) {
      const prev = best.get(r.nick);
      if (!prev || r.rating > prev.rating) best.set(r.nick, r);
    }
    const top = [...best.values()].sort((a, b) => b.rating - a.rating).slice(0, SEASON_CHRONICLE_TOP);
    if (!top.length) continue;
    const { error: insErr } = await admin.from("chronicles").insert({
      world_id: worldId, kind: "season", nick: top[0].nick || "", race: top[0].race || "",
      data: { season, title: seasonTitle(season), top },
    });
    if (insErr) console.error("mp-weekly: летопись сезона не записалась —", insErr.message);
  }
}

// ---- запись состояния с проверкой версии -----------------------------------
// Тот же приём, что и во всех остальных функциях (см. подробный разбор в
// mp-barter): игрок может в эту же секунду что-то строить, и запись, собранная
// из состояния ДО его действия, стёрла бы это действие.
async function addAmber(admin, row, amount) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: fresh, error: readErr } = await admin
      .from("players").select("id,state,updated_at").eq("id", row.id).maybeSingle();
    if (readErr) return { error: readErr };
    if (!fresh) return { gone: true };
    const st = fresh.state || {};
    st.amber = Math.round((st.amber || 0) + amount);
    const prev = fresh.updated_at;
    const nextIso = new Date(Math.max(Date.now(), Date.parse(prev) + 1)).toISOString();
    const { data, error } = await admin.from("players")
      .update({ state: st, updated_at: nextIso })
      .eq("id", fresh.id).eq("updated_at", prev).select("id");
    if (error) return { error };
    if (data && data.length) return { ok: true };
    // Проиграли гонку — перечитываем и пробуем снова. Начисление янтаря
    // складывается с чем угодно, так что повтор безопасен.
  }
  return { conflict: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  try {
    // Тот же секрет, что у mp-tick: функция ничего не читает у пользователя и
    // раздаёт валюту — открытой она быть не должна.
    const secret = Deno.env.get("MP_TICK_SECRET");
    if (secret && req.headers.get("x-tick-secret") !== secret) {
      return jsonResponse({ err: "forbidden" }, 403);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

    // За какую неделю платим. По умолчанию — за прошедшую (нас зовут в
    // понедельник утром). Тело { week: "2026-W35" } позволяет доплатить
    // руками за конкретную неделю, если задание не сработало.
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    // Ровно семь суток назад. Не «середина прошлой недели»: задание теперь
    // ежедневное (границы сезона нельзя ловить раз в неделю, см. ниже), а
    // «минус три дня» в воскресенье попало бы в ТЕКУЩУЮ неделю и выплатило бы
    // её недоигранной. Минус семь суток даёт предыдущую неделю в любой день.
    const target = new Date(now.getTime() - 7 * 86400000);
    const weekKey = body.week || isoWeekKey(target);
    const range = body.week ? isoWeekRangeFromKey(body.week) : isoWeekRange(target);
    if (!range) return jsonResponse({ err: "не разобрал неделю: ждал вид 2026-W35" }, 400);

    const { data: worlds, error: wErr } = await admin.from("worlds").select("id");
    if (wErr) return jsonResponse({ err: wErr.message }, 500);

    const seasonNow = seasonKeyAt(now);
    const report = [];
    for (const world of (worlds || [])) {
      // ---- летопись сезона -------------------------------------------------
      // Пишется ровно один раз на сезон и на мир, из НАСТОЯЩИХ итогов, а не из
      // того, что осталось в колонках к моменту запуска. Тонкость: пересчёт на
      // смене сезона ленивый (mp-join делает его при первом же заходе игрока),
      // поэтому к этому моменту часть мира уже пересчитана, а часть нет. Итог
      // сезона берём поэтому из двух источников сразу:
      //   • кто ещё не пересчитан (rating_season = старый сезон) — из
      //     rating_peak, это и есть его высшее за сезон;
      //   • кто уже пересчитан — из печати сезона в state.seals, куда то же
      //     самое число и легло.
      // Так итог одинаков независимо от того, кто когда зашёл в игру.
      await writeSeasonChronicle(admin, world.id, seasonNow);

      // Уже платили за эту неделю в этом мире — выходим. Уникальный ключ ниже
      // страхует и на гонке двух одновременных запусков, но лишний круг
      // работы делать незачем.
      const { data: done, error: doneErr } = await admin.from("weekly_awards")
        .select("id").eq("world_id", world.id).eq("week_key", weekKey).limit(1);
      if (doneErr) return jsonResponse({ err: doneErr.message }, 500);
      if (done && done.length) { report.push({ world: world.id, week: weekKey, skipped: "уже выплачено" }); continue; }

      // Бои этой недели — из журнала. Он же даёт и число боёв на игрока (порог
      // участия), и прирост за неделю (второй котёл): и то и другое считается
      // по одним и тем же строкам, второго источника заводить незачем.
      const { data: evs, error: evErr } = await admin.from("rating_events")
        .select("att_id,def_id,att_delta,def_delta")
        .eq("world_id", world.id).eq("counted", true)
        .gte("at", range.from.toISOString()).lt("at", range.to.toISOString());
      if (evErr) return jsonResponse({ err: evErr.message }, 500);

      const battles = new Map(), growth = new Map();
      const bump = (m, k, v) => { if (k != null) m.set(k, (m.get(k) || 0) + v); };
      for (const e of (evs || [])) {
        bump(battles, e.att_id, 1); bump(battles, e.def_id, 1);
        bump(growth, e.att_id, e.att_delta || 0);
        bump(growth, e.def_id, e.def_delta || 0);
      }

      const { data: players, error: pErr } = await admin.from("players")
        .select("id,nick,rating,rating_battles,state").eq("world_id", world.id).is("dead_at", null);
      if (pErr) return jsonResponse({ err: pErr.message }, 500);

      const hallOf = (p) => {
        const raw = p.state && p.state.b && p.state.b.hall;
        return Array.isArray(raw) ? Math.max(0, ...raw.map((v) => v || 0)) : (raw || 0);
      };
      const eligible = (players || []).filter((p) =>
        (p.rating_battles || 0) >= CALIBRATION_BATTLES &&
        hallOf(p) >= MIN_HALL &&
        (battles.get(p.id) || 0) >= MIN_WEEK_BATTLES);

      const byRating = eligible.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, RATING_POT.length);
      const topIds = new Set(byRating.map((p) => p.id));
      const byGrowth = eligible
        .filter((p) => !topIds.has(p.id) && (growth.get(p.id) || 0) > 0)
        .sort((a, b) => (growth.get(b.id) || 0) - (growth.get(a.id) || 0))
        .slice(0, GROWTH_POT.length);

      const paid = [];
      const award = async (p, kind, place, amber) => {
        // Строка награды — ПЕРВОЙ. Она и есть замок: если параллельный запуск
        // успел раньше, уникальный ключ отвергнет вставку, и мы не начислим
        // янтарь второй раз. Обратный порядок (сначала янтарь) на гонке
        // выдал бы двойную выплату.
        const { error: awErr } = await admin.from("weekly_awards").insert({
          world_id: world.id, week_key: weekKey, kind, place,
          player_id: p.id, nick: p.nick || "", amber,
          rating: Math.round(p.rating || 0), growth: Math.round(growth.get(p.id) || 0),
        });
        if (awErr) return;   // уже выдано кем-то параллельно — молча пропускаем
        const r = await addAmber(admin, p, amber);
        if (r && r.error) console.error("mp-weekly: янтарь не начислен игроку", p.id, r.error.message);
        await admin.from("mail").insert({
          world_id: world.id, player_id: p.id, kind: "award",
          data: { week: weekKey, pot: kind, place, amber,
                  rating: Math.round(p.rating || 0), growth: Math.round(growth.get(p.id) || 0) },
        });
        paid.push({ id: p.id, nick: p.nick, kind, place, amber });
      };

      for (let i = 0; i < byRating.length; i++) await award(byRating[i], "rating", i + 1, RATING_POT[i]);
      for (let i = 0; i < byGrowth.length; i++) await award(byGrowth[i], "growth", i + 1, GROWTH_POT[i]);

      report.push({ world: world.id, week: weekKey, eligible: eligible.length, paid: paid.length, paidList: paid });
    }
    return jsonResponse({ ok: true, week: weekKey, worlds: report });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
