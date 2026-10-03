#!/bin/bash
# =============================================================================
# Сквозной стенд общего мира: настоящий клиент (index.html) + настоящие
# edge-функции (supabase/functions/mp-*) + настоящая схема (все миграции) на
# локальном Postgres. Supabase изображают PostgREST (тот же REST-слой) и
# маленький шлюз gateway.mjs: анонимный вход с настоящими JWT, /rest/v1 →
# PostgREST, /functions/v1 → функции из репозитория под Node с заглушкой Deno.
#
# Зачем: проверки на заглушках (tools/check_*.mjs) собирают разметку из
# готового состояния и сервер не вызывают. Стенд нашёл то, что им не видно
# в принципе (Фаза 60): приглашение в союз нельзя было ни принять, ни
# отклонить; передать главенство — нельзя; кнопки на панели клетки карты не
# работали; тикер не закреплял ни одного события.
#
# Каждый запуск поднимает ЧИСТУЮ базу. Рабочая папка — вне репозитория
# (E2E_DIR, по умолчанию /var/tmp/fb-e2e): там база, PostgREST и node_modules.
#
#   bash tools/e2e/up.sh                 # поднять (или перезапустить) стенд
#   node $E2E_DIR/t_create.mjs           # сценарии — копируются туда же
#
# Нужны: postgresql-16 (initdb/pg_ctl), node 20+, playwright с Chromium.
# =============================================================================
set -e
REPO=$(cd "$(dirname "$0")/../.." && pwd)
W=${E2E_DIR:-/var/tmp/fb-e2e}
PGB=${PGBIN:-/usr/lib/postgresql/16/bin}
PGRST_V=${PGRST_V:-v12.2.12}
mkdir -p "$W"
cp "$REPO"/tools/e2e/*.mjs "$REPO"/tools/e2e/supa.sql "$W"/
echo "{\"type\":\"module\",\"name\":\"fb-e2e\",\"private\":true}" > "$W/package.json"
cd "$W"
[ -d node_modules/pg ] || npm i --no-audit --no-fund pg jsonwebtoken @supabase/supabase-js@2 >/dev/null
if [ ! -x postgrest ]; then
  curl -sSL -o pgrst.tar.xz "https://github.com/PostgREST/postgrest/releases/download/$PGRST_V/postgrest-$PGRST_V-linux-static-x86-64.tar.xz"
  tar xf pgrst.tar.xz
fi
# Остановить прежний стенд. Шаблоны с [] — чтобы pkill не нашёл сам себя.
for p in $(ps -eo pid,args | awk '/[p]ostgrest postgrest\.conf|[n]ode gateway\.mjs/ {print $1}'); do kill "$p"; done
D="$W/pg"
[ -f "$D/data/postmaster.pid" ] && su nobody -s /bin/bash -c "$PGB/pg_ctl -D $D/data stop -m fast" >/dev/null 2>&1 || true
rm -rf "$D"; mkdir -p "$D"; chown nobody "$D"
su nobody -s /bin/bash -c "$PGB/initdb -D $D/data -A trust -U postgres >/dev/null && $PGB/pg_ctl -D $D/data -o '-p 5499 -k $D -c listen_addresses=localhost' -l $D/log start >/dev/null"
P="psql -h localhost -p 5499 -U postgres -v ON_ERROR_STOP=1 -q"
$P -c "create database game"
$P -d game -f supa.sql
for f in "$REPO"/supabase/migrations/00*.sql; do
  # pg_cron/pg_net в локальном Postgres нет — их функции заглушены в supa.sql.
  grep -v -i 'create extension' "$f" | $P -d game >/dev/null 2>err.txt || { echo "миграция $(basename "$f") упала:"; cat err.txt; exit 1; }
done
cat > postgrest.conf <<CONF
db-uri = "postgres://authenticator:pw@localhost:5499/game"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "local-test-secret-local-test-secret-0123456789"
server-port = 3300
server-host = "127.0.0.1"
log-level = "error"
CONF
setsid nohup ./postgrest postgrest.conf > pgrst.log 2>&1 < /dev/null &
REPO="$REPO" setsid nohup node gateway.mjs > gateway.log 2>&1 < /dev/null &
ps -eo args | grep -q '[h]ttp.server 8799' || (cd "$REPO" && setsid nohup python3 -m http.server 8799 > /dev/null 2>&1 < /dev/null &)
for i in $(seq 1 40); do curl -s -o /dev/null http://localhost:54321/rest/v1/worlds && curl -s -o /dev/null http://localhost:8799/index.html && break; sleep 0.5; done
echo "стенд готов: база $(ls "$REPO"/supabase/migrations/00*.sql | wc -l) миграций, PostgREST $PGRST_V, шлюз :54321, игра :8799; сценарии в $W"
