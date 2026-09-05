#!/bin/bash
# ============================================================
# SERGIKDROPZ.COM — Full Platform Demo Recorder
#
# Records a browser walkthrough covering every major feature.
# Logs in as admin, navigates all public + protected surfaces.
#
# Usage:
#   cd web
#   ADMIN_EMAIL=you@example.com ADMIN_PASS=yourpassword bash scripts/demo-record.sh
#
# Production recording (against live site):
#   BASE_URL=https://sergikdropz.com ADMIN_EMAIL=... ADMIN_PASS=... bash scripts/demo-record.sh
#
# Output:
#   ~/Desktop/sergik-demo-YYYY-MM-DD-HH-MM.mp4
#
# Requirements:
#   ffmpeg     (brew install ffmpeg)
#   Google Chrome (installed)
# ============================================================

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASS="${ADMIN_PASS:-}"
TIMESTAMP=$(date +"%Y-%m-%d-%H-%M")
OUTPUT_FILE="${OUTPUT_FILE:-$HOME/Desktop/sergik-demo-${TIMESTAMP}.mp4}"
TOUR_SCRIPT="$(cd "$(dirname "$0")" && pwd)/demo-tour.js"
LOG_FILE="/tmp/sergik-demo-server-${TIMESTAMP}.log"

# ── Credential check ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SERGIKDROPZ  |  Platform Demo Recorder"
echo "═══════════════════════════════════════════════════════"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASS" ]]; then
  echo ""
  echo "  ⚠  No admin credentials set."
  echo "     Admin sections will be skipped."
  echo "     Pass them like:"
  echo "     ADMIN_EMAIL=you@example.com ADMIN_PASS=yourpassword bash scripts/demo-record.sh"
  echo ""
  read -rp "  Continue without admin login? [y/N] " CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || exit 0
else
  echo "  Admin email : $ADMIN_EMAIL"
fi

echo "  Base URL    : $BASE_URL"
echo "  Output file : $OUTPUT_FILE"
echo ""

# ── Dev server check ─────────────────────────────────────────────────────
if [[ "$BASE_URL" == *"127.0.0.1"* ]] || [[ "$BASE_URL" == *"localhost"* ]]; then
  echo "▶ Checking dev server…"
  if ! curl -s --max-time 4 "$BASE_URL" > /dev/null 2>&1; then
    echo "  Not running. Starting npm run dev…"
    (cd "$(dirname "$0")/.." && npm run dev > "$LOG_FILE" 2>&1) &
    DEV_PID=$!
    printf "  Waiting"
    for i in $(seq 1 40); do
      sleep 1
      printf "."
      if curl -s --max-time 2 "$BASE_URL" > /dev/null 2>&1; then
        echo " ready (${i}s)"
        break
      fi
      if [[ $i -eq 40 ]]; then
        echo ""
        echo "  ✗ Server did not start in 40s. Check: $LOG_FILE"
        exit 1
      fi
    done
  else
    echo "  ✓ Dev server already running"
  fi
fi

# ── Open Chrome, maximized ────────────────────────────────────────────────
echo "▶ Opening Chrome…"
osascript << 'CHROME'
tell application "Google Chrome"
  activate
  if (count of windows) = 0 then make new window
  set bounds of front window to {0, 25, 1440, 925}
end tell
CHROME
sleep 1.5

# ── Pick ffmpeg screen input ──────────────────────────────────────────────
# On macOS, device 1 is usually the built-in display. List with:
#   ffmpeg -f avfoundation -list_devices true -i ""
SCREEN_INPUT="${FFMPEG_SCREEN_INPUT:-1}"

echo "▶ Starting ffmpeg capture (screen input $SCREEN_INPUT)…"
ffmpeg -y \
  -f avfoundation \
  -framerate 30 \
  -capture_cursor 1 \
  -i "${SCREEN_INPUT}:none" \
  -vf "scale=1920:-2,format=yuv420p" \
  -c:v libx264 \
  -preset fast \
  -crf 20 \
  -movflags +faststart \
  "$OUTPUT_FILE" \
  > /tmp/ffmpeg-sergik-${TIMESTAMP}.log 2>&1 &
FFMPEG_PID=$!
echo "  ffmpeg PID: $FFMPEG_PID"

# Give ffmpeg a moment to initialise before the tour starts
sleep 2.5

# ── Run the JXA tour ─────────────────────────────────────────────────────
echo "▶ Running platform tour (this takes ~8–10 minutes)…"
echo ""
BASE_URL="$BASE_URL" \
ADMIN_EMAIL="$ADMIN_EMAIL" \
ADMIN_PASS="$ADMIN_PASS" \
  osascript -l JavaScript "$TOUR_SCRIPT"

# ── Stop recording ────────────────────────────────────────────────────────
echo ""
echo "▶ Stopping recording…"
sleep 2
kill "$FFMPEG_PID" 2>/dev/null || true
wait "$FFMPEG_PID" 2>/dev/null || true

# Verify output
if [[ -f "$OUTPUT_FILE" ]] && [[ $(stat -f%z "$OUTPUT_FILE" 2>/dev/null || echo 0) -gt 100000 ]]; then
  FILESIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  ✓  Demo saved: $OUTPUT_FILE  ($FILESIZE)"
  echo ""
  echo "  Preview : open \"$OUTPUT_FILE\""
  echo "  Trim    : ffmpeg -i in.mp4 -ss 00:00:05 -to 00:09:30 -c copy out.mp4"
  echo "═══════════════════════════════════════════════════════"
  open "$OUTPUT_FILE" 2>/dev/null || true
else
  echo ""
  echo "  ✗ Output file missing or too small. Check ffmpeg log:"
  echo "    /tmp/ffmpeg-sergik-${TIMESTAMP}.log"
  exit 1
fi
