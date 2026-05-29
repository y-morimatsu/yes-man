"""Unit tests for MockStore __init__(s3) / reset / seed_builtin (mock_repositories.py).

boto3 S3 client 生成 (region env のみ、ネットワークなし) と reset + builtin seed を検証。
"""
from __future__ import annotations

import uuid

from yesman_api.domain.persistence.models import Profile
from yesman_api.infrastructure.persistence.mock_repositories import MockStore


def test_init_with_s3_bucket_creates_client(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-northeast-1")
    store = MockStore(s3_bucket="bucket", s3_key="state.pickle")
    assert store._s3 is not None  # boto3 client 生成パス (offline)
    assert store._s3_bucket == "bucket"


def test_reset_clears_and_seeds_builtin() -> None:
    store = MockStore()
    uid = uuid.uuid4()
    store.profiles[uid] = Profile(user_id=uid, email="a@example.com")
    store.reset(seed_builtin=True)
    assert uid not in store.profiles  # クリア済み
    assert any(p.is_builtin for p in store.personas.values())  # builtin seed 済み


def test_init_seed_builtin() -> None:
    store = MockStore(seed_builtin=True)
    builtin = [p for p in store.personas.values() if p.is_builtin]
    assert len(builtin) >= 3  # 慎重派 / 楽観派 / 効率派
