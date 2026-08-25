// =============================================================================
// mp-restart — Фаза 30: "Заложить новую летопись" на экране гибели.
// =============================================================================
// Правитель погиб, когда прочность его Ратуши дошла до нуля под таранами
// (см. runDemolishRounds/markRulerFallen в mp-tick). Строка players при этом
// НЕ удаляется сразу, а помечается dead_at — иначе тот, кого снесли, пока он
// был офлайн (а так бывает почти всегда: бой считает pg_cron, браузер для
// этого не нужен), при следующем заходе увидел бы чистую форму регистрации,
// как будто его партии и не было. Подробный разбор — в
// migrations/0007_ruler_death.sql.
//
// Эта функция и есть то самое отложенное стирание: игрок сам посмотрел экран
// гибели, сам нажал кнопку — и только теперь его город, войска, почта и
// походы исчезают по-настоящему. Дальше клиент зовёт обычный mp-join, тот не
// находит записи по auth_uid и заводит нового игрока с нуля, с выбора расы —
// ровно как самый первый раз.
//
// Что НЕ стирается: запись в летописи (chronicles, kind:'fall'). Прямое
// указание автора — "ник не удаляй... поставь сохранения ника в хрониках".
// Она отвязана от players.id и переживает стирание сама по себе.
//
// Что стирается каскадом самой базой (references ... on delete cascade, см.
// миграцию 0001): marches, mail. Их отдельно удалять не нужно, но походы
// павшего и так уже распущены в момент гибели.
//
// Тело запроса: {} — стереть можно только СЕБЯ и только будучи мёртвым.
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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан" }, 400);

    const { data: row, error: pErr } = await admin
      .from("players").select("id,dead_at").eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    // Записи нет вовсе — считаем, что стирать уже нечего: клиент просто
    // пойдёт в mp-join и заведёт нового игрока. Не ошибка: сюда легко
    // попасть двойным тапом по кнопке, и второй тап не должен пугать
    // человека красным текстом на экране гибели.
    if (!row) return jsonResponse({ ok: true, already: true });
    // А вот живого стирать нельзя ни при каких условиях: это была бы кнопка
    // "удалить свою партию" в одном тапе, которой никто не просил.
    if (!row.dead_at) return jsonResponse({ err: "Ваш правитель жив — начинать заново нечего" }, 400);

    const { error: delErr } = await admin.from("players").delete().eq("id", row.id);
    if (delErr) return jsonResponse({ err: delErr.message }, 500);

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});
