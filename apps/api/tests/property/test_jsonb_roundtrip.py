"""Property-based test — JSONB serialize/deserialize roundtrip invariant (NFR-TEST-02).

ターゲット: Decision.persona_outputs (dict[str, Any]) と
           Decision.selected_persona_ids (list[str]) が
           insert → select で値が変わらないこと。

MOCK 実装に対する PBT (copy.deepcopy 経由の roundtrip 不変条件チェック)。
PostgreSQL 実 DB 版は integration 配下に別途用意可能だが、JSONB の本質的な
roundtrip 性質は MOCK でも検証できる (Python dict ⇔ json ⇔ dict)。
"""
from __future__ import annotations

import json
import uuid

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from yesman_api.domain.persistence.models import Decision
from yesman_api.infrastructure.persistence.factory import RepositoryBundle


# ============================================================
# Strategies for JSONB-compatible values
# ============================================================
json_atomic = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(min_value=-(10**6), max_value=10**6),
    st.floats(allow_nan=False, allow_infinity=False, width=32),
    st.text(max_size=20),
)


def _json_collections(children):
    return st.one_of(
        st.lists(children, max_size=5),
        st.dictionaries(st.text(min_size=1, max_size=10), children, max_size=5),
    )


jsonb_value = st.recursive(json_atomic, _json_collections, max_leaves=20)

persona_output_dict = st.dictionaries(
    st.sampled_from(["慎重派", "楽観派", "効率派", "anon"]),
    st.text(min_size=0, max_size=100),
    max_size=4,
)

selected_persona_ids_list = st.lists(
    st.uuids().map(str), min_size=0, max_size=3, unique=True
)


@given(persona_outputs=persona_output_dict, selected=selected_persona_ids_list)
@settings(max_examples=50, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_decision_persona_outputs_roundtrip(
    mock_bundle: RepositoryBundle, persona_outputs, selected
):
    user_id = uuid.uuid4()
    d = Decision(
        user_id=user_id,
        domain_classification="daily",
        user_input="hypothesis input",
        user_input_hash="h" * 64,
        proposal_text="proposal",
        persona_outputs=persona_outputs,
        user_choice="pending",
        llm_provider="mock",
        selected_persona_ids=selected,
    )
    inserted = await mock_bundle.decision.insert(d)
    fetched = await mock_bundle.decision.get(inserted.id)
    assert fetched is not None
    # JSON-equivalent comparison (Hypothesis may produce equivalent dicts)
    assert json.dumps(fetched.persona_outputs, sort_keys=True) == json.dumps(
        persona_outputs, sort_keys=True
    )
    assert fetched.selected_persona_ids == selected


@given(value_tags=st.lists(st.text(min_size=1, max_size=20), max_size=10, unique=True))
@settings(max_examples=30, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_profile_value_tags_roundtrip(mock_bundle: RepositoryBundle, value_tags):
    from yesman_api.domain.persistence.models import Profile

    user_id = uuid.uuid4()
    p = Profile(
        user_id=user_id,
        email=f"{user_id}@x.local",
        value_tags=value_tags,
    )
    await mock_bundle.profile.upsert(p)
    got = await mock_bundle.profile.get(user_id)
    assert got is not None
    assert got.value_tags == value_tags


# U3 で追加された gender (list[str]) + preferences (dict[str, str]) の roundtrip 検証
@given(
    gender=st.lists(st.text(min_size=1, max_size=10), max_size=5, unique=True),
    preferences=st.dictionaries(
        st.text(min_size=1, max_size=20),
        st.text(max_size=100),
        max_size=10,
    ),
)
@settings(max_examples=30, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_profile_gender_preferences_roundtrip(
    mock_bundle: RepositoryBundle, gender, preferences
):
    from yesman_api.domain.persistence.models import Profile

    user_id = uuid.uuid4()
    p = Profile(
        user_id=user_id,
        email=f"{user_id}@x.local",
        gender=gender,
        preferences=preferences,
    )
    await mock_bundle.profile.upsert(p)
    got = await mock_bundle.profile.get(user_id)
    assert got is not None
    assert got.gender == gender
    assert got.preferences == preferences


# U5 PreferenceProfile JSONB roundtrip (★ FU 追加: accepted/rejected/persona_style/inferred_tags)
pattern_dict = st.fixed_dictionaries(
    {
        "domain": st.sampled_from(["daily", "work", "school", "major"]),
        "keywords": st.lists(st.text(min_size=0, max_size=10), max_size=5),
        "persona_names": st.lists(
            st.sampled_from(["慎重派", "楽観派", "効率派"]), max_size=3
        ),
        "weight": st.floats(
            min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False
        ),
        "decision_id": st.uuids().map(str),
        "timestamp": st.just("2026-05-16T00:00:00+00:00"),
    }
)


@given(
    accepted=st.lists(pattern_dict, max_size=5),
    rejected=st.lists(pattern_dict, max_size=5),
    persona_style=st.dictionaries(
        st.sampled_from(["慎重派", "楽観派", "効率派"]),
        st.floats(min_value=-1.0, max_value=1.0, allow_nan=False, allow_infinity=False),
        max_size=3,
    ),
    inferred_tags=st.lists(st.text(min_size=1, max_size=20), max_size=10, unique=True),
)
@settings(max_examples=30, suppress_health_check=[HealthCheck.function_scoped_fixture])
async def test_preference_profile_jsonb_roundtrip(
    mock_bundle: RepositoryBundle,
    accepted,
    rejected,
    persona_style,
    inferred_tags,
):
    """PreferenceProfile の 4 JSONB field (accepted/rejected/persona_style/inferred_tags)
    の insert/select roundtrip 不変条件."""
    from yesman_api.domain.persistence.models import PreferenceProfile

    user_id = uuid.uuid4()
    profile = PreferenceProfile(
        user_id=user_id,
        accepted_patterns=accepted,
        rejected_patterns=rejected,
        persona_style_preference=persona_style,
        inferred_tags=inferred_tags,
    )
    await mock_bundle.preference.upsert(profile)
    got = await mock_bundle.preference.get(user_id)
    assert got is not None
    assert json.dumps(got.accepted_patterns, sort_keys=True) == json.dumps(
        accepted, sort_keys=True
    )
    assert json.dumps(got.rejected_patterns, sort_keys=True) == json.dumps(
        rejected, sort_keys=True
    )
    assert got.persona_style_preference == persona_style
    assert got.inferred_tags == inferred_tags
