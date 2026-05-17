"""PreferenceProfileLoader unit test — load + load_for_prompt + YAML format."""
from __future__ import annotations

import json
import uuid as _uuid

import pytest

from tests.fixtures.learning import preference_profile_factory
from yesman_api.domain.learning.cold_start import ColdStartEstimator
from yesman_api.domain.learning.loader import PreferenceProfileLoader, _format_yaml
from yesman_api.domain.persistence.models import PreferenceProfile, Profile


class _StubPreferenceRepo:
    def __init__(self, profile=None):
        self.profile = profile
        self.upsert_called = False

    async def get(self, user_id):
        return self.profile

    async def upsert(self, profile):
        self.upsert_called = True
        self.profile = profile
        return profile

    async def delete(self, user_id):
        self.profile = None


class _StubProfileRepo:
    def __init__(self, profile=None):
        self.profile = profile

    async def get(self, user_id):
        return self.profile


@pytest.mark.asyncio
async def test_load_existing_profile():
    """履歴ありユーザー — get で profile を返す."""
    user_id = _uuid.uuid4()
    existing = preference_profile_factory(user_id=user_id, inferred_tags=["tag1"])
    loader = PreferenceProfileLoader(
        preference_repo=_StubPreferenceRepo(existing),
        profile_repo=_StubProfileRepo(),
        cold_start=ColdStartEstimator(),
    )
    result = await loader.load(user_id)
    assert result.inferred_tags == ["tag1"]


@pytest.mark.asyncio
async def test_load_cold_start_with_profile():
    """履歴なし + Profile あり → ColdStart で初期化 + upsert."""
    user_id = _uuid.uuid4()
    profile = Profile(user_id=user_id, email="x@y.z", age_group="20s")
    pref_repo = _StubPreferenceRepo(None)
    loader = PreferenceProfileLoader(
        preference_repo=pref_repo,
        profile_repo=_StubProfileRepo(profile),
        cold_start=ColdStartEstimator(),
    )
    result = await loader.load(user_id)
    assert result.persona_style_preference.get("楽観派") == 0.2
    assert pref_repo.upsert_called is True


@pytest.mark.asyncio
async def test_load_cold_start_no_profile():
    """履歴なし + Profile なし → 空 PreferenceProfile (AVAIL-U5-06)."""
    user_id = _uuid.uuid4()
    loader = PreferenceProfileLoader(
        preference_repo=_StubPreferenceRepo(None),
        profile_repo=_StubProfileRepo(None),
        cold_start=ColdStartEstimator(),
    )
    result = await loader.load(user_id)
    assert result.inferred_tags == []
    assert result.persona_style_preference == {}


def test_format_yaml_under_2kb():
    """ultrathink NFR Req PERF-U5-08: YAML size < 2KB."""
    pref = preference_profile_factory(
        inferred_tags=["tag" + str(i) for i in range(20)],
        persona_style_preference={f"persona-{i}": 0.5 for i in range(10)},
        accepted_patterns=[
            {"domain": "daily", "persona_names": ["効率派"], "keywords": [], "weight": 1.0,
             "decision_id": str(i), "timestamp": "2026-05-16"}
            for i in range(10)
        ],
        rejected_patterns=[{} for _ in range(5)],
    )
    yaml_str = _format_yaml(pref)
    assert len(yaml_str.encode("utf-8")) < 2000  # 2KB 以下


def test_format_yaml_persona_names_safe():
    """ultrathink Imp1: persona_names は json.dumps で double-quote 表現."""
    pref = preference_profile_factory(
        accepted_patterns=[
            {"domain": "daily", "persona_names": ["慎重派", "効率派"],
             "keywords": [], "weight": 1.0, "decision_id": "x", "timestamp": "y"}
        ],
    )
    yaml_str = _format_yaml(pref)
    # ["慎重派", "効率派"] が double-quote で表現される (json.dumps + ensure_ascii=False)
    assert '"慎重派"' in yaml_str
    assert '"効率派"' in yaml_str
