#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# DDA / SP25 H.264 Show Compressor
# ------------------------------------------------------------
# Matches:
# Vimeo 30 FPS High Quality 1080p HD DDA 2020
#
# - 1920x1080
# - 30 fps
# - H.264 High Profile 4.2
# - VBR 2-pass
# - Target 18 Mbps
# - Max 20 Mbps
# - AAC Stereo 48kHz 320kbps
# ============================================================

SPINNER=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)

OUTDIR="compressed_dda"
INPUT_PATH="${1:-}"

# ------------------------------------------------------------
# Utilities
# ------------------------------------------------------------

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo
    echo "✗ Missing dependency: $1"
    echo
    echo "Install with:"
    echo "  brew install ffmpeg"
    echo
    exit 1
  }
}

pretty_time() {
  local s="$1"
  printf "%02d:%02d:%02d" \
    "$((s/3600))" \
    "$(((s%3600)/60))" \
    "$((s%60))"
}

draw_bar() {
  local percent="$1"
  local width=34

  local filled=$(( percent * width / 100 ))
  local empty=$(( width - filled ))

  printf "["
  for ((i=0; i<filled; i++)); do
    printf "█"
  done

  for ((i=0; i<empty; i++)); do
    printf "░"
  done

  printf "] %3d%%" "$percent"
}

duration_seconds() {
  ffprobe -v error \
    -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 \
    "$1" | awk '{printf "%d", $1}'
}

clean_path() {
  local p="$1"

  p="${p%\"}"
  p="${p#\"}"
  p="${p%\'}"
  p="${p#\'}"

  echo "$p"
}

# ------------------------------------------------------------
# Encode
# ------------------------------------------------------------

encode_one() {
  local input="$1"

  local base
  local output
  local passlog
  local duration

  base="$(basename "${input%.*}")"

  output="$OUTDIR/${base}_h264_dda.mp4"
  passlog="$OUTDIR/${base}_ffmpeg2pass"

  duration="$(duration_seconds "$input")"

  echo
  echo "╭──────────────────────────────────────────────"
  echo "│ Input:  $input"
  echo "│ Output: $output"
  echo "│ Target: 1080p / 30fps / H.264 / AAC"
  echo "╰──────────────────────────────────────────────"

  # ==========================================================
  # PASS 1
  # ==========================================================

  echo
  echo "Pass 1/2: analyzing video..."

  idx=0

  ffmpeg -y -hide_banner -nostats \
    -i "$input" \
    -map 0:v:0 -an \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p" \
    -r 30 \
    -c:v libx264 \
    -profile:v high \
    -level:v 4.2 \
    -b:v 18M \
    -minrate 2M \
    -maxrate 20M \
    -bufsize 40M \
    -g 90 \
    -keyint_min 90 \
    -preset slow \
    -pass 1 \
    -passlogfile "$passlog" \
    -f mp4 \
    -progress pipe:1 \
    /dev/null 2>/dev/null | while IFS='=' read -r key value; do

      if [[ "$key" == "out_time_ms" && "$duration" -gt 0 ]]; then

        now_s=$(( value / 1000000 ))
        percent=$(( now_s * 100 / duration ))

        (( percent > 100 )) && percent=100

        spin="${SPINNER[$((idx % ${#SPINNER[@]}))]}"
        idx=$((idx + 1))

        printf "\r%s " "$spin"
        draw_bar "$percent"

        printf "  %s / %s" \
          "$(pretty_time "$now_s")" \
          "$(pretty_time "$duration")"
      fi
    done

  printf "\r✓ "
  draw_bar 100
  echo "  pass 1 complete"

  # ==========================================================
  # PASS 2
  # ==========================================================

  echo
  echo "Pass 2/2: writing final MP4..."

  idx=0

  ffmpeg -y -hide_banner -nostats \
    -i "$input" \
    -map 0:v:0 \
    -map 0:a? \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,format=yuv420p" \
    -r 30 \
    -c:v libx264 \
    -profile:v high \
    -level:v 4.2 \
    -b:v 18M \
    -minrate 2M \
    -maxrate 20M \
    -bufsize 40M \
    -g 90 \
    -keyint_min 90 \
    -preset slow \
    -pass 2 \
    -passlogfile "$passlog" \
    -c:a aac \
    -b:a 320k \
    -ar 48000 \
    -ac 2 \
    -movflags +faststart \
    -progress pipe:1 \
    "$output" 2>/dev/null | while IFS='=' read -r key value; do

      if [[ "$key" == "out_time_ms" && "$duration" -gt 0 ]]; then

        now_s=$(( value / 1000000 ))
        percent=$(( now_s * 100 / duration ))

        (( percent > 100 )) && percent=100

        spin="${SPINNER[$((idx % ${#SPINNER[@]}))]}"
        idx=$((idx + 1))

        printf "\r%s " "$spin"
        draw_bar "$percent"

        printf "  %s / %s" \
          "$(pretty_time "$now_s")" \
          "$(pretty_time "$duration")"
      fi
    done

  printf "\r✓ "
  draw_bar 100
  echo "  pass 2 complete"

  rm -f "${passlog}"*

  echo
  echo "✓ Finished:"
  echo "  $output"
}

# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

need_cmd ffmpeg
need_cmd ffprobe

echo
echo "╔══════════════════════════════════════════════╗"
echo "║      DDA H.264 SHOW COMPRESSOR              ║"
echo "║                                              ║"
echo "║  1080p · 30fps · H.264 · AAC · MP4          ║"
echo "╚══════════════════════════════════════════════╝"

if [[ -z "$INPUT_PATH" ]]; then
  echo
  read -rp "Drop a video file or folder here and press Return: " INPUT_PATH
fi

INPUT_PATH="$(clean_path "$INPUT_PATH")"

mkdir -p "$OUTDIR"

if [[ -f "$INPUT_PATH" ]]; then

  encode_one "$INPUT_PATH"

elif [[ -d "$INPUT_PATH" ]]; then

  shopt -s nullglob nocaseglob

  files=(
    "$INPUT_PATH"/*.mp4
    "$INPUT_PATH"/*.mov
    "$INPUT_PATH"/*.m4v
  )

  if [[ ${#files[@]} -eq 0 ]]; then
    echo
    echo "✗ No video files found."
    echo
    exit 1
  fi

  echo
  echo "Found ${#files[@]} video file(s)."

  count=1

  for f in "${files[@]}"; do

    echo
    echo "================================================"
    echo "FILE $count / ${#files[@]}"
    echo "================================================"

    encode_one "$f"

    ((count++))

  done

else

  echo
  echo "✗ Invalid file or folder:"
  echo "  $INPUT_PATH"
  echo
  exit 1

fi

echo
echo "╔══════════════════════════════════════════════╗"
echo "║ Done.                                       ║"
echo "║                                              ║"
echo "║ Output folder:                              ║"
printf "║ %-44s ║\n" "$OUTDIR"
echo "╚══════════════════════════════════════════════╝"
echo
