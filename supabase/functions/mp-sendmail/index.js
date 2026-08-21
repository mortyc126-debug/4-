// =============================================================================
// mp-sendmail — личные письма игрок→игрок ("Новое письмо"/"Отправленные" в
// почте общего мира, index.html mpMailScreenHtml). Автор явно попросил:
// "оформи функционал, чтобы можно было отправить сообщение кому-либо по
// нику. А в отправленных это письмо и было бы" — фундамент под будущее
// (сам автор знает, что часть соседних вкладок вроде "Альянс" пока
// нефункциональны, это не баг).
//
// Тело запроса: { toNick: string, body: string }
// Ответ: { ok:true } либо { err }.
//
// Формат письма — та же таблица mail (миграция 0001), что и вся остальная
// почта: kind:"pm", РОВНО ДВЕ строки на одно письмо (тот же приём, что и у
// боевой почты — finalizePvpBattle кладёт по одной строке атакующему и
// защитнику): одна в mailbox получателя (role:"recipient"), одна — копия
// себе же, в mailbox отправителя (role:"sender", это и есть "Отправленные").
// RLS (mail_select_own) уже разрешает каждому читать СВОИ строки — ничего
// менять в политиках не нужно, INSERT всё равно идёт только отсюда
// (service-role), как и у любой другой почты.
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

// Ограничения — только чтобы одно кривое письмо (пустое/гигантское) не
// легло в базу и не сломало рендер почты; не защита от спама как такового
// (для беты этого достаточно, полноценный rate-limit — отдельная задача,
// если/когда переписка станет реально массовой).
const MAX_BODY_LEN = 2000;
const MAX_NICK_LEN = 24; // index.html #mp-nick maxlength

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
    const toNick = String(body.toNick || "").trim();
    const text = String(body.body || "").trim();
    if (!toNick) return jsonResponse({ err: "Укажите ник получателя" }, 400);
    if (toNick.length > MAX_NICK_LEN) return jsonResponse({ err: "Слишком длинный ник" }, 400);
    if (!text) return jsonResponse({ err: "Письмо не может быть пустым" }, 400);
    if (text.length > MAX_BODY_LEN) return jsonResponse({ err: "Письмо длиннее " + MAX_BODY_LEN + " символов" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: fromRow, error: fErr } = await admin
      .from("players").select("id,nick").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (fErr) return jsonResponse({ err: fErr.message }, 500);
    if (!fromRow) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);

    // Ник не гарантированно уникален (mp-join его не проверяет на дубли) —
    // честно берём первого совпавшего, без выбора "какого именно из
    // одноимённых". Регистр не важен игроку, набирающему ник по памяти.
    const { data: toRow, error: tErr } = await admin
      .from("players").select("id,nick").eq("world_id", world.id).ilike("nick", toNick).order("id").limit(1).maybeSingle();
    if (tErr) return jsonResponse({ err: tErr.message }, 500);
    if (!toRow) return jsonResponse({ err: "Игрок с таким ником не найден" }, 400);
    if (toRow.id === fromRow.id) return jsonResponse({ err: "Нельзя написать самому себе" }, 400);

    const nowIso = new Date().toISOString();
    const { error: mailErr } = await admin.from("mail").insert([
      { world_id: world.id, player_id: toRow.id, kind: "pm",
        data: { role: "recipient", from_id: fromRow.id, from_nick: fromRow.nick, to_id: toRow.id, to_nick: toRow.nick, body: text } },
      { world_id: world.id, player_id: fromRow.id, kind: "pm",
        data: { role: "sender", from_id: fromRow.id, from_nick: fromRow.nick, to_id: toRow.id, to_nick: toRow.nick, body: text } },
    ]);
    if (mailErr) return jsonResponse({ err: mailErr.message }, 500);

    return jsonResponse({ ok: true, to_nick: toRow.nick, sent_at: nowIso });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
