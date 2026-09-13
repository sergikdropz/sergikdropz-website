#!/bin/bash
# ============================================================
# SERGIKDROPZ — 60-Second Social Clip Renderer
#
# Extracts hero segments from the full demo recording,
# mixes SERGIK's own music underneath, and exports a
# social-ready MP4 (1080p, H.264, AAC, 60-second cut).
#
# Usage:
#   bash scripts/render-60s.sh [path-to-full-demo.mp4]
#
# If no path given, uses the most recent sergik-demo-*.mp4
# on the Desktop.
#
# Output:
#   ~/Desktop/sergik-60s-TIMESTAMP.mp4
# ============================================================

set -euo pipefail

# ── Pick input file ───────────────────────────────────────────────────────
if [[ -n "${1:-}" && -f "$1" ]]; then
  DEMO_FILE="$1"
else
  DEMO_FILE=$(ls -t ~/Desktop/sergik-demo-*.mp4 2>/dev/null | head -1)
  if [[ -z "$DEMO_FILE" ]]; then
    echo "✗  No demo recording found on Desktop."
    echo "   Run:  bash scripts/demo-record.sh  first."
    exit 1
  fi
fi

TIMESTAMP=$(date +"%Y-%m-%d-%H-%M")
OUTPUT_FILE="$HOME/Desktop/sergik-60s-${TIMESTAMP}.mp4"
WORK_DIR="/tmp/sergik-render-${TIMESTAMP}"
mkdir -p "$WORK_DIR"

# ── Music track (DURO — instrumental, no vocals) ──────────────────────────
# Pick best available track from SERGIK's collection
MUSIC_CANDIDATES=(
  "/Users/machd/Downloads/DURO - no breakdown no vox 11.30.22.mp3"
  "/Users/machd/Downloads/Cosmic.m4a"
  "/Users/machd/Downloads/WUB V2 light master.wav"
  "/Users/machd/Downloads/SERG x Batt - nuubee.wav"
)

MUSIC_FILE=""
for candidate in "${MUSIC_CANDIDATES[@]}"; do
  if [[ -f "$candidate" ]]; then
    MUSIC_FILE="$candidate"
    break
  fi
done

if [[ -z "$MUSIC_FILE" ]]; then
  echo "✗  No music file found. Add a track to /Users/machd/Downloads/"
  exit 1
fi

# ── Get actual duration of full demo ─────────────────────────────────────
DEMO_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$DEMO_FILE" | awk '{printf "%.1f", $1}')
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  SERGIKDROPZ  |  60-Second Social Clip"
echo "═══════════════════════════════════════════════════════"
echo "  Input  : $(basename "$DEMO_FILE")  (${DEMO_DUR}s)"
echo "  Music  : $(basename "$MUSIC_FILE")"
echo "  Output : $OUTPUT_FILE"
echo ""

# ── Segment timestamps ────────────────────────────────────────────────────
# These are calibrated to the demo-tour.js timing.
# If the full demo is shorter/longer than expected, offsets auto-scale.
# Segments: [start_sec, duration_sec, label]
#
# Adjust these if page loads were faster/slower on your machine:

SCALE=$(echo "$DEMO_DUR / 570" | bc -l 2>/dev/null || echo "1.0") # 570s = expected ~9.5min

# Raw target times (in seconds, at nominal 9.5-min recording)
declare -a SEG_STARTS=(  0  40 185 305 460 565 )
declare -a SEG_DURS=(   10  60  25  22  18  20 )
declare -a SEG_LABELS=( "Open" "SonicDNA" "Vault" "FanJourney" "AIAdmin" "Close" )

# Scale to actual recording length
declare -a SCALED_STARTS=()
for i in "${!SEG_STARTS[@]}"; do
  SCALED=$(echo "${SEG_STARTS[$i]} * $SCALE" | bc | awk '{printf "%.1f", $1}')
  SCALED_STARTS+=("$SCALED")
done

# Cap last segment to actual duration
LAST_IDX=$(( ${#SCALED_STARTS[@]} - 1 ))
LAST_START="${SCALED_STARTS[$LAST_IDX]}"
LAST_DUR="${SEG_DURS[$LAST_IDX]}"
MAX_END=$(echo "$LAST_START + $LAST_DUR" | bc)
if (( $(echo "$MAX_END > $DEMO_DUR" | bc -l) )); then
  LAST_DUR=$(echo "$DEMO_DUR - $LAST_START - 1" | bc | awk '{printf "%.0f", $1}')
  SEG_DURS[$LAST_IDX]=$LAST_DUR
fi

echo "▶ Segments:"
for i in "${!SCALED_STARTS[@]}"; do
  printf "  %-12s  %6.1fs → %6.1fs  (%ds)\n" \
    "${SEG_LABELS[$i]}" \
    "${SCALED_STARTS[$i]}" \
    "$(echo "${SCALED_STARTS[$i]} + ${SEG_DURS[$i]}" | bc)" \
    "${SEG_DURS[$i]}"
done
echo ""

# ── Extract segments ──────────────────────────────────────────────────────
echo "▶ Extracting segments…"
SEG_FILES=()
for i in "${!SCALED_STARTS[@]}"; do
  SEG_OUT="$WORK_DIR/seg_$(printf '%02d' $i).mp4"
  ffmpeg -y -loglevel error \
    -ss "${SCALED_STARTS[$i]}" -t "${SEG_DURS[$i]}" \
    -i "$DEMO_FILE" \
    -vf "scale=1920:-2:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset fast -crf 18 \
    -an \
    "$SEG_OUT"
  SEG_FILES+=("$SEG_OUT")
  echo "  ✓  ${SEG_LABELS[$i]}  ($(du -sh "$SEG_OUT" | cut -f1))"
done

# ── Build concat list ─────────────────────────────────────────────────────
CONCAT_LIST="$WORK_DIR/concat.txt"
> "$CONCAT_LIST"
for f in "${SEG_FILES[@]}"; do
  echo "file '$f'" >> "$CONCAT_LIST"
done

# ── Concatenate video ─────────────────────────────────────────────────────
echo "▶ Concatenating…"
RAW_VIDEO="$WORK_DIR/raw_video.mp4"
ffmpeg -y -loglevel error \
  -f concat -safe 0 -i "$CONCAT_LIST" \
  -c:v libx264 -preset fast -crf 17 \
  "$RAW_VIDEO"

# Measure actual duration
VIDEO_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$RAW_VIDEO" | awk '{printf "%.1f", $1}')
echo "  ✓  Combined: ${VIDEO_DUR}s"

# ── Prepare music: trim, fade out ─────────────────────────────────────────
echo "▶ Preparing music track…"
MUSIC_TRIMMED="$WORK_DIR/music.aac"
FADE_START=$(echo "$VIDEO_DUR - 3" | bc | awk '{printf "%.1f", $1}')

ffmpeg -y -loglevel error \
  -i "$MUSIC_FILE" \
  -t "$VIDEO_DUR" \
  -af "afade=t=in:st=0:d=1.5,afade=t=out:st=${FADE_START}:d=3,loudnorm=I=-16:LRA=11:TP=-1.5,volume=0.35" \
  -c:a aac -b:a 192k \
  "$MUSIC_TRIMMED"

# ── Merge video + music ───────────────────────────────────────────────────
echo "▶ Merging video + music…"
MERGED="$WORK_DIR/merged.mp4"
ffmpeg -y -loglevel error \
  -i "$RAW_VIDEO" \
  -i "$MUSIC_TRIMMED" \
  -c:v copy -c:a aac -b:a 192k \
  -shortest \
  "$MERGED"

# ── Add title card intro (2s black + text) ────────────────────────────────
echo "▶ Adding title card…"
TITLE_CARD="$WORK_DIR/title.mp4"
ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=black:s=1920x1080:d=2:r=30" \
  -f lavfi -i "anullsrc=cl=stereo:r=44100" \
  -vf "drawtext=text='SERGIKDROPZ.COM':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=(h-text_h)/2-30:fontfile=/System/Library/Fonts/Helvetica.ttc:box=0,
       drawtext=text='Underground Electronic Music  |  Direct to Fans':fontcolor=0xaaaaaa:fontsize=26:x=(w-text_w)/2:y=(h/2)+20:fontfile=/System/Library/Fonts/Helvetica.ttc" \
  -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -t 2 \
  "$TITLE_CARD"

# ── Add title to concat ───────────────────────────────────────────────────
FINAL_CONCAT="$WORK_DIR/final_concat.txt"
echo "file '$TITLE_CARD'" > "$FINAL_CONCAT"
echo "file '$MERGED'" >> "$FINAL_CONCAT"

echo "▶ Final assembly…"
ASSEMBLED="$WORK_DIR/assembled.mp4"
ffmpeg -y -loglevel error \
  -f concat -safe 0 -i "$FINAL_CONCAT" \
  -c:v libx264 -preset medium -crf 17 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "$ASSEMBLED"

# ── Add end card (2s) ─────────────────────────────────────────────────────
echo "▶ Adding end card…"
FINAL_DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$ASSEMBLED" | awk '{printf "%.1f", $1}')
TOTAL_WITH_CARDS=$(echo "$FINAL_DUR + 2" | bc | awk '{printf "%.0f", $1}')

END_CARD="$WORK_DIR/end.mp4"
ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=black:s=1920x1080:d=2.5:r=30" \
  -f lavfi -i "anullsrc=cl=stereo:r=44100" \
  -vf "drawtext=text='sergikdropz.com':fontcolor=0xdb2777:fontsize=52:x=(w-text_w)/2:y=(h-text_h)/2-20:fontfile=/System/Library/Fonts/Helvetica.ttc,
       drawtext=text='Listen  |  Buy  |  Join':fontcolor=0x9ca3af:fontsize=28:x=(w-text_w)/2:y=(h/2)+30:fontfile=/System/Library/Fonts/Helvetica.ttc" \
  -c:v libx264 -preset fast -crf 17 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -t 2.5 \
  "$END_CARD"

FULL_CONCAT="$WORK_DIR/full_concat.txt"
echo "file '$ASSEMBLED'" > "$FULL_CONCAT"
echo "file '$END_CARD'" >> "$FULL_CONCAT"

ffmpeg -y -loglevel error \
  -f concat -safe 0 -i "$FULL_CONCAT" \
  -c:v libx264 -preset medium -crf 16 \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  "$OUTPUT_FILE"

# ── Final stats ───────────────────────────────────────────────────────────
if [[ -f "$OUTPUT_FILE" ]]; then
  FILESIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
  FINAL=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$OUTPUT_FILE" | awk '{printf "%.1f", $1}')
  rm -rf "$WORK_DIR"
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  ✓  60s clip ready: $(basename "$OUTPUT_FILE")"
  echo "     Duration : ${FINAL}s  |  Size: ${FILESIZE}"
  echo "     Location : $OUTPUT_FILE"
  echo ""
  echo "  Preview  : open \"$OUTPUT_FILE\""
  echo "  Upload   : Ready for Instagram Reels, TikTok, YouTube Shorts"
  echo ""
  echo "  Segment  timeline:"
  echo "  0:00-0:02  Title card  — SERGIKDROPZ.COM"
  echo "  0:02-0:12  Homepage"
  echo "  0:12-1:12  Sonic DNA Search  ← wow moment"
  echo "  1:12-1:37  Vault / Music Library"
  echo "  1:37-1:59  Fan Journey Funnel"
  echo "  1:59-2:17  AI Admin Assistant"
  echo "  2:17-2:37  Closing + homepage"
  echo "  2:37-2:40  End card  — sergikdropz.com"
  echo "═══════════════════════════════════════════════════════"
  open "$OUTPUT_FILE" 2>/dev/null || true
else
  echo "✗  Render failed. Check /tmp/sergik-render-*/  for partial files."
  exit 1
fi
