-- =============================================================================
-- Фаза 44 — таблицы мира: строительство, исследования, сбор, ратуша, торговля,
-- варвары, долголетие.
-- =============================================================================
-- Автор попросил рейтинги «чисто строительства», «чисто исследования», «сбора
-- ресурсов за всё время», «ратуши по уровню» и оставил на меня остальное.
--
-- Почему колонками, а не выборкой по jsonb: таблица мира — это ORDER BY с
-- LIMIT, то есть работа базы. Тянуть на клиент state всех игроков ради
-- сортировки нельзя даже при нынешних десятках (в state лежит весь город,
-- войска, снаряжение и почта), а индексировать jsonb ради каждого рейтинга —
-- дороже, чем держать семь чисел. Ровно тот же довод, что у players.power в
-- миграции 0008 и players.rating в 0009.
--
-- Разделение труда: НАКОПИТЕЛЬНЫЕ счётчики (сбор, торговля, варвары) считает
-- mp-tick там, где событие и происходит, и кладёт в state.stats. Мгновенные
-- (мощь построек, мощь исследований, уровень ратуши) пересчитывает mp-join на
-- каждом пятисекундном опросе — там состояние уже прочитано и вот-вот будет
-- записано, дешевле места нет. В колонки и то и другое зеркалит mp-join.
alter table players
  -- Мгновенные: пересчитываются из state целиком, историю не помнят.
  add column if not exists power_build     bigint not null default 0,
  add column if not exists power_tech      bigint not null default 0,
  add column if not exists hall_lv         int    not null default 0,
  -- Накопительные: растут и не убывают, живут в state.stats, сюда зеркалятся.
  add column if not exists gathered_total  bigint not null default 0,
  add column if not exists traded_total    bigint not null default 0,
  add column if not exists camps_taken     int    not null default 0;

-- По одному частичному индексу на таблицу мира. Частичные (dead_at is null) —
-- павшим в таблицах не место, как и в рейтинге по мощи.
create index if not exists players_build_idx    on players(world_id, power_build desc)    where dead_at is null;
create index if not exists players_tech_idx     on players(world_id, power_tech desc)     where dead_at is null;
create index if not exists players_hall_idx     on players(world_id, hall_lv desc)        where dead_at is null;
create index if not exists players_gathered_idx on players(world_id, gathered_total desc) where dead_at is null;
create index if not exists players_traded_idx   on players(world_id, traded_total desc)   where dead_at is null;
create index if not exists players_camps_idx    on players(world_id, camps_taken desc)    where dead_at is null;
-- Долголетие правления — по created_at, он есть с самой первой миграции;
-- своей колонки не нужно, нужен только порядок.
create index if not exists players_born_idx     on players(world_id, created_at asc)      where dead_at is null;
