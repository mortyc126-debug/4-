-- =============================================================================
-- Фаза 1 (фундамент общего мира) — «Четыре Знамени»
-- =============================================================================
-- Что это: таблицы, из которых потом будет читать/писать сервер (Edge
-- Functions + pg_cron), а не сам браузер напрямую. НИЧЕГО из существующего
-- однопользовательского режима (таблица saves, device_id, весь index.html)
-- эта миграция не трогает и не отключает — она только добавляет новое рядом.
-- Можно накатить прямо сейчас без риска сломать то, что уже играется.
--
-- Как применить: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- (У сессии, что писала этот файл, нет доступа к самому проекту Supabase —
-- только публичный anon-ключ, который уже лежит в index.html и не может
-- менять схему. Применить миграцию можно только руками, из дашборда.)
--
-- Идентичность игрока — anon-вход Supabase Auth (auth.users), а не сырой
-- device_id из localStorage, как раньше: тот же нулевой порог входа (не
-- нужен пароль/почта), но настоящий стабильный uid, с которым потом можно
-- будет НЕ ломая ничего добавить привязку e-mail/пароля тому же игроку
-- (upgrade anonymous → permanent, штатная фича Supabase Auth) — раньше это
-- было прямо помечено как отдельный будущий шаг (см. комментарий у
-- runOnboarding в index.html), теперь он не потребует переезда данных.
--
-- Один общий мир на все время (таблица worlds — задел на будущее, если
-- когда-нибудь понадобится несколько параллельных миров; сейчас используется
-- ровно одна строка). Формат данных внутри JSONB-полей (b/troops/wounded/
-- gen/gear/inventory/materials/tomes/ai и т.д.) — тот же самый, что уже
-- складывает newPlayer() в index.html: сервер сможет судить те же объекты
-- напрямую, без перевода в другую форму.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Миры. Одна строка = один общий мир. seed — тот же смысл, что и W.seed в
-- index.html (детерминированная генерация карты/чанков), epoch0 — точка
-- отсчёта игрового времени: игровые секунды считаются сервером как
-- extract(epoch from now()) - epoch0, то есть просто РЕАЛЬНОЕ прошедшее
-- время. Раньше клиент был вынужден "досчитывать" пропущенное время сам при
-- каждом заходе (advanceChunk/catch-up, см. index.html) — с сервером,
-- который тикает всегда, этот костыль в мультиплеере больше не нужен: время
-- само идёт, открыта вкладка или нет.
create table if not exists worlds (
  id uuid primary key default gen_random_uuid(),
  seed bigint not null,
  epoch0 timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Игроки. auth_uid — anon-uid из Supabase Auth (один игрок = один вход).
-- is_bot=true — те же ИИ-соседи, что и сейчас, только теперь общие на весь
-- мир (видны всем игрокам одинаково), а не приватные у каждого клиента.
-- x/y/race/nick — колонками (часто нужны для карты/поиска), остальное —
-- JSONB один в один со структурой newPlayer() в index.html.
create table if not exists players (
  id bigint generated always as identity primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  auth_uid uuid references auth.users(id) on delete cascade,
  is_bot boolean not null default false,
  race text not null,
  nick text not null default '',
  name text not null default '',
  x int not null,
  y int not null,
  shield_until double precision not null default 0,
  power bigint not null default 0,
  -- Экономика/армия/генерал/крафт — тот же снимок, что p.res/p.b/p.troops/
  -- p.wounded/p.gen/p.gear/p.inventory/p.materials/p.tomes/p.ai/p.tech в
  -- index.html, просто как JSONB вместо полей JS-объекта в памяти браузера.
  state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (world_id, auth_uid)
);
create index if not exists players_world_idx on players(world_id);
create index if not exists players_world_xy_idx on players(world_id, x, y);

-- ---------------------------------------------------------------------------
-- Клетки дикой карты (город — отдельно, через players.x/y; тут узлы сбора и
-- лагеря/форты разбойников — то же самое, что W.map[key(x,y)] в index.html,
-- только общее на весь мир, а не пересоздаётся заново в каждом браузере).
create table if not exists map_cells (
  world_id uuid not null references worlds(id) on delete cascade,
  x int not null,
  y int not null,
  t text not null,             -- 'node' | 'camp' | 'fort'
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (world_id, x, y)
);

-- ---------------------------------------------------------------------------
-- Походы. Тот же смысл, что объект march в W.marches (index.html): режим,
-- состояние, откуда-куда, что несёт, кто хозяин. hasGen/targetMarchId/carry/
-- путь — внутри data, как и раньше складывались доп. поля марша.
create table if not exists marches (
  id bigint generated always as identity primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  mode text not null,          -- 'gather' | 'attack' | 'scout' | 'scoutmarch'
  state text not null,         -- 'go' | 'gather' | 'siege' | 'back'
  tx int not null,
  ty int not null,
  t0 double precision not null,
  t1 double precision not null,
  units jsonb not null default '{}',
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists marches_world_idx on marches(world_id);
create index if not exists marches_player_idx on marches(player_id);

-- ---------------------------------------------------------------------------
-- Очередь событий — серверный аналог W.events/schedule()/EV{...} в
-- index.html. Тикер (pg_cron + Edge Function, Фаза 2) будет выбирать строки
-- с fire_at <= now() и processed=false, разрешать их (та же логика, что
-- сейчас в EV.arrive/gathered/scouted/home/... только на сервере, не в
-- браузере) и помечать обработанными.
create table if not exists events (
  id bigint generated always as identity primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  fire_at timestamptz not null,
  type text not null,
  data jsonb not null default '{}',
  processed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_due_idx on events(world_id, fire_at) where not processed;

-- ---------------------------------------------------------------------------
-- Почта. Тот же смысл, что W.mail в index.html (отчёты о бое/разведке/сборе).
create table if not exists mail (
  id bigint generated always as identity primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  kind text not null,
  data jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mail_player_idx on mail(player_id, read);

-- ---------------------------------------------------------------------------
-- RLS. На Фазе 1 таблицы ещё не читает и не пишет боевой клиент (это Фаза 3+
-- — сейчас только фундамент), но включаем строгие политики сразу, чтобы
-- потом не забыть и не гонять с открытыми на запись таблицами даже день.
-- Житель может ЧИТАТЬ всех игроков/карту/походы своего мира (это и есть
-- "общая видимость"), но менять — только СВОЮ строку в players и создавать
-- походы только от своего имени. Реальные проверки правил игры (хватает ли
-- ресурсов, свободен ли слот и т.д.) всё равно будут не тут, а в Edge
-- Function — RLS здесь только последний рубеж от "переписать чужой город
-- напрямую через API".
alter table players enable row level security;
alter table map_cells enable row level security;
alter table marches enable row level security;
alter table events enable row level security;
alter table mail enable row level security;

drop policy if exists players_select_world on players;
create policy players_select_world on players for select
  using (true);

drop policy if exists players_update_self on players;
create policy players_update_self on players for update
  using (auth_uid = auth.uid());

drop policy if exists map_cells_select_all on map_cells;
create policy map_cells_select_all on map_cells for select
  using (true);

drop policy if exists marches_select_all on marches;
create policy marches_select_all on marches for select
  using (true);

-- Почту видит только адресат.
drop policy if exists mail_select_own on mail;
create policy mail_select_own on mail for select
  using (player_id in (select id from players where auth_uid = auth.uid()));

drop policy if exists mail_update_own on mail;
create policy mail_update_own on mail for update
  using (player_id in (select id from players where auth_uid = auth.uid()));

-- events — служебная таблица тикера, наружу вообще не видна (только
-- service_role внутри Edge Function, у которой RLS не действует).
