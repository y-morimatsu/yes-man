"""Integration test placeholder — /v1/personas/* endpoints (U-Persona).

TODO: TestClient + Mock backend で実装:
- GET /v1/personas/me (own custom + 自分 owner の builtin 除外)
- GET /v1/personas/builtin (3 件)
- POST /v1/personas/me (Moderator 通過 → 201、reject → 422)
- PATCH /v1/personas/{id} (own update + builtin_immutable 403)
- DELETE /v1/personas/{id} (soft_delete + 204)
- PATCH /v1/personas/{id}/share (公開時再 Moderation)
- GET /v1/personas/shared (page/sort/匿名化 確認)
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.skip(reason="integration placeholder — see TODO in module docstring")
