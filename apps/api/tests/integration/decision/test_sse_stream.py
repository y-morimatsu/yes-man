"""SSE chunk 順序検証 — start → domain → utterance × N → proposal → complete (ultrathink Imp2)."""
from __future__ import annotations

import pytest


@pytest.mark.integration
def test_sse_event_order_placeholder():
    """SSE event 順序の integration test 基本構造. 詳細実装は将来 PR で.

    検証項目:
    - 最初の event は start (decision_id が事前確定で client に通知される)
    - 次に domain
    - utterance × N (持続中、複数)
    - 最後に proposal → complete
    """
    # TODO: TestClient.stream() で event_stream をパース、順序を assertion
    pass
