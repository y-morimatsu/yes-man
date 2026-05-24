"""anonymous_seed.derive_spec — unit tests."""
from __future__ import annotations

import uuid

from yesman_api.application.learning.anonymous_seed import derive_spec
from yesman_api.domain.persistence.models import PreferenceProfile, Profile
from yesman_api.domain.persona_pool.models import MAX_VALUE_TAGS


def _profile(language: str | None = "ja") -> Profile:
    user_id = uuid.uuid4()
    prefs = {"lang": language} if language else {}
    return Profile(
        user_id=user_id,
        email=f"{user_id}@example.com",
        value_tags=[],
        preferences=prefs,
    )


def _pref(
    *,
    accepted=None,
    inferred=None,
    style=None,
    user_id=None,
) -> PreferenceProfile:
    return PreferenceProfile(
        user_id=user_id or uuid.uuid4(),
        accepted_patterns=accepted or [],
        rejected_patterns=[],
        persona_style_preference=style or {},
        inferred_tags=inferred or [],
    )


class TestLanguagePick:
    def test_picks_japanese_default(self):
        spec = derive_spec(sub="sub-test", preference=_pref(), profile=_profile(None))
        assert spec.primary_language == "ja"

    def test_picks_from_preferences(self):
        for lang in ("ja", "en", "fr", "ar", "zh"):
            spec = derive_spec(sub="sub-test", preference=_pref(), profile=_profile(lang))
            assert spec.primary_language == lang

    def test_unknown_lang_falls_back_to_ja(self):
        spec = derive_spec(sub="sub-test", preference=_pref(), profile=_profile("klingon"))
        assert spec.primary_language == "ja"

    def test_no_profile_falls_back_to_ja(self):
        spec = derive_spec(sub="sub-test", preference=_pref(), profile=None)
        assert spec.primary_language == "ja"


class TestFormalityInference:
    def test_default_casual_when_empty(self):
        spec = derive_spec(sub="sub-test", preference=_pref(), profile=None)
        assert spec.formality == "casual"

    def test_polite_from_cautious_style(self):
        spec = derive_spec(
            sub="sub-test", preference=_pref(style={"cautious": 0.8, "bold": 0.1}),
            profile=None,
        )
        assert spec.formality == "polite"

    def test_casual_from_bold(self):
        spec = derive_spec(
            sub="sub-test", preference=_pref(style={"bold": 0.7}),
            profile=None,
        )
        assert spec.formality == "casual"

    def test_blunt_from_pragmatic(self):
        spec = derive_spec(
            sub="sub-test", preference=_pref(style={"pragmatic": 0.9}),
            profile=None,
        )
        assert spec.formality == "blunt"


class TestValueTags:
    def test_caps_at_max(self):
        tags = [f"tag{i}" for i in range(20)]
        spec = derive_spec(
            sub="sub-test", preference=_pref(inferred=tags),
            profile=None,
        )
        assert len(spec.value_tags) == MAX_VALUE_TAGS

    def test_dedupes(self):
        spec = derive_spec(
            sub="sub-test", preference=_pref(inferred=["a", "b", "a", "c"]),
            profile=None,
        )
        assert list(spec.value_tags) == ["a", "b", "c"]

    def test_skips_non_strings(self):
        spec = derive_spec(
            sub="sub-test", preference=_pref(inferred=["a", None, 123, "b"]),
            profile=None,
        )
        assert list(spec.value_tags) == ["a", "b"]


class TestSignalTotal:
    def test_empty_profile_has_zero_signals(self):
        spec = derive_spec(sub="sub-test", preference=_pref(), profile=None)
        assert spec.signal_total == 0

    def test_signal_total_counts_only_value_tags(self):
        """2026-05-24: quirks 仕様削除. signal_total = value_tags 件数のみ."""
        spec = derive_spec(
            sub="sub-test", preference=_pref(
                # accepted_patterns は signal_total に貢献しない (quirks 削除済)
                accepted=[{"phrase": "x"}, {"phrase": "y"}],
                inferred=["a", "b", "c"],
            ),
            profile=None,
        )
        assert spec.signal_total == 3  # 3 tags のみ
