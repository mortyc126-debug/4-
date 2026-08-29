-- =============================================================================
-- Фаза 54 — живой чат: мировой, союзный и личный, плюс друзья.
-- =============================================================================
-- Автор: «чат перенеси в основные окна Город и Мир, снизу по центру. Маленькое
-- окошко с двумя вкладками "Глобальный" и "Альянс" (вкладка альянса только
-- если ты в альянсе). Показывает последние 3-4 строки. По клику открывается
-- полный чат отдельным окном, ники кликабельны — добавить в друзья, открыть
-- мини-профили и т.д. Мини-профиль тогда получает "Добавить в друзья" плюс
-- "Чат" и "Отправить письмо". В чате есть подразделы по правителям, чтобы
-- переключаться между разговорами».
--
-- Союзный чат уже есть (alliance_chat, миграция 0012) — эта миграция
-- добавляет две недостающие половины: общий на весь мир и личный один на
-- один, а к ним друзей, без которых кнопке «Добавить в друзья» некуда вести.
--
-- Почему чат отдельно от почты (mail), хотя личное сообщение похоже на письмо:
-- письмо — это донесение, у него заголовок, разбор и адресат-получатель; его
-- открывают по одному и хранят. Реплика — строка в разговоре, её читают
-- лентой и отвечают тут же. Свести их в одну таблицу значило бы либо
-- завалить почту болтовнёй, либо тащить в чат заголовки и «прочитано».
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.

-- ---------------------------------------------------------------------------
-- Мировой чат. Одна лента на мир — то, что автор называет «Глобальный».
--
-- Ник, метка союза и раса ЗАПИСЫВАЮТСЯ В СТРОКУ, а не берутся из players по
-- ссылке. Три довода: реплика должна пережить гибель автора (player_id тогда
-- обнулится, а строка останется — тот же приём, что в alliance_chat);
-- перечитывать полсотни ников выборкой по игрокам на каждый такт опроса
-- незачем; и метка союза — это метка НА МОМЕНТ реплики, менять её задним
-- числом при переходе игрока в другой союз было бы враньём о прошлом.
create table if not exists world_chat (
  id bigint generated always as identity primary key,
  world_id  uuid   not null references worlds(id) on delete cascade,
  player_id bigint references players(id) on delete set null,
  nick text not null default '',
  tag  text not null default '',        -- метка союза на момент реплики
  race text not null default '',
  kind text not null default 'say',     -- 'say' | 'system'
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists world_chat_idx on world_chat(world_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Личная переписка — «подразделы по правителям». Строка на реплику; разговор
-- собирается по паре (from_id, to_id) в обе стороны.
--
-- Отдельной таблицы «разговор» нет нарочно: разговор — это и есть все реплики
-- между двумя, и заводить под него строку значило бы держать пустые разговоры
-- и следить за их удалением. Список собеседников клиент складывает сам из
-- своих же реплик, одной выборкой.
--
-- read_at — прочитано ли ПОЛУЧАТЕЛЕМ. Нужен ровно для красной метки на
-- значке чата: без него пришлось бы держать «последний прочитанный id» на
-- каждого собеседника отдельной таблицей.
create table if not exists chat_dm (
  id bigint generated always as identity primary key,
  world_id  uuid   not null references worlds(id) on delete cascade,
  from_id   bigint references players(id) on delete set null,
  to_id     bigint references players(id) on delete set null,
  from_nick text not null default '',
  body      text not null,
  read_at   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_dm_to_idx   on chat_dm(to_id, created_at desc);
create index if not exists chat_dm_from_idx on chat_dm(from_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Друзья. Одна строка на ПАРУ, а не по строке на каждую сторону: дружба
-- взаимна, и две строки пришлось бы держать в согласии руками.
--
-- lo_id/hi_id — та же пара, всегда в порядке возрастания (check ниже). Это и
-- есть весь секрет: без него А→Б и Б→А были бы разными строками, и двое могли
-- бы позвать друг друга «в друзья» дважды, получив два висящих приглашения
-- вместо одной дружбы.
--
-- by_id — кто позвал. Нужен, чтобы показать позванному кнопку «Принять», а
-- позвавшему — «ждёт ответа», и чтобы принять приглашение мог только тот, кому
-- оно адресовано.
create table if not exists friends (
  lo_id bigint not null references players(id) on delete cascade,
  hi_id bigint not null references players(id) on delete cascade,
  by_id bigint not null references players(id) on delete cascade,
  state text not null default 'pending',   -- 'pending' | 'ok'
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (lo_id, hi_id),
  constraint friends_ordered check (lo_id < hi_id)
);
create index if not exists friends_hi_idx on friends(hi_id);

-- ---------------------------------------------------------------------------
-- RLS. Пишет во всё это только mp-chat (service_role), политик на запись нет.
alter table world_chat enable row level security;
alter table chat_dm    enable row level security;
alter table friends    enable row level security;

-- Мировой чат открыт всем — он для того и мировой. Это единственная лента в
-- игре, которую видно целиком без всяких условий.
drop policy if exists world_chat_select_all on world_chat;
create policy world_chat_select_all on world_chat for select using (true);

-- Личная переписка — обеим сторонам и больше никому. Ошибка здесь отдала бы
-- чужой разговор наружу так же тихо, как открытая политика союзного чата.
drop policy if exists chat_dm_select_side on chat_dm;
create policy chat_dm_select_side on chat_dm for select
  using (
    exists (
      select 1 from players p
      where p.auth_uid = auth.uid() and (p.id = chat_dm.from_id or p.id = chat_dm.to_id)
    )
  );

-- Дружба и приглашение в друзья — тоже дело двоих.
drop policy if exists friends_select_side on friends;
create policy friends_select_side on friends for select
  using (
    exists (
      select 1 from players p
      where p.auth_uid = auth.uid() and (p.id = friends.lo_id or p.id = friends.hi_id)
    )
  );
