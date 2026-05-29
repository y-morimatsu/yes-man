#!/usr/bin/env bash
# convert.sh — Playwright webm → mp4 + GIF 変換 (ffmpeg)
#
# 使い方:
#   bash docs/demo/scripts/convert.sh [<INPUT_WEBM>]
#
# 引数省略時は docs/demo/output/ 内で最新の page*.webm を自動選択。
# 出力: docs/demo/output/YesMan-tour-<timestamp>.{webm,mp4,gif}
#       (元 webm は YesMan-tour-<timestamp>.webm に rename)
set -euo pipefail

cd "$(dirname "$0")/.."  # docs/demo
OUTPUT_DIR="$(pwd)/output"

INPUT="${1:-}"
if [ -z "$INPUT" ]; then
  # 最新の page*.webm を選ぶ
  INPUT="$(ls -t "$OUTPUT_DIR"/page*.webm 2>/dev/null | head -1)"
fi
if [ ! -f "$INPUT" ]; then
  echo "❌ 入力 webm が見つかりません: $INPUT" >&2
  echo "先に 'node tests/e2e/scripts/record-tour.mjs' を実行してください" >&2
  exit 1
fi

TS="$(date +%Y%m%d-%H%M%S)"
BASE="YesMan-tour-$TS"

echo "▶ rename: $(basename "$INPUT") → $BASE.webm"
mv "$INPUT" "$OUTPUT_DIR/$BASE.webm"

echo "▶ mp4 変換 (H.264 + AAC、互換性最大)"
ffmpeg -hide_banner -loglevel warning -y \
  -i "$OUTPUT_DIR/$BASE.webm" \
  -c:v libx264 -preset slow -crf 22 \
  -pix_fmt yuv420p -movflags +faststart \
  "$OUTPUT_DIR/$BASE.mp4"

echo "▶ GIF 変換 (palettegen で高品質、12fps + 393px width)"
ffmpeg -hide_banner -loglevel warning -y \
  -i "$OUTPUT_DIR/$BASE.webm" \
  -vf "fps=12,scale=393:-1:flags=lanczos,palettegen=stats_mode=full" \
  "$OUTPUT_DIR/$BASE.palette.png"

ffmpeg -hide_banner -loglevel warning -y \
  -i "$OUTPUT_DIR/$BASE.webm" \
  -i "$OUTPUT_DIR/$BASE.palette.png" \
  -lavfi "fps=12,scale=393:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=5" \
  "$OUTPUT_DIR/$BASE.gif"

rm -f "$OUTPUT_DIR/$BASE.palette.png"

echo "✅ 完了:"
ls -lh "$OUTPUT_DIR/$BASE".*
