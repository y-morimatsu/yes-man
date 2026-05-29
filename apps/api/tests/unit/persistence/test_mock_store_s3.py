"""Unit tests for MockStore S3 persistence (infrastructure/persistence/mock_repositories.py).

boto3 S3 client を MagicMock に差し替え、load_from_s3 / save_to_s3 の
成功・NoSuchKey・破損 pickle・S3 未設定・merge を外部 AWS なしで網羅する。
"""
from __future__ import annotations

import pickle
import uuid

from unittest.mock import MagicMock

from yesman_api.domain.persistence.models import Profile
from yesman_api.infrastructure.persistence.mock_repositories import MockStore

_KEYS = (
    "profiles",
    "decisions",
    "preference_profiles",
    "silence_logs",
    "personas",
    "persona_reports",
    "user_persona_selections",
)


def _store_with_mock_s3():  # noqa: ANN202
    store = MockStore()  # boto3 を呼ばずに構築
    store._s3 = MagicMock()
    store._s3_bucket = "bucket"
    store._s3_key = "state.pickle"
    no_such_key = type("NoSuchKey", (Exception,), {})
    store._s3.exceptions.NoSuchKey = no_such_key
    return store, no_such_key


def _empty_state(**overrides) -> dict:  # noqa: ANN003
    state = {k: {} for k in _KEYS}
    state.update(overrides)
    return state


def _body(data: bytes) -> dict:
    reader = MagicMock()
    reader.read.return_value = data
    return {"Body": reader}


def test_load_no_s3_returns_false() -> None:
    store = MockStore()  # s3 未設定
    assert store.load_from_s3() is False


def test_save_no_s3_returns_false() -> None:
    store = MockStore()
    assert store.save_to_s3() is False


def test_load_success_restores_state() -> None:
    store, _ = _store_with_mock_s3()
    uid = uuid.uuid4()
    profile = Profile(user_id=uid, email="a@example.com")
    state = _empty_state(profiles={uid: profile})
    store._s3.get_object.return_value = _body(pickle.dumps(state))

    assert store.load_from_s3() is True
    assert uid in store.profiles


def test_load_no_such_key_returns_false() -> None:
    store, no_such_key = _store_with_mock_s3()
    store._s3.get_object.side_effect = no_such_key()
    assert store.load_from_s3() is False


def test_load_corrupt_pickle_returns_false() -> None:
    store, _ = _store_with_mock_s3()
    store._s3.get_object.return_value = _body(b"not-a-pickle")
    assert store.load_from_s3() is False


def test_save_success_no_existing_state() -> None:
    store, no_such_key = _store_with_mock_s3()
    uid = uuid.uuid4()
    store.profiles[uid] = Profile(user_id=uid, email="a@example.com")
    store._s3.get_object.side_effect = no_such_key()

    assert store.save_to_s3() is True
    store._s3.put_object.assert_called_once()


def test_save_merges_with_existing_state() -> None:
    store, _ = _store_with_mock_s3()
    other = uuid.uuid4()
    existing = _empty_state(profiles={other: Profile(user_id=other, email="b@example.com")})
    store._s3.get_object.return_value = _body(pickle.dumps(existing))

    mine = uuid.uuid4()
    store.profiles[mine] = Profile(user_id=mine, email="me@example.com")

    assert store.save_to_s3() is True
    # merge 後は S3 既存 + local 両方が残る
    assert mine in store.profiles and other in store.profiles
