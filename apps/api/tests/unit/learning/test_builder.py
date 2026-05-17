"""PreferenceProfileBuilder unit test — apply_yes/no + 上限 + clip + persona_names 一貫性."""
from __future__ import annotations

from tests.fixtures.learning import decision_factory, preference_profile_factory
from yesman_api.domain.learning.builder import (
    _ACCEPTED_CAP,
    _CLIP_HIGH,
    _CLIP_LOW,
    _PERSONA_STYLE_KEY_CAP,
    _REJECTED_CAP,
    apply_no,
    apply_yes,
)


class TestApplyYes:
    def test_appends_to_accepted_patterns(self):
        profile = preference_profile_factory()
        decision = decision_factory(choice="yes", persona_names=["効率派"])
        new_profile = apply_yes(profile, decision)
        assert len(new_profile.accepted_patterns) == 1
        assert new_profile.accepted_patterns[0]["domain"] == "daily"

    def test_updates_persona_style_with_persona_names(self):
        """ultrathink I1: persona_names を _build_pattern 経由で取得し統一."""
        profile = preference_profile_factory(persona_style_preference={"効率派": 0.5})
        decision = decision_factory(choice="yes", persona_names=["効率派"])
        new_profile = apply_yes(profile, decision)
        # 効率派 score が +0.1 加算
        assert new_profile.persona_style_preference["効率派"] == 0.6

    def test_clip_high(self):
        profile = preference_profile_factory(persona_style_preference={"効率派": 0.95})
        decision = decision_factory(choice="yes", persona_names=["効率派"])
        new_profile = apply_yes(profile, decision)
        # +0.1 で 1.05 になるが clip で 1.0
        assert new_profile.persona_style_preference["効率派"] == _CLIP_HIGH

    def test_accepted_patterns_cap(self):
        # 100 件超 → FIFO drop
        existing = [{"domain": "daily", "persona_names": [], "weight": 1.0,
                     "decision_id": str(i), "timestamp": "x", "keywords": []}
                    for i in range(_ACCEPTED_CAP)]
        profile = preference_profile_factory(accepted_patterns=existing)
        decision = decision_factory(choice="yes")
        new_profile = apply_yes(profile, decision)
        assert len(new_profile.accepted_patterns) == _ACCEPTED_CAP


class TestApplyNo:
    def test_appends_to_rejected_patterns(self):
        profile = preference_profile_factory()
        decision = decision_factory(choice="no", persona_names=["効率派"])
        new_profile = apply_no(profile, decision)
        assert len(new_profile.rejected_patterns) == 1

    def test_negative_persona_delta(self):
        profile = preference_profile_factory(persona_style_preference={"効率派": 0.5})
        decision = decision_factory(choice="no", persona_names=["効率派"])
        new_profile = apply_no(profile, decision)
        # -0.05 (Yes より弱い負シグナル)
        assert new_profile.persona_style_preference["効率派"] == 0.45

    def test_clip_low(self):
        profile = preference_profile_factory(persona_style_preference={"効率派": -0.98})
        decision = decision_factory(choice="no", persona_names=["効率派"])
        new_profile = apply_no(profile, decision)
        # -0.05 で -1.03 になるが clip で -1.0
        assert new_profile.persona_style_preference["効率派"] == _CLIP_LOW


def test_persona_style_key_cap():
    """50 key 超過 → FIFO drop."""
    style = {f"persona-{i}": 0.1 for i in range(_PERSONA_STYLE_KEY_CAP)}
    profile = preference_profile_factory(persona_style_preference=style)
    decision = decision_factory(choice="yes", persona_names=["new-persona-X"])
    new_profile = apply_yes(profile, decision)
    assert len(new_profile.persona_style_preference) <= _PERSONA_STYLE_KEY_CAP


def test_last_updated_at_monotonic():
    """ultrathink NFR Req Imp1 (PBT 不変条件 6): last_updated_at が単調増加."""
    import time

    profile = preference_profile_factory()
    initial = profile.last_updated_at
    time.sleep(0.001)
    decision = decision_factory(choice="yes")
    new_profile = apply_yes(profile, decision)
    assert new_profile.last_updated_at > initial
