#!/usr/bin/env bash
# Verifies network and database isolation of the running stack.
set -u

project=${1:-event-sharing}
gateway_port=${GATEWAY_PORT:-8000}
frontend_port=${FRONTEND_PORT:-3001}
compose=(docker compose -p "$project")
failures=0

declare -A ports=(
  [auth]=8002 [users]=8003 [events]=8001 [geo-search]=8004 [participation]=8005
  [notifications]=8006 [event-log]=8007 [messages]=8008 [storage]=8009
)
services=("${!ports[@]}")

# Prints each target from the arguments that accepts a connection.
probe='
const net = require("net");
const check = (target) => new Promise((resolve) => {
  const [host, port] = target.split(":");
  const socket = net.connect({ host, port: Number(port), timeout: 2000 });
  const finish = (open) => { socket.destroy(); resolve(open ? target : null); };
  socket.on("connect", () => finish(true));
  socket.on("error", () => finish(false));
  socket.on("timeout", () => finish(false));
});
Promise.all(process.argv.slice(1).map(check)).then((open) => {
  console.log(open.filter(Boolean).join(" "));
});
'

report() {
  if [ "$1" = ok ]; then
    echo "PASS $2"
  else
    echo "FAIL $2"
    failures=$((failures + 1))
  fi
}

expect_closed() {
  local name=$1 open=$2
  [ -z "$open" ] && report ok "$name" || report fail "$name: $open"
}

expect_open() {
  local name=$1 open=$2
  [ -n "$open" ] && report ok "$name" || report fail "$name"
}

container_ips() {
  docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' \
    "$("${compose[@]}" ps -q "$1")"
}

probe_from() {
  local source=$1
  shift
  "${compose[@]}" exec -T "$source" node -e "$probe" "$@" | tr -d '\r'
}

ip_targets=()
name_targets=()
for service in "${services[@]}"; do
  name_targets+=("$service:${ports[$service]}")
  for ip in $(container_ips "$service"); do
    ip_targets+=("$ip:${ports[$service]}")
  done
done
for ip in $(container_ips postgres); do ip_targets+=("$ip:5432"); done
for ip in $(container_ips kafka); do
  ip_targets+=("$ip:9092" "$ip:19092")
done
for ip in $(container_ips clamav); do ip_targets+=("$ip:3310"); done

local_ports=(8001 8002 8003 8004 8005 8006 8007 8008 8009 5432 5434 9092 3310)
local_targets=("${local_ports[@]/#/127.0.0.1:}")
expect_closed 'Host: no service on loopback' \
  "$(node -e "$probe" "${local_targets[@]}")"
expect_closed 'Host: no service by container IP' \
  "$(node -e "$probe" "${ip_targets[@]}")"
expect_open 'Host: gateway is published' \
  "$(node -e "$probe" "127.0.0.1:$gateway_port")"
expect_open 'Host: frontend is published' \
  "$(node -e "$probe" "127.0.0.1:$frontend_port")"

for source in "${services[@]}"; do
  others=()
  for target in "${name_targets[@]}" "${ip_targets[@]}"; do
    case "$target" in
      "$source":*) continue ;;
    esac
    others+=("$target")
  done
  own_ips=" $(container_ips "$source")"
  filtered=()
  for target in "${others[@]}"; do
    case "$own_ips" in
      *" ${target%%:*} "*) continue ;;
    esac
    case "$target" in
      *:5432 | *:19092) continue ;;
    esac
    if [ "$source" = storage ] && [ "${target##*:}" = 3310 ]; then
      continue
    fi
    filtered+=("$target")
  done
  expect_closed "$source: no other services" \
    "$(probe_from "$source" "${filtered[@]}" frontend:3001)"
  expect_open "$source: reaches PostgreSQL" \
    "$(probe_from "$source" postgres:5432)"
  expect_open "$source: reaches Kafka" "$(probe_from "$source" kafka:19092)"
  expect_open "gateway: reaches $source" \
    "$(probe_from gateway "$source:${ports[$source]}")"
done

expect_closed 'frontend: only gateway' \
  "$(probe_from frontend "${name_targets[@]}" postgres:5432 kafka:19092)"
expect_closed 'gateway: no PostgreSQL' "$(probe_from gateway postgres:5432)"

probe_from_proxy() {
  docker run --rm --network public_proxy event-sharing-app node -e "$probe" "$@"
}
expect_open 'public_proxy: reaches gateway' "$(probe_from_proxy gateway:8000)"
expect_open 'public_proxy: reaches frontend' "$(probe_from_proxy frontend:3001)"
expect_closed 'public_proxy: no services' \
  "$(probe_from_proxy "${name_targets[@]}" postgres:5432 kafka:19092)"

for service in users events participation messages event-log storage; do
  expect_closed "$service: no internet" "$(probe_from "$service" 1.1.1.1:443)"
done

declare -A databases=(
  [auth_service]=users_db [users_service]=auth_db [events_service]=auth_db
  [geo_search_service]=events_db [participation_service]=events_db
  [notifications_service]=users_db [messages_service]=events_db
  [event_log_service]=auth_db [storage_service]=users_db
)
for role in "${!databases[@]}"; do
  database=${databases[$role]}
  if "${compose[@]}" exec -T postgres \
    psql -h 127.0.0.1 -U "$role" -d "$database" -c 'SELECT 1' >/dev/null 2>&1; then
    report fail "$role: connects to $database"
  else
    report ok "$role: denied on $database"
  fi
done

echo "FAILURES $failures"
[ "$failures" -eq 0 ]
