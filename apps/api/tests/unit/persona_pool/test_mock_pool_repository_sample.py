"""Unit tests for MockPoolRepository.sample / get_by_id (infrastructure/persistence/mock_pool_repository.py).

fixture seed されたプールに対し sample / get_by_id / citation を外部依存なしで検証する。
"""
from __future__ import annotations

from uuid import uuid4

from yesman_api.infrastructure.persistence.mock_pool_repository import MockPoolRepository


def _repo() -> MockPoolRepository:
    return MockPoolRepository(seed_fixtures=True)


def test_sample_returns_specs() -> None:
    repo = _repo()
    res = repo.sample(n=2, excluding_sub="unknown-sub")
    assert 0 < len(res) <= 2


def test_sample_zero_returns_empty() -> None:
    repo = _repo()
    assert repo.sample(n=0, excluding_sub="x") == []


def test_get_by_id_found_and_unknown() -> None:
    repo = _repo()
    sampled = repo.sample(n=1, excluding_sub="unknown-sub")
    assert sampled
    found = repo.get_by_id(sampled[0].persona_id, excluding_sub="unknown-sub")
    assert found is not None
    assert repo.get_by_id(uuid4(), excluding_sub="unknown-sub") is None
