"""seed_demo_decisions の regenerate session 生成を検証.

修正後の seed は 20% の input に対して 2-5 attempts の session を作る。
"""
from __future__ import annotations

from collections import Counter
from uuid import UUID

import pytest

from yesman_api.infrastructure.persistence.mock_repositories import MockStore


def test_seed_produces_regenerate_sessions():
    """少なくとも 1 件は同じ user_input_hash を持つ複数 decision (= session) が存在する."""
    store = MockStore()
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    seeded = store.seed_demo_decisions(user_id=user_id, days=30)
    assert seeded > 0

    hash_counts = Counter(d.user_input_hash for d in store.decisions.values())
    multi_attempt_hashes = [h for h, c in hash_counts.items() if c > 1]
    # seed=42 固定なので、20% × ~3.5 input/day × 30 days ≈ 21 session 期待
    # 最低 1 件あれば regenerate session 機能は動作している
    assert len(multi_attempt_hashes) >= 1, \
        f"No multi-attempt sessions found (hash_counts={hash_counts})"


def test_seed_session_ends_with_yes_or_no():
    """session 内では、最後の attempt のみ yes/no どちらも可、それ以外は必ず no."""
    store = MockStore()
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    store.seed_demo_decisions(user_id=user_id, days=30)

    # hash 別 group + created_at 順 sort
    from collections import defaultdict
    hash_groups: dict[str, list] = defaultdict(list)
    for d in store.decisions.values():
        hash_groups[d.user_input_hash].append(d)

    for hash_, items in hash_groups.items():
        if len(items) < 2:
            continue  # single attempt session は対象外
        items.sort(key=lambda d: d.created_at)
        # 最後以外はすべて "no"
        for d in items[:-1]:
            assert d.user_choice == "no", \
                f"Non-last attempt in session {hash_} should be 'no', got {d.user_choice}"


def test_seed_is_idempotent():
    """同じ user_id で 2 度呼んでも duplicate しない."""
    store = MockStore()
    user_id = UUID("11111111-1111-1111-1111-111111111111")
    first = store.seed_demo_decisions(user_id=user_id, days=30)
    second = store.seed_demo_decisions(user_id=user_id, days=30)
    assert first > 0
    assert second == 0  # 2 回目は skip
