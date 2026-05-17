"""SSE 切断後の background 永続化検証 (FR-CV-09 / AVAIL-U4-07 best-effort)."""
from __future__ import annotations

import pytest


@pytest.mark.integration
def test_sse_disconnect_background_persists_placeholder():
    """SSE client 切断後、DecisionRepository.get(decision_id) で永続化を確認.

    実装方針:
    - TestClient.stream() で接続を途中で close
    - asyncio.sleep で background task 完了を待つ
    - decision_repo.get(decision_id) が Decision を返すこと
    """
    # TODO: 実装は将来 PR で
    pass
