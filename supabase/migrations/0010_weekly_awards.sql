-- =============================================================================
-- Фаза 43, продолжение — недельные награды за боевой рейтинг.
-- =============================================================================
-- Правила — docs/RANKS.md, раздел «Недельный янтарь». Коротко: раз в неделю
-- десятка мира по рейтингу получает янтарь (1000 за первое место, 100 за
-- десятое) плюс малый котёл за прирост (300/200/100). Участие — по порогу
-- (Ратуша >= 10 и не меньше трёх засчитанных боёв за эту неделю), иначе в
-- таблице вечно стояли бы одни и те же киты, а раскачанный альт приходил бы
-- за янтарём с одного боя.
--
-- Таблица нужна не ради истории, а ради ИДЕМПОТЕНТНОСТИ: pg_cron может
-- сработать дважды (повтор запроса, ручной запуск, перезапуск задания), и
-- уникальный ключ ниже — единственное, что не даст выдать награду второй раз.
create table if not exists weekly_awards (
  id         bigint generated always as identity primary key,
  world_id   uuid not null references worlds(id) on delete cascade,
  -- Ключ недели по ISO-8601: '2026-W35'. Именно ISO, а не «семь дней от
  -- запуска»: иначе сдвиг времени запуска раз за разом смещал бы границы, и
  -- одна и та же неделя могла бы оплатиться дважды под разными ключами.
  week_key   text not null,
  -- 'rating' — десятка мира, 'growth' — котёл за прирост.
  kind       text not null,
  place      int  not null,
  -- Ссылка обнуляется вместе с игроком (mp-restart стирает строку павшего),
  -- но сама запись остаётся: это летопись выплат, а не свойство игрока.
  player_id  bigint references players(id) on delete set null,
  nick       text not null default '',
  amber      int  not null default 0,
  rating     int  not null default 0,
  growth     int  not null default 0,
  created_at timestamptz not null default now()
);
-- Тот самый ключ идемпотентности: одно место одного котла одной недели одного
-- мира выдаётся ровно один раз.
create unique index if not exists weekly_awards_slot_idx
  on weekly_awards(world_id, week_key, kind, place);
create index if not exists weekly_awards_week_idx
  on weekly_awards(world_id, week_key);

alter table weekly_awards enable row level security;
-- Читать может кто угодно: список победителей недели — публичная витрина, в
-- ней нет ничего скрытого (в отличие от rating_events, где лежит скрытый
-- коэффициент по мощи держав). Писать — только service_role, ему RLS не писан.
drop policy if exists weekly_awards_select_all on weekly_awards;
create policy weekly_awards_select_all on weekly_awards for select
  using (true);

-- =============================================================================
-- Расписание.
-- =============================================================================
-- ЕЖЕДНЕВНО в 00:10 UTC, а не раз в неделю. Наград это не задваивает — их
-- держит уникальный ключ выше, а функция всегда считает ПРЕДЫДУЩУЮ ISO-неделю,
-- в какой день её ни позови. Ежедневным задание сделано ради второй его
-- работы: летописи сезона. Сезон кончается первого числа месяца, и ловить эту
-- границу раз в неделю значило бы опаздывать на срок до шести суток — за это
-- время половина мира успела бы пересчитаться, и итог сезона писался бы уже
-- по обрезанным числам.
select cron.unschedule(jobid) from cron.job where jobname = 'mp-weekly-awards';

select cron.schedule(
  'mp-weekly-awards',
  '10 0 * * *',
  $$
  select net.http_post(
    url := 'https://xzuwqgpwzlmpglnuijio.supabase.co/functions/v1/mp-weekly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tick-secret', 'REPLACE_WITH_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Проверить, что задание встало: select * from cron.job;
-- Выдать награды руками (например, если задание не сработало):
--   вызвать mp-weekly с заголовком x-tick-secret; повторный вызов безопасен —
--   уникальный ключ выше не даст выплатить второй раз.
