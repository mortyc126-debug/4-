-- =============================================================================
-- Фаза 53 — общий сбор союза.
-- =============================================================================
-- Автор: «игроки в альянсе получают кнопку "Сбор" — не путать со сбором
-- ресурсов. Этой кнопкой игрок организует сбор на цель и любой желающий из
-- участников альянса может присоединиться. Но генерал будет участвовать тот,
-- кто возглавляет сбор. Сбор можно собрать по времени 5 мин/15 мин/30 мин/
-- 6 часов... Войска игрока, что присоединяются, идут в замок игрока, что
-- организовал сбор (вместимость сбора зависит от центра альянса)».
--
-- И главное про поведение: «Сбором в отличие от одиночного марша управлять
-- нельзя. Сбор идёт до цели, там либо проигрывает, либо выигрывает, неважно,
-- как только цель достигнута, сбор рассыпается и множество отрядов союзников
-- теперь по одиночке идут обратно в свои замки».
--
-- КАК ЭТО ЛОЖИТСЯ НА УЖЕ ЕСТЬ. Выступивший сбор — это ОБЫЧНЫЙ МАРШ (таблица
-- marches) от замка созывающего, со сложенными войсками всех участников и с
-- пометкой data.rally_id. Благодаря этому весь разбор боя — раунды, погода,
-- дисциплина, стены, грабёж, письма — работает без единой правки: сбор для
-- него ничем не отличается от большого одиночного похода.
--
-- Отличается только ВОЗВРАТ, и ровно в одном месте: sendSurvivorsHome в
-- mp-tick — единственная воронка, через которую уходят домой уцелевшие ЛЮБОГО
-- исхода (победа, поражение, цель исчезла, отступление, переброс). Там сбор и
-- рассыпается на отряды по числу участников.
--
-- Эти же две таблицы держат сбор ДО выступления: пока идёт срок, войска уже
-- списаны у участников и лежат в сборе.
--
-- Как применить: Supabase Dashboard -> SQL Editor -> вставить целиком -> Run.

-- ---------------------------------------------------------------------------
-- Сам сбор.
--
-- state: 'gather' — идёт срок, можно присоединяться;
--        'march'  — выступил, дальше им управляет march_id как обычным маршем;
--        'done'   — рассыпался (или отменён до выступления).
--
-- Цель хранится координатами и видом. Вид нужен потому, что по одним и тем же
-- координатам в разное время может стоять разное: лагерь разгромят и он
-- пропадёт, крепость разорят. Проверять цель заново на выступлении всё равно
-- придётся, но знать, ЧТО собирались бить, надо и для показа в списке.
create table if not exists alliance_rallies (
  id bigint generated always as identity primary key,
  world_id    uuid   not null references worlds(id) on delete cascade,
  alliance_id bigint not null references alliances(id) on delete cascade,
  -- Созывающий. Он же ведёт: полководец в бою — ЕГО, и выступает сбор из его
  -- замка (прямое условие автора).
  leader_id   bigint not null references players(id) on delete cascade,
  tx int not null,
  ty int not null,
  target_kind text not null,            -- 'camp' | 'fort' | 'regfort' | 'city'
  target_player_id bigint references players(id) on delete set null,
  target_name text not null default '',
  -- Срок сбора: 5/15/30 минут или 6 часов, выбирает созывающий.
  gather_until timestamptz not null,
  state text not null default 'gather',
  -- Марш, которым сбор выступил. Пока не выступил — null.
  march_id bigint references marches(id) on delete set null,
  -- Вместимость на момент созыва — по Центру Альянса созывающего. Пишется
  -- сюда, а не считается каждый раз: здание могут достроить посреди сбора, и
  -- тогда потолок, под который люди уже присоединялись, поехал бы.
  cap bigint not null default 0,
  -- Идёт ли полководец созывающего. Решается при созыве, потому что войска
  -- созывающего списываются тогда же.
  has_gen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists alliance_rallies_alliance_idx
  on alliance_rallies(alliance_id) where state = 'gather';
create index if not exists alliance_rallies_march_idx on alliance_rallies(march_id);

-- ---------------------------------------------------------------------------
-- Кто сколько привёл. Пара (сбор, игрок) — ключ: присоединяются один раз,
-- добавить войск вторым заходом нельзя (иначе пришлось бы решать, что делать
-- с половиной отряда при отзыве).
--
-- units — то, что игрок отдал в сбор. По этим долям потом делятся и потери, и
-- добыча, и возврат: у кого сколько было, столько и вернётся, за вычетом его
-- доли павших.
create table if not exists alliance_rally_parts (
  rally_id  bigint not null references alliance_rallies(id) on delete cascade,
  player_id bigint not null references players(id) on delete cascade,
  units jsonb not null default '{}',
  joined_at timestamptz not null default now(),
  primary key (rally_id, player_id)
);
create index if not exists alliance_rally_parts_player_idx on alliance_rally_parts(player_id);

-- ---------------------------------------------------------------------------
-- RLS. Сбор — дело союза: видят его те, кто в этом союзе состоит. Чужому знать
-- о готовящемся сборе нельзя вовсе — это была бы разведка даром.
--
-- Пишет во всё это только mp-rally (service_role), политик на запись нет.
alter table alliance_rallies     enable row level security;
alter table alliance_rally_parts enable row level security;

drop policy if exists alliance_rallies_select_member on alliance_rallies;
create policy alliance_rallies_select_member on alliance_rallies for select
  using (
    alliance_id in (
      select m.alliance_id from alliance_members m
      join players p on p.id = m.player_id
      where p.auth_uid = auth.uid()
    )
  );

drop policy if exists alliance_rally_parts_select_member on alliance_rally_parts;
create policy alliance_rally_parts_select_member on alliance_rally_parts for select
  using (
    rally_id in (
      select r.id from alliance_rallies r
      join alliance_members m on m.alliance_id = r.alliance_id
      join players p on p.id = m.player_id
      where p.auth_uid = auth.uid()
    )
  );
