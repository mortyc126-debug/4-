-- =============================================================================
-- Фаза 49 — альянсы: фундамент (союз, состав, роли, заявки, чат).
-- =============================================================================
-- Автор: «первым делом займёмся самым важным — Альянсами». До этой миграции
-- их в игре не было ВООБЩЕ: девять честных заглушек в index.html (экран,
-- вкладка почты, таблица мира, кнопка «Попросить помощи союза», значок в
-- меню) и здание «Центр Альянса», которое строилось и давало мощь, но не
-- значило ничего. Таблиц не было ни одной.
--
-- Пять ступеней старшинства (r5..r1), вместимость союза — тридцать на всех.
-- Здание «Центр Альянса» к числу соратников отношения не имеет: оно даёт
-- вместимость подкреплений и общего сбора (таблицы — в index.html).
--
-- Эта миграция — только состав союза. Регионы, крепости варваров и святыни
-- (worldgen/regions/SHRINES.md — утверждённый дизайн) идут следующей фазой и
-- встанут отдельными таблицами поверх этих: сначала есть кому владеть
-- регионом, потом сам регион.
--
-- Как применить: Supabase Dashboard → SQL Editor → вставить целиком → Run.
-- (См. шапку 0001 — доступа к проекту у сессии, писавшей файл, нет.)

-- ---------------------------------------------------------------------------
-- Сам союз. Живёт в мире, как и всё остальное: world_id везде, чтобы второй
-- мир (задел из 0001) не увидел чужих союзов.
--
-- disbanded_at вместо delete — по той же причине, что и players.dead_at в
-- 0007: распустить союз может глава, пока остальные офлайн, и им нужно
-- увидеть в почте «союз распущен», а не молча оказаться ни в чём. Строка
-- остаётся, состав из неё уходит.
--
-- members/power — денормализация, и она здесь по той же причине, что и
-- players.power в миграции 0008: и список союзов при вступлении, и таблица
-- мира «Альянс» — это ORDER BY с LIMIT, работа базы. Считать мощь союза
-- выборкой состава каждого значило бы тянуть на клиент всех игроков мира
-- ради сортировки двадцати строк.
--
-- Правда о составе — всегда alliance_members. Эти числа держат свежими двое:
-- mp-alliance при каждом изменении состава (там оно точно) и mp-join не чаще
-- раза в минуту на союз (там меняется мощь участников — см. power_at и
-- refreshAlliancePower). Минута отставания у показанного числа — цена того,
-- что за него не платит каждый пятисекундный опрос каждого игрока.
create table if not exists alliances (
  id bigint generated always as identity primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  name text not null,
  tag text not null,
  leader_id bigint references players(id) on delete set null,
  motto text not null default '',
  -- open=true — вступление сразу, без спроса; false — только по заявке.
  open boolean not null default true,
  -- Порог мощи для открытого вступления (0 = любой). У закрытого союза
  -- смысла не имеет: там всё равно решает старейшина.
  min_power bigint not null default 0,
  members int not null default 1,
  power bigint not null default 0,
  -- Вместимость союза — ТРИДЦАТЬ, одинаково для всех, прямое решение автора.
  -- Со зданием «Центр Альянса» она не связана: здание даёт вместимость
  -- подкреплений и общего сбора, а не число соратников.
  -- Колонкой, а не константой в коде: пока число одно на всех, но менять его
  -- (событием, сезоном, отдельным союзом) придётся живой базе, а не деплою.
  members_max int not null default 30,
  -- Герб союза — шесть чисел: форма щита, деление поля, фигура и три
  -- тинктуры. Собирается в игре из трёх лент-масок (images/heraldry/*.png,
  -- печёт tools/bake_heraldry.py), поэтому здесь ровно номера кадров, а не
  -- картинка: восемь миллионов сочетаний укладываются в одну короткую
  -- строку JSON. null — герба не выбирали, показывается общий по умолчанию.
  -- jsonb, а не шесть колонок: это одно неделимое целое, менять его по полю
  -- незачем, а поля со временем могут добавиться (второе поле фигуры и т.п.).
  emblem jsonb,
  power_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  disbanded_at timestamptz
);
create index if not exists alliances_world_idx on alliances(world_id) where disbanded_at is null;
-- Имя и метка уникальны в мире среди ЖИВЫХ союзов: распущенный освобождает
-- своё имя (иначе за год мир зарастёт занятыми именами мёртвых союзов).
-- lower() — чтобы «Орден» и «орден» не были двумя разными союзами: игрок,
-- набирающий имя по памяти, различать регистр не обязан (тот же довод, что
-- у ilike в mp-sendmail).
create unique index if not exists alliances_name_uniq
  on alliances(world_id, lower(name)) where disbanded_at is null;
create unique index if not exists alliances_tag_uniq
  on alliances(world_id, lower(tag))  where disbanded_at is null;

-- ---------------------------------------------------------------------------
-- Состав. player_id — ПЕРВИЧНЫЙ ключ, а не пара с alliance_id: один игрок
-- состоит ровно в одном союзе, и это правило лучше держать схемой, чем
-- проверкой в коде — вторую строку база просто не примет, чем бы её ни
-- пытались вставить.
--
-- role — пять ступеней, как заведено в этом жанре (автор прямо сослался на
-- RoK): 'r5' Глава, 'r4' Заместитель, 'r3' Старейшина, 'r2' Дружинник,
-- 'r1' Новик. Хранятся кодами, а не именами: имена — дело показа, и когда
-- глава сможет переименовывать ступени под свой союз (как в том же RoK),
-- менять придётся строку показа, а не всю таблицу.
--
-- Глава ровно один и совпадает с alliances.leader_id — это две записи одного
-- факта, но обе нужны: leader_id читается вместе с союзом одной строкой (для
-- списка союзов), role — вместе с составом. Заместителей не больше четырёх;
-- это правило кода (mp-alliance), а не схемы: «не больше N строк с таким
-- значением» база выразить не умеет, а триггер ради него был бы дороже.
create table if not exists alliance_members (
  player_id   bigint primary key references players(id) on delete cascade,
  alliance_id bigint not null references alliances(id) on delete cascade,
  role        text not null default 'r1',
  joined_at   timestamptz not null default now()
);
create index if not exists alliance_members_alliance_idx on alliance_members(alliance_id);

-- ---------------------------------------------------------------------------
-- Заявки в закрытый союз. Игрок может подать сразу в несколько — пара
-- (союз, игрок) и есть ключ; принятая заявка удаляется вместе с остальными
-- заявками этого игрока (вступил — остальным ждать нечего).
create table if not exists alliance_applications (
  alliance_id bigint not null references alliances(id) on delete cascade,
  player_id   bigint not null references players(id)   on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (alliance_id, player_id)
);
create index if not exists alliance_applications_player_idx on alliance_applications(player_id);

-- ---------------------------------------------------------------------------
-- Чат союза. Не почта: почта — это событие с разбором (бой, обоз, донесение),
-- а тут строка текста, которую читают все и никто не «открывает». Поэтому
-- своя таблица, а не kind в mail — иначе на каждую реплику заводилось бы по
-- строке письма на каждого участника (у почты player_id — адресат, см. 0001).
--
-- kind: 'say' — сказал игрок; 'system' — событие союза («N вступил в союз»,
-- «M исключён»). Системные пишет сам mp-alliance, они и есть летопись союза.
-- player_id обнуляется при гибели автора (on delete set null) — реплика
-- остаётся, ник в ней записан отдельным полем именно за этим.
create table if not exists alliance_chat (
  id bigint generated always as identity primary key,
  alliance_id bigint not null references alliances(id) on delete cascade,
  player_id   bigint references players(id) on delete set null,
  nick        text not null default '',
  kind        text not null default 'say',
  body        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists alliance_chat_idx on alliance_chat(alliance_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Догоняющий блок. Первая редакция этой миграции знала три роли
-- (leader/officer/member) и считала вместимость от уровня Центра Альянса;
-- автор поправил и то и другое до того, как её накатили. Блок нужен ровно на
-- случай «а вдруг всё-таки накатили»: на чистой базе он не делает ничего
-- (значений старого вида там нет), на накатанной — приводит её к нынешнему
-- виду, вместо того чтобы молча оставить союз с ролями, которых код уже не
-- знает. Повторный запуск безвреден.
update alliance_members set role = 'r5' where role = 'leader';
update alliance_members set role = 'r4' where role = 'officer';
update alliance_members set role = 'r1' where role = 'member';
alter table alliance_members alter column role set default 'r1';
alter table alliances alter column members_max set default 30;
alter table alliances add column if not exists emblem jsonb;
update alliances set members_max = 30 where members_max <> 30;

-- ---------------------------------------------------------------------------
-- RLS. Писать во все четыре таблицы может ТОЛЬКО mp-alliance (service_role,
-- на него RLS не действует) — политик на insert/update/delete здесь нет
-- вовсе, ровно как у players/marches: правила игры проверяет функция.
--
-- Читать: союзы и их состав видны всем в мире — это как раз то, ради чего
-- союз и заводят (в RoK состав альянса тоже открыт). Заявки и чат — только
-- своим: заявка это ещё не членство, а чат по определению внутренний.
alter table alliances             enable row level security;
alter table alliance_members      enable row level security;
alter table alliance_applications enable row level security;
alter table alliance_chat         enable row level security;

drop policy if exists alliances_select_all on alliances;
create policy alliances_select_all on alliances for select using (true);

drop policy if exists alliance_members_select_all on alliance_members;
create policy alliance_members_select_all on alliance_members for select using (true);

-- Свою заявку видит подавший; чужие — старейшины и глава того союза, куда
-- заявка подана (им её и разбирать).
drop policy if exists alliance_applications_select_own on alliance_applications;
create policy alliance_applications_select_own on alliance_applications for select
  using (
    player_id in (select id from players where auth_uid = auth.uid())
    or alliance_id in (
      select m.alliance_id from alliance_members m
      join players p on p.id = m.player_id
      -- Ступени r5/r4 — глава и заместитель, те, кто заявки и разбирает
      -- (см. RANK_OFFICER в mp-alliance). Три нижние ступени заявок не видят.
      where p.auth_uid = auth.uid() and m.role in ('r5','r4')
    )
  );

-- Чат — только участникам этого же союза.
drop policy if exists alliance_chat_select_member on alliance_chat;
create policy alliance_chat_select_member on alliance_chat for select
  using (
    alliance_id in (
      select m.alliance_id from alliance_members m
      join players p on p.id = m.player_id
      where p.auth_uid = auth.uid()
    )
  );
