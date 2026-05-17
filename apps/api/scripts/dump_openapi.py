"""FastAPI OpenAPI schema を apps/api/openapi.json に dump.

U7c Infrastructure Design §2 + ultrathink C1 (server 起動不要) + I1 (validate_runtime skip).
CI / dev / pre-commit hook で呼び、git diff で API spec 変更を可視化.

実行:
    cd apps/api && python scripts/dump_openapi.py
"""
from __future__ import annotations

import json
import os
from pathlib import Path


# ultrathink I1: import 前に全 backend を mock に固定、validate_runtime を pass させる.
# dump 用途では route 列挙のみ必要、backend の real connection は不要.
os.environ.setdefault("APP_ENV", "dev")
os.environ.setdefault("AUTH_BACKEND", "mock")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("VOICE_BACKEND", "mock")
os.environ.setdefault("STORAGE_BACKEND", "mock")
os.environ.setdefault("EVENT_BACKEND", "sync")
os.environ.setdefault("LEARNING_CONSUMER_ENABLED", "false")

from yesman_api.main import app  # noqa: E402 (env setup 後の import)


OUT = Path(__file__).parent.parent / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUT.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
