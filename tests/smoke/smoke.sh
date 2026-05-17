#!/bin/sh
# Smoke test (U-Test FD §6 + NFR Design §6).
#
# deploy 後の sanity check、3 step.
# 使用例:
#   API_URL=https://api.yesman.example.com WEB_URL=https://yesman.example.com bash tests/smoke/smoke.sh

set -e

API="${API_URL:-http://localhost:8000}"
WEB="${WEB_URL:-http://localhost:5173}"

echo "[1/3] ${API}/health"
curl -fsS "${API}/health" > /dev/null

echo "[2/3] ${API}/v1/profiles/me without auth → 401"
status=$(curl -s -o /dev/null -w "%{http_code}" "${API}/v1/profiles/me")
if [ "${status}" != "401" ] && [ "${status}" != "403" ]; then
  echo "  Expected 401/403, got ${status}" >&2
  exit 1
fi

echo "[3/3] ${WEB}/ contains YesMan title"
if ! curl -fsS "${WEB}/" | grep -q "<title>YesMan</title>"; then
  echo "  Title not found in ${WEB}/" >&2
  exit 1
fi

echo "✓ Smoke test passed"
