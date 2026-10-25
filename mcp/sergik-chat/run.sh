#!/usr/bin/env bash
# Loads mcp/sergik-chat/.env (CURSOR_API_KEY) then starts the stdio server.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$DIR/.env"
  set +a
fi
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-sergikai:latest}"
export ADMIN_AI_OLLAMA_TIMEOUT_MS="${ADMIN_AI_OLLAMA_TIMEOUT_MS:-120000}"
export SERGIK_CURSOR_MODEL="${SERGIK_CURSOR_MODEL:-auto}"
exec node "$DIR/server.mjs"
