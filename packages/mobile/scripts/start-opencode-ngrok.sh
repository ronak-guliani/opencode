#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PORT="${OPENCODE_REMOTE_PORT:-0}"
HOSTNAME="${OPENCODE_REMOTE_HOSTNAME:-0.0.0.0}"
USERNAME="${OPENCODE_SERVER_USERNAME:-opencode}"
SERVER_LOG="/tmp/opencode-server.log"

if [[ -z "${OPENCODE_SERVER_PASSWORD:-}" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    OPENCODE_SERVER_PASSWORD="$(openssl rand -base64 24 | tr -d '\n' | tr '/+' 'ab' | cut -c 1-24)"
  else
    OPENCODE_SERVER_PASSWORD="$(date +%s | shasum | cut -c1-24)"
  fi
fi

PASSWORD="$OPENCODE_SERVER_PASSWORD"
export OPENCODE_SERVER_USERNAME="$USERNAME"
export OPENCODE_SERVER_PASSWORD="$PASSWORD"

for cmd in bun ngrok curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd"
    exit 1
  fi
done

cleanup() {
  if [[ -n "${NGROK_PID:-}" ]]; then
    kill "$NGROK_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

start_server() {
  local requested_port="$1"
  : >"$SERVER_LOG"

  (
    cd "$ROOT_DIR"
    bun run --cwd packages/opencode --conditions=browser src/index.ts serve --hostname "$HOSTNAME" --port "$requested_port"
  ) >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!

  for _ in {1..40}; do
    PORT="$(grep -Eo 'opencode server listening on http://[^:]+:[0-9]+' "$SERVER_LOG" | tail -n1 | sed -E 's/.*:([0-9]+)$/\1/' || true)"
    if [[ -n "$PORT" ]]; then
      return 0
    fi
    if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
      return 1
    fi
    sleep 1
  done

  return 1
}

if ! start_server "$PORT"; then
  if [[ "$PORT" != "0" ]]; then
    echo "Requested port $PORT was unavailable, retrying with an auto-assigned port."
    if ! start_server 0; then
      cat "$SERVER_LOG"
      echo "Failed to start opencode server"
      exit 1
    fi
  else
    cat "$SERVER_LOG"
    echo "Failed to start opencode server"
    exit 1
  fi
fi

AUTH_HEADER="$(printf "%s:%s" "$USERNAME" "$PASSWORD" | base64)"

for _ in {1..40}; do
  if curl -fsS -H "Authorization: Basic $AUTH_HEADER" "http://127.0.0.1:${PORT}/global/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS -H "Authorization: Basic $AUTH_HEADER" "http://127.0.0.1:${PORT}/global/health" >/dev/null 2>&1; then
  echo "opencode server did not become healthy on port $PORT"
  exit 1
fi

ngrok http "http://127.0.0.1:${PORT}" --log=stdout >/tmp/opencode-ngrok.log 2>&1 &
NGROK_PID=$!

PUBLIC_URL=""
for _ in {1..40}; do
  PUBLIC_URL="$( (curl -fsS http://127.0.0.1:4040/api/tunnels | bun -e 'const fs=require("node:fs"); const d=JSON.parse(fs.readFileSync(0, "utf8")); const t=d.tunnels?.find((x)=>x.proto==="https") ?? d.tunnels?.[0]; if (t?.public_url) process.stdout.write(t.public_url);') 2>/dev/null || true )"
  if [[ -n "$PUBLIC_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "ngrok tunnel did not start. Check /tmp/opencode-ngrok.log"
  exit 1
fi

echo
echo "OpenCode remote server is ready."
echo "URL: $PUBLIC_URL"
echo "Username: $USERNAME"
echo "Password: $PASSWORD"
echo
echo "Health check:"
curl -fsS --user "$USERNAME:$PASSWORD" -H "ngrok-skip-browser-warning: true" "${PUBLIC_URL}/global/health" || true
echo
echo "Press Ctrl+C to stop opencode + ngrok."

wait "$NGROK_PID"
