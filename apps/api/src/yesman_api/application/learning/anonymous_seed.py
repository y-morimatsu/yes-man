"""anonymous-strangers persona seed builder.

PreferenceProfile + Profile から AnonymousPersonaSpec を派生 (純関数).

派生元: aidlc-docs/inception/anonymous-strangers/application-design.md / FR-1 / FR-8 / FR-9.

設計方針:
- 値の選定は決定的 (ハッカソン MVP、PBT で不変条件検証):
  - persona_id = self_persona_id_for(sub) で sub から deterministic に導出 (副作用ゼロ)
  - value_tags = inferred_tags の先頭 MAX_VALUE_TAGS
  - primary_language: Profile.preferences.lang を尊重、欠落時 "ja"
  - formality: persona_style_preference を見て polite/casual/blunt を推論
- LLM 呼び出しなし (engine.py が prompt 経由で使う際の入力に純化)
- 2026-05-24: 「口グセ (quirks)」は仕様削除済、本 builder では derive しない.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from yesman_api.domain.persona_pool.models import (
    MAX_VALUE_TAGS,
    AnonymousPersonaSpec,
    Formality,
    PrimaryLanguage,
)
from yesman_api.fixtures.anonymous_pool_seed import self_persona_id_for

if TYPE_CHECKING:
    from yesman_api.domain.persistence.models import PreferenceProfile, Profile


_SUPPORTED_LANGUAGES: frozenset[str] = frozenset({"ja", "en", "fr", "ar", "zh"})


def _pick_language(profile: "Profile | None") -> PrimaryLanguage:
    if profile is None:
        return "ja"
    raw = profile.preferences.get("lang") if isinstance(profile.preferences, dict) else None
    if isinstance(raw, str) and raw in _SUPPORTED_LANGUAGES:
        return raw  # type: ignore[return-value]
    return "ja"


def _infer_formality(preference: "PreferenceProfile") -> Formality:
    """persona_style_preference から polite / casual / blunt を推論.

    persona_style_preference は {persona_style: score} の dict、score は [-1.0, 1.0]。
    既存 builtin persona の style:
      - cautious / careful → polite
      - bold / playful → casual
      - pragmatic / blunt → blunt
    一致 style がなければ score の最大 style 名から類推、それでも不明なら "casual" default。
    """
    style = preference.persona_style_preference or {}
    if not isinstance(style, dict) or not style:
        return "casual"

    # 単純な keyword 一致 (score > 0 が前提、強い嗜好を採用)
    polite_score = sum(
        float(v) for k, v in style.items() if any(s in k.lower() for s in ("cautious", "careful", "polite"))
    )
    casual_score = sum(
        float(v) for k, v in style.items() if any(s in k.lower() for s in ("bold", "playful", "casual"))
    )
    blunt_score = sum(
        float(v) for k, v in style.items() if any(s in k.lower() for s in ("pragmatic", "blunt", "direct"))
    )

    scores: dict[Formality, float] = {
        "polite": polite_score,
        "casual": casual_score,
        "blunt": blunt_score,
    }
    # 全て 0 (or 全て同じ) なら casual default
    if max(scores.values()) <= 0.0:
        return "casual"
    return max(scores.items(), key=lambda kv: kv[1])[0]


def _extract_value_tags(preference: "PreferenceProfile") -> tuple[str, ...]:
    raw = preference.inferred_tags or []
    if not isinstance(raw, list):
        return ()
    seen: set[str] = set()
    tags: list[str] = []
    for t in raw:
        if not isinstance(t, str):
            continue
        t = t.strip()
        if not t or t in seen:
            continue
        seen.add(t)
        tags.append(t)
        if len(tags) >= MAX_VALUE_TAGS:
            break
    return tuple(tags)


def derive_spec(
    *,
    sub: str,
    preference: "PreferenceProfile",
    profile: "Profile | None" = None,
) -> AnonymousPersonaSpec:
    """sub + PreferenceProfile + Profile から AnonymousPersonaSpec を派生 (pure).

    persona_id は self_persona_id_for(sub) で deterministic、副作用なし.
    FR-9 guard はここでは raise しない (router 側で signal_total を見て 422).
    """
    return AnonymousPersonaSpec(
        persona_id=self_persona_id_for(sub),
        value_tags=_extract_value_tags(preference),
        primary_language=_pick_language(profile),
        formality=_infer_formality(preference),
    )


__all__ = ["derive_spec"]
