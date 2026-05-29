"""Unit tests for DecisionEngine の純粋ヘルパ / module 関数 (domain/decision/engine.py).

engine 全体を組まずに、_detect_final_signal / _clean_anonymous_text /
_fallback_spec_for_empty_preference / _format_profile を直接検証する。
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from yesman_api.domain.decision.engine import DecisionEngine, _detect_final_signal
from yesman_api.domain.persistence.models import Profile
from yesman_api.domain.persona_pool.models import AnonymousPersonaSpec


def test_detect_final_signal_true() -> None:
    assert _detect_final_signal("「パターソン」を Amazon Prime Video で 開きますか?")
    assert _detect_final_signal("近所を 20 分 散歩する に 決めますか?")


def test_detect_final_signal_false() -> None:
    assert not _detect_final_signal("今夜は温かい鍋にしよう。")
    assert not _detect_final_signal("")


def test_clean_anonymous_text_strips_code_fence() -> None:
    assert DecisionEngine._clean_anonymous_text("```\nこんにちは\n```") == "こんにちは"


def test_clean_anonymous_text_extracts_translation_ja() -> None:
    assert DecisionEngine._clean_anonymous_text('{"translation_ja": "やあ"}') == "やあ"


def test_clean_anonymous_text_plain_trim() -> None:
    assert DecisionEngine._clean_anonymous_text("  そのまま  ") == "そのまま"


def test_fallback_spec_for_empty_preference() -> None:
    spec = AnonymousPersonaSpec(
        persona_id=uuid4(),
        value_tags=(),
        primary_language="ja",
        formality="polite",
        seed_at=datetime.now(timezone.utc),
    )
    out = DecisionEngine._fallback_spec_for_empty_preference(spec)
    assert out.value_tags == ("迷い中", "新規")
    assert out.persona_id == spec.persona_id
    assert out.primary_language == "ja"


def test_format_profile_returns_string() -> None:
    profile = Profile(
        user_id=uuid4(),
        email="e@example.com",
        age_group="30s",
        occupation="engineer",
        value_tags=["growth", "stability"],
        life_stage="working",
    )
    out = DecisionEngine._format_profile(profile)
    assert isinstance(out, str)
    assert out  # 非空
