"""ColdStartEstimator unit test — 年齢層 / 職業 / 価値観タグ / life_stage の 4 推定ルール."""
from __future__ import annotations

import uuid as _uuid

from yesman_api.domain.learning.cold_start import ColdStartEstimator
from yesman_api.domain.persistence.models import Profile


def _make_profile(**kwargs) -> Profile:
    return Profile(
        user_id=kwargs.pop("user_id", _uuid.uuid4()),
        email=kwargs.pop("email", "x@y.local"),
        **kwargs,
    )


class TestAgeGroup:
    def test_young_optimist_bias(self):
        profile = _make_profile(age_group="20s")
        pref = ColdStartEstimator().estimate(profile)
        assert pref.persona_style_preference.get("楽観派") == 0.2

    def test_senior_cautious_bias(self):
        profile = _make_profile(age_group="60s+")
        pref = ColdStartEstimator().estimate(profile)
        assert pref.persona_style_preference.get("慎重派") == 0.2

    def test_middle_age_no_bias(self):
        profile = _make_profile(age_group="30s")
        pref = ColdStartEstimator().estimate(profile)
        assert pref.persona_style_preference == {}


class TestOccupation:
    def test_engineer_efficiency_bias(self):
        profile = _make_profile(occupation="software engineer")
        pref = ColdStartEstimator().estimate(profile)
        assert pref.persona_style_preference.get("効率派") == 0.3

    def test_designer_optimist_bias(self):
        profile = _make_profile(occupation="UI designer")
        pref = ColdStartEstimator().estimate(profile)
        assert pref.persona_style_preference.get("楽観派") == 0.2


class TestValueTags:
    def test_transfer_value_tags(self):
        profile = _make_profile(value_tags=["growth", "stability"])
        pref = ColdStartEstimator().estimate(profile)
        assert "growth" in pref.inferred_tags
        assert "stability" in pref.inferred_tags


class TestLifeStage:
    def test_working_tag(self):
        profile = _make_profile(life_stage="working")
        pref = ColdStartEstimator().estimate(profile)
        assert "work-focused" in pref.inferred_tags

    def test_parenting_tag(self):
        profile = _make_profile(life_stage="parenting")
        pref = ColdStartEstimator().estimate(profile)
        assert "family-focused" in pref.inferred_tags


def test_combined_estimation():
    """年齢層 + 職業 + value_tags + life_stage の全て適用."""
    profile = _make_profile(
        age_group="20s",
        occupation="engineer",
        value_tags=["growth"],
        life_stage="working",
    )
    pref = ColdStartEstimator().estimate(profile)
    assert pref.persona_style_preference.get("楽観派") == 0.2
    assert pref.persona_style_preference.get("効率派") == 0.3
    assert "growth" in pref.inferred_tags
    assert "work-focused" in pref.inferred_tags
