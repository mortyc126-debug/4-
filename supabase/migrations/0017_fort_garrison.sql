-- =============================================================================
-- Фаза 56 — гарнизон крепости союза: подкрепления и оборона области.
-- =============================================================================
-- Автор: «вместимость крепости 2 миллиона... сразу по дефолту такая и по идее
-- неизменная» и, ещё раньше, про место крепости: «на эту крепость можно
-- напасть как сбором, так и одиночными войсками и разбить».
--
-- До этой миграции вместимость была числом в интерфейсе и больше ничем:
-- отправить в крепость войска было нельзя, взять её обратно — тоже. Теперь у
-- крепости есть гарнизон, и он же — то единственное, что стоит между чужим
-- сбором и захваченной областью.
--
-- Одна таблица, и та по строке на ПАРУ (крепость, игрок), а не общий мешок
-- войск. Иначе некуда было бы возвращать: гарнизон собирают многие, каждый
-- своим отрядом, и после боя каждому причитается ровно его доля уцелевших —
-- ровно та же арифметика, что и у общего сбора (см. splitSurvivorsByParts в
-- mp-tick). Общий мешок пришлось бы делить по памяти о том, кто сколько
-- принёс, — то есть по этой же таблице, только вывернутой наизнанку.
--
-- Координатами, а не ссылкой на клетку: у map_cells ключ (world_id, x, y), и
-- внешнего ключа на составной ключ без отдельного id не сделать. Клетка при
-- этом не исчезает никогда — крепость областей стоит на своём месте всегда,
-- меняется только её state.
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.

create table if not exists alliance_fort_garrison (
  world_id  uuid   not null references worlds(id) on delete cascade,
  x int not null,
  y int not null,
  player_id bigint not null references players(id) on delete cascade,
  -- Чей это гарнизон. Дублирует alliance_id клетки нарочно: когда крепость
  -- падёт и клетка станет разорённой, по строкам гарнизона всё ещё нужно
  -- будет понять, кому слать письма о павших.
  alliance_id bigint not null references alliances(id) on delete cascade,
  units jsonb not null default '{}',
  sent_at timestamptz not null default now(),
  primary key (world_id, x, y, player_id)
);
create index if not exists alliance_fort_garrison_player_idx on alliance_fort_garrison(player_id);
create index if not exists alliance_fort_garrison_ally_idx on alliance_fort_garrison(alliance_id);

-- ---------------------------------------------------------------------------
-- RLS. Гарнизон — военная тайна той же цены, что и готовящийся сбор: зная
-- состав, противник считает, хватит ли ему одного марша или нужен сбор. В
-- этой игре чужие войска узнают разведкой, а не выборкой.
--
-- Пишет сюда только mp-reinforce и mp-tick (service_role), политик на запись
-- нет.
alter table alliance_fort_garrison enable row level security;

drop policy if exists alliance_fort_garrison_select_member on alliance_fort_garrison;
create policy alliance_fort_garrison_select_member on alliance_fort_garrison for select
  using (
    alliance_id in (
      select m.alliance_id from alliance_members m
      join players p on p.id = m.player_id
      where p.auth_uid = auth.uid()
    )
  );
