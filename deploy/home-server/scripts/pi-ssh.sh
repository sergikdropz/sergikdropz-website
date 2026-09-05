#!/usr/bin/env bash
# SSH to the Pi over Tailscale. Usage: ./pi-ssh.sh [user] [remote-command...]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="${1:-pi}"
if [[ $# -gt 0 ]]; then shift; fi
"$ROOT/ts.sh" status | grep -E 'raspberrypi|pi' || true
exec "$ROOT/ts.sh" ssh "${USER_NAME}@raspberrypi" "$@"
