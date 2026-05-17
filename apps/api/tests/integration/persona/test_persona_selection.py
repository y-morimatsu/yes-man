"""Integration test placeholder — /v1/persona-selections/me (GET/PUT/DELETE).

TODO: TestClient + Mock backend で実装:
- GET 未設定 → builtin 3 種 fallback
- PUT 正常 (上限 3 / アクセス可能) → 200
- PUT 上限超過 → 422 invalid_selection_size
- PUT 重複 → 422 duplicate_personas
- PUT 不可 persona (他人 private / blocked) → 422 persona_not_accessible
- DELETE → 204、その後 GET で builtin 復帰
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.skip(reason="integration placeholder — see TODO in module docstring")
