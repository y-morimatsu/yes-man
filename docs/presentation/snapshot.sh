#!/usr/bin/env bash
# YesMan プレゼン資料のスナップショット作成スクリプト
#
# 使い方:
#   ./snapshot.sh           # 日時のみのファイル名で保存
#   ./snapshot.sh "ラベル"  # 末尾にラベル付与: yesman-presentation-YYYYMMDD-HHMMSS-<label>.html
#
# 保存先: ./versions/yesman-presentation-YYYYMMDD-HHMMSS[-<label>].html

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/index.html"
DEST_DIR="${SCRIPT_DIR}/versions"

if [[ ! -f "${SRC}" ]]; then
  echo "❌ ${SRC} が見つかりません" >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

TS="$(date +%Y%m%d-%H%M%S)"
LABEL="${1:-}"
if [[ -n "${LABEL}" ]]; then
  # ラベルを安全な文字だけに正規化 (英数 / ハイフン / アンダースコア)
  SAFE_LABEL="$(echo "${LABEL}" | tr -c '[:alnum:]_-' '-' | sed 's/--*/-/g; s/^-//; s/-$//')"
  FILENAME="yesman-presentation-${TS}-${SAFE_LABEL}.html"
else
  FILENAME="yesman-presentation-${TS}.html"
fi

DEST="${DEST_DIR}/${FILENAME}"
cp "${SRC}" "${DEST}"

echo "✓ snapshot 作成: ${DEST}"
echo ""
echo "📁 既存スナップショット (${DEST_DIR}):"
ls -lht "${DEST_DIR}" | tail -n +2
