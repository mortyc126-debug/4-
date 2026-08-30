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

// =============================================================================
// savePlayerState — запись состояния игрока с проверкой, что его никто не
// перезаписал, пока мы считали.
// =============================================================================
// Каждая функция здесь работает по схеме "прочитал строку игрока -> изменил
// объект state в памяти -> записал его ЦЕЛИКОМ обратно". Пока запросы к
// одному игроку идут строго по очереди, это верно. Но они идут не по
// очереди: клиент опрашивает mp-join каждые пять секунд (а тот пишет строку
// игрока — начисляет добычу), и тик мира (mp-tick) пишет её же, разрешая
// события. Если игрок нажал "Строить" в тот же миг, порядок получался
// такой:
//     действие  читает state (постройки нет, ресурсы целы)
//     mp-join   читает state (то же самое)
//     действие  пишет  state (ресурсы списаны, стройка в очереди)
//     mp-join   пишет  state — СВОЙ, прочитанный ДО действия
// и стройка вместе со списанием исчезала бесследно. Обратный порядок так же
// легко давал зеркальный исход — ресурсы списаны, а стройки нет. Ни ошибки,
// ни следа в логах: последняя запись просто затирала чужую.
//
// Лечится проверкой версии при записи. updated_at и так есть у строки и и
// так пишется при каждом изменении — используем его как метку версии:
// обновляем строку ТОЛЬКО если updated_at всё ещё тот, что мы прочитали.
// Не совпал — значит кто-то записал раньше нас, и наш объект state построен
// на устаревших данных; сообщаем об этом вызывающему, а не затираем.
// Отдельная колонка-счётчик не нужна: миграцию пришлось бы накатывать
// руками через дашборд (см. supabase/README.md), а updated_at уже на месте.
//
// Новая метка строго больше прочитанной (Math.max с +1 мс) — время на
// сервере может идти назад при коррекции часов, а метка версии обязана
// только расти, иначе устаревшее значение однажды совпало бы снова.
//
// Возвращает { ok:true } | { conflict:true } | { error }.
// Фаза 31 — power пишется ТЕМ ЖЕ UPDATE, что и state (как в mp-join): вторым
// запросом это была бы вторая гонка за ту же строку и лишний рейс к базе.
// Число берётся из row.power, если вызывающий его туда положил (см.
// applyPower) — все прежние вызовы работают как работали.
async function savePlayerState(admin, row, state) {
  const extra = (row && row.power != null) ? { power: Math.round(row.power) } : {};
  // Рейтинговые колонки пишутся тем же обновлением, что и состояние: иначе
  // между записью state и записью рейтинга открывалось бы своё окно гонки, а
  // проверка версии по updated_at защищала бы только половину боя.
  // Флаг — чтобы обычный тик не переписывал их на каждом сохранении.
  if (row && row.__ratingDirty) {
    extra.rating = Math.round(row.rating || 0);
    extra.rating_battles = Math.round(row.rating_battles || 0);
    extra.rating_peak = Math.round(row.rating_peak || 0);
    extra.rating_season = row.rating_season || "";
    if (row.rating_last_at) extra.rating_last_at = row.rating_last_at;
  }
  const prev = row.updated_at;
  if (!prev) {
    // Строка прочитана без updated_at (старый вызывающий код) — сверять не с
    // чем; пишем как раньше, чтобы ничего не сломать, но и не притворяемся,
    // что проверили.
    const { error } = await admin.from("players")
      .update({ state, ...extra, updated_at: new Date().toISOString() }).eq("id", row.id);
    return error ? { error } : { ok: true };
  }
  const nextIso = new Date(Math.max(Date.now(), Date.parse(prev) + 1)).toISOString();
  const { data, error } = await admin.from("players")
    .update({ state, ...extra, updated_at: nextIso })
    .eq("id", row.id).eq("updated_at", prev).select("id,updated_at");
  if (error) return { error };
  if (!data || !data.length) return { conflict: true };
  // Своя же метка — на случай второй записи той же строки в этом запросе.
  row.updated_at = data[0].updated_at;
  return { ok: true };
}


// Обёртка для тика: проигранная гонка — исключение. Главный цикл ловит его,
// НЕ помечает событие обработанным (см. try/catch и claimed_at там), и через
// минуту это же событие разбирается заново — уже поверх свежего состояния.
// Поэтому запись игрока в каждом обработчике стоит ПЕРВОЙ из всех изменений
// в базе: если она не прошла, значит не сделано вообще ничего, и повтор
// начинается с чистого листа, ничего не задваивая.
async function savePlayerStateOrThrow(admin, row, state) {
  const r = await savePlayerState(admin, row, state);
  if (r.error) throw r.error;
  if (r.conflict) throw new Error("состояние игрока " + row.id + " изменилось во время обработки события — повторим на следующем тике");
}

// Обе стороны боя пишутся вместе. Строки две, а записать их одним
// неделимым действием через REST-интерфейс нельзя — поэтому: сначала обе
// проверки версии по очереди, а если вторая не прошла, первую откатываем на
// снимок, снятый ДО всех изменений. Без отката получилось бы хуже, чем без
// проверки вовсе: атакующему потери и добыча уже записаны, событие брошено
// и через минуту разбирается заново — и всё то же самое начисляется ему
// ВТОРОЙ раз.
// Снимок — обычная глубокая копия через JSON: состояние игрока и так
// хранится в базе как JSONB, то есть заведомо сериализуемо без потерь.
function snapshotState(state) {
  return JSON.parse(JSON.stringify(state));
}
async function saveBothPlayersOrThrow(admin, rowA, stateA, snapA, rowB, stateB) {
  await savePlayerStateOrThrow(admin, rowA, stateA);
  const b = await savePlayerState(admin, rowB, stateB);
  if (b.ok) return;
  // Вторая сторона не записалась — возвращаем первую как было.
  const rollback = await savePlayerState(admin, rowA, snapA);
  if (!rollback.ok) {
    // Откат тоже проиграл гонку: между нашей записью и откатом строку успел
    // переписать кто-то третий. Случай крайне узкий, но молчать о нём
    // нельзя — пусть будет видно в ответе тика (errors[]).
    throw new Error("не удалось откатить игрока " + rowA.id + " после отказа записи игрока " + rowB.id + " — состояние могло разъехаться");
  }
  if (b.error) throw b.error;
  throw new Error("состояние игрока " + rowB.id + " изменилось во время боя — повторим на следующем тике");
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

    // Разовая уборка старых наложений — до выборки событий ниже, иначе на
    // пустом тике (нет событий -> ранний return) она никогда бы не завелась.
    await ensureOverlapCleanupScheduled(admin);

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
        else if (ev.type === "regfort_respawn") await applyRegfortRespawn(admin, ev);
        else if (ev.type === "regfort_built") await applyRegfortBuilt(admin, ev);
        else if (ev.type === "rally_launch") await applyRallyLaunch(admin, ev);
        else if (ev.type === "march_arrive") await applyMarchArrive(admin, ev);
        else if (ev.type === "battle_round") await applyBattleRound(admin, ev);
        else if (ev.type === "march_home") await applyMarchHome(admin, ev);
        else if (ev.type === "heal") await applyHeal(admin, ev);
        else if (ev.type === "scout_arrive") await applyScoutArrive(admin, ev);
        else if (ev.type === "scout_home") await applyScoutHome(admin, ev);
        else if (ev.type === "research") await applyResearch(admin, ev);
        else if (ev.type === "craft") await applyCraft(admin, ev);
        else if (ev.type === "gathered") await applyGathered(admin, ev);
        else if (ev.type === "node_respawn") await applyNodeRespawn(admin, ev);
        else if (ev.type === "camp_respawn") await applyCampRespawn(admin, ev);
        else if (ev.type === "ambient_seed") await applyAmbientSeed(admin, ev);
        else if (ev.type === "overlap_cleanup") await applyOverlapCleanup(admin, ev);
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
  await savePlayerStateOrThrow(admin, row, p);
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
  await savePlayerStateOrThrow(admin, row, p);
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
  await savePlayerStateOrThrow(admin, row, p);
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
  await savePlayerStateOrThrow(admin, row, p);
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

  const { data: attRow, error: aErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (aErr) throw aErr;
  if (!attRow) { await admin.from("marches").delete().eq("id", m.id); return; } // хозяина нет — некому писать донесение

  const defenderId = m.data && m.data.defender_id;
  const { data: defRow, error: dErr } = defenderId == null
    ? { data: null, error: null }
    : await admin.from("players").select("*").eq("id", defenderId).maybeSingle();
  if (dErr) throw dErr;
  if (!defRow) {
    // Цель пропала между отправкой и прибытием. Донесение всё равно будет —
    // но, как и всякое другое, по возвращении лазутчика домой.
    await turnScoutHome(admin, m, attRow, { found: false });
    return;
  }

  const attP = attRow.state || {};
  const se = (attP.tech && attP.tech.mil_scout2) || 0;
  const defP = defRow.state;
  const hallLv = Array.isArray(defP.b && defP.b.hall) ? Math.max(0, ...defP.b.hall) : ((defP.b && defP.b.hall) || 0);
  const total = unitsTotal(defP.troops || {});
  const nowSec = Date.now() / 1000;

  // Автор про донесение: "для визуала указывается расположение ратуши
  // (координаты) как на ресурсных точках, уровень ратуши и мощь правителя.
  // Щит не нужен". Координаты и мощь сюда раньше не клались вовсе — письмо
  // умело показать уровень ратуши и щит, и всё.
  // Мощь берём ту же, что и рейтинг (powerOf, см. players.power) — числа
  // сходятся, и это не утечка: мощь и так открыта в рейтинге всем.
  // shielded оставлен в данных, но клиент его больше не печатает: щит автор
  // сделает видимым сам, а старые письма ломать выкидыванием поля незачем.
  const data = {
    found: true, opponent_id: defRow.id, opponent_nick: defRow.nick,
    x: defRow.x, y: defRow.y, power: powerOf(defP, []),
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

  // Цель тоже должна узнать, что её осматривали. Автор: "второму — что на
  // него была совершена разведка таким-то правителем, с такими-то
  // координатами (кликабельными) и предосторожность".
  // Письмо уходит ИМЕННО СЕЙЧАС, а не вместе с донесением разведчика: с
  // точки зрения цели событие произошло в момент, когда лазутчик подошёл к
  // городу, а не когда он добрался обратно (это может быть сильно позже).
  // Координаты — разведчика, чтобы цель понимала, откуда пришли и кому
  // отвечать. kind:"scouted" — свой вид письма, не "scout": у них разный
  // состав и разные читатели.
  const { error: warnErr } = await admin.from("mail").insert({
    world_id: m.world_id, player_id: defRow.id, kind: "scouted",
    data: { by_id: attRow.id, by_nick: attRow.nick || "", by_race: attRow.race || "",
            x: attRow.x, y: attRow.y, se },
  });
  if (warnErr) throw warnErr;

  // Сведения сняты (это и есть момент, когда лазутчик смотрит на город) —
  // но донесение РАЗВЕДЧИКУ отдаст applyScoutHome, когда он дойдёт обратно.
  await turnScoutHome(admin, m, attRow, data);
}

// Автор: «разведка — как только разведчик возвращается, уведомление о
// разведке». Раньше лазутчик ПРОПАДАЛ с карты в момент прибытия к цели, и
// письмо уходило тогда же — обратной дороги у разведки не было вовсе.
// Теперь марш разворачивается домой (его видно на карте), донесение едет
// вместе с ним в data.scout_report, а письмо кладёт applyScoutHome.
async function turnScoutHome(admin, m, attRow, report) {
  const nowSec = Date.now() / 1000;
  const dist = Math.hypot(attRow.x - m.tx, attRow.y - m.ty);
  // spd кладёт mp-scout при отправке (снимок скорости). У маршей, вылетевших
  // ДО этой правки, поля нет — тогда берём длительность дороги туда: путь
  // симметричный, это честнее любой выдуманной константы.
  const spd = m.data && m.data.spd;
  const travelBack = spd ? Math.max(MIN_TRAVEL, (dist / spd) * 60)
                         : Math.max(MIN_TRAVEL, (m.t1 - m.t0) || 60);
  const { error: updErr } = await admin.from("marches")
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack,
              // from — цель, от которой лазутчик поворачивает назад. Пишем
              // явно: поле общее на все отрезки марша (см. mp-redirect), и
              // унаследованное от прошлого отрезка увело бы линию возврата.
              data: { ...(m.data || {}), scout_report: report, from: { x: m.tx, y: m.ty } } }).eq("id", m.id);
  if (updErr) throw updErr;
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "scout_home", data: { march_id: m.id },
  });
  if (evErr) throw evErr;
}

// Лазутчик дома — вот теперь донесение. Отдельное событие, а не общий
// march_home: у разведки нет ни войск, ни добычи, ей нужен только этот разбор.
async function applyScoutHome(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  if (!m || m.state !== "back") return; // уже разобрано/отозвано
  // Удаление марша — ЗАМОК на выдачу донесения, а не просто уборка.
  // Автор: "баг в разведке, два отчёта пришло, хотя посылал один раз".
  // Раньше строка сносилась без проверки результата, и письмо писалось
  // следом безусловно: любой повторный заход в эту функцию по тому же
  // маршу (протухшая аренда события после сбоя где-то дальше, два события
  // scout_home на один марш) выдавал ВТОРОЕ донесение. Теперь письмо
  // пишет только тот заход, который реально забрал строку: у второго
  // delete вернёт пусто, и он тихо выйдет.
  const { data: gone, error: delErr } = await admin
    .from("marches").delete().eq("id", m.id).select("id");
  if (delErr) throw delErr;
  if (!gone || !gone.length) return;   // строку уже забрал кто-то другой — донесение он и выдал
  const report = m.data && m.data.scout_report;
  if (!report) return;
  const { error: mailErr } = await admin.from("mail").insert({
    world_id: m.world_id, player_id: m.player_id, kind: "scout", data: report,
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
  // Фаза 29 — было ли тут здание ДО этой стройки. Если нет (уровень 0), это
  // не улучшение, а постройка заново — например, на месте снесённого
  // осадой. Прочность у новостройки полная, и старую запись о ней нужно
  // убрать: у multi-зданий (ферма/лесопилка/каменоломня/шахта/госпиталь)
  // прочность хранится массивом по участкам, и обнулённый destroyBuilding()
  // участок иначе так и остался бы нулём — отстроенная ферма выходила бы с
  // нулевой прочностью и падала от первого же удара. У обычных зданий
  // destroyBuilding() запись удаляет целиком, но лишним не будет и им.
  const wasLv = buildLvAt(p, q.b, q.plot);
  if (q.plot != null) {
    // Самоисцеление той же старой формы, что и в mp-build (см. комментарий
    // там) — на случай, если запись когда-то попала в очередь до починки.
    if (!Array.isArray(p.b[q.b])) p.b[q.b] = [p.b[q.b] || 0, 0, 0, 0];
    p.b[q.b][q.plot] = q.lv;
  } else {
    p.b[q.b] = q.lv;
  }
  if (!wasLv) setBuildHp(p, q.b, q.plot, buildingMaxHp(q.b, q.lv));
  p.queues[slot] = null;
  await savePlayerStateOrThrow(admin, row, p);
}

// =============================================================================
// PvP-бой (единственный обмен ударами, НЕ resolveBattle() — см. подробный
// разбор в _shared/rules.js и в заголовке mp-attack) — буквальная копия
// оттуда, самодостаточная копия (см. пояснение о Dashboard-редакторе выше).
const TKEYS = ["inf", "arc", "cav", "sie"];
const RES = ["food", "wood", "stone", "gold"]; // Фаза 8, кусочек 1 — applyMarchHome зачисляет добычу сбора
// Янтарь (index.html:3327 AMBER_NODE_SHARE) — та же доля и формула объёма,
// что в одиночной игре и в mp-join/seedNodesAround, дословно перенесены и
// в оба серверных источника подсева узлов ниже (respawn/ambient_seed).
const AMBER_NODE_SHARE = 0.12;
function pickNodeResAndAmount(lv) {
  const isAmber = Math.random() < AMBER_NODE_SHARE;
  const res = isAmber ? "amber" : RES[Math.floor(Math.random() * RES.length)];
  const amount = Math.round(isAmber ? 240 * Math.pow(1.9, lv - 1) : 6000 * Math.pow(2.6, lv - 1));
  return { res, amount };
}
// ---- Рельеф (дословная копия из mp-join/index.js, самодостаточная — см.
// пояснение о Dashboard-редакторе выше) — раньше здесь этого блока не было
// вовсе: respawnOffset/applyAmbientSeed ниже сеяли точки/лагеря совсем
// вслепую (комментарий на этом месте раньше честно предупреждал: "тоже не
// проверяет воду"). Автор явно попросил, чтобы точки ресурсов не появлялись
// ни на неровных поверхностях, ни друг в друге, ни в реках — держать это
// только на клиенте/в mp-join было половинчато: respawn истощённой точки и
// фоновый ambient-подсев работают именно отсюда, mp-tick.
function hash2(x, y, s) { let h = x * 374761393 + y * 668265263 + s * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function ridge(x, y, s) { return 1 - Math.abs(2 * noise(x, y, s) - 1); }
const RW_SEED = 12345, RW_SEA = 0.235;
function rwSstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function rwRegionKind(x, y) {
  return { mount: rwSstep(0.40, 0.72, noise(x / 40, y / 40, RW_SEED + 55)),
           plat: rwSstep(0.62, 0.84, noise(x / 34, y / 34, RW_SEED + 88)),
           rough: noise(x / 26, y / 26, RW_SEED + 123) };
}
function rwHeightRaw(x, y) {
  const wx = (noise(x / 34, y / 34, RW_SEED + 101) * 2 - 1) * 13;
  const wy = (noise(x / 34, y / 34, RW_SEED + 102) * 2 - 1) * 13;
  const X = x + wx, Y = y + wy;
  const R = rwRegionKind(x, y);
  const cont = noise(X / 62, Y / 62, RW_SEED + 201);
  let e = 0.16 + cont * 0.50;
  const amp = 0.16 + 0.84 * R.mount + 0.35 * R.rough;
  e += (noise(X / 27, Y / 27, RW_SEED) * 0.20 + noise(X / 13, Y / 13, RW_SEED + 9) * 0.10
    + noise(X / 6, Y / 6, RW_SEED + 21) * 0.045) * amp;
  e += ridge(X / 17, Y / 17, RW_SEED + 37) * 0.33 * R.mount;
  e += R.mount * 0.10 - (1 - R.mount) * 0.05;
  if (R.plat > 0.02) {
    const terr = Math.round(e * 6.0) / 6.0;
    e = e * (1 - R.plat * 0.80) + terr * (R.plat * 0.80);
  }
  if (e >= 0.42) {
    const k = rwSstep(0.42, 0.68, e);
    e += (noise(x / 2.4, y / 2.4, RW_SEED + 180) - 0.5) * 0.075 * k
      + (noise(x / 5.5, y / 5.5, RW_SEED + 181) - 0.5) * 0.055 * k;
  }
  return Math.max(0.02, Math.min(1, e));
}
function rwHeightAt(x, y) {
  const c = rwHeightRaw(x, y);
  const s = (rwHeightRaw(x + 0.7, y) + rwHeightRaw(x - 0.7, y) + rwHeightRaw(x, y + 0.7) + rwHeightRaw(x, y - 0.7)) * 0.25;
  return c * 0.55 + s * 0.45;
}
// ---- НАСТОЯЩАЯ карта воды (запечена из heightmap/elevation-v6.bin) --------
// Процедурная формула rwHeightAt выше — НЕ та вода, которую видит игрок.
// Замер по всей карте: она не видит 96% настоящей воды, то есть сервер
// спокойно ставил точки и лагеря прямо в реки, а 3D-движок рисует настоящий
// рельеф — отсюда рудники и каменоломни на берегу и в русле.
//
// Сам elevation-v6.bin — 5.76 МБ, в функцию его не зашить и качать в рантайме
// незачем. Здесь лежит его сжатая битовая маска (worldgen/bake_water_mask.mjs):
// 1 бит на блок WATER_MASK_STEP x WATER_MASK_STEP клеток, блок считается водой,
// если мокра ЛЮБАЯ его клетка — консервативно, лучше лишний запас у берега,
// чем точка в реке. Проверено: пропущенной воды 0.0% против 96.2% у формулы,
// ценой 3.1% карты в виде запаса вдоль берегов.
// Перепечь после смены heightmap: node worldgen/bake_water_mask.mjs
const WATER_MASK_STEP = 4, WATER_MASK_W = 600, WATER_MASK_H = 300;
const WATER_MASK_HALF_X = 1200, WATER_MASK_HALF_Z = 600; // мировые полуразмеры запечённой области
const WATER_MASK_B64 = "///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////n//////////////////////////////////////////////////////////////////////////////////////////////////8HIPD///////////////////////////////////////////////////////////////////////////////////////////////8AAPD////w/z/g//8///////////////////////////////////////////////////////////////////////9/OOD/////fw8AAGDf/3+A9w0AGgAP3P////j///////////////////////////////////////////////////////////////8BAAD/////fwAAAICBjzMAAAAAAAACAP7/AwD+/////////////3/w//////////////////////////////8//////////////wcAAADw//8/PgAAAACADwAAAAAAAAAAADgAAADA/////////////x/A////////////z/////////////////9/9v///////3PgPwAAAADA/5EfdgAAAAAAAAAAAAAAAAAAAAAAAAAAwP//h////////wMA/v//////////h/////////////////9jDsD//////wAAAAAAAAAAgAAA4AEAAAAAAAAAAAAAAAAAAAAAAAAAAOD/APz///8HDgAA/P//////////A////////x/g/////z/gDQD+////DwAAAAAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAOD/fz8AGAAA/P//////////AP7//////4HAP/D//w+AHQD4////AwAAAAAAAAAAAAAAgAEAAAAAAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAGAAA/P//////f/g/APj/////P4CAD+D//wOAPh/g//9/AAwAAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAAAAAAAEBgAAAAAABAMAQQ/P//////f4ABAADw////DwAAAOD//wEA9P8D/z8AAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAABggAEAAABABjAQ/v//////fwAAAAAA+P//AQAAAMD//wcA/OEP/AHAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAABggAEAAAAACBAA/v//////fwAAAAAAAAAAAAAAAID/AQ8A+Ad/AADgAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAEAAACDAA////////fwAAAAAAAAAAAAAAAAAOABwA6C74AABAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAcAAAAHOA////////fwAAAAAAAAAAAAAAAAAAABgAACjgwADAGAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAA4AEAAM+H////////fwwAAAAAAAAAAAAAAA4AAHgAAAD4//8AHwAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAwAEADA7A////////fxwAAAAAAAAAAAAAAAAAAPADAABg//8BDwAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAgAUAAADw////////fwgAAAAAAAAAAAAAAAAAAMAHAAAAAP4PAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAQAAAAQAAADg////////PzAAAAAAAAAAAAAAAAAAAAAPAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAADg////////HzgAAAAAAAAAAAAAAAAAAAB8AAAAAAD8PAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAgAAADw////////DwwAAAAAAAAAAAAAAAAAAAB4AAAAAAD8/zcAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAADw////////BwAAAAAAAAAAAAAAAAAAAADgAAAAAAD8738AAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAGAAAQDw////////AwAAAAAAAAAAAAAAAAAAAADgAAAAAACAQP0PAAAgAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAA4AFMAGADA8D5////////AQsAAAAAAAAAAAAAAAAAAABnAAAAAAAAAMAfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwA/MAAAAAID5////////AR8AAAAAAAAAAAAAAAAAAABjAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8MAAAAAAD4////////AB8AAAAAAAAAAAAAAAAAAABgAAAAAAAAAAB4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPQDAAAAAQD4////////AB8AAAAAAAAAAAAAAAAAAADgAQAAAAAAAADwAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIA/AAAAAAD8////////AD8AAAAAAAAAAAAAAAAAAADAAwAAAAAAAADgAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAH+AAAwAAD8//////9/ADwAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAACAgwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAwDAAAD8////////ABgAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAADAzwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACADwCAAAD+////////AAwAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAADg/gEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAABgD+//////9/AAAAAAAAAAAAAAAAAAAABgMABwAAAAAAAABw+B8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAABgD+//////9/BwAAAAAAAAAAAAAAAACAAAAADgAAAAAAAADw4P8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIeBAADAD+////////AyAAAAAAAAAAAAAAAACAAAAAHgAAAAAAAADwMPwBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACI4P8DDAD+////////AQAAAAAAAAAADAAAAAAAAAAA+AAAAAAAAADwAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgf8HBAD+////////AQAAAAAAAAAABAAAAAAAAAAA8AEAAAAAAAA+AAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAOBAD8////////AAEAAAAAAAAAAAAAAAAAAAAAwAMAQAAAAAAPAMAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAAQA8AAD8////////gAEgAAAAAAAAAAAAAAAAAAAAAAMAwAAAAIAPAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAPAAAAAGAAAAB4GADw////////OAFwAAAAAAAAAAAAAAAAAAAAAAcAAAAAAIAHAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+Hx8AAGAAAwDgAQDw////////PAAwAAAAAAAAAAAAAAAAAAAAAA4AAAAAAMADAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw/38AAMA5AgDAAwDg////////PAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAMABAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA8fEDAMAZADMABwDA////////OAAAAAAAAAAAAAAAgCEAAAAAAAwAAAAAAMABAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAPAAA4AAMADgDA////////AAAAAAAAAAAAAAAAgCAAAAAAABgAAAAAAMABAMAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AABwAAAADADA////////AQAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAMAAAMAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4AwDgAQAAPAAA////////AQAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAMABAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAHwCAAQAA+AAA/v//////AQAAAAAAAAAAABgAAAAAAAAAADgAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgCABwAAwAAA/v//////AwAAAAAAAAAAAAwAAAAAAwAAADgAAAAAOMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAHwAAwAAA/v//////AwAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AMAPAAAwAEA/P//////w2MAAAAAAAAAAAAAAAAAAAAAAhgAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AMAAAwAEA+P//////xw8AAAAAAAAAAAAAAAAAAAAAAAAAAACAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAgAcA+P//////hw8AAAAAAAAAAAAAAAIAAAAAAAAAAACAAYADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAB8A+P//////BwgDAAAAAAAAAAAAAAIAAAAAAAAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAADwA8P//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAAAOAPAAAAADgA8P//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8AQAAAAAAAID/AAAAABwA8P//////DwAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADPAwAAAAAAAAD4HwAAAHgA+P//////DwAAAAAAAAAAADwAAAQAAAAAAAAAAAAAAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAHBwAAAAAAAAAAfwAAAOAA+P//////HwAAAAAAAAAAAA5ADAQAAAAAABAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABDgAAAAAAAAAA4AEAAMAB+P//////HwAAAAAAAACAAAZADAAAAAAAABgAAAAQAHwAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAHEAAAAAAAAAAwIcBAMAB+P//////HwAAAAAAAACAAQwIAAAAAAAAABAAAAAAADwAAP8HAAAAAAAAAAAAAAAAAAAAAAAAAAAAcBwAPEAAAAAAAAAAAJ8ZAIAH/P//////PwAAAAAAAACAAA4YAAAAAAAAAAAAAAAAADwAwM8PAAAAAAAAAAAAAAAAAAAAAAAAAAAA8A8AMAAAAAAAAAAAADwIAAAP////////PwAAIAAAAAAAwA8AAAAAAAAAAAAAAAAAADwA+AEMAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AMAcAAAAAAAAAAAAPAAAAAO////////fwAA/AAAAAAAwAMAAAAAAAAAAAAAAAAAADwAfgAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAOABAACM////////fwAAfgAAAAAC4AEAAAAAAAAAAAAAAAAAAB4ADwAeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAIAHAAD8/////////4APBgAAAAD/fwAA+AAAAAAAAAAAAAAAAAwABwAOAAAAAAAAAADgAwAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAOAAD8/////////+PfBwAAAPj/PwAAPwAAAAAAAAAAAAAAABzwBwDuAQAAAAAAAADwDxwAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAcAADw///////////+BwAAwP+ZHQCADwAAAAAAAAAAAAAAADz+AwD8ewAAAAAAAAA4/v//AAAAAAAAAAAAAAAAwAMAAAAAAAAAAAD4AADw////////fz5+AAAA+N8DAADAAQAAAAAAAAAAAAAAABweAAA4/wAAAAAAAAAc+PP/AQAAAAAAAAAAAAAAgAMAAAAAAAAAAADwAADw//////8PfgQAAAAAPx0AAAD8AAAAAAAAAAAAAAAAABgHAAAAzgEAAAAAAAAOAACAAAAAAAAAAAAAAAAAAD8AAAAAAAAAAADgAQDw//////8DAAAAMADAF/z4/9Y/AAAAAAAAAAAAAAAAANgDAAAAgAcAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAD4AAAAAAAAAAACABwDw//////8BAAAAAADwA/j///8DAAAAgAEAAAAAAAAAAPgDAAAAAA8AAAAAAMABAAAAAAAAAAAAAAAAAAAAAPACAAAAAAAAAAAAHgDw//////8BAAAAAO5wAMAPwP8AAAAAgAEAAAAAAAAAAPABAAAAAAwAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAPAHAAAAAAAAAAAAPADw//////8BAAAAgP84AAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAIAPAAAAAAAAAAAAMADw//////8BAAADwPs/EAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAJgAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAAAAAA4ADw//////8BAAAK4IEfGAAAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAPABAAAAAB4AAAIAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAwAHw//////8BAACI/wAHCAAAAAAAAAAAAAAAAADgAQAAAAAAAAAAAOAPAAAU4P8AAAAAAAAAAAAAAAAAAAAAAAB8AAAAAAAAAAAAgAPw//////8BAACA/wAAAAAAwAMAAAAAAAAAAADgAwAAAAAAAAAAAAA/ALD//v8DAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAfw//////8BAADALwAAAAAAwAEAAAAAAAAAAADAAwAAAAAAAAAAAAA+AP7/P8ADAACAAQAA8AEAAAAAAAAAAADAAQAAAAAAAAAAAAbw//////8BAADgAQAAAAAAAAAAAAAAAAAAAAAAAwAAAEAAAAAAAABw4P+BBwAHAACAAQAA+AMAAAAAAAAAAADADwAAAAAAAAAAAAbw//////8BAAD4AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADg+wEAAAAHAAABAAAAAAAAAAAAAAAAAAAA/gAAAAAAAAAAAAbw//////8BAAC8AAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAPwAAAAAGAIABAAAAAAAAAAAAAAAAAAAA8AMAAAAAAAAAAA7w//////8BAAAYAAAAALYBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAHAAAAAAAAAAAAAAAAAAAAAAAA4AcAAAAAAAAAAAzg//////8BAAAcAAAAjPkBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAzg//////8B4AAOAAAA+PiBAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAzA//////8B4AAHAAAA8ACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAB+AAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAAAzA//////8B4AAHAAAI8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAD+AQAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAADyA//////8Q8PgDAAAA+P8AAjj3AwAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAACYAwAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAPgA//////8Q/v8BAAAAnv8Pgv//fwAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAMAB/v////8An38AQAAAD4APoP///38AAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAfgAAAAAAAAAAAAAAAAAAAAAAAOABAAAAAAAAAIAf/v////8AAwAA8ACnAwD+/wEA/P//BwAAAAAAAAAAAAAAAAAAAAAAGAAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAOD/AAAAAAAAIAB//P////8AAwAA+Lf/AQD8fwAAAPD/HwAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/AQAAAAAAIAD4/P////+BBwaAv9/5AAAADAAAAAA4PAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwBwACAAAAAADA+/////+B/w/gH/wBAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAACABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACADwAAAAAAAACA/////////x/wAHAAIAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAHwAAAAAAAAAA/v//////F/g+AAAAIAAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgAAAAAAAAAA/P//////D/A/BgAAAAAAAAAAAAAAgAEAAAAAAAAAAAAAAAAAAAB8ABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAA+P//////D4ABBgAAAAAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAAAeADAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAPwAAAAAAAAAA+P//////BwAAAIAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAHBDAAgAAAAAAAAAAAgP8H4B8AAAAAAAAAAAAATwAAAAAAAAAA+P//////DwAAAPABAAMAAAAAAAAAwAIAAAAAAAAAAAAAAAAAAAADBgAAwAAAAAAAAAAAwP8P/v8BAAAAAAAAAAAA/AAAAAAAAAQA+P//////HwAAAPAAAAEQAAAAAAAAwAcAAAAAAAAAAAAAAAAAAIADAAIA2AAAAAAAAAAA8AD8P/A/AAAAAAAAAAAA+AEAAAAAAGwH+P//////PwAAwPAAAAAYAAAAAAAAgD8AAAAAAAAAAAAAAAAAAIADAAMCCAAAgAEAAAAAfADwEQD/AQAAAAAAAAAA8AH4OAAAAGAG+P//////PwAA8DEAAAAAAAAAAAAAAPw7AAAAAAAAAAAAAAAAAMADgADeAAAAgAEAAAAAHwBAAADgBwAAAAAAAAAA4IH//wEAAAAA+P//////PwAA8AMCAAAAAAAAAAAAAOQ/AAAAAAAAAAAAAAAAAIADAACYAAAAgAEAAACAAwAAAAAADwAAAAAAAAAAcMCf/wMAAAAA+P//////PwAA4AMaABgAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAMADAAAYAAAAiAEAAADAAQAAAAAADAAAAAAAAAAAcOABAA8AAAAA/P//////fwAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAMAAAADAAAAADgAAAAAAAAAAAAAAAAAAAA4HAAAB4ABgAA/P///////wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAMAAAADAAAAAAwAAAAAAAAAAAAAAAAAAAAgD8AADgAAAAA/v//////3wAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIABAAAYAAAAAAAAAAA8AAAAAAAAAAAAAAAAAAAAAD8AADAAAAAA/v//////3zkAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAMAAAAAQAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAA////////nz8AAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIMAAAAAAAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAAOABAACA////////Dx8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYOAAAADwAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAMAHAACA////////DwQAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAA4PAAAADwAwAAAAAAAIADAAAAAAAAAAAAAAAAAAAAAAAAAIA/AOCA////////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwH0AAAAAAwAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAB4AODA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAADgATDA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAOAAAAAAAAAAAEAAAAAAAAAAAAAAAADABxDA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgA8AAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHxDG////////DwAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAD4/wMAAAAAAAAAAAAAAHgAAAAAAAAAAAAAAADAAAAAAAAAAAAA/ADG////////DwAAAAAAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAD8/wAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAABAAAAAAAAAAAAA4AHA////////DwAAAAAAAAAA4AEAAAAAAAAADAAAAAAAAAAAAIBPAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAOA////////3wAAAAAAAAAA8AcAAAAAAAAACAAgAAAAAAAAAPAHAAAAAA4AAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcA/////////x8AAAAAAAD4Px8AAAAAAAAAGAAAAAAAAAAA8H8AAAAAAA4AAAAAAAABAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYA/////////38AAAAAAAD+HzwAAAAAAAAACAAAAAAAAAA48B8AAAAAAAAAAAAAAAADAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4A////////D+ADAAAAAPAfAHAAAAAAAAAAAAAAAAAAALAfAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwA////////B+A/MAAAAPwDAHAAAAAAAAAAAAAAAAAAAPwHAAAAAAAAAAAAAAAAAAAMgAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHgA/v//////BwB8cB4AAG4AAGAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAcwAMAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAOAD/P//////BwBo/T9w/AcAAOAAgAMAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAY8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMAP/P//////BwDg33P4/wMAwMABzwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAe/v//////BwDAD+DfnwAAgMDf/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4////////BwCAA8CPAwAAAID/cwAAAAAAAAAAADgAAAAAAAAACAAAAAAAAAAAAADgGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw////////AwAIBwAAAAAAAADgAAAAAAAAAACA338AAAAAAAAAGAAAAAAAAAAAAADAHQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA////////HwAMDgAAAAAAAAAAAAAAAAAAAADA/y8AAAAAAAAAGAAAAIAB+H8AAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////AwAEnB8AAAAAAAAAAAAAAAAAAADwYA4AAAAAAAAAGAAAAAAAfB4AAAEABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////QwAAeD8AAAAAAAAAAAAAAAAAAAAAAAcAAAAAAHAAGAAAAAAADgAAAAEAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//////wwAA8PMLAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPABAAAAAAAABwAAAACAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////AwAA4OEfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////BwAA4IA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA////////BwAAwABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAAAAgAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////DwAAwADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAADwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//////DwAAwADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB+AAA4AAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P//////DwAAwAHACQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPD/AwAwAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////HwAAwAGAPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP7DBwAAAAAAAAAeAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////HwAAgAMAPwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwH8ABgAAAAAAAAAPAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////HwAAAAMA8H8AAAAAAAAAAAAAAAAAAAAAAAAAAAAA8AMADgAAAAAAAMADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////DwCAgQMA4P8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAHAAAAAAAAOwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P//////BwCA8QEAAMADAAAAAAAAAAAAAAAAAAAAAAAAAID/DwAAGAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////AwCA+AAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAPD/DwAAOAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////AAAAOAAAAAAWAAAAAAAAAAAAAAAAAAAAAAAAAPjCAAAAcAAAAAAAsAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/P////9/AAAAMAAAAAA+AAAAAAAAAAAAAAAAAAAAAAAAAD4AAAAA4ABwjAAA/wMAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAA/v////8/AAAAAAAAAAD8AAAAAAAAAAAAAAAAAAAAAAAAwA8AACAAwAP8/gfA7wAAAAAA4AAAAAAAAAcAAAAAAAAAAAAAAAAAAAAA/v////8fAAAAAAAAAADgAQAAAAAAAAAAAAAAAAAAAAAAwAMAACAAgMfe/x/8AQAAAAAAYAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAA/v////8fAAAAAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAOfHh/9/AAAAAAAAAAAAAAAAAAAAAAAgAAEAAAAAAQAAAAAA/v////8fAAAAAAAAAAAA/wAAAAAAAAAAAAAAAAAAAAAA8AAAAAAAAPbHB/F/AAAAAAAAAAAAAAAAAAAAAAAwgAMAAAAAAQAAAAAA//////8fAAAAAAAAAAAAxgEAAAAAAAAAAAAAAAAAAAAAcAAAAAAAgP/DA+AEAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAHAAAAAA//////8/AAAAAAAAAAAQgAMAAAAAAAAAAAAAAAAAAAAAYAAAAAAA4B8AAAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAPABAAAA/v////9/AwAAAAAAANwBAAcAAAAAAAAAAAAAAAAAAAALeAAAAAAA/AAAAAAAAAAAAAAAfAAAAAAAAAAAAAAAAAAAAAAAAMAHAAAA/P//////AgAAAAAAANwBAA4AAAAAAAAAAAAAAAAAAOB/fwAAAADwHwAAAAAAAAD+/wAACAAAAAAAAAAAAAAAAAAAAAAAAAAfAAAA/P//////AQAAAAAAAAAAABwAAAAAAAAAAAAAAAAAgPj/LwAAAAD9AwAAAAAAAPj//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAA/P//////AwAAAAAAAgAAAHgAAAAAAAAAAAAAgAEA4D/AAAAAAIA/AAAAAAAAAP4HAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAA/P//////BwAAAAAAAwAAAOAAAAAAAAAAAAAAAAMA/g8AAAAAAPwHAAAAAAAAgG8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAA/P//////BwAAAAAAAQAAAOAAAAAAAAAAAAAAAAMAPAIAAAAAgH8AAAAAAAAA8AEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAQAA/v//////BwAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAwAcAAAAAAADg/wAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAACAAQAA/P//////BwAAAAAAAHAAAIAPAAAAAAAAAAAAAAAAMAAAAAAAwAMAAAAAAADwHwAAAAAAAAAAAAAAAAAAAABgAAAAAAAAAACAAwAA+P//////BwAAAwAAAGAAAAAGAAAAAAAAAAAAAAAAcAAAAAAAgAcAAAAAAIA/AAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAgA8ABwAA+P//////BwAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAeAAAAAAAAA4AAAAAAOAfAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAAwAcADgAA+P//////BwAAAAAAAAAAAADeyAAAAAAAAAAAAAAAUAAAAAAAAA4AAAAAAP4DAAAAAAAAAEBgAAAAAAAAAAAADAAAAAAAAAEADAAA/P//////BwAAAAAAAAAAAAD8/wcAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAD8AAAAAAAAAAMAAAAAAAAAAAAAADAAAAAAAAAAAHACA/P//////BwAAAAAAAAAAAACw/w/8wQEAAAAAAAAAAAAAAAAAgA8AAAAAgAMAAAAAAAAAIABwAAAAAAAAAAAADAAAAAAAAAAAOACA////////B0AIAAAAAADAAAAAAHz+/wMAAAAAAAAAAAAAAAAAwAcAAAAAwAEAAAAAAAAAIAD+AAAAAAAAAAAADAAAAAAAAAAA8AGA////////B8A4AAAAAADAAQAAAPgHfwcAAAAAAAAAAAAAAAAA4AAAAAAA4AAAAAAAAAAAAIAfAAAAAAAAAAAAHAAAAAAAAAAA4H8A////////BwAYAAAAAADAAAAAAOADMAYAAAAAAAAAAAAAAAAA4AAAAAAAcAAAAAAAAAAAAOADAAADAAAAAAAAGAAAAAAAAAAAAP7/////////E4EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAMAAAAAAAAACA9/8AAAADAAAAAAAAGAAAAAAAAAAAAMD/////////M4MABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAMAAIADPQAAAAAAIODh/z8AAAAAAAAAAAAAOAAAAAAAAAAAAACA////////AwEADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAMAAP//HwAAAAAA/v93HQAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA////////AwAABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAgQMAgP/8BwAAAID+/78/AAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA////////BwAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAEA4AEAAAAAAPj/AQAcAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAA////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAEAcAAAAAAAAPwDAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAA/v//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwCAAOAAAAAAAAA8AAAAAAAAAAAAAQAAAAAAAwAAAAAAAAAAAAAAA/v//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4PwBHAAAAAAA/gMAAAAAAAAAAAAA4AEAAAAAwAEAAAAAAAAAAAAA/v//////H2cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P8/PwAAAADA/wAAAAAAAAAAAAAA4AAAAAAAgAEAAAAAAAAAAAAA/v////////8ChgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4Af/fwAAAADwAwAAAAAAAAAAAAAAAAAAAAAAwAEAAAAAAAAAAAAA/v////////8fgAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8ADg4QMAAAA4AAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAA/P//////H/j/AwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAwA8AAAA+AAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA+P//////H8D8HwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPwAAAD4AAMB/AAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAA+P//////H4APvwEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAHwAAAHgAwPsDAAAAAAAAAAAAAAAAAAAAAAAAMAMAAAAAAAAAAAAA8P//////HwAA/icAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAQAAAOAA8H8AAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA/P//////HwAA/P/nP/D4EQAAAAAAAAAAAAAAAAAAAAAAAADgAQAAAMADfgcAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA+P//////HwAAAPr//P//fwAAAAAAAAAAAAAAAAAAAAAAAABgAAAAAICPHwMAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAA+P//////HwAAAAI/4L9vfwAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAD+hwMAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAA+P//////HwAAAAAIQAQA6AAAAAAAAAAAAAAAAAAAAAAAAADwAAAAAAD4wAEAAAAAAABwAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAA+P//////PwAAAAAAAAAAwAEAAAAAAAAAAAAAAAAAAAAAAAB4AAAAAAAA4AAAAAAAAAB4AAAAAAAAAABwAAAADAAAAAAAAAAAAAAA/P//////PwAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAD8AAAADgAAAAAAAAAAAAAA////////fwAAAAAAAAAAgAcAAAAAAAAAAAAAAAAAAAAAAOAfAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAD/AQAADAAAAAAAAAAAAAAA/////////yAAAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAAAAPgPAAAAAAAAMAAAAAAAAAAAAAAAAAAAwPCHAQAADAAAAAAAAAAAAAAA/////////yEAAAAAAAAAAP4AAAAAAAAAAAAAAAAAAAAAAPwAAAAAAAAAGAAAAAAAAAAAAAAAAAAA8P+BAQAADgAAAAAAAAAAAACA/////////wMAAAAAAAAAAPwDEAB4AAAAAAAAAAAAAAAAAM8AAAAAAAAAGAAAAAAAAAAAAAAAAAAA9z/AAQAADAAAAAAAAAAAAAAA/////////wcAAAAAAAAAAMD///3/AAAAAAAAAAAAAAAAmMMBAAAAAAAAGAAAAAAAAAAAAAAAAADwbwDgAAAAHAAAAAAAAAAAAAAA/////////wcAAAAAAAAAAAD////vAAAAAAAAAAAAAAAA/IMBAAAAAACAHwAAAAAAAAAAAAAAAAD4bwDwAAAAGAAAAAAAAAAAAACA/////////wcAAAAAAAAAAAA+gD/gAAAAAAAAAAAAAAAA/gAAAwAAAADADwAAAAAAAAAAAAAAAAA8fABwAAAAMAAAAAAAAAAAAADA/////////wcAAAAAAAAAAAAAAADADwAAAAAAAAAAAAAABwCCAwAAAADAAAAAAAAAAAAAAAAAAAAPuABwAAAAMAAAAAAAAAAAAAAA/////////wMAAAAAAAAAAAAAAACAHwAAAAAAAAAAAABgBwDiAAADAABgAAAAAAAAAAAAAAAAAAAHgAAwAAAAMAAAAAAAAAAAAACA/////////wMAAAAAAAAAAAAAAAAAPGA4AAAAAAAAAAD/AwAAAAADAABgAAAAAAAAAAAAAAAAAIADAAAwAAAAMAAAAAAAAAAAAACA/////////wMAAAAAAAAAAAAAAAAA8P//AGAAAAAAAOD/AQAAADwAAABwAAAAAAAAAAAAAAAAAIABAAAwAAAAMAAAAAAAAAAAAADg/////////wcAAAAAAAAAAAAAAAAA4P/v/8AHAAAAAPyIAAAAAAwAAAA6AAAAAAAAAAAAAAAAAMAAAACwAAAAMAAAAAAAAAAAAADw/////////wYAAAAAAAAAAAAAAAAAAP+n/+MPAAAAgD8IAAAAAAAAAAAfAAAAAAAAAAAAAAAAAPAAAACwAQAAMAAAAAAAAAAAAAD4/////////wAAAAAAAAAAAAAAAAAAAOQAeP/8BwAAwA8AAAAAAAAAAAAfAAAAAAAAAAAAAAAAAHgAAABwAADgGAAAAAAAAAAAAAD4////////fwAAAAAAAAAAAAAAAAAAAAAAAD/4DwAA4AcAAIABAAAAAAA/AAAAAAAAAAAAAAAAABwAAABwAADgHAAAMAAAAAAAAADw////////PwAAAAAAAAAAAAAAAAAAAAAAAACAfQAAfAAAAIABAAAAAAA4AAAAAAAAAAAAAAAAABwAAABwAAAIDiAAOAAAAAAAAADw////////DwAAAAAAAAAAAAAAAAAAAAAAAAAA/wAAfwAAAAAAAAAAAAA8AAAAAAAAAAAAAAAAABwAAADwAAAMB3AAHAAAAAAAAAD4////////BwAAAAAAAAAAAAAAAAAAAAAAAAAA4AfABwQAAAAAAAAAAAAeAAAAAAAAADAAAAAAAA8AAADwAACAA2AADwAAAAAAAAD4////////BwAAAAAAAAAAAAAAAAAAAAAAAAAAgA/wGQQAAAAAAAAAAAAOAAAAAAAAAAAAAAAA+AcAAADgAQCAAQDABwAAAAAAAADw////////AwDAAQAAAAAAAAAAAAAAAAAAAAAAAP55AAAAAAAAAAAAAAAOAAAAAAAAAAAAwPzh/gEAAADgAwCAAQDAAQAAAAAAAADw////////AQDAAQAAAAAAAAgAAAAAAAAAAAAAAPgfAAAAAAAAAAAAAAAcAAAAAAAAAAAA+P//DwAAAADIBwCAAfzkAAAAAAAAAADA////////AQAAAAAAAAAAAAgAAAAAAAAAAAAAADgPAAAAAAAAAAAAAAD4BwAAAAAAAADA/wf/AwAAAADeDwDgAf9/ABgAAAAAAADA////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAADwDwAAAAAAAAD/PwQAAAAAAACAHQDggIc/AAAAAAAAAADA////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAABwAAAAAAAAHIAAAABgAPt/AAAAAAAAAACAOwDwzwEAAAAAAAAAAADA////////AAAAAAAAAOA/AAAAAAAAAAAAAAAAAAYAAAAAAABgAAAAOAABOIAAAAD88P8DAAAAAAAAAADAcQCw/wAAAAAAAAAAAAAA//////9/AAAAAIAAAP4fAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAA8AAAcAAAAAD//w8AAAAAAAAAAADg5ACwOQAAAAAAAAAAAAAA//////9/AAAAAMAAHz8YAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAwAwAYAAAgP/HDwAAAAAAAAAAAABgxgH4AAAAAAAAAAAAAADA//////8/AAAAAAAA/wcAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAA4M4AAA/P8DAAAAAAAAAAAAAAAAgMMfAAAAAAAAAAAAAAAA//////8fAADAAEcA9wEAAAAeAAAAAAAAAAAAAAMAAAAAAAAAAAAAwAYAwAAA/ncAAAAAAAAAAAAAAOAPAOcPAAAAAAAAAAAAAAAg//////8fAADg////DwAAAAAfAAAAAAAAAAAAAAcAAAAAAAAAAAAAgACAwACA/wBgAAAAAAAAAAAAAOAPAH4AAAAAAAAAAAAAAADA//////8PAAD8//3/BwAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAgAHAPwBgAAAAAAAAAAAAAAAAADwAAAAAAAAAAAAAAACA//////8PAAD//wP45xAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAABAPwBwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA//////8PAID//x/+//8AAAAAAAAAAAAAAAAwAAMAAAAAAAAAAAAAAAAABAb4AAAAAAAAAAAAAAAAAAAgAAwAAAAAAAAAAAAAAADA//////8PAMCDwv2fH/8BAAAAAAAAAAAAAAAQgAMAAAAAAAAAAAAAHgAAggz8AQAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAADA//////8HAPAAAPADAIADAAAAAAAAAAAAAAAIgAEAAAAAAAAAAAAADgAAwxz8AAAAAAAAAAAAAAAAAAAGAAAAAAAAAAAAAAAAAACA//////8HAH4AAAAAAIAHAAAAAAAAAAAAAAAPgAEAAAAAAABgAAAAAAAAADg8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACA//////8H4K8BAAAAAAA+AAAAAAAAAAAAAMAPgAEAAAAAAAB4AAAAAAAAADA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+/////8H+YMBAAAAAMD8AwAAAAAAAAAAAIAAgAEAAAAAAAAIAAAAAAAAAHAcAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAA8P//////fwAAAAAAAODgDwAAAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAOAPAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAA+P//////HwAAAAAAAGAwPAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAMAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P////8HAAAAAIAAAAAAeAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAPADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P////8HAAAAAAAAAAAA4AEAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAHABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P////8HAAAAAAAAAAAAwwMAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAA4P////8HAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAA4P////8PAAAAAAAAAAIAAP4AAAAAAAAAAAAAgAMAAAAAAAAAAAAAAAAAAGAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAE4P////8PAAAAAAAAAAAAAOAAAAAAAAAAAAAA3gEAAAAAAABAAAAAMAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM4P////8fAAAAAAAAAAAAAMADAAAAAAAAAAAAzgAAAAAAAADgAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAA8P////8fAAAAAAAAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAADAAAAAAAAAAAADAAwAAAAAAAAA4AAAAAAAAAAAAAAAA+P////8/AAAAAAAAAAAAAAAOAAAAAAAAAAAwAAAAAAAAAAB4AAAAAAAAAPAAAAAAAAAAAADwAwAAAAAAAAAwAAAAAAAAAAAAAAAA/P////9/AAAAAAAAAAAAAAAcAAAAAAAAAAAwAAAAAAAAAADwAAAAAAAAAOAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P////9/AAAAAAAAAAAAAAAcAAAAAAAAAAAQAAAAAAAAAADgAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////AAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAACgAQAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////AQAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAA+P//////AQAAAAAAAAAAAABgAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAA+P//////AwAAAAAAAAAAAABgAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAIAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeAAAAAAAA8P//////BwAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+AAAAAAAA+P//////BwAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAA/P//////BwAAAAAAAAAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAA+P//////BwAAAAAAAAAAAADAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAA+P//////BwAAAAAAAAAAAACAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8P//////AwAAAAAAAAAAAQCAAwAAAAAAAAAAAAAAAAAAAAAAABwAAAAAAAAGAAAABwAAAAAAAAMAAAAAAAAAAAAAAAAADAAAAAAA/P//////AQAAABgAAAAAAQAAAwAAAAAAAAAAAAAAAADADAAA+B8AAAAAAAAHAACABwAAAAAgAAAAAAAAAAAAAAAAAAAADAAAAAAA/v//////AQAAABAAAAAAAAAAAAAA+AAAAAAAAAAAAAAAAAAA8B8AAAAAAIADAAAABwAAAABgAAAAAAAAAAAAAAAAAAAADgAAAAAA/v//////AAAAAAAAAAAAAAAAAAAA8AMAAAAAAAAAAAAAAAAAwAMAAAAAAAAHAAAADgAAAABgAAAAAAAAAAAAAAAAAAAADAAAAAAA/v//////AAAAAAAAAAAAAAAAAAYAAAMAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAAHgAAAAB4AAAAAAAAAAAAAAAAAAAAHAAAAACA////////AQAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAADgAAAABwAAAAAAAAAAAAAAAAAAAAOAAAAACA////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAAADgAAAAAAAAAAAAAAAAAAAAAAAAAAOAAAAACA////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAACAAAAHgAAAAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAA////////AwAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAABAAAAAAAGIAACAAAAACAAAAPgAAAABAAAAAAAQAAAAAAAAAAAAAcAAAAAAA////////AwAAAAAAAAAAAAAAAAAAAAAAAMAAAAAAABAAAAAwAAAAAGB/AMAHAAAAAAAAAABAAAAAAAwAAAAAAAAIAAAA4AAAAAAA/P//////BwAAAAAAAAAAAAAAAAAAAAAAGEAAAAAAAAAAAAAgAAAAAAB+AMADAAAAAAAAAAAAAAAAAAwAAAAAAAAcAAAAwAAAAAAA+P//////BwAAAAAAAAAAAAAAAAAAAAAAHwAAAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAAAAAwAAAAAAAAPAAAAwAEAAAAA4P//////DwAAAAAAAAAAAAAAAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAIABAAAAAAAAAAAAAAEAAAAAAAAAAAAOAAAAgAMAAAAA4P//////DwAAAAAAAAAACAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAMAAAAAwP//////DwAAAAAAAAAADgAAAAAAAAAAAAAAABgAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAMAAAAAwP//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAABAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMA4B8AgP//////DwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAEA8P8HgP//////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAAAMAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAgAGAP/APgP//////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAA4AAAAAAAAAAAAAAAAAAAAAAADAABAAAAAgAOADwAcAP//////BwAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAfgAAA4AP//////BwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAABgAAADMAAAAAAAAAAAAAAAAAAHAAAAAAAAAP5/AAAwAP7/////AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPw/AAAwAP7/////AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwAP7/////AwAAAAAAAAAAQAAHAAAAAAAAAAAAAAAAAABgAAAAAAAAAAAAAADAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAADgAP//////AwAAAAAAAAAAYAAEAAAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAABwAAQAAAADAAAAAAAAAAAAAEAAAAAwAAAAAAAADAAP//////AwAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAADgAAAAAAAAAAAAAAAABgAAQAAAAAAAAAAAAAAAAAAMAAAAAAAAAAAAAACAg///////BwAAAAAAAAAAAAAAAAAAAAAAgAMAAAAAAADwAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAA////////BwAAAAAAAAAAAAAAAAAAAAAA+AMAAAAAAABwAAAAAAAAAAAAAGwAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v//////BwAAAAAAAAAAAAAAAADgAQAA8AAAAAAAAAAwAAAAAAAAAAAAgP8BAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P//////BwAAAAAAAAAAAAAAAADwAQAAIAAAAAAAAAAwAAAAAAAAAAAA8P8BBgAAgAAAAAAAAAAAAAAAAAAAAAAAAA4AAAAAAAAA8P//////hwAAwP8HAAAAAAAAAAAAAAAAAAAAAAAgAAD8AQAAAMABgAAA/v/vDwAAwAcAAAAADAAAAAAAAAAAAAAA4P8AAAAAgBkA/P//////+wcA+P8fAAAAAAAAAAAAAAAAADAAAAD8AMD//wEAAPj//w8A/v//HwAA4N8PAAAAPCAAAMD/k4N+AAD8//8fAAAAwP8A/v/////////9//9/AAAAAAAAAAAAAADwATAAAAD/B/7///+wCfz//z/g////PwAA/P+fAwAA//0AAP7//9//APj///9/AAAA4P9/////////////////AQAAAACAAAAAAAD8MDDAB4D////////9j////////////wHA////lwMS//9/AP//////v///////AQDA////////////////////DwAAAADo7wAAAAD4/zn8//z/////////7////////////3///////5ff////////////////////HwD8////////////////////XwAAAAD+/z8AAAD8//////////////////////////////////////////////////////////////3/////////////////////fziAg/z//38AAGD////////////////////////////////////////////////////////////////////////////////////////f///////xA/z////////////////////////////////////////////////////////////////////////////////////////////////9D/7/////////////////////////////////////////////////////////////////////////////////////////////////v///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////";
const WATER_MASK = (() => {
  const bin = atob(WATER_MASK_B64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
})();
// null — точка вне запечённой области (мир игры шире зафиксированного региона):
// там настоящих данных просто нет, и вызывающий откатывается на процедурную
// формулу, как было всегда.
function maskWaterAt(x, y) {
  const px = Math.floor((x + 0.5 + WATER_MASK_HALF_X) / WATER_MASK_STEP);
  const py = Math.floor((y + 0.5 + WATER_MASK_HALF_Z) / WATER_MASK_STEP);
  if (px < 0 || py < 0 || px >= WATER_MASK_W || py >= WATER_MASK_H) return null;
  const i = py * WATER_MASK_W + px;
  return ((WATER_MASK[i >> 3] >> (i & 7)) & 1) === 1;
}
function isRealWater(x, y) {
  const m = maskWaterAt(x, y);
  if (m !== null) return m;
  return rwHeightAt(x + 0.5, y + 0.5) < RW_SEA;
}
// Те же значения, что и в index.html/mp-join — держать в синхроне вручную.
const STEEP_SAMPLE_R = 3, STEEP_MAX_RISE = 0.11;
function isTooSteep(x, y) {
  const cx = x + 0.5, cy = y + 0.5;
  const c = rwHeightAt(cx, cy);
  const d1 = Math.abs(rwHeightAt(cx + STEEP_SAMPLE_R, cy) - c);
  const d2 = Math.abs(rwHeightAt(cx - STEEP_SAMPLE_R, cy) - c);
  const d3 = Math.abs(rwHeightAt(cx, cy + STEEP_SAMPLE_R) - c);
  const d4 = Math.abs(rwHeightAt(cx, cy - STEEP_SAMPLE_R) - c);
  return Math.max(d1, d2, d3, d4) > STEEP_MAX_RISE;
}
// Зазор от уже существующих точек/лагерей — тот же принцип и то же число,
// что и в mp-join (MIN_STRUCT_GAP там же), помягче полноценного
// findFreeCellInChunk в index.html: сеть дороже, чем чистый JS-перебор.
// Минимум 30 клеток между ЛЮБЫМИ объектами — точками, лагерями/фортами и
// замками (прямая просьба автора). Было 6, и проверялось только между
// клетками map_cells: замки в проверку не входили вовсе, поэтому фоновый
// подсев мог положить точку прямо на чужую столицу.
// SEED_MAX_SPREAD обязан согласовываться с окном выборки соседей (pad в
// pickWildSpot): попытка за краем окна не видит соседей и зазор там тихо не
// соблюдается. Держать в согласии вручную.
const MIN_STRUCT_GAP = 30, SEED_TRIES = 24, SEED_SPREAD_AFTER = 6, SEED_MAX_SPREAD = 2;
// Соседи — И клетки карты, И замки игроков, приведённые к одной форме {x,y}:
// дальше они неразличимы, минимум общий для всех пар без исключений.
async function fetchNearby(admin, worldId, cx, cy, pad) {
  const [cells, players] = await Promise.all([
    admin.from("map_cells").select("x,y").eq("world_id", worldId)
      .gte("x", cx - pad).lte("x", cx + pad).gte("y", cy - pad).lte("y", cy + pad),
    admin.from("players").select("x,y").eq("world_id", worldId)
      .gte("x", cx - pad).lte("x", cx + pad).gte("y", cy - pad).lte("y", cy + pad),
  ]);
  if (cells.error) throw cells.error;
  if (players.error) throw players.error;
  return [...(cells.data || []), ...(players.data || [])];
}
function tooCloseToAny(cells, x, y, gap) {
  for (const c of cells) if (Math.hypot(c.x - x, c.y - y) < gap) return true;
  return false;
}
// Общий подбор места для ОДНОЙ точки/лагеря вокруг (cx,cy) — не вода, не
// крутой склон, не впритык к соседям. Соседи запрашиваются один раз на
// вызов (не на каждую попытку внутри цикла) — восемь честных попыток, потом
// тот же редкий отказ "берём как есть", что и раньше был только у воды.
async function pickWildSpot(admin, worldId, cx, cy, minR, maxR) {
  // Запас окна втрое шире номинального кольца — попытки ниже могут
  // расширяться (SEED_SPREAD_AFTER), и сосед за краем окна остался бы
  // невидимым, то есть зазор тихо не соблюдался бы на границе выборки.
  const pad = maxR * SEED_MAX_SPREAD + MIN_STRUCT_GAP;
  let nearby = [];
  try { nearby = await fetchNearby(admin, worldId, cx, cy, pad); } catch (_) { /* без соседей — сеем как есть */ }
  for (let t = 0; t < SEED_TRIES; t++) {
    // С жёстким зазором 30 узкое кольцо часто целиком занято — после
    // SEED_SPREAD_AFTER неудач расширяемся, чтобы было куда уйти.
    const spread = Math.min(SEED_MAX_SPREAD, t < SEED_SPREAD_AFTER ? 1 : 1 + (t - SEED_SPREAD_AFTER) * 0.35);
    const ang = Math.random() * Math.PI * 2;
    const r = (minR + Math.random() * (maxR - minR)) * spread;
    const x = Math.round(cx + Math.cos(ang) * r), y = Math.round(cy + Math.sin(ang) * r);
    if (isRealWater(x, y)) continue;
    if (isTooSteep(x, y)) continue;
    if (tooCloseToAny(nearby, x, y, MIN_STRUCT_GAP)) continue;
    return { x, y };
  }
  return null; // места нет — честнее не создать объект, чем поставить его внахлёст
}

// Фаза 8, кусочек 3 — респаун истощённой точки/разгромленного лагеря.
// Те же задержки, что CFG.NODE_RESPAWN/CFG.RESPAWN_CAMP в index.html:
// 1717-1718 (45мин/1ч). Новое место — небольшое смещение от старого, теперь
// через тот же pickWildSpot, что и everything else ниже (не полноценный
// findFreeCellInChunk с перебором чанка, как в index.html — тот же честный
// уровень упрощения, что и у seedNodesAround/seedCampsAround в mp-join):
// upsert с ignoreDuplicates молча пропускает редкую коллизию координат,
// следующий respawn всё равно рано или поздно найдёт свободное место
// где-то ещё.
const NODE_RESPAWN_SEC = 3600, CAMP_RESPAWN_SEC = 2700;
// Двенадцать часов на то, чтобы союз поставил на разорённом месте свою
// крепость. Не поставил — варвары возвращаются. Прямое условие автора:
// «если альянс не построит крепость спустя 12 часов после разрушения
// крепости варваров, там опять появится эта крепость варваров».
const REGFORT_RESPAWN_SEC = 12 * 3600;
// Вместимость крепости союза — 2 000 000 и неизменна (условие автора). Копия
// ALLY_FORT_CAP из index.html и mp-alliance по правилу самодостаточных
// функций; уровней у крепости нет, поэтому число здесь одно, а не таблица.
const REGFORT_ALLY_CAP = 2000000;
// Кольцо 3..12 вокруг истощённой точки целиком ближе минимума в 30 клеток от
// соседей — сдвинуто наружу с сохранением ШИРИНЫ (было 3..12, ширина 9,
// стало 30..39), иначе respawn не смог бы разместиться нигде.
const RESPAWN_MIN_R = MIN_STRUCT_GAP, RESPAWN_MAX_R = MIN_STRUCT_GAP + 9;
async function applyNodeRespawn(admin, ev) {
  const ox = ev.data && ev.data.x, oy = ev.data && ev.data.y;
  if (ox == null || oy == null) return;
  const spot = await pickWildSpot(admin, ev.world_id, ox, oy, RESPAWN_MIN_R, RESPAWN_MAX_R);
  if (!spot) return;   // вокруг тесно — точка не возрождается здесь, ambient-подсев наверстает в другом месте
  const { x, y } = spot;
  const lv = 1 + Math.floor(Math.random() * 3); // тот же диапазон, что seedNodesAround в mp-join
  const { res, amount } = pickNodeResAndAmount(lv);
  const { error } = await admin.from("map_cells").upsert(
    { world_id: ev.world_id, x, y, t: "node", data: { res, lv, amount, max: amount } },
    { onConflict: "world_id,x,y", ignoreDuplicates: true },
  );
  if (error) throw error;
}
// Возвращение варваров в разорённую крепость региона. В отличие от лагеря,
// клетка никуда не девалась (крепость привязана к месту, см. миграцию 0013) —
// меняется только состояние.
//
// Событие может опоздать или прийти дважды (аренда claimed_at, перезапуск
// тикера), а за двенадцать часов на месте могло произойти что угодно, поэтому
// проверяется ВСЁ: клетка ещё крепость, она всё ещё разорена, и разорена
// ИМЕННО ТЕМ разорением, под которое заводилось событие (razed_at). Последнее
// важнее всего: без него второй штурм, случившийся через час после первого,
// получил бы возврат варваров от старого события — через одиннадцать часов
// вместо двенадцати.
async function applyRegfortRespawn(admin, ev) {
  const { x, y, razed_at } = ev.data || {};
  if (x == null || y == null) return;
  const { data: cell } = await admin.from("map_cells")
    .select("data,t").eq("world_id", ev.world_id).eq("x", x).eq("y", y).maybeSingle();
  if (!cell || cell.t !== "regfort") return;
  const d = cell.data || {};
  const nowSec = Date.now() / 1000;

  // Фаза 55 — ЗАЛОЖЕННАЯ СТРОЙКА ЗАМОРАЖИВАЕТ ТАЙМЕР ВАРВАРОВ. Прямое
  // указание автора; двенадцать часов — это срок на то, чтобы к разорённому
  // месту вообще приступили, а не на то, чтобы успеть достроить. Про
  // очевидное следствие («так можно держать место сколько угодно») он сказал
  // прямо: «при насыщенной игре навряд ли такое будет».
  //
  // Заморозка — не удаление события, а перевешивание его на после стройки. Без
  // этого спот остался бы вообще без часового: событие достройки одно, и если
  // оно потеряется (строка events не доедет, тик упадёт на ней раз за разом),
  // клетка навсегда застынет в state:'building' — мёртвое место посреди
  // области, которое уже ничем не расшевелить. Перевешенный часовой такую
  // потерю и ловит: пришёл, увидел, что срок стройки давно прошёл, — и
  // достраивает сам.
  if (d.state === "building") {
    const bt1 = Number(d.build_t1 || 0);
    // Срока стройки нет вовсе — данные клетки испорчены. Тот же исход, что и
    // у просроченной: достраиваем и выходим. Иначе часовой перевешивал бы сам
    // себя каждые десять минут до скончания мира.
    if (!(bt1 > 0) || nowSec > bt1 + 60) {
      await applyRegfortBuilt(admin, { world_id: ev.world_id,
        data: { x, y, alliance_id: d.alliance_id, t1: bt1 } });
      return;
    }
    // Ещё строится — просто отодвигаем часового за срок стройки. razed_at
    // несём прежний: если стройка сорвётся (роспуск союза), она сама поставит
    // новое разорение со своим razed_at, и этот часовой тихо разойдётся.
    const nextAt = Math.max(bt1 + 120, nowSec + 600);
    await admin.from("events").insert({
      world_id: ev.world_id, fire_at: new Date(nextAt * 1000).toISOString(),
      type: "regfort_respawn", data: { x, y, razed_at: d.razed_at },
    });
    return;
  }

  if (d.state !== "razed") return;                       // союз успел построить свою
  if (razed_at && d.razed_at && d.razed_at !== razed_at) return;   // разорение уже другое
  const next = Object.assign({}, d, { state: "barb", alliance_id: null, razed_at: null });
  await admin.from("map_cells").update({ data: next, updated_at: new Date().toISOString() })
    .eq("world_id", ev.world_id).eq("x", x).eq("y", y);
}
// Фаза 55 — крепость союза достроена.
//
// Событие сверяется с клеткой ТЕМ ЖЕ приёмом, что и respawn выше: в data
// лежит собственный срок стройки (build_t1), и событие с чужим сроком тихо
// уходит ни с чем. Нужно это из-за «доложить в казну»: ускорение не отменяет
// уже поставленное событие (отменять чужие строки в events эта функция не
// умеет), а ставит второе, на новый срок. Первым сработает новое — оно
// раньше; старое придёт потом и увидит, что клетка уже не строится.
async function applyRegfortBuilt(admin, ev) {
  const { x, y, alliance_id, t1 } = ev.data || {};
  if (x == null || y == null) return;
  const { data: cell } = await admin.from("map_cells")
    .select("data,t").eq("world_id", ev.world_id).eq("x", x).eq("y", y).maybeSingle();
  if (!cell || cell.t !== "regfort") return;
  const d = cell.data || {};
  if (d.state !== "building") return;                       // разорили/достроили без нас
  if (d.alliance_id !== alliance_id) return;                // стройку ведёт уже другой союз
  // Срок мог уехать вперёд (казну доложили ещё раз, см. forthelp) — тогда
  // это событие протухло, и достраивает не оно.
  if (t1 != null && Number(d.build_t1) > Number(t1) + 1) return;
  // Союз мог распуститься, пока шла стройка: тогда достраивать не для кого,
  // и место возвращается варварам обычным порядком.
  const { data: al } = await admin.from("alliances")
    .select("id,disbanded_at").eq("id", alliance_id).maybeSingle();
  const nowSec = Date.now() / 1000;
  if (!al || al.disbanded_at) {
    const gone = Object.assign({}, d, { state: "razed", alliance_id: null, razed_at: nowSec,
                                        build_t0: null, build_t1: null, build_cost: null });
    await admin.from("map_cells").update({ data: gone, updated_at: new Date().toISOString() })
      .eq("world_id", ev.world_id).eq("x", x).eq("y", y);
    await admin.from("events").insert({
      world_id: ev.world_id, fire_at: new Date((nowSec + REGFORT_RESPAWN_SEC) * 1000).toISOString(),
      type: "regfort_respawn", data: { x, y, razed_at: nowSec },
    });
    return;
  }
  // Уровней у крепости союза нет — она уникальна, как святыня (условие
  // автора). Всё, что у неё есть, — хозяин и вместимость, и та неизменна.
  const next = Object.assign({}, d, {
    state: "ally", alliance_id, built_at: nowSec, cap: REGFORT_ALLY_CAP,
    // razed_at гасим вместе со стройкой: разорение кончилось, и оставлять его
    // в клетке значило бы держать метку, по которой сверяются часовые
    // возврата варваров (см. applyRegfortRespawn).
    razed_at: null, build_t0: null, build_t1: null, build_cost: null,
  });
  await admin.from("map_cells").update({ data: next, updated_at: new Date().toISOString() })
    .eq("world_id", ev.world_id).eq("x", x).eq("y", y);
  await admin.from("alliance_chat").insert({
    alliance_id, player_id: null, nick: "", kind: "system",
    body: "Крепость союза встала на «" + (d.shrine || "твердыне") + "» (" + x + ", " + y + "). " +
          "Область " + (d.region_name || "") + " теперь за нами.",
  });
}
async function applyCampRespawn(admin, ev) {
  const ox = ev.data && ev.data.x, oy = ev.data && ev.data.y;
  if (ox == null || oy == null) return;
  const spot = await pickWildSpot(admin, ev.world_id, ox, oy, RESPAWN_MIN_R, RESPAWN_MAX_R);
  if (!spot) return;   // см. respawn узла выше
  const { x, y } = spot;
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
// дна (applyNodeRespawn/applyCampRespawn выше срабатывают только ПОСЛЕ
// чьей-то добычи — далеко от городов, куда ещё никто не дошёл, точек как
// не было, так и нет).
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
// Раньше здесь стояло честное упрощение "без isRealWater — не проверяем
// воду ради ambient-точек" — теперь тот же рельефный блок уже есть в этом
// файле (см. pickWildSpot выше, используется и respawn'ом), так что и
// фоновый подсев проверяет воду/крутизну/соседей тем же способом, без
// исключений: карта общего мира не должна тихо накапливать точки в реках
// именно в фоновом канале, который работает постоянно, весь запас игры.
const AMBIENT_SEED_INTERVAL_SEC = 600; // 10 минут — не тема "раз в секунду", это фоновый прирост контента, не отклик на действие игрока
const AMBIENT_NODE_MIN_R = 30, AMBIENT_NODE_MAX_R = 90; // шире собственного кольца новичка (8-25) — свободная территория МЕЖДУ городами, не чей-то персональный задний двор
const AMBIENT_NODE_PER_PLAYER = 3, AMBIENT_NODE_FLOOR = 20; // потолок узлов = max(20, игроков×3)
const AMBIENT_CAMP_PER_PLAYER = 1.5, AMBIENT_CAMP_FLOOR = 10;
const AMBIENT_NODE_BATCH = 2, AMBIENT_CAMP_BATCH = 1;
// Уборка ВЫЧЕРПАННЫХ ДОЧИСТА точек, к которым никто не идёт.
//
// Такая точка на карте не должна залёживаться: удаляет её и заводит respawn
// applyGathered — то есть тот отряд, который её выбрал. Но amount может
// обнулиться и БЕЗ отряда: mp-gather бронирует добычу при отправке, и если
// отправка дальше сорвалась, бронь оставалась висеть (ровно этот баг чинится
// в mp-gather — «резко обнулило янтарную жилу и не позволило собрать»).
// Такую точку убирать было некому: она оставалась на карте навсегда, с
// нулевыми резервами и подписью «Точка истощена».
//
// Живём внутри ambient_seed: он и так крутится раз в десять минут и занят
// ровно содержимым карты — отдельная цепочка событий тут была бы лишней
// сущностью, да ещё и требовала бы миграции для первого звена.
//
// Точку, на которую ИДЁТ или на которой УЖЕ СОБИРАЕТ чей-то отряд, не
// трогаем: у неё ноль законный (вся добыча забронирована за ним), и разберёт
// её applyGathered, когда отряд закончит.
async function sweepEmptyNodes(admin, worldId) {
  const [cellsRes, marchesRes] = await Promise.all([
    admin.from("map_cells").select("x,y,data").eq("world_id", worldId).eq("t", "node"),
    admin.from("marches").select("tx,ty,state,mode").eq("world_id", worldId).eq("mode", "gather"),
  ]);
  if (cellsRes.error || marchesRes.error) return;
  const busy = new Set();
  for (const m of (marchesRes.data || [])) {
    if (m.state === "go" || m.state === "gather") busy.add(m.tx + "," + m.ty);
  }
  const dead = (cellsRes.data || []).filter(
    (c) => ((c.data && c.data.amount) || 0) <= 0 && !busy.has(c.x + "," + c.y));
  if (!dead.length) return;
  const nowSec = Date.now() / 1000;
  for (const c of dead) {
    await admin.from("map_cells").delete().eq("world_id", worldId).eq("x", c.x).eq("y", c.y);
    await admin.from("events").insert({
      world_id: worldId, fire_at: new Date((nowSec + NODE_RESPAWN_SEC) * 1000).toISOString(),
      type: "node_respawn", data: { x: c.x, y: c.y },
    });
  }
  console.log("sweepEmptyNodes: убрано пустых точек", dead.length, "в мире", worldId);
}

async function applyAmbientSeed(admin, ev) {
  const worldId = ev.world_id;
  try {
    // Сначала уборка, потом досев: иначе потолок точек считался бы вместе с
    // мёртвыми, и карта не досевала бы новые, будучи «полной» пустышками.
    try { await sweepEmptyNodes(admin, worldId); }
    catch (e) { console.error("sweepEmptyNodes:", String(e && e.message || e)); }
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
            const spot = await pickWildSpot(admin, worldId, c.x, c.y, AMBIENT_NODE_MIN_R, AMBIENT_NODE_MAX_R);
            if (!spot) continue;   // места нет — лучше не досеять, чем положить внахлёст
            const { x, y } = spot;
            const lv = 1 + Math.floor(Math.random() * 3);
            const { res, amount } = pickNodeResAndAmount(lv);
            rows.push({ world_id: worldId, x, y, t: "node", data: { res, lv, amount, max: amount } });
          }
          if (rows.length) await admin.from("map_cells").upsert(rows, { onConflict: "world_id,x,y", ignoreDuplicates: true });
        }
        if ((campCount || 0) < campCap) {
          const rows = [];
          for (let i = 0; i < AMBIENT_CAMP_BATCH; i++) {
            const c = players[Math.floor(Math.random() * players.length)];
            const spot = await pickWildSpot(admin, worldId, c.x, c.y, AMBIENT_NODE_MIN_R, AMBIENT_NODE_MAX_R);
            if (!spot) continue;   // см. подсев узлов выше
            const { x, y } = spot;
            const lv = 1 + Math.floor(Math.random() * 5);
            rows.push({ world_id: worldId, x, y, t: "camp", data: { lv } });
          }
          if (rows.length) await admin.from("map_cells").upsert(rows, { onConflict: "world_id,x,y", ignoreDuplicates: true });
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
// =============================================================================
// РАЗОВАЯ ЧИСТКА УЖЕ СУЩЕСТВУЮЩИХ НАЛОЖЕНИЙ (type:"overlap_cleanup").
//
// Автор: «миграции не произошло, старые точки как стояли наложенные друг на
// друга, так и стоят». Всё верно, и вот почему клиентская миграция тут ни при
// чём: thinMapDensity10 в index.html ходит по W.map — это ОДИНОЧНАЯ игра. В
// общем мире точки и лагеря живут строками map_cells в базе, их не видит
// никакая клиентская миграция. А правка размещения (MIN_STRUCT_GAP=30 и маска
// настоящей воды) запрещает только НОВЫЕ наложения — то, что уже лежит в
// таблице, она не трогает по определению.
//
// Поэтому чистка живёт здесь, серверным событием, по образцу ambient_seed.
// Заводится один раз миграцией 0006 и себя НЕ перепланирует (в отличие от
// ambient_seed) — это разовая уборка, а не цепочка.
//
// Что удаляется:
//   1. клетки в НАСТОЯЩЕЙ воде (по запечённой маске выше — той же, что теперь
//      判 судит размещение);
//   2. клетки ближе MIN_STRUCT_GAP к ЗАМКУ — у столицы приоритет, она никогда
//      не удаляется (это состояние игрока, из зерна не восстанавливается);
//   3. из пары клеток ближе MIN_STRUCT_GAP друг к другу — одна: точка сбора
//      ценнее лагеря (тот же приоритет, что и у клиентской чистки), при равном
//      типе удаляется вторая по порядку.
//
// Чего чистка НЕ трогает никогда:
//   - игроков (таблица players вообще не изменяется);
//   - клетку, в которую прямо сейчас идёт чей-то поход (marches по tx/ty) —
//     иначе отряд прибыл бы в пустоту. Такие клетки просто остаются как есть,
//     следующая уборка (если её завести повторно) их подберёт.
// Заводится САМА, без ручного SQL: миграция 0006 остаётся как способ
// запустить уборку повторно, но обычному пользователю достаточно задеплоить
// эту функцию. Флаг живёт в памяти экземпляра — проверка делается один раз на
// холодный старт (экземпляры живут долго), то есть это единицы лишних запросов
// в сутки, а не запрос на каждый тик.
let cleanupEnsured = false;
async function ensureOverlapCleanupScheduled(admin) {
  if (cleanupEnsured) return;
  cleanupEnsured = true;
  try {
    const { data: worlds } = await admin.from("worlds").select("id");
    for (const w of (worlds || [])) {
      const { data: seen } = await admin.from("events").select("id")
        .eq("world_id", w.id).eq("type", "overlap_cleanup").limit(1);
      if (seen && seen.length) continue;
      await admin.from("events").insert({
        world_id: w.id, fire_at: new Date().toISOString(), type: "overlap_cleanup", data: {},
      });
      console.log("overlap_cleanup: уборка запланирована для мира", w.id);
    }
  } catch (e) {
    // Не критично: уборка — разовая гигиена, а не то, без чего тик не работает.
    console.error("overlap_cleanup: не удалось запланировать:", String(e && e.message || e));
  }
}
const CLEANUP_BATCH_LOG = 40; // сколько удалённых координат печатать в лог, чтобы не залить его целиком
async function applyOverlapCleanup(admin, ev) {
  const worldId = ev.world_id;
  const [cellsRes, playersRes, marchesRes] = await Promise.all([
    admin.from("map_cells").select("x,y,t").eq("world_id", worldId),
    admin.from("players").select("x,y").eq("world_id", worldId),
    admin.from("marches").select("tx,ty,state").eq("world_id", worldId),
  ]);
  if (cellsRes.error) throw cellsRes.error;
  if (playersRes.error) throw playersRes.error;
  const cells = cellsRes.data || [];
  const players = playersRes.data || [];
  // Цели идущих походов — их клетки неприкосновенны (см. комментарий выше).
  const targeted = new Set();
  for (const m of (marchesRes.data || [])) {
    if (m.state !== "back") targeted.add(m.tx + "," + m.ty);
  }
  const key = (c) => c.x + "," + c.y;
  const drop = new Set();
  const dropIf = (c) => { if (!targeted.has(key(c))) drop.add(key(c)); };

  // 1) вода
  for (const c of cells) if (isRealWater(c.x, c.y)) dropIf(c);
  // 2) вплотную к замку
  for (const c of cells) {
    if (drop.has(key(c))) continue;
    for (const p of players) {
      if (Math.hypot(p.x - c.x, p.y - c.y) < MIN_STRUCT_GAP) { dropIf(c); break; }
    }
  }
  // 3) пары между собой; точка (node) ценнее лагеря/форта
  const rank = (c) => (c.t === "node" ? 0 : 1);
  const sorted = cells.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 0; i < sorted.length; i++) {
    if (drop.has(key(sorted[i]))) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (drop.has(key(sorted[j]))) continue;
      if (sorted[j].x - sorted[i].x >= MIN_STRUCT_GAP) break; // отсортировано по x — дальше только дальше
      if (Math.hypot(sorted[i].x - sorted[j].x, sorted[i].y - sorted[j].y) >= MIN_STRUCT_GAP) continue;
      // Удаляем менее ценную из пары. Если та под защитой похода — пробуем вторую.
      const a = sorted[i], b = sorted[j];
      const loser = rank(a) <= rank(b) ? b : a;
      const other = loser === a ? b : a;
      if (!targeted.has(key(loser))) drop.add(key(loser));
      else if (!targeted.has(key(other))) drop.add(key(other));
      if (drop.has(key(a))) break; // сам i выбыл — дальше сравнивать его не с кем
    }
  }

  // Удаление по одной строке: пар координат немного (десятки), а PostgREST не
  // умеет IN по составному ключу — честнее явный цикл, чем самодельный or-фильтр.
  let removed = 0;
  const sample = [];
  for (const k of drop) {
    const [x, y] = k.split(",").map(Number);
    const { error } = await admin.from("map_cells").delete()
      .eq("world_id", worldId).eq("x", x).eq("y", y);
    if (error) { console.error("overlap_cleanup: не удалось удалить", k, error.message); continue; }
    removed++;
    if (sample.length < CLEANUP_BATCH_LOG) sample.push(k);
  }
  console.log(`overlap_cleanup: было клеток ${cells.length}, удалено ${removed}, ` +
    `под защитой походов ${targeted.size}; примеры удалённых: ${sample.join(" ")}`);
}

const TIER_MULT = [1, 1.62, 2.55, 4.05, 6.20];
// load — index.html:2583-2588 TROOP_TYPES (там же атк/защ/хп/скорость/магия,
// но load не переносился в этот файл раньше — combat-математике он не
// нужен, добавлен здесь ради carryCap в PvP-грабеже, см. applyMarchArrive.
// name — при переносе из index.html:2578 поле потерялось, а
// newlyBrokenTypes() ниже его читает: строка хроники про слом дисциплины
// выходила у ВСЕХ боёв как "Обороняющиеся:  дрогнули" — с пустым перечнем
// родов войск вместо "Пехота, Лучники". Восстановлено по эталону.
const TROOP_TYPES = {
  // Магической атаки и защиты у войск больше нет — ни поля, ни множителя, ни
  // в бою, ни в мощи (под магию заводится отдельный род войск из портала, а не
  // вторая пара характеристик у каждого солдата). Пересчёт см. BATTLE_PACE и
  // делитель armyPower ниже.
  // Осадные: атака 12 вместо 24 — урон по армиям намеренно вдвое ниже, их дело
  // — снос построек (SIEGE_BDMG_BASE), в полевом бою тот стат не участвует.
  inf: { name: "Пехота", atk: 34, def: 46, hp: 44, load: 6, speed: 1.00, beats: "arc", losesTo: "cav" },
  arc: { name: "Лучники", atk: 50, def: 30, hp: 36, load: 8, speed: 1.10, beats: "cav", losesTo: "inf" },
  cav: { name: "Конница", atk: 46, def: 34, hp: 40, load: 5, speed: 1.70, beats: "inf", losesTo: "arc" },
  sie: { name: "Осадные", atk: 12, def: 20, hp: 60, load: 30, speed: 0.60, beats: null, losesTo: null },
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
      field:"atkInf",total:0.10},
    {id:"mil_atk_inf2",name:"Пехота, атака II",  max:10,wave:2,branch:"mil",requires:["mil_atk_inf1"],
      field:"atkInf",total:0.20},
    {id:"mil_atk_arc1",name:"Лучники, атака I",  max:5, wave:1,branch:"mil",
      field:"atkArc",total:0.10},
    {id:"mil_atk_arc2",name:"Лучники, атака II", max:10,wave:2,branch:"mil",requires:["mil_atk_arc1"],
      field:"atkArc",total:0.20},
    {id:"mil_atk_cav1",name:"Кавалерия, атака I",max:5, wave:1,branch:"mil",
      field:"atkCav",total:0.10},
    {id:"mil_atk_cav2",name:"Кавалерия, атака II",max:10,wave:2,branch:"mil",requires:["mil_atk_cav1"],
      field:"atkCav",total:0.20},
    {id:"mil_atk_sie1",name:"Осада, атака I",    max:5, wave:1,branch:"mil",
      field:"atkSie",total:0.10},
    {id:"mil_atk_sie2",name:"Осада, атака II",   max:10,wave:2,branch:"mil",requires:["mil_atk_sie1"],
      field:"atkSie",total:0.20},
    {id:"mil_def_inf1",name:"Пехота, защита I",   max:5, wave:1,branch:"mil",
      field:"defInf",total:0.10},
    {id:"mil_def_inf2",name:"Пехота, защита II",  max:10,wave:2,branch:"mil",requires:["mil_def_inf1"],
      field:"defInf",total:0.20},
    {id:"mil_def_arc1",name:"Лучники, защита I",  max:5, wave:1,branch:"mil",
      field:"defArc",total:0.10},
    {id:"mil_def_arc2",name:"Лучники, защита II", max:10,wave:2,branch:"mil",requires:["mil_def_arc1"],
      field:"defArc",total:0.20},
    {id:"mil_def_cav1",name:"Кавалерия, защита I",max:5, wave:1,branch:"mil",
      field:"defCav",total:0.10},
    {id:"mil_def_cav2",name:"Кавалерия, защита II",max:10,wave:2,branch:"mil",requires:["mil_def_cav1"],
      field:"defCav",total:0.20},
    {id:"mil_def_sie1",name:"Осада, защита I",    max:5, wave:1,branch:"mil",
      field:"defSie",total:0.10},
    {id:"mil_def_sie2",name:"Осада, защита II",   max:10,wave:2,branch:"mil",requires:["mil_def_sie1"],
      field:"defSie",total:0.20},
    {id:"mil_atk_all1",name:"Атака войск I",  max:10,wave:2,branch:"mil",
      requires:["mil_atk_inf1","mil_atk_arc1","mil_atk_cav1","mil_atk_sie1"],
      field:"atk",total:0.15},
    {id:"mil_atk_all2",name:"Атака войск II", max:10,wave:3,branch:"mil",requires:["mil_atk_all1"],
      field:"atk",total:0.25},
    {id:"mil_def_all1",name:"Защита войск I", max:10,wave:2,branch:"mil",
      requires:["mil_def_inf1","mil_def_arc1","mil_def_cav1","mil_def_sie1"],
      field:"def",total:0.15},
    {id:"mil_def_all2",name:"Защита войск II",max:10,wave:3,branch:"mil",requires:["mil_def_all1"],
      field:"def",total:0.25},
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
// 3987 f.broken) — если тир сломлен, его вклад в atk/def (НЕ в
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
    let atk = 0, def = 0, hp = 0, n = 0;
    const atkMod = 1 + (B[SIDE_TYPE_ATK[t]] || 0), defMod = 1 + (B[SIDE_TYPE_DEF[t]] || 0);
    for (let i = 1; i <= 5; i++) {
      const c = (units[t] && units[t][i]) || 0;
      const w = TIER_MULT[i - 1];
      if (c) {
        const brk = broken && broken[t] && broken[t][i] ? 0.70 : 1;
        let a = TROOP_TYPES[t].atk * w * troopMod(race, t, "atk") * atkMod;
        if (t === "arc") a *= 1 + (B.archer || 0);
        const d = TROOP_TYPES[t].def * w * troopMod(race, t, "def") * defMod;
        atk += c * a * brk * (1 + B.atk); def += c * d * brk * (1 + B.def);
        hp += c * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp") * (1 + B.hp);
        n += c;
      }
      const rc = (risen && risen[t] && risen[t][i]) || 0;
      if (rc) {
        let ra = TROOP_TYPES[t].atk * w * troopMod(race, t, "atk") * atkMod * 0.5;
        if (t === "arc") ra *= 1 + (B.archer || 0);
        atk += rc * ra * (1 + B.atk);
        def += rc * TROOP_TYPES[t].def * w * troopMod(race, t, "def") * defMod * 0.5 * (1 + B.def);
        hp += rc * TROOP_TYPES[t].hp * w * troopMod(race, t, "hp") * 0.5 * (1 + B.hp);
        n += rc;
      }
    }
    s[t] = { atk, def, hp, n };
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
      const hp = TROOP_TYPES[t].hp * TIER_MULT[i - 1] * troopMod(race, t, "hp");
      v += n * (a * (1 + (B ? B.atk : 0)) + d * (1 + (B ? B.def : 0)) + hp * (1 + (B ? B.hp : 0)));
    }
  });
  // Делитель — сумма характеристик T1 пехоты без бонусов, чтобы один такой
  // солдат стоил ~1 силы. Был 150 (34+46+44 плюс магия 8+18), без магии ровно
  // 124 — то же правило по новым характеристикам, а не подпорка под старое.
  return Math.round(v / 124);
}
// index.html:1716 CFG.BATTLE_PACE — общий множитель, замедляющий урон ОДНОГО
// раунда, чтобы бой из Фазы 9, кусочек 1 реально растягивался на несколько
// раундов, а не решался в первом же (без него — как оказалось после
// кусочка 1 — было именно так, см. заголовок resolvePvp ниже).
// Был 0.45, пока половину урона в схватке давала магическая атака (она почти
// не смягчалась — магическая защита у всех была втрое ниже обычной). С её
// уходом тот же бой растянулся бы примерно вдвое, поэтому темп поднят ровно на
// измеренную долю: 0.45 * 1.51. Множитель ОДИН на всю боёвку (залп лучников и
// башня гарнизона считаются от него же), так что их доля в бою не сдвинулась.
const BATTLE_PACE = 0.68;
// index.html:4100-4108 BATTLE_WEATHER — дословно: общая для ОБЕИХ сторон
// погода за бой (не "везение одной стороны"), бьёт по РОДУ войск
// атакующего в конкретном ударе (см. wMod(at) в dmgTo ниже), веса w —
// вероятность выпадения (ясно намеренно вдвое вероятнее всего остального).
// desc — index.html:4395-4401, дословно (раньше сюда не переносилось: сама
// погода в MP только считает модификаторы урона, описание для письма никто
// не читал — почта была без хроники вовсе, см. заголовок pushLog выше).
const BATTLE_WEATHER = [
  { id: "clear", w: 50, name: "Ясно", desc: "Погода не мешает ни одной стороне.", mod: {} },
  { id: "rain", w: 11, name: "Проливной дождь", desc: "Тетивы намокли — лучники бьют слабее.", mod: { arc: 0.82 } },
  { id: "mud", w: 11, name: "Распутица", desc: "Конница вязнет в грязи и теряет разгон.", mod: { cav: 0.82 } },
  { id: "fog", w: 9, name: "Густой туман", desc: "Дальний бой почти вслепую: лучники и осадные бьют неточно.", mod: { arc: 0.85, sie: 0.80 } },
  { id: "wind", w: 8, name: "Порывистый ветер", desc: "Ветер сносит стрелы и мешает наводить орудия.", mod: { arc: 0.88, sie: 0.88 } },
  { id: "heat", w: 7, name: "Палящий зной", desc: "Люди и кони изнурены — все бьют вполсилы.", mod: { inf: 0.92, arc: 0.92, cav: 0.92, sie: 0.92 } },
  { id: "storm", w: 4, name: "Гроза", desc: "В такой свалке исход куда меньше зависит от расчёта.", mod: { arc: 0.85 }, jitter: 0.14 },
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
    let d = 0;
    TKEYS.forEach((at) => {
      if (attS[at].n <= 0) return;
      const share = defS[dt].hp / Math.max(1, defS.totalHp);
      const w = wMod ? wMod(at) : 1;
      d += attS[at].atk * counterMult(at, dt) * share * w;
    });
    const mitig = 1 + (defS[dt].def / Math.max(1, defS[dt].n)) / 70 * defWall;
    out[dt] = d / mitig * BATTLE_PACE * shake;
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
// ---- Хроника боя (почта общего мира на пергаменте догоняет одиночную
// battleLogHtml/BATTLE_LOG_ICON, index.html) — раньше её не было вовсе,
// checkDiscipline() сама явно предупреждала в комментарии: "тут нет
// боевого лога". state.log — плоский массив {r,kind,text,side}, копится в
// state (JSON, лежит в marches.data.battle между тиками) теми же
// категориями, что клиент уже красит значком/цветом (BATTLE_LOG_ICON:
// weather/volley/tower/panic/counter/raise/general/mark/round/rout/end) —
// просто заполняется на сервере, а не в клиентском resolveBattle().
// side — "att"/"def" (не "A"/"D", как в одиночке — тут ровно две
// однозначные роли на любой бой этого типа); клиент переводит их в
// "наше"/"чужое" по роли читающего, см. mpMailBattleEntry в index.html.
function pushLog(state, kind, text, side) {
  if (!state.log) state.log = [];
  state.log.push({ r: state.round || 0, kind, text, side: side || null });
}
// checkDiscipline() мутирует broken на месте и не говорит, что именно
// сломалось — сравниваем снимок ДО/ПОСЛЕ вызова и возвращаем РОДА войск
// (TROOP_TYPES[t].name — общее имя рода, не полное имя юнита по расе/тиру,
// как в одиночке: там целая таблица UNIT_NAMES по 4 расам — переносить её
// сюда целиком ради одной строки письма было бы непропорционально), НОВО
// сломавшиеся именно за этот вызов, не раньше.
function snapshotBroken(broken) {
  const out = {};
  TKEYS.forEach((t) => { out[t] = {}; for (let i = 1; i <= 5; i++) out[t][i] = !!broken[t][i]; });
  return out;
}
function newlyBrokenTypes(before, broken) {
  const out = [];
  TKEYS.forEach((t) => {
    let hit = false;
    for (let i = 1; i <= 5; i++) if (broken[t][i] && !(before[t] && before[t][i])) hit = true;
    if (hit) out.push(TROOP_TYPES[t].name);
  });
  return out;
}
// index.html:4316-4328 battleBuffSnapshot — дословно, только принимает
// готовый B (bonuses(p)/bonuses(p,true)) напрямую, не через f.B (тут нет
// "force"-объектов одиночки) — итоговые проценты бонусов по роду войск на
// секунду боя, для таблицы "Статистика войск" в письме (index.html
// battleStatsRows). Раньше в MP этого не было вовсе — письмо несло только
// голые числа потерь, без разбора "почему".
function battleBuffSnapshotMp(B) {
  B = B || {};
  const TYPE_ATK = { inf: "atkInf", arc: "atkArc", cav: "atkCav", sie: "atkSie" };
  const TYPE_DEF = { inf: "defInf", arc: "defArc", cav: "defCav", sie: "defSie" };
  const out = { hp: B.hp || 0 };
  TKEYS.forEach((t) => {
    let atk = (1 + (B.atk || 0)) * (1 + (B[TYPE_ATK[t]] || 0)) - 1;
    if (t === "arc") atk = (1 + atk) * (1 + (B.archer || 0)) - 1;
    const def = (1 + (B.def || 0)) * (1 + (B[TYPE_DEF[t]] || 0)) - 1;
    out[t] = { atk, def };
  });
  return out;
}
function pvpTotalTroops(attUnits, defUnits) { return unitsTotal(attUnits) + unitsTotal(defUnits); }


// =============================================================================
// Мощь державы (power) — Фаза 31.
// =============================================================================
// --- НАЧАЛО СГЕНЕРИРОВАННОГО БЛОКА (tools/gen_power_tables.mjs) ---
// Таблицы мощи, вынутые из index.html. НЕ ПРАВИТЬ РУКАМИ: правьте исходные
// таблицы в index.html и перегенерируйте (node tools/gen_power_tables.mjs).
// Сверить, не разошлись ли копии: node tools/gen_power_tables.mjs --check
const POWER_BUILD = {
  hall: [7,21,59,154,383,852,1847,3706,6504,10933,16723,24693,35213,48838,66400,91451,125005,170590,232957,318769,442735,630860,907085,1322485,2195458],
  farm: [5,11,18,28,38,68,150,309,549,874,1366,2032,3049,4419,6176,8576,11896,16246,21966,29846,40211,54646,74946,103446,143196],
  lumber: [5,11,18,28,38,68,150,309,549,874,1366,2032,3049,4419,6176,8576,11896,16246,21966,29846,40211,54646,74946,103446,143196],
  quarry: [5,10,16,32,88,198,387,627,934,1351,1979,2926,4152,5708,7690,10260,14000,19220,26260,35860,49300,67780,94060,132500,192100],
  mine: [6,19,46,100,219,401,699,1335,1758,2668,3984,5958,8678,12454,17707,25126,36126,52139,75230,108850,158176,230233,336750,495206,735046],
  academy: [5,11,27,61,145,336,688,1346,2591,4975,7970,11679,16387,22391,30127,40207,53497,71227,95369,128424,174240,239921,336515,481806,783449],
  store: [5,10,17,41,92,201,402,778,1489,2848,4552,6703,9436,12942,17488,23447,31354,42032,56560,76832,104966,145492,205219,295585,478367],
  barracks: [5,10,20,37,94,244,525,1059,2083,4063,6520,9576,13407,18241,24400,32325,42636,56328,74659,99431,133357,181631,252430,359629,592326],
  range: [5,10,20,37,94,244,525,1059,2083,4063,6520,9576,13407,18241,24400,32325,42636,56328,74659,99431,133357,181631,252430,359629,592326],
  stable: [5,10,20,37,94,244,525,1059,2083,4063,6520,9576,13407,18241,24400,32325,42636,56328,74659,99431,133357,181631,252430,359629,592326],
  siege: [5,10,26,63,126,293,600,1173,2258,4332,6931,10202,14355,19679,26573,35603,47574,63716,85697,115969,158145,218794,308118,442817,716764],
  hospital: [5,13,32,65,162,366,723,1262,2077,3310,4967,7220,10319,14632,20699,29316,41665,59576,85644,123830,179944,263152,387338,574480,881480],
  wall: [5,15,37,94,226,519,1037,1965,3656,6784,10816,16060,22965,32169,44583,61540,84977,117860,164369,230776,326321,466309,674163,986224,1545374],
  garrison: [5,11,21,44,100,221,446,868,1671,3213,5133,7538,10570,14421,19367,25787,34217,45545,60804,81650,110460,151716,212389,303649,495562],
  scout: [5,10,16,32,81,191,398,769,1274,1971,2916,4286,5956,7969,10350,13191,17149,22223,28423,36109,46007,58118,74187,96279,139023],
  forge: [5],
  market: [5,10,27,84,193,379,634,1102,1973,3615,5687,8317,11684,16040,21741,29294,39422,53250,72284,98780,136090,190096,269894,390404,626317],
  alliance: [5,10,21,53,116,265,535,1032,1962,3722,5945,8761,12366,17036,23146,31245,42109,56900,77229,105544,145342,202900,287897,415855,667083],
  portal: [5,13,32,78,186,428,863,1656,3124,5880,9393,13870,19676,27280,37355,50874,69237,94544,129869,179600,250281,353115,505339,734015,1164412],
};
const POWER_RSCH = {
  eco_stone0: [5],
  eco_gold0: [384],
  eco_food1: [44,142,347,797,1697],
  eco_wood1: [44,142,347,797,1697],
  eco_build1: [269,672,1272,2141,3918],
  eco_stone1: [406,1147,2485,5161,10513],
  eco_gold1: [406,1147,2485,5161,10513],
  eco_rsch1: [725,2176,5078,10882,22490],
  eco_gfood1: [161,483,1127,2415,4991],
  eco_gwood1: [161,483,1127,2415,4991],
  eco_gstone1: [581,1672,3710,7786,15938],
  eco_ggold1: [581,1672,3710,7786,15938],
  eco_load1: [669,2007,4683,10035,20739],
  eco_cap1: [494,1482,3458,7410,15314],
  eco_amber0: [9182],
  eco_wood2: [2027,4953,9185,15313,24190,37069,55775,82970,122555,180236],
  eco_food2: [2027,4953,9185,15313,24190,37069,55775,82970,122555,180236],
  eco_gwood2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_gfood2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_build2: [3915,9620,17937,30078,47822,73778,111786,167500,249252,369332],
  eco_rsch2: [3915,9620,17937,30078,47822,73778,111786,167500,249252,369332],
  eco_gold2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_stone2: [3190,7831,14592,24454,38855,59910,90721,135855,202041,299196],
  eco_ggold2: [4065,10020,18753,31574,50416,78129,118926,179040,267695,398558],
  eco_gstone2: [4065,10020,18753,31574,50416,78129,118926,179040,267695,398558],
  eco_gall2: [4540,11210,21019,35453,56711,88049,134286,202560,303458,452681],
  eco_load2: [5420,13550,25745,44039,71484,112656,174414,267053,406011,614450],
  eco_amber1: [5420,13550,25745,44039,71484,112656,174414,267053,406011,614450],
  eco_crown_dwarf: [5255,13138,24961,42698,69308],
  eco_crown_human: [5255,13138,24961,42698,69308],
  eco_crown_elf: [5255,13138,24961,42698,69308],
  eco_crown_undead: [5255,13138,24961,42698,69308],
  mil_trainspd: [56],
  mil_atk_inf1: [184,252,457,748,1298],
  mil_atk_arc1: [184,252,457,748,1298],
  mil_atk_cav1: [184,252,457,748,1298],
  mil_atk_sie1: [184,252,457,748,1298],
  mil_tier_inf2: [2690],
  mil_tier_arc2: [2690],
  mil_tier_cav2: [2690],
  mil_tier_sie2: [3050],
  mil_scout1: [381,971,1910,3450,6056],
  mil_march1: [381,971,1910,3450,6056],
  mil_def_inf1: [1214,3123,6216,11386,20305],
  mil_def_arc1: [1214,3123,6216,11386,20305],
  mil_def_cav1: [1214,3123,6216,11386,20305],
  mil_def_sie1: [1214,3123,6216,11386,20305],
  mil_tier_inf3: [27243],
  mil_tier_arc3: [27243],
  mil_tier_cav3: [27243],
  mil_tier_sie3: [32427],
  mil_scout2: [4220,11630,26435,58362,135413],
  mil_atk_all1: [5671,14827,30421,56408,100570,177222,312936,557994,1008570,1850342],
  mil_def_all1: [5671,14827,30421,56408,100570,177222,312936,557994,1008570,1850342],
  mil_hp_all1: [5671,14827,30421,56408,100570,177222,312936,557994,1008570,1850342],
  mil_march2: [8877,22198,43136,74543,121648],
  mil_tier_inf4: [159930],
  mil_tier_arc4: [159930],
  mil_tier_cav4: [159930],
  mil_tier_sie4: [211770],
  mil_atk_inf2: [4191,10823,21462,38805,67589,116294,202693,354410,626223,1122415],
  mil_atk_arc2: [4191,10823,21462,38805,67589,116294,202693,354410,626223,1122415],
  mil_atk_cav2: [4191,10823,21462,38805,67589,116294,202693,354410,626223,1122415],
  mil_atk_sie2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_inf2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_arc2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_cav2: [4536,11859,23881,43989,78302,138066,246584,442538,802824,1475963],
  mil_def_sie2: [5055,13415,27510,51765,94373,170726,312421,574730,1067727,2006287],
  mil_atk_all2: [5930,15604,31674,58891,105938,188950,341205,619354,1136111,2110314],
  mil_def_all2: [5930,15604,31674,58891,105938,188950,341205,619354,1136111,2110314],
  mil_hp_all2: [5930,15604,31674,58891,105938,188950,341205,619354,1136111,2110314],
  mil_tier_inf5: [485748],
  mil_tier_arc5: [485748],
  mil_tier_cav5: [485748],
  mil_tier_sie5: [672382],
  mil_crown_dwarf: [4832,12633,25920,48063,85691],
  mil_crown_human: [4832,12633,25920,48063,85691],
  mil_crown_elf: [4832,12633,25920,48063,85691],
  mil_crown_undead: [4832,12633,25920,48063,85691],
};
// id технологии -> [волна, ветка] (0=eco, 1=mil) для формулы-запаса у узлов
// без своей строки в таблице (см. researchPower в index.html).
const POWER_RSCH_META = {
  eco_stone0: [1,0],
  eco_gold0: [1,0],
  eco_food1: [1,0],
  eco_wood1: [1,0],
  eco_build1: [1,0],
  eco_stone1: [1,0],
  eco_gold1: [1,0],
  eco_rsch1: [1,0],
  eco_gfood1: [1,0],
  eco_gwood1: [1,0],
  eco_gstone1: [1,0],
  eco_ggold1: [1,0],
  eco_load1: [1,0],
  eco_cap1: [1,0],
  eco_amber0: [1,0],
  eco_crown_dwarf: [4,0],
  eco_crown_human: [4,0],
  eco_crown_elf: [4,0],
  eco_crown_undead: [4,0],
  eco_wood2: [2,0],
  eco_food2: [2,0],
  eco_gwood2: [2,0],
  eco_build2: [2,0],
  eco_gfood2: [2,0],
  eco_rsch2: [2,0],
  eco_gold2: [2,0],
  eco_stone2: [2,0],
  eco_ggold2: [2,0],
  eco_gall2: [2,0],
  eco_gstone2: [2,0],
  eco_load2: [2,0],
  eco_amber1: [2,0],
  mil_atk_inf1: [1,1],
  mil_atk_inf2: [2,1],
  mil_atk_arc1: [1,1],
  mil_atk_arc2: [2,1],
  mil_atk_cav1: [1,1],
  mil_atk_cav2: [2,1],
  mil_atk_sie1: [1,1],
  mil_atk_sie2: [2,1],
  mil_def_inf1: [1,1],
  mil_def_inf2: [2,1],
  mil_def_arc1: [1,1],
  mil_def_arc2: [2,1],
  mil_def_cav1: [1,1],
  mil_def_cav2: [2,1],
  mil_def_sie1: [1,1],
  mil_def_sie2: [2,1],
  mil_atk_all1: [2,1],
  mil_atk_all2: [3,1],
  mil_def_all1: [2,1],
  mil_def_all2: [3,1],
  mil_hp_all1: [2,1],
  mil_hp_all2: [3,1],
  mil_trainspd: [1,1],
  mil_march1: [1,1],
  mil_march2: [2,1],
  mil_scout1: [1,1],
  mil_scout2: [2,1],
  mil_crown_dwarf: [4,1],
  mil_crown_human: [4,1],
  mil_crown_elf: [4,1],
  mil_crown_undead: [4,1],
  mil_tier_inf2: [1,1],
  mil_tier_inf3: [2,1],
  mil_tier_inf4: [3,1],
  mil_tier_inf5: [4,1],
  mil_tier_arc2: [1,1],
  mil_tier_arc3: [2,1],
  mil_tier_arc4: [3,1],
  mil_tier_arc5: [4,1],
  mil_tier_cav2: [1,1],
  mil_tier_cav3: [2,1],
  mil_tier_cav4: [3,1],
  mil_tier_cav5: [4,1],
  mil_tier_sie2: [1,1],
  mil_tier_sie3: [2,1],
  mil_tier_sie4: [3,1],
  mil_tier_sie5: [4,1],
};
const POWER_RSCH_WAVE = {1:0.018,2:5,3:20,4:60};
const POWER_RSCH_BASE = [28500,26200];
const POWER_UNIT = [1,2,3,4,10];
const POWER_GEAR = [1250,2750,6250,15000,37500];
// --- КОНЕЦ СГЕНЕРИРОВАННОГО БЛОКА ---
// Мощь державы — Фаза 31. Дословный порт mpPower()/power() из index.html:
// постройки + войска (дома И в походах) + исследования + полководец +
// надетое снаряжение. Таблицы чисел — в сгенерированном блоке выше.
//
// До этой фазы мощь считалась ТОЛЬКО в браузере, а колонка players.power так
// и стояла нулём с самой первой миграции. Автор: "будут рейтинги в том числе
// и по мощи" — значит число должно быть у сервера, а не у клиента, который
// его к тому же может назвать любым.
//
// marchUnits — состав отрядов, которые прямо сейчас В ПОЛЕ. Их войска
// вычтены из p.troops ещё на отправке (см. mp-attack/mp-gather), и без этого
// слагаемого мощь проваливалась бы на время каждого похода, а рейтинг
// дёргался бы туда-сюда просто от того, воюет игрок или сидит дома.
const POWER_TKEYS = ["inf", "arc", "cav", "sie"];
const powerTblRow = (arr, lv) => arr[Math.max(0, Math.min(arr.length - 1, Math.round(lv) - 1))];
function buildingPowerOf(bk, lv) {
  lv = +lv || 0;
  if (lv <= 0) return 0;
  const arr = POWER_BUILD[bk];
  if (!arr || !arr.length) return 0;
  return powerTblRow(arr, lv);
}
function researchPowerOf(id, lv) {
  const arr = POWER_RSCH[id];
  const row = arr && arr[lv - 1];
  if (row != null) return row;
  // Формула-запас для узлов без своей строки в таблице — index.html
  // researchPower(): lv * волна * база ветки.
  const meta = POWER_RSCH_META[id];
  if (!meta) return 0;
  return lv * (POWER_RSCH_WAVE[meta[0]] || 0) * (POWER_RSCH_BASE[meta[1]] || 0);
}
function powerOf(p, marchUnits) {
  let v = 0;
  for (const bk of Object.keys(POWER_BUILD)) {
    const lv = p.b && p.b[bk];
    if (Array.isArray(lv)) lv.forEach((l) => { v += buildingPowerOf(bk, l || 0); });
    else v += buildingPowerOf(bk, lv || 0);
  }
  const addUnits = (u) => {
    if (!u) return;
    for (const t of POWER_TKEYS) for (let i = 1; i <= 5; i++) v += ((u[t] && u[t][i]) || 0) * POWER_UNIT[i - 1];
  };
  addUnits(p.troops);
  (marchUnits || []).forEach(addUnits);
  const tech = p.tech || {};
  for (const id of Object.keys(tech)) {
    const lv = tech[id] || 0;
    if (lv) v += researchPowerOf(id, lv);
  }
  // index.html genPowerOf: 2000 + 318.5*ур^1.5, плюс 1000 за каждое
  // вложенное очко таланта.
  const g = p.gen || {};
  let talSpent = 0;
  for (const k in (g.tal || {})) talSpent += g.tal[k] || 0;
  v += 2000 + Math.pow(g.lv || 1, 1.5) * 318.5 + talSpent * 1000;
  // index.html gearPowerOf: по мощи редкости за каждый надетый предмет.
  for (const it of Object.values(p.gear || {})) {
    if (it && it.rarity) v += POWER_GEAR[it.rarity - 1] || 0;
  }
  return Math.round(v);
}
// Пишется в две точки сразу: колонка players.power (по ней пойдут рейтинги —
// индексировать и сортировать JSONB ради этого незачем) и state.peakPower
// (высшая мощь за всё правление, для итога на экране гибели: текущая на
// момент смерти всегда занижена, у павшего к тому времени нет ни войск, ни
// половины города).
function applyPower(p, row, marchUnits) {
  const v = powerOf(p, marchUnits);
  p.peakPower = Math.max(p.peakPower || 0, v);
  if (row) row.power = v;
  return v;
}

// =============================================================================
// Счётчики для таблиц мира — Фаза 44.
// =============================================================================
// Накопительные числа (сколько собрано за всё правление, сколько отправлено
// обозами, сколько лагерей варваров взято) считаются ТАМ, ГДЕ СОБЫТИЕ
// ПРОИСХОДИТ, и складываются в state.stats. В колонки, по которым идёт
// сортировка таблиц, их зеркалит mp-join на обычном опросе (см. там
// applyBoardStats) — здесь ходить в колонки незачем, они всё равно
// перепишутся через несколько секунд.
//
// Только вверх и никогда вниз: это «за всё время», а не «сейчас». Ограбили
// склад — собранного не убыло, оно было собрано.
function bumpStat(p, key, amount) {
  if (!(amount > 0)) return;
  if (!p.stats) p.stats = {};
  p.stats[key] = Math.round((p.stats[key] || 0) + amount);
}

// =============================================================================
// Боевой рейтинг и звания — Фаза 43.
// =============================================================================
// Дословная копия ../_shared/rating.js (тот же принцип самодостаточных копий,
// что и у всего остального в этом файле). Полное описание правил с доводами —
// docs/RANKS.md. При правке ЛЮБОГО числа править обе копии и зеркало в
// index.html.
const RANK_STEPS = 5;
const RANKS_UP = [
  { key: "recruit",  name: "Рекрут",     from: 0,    to: 769 },
  { key: "guard",    name: "Страж",      from: 770,  to: 1539 },
  { key: "knight",   name: "Рыцарь",     from: 1540, to: 2309 },
  { key: "hero",     name: "Герой",      from: 2310, to: 3079 },
  { key: "legend",   name: "Легенда",    from: 3080, to: 3849 },
  { key: "overlord", name: "Властелин",  from: 3850, to: 4619 },
  { key: "deity",    name: "Божество",   from: 4620, to: 5499 },
  { key: "titan",    name: "Титан",      from: 5500, to: null },
];
const RANKS_DOWN = [
  { key: "dishonoured", name: "Бесчестный",         from: 1,    to: 769 },
  { key: "branded",     name: "Заклеймённый",       from: 770,  to: 1539 },
  { key: "oathbreaker", name: "Клятвопреступник",   from: 1540, to: 2309 },
  { key: "darkadept",   name: "Адепт тьмы",         from: 2310, to: 3079 },
  { key: "cursed",      name: "Проклятый",          from: 3080, to: 3849 },
  { key: "destroyer",   name: "Разрушитель",        from: 3850, to: 4619 },
  { key: "chaoslord",   name: "Властитель Хаоса",   from: 4620, to: 5499 },
  { key: "worldender",  name: "Уничтожитель миров", from: 5500, to: null },
];
const RANK_ROMAN = ["I", "II", "III", "IV", "V"];
function rankOf(rating) {
  const r = Math.round(rating || 0), down = r < 0, mag = Math.abs(r);
  const table = down ? RANKS_DOWN : RANKS_UP;
  let band = table[0];
  for (const b of table) { if (mag >= b.from) band = b; }
  let step = 0, roman = "";
  if (band.to != null) {
    const per = (band.to - band.from + 1) / RANK_STEPS;
    const idx = Math.min(RANK_STEPS - 1, Math.floor((mag - band.from) / per));
    step = RANK_STEPS - idx;
    roman = RANK_ROMAN[step - 1];
  }
  return { key: band.key, name: band.name, down, step, roman,
           full: roman ? band.name + " " + roman : band.name };
}
function seasonKeyAt(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
  if (m === 12) return (y + 1) + "-winter";
  if (m <= 2) return y + "-winter";
  if (m <= 5) return y + "-spring";
  if (m <= 8) return y + "-summer";
  return y + "-autumn";
}
const CALIBRATION_BATTLES = 10;
const NO_FIGHT_K = 0.1, EQUAL_K = 0.5;
const WIN_EQUAL = 25, WIN_WEAK = 50, LOSS_STRONG = 50;
const RAID_PENALTY_FRAC = 0.02, RAID_PENALTY_MIN = 25;
const PAIR_CAP_BATTLES = 4, PAIR_CAP_WINDOW_MS = 60 * 60 * 1000;
const kRatio = (a, b) => {
  const x = Math.max(0, a || 0), y = Math.max(0, b || 0), hi = Math.max(x, y);
  return hi <= 0 ? 0 : Math.min(x, y) / hi;
};
function raidPenalty(rating) {
  const r = Math.round(rating || 0);
  return r > 0 ? Math.max(RAID_PENALTY_MIN, Math.round(r * RAID_PENALTY_FRAC)) : RAID_PENALTY_MIN;
}
function scoreBattle(o) {
  const kField = kRatio(o.attField, o.defField);
  const kPower = kRatio(o.attPower, o.defPower);
  const base = { kField, kPower, k: Math.min(kField, kPower), attDelta: 0, defDelta: 0, counted: false };
  if ((o.pairBattles || 0) >= PAIR_CAP_BATTLES) return { ...base, reason: "потолок пары" };
  const attWon = o.winner === "att";
  if (base.k >= EQUAL_K) {
    return { ...base, counted: true, reason: "равный бой",
             attDelta: attWon ? WIN_EQUAL : -WIN_EQUAL,
             defDelta: attWon ? -WIN_EQUAL : WIN_EQUAL };
  }
  // Державы сопоставимы, разошлось только поле — ход в войне равных
  // (эвакуация или проба малым отрядом), а не избиение. Ноль обоим.
  if (kPower >= EQUAL_K) return { ...base, reason: "поле не сошлось" };
  const attIsStrong = (o.attPower || 0) >= (o.defPower || 0);
  let attDelta = 0, defDelta = 0, reason;
  if (attWon && attIsStrong) {
    attDelta = -raidPenalty(o.attRating); reason = "избиение слабого";
  } else if (attWon && !attIsStrong) {
    // Смотрим на проигравшего, а не на k_поле вообще: мелкий k_поле бывает и
    // «защиты не было» (скармливание, гасим), и «пришёл втрое меньшим войском
    // и всё равно взял» (подвиг, награждаем).
    if ((o.defField || 0) < (o.attField || 0) * NO_FIGHT_K) return { ...base, reason: "бой без боя" };
    attDelta = WIN_WEAK; defDelta = -LOSS_STRONG; reason = "слабый взял сильного";
  } else if (!attWon && attIsStrong) {
    attDelta = -LOSS_STRONG; defDelta = WIN_WEAK; reason = "сильный не взял слабого";
  } else {
    reason = "оборона от слабого";
  }
  return { ...base, counted: true, reason, attDelta, defDelta, attIsStrong };
}
function applyRatingDelta(rating, battlesPlayed, delta) {
  let v = Math.round((rating || 0) + delta);
  if ((battlesPlayed || 0) < CALIBRATION_BATTLES && v < 0) v = 0;
  return v;
}

// Начисление рейтинга за один бой правитель против правителя. Зовётся из
// finalizePvpBattle (осада города) и finalizeNodeBattle (бой за точку сбора) —
// это единственные два места, где сходятся ДВА ЖИВЫХ ПРАВИТЕЛЯ. Лагеря и
// крепости варваров рейтинга не дают вовсе: рейтинг об NPC не фармится.
//
// Возвращает разбор для письма и для журнала. Сами колонки правит на row'ах —
// они пишутся тем же saveBothPlayersOrThrow, что и состояние (см. extra в
// savePlayerState), поэтому отдельного окна гонки тут нет.
async function computeBattleRating(admin, attRow, defRow, state, nowMs) {
  const attField = state.attStartPower || 0, defField = state.defStartPower || 0;
  // Мощь ДЕРЖАВ до боя. Именно до: разорённый защитник после осады выглядел бы
  // ещё слабее, и кит получал бы скидку за им же учинённый разгром.
  const attPower = attRow.__powerBefore || 0, defPower = defRow.__powerBefore || 0;
  // Потолок пары — считаем прямо по журналу, отдельной таблицы не нужно.
  // Пара НЕУПОРЯДОЧЕННАЯ: поменяться ролями и обнулить счётчик нельзя.
  const sinceIso = new Date(nowMs - PAIR_CAP_WINDOW_MS).toISOString();
  const { data: recent, error: recErr } = await admin.from("rating_events")
    .select("id").eq("counted", true).gte("at", sinceIso)
    .or(`and(att_id.eq.${attRow.id},def_id.eq.${defRow.id}),and(att_id.eq.${defRow.id},def_id.eq.${attRow.id})`);
  if (recErr) throw recErr;
  const r = scoreBattle({
    attField, defField, attPower, defPower,
    attRating: attRow.rating || 0, winner: state.winner,
    pairBattles: (recent || []).length,
  });
  const season = seasonKeyAt(new Date(nowMs));
  const out = {
    ...r, attField, defField, attPower, defPower, season,
    attBefore: attRow.rating || 0, defBefore: defRow.rating || 0,
    pairBattles: (recent || []).length,
  };
  if (!r.counted) return out;
  const touch = (row, delta) => {
    row.rating = applyRatingDelta(row.rating || 0, row.rating_battles || 0, delta);
    row.rating_battles = (row.rating_battles || 0) + 1;
    row.rating_peak = Math.max(row.rating_peak || 0, row.rating);
    if (!row.rating_season) row.rating_season = season;
    // Часы затухания сбрасывает ТОЛЬКО равный бой: иначе верхушка раз в две
    // недели пинала бы новичка и висела бы дальше.
    if (r.reason === "равный бой") row.rating_last_at = new Date(nowMs).toISOString();
    row.__ratingDirty = true;
  };
  touch(attRow, r.attDelta);
  touch(defRow, r.defDelta);
  out.attAfter = attRow.rating; out.defAfter = defRow.rating;
  out.attRank = rankOf(attRow.rating).full; out.defRank = rankOf(defRow.rating).full;
  out.attCalibrating = (attRow.rating_battles || 0) < CALIBRATION_BATTLES;
  out.defCalibrating = (defRow.rating_battles || 0) < CALIBRATION_BATTLES;
  return out;
}

// То из разбора, что можно показать игроку. Скрытый коэффициент по мощи держав
// и сами мощи сюда не попадают — иначе «скрытый» перестал бы им быть, и кит
// вычислял бы по письму, каким именно маршем пролезть под порог.
function ratingMailPart(r) {
  if (!r) return null;
  return {
    counted: !!r.counted, reason: r.reason || "",
    attDelta: Math.round(r.attDelta || 0), defDelta: Math.round(r.defDelta || 0),
    attAfter: r.attAfter != null ? Math.round(r.attAfter) : null,
    defAfter: r.defAfter != null ? Math.round(r.defAfter) : null,
    attRank: r.attRank || null, defRank: r.defRank || null,
    attCalibrating: !!r.attCalibrating, defCalibrating: !!r.defCalibrating,
  };
}

// Журнал. Пишется ПОСЛЕ успешной записи игроков: если та отвалится по
// конфликту, событие разберётся заново, и строка не должна задвоиться.
// Пишется и на НЕзасчитанный бой — именно такие и интересны, когда
// разбираешься, почему кому-то ничего не дали.
async function logRatingEvent(admin, m, attRow, defRow, state, r, kind) {
  const { error } = await admin.from("rating_events").insert({
    world_id: m.world_id, kind, march_id: m.id,
    att_id: attRow.id, def_id: defRow.id, winner: state.winner,
    att_nick: attRow.nick || "", def_nick: defRow.nick || "",
    att_field: Math.round(r.attField), def_field: Math.round(r.defField),
    att_power: Math.round(r.attPower), def_power: Math.round(r.defPower),
    k_field: r.kField, k_power: r.kPower, k: r.k,
    att_before: Math.round(r.attBefore), def_before: Math.round(r.defBefore),
    att_delta: Math.round(r.attDelta), def_delta: Math.round(r.defDelta),
    counted: !!r.counted, reason: r.reason || "", season: r.season || "",
  });
  // Журнал важен, но ронять из-за него уже проведённый бой нельзя: рейтинг
  // записан, войска разошлись, откатывать отсюда нечего.
  if (error) console.error("mp-tick: строка rating_events не записалась —", error.message);
}

// =============================================================================
// Прочность построек и снос осадой — Фаза 29.
// =============================================================================
// Дословная копия блока "Прочность построек, снос осадой и восстановление" из
// ../_shared/rules.js (тот же принцип самодостаточных копий, что и у всего
// остального в этом файле — Dashboard-редактор не тянет относительные
// импорты). При правке ЛЮБОГО числа править обе копии и зеркало в index.html.
const BUILD_MULTI = new Set(["hospital", "farm", "lumber", "quarry", "mine"]);
const BUILD_HP_BASE = 250, BUILD_HP_POW = 1.2;
const BUILD_HP_MULT = {
  hall: 3, wall: 2.5, garrison: 2, scout: 0.8,
  farm: 0.6, lumber: 0.6, quarry: 0.6, mine: 0.6,
};
const BUILD_HP_FLAT = { forge: 3000 };
const BUILD_REGEN_CALM_SEC = 1800, BUILD_REGEN_PER_HOUR = 0.20;
const BLD_TRAIN = { barracks: "inf", range: "arc", stable: "cav", siege: "sie" };
// Все ключи построек, какие бывают у игрока (BKEYS в index.html). Нужен
// именно полный список, а не только те, что умеет строить mp-build: снести
// можно любое стоящее здание, включая Портал/Рынок/Центр Альянса.
const ALL_BKEYS = ["hall", "wall", "farm", "lumber", "quarry", "mine", "store",
  "barracks", "range", "stable", "siege", "hospital", "academy", "garrison",
  "scout", "forge", "portal", "market", "alliance"];
// Имена для писем и хроники боя. Без расовых/эпохальных вариантов
// (BUILDING_TIER_NAMES в index.html — целая таблица на 4 расы): переносить её
// сюда ради строчки отчёта непропорционально, а общее имя понятно всем.
const BUILD_RU_NAME = {
  hall: "Ратуша", wall: "Стена", farm: "Ферма", lumber: "Лесопилка",
  quarry: "Каменоломня", mine: "Золотая шахта", store: "Склад",
  barracks: "Казармы", range: "Стрельбище", stable: "Конюшня",
  siege: "Мастерская", hospital: "Госпиталь", academy: "Академия",
  garrison: "Гарнизон", scout: "Разведка", forge: "Горн", portal: "Портал",
  market: "Рынок", alliance: "Центр Альянса",
};
// Род каждого названия — иначе строка хроники выходит "Гарнизон обрушена",
// "Склад обрушена", "Казармы обрушена". Одна буква на здание дешевле, чем
// выкручиваться безличными формулировками в каждом сообщении.
// m — мужской, f — женский, n — средний, p — множественное (Казармы).
const BUILD_RU_GENDER = {
  hall: "f", wall: "f", farm: "f", lumber: "f", quarry: "f", mine: "f",
  store: "m", barracks: "p", range: "n", stable: "f", siege: "f",
  hospital: "m", academy: "f", garrison: "m", scout: "f", forge: "m",
  portal: "m", market: "m", alliance: "m",
};
function buildRuName(bk, plot) {
  return (BUILD_RU_NAME[bk] || bk) + (plot != null ? " (участок " + (plot + 1) + ")" : "");
}
// Согласованное окончание причастия: ruinWord("обрушен", bk) → "обрушена"
// для Академии, "обрушен" для Склада, "обрушены" для Казарм.
function ruinWord(stem, bk) {
  const g = BUILD_RU_GENDER[bk] || "f";
  return stem + (g === "m" ? "" : g === "f" ? "а" : g === "n" ? "о" : "ы");
}
function buildingMaxHp(bk, lv) {
  if (lv <= 0) return 0;
  if (BUILD_HP_FLAT[bk] != null) return BUILD_HP_FLAT[bk];
  return Math.round(BUILD_HP_BASE * Math.pow(lv, BUILD_HP_POW) * (BUILD_HP_MULT[bk] || 1));
}
function buildLvAt(p, bk, plot) {
  const raw = p.b && p.b[bk];
  return (Array.isArray(raw) ? raw[plot || 0] : raw) || 0;
}
function buildHpAt(p, bk, plot) {
  const max = buildingMaxHp(bk, buildLvAt(p, bk, plot));
  if (max <= 0) return 0;
  const raw = p.bhp && p.bhp[bk];
  const cur = Array.isArray(raw) ? raw[plot || 0] : (typeof raw === "number" ? raw : undefined);
  if (cur == null || !(cur >= 0)) return max;
  return Math.min(max, cur);
}
function setBuildHp(p, bk, plot, hp) {
  const max = buildingMaxHp(bk, buildLvAt(p, bk, plot));
  if (!p.bhp) p.bhp = {};
  const v = Math.max(0, Math.min(max, Math.round(hp)));
  if (BUILD_MULTI.has(bk)) {
    if (!Array.isArray(p.bhp[bk])) p.bhp[bk] = [0, 1, 2, 3].map((i) => buildingMaxHp(bk, buildLvAt(p, bk, i)));
    p.bhp[bk][plot || 0] = v;
    if (p.bhp[bk].every((h, i) => h >= buildingMaxHp(bk, buildLvAt(p, bk, i)))) delete p.bhp[bk];
  } else {
    if (v >= max) delete p.bhp[bk]; else p.bhp[bk] = v;
  }
}
function syncBuildingHp(p, nowSec) {
  if (!p.bhp || !Object.keys(p.bhp).length) { p.bhpAt = nowSec; return; }
  const from = Math.max(p.bhpAt || 0, (p.lastHitAt || 0) + BUILD_REGEN_CALM_SEC);
  const dt = nowSec - from;
  p.bhpAt = nowSec;
  if (dt <= 0) return;
  for (const bk of Object.keys(p.bhp)) {
    const plots = BUILD_MULTI.has(bk) ? [0, 1, 2, 3] : [null];
    for (const plot of plots) {
      const max = buildingMaxHp(bk, buildLvAt(p, bk, plot));
      if (max <= 0) continue;
      const cur = buildHpAt(p, bk, plot);
      if (cur >= max) continue;
      setBuildHp(p, bk, plot, cur + max * BUILD_REGEN_PER_HOUR * (dt / 3600));
    }
  }
}
const SIEGE_BDMG_BASE = 0.75;
const DEMOLISH_ROUNDS = 8;
// Раундов сноса за один тик — в отличие от самого боя, не зависит от размера
// армии: ломать город всегда одинаково долго, ~минуту (8 раундов по 2 за тик
// в 15с). Иначе мелкая осада разносила бы постройки мгновенно, одним вызовом,
// и вся "живая" подача пропала бы именно там, где она нужнее всего.
const DEMOLISH_ROUNDS_PER_TICK = 2;
const DEMOLISH_FIRST = ["wall", "garrison"];
function siegeBreachPerRound(units, race, B) {
  let dmg = 0;
  for (let i = 1; i <= 5; i++) {
    const n = (units.sie && units.sie[i]) || 0;
    if (n > 0) dmg += n * SIEGE_BDMG_BASE * TIER_MULT[i - 1];
  }
  const bonus = 1 + ((B && B.atkSie) || 0);
  return dmg * bonus * troopMod(race, "sie", "atk");
}
function demolishOrder(p) {
  const out = [];
  const push = (bk, plot) => { if (buildLvAt(p, bk, plot) > 0) out.push({ bk, plot }); };
  DEMOLISH_FIRST.forEach((bk) => push(bk, null));
  const middle = [];
  ALL_BKEYS.forEach((bk) => {
    if (bk === "hall" || DEMOLISH_FIRST.includes(bk)) return;
    const plots = BUILD_MULTI.has(bk) ? [0, 1, 2, 3] : [null];
    plots.forEach((plot) => {
      const lv = buildLvAt(p, bk, plot);
      if (lv > 0) middle.push({ bk, plot, lv });
    });
  });
  middle.sort((a, b) => b.lv - a.lv || (a.bk < b.bk ? -1 : a.bk > b.bk ? 1 : (a.plot || 0) - (b.plot || 0)));
  middle.forEach((e) => out.push({ bk: e.bk, plot: e.plot }));
  push("hall", null);
  return out;
}

// -----------------------------------------------------------------------------
// Фаза сноса. Начинается ПОСЛЕ того, как защитник разбит (см. конец
// runPvpBattleRounds): армия победила — теперь осадные орудия принимаются за
// сам город. Идёт теми же events(type:'battle_round') и тем же темпом, что и
// бой, поэтому клиенту не нужно ничего нового, чтобы показать её вживую.
//
// Снимок целей делается ОДИН раз, на завязке фазы, и живёт в state боя, а не
// в состоянии защитника: игроки пишутся в базу только в finalizePvpBattle
// (см. saveBothPlayersOrThrow) — ровно как потери войск, которые тоже
// начисляются одним разом в конце, а не по раунду. Заодно это снимает гонку:
// защитник может в это время строиться и тратить ресурсы, его строку никто
// не трогает до последнего момента.
function siegeUnitsAlive(units) {
  let n = 0;
  for (let i = 1; i <= 5; i++) n += (units.sie && units.sie[i]) || 0;
  return n;
}
function beginDemolish(state, attP, defP, nowSec) {
  if (state.winner !== "att") return false;
  if (siegeUnitsAlive(state.attU) <= 0) return false;
  // Регенерацию досчитываем ДО снимка — иначе осада застала бы город с той
  // прочностью, что была на момент прошлого штурма, а не нынешней.
  syncBuildingHp(defP, nowSec);
  const targets = demolishOrder(defP).map((e) => {
    const lv = buildLvAt(defP, e.bk, e.plot);
    return { bk: e.bk, plot: e.plot, lv, hp: buildHpAt(defP, e.bk, e.plot), max: buildingMaxHp(e.bk, lv) };
  });
  if (!targets.length) return false;
  state.phase = "demolish";
  state.concluded = false;
  state.demolish = {
    round: 0, i: 0, targets, ruined: [], hallFell: false,
    // Гарнизон продолжает бить по осадным, пока сам стоит — поэтому прийти
    // с горсткой орудий и спокойно разбирать город нельзя, они кончатся
    // раньше запала осады.
    garrisonLv: buildLvAt(defP, "garrison", null),
  };
  pushLog(state, "breach", "Поле за нападавшими. Осадные орудия подтягивают к стенам — " + siegeUnitsAlive(state.attU) + " в строю.", "att");
  return true;
}
// Продолжает снос с того места, где остановился прошлый тик. Мутирует state,
// как и runPvpBattleRounds, и по тем же правилам: revealFrom* — то, что
// клиент видит ПРЯМО СЕЙЧАС, поля без префикса — то, что будет через
// BATTLE_TICK_SECONDS; между ними клиент интерполирует.
function runDemolishRounds(state, attP, defP) {
  const D = state.demolish;
  const attB = bonuses(attP);
  const rnd = battleRngMp(state.marchId);
  const roll = () => 1 + (rnd() * 2 - 1) * 0.05;
  state.revealFromAttHp = state.attHpLeft;
  state.revealFromDefHp = state.defHpLeft;
  state.revealFromRound = state.round;
  state.revealFromAttGenFrac = state.attGenHpFrac;
  state.revealFromDefGenFrac = state.defGenHpFrac;
  // Полоска цели: с чего начинали этот кусок и на чём закончим (см. выше).
  const curBefore = D.targets[D.i];
  D.revealFromHp = curBefore ? curBefore.hp : 0;
  D.revealFromKey = curBefore ? curBefore.bk + ":" + (curBefore.plot == null ? "" : curBefore.plot) : null;

  let attU = state.attU;
  let done = 0;
  while (D.round < DEMOLISH_ROUNDS && done < DEMOLISH_ROUNDS_PER_TICK) {
    const t = D.targets[D.i];
    if (!t) break;                                   // город разобран целиком
    const breach = siegeBreachPerRound(attU, attP.race, attB) * roll();
    if (breach <= 0) break;                          // осадные кончились
    D.round++; done++; state.round++;
    t.hp = Math.max(0, t.hp - breach);
    if (t.hp <= 0) {
      if (t.bk === "hall") {
        // Ратушу не сносят — она не может пропасть с карты города. Но её
        // обнуление и есть гибель правителя (см. Фазу 30): здесь только
        // честно помечаем, разбирается это в finalizePvpBattle.
        D.hallFell = true;
        pushLog(state, "ruin", "Ворота Ратуши выбиты. Город пал.", "att");
        break;
      }
      D.ruined.push({ bk: t.bk, plot: t.plot, lv: t.lv, round: D.round });
      pushLog(state, "ruin", buildRuName(t.bk, t.plot) + " (" + t.lv + " ур.) " +
        ruinWord("обрушен", t.bk) + " и " + ruinWord("разобран", t.bk) + " до основания.", "att");
      D.i++;
    } else {
      pushLog(state, "breach", buildRuName(t.bk, t.plot) + " под ударом таранов — прочность " +
        Math.round(t.hp) + " из " + t.max + ".", "att");
    }
    // Ответ гарнизона — тот же залп, что и на подходе к городу (см.
    // garrisonVolley в initPvpBattle), только теперь по каждому раунду сноса
    // и только пока сам гарнизон стоит.
    if (D.garrisonLv > 0) {
      const attS = sideStats(attU, attP.race, attB, state.attBroken, state.attRisen);
      const volley = garrisonVolley(D.garrisonLv, attS);
      if (volley) {
        const before = unitsTotal(attU);
        const l = applyLosses(attU, volley, attP.race, attB.hp, null, rnd);
        attU = unitsSub(attU, l.units);
        state.attLossTotal = unitsAdd(state.attLossTotal, l.units);
        const fell = before - unitsTotal(attU);
        if (fell > 0) pushLog(state, "tower", "Сторожевая башня бьёт по осадным — пало " + fell + ".", "def");
      }
    }
    // Гарнизон рухнул именно в этом раунде — дальше он уже не стреляет.
    if (D.garrisonLv > 0 && D.ruined.some((r) => r.bk === "garrison")) D.garrisonLv = 0;
  }

  state.attU = attU;
  state.attHpLeft = Math.round(sideStats(attU, attP.race, attB, state.attBroken, state.attRisen).totalHp);
  const cur = D.targets[D.i];
  D.curHp = cur ? Math.round(cur.hp) : 0;
  D.curMax = cur ? cur.max : 0;
  D.curName = cur ? buildRuName(cur.bk, cur.plot) : null;
  D.curKey = cur ? cur.bk + ":" + (cur.plot == null ? "" : cur.plot) : null;
  state.revealStart = Date.now();
  state.revealAt = state.revealStart + BATTLE_TICK_SECONDS * 1000;
  // Запал вышел, город разобран целиком, орудия кончились или Ратуша пала —
  // фаза окончена, дальше обычный конец боя (трофеи, дорога домой, письма).
  const spent = D.round >= DEMOLISH_ROUNDS || !D.targets[D.i] || siegeUnitsAlive(attU) <= 0 || D.hallFell;
  if (spent) {
    state.concluded = true;
    pushLog(state, "end",
      D.hallFell ? "Ратуша разбита. Правителю этого города больше нечем править." :
      D.ruined.length ? "Осада выдохлась. Разрушено построек: " + D.ruined.length + "." :
      "Осадные орудия не смогли обрушить ни одной постройки.",
      "att");
  }
  return state;
}
// Переносит итог сноса в состояние защитника. Зовётся ОДИН раз, из
// finalizePvpBattle, там же, где начисляются потери войск, — до этого момента
// город защитника цел и в базе, и на экране.
function destroyBuilding(p, bk, plot) {
  if (BUILD_MULTI.has(bk)) {
    if (!Array.isArray(p.b[bk])) p.b[bk] = [p.b[bk] || 0, 0, 0, 0];
    p.b[bk][plot || 0] = 0;
  } else {
    p.b[bk] = 0;
  }
  // Здания нет — прочности у него тоже нет.
  if (p.bhp) {
    if (BUILD_MULTI.has(bk) && Array.isArray(p.bhp[bk])) p.bhp[bk][plot || 0] = 0;
    else delete p.bhp[bk];
  }
  // С карты города (свободная застройка) — участок освобождается, на нём
  // можно строить заново или поставить туда что-то другое.
  const samePlot = (a, b) => (a == null ? null : a) === (b == null ? null : b);
  if (Array.isArray(p.layout)) p.layout = p.layout.filter((e) => !(e.b === bk && samePlot(e.plot, plot)));
  // Всё, что шло ВНУТРИ здания, сгорает вместе с ним: недостроенный уровень,
  // набор войск, исследование, ковка. Само событие в очереди отменять не
  // нужно — apply*-обработчики выше все до одного проверяют "слот пуст —
  // выходим", так что осиротевшее событие просто тихо гаснет.
  if (Array.isArray(p.queues)) {
    p.queues = p.queues.map((q) => (q && q.b === bk && samePlot(q.plot, plot)) ? null : q);
  }
  const tt = BLD_TRAIN[bk];
  if (tt && p.train) p.train[tt] = null;
  if (bk === "academy") p.rsch = null;
  if (bk === "forge") p.craft = null;
  // Лечение прерывается, только если не осталось НИ ОДНОГО лазарета: у
  // госпиталя четыре участка, потеря одного из них очередь не рвёт.
  if (bk === "hospital" && [0, 1, 2, 3].every((i) => buildLvAt(p, "hospital", i) <= 0)) p.heal = null;
}
function applyDemolishToDefender(defP, state, nowSec) {
  const D = state.demolish;
  if (!D) return;
  D.targets.forEach((t) => {
    const ruined = D.ruined.some((r) => r.bk === t.bk && (r.plot == null ? null : r.plot) === (t.plot == null ? null : t.plot));
    if (ruined) { destroyBuilding(defP, t.bk, t.plot); return; }
    // Уцелевшие, но задетые — запоминаем оставшуюся прочность (с неё же
    // начнётся починка через полчаса тишины и следующая осада, если она
    // случится раньше).
    if (t.hp < t.max) setBuildHp(defP, t.bk, t.plot, t.hp);
  });
  defP.bhpAt = nowSec;
}

function initPvpBattle(attUnits, attP, defUnits, defP, defWallLv, defGarrisonLv, marchId, attHasGen, attDeathFrac, defDeathFrac) {
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
  // Хроника — см. заголовок pushLog выше. state ещё не существует (return
  // только в конце функции), копим в локальный log и кладём в state внизу.
  const log = [];
  const fakeState = { round: 0, log };
  if (weather.id !== "clear") pushLog(fakeState, "weather", weather.name + ". " + (weather.desc || ""), null);
  // index.html:4169-4188 первый залп лучников (elf firstStrike) + залп
  // Сторожевой башни защитника — ДО общей схватки, один раз на весь бой,
  // здесь и остаются (не часть раундового цикла — переносить их в
  // runPvpBattleRounds незачем, они уже применены раз и навсегда к
  // стартовому состоянию state).
  const openA = volleyDamage(attU, attP.race, attB, sideStats(defU, defP.race, defB), defWallLv, defB.wallBonus);
  if (openA) {
    const scaled = {}; TKEYS.forEach((t) => { scaled[t] = (openA[t] || 0) * wMod("arc") * roll(); });
    const before = unitsTotal(defU);
    const l = applyLosses(defU, scaled, defP.race, defB.hp, null, rnd);
    defU = unitsSub(defU, l.units); defLossTotal = unitsAdd(defLossTotal, l.units);
    const fell = before - unitsTotal(defU);
    if (fell > 0) pushLog(fakeState, "volley", "Атакующие: лучники дали залп ещё до сшибки — пало " + fell + ".", "att");
  }
  const openD = volleyDamage(defU, defP.race, defB, sideStats(attU, attP.race, attB));
  if (openD) {
    const scaled = {}; TKEYS.forEach((t) => { scaled[t] = (openD[t] || 0) * wMod("arc") * roll(); });
    const before = unitsTotal(attU);
    const l = applyLosses(attU, scaled, attP.race, attB.hp, null, rnd);
    attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
    const fell = before - unitsTotal(attU);
    if (fell > 0) pushLog(fakeState, "volley", "Обороняющиеся: встречный залп лучников — пало " + fell + ".", "def");
  }
  const openG = garrisonVolley(defGarrisonLv, sideStats(attU, attP.race, attB));
  if (openG) {
    const before = unitsTotal(attU);
    const l = applyLosses(attU, openG, attP.race, attB.hp, null, rnd);
    attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
    const fell = before - unitsTotal(attU);
    if (fell > 0) pushLog(fakeState, "tower", "Сторожевая башня встретила подходящих — пало " + fell + ".", "def");
  }
  {
    const attBrokenBefore = snapshotBroken(attBroken), defBrokenBefore = snapshotBroken(defBroken);
    checkDiscipline(attUnits, attLossTotal, attP.race, attBroken);
    checkDiscipline(defUnits, defLossTotal, defP.race, defBroken);
    const attBrokeNow = newlyBrokenTypes(attBrokenBefore, attBroken), defBrokeNow = newlyBrokenTypes(defBrokenBefore, defBroken);
    if (attBrokeNow.length) pushLog(fakeState, "panic", "Атакующие: " + attBrokeNow.join(", ") + " дрогнули ещё на подходе.", "def");
    if (defBrokeNow.length) pushLog(fakeState, "panic", "Обороняющиеся: " + defBrokeNow.join(", ") + " дрогнули ещё на подходе.", "att");
  }
  const attStartN = unitsTotal(attUnits);
  const attStartHp = sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp;
  const defStartHp = sideStats(defU, defP.race, defB, defBroken, defRisen).totalHp;
  const totalTroops = pvpTotalTroops(attUnits, defUnits);
  const ticksBudget = battleTicksBudget(totalTroops);
  // Сила сторон ДО боя (armyPower от стартового состава, не текущей HP-полосы)
  // — только для ярлыка исхода на клиенте (index.html battleOutcomeTier,
  // "героическая победа"/"позорное поражение"), на сам бой не влияет.
  const attStartPower = armyPower(attUnits, attB, attP.race);
  const defStartPower = armyPower(defUnits, defB, defP.race);
  return {
    marchId, round: 0, ticksBudget, weather, log,
    // marks — рубежи "в строю осталась половина/четверть", о которых
    // сообщаем ровно один раз (index.html:4439 marks) — своё поле в state,
    // переживает между тиками так же, как и весь остальной ход боя.
    marks: { att: { 50: false, 25: false }, def: { 50: false, 25: false } },
    attU, defU, attStartUnits: attUnits, defStartUnits: defUnits, attStartN,
    attStartPower, defStartPower,
    attLossTotal, defLossTotal, attBroken, defBroken,
    attRisen, defRisen, attRaisedCum, defRaisedCum,
    // Смерти прямо в бою (см. BATTLE_DEATH_FRAC) — доля решается на завязке
    // (осада: атакующий/оборона врозь; бой за точку: одна и та же ставка
    // обеим сторонам), хранится в state, а не аргументом на каждый вызов —
    // runPvpBattleRounds/finalizePvpBattle/finalizeNodeBattle читают её
    // отсюда на любом продолжении многотикового боя.
    attDeathFrac: attDeathFrac || 0, defDeathFrac: defDeathFrac || 0,
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
  // Фаза 27 — round ДО этого куска: 0 у самого первого куска (реального
  // урона ещё не было ни разу, войска "в строю") — клиент по этому флагу
  // подписывает надземную метку боя "Развёртывание" вместо "Бой — раунд N"
  // на всё время первого reveal-окна (см. mpBattleInterp/updateBattleLabels
  // в index.html/main.ts).
  state.revealFromRound = state.round;
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
  // Хроника (см. заголовок pushLog) — защита от старых боёв, уже лежавших
  // в marches.data.battle ДО этого деплоя: у них этих полей ещё нет.
  if (!state.log) state.log = [];
  if (!state.marks) state.marks = { att: { 50: false, 25: false }, def: { 50: false, 25: false } };
  const defStartTotal = unitsTotal(state.defStartUnits);

  let roundsThisCall = 0;
  while (state.round < ROUND_CAP && roundsThisCall < roundsBudget) {
    const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), defS = sideStats(defU, defP.race, defB, defBroken, defRisen);
    if (attS.totalN <= 0 || defS.totalN <= 0) break;
    state.round++; roundsThisCall++;
    // Снимки ДО этого раунда — не влияют на бой, только на то, что от них
    // отсчитывать в хронике ниже (index.html:4508-4510 beforeA/beforeD/
    // genAliveA/genAliveD/risenA0/risenD0 — дословно тот же приём).
    const beforeAttN = unitsTotal(attU), beforeDefN = unitsTotal(defU);
    const genAliveAtt = !!(attGen && attGen.hp > 0), genAliveDef = !!(defGen && defGen.hp > 0);
    const risenAttBefore = unitsTotal(attRaisedCum), risenDefBefore = unitsTotal(defRaisedCum);
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
        const beforeCounter = unitsTotal(attU);
        const l = applyLosses(attU, reflect, attP.race, attB.hp, null, rnd);
        attU = unitsSub(attU, l.units); attLossTotal = unitsAdd(attLossTotal, l.units);
        const fell = beforeCounter - unitsTotal(attU);
        if (fell > 0) pushLog(state, "counter", "Обороняющиеся: гарнизон отвечает контрударом — пало " + fell + ".", "def");
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
    if (genAliveAtt && attGen.hp <= 0) pushLog(state, "general", "Атакующие: полководец пал и больше не ведёт войско.", "def");
    if (genAliveDef && defGen.hp <= 0) pushLog(state, "general", "Обороняющиеся: полководец пал и больше не ведёт войско.", "att");
    const attBrokenBefore = snapshotBroken(attBroken), defBrokenBefore = snapshotBroken(defBroken);
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
    checkDiscipline(state.defStartUnits, defLossTotal, defP.race, defBroken);
    const attBrokeNow = newlyBrokenTypes(attBrokenBefore, attBroken), defBrokeNow = newlyBrokenTypes(defBrokenBefore, defBroken);
    if (attBrokeNow.length) pushLog(state, "panic", "Атакующие: " + attBrokeNow.join(", ") + " дрогнули — бьются и держатся хуже до конца боя.", "def");
    if (defBrokeNow.length) pushLog(state, "panic", "Обороняющиеся: " + defBrokeNow.join(", ") + " дрогнули — бьются и держатся хуже до конца боя.", "att");
    applyRaise(defP, defB, defLossTotal, defRisen, defRaisedCum, state.defDeathFrac, defBroken);
    applyRaise(attP, attB, attLossTotal, attRisen, attRaisedCum, state.attDeathFrac, attBroken);
    const risenAttNow = unitsTotal(attRaisedCum) - risenAttBefore, risenDefNow = unitsTotal(defRaisedCum) - risenDefBefore;
    if (risenAttNow > 0) pushLog(state, "raise", "Атакующие: павшие поднимаются и встают обратно в строй — " + risenAttNow + ".", "att");
    if (risenDefNow > 0) pushLog(state, "raise", "Обороняющиеся: павшие поднимаются и встают обратно в строй — " + risenDefNow + ".", "def");
    // Сводка по раунду (index.html:4543-4551) — не каждый, иначе хроника
    // превращается в столбец цифр: первые два, затем каждый пятый, и
    // обязательно тот, где полегло особенно много.
    const lostAtt = beforeAttN - unitsTotal(attU), lostDef = beforeDefN - unitsTotal(defU);
    const heavyRound = (beforeAttN > 0 && lostAtt / beforeAttN >= 0.2) || (beforeDefN > 0 && lostDef / beforeDefN >= 0.2);
    if (state.round <= 2 || state.round % 5 === 0 || heavyRound) {
      pushLog(state, "round", "Схватка " + state.round + ": атакующие теряют " + lostAtt + " (в строю " + unitsTotal(attU) + "), обороняющиеся теряют " + lostDef + " (в строю " + unitsTotal(defU) + ").", null);
    }
    // Рубежи "в строю осталась половина/четверть" (index.html:4438-4451
    // checkMarks) — по разу на сторону за весь бой, state.marks переживает
    // между тиками наравне со всем остальным ходом боя.
    [["att", attU, state.attStartN, "def", "Атакующие"], ["def", defU, defStartTotal, "att", "Обороняющиеся"]].forEach(([k, u, st, otherSide, label]) => {
      if (st <= 0) return;
      const left = unitsTotal(u) / st;
      [50, 25].forEach((pc) => {
        if (!state.marks[k][pc] && left <= pc / 100) {
          state.marks[k][pc] = true;
          pushLog(state, "mark", label + ": в строю осталась " + (pc === 50 ? "половина" : "четверть") + " войска.", otherSide);
        }
      });
    });
    if (unitsTotal(attU) / Math.max(1, state.attStartN) < 0.28) {
      pushLog(state, "rout", "Атакующие: потеряно больше двух третей войска — уцелевшие отходят.", "def");
      break;
    }
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
    // Итоговая строка хроники (index.html:4578-4584 note("end",...)) —
    // называет ПРИЧИНУ исхода, не только победителя.
    pushLog(state, "end",
      defAlive <= 0 && attAlive > 0 ? "Обороняющиеся перебиты целиком. Поле осталось за нападавшими." :
      attAlive <= 0 && defAlive > 0 ? "Нападавшие перебиты целиком. Штурм отбит." :
      attAlive <= 0 && defAlive <= 0 ? "Обе стороны полегли до последнего. Поле осталось за оборонявшимися." :
      state.winner === "att" ? "Бой выдохся. Нападавшие сохранили больше сил — поле за ними." :
                  "Бой выдохся. Оборонявшиеся сохранили больше сил — штурм не удался.",
      state.winner);
    // Фаза 29 — разбить армию защитника ещё не значит закончить осаду: если
    // у нападавших уцелели осадные орудия, начинается снос самого города
    // (см. beginDemolish — она же и решает, начинать ли вообще, и снимает
    // state.concluded обратно, если да). Отступление сюда не попадает:
    // retreated ставится в applyPvpBattleRound уже ПОСЛЕ этого места, а
    // winner там всегда "def" — beginDemolish на такой исход не срабатывает.
    beginDemolish(state, attP, defP, Date.now() / 1000);
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
// Технический пол ДОРОЖНОГО времени (секунды) — только чтобы t1 > t0 и
// запланированное событие не оказалось в прошлом при переносе на соседнюю
// клетку. С BATTLE_TICK_SECONDS выше не путать: пятнадцать секунд это фаза
// боя (развёртывание/отступление), автор оговорил прямо — «это никак не
// влияет на скорость или дорогу отряда». Стоявшие тут прежде Math.max(15,…)
// и были тем самым «куда бы ни повёл — всегда 15 секунд».
const MIN_TRAVEL = 3;
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
// Раньше штурмующий чужой город (mode:"siege-attack") гиб насмерть без
// исключений, отдельно от всех остальных исходов боя — RoK-условность,
// которую автор явно попросил убрать: одна система на любой бой, штурм не
// исключение. bonuses(p).hosp/mercy — Фаза 6, настоящий подсчёт (без
// defending=true, дословно как в index.html:4360 — hospitalSplit не только
// для обороны города).
const SLIGHT_WOUND_FRAC = 0.12;
// index.html:BATTLE_DEATH_FRAC — смерти НЕПОСРЕДСТВЕННО в бою, независимо
// от вопроса о месте в лазарете (тот остаётся отдельным путём — deadUnits
// сверх вместимости, см. ниже, без изменений). Автор: "то, что не влезло в
// лазарет, умирает — это само собой, но в самих боях тоже должны быть
// смерти, просто потому что это бой". Штурм города — втрое жёстче для
// штурмующего, втрое мягче для обороны; рейд на разбойников (PvE) — 0,
// только раненые; любой другой PvP-бой (осада/бой за точку) — общая
// базовая ставка. Дисциплина спасает часть — тир, что дрогнул (broken),
// бежит вместо того, чтобы стоять насмерть (DISCIPLINE_BREAK_DEATH_MULT).
const BATTLE_DEATH_FRAC = 0.10;
const SIEGE_ATT_DEATH_FRAC = BATTLE_DEATH_FRAC * 3;
const SIEGE_DEF_DEATH_FRAC = BATTLE_DEATH_FRAC / 3;
const DISCIPLINE_BREAK_DEATH_MULT = 0.5;
// index.html WIN_DEATH_MULT/LOSE_DEATH_MULT — дословно: проигравшая
// сторона гибнет заметно тяжелее победившей (тот, кто в итоге проиграл,
// обычно и есть тот, кто стоял до последнего без шансов). Применяется
// ТОЛЬКО в финальном разборе потерь (finalizePvpBattle/finalizeNodeBattle,
// исход уже известен), не в applyRaise по ходу боя — там исход ещё не решён.
// (WIN+LOSE)/2=1.0 — среднее по популяции боёв держит прежний, уже принятый
// уровень жёсткости, только перераспределяя её к проигравшему (см. подробный
// разбор и battle-sim.mjs в index.html, тот же комментарий дословно).
const WIN_DEATH_MULT = 0.65;
const LOSE_DEATH_MULT = 1.35;
function hospitalSplit(p, loss, deathFrac, broken) {
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
      const isBroken = broken && broken[t] && broken[t][i];
      const df = (deathFrac || 0) * (isBroken ? DISCIPLINE_BREAK_DEATH_MULT : 1);
      const bd = Math.min(n, Math.round(n * df));
      if (bd > 0) { deadUnits[t][i] += bd; dead += bd; n -= bd; }
      const room = Math.max(0, cap - inHosp);
      const w = Math.min(n, room);
      inHosp += w;
      hurtUnits[t][i] += w; hurt += w;
      const d = n - w;
      deadUnits[t][i] += d; dead += d;
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
function applyRaise(p, B, lossTotal, risen, raisedCum, deathFrac, broken) {
  const rate = B.raise || 0, rateHurt = B.raiseHurt || 0;
  if (rate <= 0 && rateHurt <= 0) return;
  const hs = hospitalSplit(p, lossTotal, deathFrac, broken);
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

// Скорость похода — копия из mp-raid/mp-attack/mp-gather (правило
// самодостаточных функций, см. supabase/README.md). Тику это понадобилось
// только с Фазой 53: сбор союза выступает НЕ по запросу игрока, а по
// событию rally_launch, то есть дорогу ему считает тик, а не отправляющая
// функция. Множитель march при этом брать неоткуда копировать — полная
// bonuses(p) у тика своя (см. выше), b.march в ней уже собран.
const TROOP_SPEED = { inf: 1.00, arc: 1.10, cav: 1.70, sie: 0.60 };
const RACE_SPEED_MOD = { undead: { sie: 1.20 } };
const troopSpeedMod = (race, t) => (RACE_SPEED_MOD[race] && RACE_SPEED_MOD[race][t]) || 1;
const MARCH_SPEED_SCALE = 32;
// Скорость всего отряда — по САМОМУ МЕДЛЕННОМУ из присутствующих родов
// войск: осадные машины тянут колонну назад, как и в одиночной игре.
function marchSpeed(units, race, marchBonus = 1) {
  let sp = 99;
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      if (((units[t] && units[t][i]) || 0) > 0) sp = Math.min(sp, TROOP_SPEED[t] * troopSpeedMod(race, t));
    }
  });
  if (sp > 90) sp = 1;
  return sp * MARCH_SPEED_SCALE * marchBonus;
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
// Возвращает новый уровень генерала, если за этот вызов он хоть раз
// повысился, иначе null — зеркало pushMail({cat:"personal",kind:"note",
// title:"Генерал повышен",...}) в addXp() одиночки (index.html:5503-5514).
// Раньше этот сигнал терялся: сервер честно копил pts/lv, но письма о
// повышении не было вовсе (автор в одиночке видел "Генерал достиг N
// уровня", в общем мире — молчание) — оба вызывающих места (после победы в
// PvP и после победы над лагерем варваров) теперь заводят kind:"note".
function addXp(p, xp) {
  if (!p.gen) p.gen = { lv: 1, xp: 0, pts: 5, tal: {}, id: null, away: null }; // самоисцеление легаси-записей
  p.gen.xp = (p.gen.xp || 0) + xp;
  const cap = Math.min(60, epochOf(p.b && p.b.hall) * 12);
  let leveledTo = null;
  while (p.gen.xp >= genXpNeed(p.gen.lv) && p.gen.lv < cap) {
    p.gen.xp -= genXpNeed(p.gen.lv);
    p.gen.lv++; p.gen.pts = (p.gen.pts || 0) + 1;
    leveledTo = p.gen.lv;
  }
  return leveledTo;
}
// (genLevelMailRow удалена вместе с самими письмами о повышении генерала —
// автор попросил их исключить; addXp выше по-прежнему считает уровень и
// очки, просто больше никого об этом не извещает почтой.)
function banditArmy(lv) {
  const u = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) u[t][i] = 0; });
  const i = Math.max(1, Math.min(25, Math.round(lv)));
  const tier = banditTier(i), n = BANDIT_TROOPS[i - 1];
  u.inf[tier] = Math.round(n * 0.45); u.arc[tier] = Math.round(n * 0.30); u.cav[tier] = Math.round(n * 0.25);
  return u;
}
// Разбойники не имеют ни расы, ни бонусов вообще — тот же явный ноль, что
// D.B={atk:0,def:0,hp:0,archer:0,raise:0} в index.html:5139
// (arriveMarch, ветка camp/fort). Явные нули, не пустой объект — sideStats
// делает "(1+B.atk)" без страховки ||0, пустой объект дал бы NaN.
const BANDIT_B = { atk: 0, def: 0, hp: 0, archer: 0 };
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
  // Хроника (см. заголовок pushLog у initPvpBattle) — раид читает только
  // атакующий (finalizeRaidBattle шлёт письмо ему одному), поэтому текст
  // прямо от первого лица ("наш отряд"/"лагерь"), без нейтральных
  // "атакующие/обороняющиеся", как в симметричном PvP-логе.
  const log = [];
  const fakeState = { round: 0, log };
  if (weather.id !== "clear") pushLog(fakeState, "weather", weather.name + ". " + (weather.desc || ""), null);
  const openA = volleyDamage(attU, attP.race, attB, sideStats(bandU, null, BANDIT_B));
  if (openA) {
    const scaled = {}; TKEYS.forEach((t) => { scaled[t] = (openA[t] || 0) * wMod("arc") * roll(); });
    const before = unitsTotal(bandU);
    const l = applyLosses(bandU, scaled, null, 0, null, rnd);
    bandU = unitsSub(bandU, l.units); bandLossTotal = unitsAdd(bandLossTotal, l.units);
    checkDiscipline(bandStart, bandLossTotal, null, bandBroken);
    const fell = before - unitsTotal(bandU);
    if (fell > 0) pushLog(fakeState, "volley", "Наш отряд: лучники дали залп ещё до сшибки — пало " + fell + ".", "att");
  }
  const attStartN = unitsTotal(attUnits);
  const attStartHp = sideStats(attU, attP.race, attB, attBroken, attRisen).totalHp;
  const bandStartHp = sideStats(bandU, null, BANDIT_B, bandBroken).totalHp;
  const ticksBudget = battleTicksBudget(unitsTotal(attUnits) + unitsTotal(bandStart));
  // index.html initPvpBattle:attStartPower/defStartPower — тот же смысл,
  // только силу лагеря считаем от BANDIT_B (race=null, как и везде у
  // разбойников).
  const attStartPower = armyPower(attUnits, attB, attP.race);
  const defStartPower = armyPower(bandStart, BANDIT_B, null);
  return {
    marchId, round: 0, ticksBudget, weather, campLv, log,
    marks: { att: { 50: false, 25: false }, def: { 50: false, 25: false } },
    attU, defU: bandU, attStartUnits: attUnits, defStartUnits: bandStart, attStartN,
    attStartPower, defStartPower,
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
  // Фаза 27 — round ДО этого куска: 0 у самого первого куска (реального
  // урона ещё не было ни разу, войска "в строю") — клиент по этому флагу
  // подписывает надземную метку боя "Развёртывание" вместо "Бой — раунд N"
  // на всё время первого reveal-окна (см. mpBattleInterp/updateBattleLabels
  // в index.html/main.ts).
  state.revealFromRound = state.round;
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
  if (!state.log) state.log = [];
  if (!state.marks) state.marks = { att: { 50: false, 25: false }, def: { 50: false, 25: false } };
  const bandStartTotal = unitsTotal(state.defStartUnits);

  let roundsThisCall = 0;
  while (state.round < ROUND_CAP && roundsThisCall < roundsBudget) {
    const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), bandS = sideStats(bandU, null, BANDIT_B, bandBroken);
    if (attS.totalN <= 0 || bandS.totalN <= 0) break;
    state.round++; roundsThisCall++;
    const beforeAttN = unitsTotal(attU), beforeBandN = unitsTotal(bandU);
    const genAliveAtt = !!(attGen && attGen.hp > 0);
    const risenAttBefore = unitsTotal(attRaisedCum);
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
    if (genAliveAtt && attGen.hp <= 0) pushLog(state, "general", "Наш полководец пал и больше не ведёт войско.", "att");
    const attBrokenBefore = snapshotBroken(attBroken), bandBrokenBefore = snapshotBroken(bandBroken);
    checkDiscipline(state.defStartUnits, bandLossTotal, null, bandBroken);
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
    const attBrokeNow = newlyBrokenTypes(attBrokenBefore, attBroken), bandBrokeNow = newlyBrokenTypes(bandBrokenBefore, bandBroken);
    if (attBrokeNow.length) pushLog(state, "panic", "Наш отряд: " + attBrokeNow.join(", ") + " дрогнули — бьются и держатся хуже до конца боя.", "att");
    if (bandBrokeNow.length) pushLog(state, "panic", "Лагерь: " + bandBrokeNow.join(", ") + " дрогнули — держатся хуже до конца боя.", "att");
    // Лазарет атакующего тут работает как обычно (Фаза 28 — как и везде
    // теперь, включая PvP-штурм), raiseHurt для него реален.
    applyRaise(attP, attB, attLossTotal, attRisen, attRaisedCum);
    const risenAttNow = unitsTotal(attRaisedCum) - risenAttBefore;
    if (risenAttNow > 0) pushLog(state, "raise", "Наши павшие поднимаются и встают обратно в строй — " + risenAttNow + ".", "att");
    const lostAtt = beforeAttN - unitsTotal(attU), lostBand = beforeBandN - unitsTotal(bandU);
    const heavyRound = (beforeAttN > 0 && lostAtt / beforeAttN >= 0.2) || (beforeBandN > 0 && lostBand / beforeBandN >= 0.2);
    if (state.round <= 2 || state.round % 5 === 0 || heavyRound) {
      pushLog(state, "round", "Схватка " + state.round + ": наш отряд теряет " + lostAtt + " (в строю " + unitsTotal(attU) + "), лагерь теряет " + lostBand + " (в строю " + unitsTotal(bandU) + ").", null);
    }
    [["att", attU, state.attStartN, "Наш отряд"], ["def", bandU, bandStartTotal, "Лагерь"]].forEach(([k, u, st, label]) => {
      if (st <= 0) return;
      const left = unitsTotal(u) / st;
      [50, 25].forEach((pc) => {
        if (!state.marks[k][pc] && left <= pc / 100) {
          state.marks[k][pc] = true;
          pushLog(state, "mark", label + ": в строю осталась " + (pc === 50 ? "половина" : "четверть") + " войска.", "att");
        }
      });
    });
    if (unitsTotal(attU) / Math.max(1, state.attStartN) < 0.28) { // rout, index.html:5066 — тоже roundует с бандитами
      pushLog(state, "rout", "Наш отряд: потеряно больше двух третей войска — уцелевшие отходят.", "att");
      break;
    }
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
    pushLog(state, "end",
      bandAlive <= 0 && attAlive > 0 ? "Лагерь разбит целиком. Поле осталось за нашим отрядом." :
      attAlive <= 0 && bandAlive > 0 ? "Наш отряд перебит целиком. Лагерь устоял." :
      attAlive <= 0 && bandAlive <= 0 ? "Обе стороны полегли до последнего." :
      state.winner === "att" ? "Бой выдохся. Наш отряд сохранил больше сил — лагерь взят." :
                  "Бой выдохся. Лагерь сохранил больше сил — не взят.",
      "att");
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
  // mode:"move" — отряд перенаправлен (mp-redirect) на пустое место или на
  // цель, для которой у сервера нет подготовленного действия. Дошёл — и
  // разворачивается домой, ровно как в RoK при переносе армии на чистую
  // клетку. Тот же расчёт обратной дороги, что и у остальных возвращений.
  // mode:"move" — отряд отправили просто В ТОЧКУ (перетаскиванием, см.
  // mp-redirect). Дошёл — и СТОИТ там, пока не получит новый приказ. Прямое
  // указание автора: «отряд не принимает решения самостоятельно, только по
  // клику», поэтому никакого автоматического возвращения домой тут нет.
  // Никакого события не заводим: ждать нечего, отряд снимется с места только
  // новым перенаправлением (mp-redirect) или отзывом (mp-recall).
  if (m.mode === "move") {
    const nowSec2 = Date.now() / 1000;
    await admin.from("marches").update({ state: "hold", t0: nowSec2, t1: nowSec2 }).eq("id", m.id);
    return;
  }
  // Фаза 34 — торговый обоз (mp-trade). Дошёл — груз ложится получателю на
  // склад, обоим приходит письмо, сам обоз исчезает: обратной дороги у него
  // нет, он ушёл с товаром и остался. Налог удержан ещё при отправке (см.
  // заголовок mp-trade), сюда доезжает уже чистая сумма m.data.net.
  if (m.mode === "trade") { await applyTradeArrive(admin, m); return; }

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
  // Фаза 30 — павшего добивать не за чем: его города на карте уже нет ни у
  // кого, и второй раз убить его нельзя. Отряд разворачивается тем же
  // способом, что и при пропавшей цели/щите.
  if (!defRow || defRow.dead_at || defRow.shield_until > nowSec) {
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
  // Штурм города — SIEGE_ATT_DEATH_FRAC/SIEGE_DEF_DEATH_FRAC (втрое жёстче
  // штурмующему, втрое мягче обороне, см. их заголовок).
  const state = initPvpBattle(m.units, attP, defP.troops, defP, defWallLv, defGarrisonLv, m.id, attHasGen, SIEGE_ATT_DEATH_FRAC, SIEGE_DEF_DEATH_FRAC);
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
// =============================================================================
// Фаза 53 — общий сбор союза: выступление и роспуск.
// =============================================================================
// Как сбор ложится на уже написанное, разобрано в 0014_rally.sql: выступивший
// сбор — ОБЫЧНЫЙ МАРШ со сложенными войсками всех участников и с пометкой
// data.rally_id, поэтому весь разбор боя работает без единой правки. Тику
// достаётся ровно два места: сложить войска на выступлении (здесь) и
// рассыпать сбор на возврате (dissolveRally, вызывается из sendSurvivorsHome).

// Опорный уровень крепости варваров по ступени — копия из mp-raid
// (и из regfortLevel в index.html).
const RALLY_REGFORT_TIER_LV = [0, 17, 20, 24];
const RES_NAME_RU = { food: "Еда", wood: "Дерево", stone: "Камень", gold: "Золото", amber: "Янтарь" };

// Разложить общее число nTotal по долям shares (массив неотрицательных чисел,
// сумма которых total) так, чтобы сумма кусков в точности равнялась nTotal.
// Наибольшие остатки — иначе на мелких долях (один игрок привёл 3 копейщиков
// из 40000) round() каждой доли по отдельности даёт то недобор, то перебор, и
// войска либо теряются, либо родятся из воздуха.
function largestRemainder(nTotal, shares, total) {
  const out = shares.map(() => 0);
  if (nTotal <= 0 || total <= 0) return out;
  const rem = [];
  let given = 0;
  for (let k = 0; k < shares.length; k++) {
    const exact = (nTotal * shares[k]) / total;
    const whole = Math.floor(exact);
    out[k] = whole; given += whole;
    rem.push({ k, r: exact - whole });
  }
  rem.sort((a, b) => b.r - a.r);
  for (let j = 0; given < nTotal; j++, given++) out[rem[j % rem.length].k]++;
  return out;
}

// Поделить уцелевших между участниками. Делится КАЖДАЯ клетка (род войск ×
// ступень) отдельно и по долям в этой же клетке: у кого сколько лучников
// третьей ступени ушло, столько же его доля и в уцелевших лучниках третьей
// ступени. Иначе приведший одних осадных получил бы назад чужую конницу.
function splitSurvivorsByParts(survivors, parts) {
  const out = parts.map(() => ({ inf: {}, arc: {}, cav: {}, sie: {} }));
  TKEYS.forEach((t) => {
    for (let i = 1; i <= 5; i++) {
      const shares = parts.map((pt) => ((pt.units && pt.units[t] && pt.units[t][i]) || 0));
      const total = shares.reduce((a, b) => a + b, 0);
      const alive = (survivors && survivors[t] && survivors[t][i]) || 0;
      const got = largestRemainder(Math.min(alive, total), shares, total);
      out.forEach((u, k) => { u[t][i] = got[k]; });
    }
  });
  return out;
}

// Событие rally_launch — срок сбора вышел, выступаем.
async function applyRallyLaunch(admin, ev) {
  const rallyId = ev.data && ev.data.rally_id;
  if (rallyId == null) return;
  const { data: rally, error: rErr } = await admin
    .from("alliance_rallies").select("*").eq("id", rallyId).maybeSingle();
  if (rErr) throw rErr;
  if (!rally || rally.state !== "gather") return; // распустили до срока — событию делать нечего

  const { data: parts, error: pErr } = await admin
    .from("alliance_rally_parts").select("player_id, units").eq("rally_id", rallyId).order("joined_at");
  if (pErr) throw pErr;

  // Общий отход «сбор не состоялся»: вернуть всем их войска прямо в замки
  // (из замка созывающего они физически так и не вышли), освободить
  // полководца, закрыть сбор и сказать об этом в чат союза.
  const abort = async (why) => {
    for (const pt of parts || []) {
      const { data: row } = await admin.from("players").select("*").eq("id", pt.player_id).maybeSingle();
      if (!row) continue;
      const pp = row.state;
      pp.troops = unitsAdd(pp.troops, pt.units || {});
      if (rally.has_gen && pt.player_id === rally.leader_id && pp.gen) pp.gen.away = null;
      await savePlayerStateOrThrow(admin, row, pp);
    }
    await admin.from("alliance_rally_parts").delete().eq("rally_id", rallyId);
    await admin.from("alliance_rallies").update({ state: "done" }).eq("id", rallyId);
    await admin.from("alliance_chat").insert({
      alliance_id: rally.alliance_id, player_id: null, nick: "", kind: "system",
      body: "Сбор на «" + rally.target_name + "» не состоялся: " + why + " Войска вернулись по замкам.",
    });
  };

  const units = (parts || []).reduce((acc, pt) => unitsAdd(acc, pt.units || {}), { inf: {}, arc: {}, cav: {}, sie: {} });
  if (unitsTotal(units) <= 0) { await abort("некому было выступать."); return; }

  const { data: lead, error: lErr } = await admin.from("players").select("*").eq("id", rally.leader_id).maybeSingle();
  if (lErr) throw lErr;
  // Созывающий погиб, пока шёл срок — вести сбор некому и выходить неоткуда.
  if (!lead || lead.dead_at) { await abort("созывающий не вышел к войску."); return; }
  const leadP = lead.state;
  leadP.race = leadP.race || lead.race;

  // Цель проверяем ЗАНОВО: за шесть часов сбора лагерь мог разгромить кто-то
  // другой, крепость — пасть, правитель — уйти под щит или сменить место.
  let mode = "raid";
  const mdata = { rally_id: rally.id, cell_x: rally.tx, cell_y: rally.ty };
  const { data: cell } = await admin.from("map_cells").select("*")
    .eq("world_id", rally.world_id).eq("x", rally.tx).eq("y", rally.ty).maybeSingle();
  if (cell && (cell.t === "camp" || cell.t === "fort")) {
    mdata.camp_lv = (cell.data && cell.data.lv) || 1;
  } else if (cell && cell.t === "regfort" && (cell.data && cell.data.state) === "barb") {
    mdata.camp_lv = RALLY_REGFORT_TIER_LV[Math.max(1, Math.min(3, ((cell.data && cell.data.tier) | 0)))] || 17;
    mdata.regfort = true;
  } else {
    const { data: foe } = await admin.from("players")
      .select("id,shield_until,dead_at").eq("world_id", rally.world_id)
      .eq("x", rally.tx).eq("y", rally.ty).is("dead_at", null).maybeSingle();
    if (!foe) { await abort("цель к этому часу уже исчезла."); return; }
    if (Number(foe.shield_until || 0) > Date.now() / 1000) { await abort("цель укрылась под щитом мира."); return; }
    // defender_id — по нему applyMarchArrive и находит защитника; без него
    // марш ушёл бы в ветку «боя не было» и молча развернулся домой.
    mode = "attack"; mdata.defender_id = foe.id;
    delete mdata.cell_x; delete mdata.cell_y;
  }

  // Дорога — от замка СОЗЫВАЮЩЕГО (прямое условие автора: войска
  // присоединившихся идут в его замок и выходят оттуда) и его же множителем
  // похода. Скорость — по самому медленному во всей сложенной колонне.
  const nowSec = Date.now() / 1000;
  const dist = Math.hypot(rally.tx - lead.x, rally.ty - lead.y);
  const spd = marchSpeed(units, leadP.race, bonuses(leadP).march);
  const travel = Math.max(20, (dist / spd) * 60);
  mdata.dist = dist; mdata.spd = spd; mdata.has_gen = !!rally.has_gen;

  const { data: marchRow, error: mErr } = await admin.from("marches").insert({
    world_id: rally.world_id, player_id: rally.leader_id, mode, state: "go",
    tx: rally.tx, ty: rally.ty, t0: nowSec, t1: nowSec + travel, units, data: mdata,
  }).select().single();
  if (mErr) throw mErr;

  const { error: evErr } = await admin.from("events").insert({
    world_id: rally.world_id, fire_at: new Date((nowSec + travel) * 1000).toISOString(),
    type: "march_arrive", data: { march_id: marchRow.id },
  });
  if (evErr) { await admin.from("marches").delete().eq("id", marchRow.id); throw evErr; }

  // Полководец созывающего: при созыве away проставили пометкой {rally:id},
  // потому что марша тогда ещё не было. Теперь он есть — переписываем на его
  // номер, иначе applyMarchHome (p.gen.away === m.id) полководца не отпустит.
  if (rally.has_gen && leadP.gen) {
    leadP.gen.away = marchRow.id;
    await savePlayerStateOrThrow(admin, lead, leadP);
  }
  await admin.from("alliance_rallies")
    .update({ state: "march", march_id: marchRow.id }).eq("id", rally.id);
  await admin.from("alliance_chat").insert({
    alliance_id: rally.alliance_id, player_id: null, nick: "", kind: "system",
    body: "Сбор выступил на «" + rally.target_name + "»: " + unitsTotal(units) + " воинов, "
      + (parts || []).length + " " + ((parts || []).length === 1 ? "отряд" : "отрядов")
      + ". В пути " + Math.round(travel / 60) + " мин.",
  });
}

// Роспуск сбора — единственное, чем сбор отличается от большого одиночного
// похода, и ровно поэтому он живёт внутри sendSurvivorsHome: та —
// единственная воронка, через которую уходят домой уцелевшие ЛЮБОГО исхода
// (победа, поражение, цель исчезла, отступление). Автор: «как только цель
// достигнута, сбор рассыпается и множество отрядов союзников теперь по
// одиночке идут обратно в свои замки и они уже доступны дальше».
//
// Каждому участнику — свой марш state:'back' ОТ МЕСТА БОЯ до ЕГО замка, со
// своей дорогой и своей скоростью: сбор больше не колонна, и ждать чужих
// осадных машин никому не надо. Дальше их разбирает обычный march_home.
async function dissolveRally(admin, m, nowSec, survivors, carry) {
  const rallyId = m.data.rally_id;
  const { data: rally } = await admin.from("alliance_rallies").select("*").eq("id", rallyId).maybeSingle();
  const { data: parts } = await admin.from("alliance_rally_parts")
    .select("player_id, units").eq("rally_id", rallyId).order("joined_at");
  const list = parts || [];

  // Полководец созывающего освобождается в любом случае: марш сбора сейчас
  // будет удалён, и applyMarchHome по нему уже не пройдёт.
  const freeLeaderGen = async (newMarchId) => {
    if (!(m.data && m.data.has_gen) || !rally) return;
    const { data: row } = await admin.from("players").select("*").eq("id", rally.leader_id).maybeSingle();
    if (!row || !row.state.gen) return;
    const pp = row.state;
    if (pp.gen.away !== m.id) return;      // полководца уже перехватил новый поход
    pp.gen.away = newMarchId;              // null — домой, id — едет назад с отрядом
    await savePlayerStateOrThrow(admin, row, pp);
  };

  const shares = list.map((pt) => unitsTotal(pt.units || {}));
  const sentTotal = shares.reduce((a, b) => a + b, 0);
  const mine = splitSurvivorsByParts(survivors, list);
  // Добыча делится по приведённому войску — кто сколько привёл, тому столько
  // и досталось, независимо от того, чьи воины полегли: рисковали все.
  const RESALL = RES.concat(["amber"]);
  const carrySplit = {};
  RESALL.forEach((r) => { carrySplit[r] = largestRemainder(Math.floor((carry && carry[r]) || 0), shares, sentTotal); });

  let leaderMarchId = null;
  for (let k = 0; k < list.length; k++) {
    const pt = list[k];
    if (unitsTotal(mine[k]) <= 0) continue;   // от этого отряда не вернулся никто
    const { data: row } = await admin.from("players").select("id,x,y,state,race").eq("id", pt.player_id).maybeSingle();
    if (!row) continue;
    const pp = row.state; pp.race = pp.race || row.race;
    const distBack = Math.hypot(m.tx - row.x, m.ty - row.y);
    const spdBack = marchSpeed(mine[k], pp.race, bonuses(pp).march);
    const travelBack = Math.max(MIN_TRAVEL, (distBack / spdBack) * 60);
    const myCarry = {};
    RESALL.forEach((r) => { if (carrySplit[r][k] > 0) myCarry[r] = carrySplit[r][k]; });
    const isLeader = rally && pt.player_id === rally.leader_id;
    // Донесение соратнику. Разбор боя (mp-tick выше) пишет письмо ТОЛЬКО
    // владельцу марша, то есть созывающему: остальные о судьбе своих войск не
    // узнали бы вовсе. Поэтому каждому — своя короткая строка: что отдал, что
    // вернулось, что довёз. Созывающему её не шлём — у него есть настоящее
    // донесение о бое.
    if (!isLeader && rally) {
      const sentMine = unitsTotal(pt.units || {}), backMine = unitsTotal(mine[k]);
      const lootLine = RESALL.filter((r) => myCarry[r])
        .map((r) => RES_NAME_RU[r] + " " + myCarry[r]).join(", ");
      await admin.from("mail").insert({
        world_id: m.world_id, player_id: pt.player_id, kind: "alliance",
        data: { title: "Сбор на «" + rally.target_name + "»",
                body: "Вы отдали в сбор " + sentMine + " воинов. Домой возвращается " + backMine +
                      " (пало " + (sentMine - backMine) + ")." +
                      (lootLine ? " Ваша доля добычи: " + lootLine + "." : "") },
      });
    }
    const { data: back, error: bErr } = await admin.from("marches").insert({
      world_id: m.world_id, player_id: pt.player_id, mode: m.mode, state: "back",
      tx: m.tx, ty: m.ty, t0: nowSec, t1: nowSec + travelBack, units: mine[k],
      // from — МЕСТО БОЯ: линию возврата клиент ведёт по нему, и у каждого
      // союзника она теперь своя, от общей цели к своему замку.
      data: { dist: distBack, spd: spdBack, carry: myCarry, from: { x: m.tx, y: m.ty },
              rally_id: rallyId, has_gen: !!(isLeader && m.data.has_gen) },
    }).select("id").single();
    if (bErr) throw bErr;
    if (isLeader) leaderMarchId = back.id;
    const { error: evErr } = await admin.from("events").insert({
      world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
      type: "march_home", data: { march_id: back.id },
    });
    if (evErr) throw evErr;
  }

  await freeLeaderGen(leaderMarchId);
  await admin.from("marches").delete().eq("id", m.id);
  if (rally) {
    await admin.from("alliance_rally_parts").delete().eq("rally_id", rallyId);
    await admin.from("alliance_rallies").update({ state: "done" }).eq("id", rallyId);
    const alive = unitsTotal(survivors);
    await admin.from("alliance_chat").insert({
      alliance_id: rally.alliance_id, player_id: null, nick: "", kind: "system",
      body: alive > 0
        ? "Сбор на «" + rally.target_name + "» рассыпался: " + alive + " воинов расходятся по замкам."
        : "Сбор на «" + rally.target_name + "» полёг весь. Домой не вернулся никто.",
    });
  }
}

async function sendSurvivorsHome(admin, m, nowSec, survivors, carry) {
  // Фаза 53 — сбор союза домой не идёт: он тут рассыпается на отряды по числу
  // участников, и каждый уходит в свой замок сам (см. dissolveRally выше).
  // Перехват стоит ПЕРЕД проверкой на ноль уцелевших: даже когда не вернулся
  // никто, сбор надо закрыть, полководца отпустить и сказать об этом союзу.
  if (m.data && m.data.rally_id) { await dissolveRally(admin, m, nowSec, survivors, carry); return; }
  if (unitsTotal(survivors) <= 0) { await admin.from("marches").delete().eq("id", m.id); return; }
  // redirect_to снимаем с данных вместе с battle: он одноразовый, ставится
  // mp-redirect'ом в момент, когда отряд утащили ИЗ БОЯ. Бой к этой строке
  // уже честно завершён (потери применены, добыча/почта разобраны выше) —
  // осталось решить, куда идут уцелевшие: домой, как при обычном отступлении,
  // или туда, куда их тащили. Второе — прямая просьба автора: перетаскивание
  // во время боя засчитывается как отступление, но место, выбранное пальцем,
  // при этом не теряется.
  const { battle, redirect_to, ...restData } = m.data || {};
  const spdNow = (m.data && m.data.spd) || 1;
  if (redirect_to && Number.isFinite(redirect_to.x) && Number.isFinite(redirect_to.y)) {
    // Расстояние — от МЕСТА БОЯ до выбранной точки, а не старое дорожное
    // (m.data.dist считалось от замка до цели и здесь уже не про то).
    const distR = Math.hypot(redirect_to.x - m.tx, redirect_to.y - m.ty);
    const travelR = Math.max(MIN_TRAVEL, (distR / spdNow) * 60);
    const { error: updR } = await admin.from("marches").update({
      mode: "move", state: "go", tx: redirect_to.x, ty: redirect_to.y,
      // from — МЕСТО БОЯ: уцелевшие уходят оттуда, где дрались, а не из
      // замка. Клиент ведёт линию именно по этому полю (см. withPath в
      // index.html); без него отступивший отряд зримо прыгал домой и уже
      // оттуда шёл к выбранной точке.
      t0: nowSec, t1: nowSec + travelR, units: survivors,
      data: { ...restData, carry, from: { x: m.tx, y: m.ty } },
    }).eq("id", m.id);
    if (updR) throw updR;
    const { error: evR } = await admin.from("events").insert({
      world_id: m.world_id, fire_at: new Date((nowSec + travelR) * 1000).toISOString(),
      type: "march_arrive", data: { march_id: m.id },
    });
    if (evR) throw evR;
    return;
  }
  const dist = (m.data && m.data.dist) || 0, spd = (m.data && m.data.spd) || 1;
  const travelBack = Math.max(MIN_TRAVEL, (dist / spd) * 60);
  const { error: updM } = await admin.from("marches")
    // from — цель, от которой отряд разворачивается; для возврата это и был
    // прежний неявный расчёт, теперь он записан явно (иначе поле осталось бы
    // от ПРЕДЫДУЩЕГО отрезка и увело бы линию возврата не туда).
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack, units: survivors,
              data: { ...restData, carry, from: { x: m.tx, y: m.ty } } }).eq("id", m.id);
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
// Фаза 30 — правитель погиб. Три следствия, и все три обязаны случиться
// вместе: имя уходит в летопись (единственное, что переживает гибель, —
// прямая просьба автора), игрок помечается dead_at (с карты он пропадает
// для всех немедленно, но свою строку ещё видит — иначе тот, кого снесли
// офлайн, не увидел бы вообще ничего), и его походы распускаются: вести их
// некому и возвращаться некуда.
async function markRulerFallen(admin, m, attRow, defRow, defP, nowSec) {
  const e = defP.epitaph || {};
  const { error: chErr } = await admin.from("chronicles").insert({
    world_id: m.world_id, kind: "fall",
    nick: defRow.nick || "", race: defRow.race || "",
    data: {
      slayer_id: attRow.id, slayer_nick: attRow.nick || "", slayer_race: attRow.race || "",
      x: defRow.x, y: defRow.y, hall: e.hall || 0,
      ruled_sec: e.ruledSec || 0, ruined: e.ruined || 0,
      // Для будущего свода летописей и рейтингов: чего этот правитель успел
      // достичь на пике, а не с чем остался в последнюю секунду.
      peak_power: e.peakPower || 0,
    },
  });
  if (chErr) throw chErr;
  const { error: dErr } = await admin.from("players")
    .update({ dead_at: new Date(nowSec * 1000).toISOString() }).eq("id", defRow.id);
  if (dErr) throw dErr;
  const { error: mErr } = await admin.from("marches").delete().eq("player_id", defRow.id);
  if (mErr) throw mErr;
}
async function finalizePvpBattle(admin, m, attRow, defRow, attP, defP, state, nowSec) {
  // Снимок ДО единого изменения — на случай отката, см. saveBothPlayersOrThrow.
  const attSnapshot = snapshotState(attP);
  // Мощь держав ДО боя — скрытый коэффициент рейтинга (см. computeBattleRating).
  // Снимаем здесь, потому что applyPower ниже перезапишет row.power итогом боя,
  // и разорённый защитник выглядел бы ещё слабее, чем был.
  attRow.__powerBefore = attRow.power || 0;
  defRow.__powerBefore = defRow.power || 0;
  defP.troops = unitsSub(defP.troops, state.defLossTotal);
  // Фаза 4, шестой кусочек: лазарет защитника (index.html:4351/4411-4423)
  // — часть потерь не гибнет насмерть. Слегка раненые (12%) немедленно
  // возвращаются в строй, тяжелораненые (в пределах вместимости лазарета)
  // едут в p.wounded, и только сверх вместимости гибнут по-настоящему.
  // Фаза 28 — раньше штурмующий такой защиты не имел (mode:"siege-attack",
  // терял войска насмерть целиком) — автор явно попросил убрать это
  // исключение: одна система на любой бой, штурм не отличается от обороны/
  // рейда/боя за точку. Симметрично защитнику — тот же hospitalSplit.
  if (!defP.wounded) defP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!defP.wounded[t]) defP.wounded[t] = {}; });
  if (!attP.wounded) attP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!attP.wounded[t]) attP.wounded[t] = {}; });
  // WIN_DEATH_MULT/LOSE_DEATH_MULT — исход уже известен (state.winner),
  // проигравшая сторона гибнет заметно тяжелее победившей (см. их заголовок).
  const hs = hospitalSplit(defP, state.defLossTotal, state.defDeathFrac * (state.winner === "def" ? WIN_DEATH_MULT : LOSE_DEATH_MULT), state.defBroken);
  defP.troops = unitsAdd(defP.troops, hs.slightUnits);
  defP.wounded = unitsAdd(defP.wounded, hs.hurtUnits);
  const attHs = hospitalSplit(attP, state.attLossTotal, state.attDeathFrac * (state.winner === "att" ? WIN_DEATH_MULT : LOSE_DEATH_MULT), state.attBroken);
  attP.wounded = unitsAdd(attP.wounded, attHs.hurtUnits);
  // survivors — то, что реально идёт домой маршем: полные потери минус
  // легкораненые, которые возвращаются в строй немедленно и марш их не
  // теряет (тяжелораненые/убитые остаются дома в лазарете/навсегда, тем же
  // способом, что и у рейдов/боёв за точку — см. addUnitsInto(A.units,...)
  // в battleCity, index.html).
  const survivors = unitsAdd(unitsSub(state.attStartUnits, state.attLossTotal), attHs.slightUnits);
  let carry = {};

  // Фаза 10, кусочек 1 — опыт генерала за победу над игроком (только
  // атакующему, зеркало addXp(att,...) в battleCity, index.html:5093 —
  // защитник опыта за отражение штурма не получает, как и в клиенте).
  let genLeveledTo = null;
  if (state.winner === "att") {
    genLeveledTo = addXp(attP, Math.round(200 + (defP.b && defP.b.hall || 0) * 60));
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
  // Фаза 29 — итог сноса переносится в город защитника ровно здесь, одним
  // разом, вместе с потерями войск: до этой строки его строку в базе не
  // трогали вовсе (см. заголовок beginDemolish). ПОСЛЕ грабежа склада выше —
  // намеренно: осаждающий сперва выносит амбары, а уж потом жжёт их, и
  // защита ресурсов складом считается по складу, который ещё стоял.
  applyDemolishToDefender(defP, state, nowSec);
  // Отсчёт тишины для починки — от КОНЦА боя, а не от момента удара: пока по
  // городу работают тараны, каменщики не выходят, а следующий штурм в
  // пределах получаса застаёт постройки ровно там, где их оставил прошлый.
  defP.lastHitAt = nowSec;
  // Фаза 30 — Ратуша доведена до нуля прочности. Сама она не сносится (с
  // карты города пропасть не может), но её обнуление и есть конец правления.
  // Итог правления кладём В СОСТОЯНИЕ игрока, а не только в летопись: экран
  // гибели читает свою же строку players обычным опросом, без похода в
  // отдельную таблицу — а строка ещё живёт, помеченная dead_at (почему не
  // стираем сразу — см. migrations/0007_ruler_death.sql).
  // Фаза 31 — бой меняет мощь сильнее всего остального: у обеих сторон
  // убыли войска, у защитника вдобавок могло не остаться половины города.
  // Считаем прямо здесь, а не ждём, пока каждый из них зайдёт в игру и его
  // пересчитает mp-join, — иначе в рейтинге долго висели бы армии, которых
  // уже нет. survivors — то, что идёт домой маршем: у атакующего эти войска
  // вычтены из state, но принадлежат ему и в мощь входят.
  // Прочие отряды обеих сторон, что сейчас в поле (этот марш исключён — его
  // строка ещё несёт ДОБОЕВОЙ состав, а настоящий остаток мы и так знаем как
  // survivors; посчитать оба значило бы удвоить это войско в мощи).
  const { data: liveMarches, error: lmErr } = await admin.from("marches")
    .select("player_id,units").in("player_id", [attRow.id, defRow.id]).neq("id", m.id);
  if (lmErr) throw lmErr;
  const marchesOf = (pid) => (liveMarches || []).filter((r) => r.player_id === pid).map((r) => r.units);
  applyPower(attP, attRow, marchesOf(attRow.id).concat([survivors]));
  applyPower(defP, defRow, marchesOf(defRow.id));
  const rulerFell = !!(state.demolish && state.demolish.hallFell);
  if (rulerFell) {
    defP.epitaph = {
      at: nowSec,
      slayerNick: attRow.nick || "", slayerRace: attRow.race || "",
      x: defRow.x, y: defRow.y,
      hall: buildLvAt(defP, "hall", null),
      // Высшая мощь за всё правление, а не та, что осталась на момент
      // гибели: у павшего к этой секунде нет ни войск, ни половины города,
      // и текущее число сказало бы о нём неправду.
      peakPower: defP.peakPower || 0,
      power: defRow.power || 0,
      ruledSec: Math.max(0, Math.round(nowSec - new Date(defRow.created_at).getTime() / 1000)),
      ruined: (state.demolish.ruined || []).length,
    };
  }
  // Рейтинг — до записи: колонки уезжают в базу тем же обновлением, что и
  // состояние (см. extra в savePlayerState), так что проверка версии по
  // updated_at накрывает бой целиком, а не половину.
  const rat = await computeBattleRating(admin, attRow, defRow, state, nowSec * 1000);
  await saveBothPlayersOrThrow(admin, attRow, attP, attSnapshot, defRow, defP);
  // Строго ПОСЛЕ успешной записи состояния: если та отвалится по конфликту
  // (см. savePlayerState), бой пересчитается заново — а запись в летописи,
  // метка о гибели и строка журнала должны появиться ровно один раз и только
  // по факту.
  await logRatingEvent(admin, m, attRow, defRow, state, rat, "city");
  if (rulerFell) await markRulerFallen(admin, m, attRow, defRow, defP, nowSec);

  const summary = {
    winner: state.winner, sent: state.attStartUnits, attLoss: state.attLossTotal, defLoss: state.defLossTotal,
    attHpLeft: state.attHpLeft, defHpLeft: state.defHpLeft,
    defDead: hs.dead, defHurt: hs.hurt, defSlight: hs.slight,
    // Фаза 28 — то же самое теперь и у атакующего (раньше не считалось —
    // "siege-attack" означал безвозвратную гибель без разбора).
    attDead: attHs.dead, attHurt: attHs.hurt, attSlight: attHs.slight,
    // attStart/defStart/attPower/defPower — для battleOutcomeTier на клиенте
    // (index.html): доля своих потерь от стартового состава + сила сторон
    // ДО боя, чтобы отличить "героическую победу" слабого от рутинного разгрома.
    attStart: state.attStartN, defStart: unitsTotal(state.defStartUnits),
    attPower: state.attStartPower, defPower: state.defStartPower,
    rounds: state.round, weather: state.weather.id, weatherName: state.weather.name,
    loot: carry, // {} при поражении/ничьей — RES.forEach выше не заполнил ни рубля
    retreated: !!state.retreated, // Фаза 21 — честное отступление кнопкой, не обычное поражение (см. mp-recall)
    attRace: attRow.race, defRace: defRow.race,
    attCoords: { x: attRow.x, y: attRow.y }, defCoords: { x: defRow.x, y: defRow.y },
    // Рейтинг за этот бой — обеим сторонам в их же письмо. k_держава сюда
    // НЕ кладём: он на то и скрытый (см. docs/RANKS.md).
    rating: ratingMailPart(rat),
    attGen: state.attHasGen && attP.gen && attP.gen.id != null ? { id: attP.gen.id, lv: attP.gen.lv, tal: attP.gen.tal || {} } : null,
    defGen: (defP.gen && defP.gen.away == null && defP.gen.id != null) ? { id: defP.gen.id, lv: defP.gen.lv, tal: defP.gen.tal || {} } : null,
    attBuffs: battleBuffSnapshotMp(bonuses(attP)), defBuffs: battleBuffSnapshotMp(bonuses(defP, true)),
    // Фаза 29 — что осада сделала с самим городом. ruined — снесённые до
    // основания постройки (уровень, на котором они стояли, — чтобы в письме
    // было видно, чего именно лишился защитник); damaged — устоявшие, но
    // побитые. Пусто у обычного отражённого штурма: фазы сноса там не было.
    demolish: state.demolish ? {
      rounds: state.demolish.round,
      ruined: state.demolish.ruined.map((r) => ({ bk: r.bk, plot: r.plot, lv: r.lv, name: buildRuName(r.bk, r.plot) })),
      damaged: state.demolish.targets
        .filter((t) => t.hp > 0 && t.hp < t.max)
        .map((t) => ({ bk: t.bk, plot: t.plot, lv: t.lv, name: buildRuName(t.bk, t.plot), hp: Math.round(t.hp), max: t.max })),
      hallFell: !!state.demolish.hallFell,
    } : null,
    log: state.log || [],
  };
  const mailRows = [
    { world_id: m.world_id, player_id: attRow.id, kind: "battle", data: { role: "attacker", opponent_id: defRow.id, opponent_nick: defRow.nick, ...summary } },
    { world_id: m.world_id, player_id: defRow.id, kind: "battle", data: { role: "defender", opponent_id: attRow.id, opponent_nick: attRow.nick, ...summary } },
  ];
  // Письмо о повышении генерала убрано по прямой просьбе автора («они
  // лишние»). Сам addXp по-прежнему возвращает новый уровень — значение
  // просто больше не превращается в почту.
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
  // Фаза 27 — round ДО этого куска: 0 у самого первого куска (реального
  // урона ещё не было ни разу, войска "в строю") — клиент по этому флагу
  // подписывает надземную метку боя "Развёртывание" вместо "Бой — раунд N"
  // на всё время первого reveal-окна (см. mpBattleInterp/updateBattleLabels
  // в index.html/main.ts).
  state.revealFromRound = state.round;
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
  if (!state.log) state.log = []; // защита от боёв, заведённых до этого деплоя

  const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), defS = sideStats(defU, defP.race, defB, defBroken, defRisen);
  if (attS.totalN > 0 && defS.totalN > 0) {
    state.round++;
    const genAliveAtt = !!(attGen && attGen.hp > 0);
    const beforeAttN = unitsTotal(attU);
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
    if (genAliveAtt && attGen.hp <= 0) pushLog(state, "general", "Атакующие: полководец пал и больше не ведёт войско.", "def");
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
    const fellRetreat = beforeAttN - unitsTotal(attU);
    if (fellRetreat > 0) pushLog(state, "rout", "Обороняющиеся бьют вслед отступающим — пало " + fellRetreat + ".", "def");
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
  // Фаза 27 — round ДО этого куска: 0 у самого первого куска (реального
  // урона ещё не было ни разу, войска "в строю") — клиент по этому флагу
  // подписывает надземную метку боя "Развёртывание" вместо "Бой — раунд N"
  // на всё время первого reveal-окна (см. mpBattleInterp/updateBattleLabels
  // в index.html/main.ts).
  state.revealFromRound = state.round;
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
  if (!state.log) state.log = [];

  const attS = sideStats(attU, attP.race, attB, attBroken, attRisen), bandS = sideStats(bandU, null, BANDIT_B, bandBroken);
  if (attS.totalN > 0 && bandS.totalN > 0) {
    state.round++;
    const genAliveAtt = !!(attGen && attGen.hp > 0);
    const beforeAttN = unitsTotal(attU);
    const dmgToAtt = dmgTo(bandS, attS, 0, 0, wMod, roll());
    const attLoss = applyLosses(attU, dmgToAtt, attP.race, attB.hp, attRisen, rnd);
    attU = unitsSub(attU, attLoss.units); attLossTotal = unitsAdd(attLossTotal, attLoss.units);
    TKEYS.forEach((t) => { for (let i = 1; i <= 5; i++) attRisen[t][i] = Math.max(0, (attRisen[t][i] || 0) - (attLoss.risen[t][i] || 0)); });
    if (attGen) attGen.hp = Math.max(0, attGen.hp - damageToGeneral(attGen, bandS));
    if (genAliveAtt && attGen.hp <= 0) pushLog(state, "general", "Наш полководец пал и больше не ведёт войско.", "att");
    checkDiscipline(state.attStartUnits, attLossTotal, attP.race, attBroken);
    const fellRetreat = beforeAttN - unitsTotal(attU);
    if (fellRetreat > 0) pushLog(state, "rout", "Лагерь бьёт вслед отступающим — пало " + fellRetreat + ".", "att");
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
  // Фаза 29 — отзыв войск во время СНОСА (армия защитника уже разбита):
  // прощального залпа нет и победитель не меняется — бой давно выигран,
  // отзыв просто прекращает разбирать город и уводит орудия домой. Ветка
  // отступления ниже рассчитана на обратное (штурм не удался, поле за
  // обороной) и к этому моменту неприменима.
  if (state.retreatRequested && state.phase === "demolish" && !state.concluded) {
    state.concluded = true;
    pushLog(state, "end", "Осадные орудия отведены от стен по приказу — город недоразобран.", "att");
  } else if (state.retreatRequested && !state.concluded) {
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
  } else if (state.phase === "demolish" && !state.concluded) {
    // Фаза 29 — армия защитника разбита, идёт снос построек: свой цикл
    // раундов со своим темпом (см. runDemolishRounds), но те же
    // events(type:'battle_round') и тот же march в state:"siege".
    runDemolishRounds(state, attP, defP);
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
      // Счётчик «собрано за всё время» — здесь, а не в applyGathered: там
      // добыча только забронирована, а доехать домой обоз может и не успеть
      // (перехватят по дороге). Считаем то, что реально легло на склад.
      // Награбленное в бою и взятое у варваров сюда не идёт: это другой
      // счётчик и другая доблесть — у сбора своя таблица.
      if (m.mode === "gather") {
        let got = 0;
        RES.forEach((r) => { got += m.data.carry[r] || 0; });
        got += m.data.carry.amber || 0;
        bumpStat(p, "gathered", got);
      }
      // Янтарь — отдельное поле p.amber, не часть p.res (см. index.html:
      // 2823/4963 p.amber=(p.amber||0)+m.carryAmber) — RES.forEach выше его
      // не задевает, иначе добыча жилы молча терялась бы при возврате марша.
      if (m.data.carry.amber) p.amber = (p.amber || 0) + m.data.carry.amber;
    }
    // index.html:4950-4957 EV.home — генерал возвращается вместе с
    // отрядом независимо от того, как поход закончился (дошёл сам, был
    // отозван, или это выжившие после боя — applyMarchArrive/
    // applyRaidArrive добираются сюда обычным путём марша "back", только
    // полный ноль выживших освобождает away раньше, см. их заголовки).
    // Проверка на p.gen.away===m.id, а не просто m.data.has_gen — не
    // отобрать генерала у НОВОГО похода из-за возврата старого.
    if (m.data && m.data.has_gen && p.gen && p.gen.away === m.id) p.gen.away = null;
    await savePlayerStateOrThrow(admin, row, p);
  }
  // Отложенное донесение о сборе (см. applyGathered) — письмо приходит ровно
  // сейчас, когда отряд вошёл в замок.
  // gather_report — список донесений (по одному на каждую точку, где отряд
  // копал: между ними его могли перетащить, см. mp-redirect). Старые марши в
  // базе несут одиночный объект — принимаем оба вида.
  if (m.data && m.data.gather_report) {
    const reports = Array.isArray(m.data.gather_report) ? m.data.gather_report : [m.data.gather_report];
    if (reports.length) {
      const { error: gatherMailErr } = await admin.from("mail").insert(
        reports.map((r) => ({ world_id: m.world_id, player_id: m.player_id, kind: "gather", data: r })),
      );
      if (gatherMailErr) throw gatherMailErr;
    }
  }
  await admin.from("marches").delete().eq("id", m.id);
}

// Фаза 8, кусочек 1 — отряд дошёл до точки сбора: начинается отдельный
// отсчёт сбора (gather_secs посчитан заранее в mp-gather, на отправке —
// зависит от бонусов игрока на тот момент, тот же принцип "снимок при
// отправке", что и у dist/spd для дороги). Зеркало перехода
// m.state="gather" в arriveMarch (index.html:5030-5031).
// Списать с точки выкопанное. amount — сколько отряд забирает; на точке могло
// остаться меньше (её копали другие, пока этот шёл), поэтому берём минимум и
// возвращаем фактическое. Вызывается из трёх мест, и все три — момент, когда
// добыча реально переходит к отряду: конец сбора (applyGathered) и досрочный
// уход со сбора (mp-redirect/mp-recall делают это у себя тем же способом).
async function takeFromNode(admin, m, amount) {
  const want = Math.max(0, Math.floor(amount || 0));
  const cellX = m.data && m.data.cell_x, cellY = m.data && m.data.cell_y;
  if (!(want > 0) || cellX == null || cellY == null) return 0;
  const { data: cell } = await admin.from("map_cells")
    .select("data").eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY).maybeSingle();
  if (!cell) return 0;                       // точку успели снести — брать неоткуда
  const left = Math.max(0, (cell.data && cell.data.amount) || 0);
  const got = Math.min(want, left);
  if (got <= 0) return 0;
  await admin.from("map_cells")
    .update({ data: { ...(cell.data || {}), amount: left - got } })
    .eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY);
  return got;
}

async function applyGatherStart(admin, m) {
  const nowSec = Date.now() / 1000;
  const d = m.data || {};
  let take = Math.max(0, d.take || 0);
  let gatherSecs = Math.max(0, d.gather_secs || 0);
  // Резерва точки нет (см. разбор в mp-gather): пока отряд шёл, её могли
  // выкопать другие. Подрезаем задачу под то, что на точке ЕСТЬ на самом деле,
  // — и время копать вместе с объёмом, пропорционально. Иначе отряд честно
  // отстоял бы полный срок ради того, чего там уже нет.
  const cellX = d.cell_x, cellY = d.cell_y;
  if (take > 0 && cellX != null && cellY != null) {
    const { data: cell } = await admin.from("map_cells")
      .select("data").eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY).maybeSingle();
    const left = Math.max(0, (cell && cell.data && cell.data.amount) || 0);
    if (left < take) {
      gatherSecs = take > 0 ? gatherSecs * (left / take) : 0;
      take = left;
    }
  }
  const { error: updM } = await admin.from("marches")
    .update({ state: "gather", t0: nowSec, t1: nowSec + gatherSecs,
              data: { ...d, take, gather_secs: gatherSecs } }).eq("id", m.id);
  if (updM) throw updM;
  m.data = { ...d, take, gather_secs: gatherSecs };
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
// =============================================================================
// Торговый обоз доехал — Фаза 34.
// =============================================================================
// Груз зачисляется получателю СВЕРХ его склада, без потолка: потолок
// (plotFillCap) ограничивает НАКОПЛЕНИЕ добычи со временем, а не то, что
// принесли извне — ровно так же ведут себя возвращающиеся с добычей отряды
// (см. applyMarchHome). Иначе подарок союзника с полным складом просто
// сгорал бы молча, и игрок не понял бы, куда делись ресурсы.
//
// Получатель мог погибнуть, пока обоз был в пути. Тогда груз не зачисляем
// никому, а отправителю приходит письмо о том, что везти оказалось некуда:
// молча растворять чужие ресурсы нельзя.
async function applyTradeArrive(admin, m) {
  const d = m.data || {};
  const net = d.net || {};
  const toId = d.to_id;

  // Раньше отправитель читался только ради ника. Теперь нужен и его state:
  // в него ложится счётчик «довезено обозами» для таблицы торговли.
  const { data: fromRow, error: fErr } = await admin.from("players").select("*").eq("id", m.player_id).maybeSingle();
  if (fErr) throw fErr;

  const { data: toRow, error: tErr } = await admin.from("players").select("*").eq("id", toId).maybeSingle();
  if (tErr) throw tErr;

  const nowSec = Date.now() / 1000;
  const mailRows = [];
  if (!toRow || toRow.dead_at) {
    // Везти некуда. Отправителю — честное письмо; вернуть груз назад мы не
    // можем без второго обоза, а заводить его ради редкого случая ни к чему.
    if (fromRow) {
      mailRows.push({ world_id: m.world_id, player_id: fromRow.id, kind: "trade",
        data: { role: "sender", lost: true, to_nick: d.to_nick || "", sent: d.sent || {}, net } });
    }
  } else {
    const toP = toRow.state;
    // Начисляем добычу получателя до зачисления — иначе следующий syncRes
    // посчитал бы час производства уже от новой суммы и потолок склада
    // применился бы не к тому числу.
    syncRes(toP, nowSec);
    for (const r of RES) toP.res[r] = Math.max(0, (toP.res[r] || 0) + (net[r] || 0));
    // Тот же приём, что у applyMarchHome: пишем напрямую, без
    // savePlayerState-гонки — тик мира и так единственный писатель в этот
    // момент, а обоз ждать не может.
    const { error: upErr } = await admin.from("players")
      .update({ state: toP, updated_at: new Date().toISOString() }).eq("id", toRow.id);
    if (upErr) throw upErr;

    // Счётчик торговли — отправителю и по ДОВЕЗЁННОМУ (net), а не по
    // отправленному: налог Рынка съел часть груза ещё в дороге, и хвалиться
    // им не за что. Пропавший обоз (получатель погиб) не считается вовсе —
    // ветка выше сюда не заходит.
    if (fromRow && fromRow.state) {
      let delivered = 0;
      for (const r of RES) delivered += net[r] || 0;
      if (delivered > 0) {
        bumpStat(fromRow.state, "traded", delivered);
        const { error: fUpErr } = await admin.from("players")
          .update({ state: fromRow.state, updated_at: new Date().toISOString() }).eq("id", fromRow.id);
        // Счётчик таблицы — не повод ронять уже вручённый груз.
        if (fUpErr) console.error("mp-tick: счётчик торговли не записался —", fUpErr.message);
      }
    }
    mailRows.push({ world_id: m.world_id, player_id: toRow.id, kind: "trade",
      data: { role: "receiver", from_nick: d.from_nick || "", from_race: d.from_race || "",
              got: net, tax: d.tax || 0, x: (d.from && d.from.x), y: (d.from && d.from.y) } });
    if (fromRow) {
      mailRows.push({ world_id: m.world_id, player_id: fromRow.id, kind: "trade",
        data: { role: "sender", to_nick: d.to_nick || "", to_race: d.to_race || "",
                sent: d.sent || {}, net, tax: d.tax || 0, x: m.tx, y: m.ty } });
    }
  }
  if (mailRows.length) {
    const { error: mailErr } = await admin.from("mail").insert(mailRows);
    if (mailErr) throw mailErr;
  }
  // Обратная дорога — прямое указание автора («Обратная дорога конечно тоже
  // нужна») и то же, что в оригинале: возчик отвязывает телегу и едет домой,
  // а слот отряда (см. проверку busy в mp-trade) держится занятым до его
  // возвращения, а не освобождается в момент вручения груза. Иначе Рынок был
  // бы вдвое быстрее любого похода при той же цене слота.
  //
  // Обоз пустой — units:{} и никакого carry, — так что общий applyMarchHome
  // обрабатывает его прибытие ровно как любой другой возврат: воинов
  // прибавит ноль, добычи нет, генерала нет, строку марша удалит. Отдельная
  // ветка ему не нужна.
  //
  // Дорожные dist/spd лежат в data с отправки — назад той же дорогой и с той
  // же скоростью, что и туда (тот же расчёт, что у sendSurvivorsHome). from —
  // ГОРОД ПОЛУЧАТЕЛЯ: линия возврата ведётся клиентом именно по этому полю,
  // без него обоз зримо прыгнул бы домой и уже оттуда пошёл обратно.
  const dist = d.dist || 0, spd = d.spd || 1;
  const travelBack = Math.max(MIN_TRAVEL, (dist / spd) * 60);
  const home = d.from || {};
  const { error: backErr } = await admin.from("marches").update({
    state: "back", t0: nowSec, t1: nowSec + travelBack,
    tx: home.x != null ? home.x : m.tx, ty: home.y != null ? home.y : m.ty,
    // Груз с обоза снимаем: он вручён (или пропал вместе с получателем).
    // Оставить sent/net в data значило бы показывать в подсказке к иконке
    // товар, которого в телеге уже нет.
    data: { ...d, sent: {}, net: {}, delivered: true, from: { x: m.tx, y: m.ty } },
  }).eq("id", m.id);
  if (backErr) throw backErr;
  const { error: homeEvErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "march_home", data: { march_id: m.id },
  });
  if (homeEvErr) throw homeEvErr;
}
async function applyGathered(admin, ev) {
  const marchId = ev.data && ev.data.march_id;
  if (marchId == null) return;
  const { data: m, error: mErr } = await admin.from("marches").select("*").eq("id", marchId).maybeSingle();
  if (mErr) throw mErr;
  if (!m || m.state !== "gather") return; // уже разобрано/отозвано

  const nowSec = Date.now() / 1000;
  const dist = (m.data && m.data.dist) || 0, spd = (m.data && m.data.spd) || 1;
  const travelBack = Math.max(MIN_TRAVEL, (dist / spd) * 60);
  // Складываем с тем, что отряд УЖЕ везёт, а не присваиваем заново: на эту
  // точку он мог попасть перетаскиванием (mp-redirect), уже неся добычу с
  // предыдущей — присвоение стирало её начисто.
  const carry = { ...((m.data && m.data.carry) || {}) };
  if (m.data && m.data.res) {
    const key = m.data.res === "amber" ? "amber" : m.data.res;
    carry[key] = (carry[key] || 0) + (m.data.take || 0);
  }
  // НАЙДЕН реальный баг: gatherReport объявлялся здесь как null, записывался
  // в марш вот этим самым update — и ТОЛЬКО ПОТОМ, ниже по функции, ему
  // присваивалось настоящее донесение. В базу всегда уходил null, второй
  // записи не было, и applyMarchHome отправлять было нечего: письма о сборе
  // в общем мире не приходили вовсе. Считаем ДО записи.
  //
  // Накапливаем списком: отряд мог собрать на одной точке, быть перетащенным
  // на другую (mp-redirect) и дособрать там — донесение должно прийти на
  // каждую, а не только на последнюю.
  const reports = Array.isArray(m.data && m.data.gather_report)
    ? m.data.gather_report.slice()
    : ((m.data && m.data.gather_report) ? [m.data.gather_report] : []);
  if (m.data && m.data.res && (m.data.take || 0) > 0) {
    reports.push({ res: m.data.res, amount: m.data.take, x: m.tx, y: m.ty });
  }
  const gatherReport = reports.length ? reports : null;
  // Вот здесь и списывается ресурс с точки — в момент, когда отряд ДОКОПАЛ, и
  // ровно столько, сколько к этой секунде на точке осталось. Резерва на
  // отправке больше нет (см. разбор в mp-gather), поэтому цифра на карте
  // всегда настоящая, а спор за точку решают ноги и войско, а не очередь
  // нажатий.
  await takeFromNode(admin, m, (m.data && m.data.take) || 0);
  const { error: updM } = await admin.from("marches")
    // from — точка, с которой обоз уходит домой. Обязательно ПЕРЕЗАПИСАТЬ:
    // на сбор отряд мог попасть перетаскиванием (mp-redirect ставит там
    // mode:"gather" и своё from), и старое значение увело бы обратный путь
    // от места, где отряда давно нет.
    .update({ state: "back", t0: nowSec, t1: nowSec + travelBack,
              data: { ...m.data, carry, gather_report: gatherReport, from: { x: m.tx, y: m.ty } } }).eq("id", m.id);
  if (updM) throw updM;
  // Донесение о сборе — зеркало pushMail({cat:"report",kind:"gather",...})
  // в EV.gathered одиночки (index.html) — автор сообщил: «я собрал
  // ресурсы, а письма нет». Ресурсы честно зачисляются позже, в
  // applyMarchHome (m.data.carry), но письмо об этом никогда не заводилось
  // — целая ветка была пропущена при переносе. kind:"gather", отдельная от
  // "battle"/"scout"/... — свой fetch (mpRefreshGatherMail) и своя рубрика
  // в index.html (foMultiplayer, "Сбор").
  // Донесение о сборе тут НЕ отправляется. Автор: «отряд со сбора вернулся —
  // письмо получил как только они в замок зашли». Раньше письмо уходило
  // ровно здесь — сбор на точке закончен, а отряду идти домой ещё всю
  // дорогу; со стороны это и выглядело как «письмо приходит через время
  // после сбора». Складываем донесение в данные марша (см. reports выше),
  // отдаёт его applyMarchHome по прибытии.
  const { error: evErr } = await admin.from("events").insert({
    world_id: m.world_id, fire_at: new Date((nowSec + travelBack) * 1000).toISOString(),
    type: "march_home", data: { march_id: m.id },
  });
  if (evErr) throw evErr;

  // Фаза 8, кусочек 3 — точка истощена (amount доведён до нуля списанием
  // выше, takeFromNode) — сносим клетку и заводим respawn, зеркало
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

  // Фаза 26 — занявший точку сам НЕ переходит в state:"siege" (его отсчёт
  // сбора не прерывается, см. finalizeNodeBattle), поэтому без этой метки
  // он был бы вообще не в курсе боя за собственную точку, кроме как из
  // почты. contestedBy — id марша-атакующего, чтобы клиент оккупанта знал,
  // чей data.battle подтягивать для своей же полоски (см. mpActiveSiegeIds/
  // mpBattleFastPollTick в index.html) — очищается в finalizeNodeBattle.
  const { error: occMarkErr } = await admin.from("marches")
    .update({ data: { ...occ.data, contestedBy: m.id } }).eq("id", occ.id);
  if (occMarkErr) throw occMarkErr;

  // wallLv/garrisonLv=0 — в чистом поле укреплений нет ни у кого, тот же
  // движок, что и у PvP-штурма (initPvpBattle/runPvpBattleRounds), просто
  // без городских бонусов защитника. occMarchId/occPlayerId — чем
  // applyNodeBattleRound/finalizeNodeBattle опознают чужой марш при
  // продолжении (в отличие от PvP, тут "защитник" — не m.data.defender_id,
  // а конкретный марш occ, домашняя строка игрока для боя не более важна,
  // чем у атакующего).
  // Бой за точку — полевой PvP, общая базовая ставка обеим сторонам без
  // перекоса (BATTLE_DEATH_FRAC), в отличие от осады города.
  const state = initPvpBattle(m.units, attP, occ.units, occP, 0, 0, m.id, attHasGen, BATTLE_DEATH_FRAC, BATTLE_DEATH_FRAC);
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

// Честный конец боя за точку. Бой решает ТОЛЬКО право сбора —
// hospital-режим обеим сторонам (та же единая система, что теперь и везде
// остальном, Фаза 28), без грабежа склада (тут нечего грабить, точка — не
// чей-то город). Победитель
// остаётся собирать (его марш продолжает уже идущий отсчёт, если он и был
// оккупантом, либо стартует новый — если атакующий отбил точку), проигравший
// уходит домой с тем, что уцелело.
async function finalizeNodeBattle(admin, m, attRow, occRow, occMarch, attP, occP, state, nowSec) {
  // Снимок ДО единого изменения — на случай отката, см. saveBothPlayersOrThrow.
  const attSnapshot = snapshotState(attP);
  attRow.__powerBefore = attRow.power || 0;
  occRow.__powerBefore = occRow.power || 0;
  if (!attP.wounded) attP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!attP.wounded[t]) attP.wounded[t] = {}; });
  if (!occP.wounded) occP.wounded = { inf: {}, arc: {}, cav: {}, sie: {} };
  TKEYS.forEach((t) => { if (!occP.wounded[t]) occP.wounded[t] = {}; });

  // WIN_DEATH_MULT/LOSE_DEATH_MULT — как и в finalizePvpBattle, исход уже
  // известен (state.winner).
  const attHs = hospitalSplit(attP, state.attLossTotal, state.attDeathFrac * (state.winner === "att" ? WIN_DEATH_MULT : LOSE_DEATH_MULT), state.attBroken);
  attP.troops = unitsAdd(attP.troops, attHs.slightUnits);
  attP.wounded = unitsAdd(attP.wounded, attHs.hurtUnits);
  const occHs = hospitalSplit(occP, state.defLossTotal, state.defDeathFrac * (state.winner === "def" ? WIN_DEATH_MULT : LOSE_DEATH_MULT), state.defBroken);
  occP.troops = unitsAdd(occP.troops, occHs.slightUnits);
  occP.wounded = unitsAdd(occP.wounded, occHs.hurtUnits);

  const attSurvivors = unitsSub(state.attStartUnits, state.attLossTotal);
  const occSurvivors = unitsSub(state.defStartUnits, state.defLossTotal);

  if (state.attHasGen && unitsTotal(attSurvivors) <= 0 && attP.gen && attP.gen.away === m.id) attP.gen.away = null;
  if (state.defHasGen && unitsTotal(occSurvivors) <= 0 && occP.gen && occP.gen.away === occMarch.id) occP.gen.away = null;

  // Бой за точку сбора — тоже правитель против правителя, и рейтинг за него
  // идёт по тем же правилам, что и за осаду.
  const rat = await computeBattleRating(admin, attRow, occRow, state, nowSec * 1000);
  await saveBothPlayersOrThrow(admin, attRow, attP, attSnapshot, occRow, occP);
  await logRatingEvent(admin, m, attRow, occRow, state, rat, "node");

  const summary = {
    winner: state.winner, sent: state.attStartUnits, attLoss: state.attLossTotal, defLoss: state.defLossTotal,
    attHpLeft: state.attHpLeft, defHpLeft: state.defHpLeft,
    rating: ratingMailPart(rat),
    attDead: attHs.dead, attHurt: attHs.hurt, attSlight: attHs.slight,
    defDead: occHs.dead, defHurt: occHs.hurt, defSlight: occHs.slight,
    // Те же поля, что и в finalizePvpBattle, для battleOutcomeTier на клиенте.
    attStart: state.attStartN, defStart: unitsTotal(state.defStartUnits),
    attPower: state.attStartPower, defPower: state.defStartPower,
    rounds: state.round, weather: state.weather.id, weatherName: state.weather.name,
    retreated: !!state.retreated, res: (m.data && m.data.res) || null,
    nodeX: m.tx, nodeY: m.ty, // "место боя" в письме — координаты самой точки сбора
    // Тот же полный разбор, что и у finalizePvpBattle (см. её заголовок) —
    // бой за точку идёт через тот же initPvpBattle/runPvpBattleRounds
    // (только defWallLv/defGarrisonLv=0, в поле укреплений нет), поэтому
    // state.log уже накоплен тем же самым кодом, просто раньше никто из
    // finalize-функций его не читал и не клал в письмо.
    attRace: attRow.race, defRace: occRow.race,
    attCoords: { x: attRow.x, y: attRow.y }, defCoords: { x: occRow.x, y: occRow.y },
    attGen: state.attHasGen && attP.gen && attP.gen.id != null ? { id: attP.gen.id, lv: attP.gen.lv, tal: attP.gen.tal || {} } : null,
    // state.defHasGen (не occP.gen.away==null, как у finalizePvpBattle/
    // finalizeRaidBattle выше) — оккупант точки сам маршем, свой away у
    // occP.gen может стоять на СВОЙ ЖЕ occMarch, applyRaidArrive-style
    // "away==null" здесь ничего не значил бы; defHasGen — явный флаг с
    // самой завязки боя (см. её вызов выше: state.defHasGen = occHasGen).
    defGen: (state.defHasGen && occP.gen && occP.gen.id != null) ? { id: occP.gen.id, lv: occP.gen.lv, tal: occP.gen.tal || {} } : null,
    attBuffs: battleBuffSnapshotMp(bonuses(attP)), defBuffs: battleBuffSnapshotMp(bonuses(occP, true)),
    log: state.log || [],
  };
  const mailRows = [
    { world_id: m.world_id, player_id: attRow.id, kind: "node_battle", data: { role: "attacker", opponent_id: occRow.id, opponent_nick: occRow.nick, ...summary } },
    { world_id: m.world_id, player_id: occRow.id, kind: "node_battle", data: { role: "defender", opponent_id: attRow.id, opponent_nick: attRow.nick, ...summary } },
  ];
  const { error: mailErr } = await admin.from("mail").insert(mailRows);
  if (mailErr) throw mailErr;

  // Марш-оккупант в любом исходе теряет только то, что реально полегло в
  // этом бою (occSurvivors) — его units обновляем в базе всегда, отдельно
  // от того, кто победил. contestedBy (Фаза 26) снимаем здесь же — бой
  // решён, метка выполнила свою роль (если winner==="att", строка вообще
  // сейчас уедет домой через sendSurvivorsHome ниже и там же честно
  // подчистится своя data, но contestedBy лучше снять уже тут, а не
  // полагаться на побочный эффект другого вызова).
  const { contestedBy, ...occCleanData } = occMarch.data || {};
  const { error: updOccM } = await admin.from("marches").update({ units: occSurvivors, data: occCleanData }).eq("id", occMarch.id);
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
// города): лёгкие потери (hospitalSplit — единая система, см. Фазу 28)
// сразу возвращаются в строй/лазарет, а домой физически марширует остаток,
// который вообще не пострадал (unitsSub(m.units, attLoss) — attLoss уже разложен
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
  // Крепость региона (regfort) — такая же цель набега, как лагерь; но только
  // пока в ней варвары: разорённую или взятую союзом штурмовать нечем, и
  // отряд разворачивается пустым, как на истощённую точку.
  const cellIsRaidable = cell && (cell.t === "camp" || cell.t === "fort" ||
    (cell.t === "regfort" && (cell.data && cell.data.state) === "barb"));
  if (!cellIsRaidable) {
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
  const hs = hospitalSplit(attP, state.attLossTotal);
  attP.troops = unitsAdd(attP.troops, hs.slightUnits);
  attP.wounded = unitsAdd(attP.wounded, hs.hurtUnits);
  const survivors = unitsSub(state.attStartUnits, state.attLossTotal);

  const cellX = m.data && m.data.cell_x, cellY = m.data && m.data.cell_y;
  const campLv = (m.data && m.data.camp_lv) || 1;
  let carry = {}, tomeDrops = {}, genLeveledTo = null;
  if (state.winner === "att") {
    // Счётчик «взято лагерей и крепостей варваров» — таблица для тех, кто
    // воюет не с игроками. Считается только победа: подошёл и отступил — не
    // взял.
    bumpStat(attP, "camps", 1);
    carry = banditLoot(campLv);
    genLeveledTo = addXp(attP, BANDIT_XP[Math.max(1, Math.min(25, campLv)) - 1]); // Фаза 10, кусочек 1 (25 = CFG.MAX_LEVEL, см. BANDIT_TROOPS выше)
    // index.html:5074-5077 — книги опыта СВЕРХ обычного addXp выше.
    tomeDrops = bookDrop(campLv * 100);
    if (!attP.tomes) attP.tomes = {};
    for (const v in tomeDrops) attP.tomes[v] = (attP.tomes[v] || 0) + tomeDrops[v];
  }

  // index.html:4950-4957 — та же логика, что и в applyMarchArrive выше
  // (см. её заголовок): если весь отряд полёг, домашнего пути и
  // applyMarchHome не будет, освобождаем away прямо здесь.
  if (state.attHasGen && unitsTotal(survivors) <= 0 && attP.gen && attP.gen.away === m.id) attP.gen.away = null;
  // Запись игрока поднята в НАЧАЛО списка изменений (раньше стояла в самом
  // конце, после удаления лагеря, события его возрождения и письма). Причина
  // — проверка версии в savePlayerState: при проигранной гонке эта функция
  // бросает, событие не помечается обработанным и разбирается заново через
  // минуту (см. аренду claimed_at в главном цикле). Если бы до броска уже
  // успели удалиться клетка лагеря и уйти письмо, повтор либо задвоил бы
  // письмо, либо не нашёл бы лагерь и потерял результат боя целиком. Теперь
  // первым делом пишется игрок: не записалось — не сделано ничего.
  await savePlayerStateOrThrow(admin, attRow, attP);

  if (state.winner === "att") {
    if (m.data && m.data.regfort) {
      // Крепость региона клетку НЕ освобождает: место у неё одно на всю
      // область и сдвинуться никуда не может (см. миграцию 0013). Взятая
      // крепость варваров становится РАЗОРЁННОЙ — место под крепость союза, —
      // и с этой минуты идут двенадцать часов, после которых варвары
      // возвращаются, если союз ничего не построил (условие автора).
      const razedAt = new Date(nowSec * 1000).toISOString();
      const { data: fresh } = await admin.from("map_cells").select("data")
        .eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY).maybeSingle();
      const nextData = Object.assign({}, (fresh && fresh.data) || {},
        { state: "razed", alliance_id: null, razed_at: razedAt });
      await admin.from("map_cells").update({ data: nextData, updated_at: razedAt })
        .eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY);
      await admin.from("events").insert({
        world_id: m.world_id, fire_at: new Date((nowSec + REGFORT_RESPAWN_SEC) * 1000).toISOString(),
        type: "regfort_respawn", data: { x: cellX, y: cellY, razed_at: razedAt },
      });
    } else {
      await admin.from("map_cells").delete().eq("world_id", m.world_id).eq("x", cellX).eq("y", cellY);
      // Фаза 8, кусочек 3 — зеркало mapDelete+schedule(CFG.RESPAWN_CAMP,
      // "respawn",...) из index.html (arriveMarch, camp/fort-ветка,
      // index.html:5151-5152).
      await admin.from("events").insert({
        world_id: m.world_id, fire_at: new Date((nowSec + CAMP_RESPAWN_SEC) * 1000).toISOString(),
        type: "camp_respawn", data: { x: cellX, y: cellY },
      });
    }
  }

  const raidMailRows = [{
    world_id: m.world_id, player_id: attRow.id, kind: "raid",
    data: {
      camp_lv: campLv, win: state.winner === "att", loot: carry, tomes: tomeDrops,
      attLoss: state.attLossTotal, dead: hs.dead, hurt: hs.hurt, slight: hs.slight, rounds: state.round,
      // attStart/attPower/campPower — для battleOutcomeTier на клиенте
      // (index.html): PvE, deathFrac всегда 0, но исход всё ещё бывает
      // "героическим" (лагерь заметно сильнее) или "пирровым" (дорогой ценой).
      attStart: state.attStartN, attPower: state.attStartPower, campPower: state.defStartPower,
      retreated: !!state.retreated, // Фаза 21 — честное отступление кнопкой, не обычное поражение (см. mp-recall)
      campX: cellX, campY: cellY, // "разбит лагерь... у X.. Y.." в письме, index.html mailDetailHtml
      // Погода/хроника (index.html mailDetailHtml, kind:"barbarian") — см.
      // заголовок pushLog у initRaidBattle/runRaidBattleRounds выше, раньше
      // письмо о рейде несло только итоговые числа, без единой строки о
      // том, как шёл бой.
      weather: state.weather.id, weatherName: state.weather.name, log: state.log || [],
    },
  }];
  // См. тот же отказ от письма о повышении генерала выше (PvP).
  const { error: mailErr } = await admin.from("mail").insert(raidMailRows);
  if (mailErr) throw mailErr;

  await sendSurvivorsHome(admin, m, nowSec, survivors, carry);
}
