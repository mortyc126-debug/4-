-- =============================================================================
-- Фаза 2 (сервер сам считает время) — «Четыре Знамени»
-- =============================================================================
-- Что это: pg_cron раз в минуту сам, без единого открытого браузера, дёргает
-- Edge Function mp-tick, которая разбирает наступившие события из таблицы
-- events (сейчас — только type:"train", зеркало EV.train в index.html, см.
-- supabase/functions/mp-tick/index.js). Ничего из Фазы 1 не меняется.
--
-- ПЕРЕД тем как выполнять этот SQL, нужно (руками, из дашборда — у сессии,
-- что готовила эти файлы, нет доступа к проекту, только выложенный код):
--   1. Задеплоить три функции (supabase/functions/mp-join, mp-train,
--      mp-tick) — Dashboard → Edge Functions → Create/Deploy, вставить код
--      каждой папки как отдельную функцию с тем же именем (mp-join и т.д.),
--      либо через Supabase CLI (`supabase functions deploy mp-join` и т.д.)
--      с компьютера, где CLI есть.
--   2. Задать секрет для тикера: Dashboard → Edge Functions → mp-tick →
--      Settings/Secrets (или Project Settings → Edge Functions → Secrets,
--      он общий на все функции) → добавить MP_TICK_SECRET = любая случайная
--      строка (например, сгенерировать `openssl rand -hex 20`). Это не
--      пароль пользователя — просто чтобы тикер не дёргал кто попало.
--   3. Ниже — тот же самый секрет надо вставить в SQL вместо
--      REPLACE_WITH_SECRET, и свой project ref вместо xzuwqgpwzlmpglnuijio,
--      если он другой (он уже указан правильно, см. index.html:5982,
--      SUPABASE_URL) — после этого вставить весь файл в SQL Editor → Run.
--
-- pg_net — расширение для HTTP-запросов ИЗ Postgres (нужно, чтобы cron.
-- schedule мог дозвониться до Edge Function по обычному HTTPS).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Убираем прошлую версию задания, если накатывали раньше (SQL идемпотентен).
select cron.unschedule(jobid) from cron.job where jobname = 'mp-tick-every-minute';

select cron.schedule(
  'mp-tick-every-minute',
  '* * * * *', -- раз в минуту; события внутри тика могут быть с любым fire_at <= now()
  $$
  select net.http_post(
    url := 'https://xzuwqgpwzlmpglnuijio.supabase.co/functions/v1/mp-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-tick-secret', 'REPLACE_WITH_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Проверить, что задание встало: select * from cron.job;
-- Проверить историю запусков:   select * from cron.job_run_details order by start_time desc limit 20;
