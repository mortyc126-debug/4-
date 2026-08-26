-- =============================================================================
-- Фаза 43 — боевой рейтинг и звания.
-- =============================================================================
-- Правила целиком описаны в docs/RANKS.md, здесь только место под них.
--
-- Почему рейтинг колонкой, а не полем в state: по нему идут недельная десятка
-- мира и мировая таблица званий, то есть сортировка и выборка на стороне базы.
-- Индексировать jsonb ради этого незачем — ровно тот же довод, что у
-- players.power в миграции 0008.
alter table players
  add column if not exists rating           int  not null default 0,
  -- Сколько засчитанных боёв сыграно ВСЕГО (не за сезон): первые десять —
  -- калибровка, звание не показывается и рейтинг не уходит ниже нуля.
  add column if not exists rating_battles   int  not null default 0,
  -- Высший рейтинг за ТЕКУЩИЙ сезон. По нему в конце сезона выдаётся печать
  -- (см. state.seals) — текущий на момент смены сезона всегда занижен.
  add column if not exists rating_peak      int  not null default 0,
  -- Ключ сезона, которому принадлежит нынешнее число ("2026-winter").
  -- Несовпадение с текущим = сезон сменился, mp-join делает мягкий пересчёт.
  add column if not exists rating_season    text not null default '',
  -- Последний ЗАСЧИТАННЫЙ РАВНЫЙ бой — от него отсчитывается затухание.
  add column if not exists rating_last_at   timestamptz;

-- Мировая таблица званий и недельная десятка: живые игроки одного мира по
-- убыванию рейтинга. Частичный по dead_at, как и players_power_idx.
create index if not exists players_rating_idx
  on players(world_id, rating desc)
  where dead_at is null;

-- =============================================================================
-- Журнал начислений.
-- =============================================================================
-- Пишется на КАЖДЫЙ бой правитель против правителя, в том числе на
-- незасчитанный (counted=false) — именно незасчитанные и интересны, когда
-- разбираешься, почему кому-то ничего не дали.
--
-- Это главная часть защиты от фарма, и она не про эвристику. Детектор нельзя
-- спроектировать до того, как появились данные; журнал гарантирует, что данные
-- будут. Плюс он же — счётчик потолка пары: сколько боёв эта пара провела за
-- последний час, считается прямо отсюда, отдельной таблицы не нужно.
create table if not exists rating_events (
  id         bigint generated always as identity primary key,
  world_id   uuid not null references worlds(id) on delete cascade,
  at         timestamptz not null default now(),
  kind       text not null,                    -- 'city' (осада) | 'node' (бой за точку)
  march_id   bigint,
  -- on delete set null, а НЕ cascade: mp-restart стирает строку павшего
  -- правителя целиком, и при cascade вместе с ним исчезал бы весь его след в
  -- журнале — то есть достаточно было бы «умереть», чтобы стереть улики.
  -- Ссылка обнуляется, строка остаётся.
  att_id     bigint references players(id) on delete set null,
  def_id     bigint references players(id) on delete set null,
  -- Ники на момент боя: после обнуления ссылок только по ним и будет видно,
  -- кто с кем воевал.
  att_nick   text not null default '',
  def_nick   text not null default '',
  winner     text not null,                    -- 'att' | 'def'
  -- Мощь ВЫШЕДШИХ В ПОЛЕ войск (видимый коэффициент) и мощь ДЕРЖАВ до боя
  -- (скрытый). Оба — чтобы потом было видно, кто чем «подкручивал».
  att_field  bigint not null default 0,
  def_field  bigint not null default 0,
  att_power  bigint not null default 0,
  def_power  bigint not null default 0,
  k_field    real not null default 0,
  k_power    real not null default 0,
  k          real not null default 0,
  att_before int not null default 0,
  def_before int not null default 0,
  att_delta  int not null default 0,
  def_delta  int not null default 0,
  counted    boolean not null default false,
  reason     text not null default '',         -- какая ветка сработала
  season     text not null default ''
);
-- Потолок пары: «сколько боёв у этих двоих за последний час».
create index if not exists rating_events_pair_idx
  on rating_events(world_id, att_id, def_id, at desc);
create index if not exists rating_events_at_idx
  on rating_events(world_id, at desc);

-- RLS: журнал служебный. Своей политики select нет НАРОЧНО — в нём лежит
-- скрытый коэффициент по мощи держав и чужая мощь, а он на то и скрытый.
-- Пишет и читает его только service_role (Edge Functions), которому RLS не
-- писан. Игроку нужное число (сколько боёв с этим соперником осталось)
-- отдаст функция, а не прямая выборка.
alter table rating_events enable row level security;
