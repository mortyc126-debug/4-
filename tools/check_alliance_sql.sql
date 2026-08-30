-- =============================================================================
-- Проверка схемы союзов, сборов и чата (миграции 0012/0014/0015) на живой базе.
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
-- Требует уже накатанных 0001, 0012, 0014, 0015, 0016 и 0017.

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
grant select on players, alliances, alliance_members, alliance_applications, alliance_invites, alliance_chat to mp_ally_probe;

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
select p.id, a.id, t.role from (values ('ПробаГлава','ПРБ1','r5'),
                                       ('ПробаСоратник','ПРБ1','r1'),
                                       ('ПробаЧужой','ПРБ2','r5')) as t(nick, tag, role)
join players p on p.nick=t.nick join alliances a on a.tag=t.tag;

insert into alliance_applications (alliance_id, player_id)
select a.id, (select id from players where nick='ПробаПроситель') from alliances a where a.tag in ('ПРБ1','ПРБ2');

-- Приглашение: наш союз зовёт «Просителя», чужой зовёт «Соратника» (тот уже в
-- нашем союзе — так проверяется, что чужие приглашения не видны никому лишнему).
insert into alliance_invites (alliance_id, player_id, by_player_id, by_nick)
select a.id, p.id, (select id from players where nick='ПробаГлава'), 'ПробаГлава'
from alliances a, players p
where (a.tag='ПРБ1' and p.nick='ПробаПроситель') or (a.tag='ПРБ2' and p.nick='ПробаСоратник');

insert into alliance_chat (alliance_id, player_id, nick, body)
select a.id, p.id, p.nick, 'тайна '||a.tag
from alliances a join players p on p.nick = case a.tag when 'ПРБ1' then 'ПробаГлава' else 'ПробаЧужой' end
where a.tag in ('ПРБ1','ПРБ2');

-- ---------------------------------------------------------------------------
-- 0. Значения по умолчанию. Проверяются потому, что их правит догоняющий блок
-- миграции: базу могли накатить прежней редакцией, где ступеней было три, а
-- вместимость считалась от здания. Не сработай он — новый союз молча завёлся
-- бы с ролью, которой код уже не знает.
-- ---------------------------------------------------------------------------
do $$
declare role_def text; cap_def text; bad text;
begin
  select column_default into role_def from information_schema.columns
    where table_schema='public' and table_name='alliance_members' and column_name='role';
  select column_default into cap_def from information_schema.columns
    where table_schema='public' and table_name='alliances' and column_name='members_max';
  if role_def is distinct from '''r1''::text' then
    raise exception 'ПРОВАЛ: ступень по умолчанию — %, ждали r1', coalesce(role_def,'NULL'); end if;
  if cap_def is distinct from '30' then
    raise exception 'ПРОВАЛ: вместимость по умолчанию — %, ждали 30', coalesce(cap_def,'NULL'); end if;
  -- И ни одной строки с ролями прежнего образца: догоняющий блок их переносит.
  select string_agg(distinct role, ', ') into bad from alliance_members
    where role not in ('r5','r4','r3','r2','r1');
  if bad is not null then raise exception 'ПРОВАЛ: в составе остались ступени прежнего образца: %', bad; end if;
  -- Герб: колонка обязана быть и обязана допускать NULL. Союз, основанный до
  -- появления гербов, герба не имеет — и рисуется общим по умолчанию.
  perform 1 from information_schema.columns
    where table_schema='public' and table_name='alliances'
      and column_name='emblem' and data_type='jsonb' and is_nullable='YES';
  if not found then raise exception 'ПРОВАЛ: нет колонки alliances.emblem jsonb, допускающей NULL'; end if;
  raise notice '0 ✓ ступень по умолчанию r1, вместимость 30, старых ступеней нет, герб на месте';
end $$;

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
select (select id from players where nick='ПробаЧужой'), id, 'r5' from alliances where tag='ПРБ2';
insert into alliance_applications (alliance_id, player_id)
select id, (select id from players where nick='ПробаПроситель') from alliances where tag='ПРБ2';
-- И приглашение чужого союза «Соратнику»: проверка 5 удалила союз ПРБ2 вместе
-- с его приглашением (каскад), а шестой оно нужно — на нём видно, что позванный
-- своё приглашение видит, даже будучи рядовым в другом союзе.
insert into alliance_invites (alliance_id, player_id, by_player_id, by_nick)
select id, (select id from players where nick='ПробаСоратник'),
       (select id from players where nick='ПробаЧужой'), 'ПробаЧужой'
from alliances where tag='ПРБ2';
insert into alliance_chat (alliance_id, player_id, nick, body)
select id, (select id from players where nick='ПробаЧужой'), 'ПробаЧужой', 'тайна ПРБ2' from alliances where tag='ПРБ2';

-- Ответы собираем ДО смены роли: сравнивать будем с тем, что увидит игрок.
create temp table probe_seen (who text, chat text, apps text, inv text);
-- Временные таблицы стенда роль игрока читает и пишет наравне: RLS на них
-- нет вовсе, но обычные права GRANT нужны и им.
grant select on probe to mp_ally_probe;
grant select, insert on probe_seen to mp_ally_probe;

set local role mp_ally_probe;

do $$
declare r record; uid text; seen_chat text; seen_apps text; seen_inv text;
begin
  for r in select k, v from probe where k in ('u_lead','u_mem','u_out','u_app') loop
    perform set_config('request.jwt.claim.sub', r.v, true);
    select coalesce(string_agg(c.body, ', ' order by c.body), '') into seen_chat from alliance_chat c;
    select coalesce(string_agg(a.tag, ', ' order by a.tag), '') into seen_apps
      from alliance_applications ap join alliances a on a.id=ap.alliance_id;
    select coalesce(string_agg(a.tag||'->'||p.nick, ', ' order by a.tag), '') into seen_inv
      from alliance_invites iv join alliances a on a.id=iv.alliance_id
      join players p on p.id=iv.player_id;
    insert into probe_seen values (r.k, seen_chat, seen_apps, seen_inv);
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

  -- Приглашения: позванный видит своё, зовущие ступени (r5/r4/r3) — свои
  -- исходящие, рядовой соратник — ничьи.
  declare inv_lead text; inv_mem text; inv_app text;
  begin
    select inv into inv_lead from probe_seen where who='u_lead';
    select inv into inv_mem  from probe_seen where who='u_mem';
    select inv into inv_app  from probe_seen where who='u_app';
    if inv_lead <> 'ПРБ1->ПробаПроситель' then
      raise exception 'ПРОВАЛ: глава видит приглашения «%», ждали только своего союза', inv_lead; end if;
    -- Соратник — ступень r1: чужих приглашений он не видит, но ВИДИТ своё
    -- собственное (его позвал чужой союз), потому что позванному оно и адресовано.
    if inv_mem <> 'ПРБ2->ПробаСоратник' then
      raise exception 'ПРОВАЛ: рядовой соратник видит приглашения «%», ждал только своё', inv_mem; end if;
    if inv_app <> 'ПРБ1->ПробаПроситель' then
      raise exception 'ПРОВАЛ: позванный видит приглашения «%», ждал только своё', inv_app; end if;
  end;

  raise notice '6 ✓ RLS: чат — только своему союзу; заявки и приглашения — кому адресованы, больше никому';
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

-- ---------------------------------------------------------------------------
-- 8. Чат (миграция 0015). Три ленты — три разных ответа на вопрос «кому
-- видно»: мировая открыта всем, союзная только союзу (это уже проверено в
-- разделе 6), личная — ровно двоим. Ошибка в последней тиха и дорога: она
-- отдаёт чужой разговор наружу, ничего при этом не ломая.
--
-- Плюс то, что держит схема, а не код: дружба — ОДНА строка на пару, и
-- позвать друг друга дважды нельзя.
-- ---------------------------------------------------------------------------
grant select on world_chat, chat_dm, friends to mp_ally_probe;

insert into world_chat (world_id, player_id, nick, tag, race, body)
select (select v from probe where k='world')::uuid, id, nick, 'ПРБ1', race, 'слово на весь мир'
from players where nick='ПробаГлава';

-- Разговор главы с чужаком. Соратник и проситель к нему касательства не имеют.
insert into chat_dm (world_id, from_id, to_id, from_nick, body)
select (select v from probe where k='world')::uuid,
       (select id from players where nick='ПробаГлава'),
       (select id from players where nick='ПробаЧужой'),
       'ПробаГлава', 'разговор наедине';

-- Дружба главы с соратником и приглашение от чужака просителю.
insert into friends (lo_id, hi_id, by_id, state)
select least(a.id,b.id), greatest(a.id,b.id), a.id, 'ok'
from players a, players b where a.nick='ПробаГлава' and b.nick='ПробаСоратник';
insert into friends (lo_id, hi_id, by_id, state)
select least(a.id,b.id), greatest(a.id,b.id), a.id, 'pending'
from players a, players b where a.nick='ПробаЧужой' and b.nick='ПробаПроситель';

create temp table probe_chat (who text primary key, n_world int, n_dm int, n_fr int);
grant select, insert on probe_chat to mp_ally_probe;
set local role mp_ally_probe;
do $$
declare r record; nw int; nd int; nf int;
begin
  for r in select k, v from probe where k in ('u_lead','u_mem','u_out','u_app') loop
    perform set_config('request.jwt.claim.sub', r.v, true);
    select count(*) into nw from world_chat;
    select count(*) into nd from chat_dm;
    select count(*) into nf from friends;
    insert into probe_chat values (r.k, nw, nd, nf);
  end loop;
end $$;
reset role;

do $$
declare w_lead int; w_app int; d_lead int; d_out int; d_mem int; d_app int;
        f_lead int; f_mem int; f_out int; f_app int;
begin
  select n_world, n_dm, n_fr into w_lead, d_lead, f_lead from probe_chat where who='u_lead';
  select n_world, n_dm, n_fr into w_app,  d_app,  f_app  from probe_chat where who='u_app';
  select n_dm, n_fr into d_mem, f_mem from probe_chat where who='u_mem';
  select n_dm, n_fr into d_out, f_out from probe_chat where who='u_out';

  -- Мировая лента открыта всем — она для того и мировая.
  if w_lead <> 1 or w_app <> 1 then
    raise exception 'ПРОВАЛ: мировой чат видно как % и % строк, ждали по 1', w_lead, w_app; end if;

  -- Личная переписка — только двоим её сторонам.
  if d_lead <> 1 then raise exception 'ПРОВАЛ: собеседник видит % своих реплик из 1', d_lead; end if;
  if d_out  <> 1 then raise exception 'ПРОВАЛ: второй собеседник видит % реплик из 1', d_out; end if;
  if d_mem  <> 0 then raise exception 'ПРОВАЛ: ПОСТОРОННИЙ видит % чужих личных реплик', d_mem; end if;
  if d_app  <> 0 then raise exception 'ПРОВАЛ: посторонний видит % чужих личных реплик', d_app; end if;

  -- Дружба и приглашение дружить — тоже дело двоих.
  if f_lead <> 1 then raise exception 'ПРОВАЛ: друг видит % своих дружб из 1', f_lead; end if;
  if f_mem  <> 1 then raise exception 'ПРОВАЛ: второй друг видит % дружб из 1', f_mem; end if;
  if f_out  <> 1 then raise exception 'ПРОВАЛ: позвавший видит % своих приглашений из 1', f_out; end if;
  if f_app  <> 1 then raise exception 'ПРОВАЛ: позванный видит % приглашений из 1', f_app; end if;
  raise notice '8 ✓ RLS: мировой чат открыт всем, личный — только двоим, дружба — только паре';
end $$;

-- Схема: дружба одна на пару. Встречное «позову-ка и я» не должно заводить
-- вторую строку — иначе двое, нажавшие кнопку одновременно, застряли бы в двух
-- висящих приглашениях навсегда.
do $$
declare a bigint; b bigint; dup boolean := false;
begin
  select id into a from players where nick='ПробаГлава';
  select id into b from players where nick='ПробаСоратник';
  begin
    insert into friends (lo_id, hi_id, by_id, state)
    values (least(a,b), greatest(a,b), b, 'pending');
    dup := true;
  exception when unique_violation then dup := false; end;
  if dup then raise exception 'ПРОВАЛ: та же пара легла в friends дважды'; end if;
  -- И обратный порядок в паре схема не принимает вовсе.
  begin
    insert into friends (lo_id, hi_id, by_id, state)
    values (greatest(a,b), least(a,b), b, 'pending');
    dup := true;
  exception when check_violation then dup := false; when unique_violation then dup := false; end;
  if dup then raise exception 'ПРОВАЛ: пара легла в friends в обратном порядке'; end if;
  raise notice '9 ✓ дружба — одна строка на пару, порядок в паре держит сама схема';
end $$;

-- ---------------------------------------------------------------------------
-- 10. Сборы союза (миграция 0014). Здесь важно ровно обратное седьмому пункту:
-- готовящийся сбор — ВОЕННАЯ ТАЙНА союза. Открытая политика на этих двух
-- таблицах отдала бы противнику даром и цель, и час выхода, и полный состав
-- войск — то, за чем в игре ходят разведкой.
--
-- И каскады: распущенный (удалённый) союз и погибший правитель не должны
-- оставлять за собой висящие сборы и доли — их некому будет ни вести, ни
-- вернуть.
-- ---------------------------------------------------------------------------
grant select on alliance_rallies, alliance_rally_parts to mp_ally_probe;

insert into alliance_rallies (world_id, alliance_id, leader_id, tx, ty, target_kind, target_name,
                              gather_until, state, cap, has_gen)
select (select v from probe where k='world')::uuid,
       (select id from alliances where tag='ПРБ1'),
       (select id from players where nick='ПробаГлава'),
       50, 60, 'camp', 'Лагерь варваров', now() + interval '15 minutes', 'gather', 51000, true;
insert into alliance_rally_parts (rally_id, player_id, units)
select r.id, p.id, '{"inf":{"1":100}}'::jsonb from alliance_rallies r, players p
where r.tx=50 and p.nick in ('ПробаГлава','ПробаСоратник');

create temp table probe_rally (who text primary key, n_rally int, n_parts int);
grant select, insert on probe_rally to mp_ally_probe;
grant select on probe to mp_ally_probe;
set local role mp_ally_probe;
do $$
declare r record; nr int; np int;
begin
  for r in select k, v from probe where k in ('u_lead','u_mem','u_out','u_app') loop
    perform set_config('request.jwt.claim.sub', r.v, true);
    select count(*) into nr from alliance_rallies;
    select count(*) into np from alliance_rally_parts;
    insert into probe_rally values (r.k, nr, np);
  end loop;
end $$;
reset role;

do $$
declare lead_r int; lead_p int; mem_r int; mem_p int; out_r int; out_p int; app_r int; app_p int;
begin
  select n_rally, n_parts into lead_r, lead_p from probe_rally where who='u_lead';
  select n_rally, n_parts into mem_r,  mem_p  from probe_rally where who='u_mem';
  select n_rally, n_parts into out_r,  out_p  from probe_rally where who='u_out';
  select n_rally, n_parts into app_r,  app_p  from probe_rally where who='u_app';
  if lead_r <> 1 or lead_p <> 2 then
    raise exception 'ПРОВАЛ: созвавший видит % сборов и % долей, ждали 1 и 2', lead_r, lead_p; end if;
  if mem_r <> 1 or mem_p <> 2 then
    raise exception 'ПРОВАЛ: соратник видит % сборов и % долей, ждали 1 и 2', mem_r, mem_p; end if;
  if out_r <> 0 or out_p <> 0 then
    raise exception 'ПРОВАЛ: ЧУЖОЙ СОЮЗ видит % сборов и % долей — это даровая разведка', out_r, out_p; end if;
  if app_r <> 0 or app_p <> 0 then
    raise exception 'ПРОВАЛ: не состоящий в союзе видит % сборов и % долей', app_r, app_p; end if;
  raise notice '10 ✓ RLS: готовящийся сбор и его состав видны только своему союзу';
end $$;

-- Каскады. Гибель участника уносит его долю, но сам сбор оставляет: остальные
-- идут дальше. Удаление союза уносит сбор целиком.
do $$
declare left_parts int; left_rally int; dead_id bigint;
begin
  select id into dead_id from players where nick='ПробаСоратник';
  delete from players where id=dead_id;
  select count(*) into left_parts from alliance_rally_parts where player_id=dead_id;
  select count(*) into left_rally from alliance_rallies where tx=50;
  if left_parts <> 0 then raise exception 'ПРОВАЛ: доля погибшего осталась в сборе (% строк)', left_parts; end if;
  if left_rally <> 1 then raise exception 'ПРОВАЛ: гибель участника унесла весь сбор'; end if;

  -- Заодно: реплика погибшего в личной переписке ОСТАЁТСЯ, только ссылка на
  -- автора обнуляется (on delete set null) — ник в строке записан отдельным
  -- полем ровно за этим, как и в чате союза.
  declare n_kept int;
  begin
    insert into chat_dm (world_id, from_id, to_id, from_nick, body)
    select (select v from probe where k='world')::uuid, null,
           (select id from players where nick='ПробаГлава'), 'ПробаСоратник', 'последнее слово';
    select count(*) into n_kept from chat_dm where from_nick='ПробаСоратник' and from_id is null;
    if n_kept <> 1 then raise exception 'ПРОВАЛ: реплика погибшего в личной переписке не пережила его'; end if;
  end;

  delete from alliances where tag='ПРБ1';
  select count(*) into left_rally from alliance_rallies where tx=50;
  select count(*) into left_parts from alliance_rally_parts;
  if left_rally <> 0 then raise exception 'ПРОВАЛ: распущенный союз оставил % сборов', left_rally; end if;
  if left_parts <> 0 then raise exception 'ПРОВАЛ: распущенный союз оставил % долей', left_parts; end if;
  raise notice '11 ✓ каскады: гибель участника уносит его долю, роспуск союза — весь сбор';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Казна союза (миграция 0016). Схемы тут почти нет — четыре числа в
-- jsonb, — но два свойства держит именно она, и оба нужны коду:
--   у КАЖДОГО союза казна есть (не NULL) с первой же секунды, иначе первое
--   же пожертвование пришлось бы отличать от всех последующих;
--   счётчик пожертвованного у соратника начинается с нуля, а не с NULL, —
--   на NULL сложение молча даёт NULL, и щедрость обнулялась бы навсегда.
-- ---------------------------------------------------------------------------
do $$
declare bank jsonb; dnt bigint;
begin
  insert into alliances (world_id, name, tag, leader_id)
  select (select v from probe where k='world')::uuid, 'Проба Казна', 'ПРБ3',
         (select id from players where nick='ПробаЧужой');
  select res into bank from alliances where tag='ПРБ3';
  if bank is null then raise exception 'ПРОВАЛ: у нового союза казна NULL'; end if;
  if coalesce((bank->>'food')::bigint, -1) <> 0 or coalesce((bank->>'gold')::bigint, -1) <> 0 then
    raise exception 'ПРОВАЛ: казна нового союза не пуста: %', bank; end if;

  insert into alliance_members (player_id, alliance_id, role)
  select (select id from players where nick='ПробаПроситель'), (select id from alliances where tag='ПРБ3'), 'r1';
  select donated into dnt from alliance_members
   where player_id=(select id from players where nick='ПробаПроситель');
  if dnt is distinct from 0 then raise exception 'ПРОВАЛ: пожертвовано у нового соратника = %, ждали 0', dnt; end if;

  -- И то, ради чего числа лежат именно так: прибавление работает без плясок
  -- с NULL, а казна правится целиком, одним jsonb.
  update alliances set res = jsonb_build_object('food', 5000, 'wood', 0, 'stone', 0, 'gold', 0)
   where tag='ПРБ3';
  update alliance_members set donated = donated + 5000
   where player_id=(select id from players where nick='ПробаПроситель');
  select (res->>'food')::bigint into dnt from alliances where tag='ПРБ3';
  if dnt <> 5000 then raise exception 'ПРОВАЛ: казна не приняла дар: %', dnt; end if;
  select donated into dnt from alliance_members
   where player_id=(select id from players where nick='ПробаПроситель');
  if dnt <> 5000 then raise exception 'ПРОВАЛ: счётчик щедрости не сложился: %', dnt; end if;
  raise notice '12 ✓ казна есть у каждого союза с нуля, счётчик пожертвованного тоже';
end $$;

-- ---------------------------------------------------------------------------
-- 13. Гарнизон крепости (миграция 0017). Тайна той же цены, что и сбор: зная
-- состав гарнизона, противник считает, хватит ли ему одного марша или нужен
-- сбор. В этой игре чужие войска узнают разведкой, а не выборкой.
-- ---------------------------------------------------------------------------
grant select on alliance_fort_garrison to mp_ally_probe;

-- Крепость держит ПРБ2: союз ПРБ1 к этому месту уже распущен разделом 11, а
-- проверять видимость надо на живом союзе с живым участником.
insert into map_cells (world_id, x, y, t, data)
select (select v from probe where k='world')::uuid, 777, 777, 'regfort',
       jsonb_build_object('region', 11, 'shrine', 'Проба Твердыня', 'tier', 3,
                          'state', 'ally', 'alliance_id', (select id from alliances where tag='ПРБ2'))
on conflict do nothing;
insert into alliance_fort_garrison (world_id, x, y, player_id, alliance_id, units)
select (select v from probe where k='world')::uuid, 777, 777,
       (select id from players where nick='ПробаЧужой'),
       (select id from alliances where tag='ПРБ2'), '{"inf":{"1":1000}}'::jsonb;

create temp table probe_garr (who text primary key, n int);
grant select, insert on probe_garr to mp_ally_probe;
set local role mp_ally_probe;
do $$
declare r record; n int;
begin
  for r in select k, v from probe where k in ('u_lead','u_mem','u_out','u_app') loop
    perform set_config('request.jwt.claim.sub', r.v, true);
    select count(*) into n from alliance_fort_garrison;
    insert into probe_garr values (r.k, n);
  end loop;
end $$;
reset role;

do $$
declare n_lead int; n_mem int; n_out int; n_app int;
begin
  select n into n_lead from probe_garr where who='u_lead';
  select n into n_mem  from probe_garr where who='u_mem';
  select n into n_out  from probe_garr where who='u_out';
  select n into n_app  from probe_garr where who='u_app';
  -- Держит крепость ПРБ2, а в нём состоит только ПробаЧужой.
  if n_out  <> 1 then raise exception 'ПРОВАЛ: свой союз видит % строк гарнизона из 1', n_out; end if;
  if n_lead <> 0 then raise exception 'ПРОВАЛ: ЧУЖОЙ видит % строк гарнизона — это даровая разведка', n_lead; end if;
  if n_mem  <> 0 then raise exception 'ПРОВАЛ: чужой соратник видит % строк гарнизона', n_mem; end if;
  if n_app  <> 0 then raise exception 'ПРОВАЛ: соратник ДРУГОГО союза видит % строк гарнизона', n_app; end if;
  raise notice '13 ✓ RLS: гарнизон крепости виден только своему союзу';
end $$;

do $$ begin raise notice 'ВСЕ ПРОВЕРКИ СХЕМЫ СОЮЗОВ, СБОРОВ, ЧАТА, КАЗНЫ И ГАРНИЗОНОВ ПРОШЛИ'; end $$;

-- Ничего в базе не остаётся — см. шапку.
rollback;
