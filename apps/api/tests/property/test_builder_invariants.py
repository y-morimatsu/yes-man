"""PBT — Builder 5 + 1 不変条件 (ultrathink NFR Req TEST-U5-05 + Imp1).

(a) accepted_patterns ≤ 100, (b) rejected_patterns ≤ 100,
(c) persona_style_preference 値 ∈ [-1.0, 1.0],
(d) persona_style_preference key ≤ 50,
(e) inferred_tags ≤ 50,
(f) last_updated_at 単調増加 (ultrathink Imp1).
"""
from __future__ import annotations

import uuid as _uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.fixtures.learning import decision_factory, preference_profile_factory
from yesman_api.domain.learning.builder import (
    _ACCEPTED_CAP,
    _CLIP_HIGH,
    _CLIP_LOW,
    _INFERRED_TAGS_CAP,
    _PERSONA_STYLE_KEY_CAP,
    _REJECTED_CAP,
    apply_no,
    apply_yes,
)


@given(
    choices=st.lists(st.sampled_from(["yes", "no"]), min_size=1, max_size=200),
    persona_names=st.lists(st.text(min_size=1, max_size=10), min_size=0, max_size=5),
)
@settings(max_examples=100, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_builder_invariants(choices, persona_names):
    """5 + 1 不変条件を Hypothesis で検証."""
    profile = preference_profile_factory()
    last_updated = profile.last_updated_at
    for choice in choices:
        decision = decision_factory(choice=choice, persona_names=persona_names)
        if choice == "yes":
            new_profile = apply_yes(profile, decision)
        else:
            new_profile = apply_no(profile, decision)

        # (a) accepted_patterns ≤ 100
        assert len(new_profile.accepted_patterns) <= _ACCEPTED_CAP
        # (b) rejected_patterns ≤ 100
        assert len(new_profile.rejected_patterns) <= _REJECTED_CAP
        # (c) persona_style_preference 値 ∈ [-1.0, 1.0]
        for v in new_profile.persona_style_preference.values():
            assert _CLIP_LOW <= v <= _CLIP_HIGH
        # (d) persona_style_preference key ≤ 50
        assert len(new_profile.persona_style_preference) <= _PERSONA_STYLE_KEY_CAP
        # (e) inferred_tags ≤ 50
        assert len(new_profile.inferred_tags) <= _INFERRED_TAGS_CAP
        # (f) last_updated_at 単調増加 (= 同等以上、apply 後は必ず更新)
        assert new_profile.last_updated_at >= last_updated
        last_updated = new_profile.last_updated_at
        profile = new_profile
