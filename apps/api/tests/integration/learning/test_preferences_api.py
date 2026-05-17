"""Preference API integration test — GET → PATCH → DELETE → GET (placeholder + TODO).

実装方針:
- TestClient + Mock backend (AUTH_BACKEND=mock + STORAGE_BACKEND=mock)
- GET 初回 → ColdStart 経由の初期 profile
- PATCH (clip 動作確認、100.0 → 1.0)
- DELETE
- GET → ColdStart 再推定で非空 profile
"""
from __future__ import annotations

import pytest


@pytest.mark.integration
def test_preferences_api_flow_placeholder():
    """TODO: 将来 PR で TestClient + Mock backend で full flow 実装."""
    pass
