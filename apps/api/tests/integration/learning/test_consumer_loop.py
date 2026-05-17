"""SQS Consumer full loop integration test (placeholder + TODO).

実装方針:
- Mock SQS client (boto3 stub) + Mock Repositories
- DecisionConfirmed publish → receive_messages → builder → upsert を一気通貫
- delete_message 呼ばれることを assertion
"""
from __future__ import annotations

import pytest


@pytest.mark.integration
def test_consumer_full_loop_placeholder():
    """TODO: 将来 PR で boto3 stub + Mock Repo + Supervisor 統合テスト実装."""
    pass
