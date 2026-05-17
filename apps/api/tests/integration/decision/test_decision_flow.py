"""E2E: Mock LLM + Mock Repo で `/request` → `/choice yes` → `/scores/me` 一気通貫.

TestClient で main.create_app() を立ち上げる前提.
"""
from __future__ import annotations

import os

import pytest

# このテストは将来 TestClient ベースで実装される (現状は scaffolding)。
# Mock backend で uvicorn 起動 + curl での動作確認は RUNBOOK §8 に手順あり。


@pytest.mark.integration
def test_placeholder_decision_flow():
    """Phase I の integration テスト基本構造を確保. 詳細実装は将来 PR で."""
    # TODO: TestClient + Mock backend で:
    # 1. POST /v1/decisions/request → 200 + decision_id
    # 2. POST /v1/decisions/{id}/choice {yes} → 200
    # 3. GET /v1/decisions/{id}/nudge → 200 ready (BackgroundTasks 完了後)
    # 4. GET /v1/scores/me → 200 + ratio
    pass
