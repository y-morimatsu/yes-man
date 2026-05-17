"""Integration test placeholder — POST /v1/personas/{id}/report.

TODO: TestClient + Mock backend で実装:
- 正常 201 + audit log
- 同一 reporter 二重報告 → 409
- 閾値到達で persona_repo.block 呼ばれて auto_block audit log 出力
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.skip(reason="integration placeholder — see TODO in module docstring")
