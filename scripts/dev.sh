#!/usr/bin/env bash
# Run NoteNext development services directly on the host, on demand.
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
STATE_DIR="${NOTENEXT_DEV_STATE_DIR:-${XDG_RUNTIME_DIR:-/tmp}/notenext-dev}"
BACKEND_PORT="${NOTENEXT_DEV_BACKEND_PORT:-9123}"
FRONTEND_PORT="${NOTENEXT_DEV_FRONTEND_PORT:-6745}"
BACKEND_PID="$STATE_DIR/backend.pid"
FRONTEND_PID="$STATE_DIR/frontend.pid"
BACKEND_LOG="$STATE_DIR/backend.log"
FRONTEND_LOG="$STATE_DIR/frontend.log"

usage() {
  cat <<'EOF'
Usage: scripts/dev.sh <command>

Commands:
  up       Start backend and frontend directly on the host
  down     Stop both host-run services
  restart  Stop, then start both services
  status   Show process and HTTP health status
  logs     Follow logs, optionally: logs backend|frontend
  doctor   Check host dependencies and dev environment
  clean    Stop services and remove only the temporary runtime state/logs

Defaults:
  backend: http://127.0.0.1:9123
  frontend: http://127.0.0.1:6745

Overrides:
  NOTENEXT_DEV_BACKEND_PORT, NOTENEXT_DEV_FRONTEND_PORT
  NOTENEXT_DEV_STATE_DIR
  NOTENEXT_DEV_API, exported to Vite as VITE_ROOT_API when set
EOF
}

mkdir -p "$STATE_DIR"

pid_from() {
  local file="$1"
  [[ -s "$file" ]] && tr -d '[:space:]' < "$file"
}

running() {
  local file="$1" pid
  pid="$(pid_from "$file" || true)"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

clear_stale_pid() {
  local file="$1"
  if [[ -s "$file" ]] && ! running "$file"; then
    rm -f "$file"
  fi
}

start_backend() {
  if running "$BACKEND_PID"; then
    echo "backend already running (pid $(pid_from "$BACKEND_PID"))"
    return
  fi
  clear_stale_pid "$BACKEND_PID"
  setsid bash -c '
    set -e
    cd "$1"
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" == \#* ]] && continue
      [[ "$line" == export\ * ]] && line="${line#export }"
      export "$line"
    done < .env
    exec env SERVER_PORT=":$2" go run ./cmd/api
  ' _ "$BACKEND_DIR" "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
  echo "$!" >"$BACKEND_PID"
  echo "backend starting on :$BACKEND_PORT (pid $!)"
}

start_frontend() {
  if running "$FRONTEND_PID"; then
    echo "frontend already running (pid $(pid_from "$FRONTEND_PID"))"
    return
  fi
  clear_stale_pid "$FRONTEND_PID"
  setsid bash -c '
    set -e
    cd "$1"
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ -z "$line" || "$line" == \#* ]] && continue
      [[ "$line" == export\ * ]] && line="${line#export }"
      export "$line"
    done < .env
    if [[ -n "${3:-}" ]]; then
      export VITE_ROOT_API="$3"
    fi
    exec npm run dev -- --host 127.0.0.1 --port "$2"
  ' _ "$FRONTEND_DIR" "$FRONTEND_PORT" "${NOTENEXT_DEV_API:-}" >"$FRONTEND_LOG" 2>&1 &
  echo "$!" >"$FRONTEND_PID"
  echo "frontend starting on :$FRONTEND_PORT (pid $!)"
}

stop_one() {
  local name="$1" file="$2" pid
  pid="$(pid_from "$file" || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$file"
    echo "$name already stopped"
    return
  fi
  if kill -0 "$pid" 2>/dev/null; then
    # Each service is launched in its own process group by this script's
    # background subshell. Kill the group so go run/npm children do not leak.
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    for _ in {1..50}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
    fi
    echo "$name stopped (pid $pid)"
  else
    echo "$name stale pid removed (pid $pid)"
  fi
  rm -f "$file"
}

http_code() {
  local url="$1"
  curl --silent --show-error --max-time 2 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || printf 'down'
}

status() {
  local bstate=stopped fstate=stopped
  running "$BACKEND_PID" && bstate="running pid $(pid_from "$BACKEND_PID")"
  running "$FRONTEND_PID" && fstate="running pid $(pid_from "$FRONTEND_PID")"
  printf 'backend:  %-20s HTTP %s\n' "$bstate" "$(http_code "http://127.0.0.1:$BACKEND_PORT/health")"
  printf 'frontend: %-20s HTTP %s\n' "$fstate" "$(http_code "http://127.0.0.1:$FRONTEND_PORT/")"
  printf 'logs: %s\n' "$STATE_DIR"
}

wait_for_http() {
  local url="$1" label="$2" max_attempts="${NOTENEXT_DEV_START_TIMEOUT_STEPS:-180}"
  for ((attempt = 0; attempt < max_attempts; attempt++)); do
    if [[ "$(http_code "$url")" =~ ^2 ]]; then
      echo "$label ready"
      return 0
    fi
    sleep 0.5
  done
  echo "$label failed to become ready; inspect its log" >&2
  return 1
}

doctor() {
  local failed=0
  for cmd in go node npm curl; do
    if command -v "$cmd" >/dev/null 2>&1; then
      case "$cmd" in
        go) version="$(go version 2>&1)" ;;
        curl) version="$(curl --version 2>&1 | sed -n '1p')" ;;
        *) version="$($cmd --version 2>&1)" ;;
      esac
      printf '%-8s %s\n' "$cmd" "$version"
    else
      printf '%-8s MISSING\n' "$cmd"
      failed=1
    fi
  done
  [[ -f "$BACKEND_DIR/.env" ]] || { echo "backend/.env missing"; failed=1; }
  [[ -f "$FRONTEND_DIR/.env" ]] || { echo "frontend/.env missing"; failed=1; }
  [[ -d "$FRONTEND_DIR/node_modules" ]] || { echo "frontend/node_modules missing; run npm install"; failed=1; }
  echo "backend dir:  $BACKEND_DIR"
  echo "frontend dir: $FRONTEND_DIR"
  echo "state dir:    $STATE_DIR"
  return "$failed"
}

case "${1:-}" in
  up)
    doctor
    start_backend
    start_frontend
    if ! wait_for_http "http://127.0.0.1:$BACKEND_PORT/health" backend; then
      "$0" down
      exit 1
    fi
    if ! wait_for_http "http://127.0.0.1:$FRONTEND_PORT/" frontend; then
      "$0" down
      exit 1
    fi
    status
    ;;
  down)
    stop_one frontend "$FRONTEND_PID"
    stop_one backend "$BACKEND_PID"
    ;;
  restart)
    "$0" down
    "$0" up
    ;;
  status)
    status
    ;;
  logs)
    target="${2:-all}"
    case "$target" in
      backend) exec tail -n 100 -f "$BACKEND_LOG" ;;
      frontend) exec tail -n 100 -f "$FRONTEND_LOG" ;;
      all)
        echo "backend log: $BACKEND_LOG"
        echo "frontend log: $FRONTEND_LOG"
        exec tail -n 100 -f "$BACKEND_LOG" "$FRONTEND_LOG"
        ;;
      *) echo "unknown log target: $target" >&2; exit 2 ;;
    esac
    ;;
  doctor)
    doctor
    ;;
  clean)
    "$0" down
    rm -rf "$STATE_DIR"
    echo "removed temporary dev state: $STATE_DIR"
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
