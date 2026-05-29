#!/usr/bin/env bash
# update-design-docs 検証スクリプト
#   1. docs/design/*.md と README.md の Mermaid 図をすべてレンダリング検証
#   2. docs/architecture/*.drawio と *.drawio.svg の XML 妥当性検証
#
# 使い方: bash .claude/skills/update-design-docs/scripts/validate.sh [REPO_ROOT]
#   REPO_ROOT 省略時はこのスクリプトから 4 階層上 (リポジトリルート) を使う。
#
# 終了コード: 0 = 全 OK / 1 = 1 件以上 NG

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${1:-$(cd "$SCRIPT_DIR/../../../.." && pwd)}"
cd "$ROOT" || { echo "repo root が見つからない: $ROOT"; exit 1; }

echo "== REPO ROOT: $ROOT =="
FAIL=0

# ---------- mmdc (mermaid-cli) を探す ----------
find_mmdc() {
  if command -v mmdc >/dev/null 2>&1; then echo "mmdc"; return; fi
  for d in "$HOME"/.npm/_npx/*/node_modules/.bin/mmdc; do
    [ -x "$d" ] && { echo "$d"; return; }
  done
  echo ""  # 見つからなければ空 → npx fallback
}
MMDC="$(find_mmdc)"

run_mmdc() {  # run_mmdc <in.mmd> <out.svg>
  if [ -n "$MMDC" ]; then "$MMDC" -i "$1" -o "$2";
  else npx -y @mermaid-js/mermaid-cli -i "$1" -o "$2"; fi
}

# ---------- 1. Mermaid 検証 ----------
echo
echo "== Mermaid 検証 =="
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 対象 md を列挙 (docs/design/*.md + ルート README.md)
MD_FILES=()
while IFS= read -r f; do MD_FILES+=("$f"); done < <(ls docs/design/*.md 2>/dev/null; [ -f README.md ] && echo README.md)

# python3 で各 md から mermaid ブロックを抽出
python3 - "$WORK" "${MD_FILES[@]}" <<'PY'
import re, sys, pathlib
work = pathlib.Path(sys.argv[1]); idx = 0
for f in sys.argv[2:]:
    p = pathlib.Path(f)
    if not p.exists(): continue
    for m in re.finditer(r"```mermaid\n(.*?)```", p.read_text(encoding="utf-8"), re.S):
        idx += 1
        (work / f"{p.stem}__{idx:03d}.mmd").write_text(m.group(1), encoding="utf-8")
print(f"  抽出: {idx} ブロック")
PY

MOK=0; MNG=0
for f in "$WORK"/*.mmd; do
  [ -e "$f" ] || break
  if run_mmdc "$f" "$f.svg" >/dev/null 2>"$f.err"; then
    MOK=$((MOK+1))
  else
    MNG=$((MNG+1)); FAIL=1
    echo "  NG: $(basename "$f")"; sed 's/^/      /' "$f.err" | grep -m3 -i "error" || true
  fi
done
echo "  Mermaid: OK=$MOK NG=$MNG"
[ -z "$MMDC" ] && [ "$MOK" = 0 ] && echo "  (mmdc 未検出。ネットワークなしだと npx fallback も失敗する点に注意)"

# ---------- 2. drawio / SVG XML 妥当性 ----------
echo
echo "== drawio / SVG XML 妥当性 =="
XOK=0; XNG=0
for f in docs/architecture/*.drawio docs/architecture/*.drawio.svg; do
  [ -e "$f" ] || continue
  if python3 -c "import xml.etree.ElementTree as ET,sys; ET.parse(sys.argv[1])" "$f" 2>/tmp/_xml.err; then
    XOK=$((XOK+1)); echo "  OK: $f"
  else
    XNG=$((XNG+1)); FAIL=1; echo "  NG: $f"; sed 's/^/      /' /tmp/_xml.err | head -3
  fi
done
echo "  XML: OK=$XOK NG=$XNG"

echo
if [ "$FAIL" = 0 ]; then echo "== 全検証 PASS =="; else echo "== 検証に NG あり =="; fi
exit $FAIL
