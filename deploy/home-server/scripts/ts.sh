#!/usr/bin/env bash
# Tailscale CLI wrapper for this Mac (Homebrew userspace daemon).
set -euo pipefail
SOCKET="${TS_SOCKET:-$HOME/.local/run/tailscaled.sock}"
exec tailscale --socket "$SOCKET" "$@"
