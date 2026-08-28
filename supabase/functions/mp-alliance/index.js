// =============================================================================
// mp-alliance — Фаза 49: союзы. Создание, вступление, заявки, роли,
// исключение, выход, роспуск, чат.
// =============================================================================
// До этой функции альянсов в игре не было вовсе — только заглушки в
// index.html и здание «Центр Альянса», которое давало мощь и не значило
// ничего. Таблицы — supabase/migrations/0012_alliances.sql.
//
// ПОЧЕМУ ОДНА ФУНКЦИЯ НА ДЕСЯТЬ ДЕЙСТВИЙ, а не десять по образцу остальных
// mp-*. Остальные разделены потому, что это разные ДЕЙСТВИЯ ИГРЫ со своими
// правилами и своими таблицами формул (mp-build считает стройку, mp-train —
// набор). Здесь все десять операций работают с одними и теми же четырьмя
// строками (союз, состав, заявка, реплика) и делят один и тот же пролог:
// авторизация, мир, своя строка игрока, своё членство, своя роль. Десять
// файлов означали бы десять копий этого пролога (~90 строк каждая) и, что
// важнее, ДЕСЯТЬ ДЕПЛОЕВ РУКАМИ через дашборд — функции здесь выкладывает
// автор вручную (см. шапку supabase/README.md), и цена ошибки «выложил
// девять из десяти» выше, чем цена ветвления по op внутри одного файла.
// Правило самодостаточности файла при этом соблюдено полностью: ни одного
// относительного импорта.
//
// Тело запроса: { op: "...", ...аргументы }
//   create  {name, tag, motto, open}   — основать союз (нужен Центр Альянса)
//   edit    {motto, open, minPower}    — девиз и порядок приёма (заместитель+)
//   disband {}                         — распустить (только глава)
//   join    {allianceId}               — вступить (открытый) / подать заявку
//   cancel  {allianceId}               — отозвать свою заявку
//   accept  {playerId}                 — принять заявку (заместитель+)
//   reject  {playerId}                 — отклонить заявку (заместитель+)
//   leave   {}                         — выйти самому
//   kick    {playerId}                 — исключить (заместитель+, младшего)
//   role    {playerId, role}           — старшинство r5..r1 (только глава)
//   say     {body}                     — реплика в чат союза
// Ответ: { ok:true, ... } либо { err }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Вставлено буквально из ../_shared/cors.js — редактор Edge Functions в
// дашборде не подтягивает относительные импорты на общую папку (см. тот же
// комментарий во всех остальных mp-*).
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

// -----------------------------------------------------------------------------
// Правила союза
// -----------------------------------------------------------------------------
// Пять ступеней старшинства, как заведено в жанре (автор прямо сослался на
// RoK). Кодами, а не именами: имена — дело показа (см. ROLE_NAME и его
// близнеца в index.html), и переименование ступеней под свой союз, если оно
// однажды понадобится, не должно трогать хранимое.
// Числом — потому что правило везде одно: распоряжаться можно только СТРОГО
// младшим, а сравнивать «кто главнее» строками нельзя.
const ROLE_RANK = { r5: 5, r4: 4, r3: 3, r2: 2, r1: 1 };
const ROLE_NAME = { r5: "Глава", r4: "Заместитель", r3: "Старейшина", r2: "Дружинник", r1: "Новик" };
// Заместителей не больше четырёх — вакансии, а не звание по выслуге.
// Правило кода, а не схемы: «не больше N строк с таким значением» база
// выразить не умеет (см. комментарий у таблицы в миграции 0012).
const R4_SLOTS = 4;
// Распоряжаются союзом двое старших: глава — всем, заместитель — приёмом,
// исключением младших и порядком. Три нижние ступени — знак старшинства
// внутри союза, без прав: так это и устроено в жанре.
const RANK_OFFICER = ROLE_RANK.r4, RANK_LEADER = ROLE_RANK.r5;

// Вместимость союза — ТРИДЦАТЬ на всех, прямое решение автора; со зданием
// «Центр Альянса» не связана вовсе. Здание даёт вместимость подкреплений и
// общего сбора (таблицы ALLY_RALLY_CAP/ALLY_REINF_CAP в index.html) — то
// есть сколько войск союз может привести в одну точку, а не сколько в нём
// голов.
// Читается из колонки alliances.members_max, а не из этой константы: число
// одно на всех, но менять его придётся живой базе, а не деплою. Константа —
// только запасное значение, если колонки почему-то нет.
const ALLY_CAP_DEFAULT = 30;

const NAME_MIN = 3, NAME_MAX = 24;
const TAG_MIN = 2, TAG_MAX = 4;
const MOTTO_MAX = 140;
const CHAT_MAX = 300;
// Метка союза — буквы (латиница/кириллица) и цифры. Пробелы и знаки в метке
// не нужны: она стоит в квадратных скобках перед ником и должна читаться
// одним куском.
const TAG_RE = /^[0-9A-Za-zА-Яа-яЁё]+$/;
// Имя — то же самое плюс пробел и дефис (обычные «Орден Багровой Зари»,
// «Северо-Запад»). Двойных пробелов не оставляем — схлопываются при разборе.
// Апострофа и кавычек тут нарочно нет: имя союза клиент подставляет в том
// числе в атрибуты разметки, и один знак экономит целый класс ошибок.
const NAME_RE = /^[0-9A-Za-zА-Яа-яЁё \-]+$/;

// Системная реплика в чат — она же летопись союза: кто вступил, кого
// исключили, кто стал старейшиной. Пишется той же таблицей, что и разговор,
// с kind:"system" — иначе пришлось бы заводить вторую таблицу событий ради
// строчки текста, а читаются они всё равно вместе и по времени.
async function sysSay(admin, allianceId, text) {
  await admin.from("alliance_chat").insert({
    alliance_id: allianceId, player_id: null, nick: "", kind: "system", body: text,
  });
}

// Письмо участнику о том, что случилось с ним самим. В чат такое класть
// мало: исключённый чат союза уже не увидит (RLS пускает только участников),
// а распущенный союз не увидит никто. Формат — та же таблица mail (0001),
// kind:"alliance", вкладка «Альянс» в почте.
async function allianceMail(admin, worldId, playerId, title, text) {
  await admin.from("mail").insert({
    world_id: worldId, player_id: playerId, kind: "alliance",
    data: { title, body: text },
  });
}

// Пересчёт денормализованных members/power союза (см. комментарий к колонкам
// в миграции). Зовётся после каждого изменения состава. Мощь берётся из
// колонки players.power — её и так держит свежей mp-join на каждом
// пятисекундном опросе, считать заново нечего.
// Павшие (dead_at) не в счёт ни там, ни там: их города на карте уже нет.
async function recountAlliance(admin, allianceId) {
  const { data: rows } = await admin
    .from("alliance_members")
    .select("player_id, players!inner(power, dead_at)")
    .eq("alliance_id", allianceId);
  let members = 0, power = 0;
  for (const r of rows || []) {
    const pl = r.players;
    if (!pl || pl.dead_at) continue;
    members++; power += Number(pl.power || 0);
  }
  // members_max тут больше не трогается: вместимость одна на всех и живёт в
  // своей колонке со значением по умолчанию (см. миграцию 0012).
  await admin.from("alliances")
    .update({ members, power, power_at: new Date().toISOString() })
    .eq("id", allianceId);
  return { members, power };
}

// Наследование главы. Глава мог погибнуть (players.dead_at) или стереть себя
// (mp-restart удаляет строку, и членство уходит по on delete cascade) — союз
// при этом остаётся без того единственного, кто может принимать заявки и
// распускать. Молча оставить его в этом состоянии значит запереть союз
// навсегда, поэтому старшинство передаётся само: старейшина с самым долгим
// стажем, а если старейшин нет — самый давний соратник.
// Зовётся при КАЖДОМ чтении союза: дешевле одной лишней проверки на запрос,
// чем отдельная задача в pg_cron ради редкого случая (тот же довод, что у
// смены сезона в mp-join — «работа по календарю» делается там, где состояние
// и так прочитано).
async function ensureLeader(admin, alliance, members) {
  const alive = (members || []).filter((m) => m.players && !m.players.dead_at);
  if (!alive.length) return null;
  const cur = alive.find((m) => m.role === "r5");
  if (cur && alliance.leader_id === cur.player_id) return cur;
  // Кандидат: действующий глава по составу, иначе старший по роли и стажу.
  const heir = cur || alive.slice().sort((a, b) =>
    (ROLE_RANK[b.role] || 0) - (ROLE_RANK[a.role] || 0) ||
    new Date(a.joined_at) - new Date(b.joined_at))[0];
  if (!heir) return null;
  if (heir.role !== "r5") {
    await admin.from("alliance_members").update({ role: "r5" }).eq("player_id", heir.player_id);
    heir.role = "r5";
    await sysSay(admin, alliance.id, "Союз остался без главы. Старшинство принял " +
      (heir.players && heir.players.nick || "новый глава") + ".");
  }
  if (alliance.leader_id !== heir.player_id) {
    await admin.from("alliances").update({ leader_id: heir.player_id }).eq("id", alliance.id);
    alliance.leader_id = heir.player_id;
  }
  return heir;
}

// Полное чтение союза со составом — один и тот же кусок нужен девяти
// операциям из десяти.
async function loadAlliance(admin, allianceId) {
  const { data: alliance } = await admin
    .from("alliances").select("*").eq("id", allianceId).maybeSingle();
  if (!alliance || alliance.disbanded_at) return { err: "Союза больше нет" };
  const { data: members } = await admin
    .from("alliance_members")
    .select("player_id, role, joined_at, players!inner(id, nick, dead_at)")
    .eq("alliance_id", allianceId);
  await ensureLeader(admin, alliance, members || []);
  return { alliance, members: members || [] };
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
    const op = String(body.op || "");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: world, error: wErr } = await admin
      .from("worlds").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (wErr || !world) return jsonResponse({ err: "Мир ещё не создан — сначала mp-join" }, 400);

    const { data: me, error: pErr } = await admin
      .from("players").select("id,nick,power,state,dead_at")
      .eq("world_id", world.id).eq("auth_uid", user.id).maybeSingle();
    if (pErr) return jsonResponse({ err: pErr.message }, 500);
    if (!me) return jsonResponse({ err: "Игрок не найден — сначала mp-join" }, 400);
    // Павший правитель не вступает в союзы и не распоряжается ими: его города
    // на карте уже нет (см. Фазу 30). Ему остаётся экран гибели и «Начать
    // заново» — новый игрок вступит сам.
    if (me.dead_at) return jsonResponse({ err: "Правитель погиб — союзы ему уже не по делам" }, 400);

    // Своё членство — нужно почти каждой операции, читаем один раз здесь.
    const { data: myMem } = await admin
      .from("alliance_members").select("alliance_id, role, joined_at").eq("player_id", me.id).maybeSingle();
    const myRank = myMem ? (ROLE_RANK[myMem.role] || 1) : 0;

    // ---------------------------------------------------------------------
    // create — основать союз
    // ---------------------------------------------------------------------
    if (op === "create") {
      if (myMem) return jsonResponse({ err: "Вы уже состоите в союзе" }, 400);
      // Гейт по зданию — то же, что и у любого другого действия, которому
      // нужна постройка (ср. проверку Горна в mp-upgrade/mp-forge).
      const lv = (me.state && me.state.b && me.state.b.alliance) || 0;
      if (lv < 1) return jsonResponse({ err: "Нужен построенный Центр Альянса" }, 400);

      const name = String(body.name || "").trim().replace(/\s+/g, " ");
      const tag = String(body.tag || "").trim();
      const motto = String(body.motto || "").trim().slice(0, MOTTO_MAX);
      const open = body.open !== false;
      if (name.length < NAME_MIN || name.length > NAME_MAX)
        return jsonResponse({ err: "Имя союза — от " + NAME_MIN + " до " + NAME_MAX + " знаков" }, 400);
      if (!NAME_RE.test(name)) return jsonResponse({ err: "В имени союза — только буквы, цифры, пробел и дефис" }, 400);
      if (tag.length < TAG_MIN || tag.length > TAG_MAX)
        return jsonResponse({ err: "Метка — от " + TAG_MIN + " до " + TAG_MAX + " знаков" }, 400);
      if (!TAG_RE.test(tag)) return jsonResponse({ err: "В метке — только буквы и цифры" }, 400);

      const { data: made, error: cErr } = await admin.from("alliances").insert({
        world_id: world.id, name, tag, leader_id: me.id, motto, open,
        min_power: Math.max(0, Math.round(Number(body.minPower) || 0)),
        members: 1, power: Number(me.power || 0),
      }).select("*").maybeSingle();
      // Уникальные индексы по имени/метке (миграция 0012) — единственный
      // честный арбитр в гонке «двое основали одноимённый союз в один миг»:
      // проверка select-ом до вставки её бы не поймала.
      if (cErr) {
        if (String(cErr.message || "").includes("alliances_name_uniq"))
          return jsonResponse({ err: "Союз с таким именем в этом мире уже есть" }, 400);
        if (String(cErr.message || "").includes("alliances_tag_uniq"))
          return jsonResponse({ err: "Такая метка уже занята" }, 400);
        return jsonResponse({ err: cErr.message }, 500);
      }
      const { error: mErr } = await admin.from("alliance_members")
        .insert({ player_id: me.id, alliance_id: made.id, role: "r5" });
      if (mErr) {
        // Союз без единого участника — мусор; убираем за собой, чтобы имя
        // не осталось занятым несуществующим союзом.
        await admin.from("alliances").delete().eq("id", made.id);
        return jsonResponse({ err: mErr.message }, 500);
      }
      // Свои заявки в чужие союзы больше не нужны — союз уже свой.
      await admin.from("alliance_applications").delete().eq("player_id", me.id);
      await sysSay(admin, made.id, "Союз основан. Глава — " + (me.nick || "безымянный лорд") + ".");
      return jsonResponse({ ok: true, alliance_id: made.id, cap: capOf(made) });
    }

    // ---------------------------------------------------------------------
    // join — вступить в открытый союз или подать заявку в закрытый
    // ---------------------------------------------------------------------
    if (op === "join") {
      if (myMem) return jsonResponse({ err: "Вы уже состоите в союзе" }, 400);
      const allianceId = Number(body.allianceId);
      if (!Number.isFinite(allianceId)) return jsonResponse({ err: "Не указан союз" }, 400);
      const loaded = await loadAlliance(admin, allianceId);
      if (loaded.err) return jsonResponse({ err: loaded.err }, 400);
      const { alliance, members } = loaded;
      if (alliance.world_id !== world.id) return jsonResponse({ err: "Этот союз не из вашего мира" }, 400);

      if (!alliance.open) {
        const { error: aErr } = await admin.from("alliance_applications")
          .upsert({ alliance_id: allianceId, player_id: me.id }, { onConflict: "alliance_id,player_id" });
        if (aErr) return jsonResponse({ err: aErr.message }, 500);
        return jsonResponse({ ok: true, applied: true });
      }
      if (alliance.min_power && Number(me.power || 0) < Number(alliance.min_power))
        return jsonResponse({ err: "Союз принимает от " + alliance.min_power + " мощи" }, 400);

      // Место проверяется по живым участникам. Двое, нажавшие «Вступить» в
      // одну и ту же миллисекунду в союз с одним свободным местом, оба его
      // получат: считать и вставлять в одной транзакции отсюда нельзя, а
      // ограничение «не больше N строк» база выразить не умеет. Перебор при
      // этом ровно на единицу и рассасывается первым же выходом — цена
      // несоразмерна блокировке на каждое вступление.
      const cap = capOf(alliance);
      const alive = members.filter((m) => m.players && !m.players.dead_at).length;
      if (alive >= cap) return jsonResponse({ err: "В союзе нет свободных мест" }, 400);

      const { error: jErr } = await admin.from("alliance_members")
        .insert({ player_id: me.id, alliance_id: allianceId, role: "r1" });
      if (jErr) return jsonResponse({ err: jErr.message }, 500);
      await admin.from("alliance_applications").delete().eq("player_id", me.id);
      await sysSay(admin, allianceId, (me.nick || "Безымянный лорд") + " вступает в союз.");
      await recountAlliance(admin, allianceId);
      return jsonResponse({ ok: true, alliance_id: allianceId });
    }

    // ---------------------------------------------------------------------
    // cancel — отозвать свою заявку
    // ---------------------------------------------------------------------
    if (op === "cancel") {
      const allianceId = Number(body.allianceId);
      if (!Number.isFinite(allianceId)) return jsonResponse({ err: "Не указан союз" }, 400);
      await admin.from("alliance_applications").delete()
        .eq("alliance_id", allianceId).eq("player_id", me.id);
      return jsonResponse({ ok: true });
    }

    // ---------------------------------------------------------------------
    // Дальше — только для тех, кто в союзе.
    // ---------------------------------------------------------------------
    if (!myMem) return jsonResponse({ err: "Вы не состоите в союзе" }, 400);
    const loaded = await loadAlliance(admin, myMem.alliance_id);
    if (loaded.err) return jsonResponse({ err: loaded.err }, 400);
    const { alliance, members } = loaded;
    // Роль могла смениться, пока мы читали (наследование главы выше) —
    // берём её из свежесчитанного состава, а не из myMem.
    const mine = members.find((m) => m.player_id === me.id);
    const rank = mine ? (ROLE_RANK[mine.role] || 1) : myRank;

    // ---------------------------------------------------------------------
    // say — реплика в чат
    // ---------------------------------------------------------------------
    if (op === "say") {
      const text = String(body.body || "").trim();
      if (!text) return jsonResponse({ err: "Пустую реплику не отправить" }, 400);
      if (text.length > CHAT_MAX) return jsonResponse({ err: "Не длиннее " + CHAT_MAX + " знаков" }, 400);
      const { error: sErr } = await admin.from("alliance_chat").insert({
        alliance_id: alliance.id, player_id: me.id, nick: me.nick || "", kind: "say", body: text,
      });
      if (sErr) return jsonResponse({ err: sErr.message }, 500);
      return jsonResponse({ ok: true });
    }

    // ---------------------------------------------------------------------
    // leave — выйти самому
    // ---------------------------------------------------------------------
    if (op === "leave") {
      const alive = members.filter((m) => m.players && !m.players.dead_at);
      // Глава уходит только передав старшинство или распустив союз: иначе
      // ensureLeader назначил бы преемника молча, за спиной у обоих.
      if (mine && mine.role === "r5" && alive.length > 1)
        return jsonResponse({ err: "Глава не уходит просто так: передайте старшинство или распустите союз" }, 400);
      await admin.from("alliance_members").delete().eq("player_id", me.id);
      if (alive.length <= 1) {
        // Последний ЖИВОЙ ушёл — союз распускается сам, иначе в мире осталась
        // бы пустая строка с занятым именем. Строки павших участников (их
        // players.dead_at стоит, но членство ещё цело — стирает его только
        // mp-restart) уходят тем же разом: держать их незачем.
        await admin.from("alliance_members").delete().eq("alliance_id", alliance.id);
        await admin.from("alliance_applications").delete().eq("alliance_id", alliance.id);
        await admin.from("alliances")
          .update({ disbanded_at: new Date().toISOString(), members: 0, power: 0 }).eq("id", alliance.id);
        return jsonResponse({ ok: true, disbanded: true });
      }
      await sysSay(admin, alliance.id, (me.nick || "Безымянный лорд") + " покидает союз.");
      await recountAlliance(admin, alliance.id);
      return jsonResponse({ ok: true });
    }

    // ---------------------------------------------------------------------
    // edit — девиз и порядок приёма (старейшина и выше)
    // ---------------------------------------------------------------------
    if (op === "edit") {
      if (rank < RANK_OFFICER) return jsonResponse({ err: "Это дело главы и заместителей" }, 403);
      const patch = {};
      if (body.motto !== undefined) patch.motto = String(body.motto || "").trim().slice(0, MOTTO_MAX);
      if (body.open !== undefined) patch.open = !!body.open;
      if (body.minPower !== undefined) patch.min_power = Math.max(0, Math.round(Number(body.minPower) || 0));
      if (!Object.keys(patch).length) return jsonResponse({ err: "Нечего менять" }, 400);
      const { error: eErr } = await admin.from("alliances").update(patch).eq("id", alliance.id);
      if (eErr) return jsonResponse({ err: eErr.message }, 500);
      return jsonResponse({ ok: true });
    }

    // ---------------------------------------------------------------------
    // accept / reject — разбор заявок (старейшина и выше)
    // ---------------------------------------------------------------------
    if (op === "accept" || op === "reject") {
      if (rank < RANK_OFFICER) return jsonResponse({ err: "Это дело главы и заместителей" }, 403);
      const playerId = Number(body.playerId);
      if (!Number.isFinite(playerId)) return jsonResponse({ err: "Не указан правитель" }, 400);
      const { data: app } = await admin.from("alliance_applications")
        .select("player_id").eq("alliance_id", alliance.id).eq("player_id", playerId).maybeSingle();
      if (!app) return jsonResponse({ err: "Такой заявки уже нет" }, 400);
      await admin.from("alliance_applications")
        .delete().eq("alliance_id", alliance.id).eq("player_id", playerId);
      if (op === "reject") {
        await allianceMail(admin, world.id, playerId, "Отказ союза",
          "Союз «" + alliance.name + "» отклонил вашу заявку.");
        return jsonResponse({ ok: true, rejected: true });
      }
      // Пока заявка ждала, проситель мог вступить куда-то ещё, погибнуть или
      // союз мог наполниться — все три проверки именно здесь, а не при подаче.
      const { data: cand } = await admin.from("players")
        .select("id,nick,dead_at").eq("id", playerId).eq("world_id", world.id).maybeSingle();
      if (!cand || cand.dead_at) return jsonResponse({ err: "Этого правителя больше нет" }, 400);
      const { data: already } = await admin.from("alliance_members")
        .select("player_id").eq("player_id", playerId).maybeSingle();
      if (already) return jsonResponse({ err: "Он уже вступил в другой союз" }, 400);
      if (members.filter((m) => m.players && !m.players.dead_at).length >= capOf(alliance))
        return jsonResponse({ err: "В союзе нет свободных мест" }, 400);

      const { error: aErr } = await admin.from("alliance_members")
        .insert({ player_id: playerId, alliance_id: alliance.id, role: "r1" });
      if (aErr) return jsonResponse({ err: aErr.message }, 500);
      await admin.from("alliance_applications").delete().eq("player_id", playerId);
      await sysSay(admin, alliance.id, (cand.nick || "Безымянный лорд") + " принят в союз.");
      await allianceMail(admin, world.id, playerId, "Вас приняли в союз",
        "Союз «" + alliance.name + "» [" + alliance.tag + "] принял вашу заявку.");
      await recountAlliance(admin, alliance.id);
      return jsonResponse({ ok: true, accepted: true });
    }

    // ---------------------------------------------------------------------
    // kick — исключить (только строго младшего)
    // ---------------------------------------------------------------------
    if (op === "kick") {
      if (rank < RANK_OFFICER) return jsonResponse({ err: "Это дело главы и заместителей" }, 403);
      const playerId = Number(body.playerId);
      if (playerId === me.id) return jsonResponse({ err: "Себя исключать незачем — есть выход" }, 400);
      const target = members.find((m) => m.player_id === playerId);
      if (!target) return jsonResponse({ err: "Он не в вашем союзе" }, 400);
      if ((ROLE_RANK[target.role] || 1) >= rank)
        return jsonResponse({ err: "Исключить можно только младшего по старшинству" }, 403);
      await admin.from("alliance_members").delete().eq("player_id", playerId);
      const nick = (target.players && target.players.nick) || "Безымянный лорд";
      await sysSay(admin, alliance.id, nick + " исключён из союза.");
      await allianceMail(admin, world.id, playerId, "Вас исключили из союза",
        "Союз «" + alliance.name + "» [" + alliance.tag + "] больше не считает вас своим.");
      await recountAlliance(admin, alliance.id);
      return jsonResponse({ ok: true });
    }

    // ---------------------------------------------------------------------
    // role — старшинство (только глава). Назначение роли "r5" и есть передача
    // союза: прежний глава становится заместителем.
    // ---------------------------------------------------------------------
    if (op === "role") {
      if (rank < RANK_LEADER) return jsonResponse({ err: "Старшинство раздаёт только глава" }, 403);
      const playerId = Number(body.playerId);
      const role = String(body.role || "");
      if (!ROLE_RANK[role]) return jsonResponse({ err: "Неизвестная роль" }, 400);
      if (playerId === me.id) return jsonResponse({ err: "Своё старшинство меняют, передавая его другому" }, 400);
      const target = members.find((m) => m.player_id === playerId);
      if (!target) return jsonResponse({ err: "Он не в вашем союзе" }, 400);
      if (target.players && target.players.dead_at)
        return jsonResponse({ err: "Этого правителя больше нет" }, 400);
      if (target.role === role) return jsonResponse({ err: "У него уже это старшинство" }, 400);
      const nick = (target.players && target.players.nick) || "Безымянный лорд";

      if (role === "r5") {
        // Двух глав быть не может: сперва снимаем себя, потом ставим его —
        // порядок важен, иначе на миг в союзе два r5. Прежний глава становится
        // заместителем, и на него ВАКАНСИЯ НЕ ПРОВЕРЯЕТСЯ: он не назначается,
        // а освобождает своё место, и отказать тут значило бы запретить
        // передачу союза, где четыре заместителя уже набраны.
        await admin.from("alliance_members").update({ role: "r4" }).eq("player_id", me.id);
        await admin.from("alliance_members").update({ role: "r5" }).eq("player_id", playerId);
        await admin.from("alliances").update({ leader_id: playerId }).eq("id", alliance.id);
        await sysSay(admin, alliance.id, "Старшинство над союзом принял " + nick + ".");
        return jsonResponse({ ok: true, handedOver: true });
      }
      // Заместителей не больше четырёх — это вакансии, а не звание по выслуге.
      // Считаем по ЖИВЫМ и не считая самого назначаемого (он может уже быть
      // заместителем — тогда это понижение, а не занятие места).
      if (role === "r4") {
        const busy = members.filter((m) => m.role === "r4" && m.player_id !== playerId &&
                                           m.players && !m.players.dead_at).length;
        if (busy >= R4_SLOTS)
          return jsonResponse({ err: "Все " + R4_SLOTS + " мест заместителей заняты" }, 400);
      }
      await admin.from("alliance_members").update({ role }).eq("player_id", playerId);
      await sysSay(admin, alliance.id, nick + " теперь " + (ROLE_NAME[role] || role).toLowerCase() + ".");
      return jsonResponse({ ok: true });
    }

    // ---------------------------------------------------------------------
    // disband — распустить союз (только глава)
    // ---------------------------------------------------------------------
    if (op === "disband") {
      if (rank < RANK_LEADER) return jsonResponse({ err: "Распустить союз может только глава" }, 403);
      const nowIso = new Date().toISOString();
      // Письмо каждому — кроме самого главы: он и так знает, что сделал.
      // ОДНОЙ вставкой, а не по запросу на участника: в полном союзе их до
      // ста двадцати, и сто двадцать последовательных await'ов уложили бы
      // функцию в таймаут ровно на самом людном союзе.
      const letters = members.filter((m) => m.player_id !== me.id).map((m) => ({
        world_id: world.id, player_id: m.player_id, kind: "alliance",
        data: { title: "Союз распущен",
                body: "Союз «" + alliance.name + "» [" + alliance.tag + "] распущен главой." },
      }));
      if (letters.length) await admin.from("mail").insert(letters);
      await admin.from("alliance_members").delete().eq("alliance_id", alliance.id);
      await admin.from("alliance_applications").delete().eq("alliance_id", alliance.id);
      await admin.from("alliances")
        .update({ disbanded_at: nowIso, members: 0, power: 0 }).eq("id", alliance.id);
      return jsonResponse({ ok: true, disbanded: true });
    }

    return jsonResponse({ err: "Неизвестное действие союза" }, 400);
  } catch (e) {
    return jsonResponse({ err: String(e && e.message || e) }, 500);
  }
});

// Вместимость союза. С тех пор как она перестала зависеть от здания, это
// просто колонка — но функция оставлена: место, где вместимость решается,
// должно быть одно, и когда она снова станет от чего-то зависеть (событие,
// сезон, отдельный союз), менять придётся эту строку, а не три места вызова.
function capOf(alliance) {
  return (alliance && alliance.members_max) || ALLY_CAP_DEFAULT;
}
