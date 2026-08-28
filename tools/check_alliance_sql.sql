-- =============================================================================
-- Фаза 49 — проверка схемы союзов (миграция 0012) на живой базе.
-- =============================================================================
-- Что проверяется — то, что держит СХЕМА, а не код: уникальность имени и
-- метки без учёта регистра, «один игрок — один союз», освобождение имени
-- распущенным союзом, каскады при гибели правителя и, главное, ПОЛИТИКИ RLS:
-- кто какие заявки и реплики видит. Ошибка в политике не падает и не видна
-- глазом — она просто отдаёт чужой чат наружу.
--
-- Скрипт БЕЗОПАСЕН на любой базе, включая боевую: всё делается в одной
-- транзакции, которая в конце откатывается. После него в базе не остаётся
-- ничего — ни данных, ни роли. Провалившаяся проверка бросает исключение и
-- откатывает транзакцию тем же образом.
--
-- Запуск (нужен psql; в дашборде Supabase — просто вставить целиком):
--   psql "$DATABASE_URL" -f tools/check_alliance_sql.sql
--
-- Требует уже накатанных 0001 и 0012.

\set ON_ERROR_STOP on
begin;

-- Роль обычного игрока: как authenticated в Supabase. Обязательно НЕ владелец
-- таблиц — на владельца и суперпользователя RLS не действует вовсе, и
-- проверка политик, сделанная из-под postgres, всегда «проходит» впустую.
create role mp_ally_probe nologin;
grant usage on schema public to mp_ally_probe;
-- players сюда входит не для удобства: политики заявок и чата САМИ ходят в
-- players (там ищется «моя» строка по auth.uid()), и без права читать её
-- политика падала бы отказом вместо того, чтобы что-то разрешить. В Supabase
-- у роли authenticated это право есть — players_select_world из 0001 открыт
-- всем, — так что стенд повторяет боевые права, а не расширяет их.
grant select on players, alliances, alliance_members, alliance_applications, alliance_chat to mp_ally_probe;

-- Свой мир и четверо правителей с заведомо свободными uid. Идентификаторы
-- взяты gen_random_uuid() — с настоящими игроками не пересекутся.
create temp table probe (k text primary key, v text);
insert into probe values
  ('world', gen_random_uuid()::text),
  ('u_lead', gen_random_uuid()::text), ('u_mem', gen_random_uuid()::text),
  ('u_out',  gen_random_uuid()::text), ('u_app', gen_random_uuid()::text);

insert into worlds (id, seed) select (select v from probe where k='world')::uuid, 424242;
insert into auth.users (id) select v::uuid from probe where k like 'u\_%';

insert into players (world_id, auth_uid, race, nick, x, y, power)
select (select v from probe where k='world')::uuid, (select v from probe where k=u)::uuid, r, n, 0, 0, pw
from (values ('u_lead','human','ПробаГлава',1000), ('u_mem','elf','ПробаСоратник',2000),
             ('u_out','dwarf','ПробаЧужой',3000), ('u_app','undead','ПробаПроситель',4000))
     as t(u, r, n, pw);

insert into alliances (world_id, name, tag, leader_id)
select (select v from probe where k='world')::uuid, 'Проба Наш', 'ПРБ1',
       (select id from players where nick='ПробаГлава');
insert into alliances (world_id, name, tag, leader_id)
select (select v from probe where k='world')::uuid, 'Проба Чужой', 'ПРБ2',
       (select id from players where nick='ПробаЧужой');

insert into alliance_members (player_id, alliance_id, role)
select p.id, a.id, t.role from (values ('ПробаГлава','ПРБ1','leader'),
                                       ('ПробаСоратник','ПРБ1','member'),
                                       ('ПробаЧужой','ПРБ2','leader')) as t(nick, tag, role)
join players p on p.nick=t.nick join alliances a on a.tag=t.tag;

insert into alliance_applications (alliance_id, player_id)
select a.id, (select id from players where nick='ПробаПроситель') from alliances a where a.tag in ('ПРБ1','ПРБ2');

insert into alliance_chat (alliance_id, player_id, nick, body)
select a.id, p.id, p.nick, 'тайна '||a.tag
from alliances a join players p on p.nick = case a.tag when 'ПРБ1' then 'ПробаГлава' else 'ПробаЧужой' end
where a.tag in ('ПРБ1','ПРБ2');

-- ---------------------------------------------------------------------------
-- 1-3. Что держит схема сама.
-- ---------------------------------------------------------------------------
do $$
declare w uuid := (select v from probe where k='world')::uuid;
        lead_id bigint := (select id from players where nick='ПробаГлава');
        out_id  bigint := (select id from players where nick='ПробаЧужой');
        a1 bigint := (select id from alliances where tag='ПРБ1');
        a2 bigint := (select id from alliances where tag='ПРБ2');
        ok boolean;
begin
  -- Имя занято независимо от регистра.
  begin
    insert into alliances (world_id,name,tag,leader_id) values (w,'проба наш','ИНОЙ',out_id);
    raise exception 'ПРОВАЛ: одноимённый союз (другой регистр) приняли';
  exception when unique_violation then null; end;

  -- Метка занята независимо от регистра.
  begin
    insert into alliances (world_id,name,tag,leader_id) values (w,'Совсем Иной','прб1',out_id);
    raise exception 'ПРОВАЛ: занятую метку (другой регистр) приняли';
  exception when unique_violation then null; end;

  -- Один игрок — один союз: правило держит первичный ключ, а не код.
  begin
    insert into alliance_members (player_id,alliance_id,role) values (lead_id,a2,'member');
    raise exception 'ПРОВАЛ: игрока пустили во второй союз';
  exception when unique_violation then null; end;

  -- Распущенный освобождает имя и метку (индексы частичные).
  update alliances set disbanded_at=now() where id=a1;
  insert into alliances (world_id,name,tag,leader_id) values (w,'Проба Наш','ПРБ1',out_id);
  delete from alliances where name='Проба Наш' and id<>a1;
  update alliances set disbanded_at=null where id=a1;

  raise notice '1-3 ✓ имя/метка уникальны без учёта регистра, один союз на игрока, роспуск освобождает имя';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Каскады при гибели правителя (mp-restart стирает строку игрока).
-- ---------------------------------------------------------------------------
do $$
declare a2 bigint := (select id from alliances where tag='ПРБ2');
        out_id bigint := (select id from players where nick='ПробаЧужой');
        left_leader text; chat_nick text; chat_author bigint; members int;
begin
  delete from players where id=out_id;
  select coalesce(leader_id::text,'NULL') into left_leader from alliances where id=a2;
  select count(*) into members from alliance_members where alliance_id=a2;
  select nick, player_id into chat_nick, chat_author from alliance_chat where body='тайна ПРБ2';

  if left_leader <> 'NULL' then raise exception 'ПРОВАЛ: leader_id не обнулился при гибели главы (%)', left_leader; end if;
  if members <> 0 then raise exception 'ПРОВАЛ: членство погибшего осталось (% строк)', members; end if;
  -- Реплика переживает автора — ради этого ник и лежит отдельной колонкой.
  if chat_nick is distinct from 'ПробаЧужой' then raise exception 'ПРОВАЛ: ник в реплике потерян (%)', chat_nick; end if;
  if chat_author is not null then raise exception 'ПРОВАЛ: автор реплики не обнулился'; end if;

  raise notice '4 ✓ гибель главы: членство ушло, leader_id обнулён, реплика жива с ником';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Роспуск (физическое удаление строки союза) уносит всё своё.
-- ---------------------------------------------------------------------------
do $$
declare a2 bigint := (select id from alliances where tag='ПРБ2'); n int;
begin
  delete from alliances where id=a2;
  select (select count(*) from alliance_members where alliance_id=a2)
       + (select count(*) from alliance_applications where alliance_id=a2)
       + (select count(*) from alliance_chat where alliance_id=a2) into n;
  if n <> 0 then raise exception 'ПРОВАЛ: после удаления союза осталось % строк', n; end if;
  raise notice '5 ✓ удаление союза уносит состав, заявки и чат';
end $$;

-- ---------------------------------------------------------------------------
-- 6. RLS: кто что видит. Главное здесь — чат и заявки.
-- ---------------------------------------------------------------------------
-- Возвращаем чужой союз обратно: он нужен как «не мой» для проверки утечки.
-- Строку в auth.users заново НЕ заводим: связь идёт players.auth_uid ->
-- auth.users, и удаление игрока (проверка 4) её не тронуло — она на месте.
insert into alliances (world_id, name, tag, leader_id)
select (select v from probe where k='world')::uuid, 'Проба Чужой', 'ПРБ2', null;
insert into players (world_id, auth_uid, race, nick, x, y, power)
select (select v from probe where k='world')::uuid, (select v from probe where k='u_out')::uuid,
       'dwarf','ПробаЧужой',0,0,3000;
update alliances set leader_id=(select id from players where nick='ПробаЧужой') where tag='ПРБ2';
insert into alliance_members (player_id, alliance_id, role)
select (select id from players where nick='ПробаЧужой'), id, 'leader' from alliances where tag='ПРБ2';
insert into alliance_applications (alliance_id, player_id)
select id, (select id from players where nick='ПробаПроситель') from alliances where tag='ПРБ2';
insert into alliance_chat (alliance_id, player_id, nick, body)
select id, (select id from players where nick='ПробаЧужой'), 'ПробаЧужой', 'тайна ПРБ2' from alliances where tag='ПРБ2';

-- Ответы собираем ДО смены роли: сравнивать будем с тем, что увидит игрок.
create temp table probe_seen (who text, chat text, apps text);
-- Временные таблицы стенда роль игрока читает и пишет наравне: RLS на них
-- нет вовсе, но обычные права GRANT нужны и им.
grant select on probe to mp_ally_probe;
grant select, insert on probe_seen to mp_ally_probe;

set local role mp_ally_probe;

do $$
declare r record; uid text; seen_chat text; seen_apps text;
begin
  for r in select k, v from probe where k in ('u_lead','u_mem','u_out','u_app') loop
    perform set_config('request.jwt.claim.sub', r.v, true);
    select coalesce(string_agg(c.body, ', ' order by c.body), '') into seen_chat from alliance_chat c;
    select coalesce(string_agg(a.tag, ', ' order by a.tag), '') into seen_apps
      from alliance_applications ap join alliances a on a.id=ap.alliance_id;
    insert into probe_seen values (r.k, seen_chat, seen_apps);
  end loop;
end $$;

reset role;

do $$
declare chat_lead text; chat_mem text; chat_out text; chat_app text;
        apps_lead text; apps_mem text; apps_app text;
begin
  select chat, apps into chat_lead, apps_lead from probe_seen where who='u_lead';
  select chat, apps into chat_mem,  apps_mem  from probe_seen where who='u_mem';
  select chat into chat_out from probe_seen where who='u_out';
  select chat, apps into chat_app, apps_app from probe_seen where who='u_app';

  -- Чат: каждый видит РОВНО свой союз и ничего сверх.
  if chat_lead <> 'тайна ПРБ1' then raise exception 'ПРОВАЛ: глава видит в чате «%», ждали только свой союз', chat_lead; end if;
  if chat_mem  <> 'тайна ПРБ1' then raise exception 'ПРОВАЛ: соратник видит в чате «%»', chat_mem; end if;
  if chat_out  <> 'тайна ПРБ2' then raise exception 'ПРОВАЛ: чужой видит в чате «%»', chat_out; end if;
  if chat_app  <> ''           then raise exception 'ПРОВАЛ: не состоящий в союзе видит чат «%»', chat_app; end if;

  -- Заявки: разбирающий видит поданные к нему, подавший — свои, рядовой — ничьи.
  if apps_lead <> 'ПРБ1' then raise exception 'ПРОВАЛ: глава видит заявки «%», ждали только свои', apps_lead; end if;
  if apps_mem  <> ''     then raise exception 'ПРОВАЛ: рядовой соратник видит заявки «%»', apps_mem; end if;
  if apps_app  <> 'ПРБ1, ПРБ2' then raise exception 'ПРОВАЛ: подавший видит заявки «%», ждали обе свои', apps_app; end if;

  raise notice '6 ✓ RLS: чат — только своему союзу; заявки — разбирающему и подавшему, больше никому';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Союзы и состав открыты всем — это как раз то, ради чего союз и заводят.
-- ---------------------------------------------------------------------------
set local role mp_ally_probe;
do $$
declare n_ally int; n_mem int;
begin
  perform set_config('request.jwt.claim.sub', (select v from probe where k='u_app'), true);
  select count(*) into n_ally from alliances where tag in ('ПРБ1','ПРБ2');
  select count(*) into n_mem from alliance_members m join alliances a on a.id=m.alliance_id
    where a.tag in ('ПРБ1','ПРБ2');
  if n_ally <> 2 then raise exception 'ПРОВАЛ: не состоящий в союзе видит % союзов из 2', n_ally; end if;
  if n_mem  <> 3 then raise exception 'ПРОВАЛ: не состоящий в союзе видит % строк состава из 3', n_mem; end if;
  raise notice '7 ✓ список союзов и их состав открыты всем в мире';
end $$;
reset role;

do $$ begin raise notice 'ВСЕ ПРОВЕРКИ СХЕМЫ СОЮЗОВ ПРОШЛИ'; end $$;

-- Ничего в базе не остаётся — см. шапку.
rollback;
