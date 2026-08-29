// =============================================================================
// mp-chat — Фаза 54: мировой чат, личная переписка и друзья.
// =============================================================================
// Таблицы — supabase/migrations/0015_chat.sql, там же разобрано, почему чат
// живёт отдельно от почты и почему дружба — одна строка на пару.
//
// Одна функция на шесть операций по тому же доводу, что и mp-alliance (см. её
// шапку): все они работают с одними и теми же тремя таблицами, делят весь
// пролог, а деплой руками через дашборд делает каждый лишний файл лишним
// риском.
//
// Союзный чат сюда НЕ переехал: он уже живёт в mp-alliance (op "say") вместе
// с остальными делами союза, и переносить его значило бы трогать работающую
// функцию ради красоты.
//
// Тело запроса: { op: "...", ... }
//   say       {body}          — сказать всему миру
//   dm        {toId, body}    — сказать одному
//   dmread    {withId}        — отметить разговор прочитанным
//   friendadd {playerId}      — позвать в друзья (или принять встречное)
//   friendok  {playerId}      — принять приглашение
//   friendno  {playerId}      — отказать, отозвать или расстаться
// Ответ: { ok:true, ... } либо { err }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
function handleOptions(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  return null;
}

// Та же длина реплики, что и в союзном чате (CHAT_MAX в mp-alliance): чат
// везде один и тот же, и разные потолки в разных лентах читались бы как
// поломка.
const CHAT_MAX = 300;
// Пауза между репликами. Не ради нагрузки — ради ленты: без неё один человек
// вытесняет из «последних четырёх строк» всех остальных, а именно эти четыре
// строки и висят у всех на экране. Личной переписки это не касается: там
// собеседник один и заваливает он только себя.
const SAY_COOLDOWN_MS = 3000;
const DM_COOLDOWN_MS = 1000;

// Пара игроков в том порядке, в каком дружба лежит в базе (см. check
// friends_ordered): меньший номер первым.
function pairOf(a, b) { return a < b ? { lo: a, hi: b } : { lo: b, hi: a }; }

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
    const op = String(body.op || "");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: world } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (!world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: me } = await admin.from("players").select("id,nick,race,dead_at")
      .eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (!me) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);
    // Павший молчит. Не запрет ради запрета: его город с карты уже снят
    // (Фаза 30), и реплики от того, кого в мире нет, читались бы как призрак.
    if (me.dead_at) return jsonResponse({ err: "Правитель погиб" }, 400);

    const trimmed = () => {
      const t = String(body.body || "").trim();
      if (!t) return { err: "Пустую реплику не отправить" };
      if (t.length > CHAT_MAX) return { err: "Не длиннее " + CHAT_MAX + " знаков" };
      return { text: t };
    };

    // -----------------------------------------------------------------------
    // say — сказать всему миру
    // -----------------------------------------------------------------------
    if (op === "say") {
      const t = trimmed();
      if (t.err) return jsonResponse({ err: t.err }, 400);

      // Пауза считается по собственной последней реплике, а не по счётчику в
      // памяти: функция живёт от запроса до запроса, никакой памяти между
      // вызовами у неё нет.
      const { data: last } = await admin.from("world_chat").select("created_at")
        .eq("world_id", world.id).eq("player_id", me.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last) {
        const wait = SAY_COOLDOWN_MS - (Date.now() - Date.parse(last.created_at));
        if (wait > 0) return jsonResponse({ err: "Подождите " + Math.ceil(wait / 1000) + " с" }, 400);
      }

      // Метка союза снимается СЕЙЧАС и ложится в строку (см. заголовок
      // world_chat): реплика должна помнить, под чьим знаменем её сказали.
      let tag = "";
      const { data: mem } = await admin.from("alliance_members")
        .select("alliance_id, alliances(tag, disbanded_at)").eq("player_id", me.id).maybeSingle();
      if (mem && mem.alliances && !mem.alliances.disbanded_at) tag = mem.alliances.tag || "";

      const { error: sErr } = await admin.from("world_chat").insert({
        world_id: world.id, player_id: me.id, nick: me.nick || "", tag,
        race: me.race || "", kind: "say", body: t.text,
      });
      if (sErr) return jsonResponse({ err: sErr.message }, 500);
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------------
    // dm — сказать одному
    // -----------------------------------------------------------------------
    if (op === "dm") {
      const t = trimmed();
      if (t.err) return jsonResponse({ err: t.err }, 400);
      const toId = Number(body.toId);
      if (!Number.isFinite(toId)) return jsonResponse({ err: "Не указан собеседник" }, 400);
      if (toId === me.id) return jsonResponse({ err: "Сам с собой не переписываются" }, 400);

      const { data: to } = await admin.from("players").select("id,nick,dead_at")
        .eq("world_id", world.id).eq("id", toId).maybeSingle();
      if (!to) return jsonResponse({ err: "Такого правителя нет" }, 400);
      if (to.dead_at) return jsonResponse({ err: "Этот правитель погиб" }, 400);

      const { data: last } = await admin.from("chat_dm").select("created_at")
        .eq("from_id", me.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last) {
        const wait = DM_COOLDOWN_MS - (Date.now() - Date.parse(last.created_at));
        if (wait > 0) return jsonResponse({ err: "Слишком часто" }, 400);
      }

      const { error: dErr } = await admin.from("chat_dm").insert({
        world_id: world.id, from_id: me.id, to_id: to.id,
        from_nick: me.nick || "", body: t.text,
      });
      if (dErr) return jsonResponse({ err: dErr.message }, 500);
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------------
    // dmread — разговор открыт, метку «непрочитано» снимаем
    // -----------------------------------------------------------------------
    if (op === "dmread") {
      const withId = Number(body.withId);
      if (!Number.isFinite(withId)) return jsonResponse({ err: "Не указан собеседник" }, 400);
      // Только ВХОДЯЩИЕ от него ко мне: свои исходящие «прочитать» нельзя,
      // это метка получателя.
      const { error: rErr } = await admin.from("chat_dm")
        .update({ read_at: new Date().toISOString() })
        .eq("to_id", me.id).eq("from_id", withId).is("read_at", null);
      if (rErr) return jsonResponse({ err: rErr.message }, 500);
      return jsonResponse({ ok: true });
    }

    // -----------------------------------------------------------------------
    // Дальше — дружба. У всех трёх операций одна и та же пара.
    // -----------------------------------------------------------------------
    const otherId = Number(body.playerId);
    if (!Number.isFinite(otherId)) return jsonResponse({ err: "Не указан правитель" }, 400);
    if (otherId === me.id) return jsonResponse({ err: "С самим собой не дружат" }, 400);
    const { lo, hi } = pairOf(me.id, otherId);
    const { data: row } = await admin.from("friends").select("*")
      .eq("lo_id", lo).eq("hi_id", hi).maybeSingle();

    if (op === "friendadd") {
      const { data: other } = await admin.from("players").select("id,nick,dead_at")
        .eq("world_id", world.id).eq("id", otherId).maybeSingle();
      if (!other) return jsonResponse({ err: "Такого правителя нет" }, 400);
      if (other.dead_at) return jsonResponse({ err: "Этот правитель погиб" }, 400);
      if (row && row.state === "ok") return jsonResponse({ err: "Вы уже друзья" }, 400);
      // Встречное приглашение — не второе приглашение, а согласие: если он
      // позвал первым, «добавить в друзья» с моей стороны и есть ответ «да».
      // Без этого двое, нажавшие кнопку одновременно, застряли бы в двух
      // висящих приглашениях навсегда.
      if (row && row.state === "pending") {
        if (row.by_id === me.id) return jsonResponse({ err: "Приглашение уже отправлено" }, 400);
        const { error: aErr } = await admin.from("friends")
          .update({ state: "ok", accepted_at: new Date().toISOString() })
          .eq("lo_id", lo).eq("hi_id", hi);
        if (aErr) return jsonResponse({ err: aErr.message }, 500);
        return jsonResponse({ ok: true, state: "ok" });
      }
      const { error: iErr } = await admin.from("friends")
        .insert({ lo_id: lo, hi_id: hi, by_id: me.id, state: "pending" });
      if (iErr) return jsonResponse({ err: iErr.message }, 500);
      return jsonResponse({ ok: true, state: "pending" });
    }

    if (op === "friendok") {
      if (!row || row.state !== "pending") return jsonResponse({ err: "Приглашения нет" }, 400);
      // Принять может только позванный: иначе позвавший «принимал» бы сам за
      // двоих и заводил дружбу в одну калитку.
      if (row.by_id === me.id) return jsonResponse({ err: "Это ваше собственное приглашение" }, 400);
      const { error: aErr } = await admin.from("friends")
        .update({ state: "ok", accepted_at: new Date().toISOString() })
        .eq("lo_id", lo).eq("hi_id", hi);
      if (aErr) return jsonResponse({ err: aErr.message }, 500);
      return jsonResponse({ ok: true, state: "ok" });
    }

    // Одна кнопка на три случая: отказать позвавшему, отозвать своё
    // приглашение и расстаться с другом. Все три — просто «этой пары больше
    // нет», и разделять их значило бы плодить операции без разницы в итоге.
    if (op === "friendno") {
      if (!row) return jsonResponse({ err: "И так не в друзьях" }, 400);
      const { error: dErr } = await admin.from("friends").delete().eq("lo_id", lo).eq("hi_id", hi);
      if (dErr) return jsonResponse({ err: dErr.message }, 500);
      return jsonResponse({ ok: true, state: "none" });
    }

    return jsonResponse({ err: "Неизвестное действие чата" }, 400);
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
