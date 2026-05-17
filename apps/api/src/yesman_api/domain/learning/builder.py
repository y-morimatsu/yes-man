"""PreferenceProfileBuilder — Yes/No 採択時の incremental update (純粋関数).

NFR Design §1 + ultrathink I1 反映:
- 純粋関数 (copy.deepcopy で副作用なし)
- persona_names は _build_pattern から一貫取得 (persona_id UUID と混同しない)
- 上限 100/50/50 + clip [-1.0, 1.0] + FIFO drop
"""
from __future__ import annotations

import copy
from datetime import datetime, timezone

from yesman_api.domain.persistence.models import Decision, PreferenceProfile


# 定数 (NFR Design §1.2 で確定)
_ACCEPTED_CAP = 100
_REJECTED_CAP = 100
_PERSONA_STYLE_KEY_CAP = 50
_INFERRED_TAGS_CAP = 50
_PERSONA_STYLE_YES_DELTA = 0.1
_PERSONA_STYLE_NO_DELTA = -0.05
_CLIP_LOW = -1.0
_CLIP_HIGH = 1.0


def apply_yes(profile: PreferenceProfile, decision: Decision) -> PreferenceProfile:
    """Yes 採択時の incremental update (純粋関数).

    ultrathink I1 反映: persona_style_preference の key は **persona_name 文字列**
    (selected_persona_ids = UUID ではなく、_build_pattern が抽出した persona_names を使う).
    """
    new_profile = copy.deepcopy(profile)
    pattern = _build_pattern(decision)
    persona_names = pattern["persona_names"]
    new_profile.accepted_patterns = (new_profile.accepted_patterns + [pattern])[-_ACCEPTED_CAP:]
    new_profile.persona_style_preference = _apply_persona_delta(
        new_profile.persona_style_preference,
        persona_names,
        _PERSONA_STYLE_YES_DELTA,
    )
    new_profile.last_updated_at = datetime.now(timezone.utc)
    return new_profile


def apply_no(profile: PreferenceProfile, decision: Decision) -> PreferenceProfile:
    """No 採択時の incremental update (純粋関数).

    inferred_tags は No では更新しない (傾向ノイズ防止、FD §2.3).
    """
    new_profile = copy.deepcopy(profile)
    pattern = _build_pattern(decision)
    persona_names = pattern["persona_names"]
    new_profile.rejected_patterns = (new_profile.rejected_patterns + [pattern])[-_REJECTED_CAP:]
    new_profile.persona_style_preference = _apply_persona_delta(
        new_profile.persona_style_preference,
        persona_names,
        _PERSONA_STYLE_NO_DELTA,
    )
    new_profile.last_updated_at = datetime.now(timezone.utc)
    return new_profile


def _build_pattern(decision: Decision) -> dict:
    """U5 MVP: keywords は空 list (ultrathink FD I2)、将来差替え.

    persona_names は U4 で永続化された persona_outputs.utterances から抽出.
    """
    persona_names: list[str] = []
    persona_outputs = decision.persona_outputs or {}
    for utterance in persona_outputs.get("utterances", []):
        name = utterance.get("persona_name")
        if name:
            persona_names.append(str(name))
    return {
        "domain": decision.domain_classification,
        "keywords": [],
        "persona_names": persona_names,
        "weight": 1.0,
        "decision_id": str(decision.id),
        "timestamp": decision.created_at.isoformat(),
    }


def _apply_persona_delta(
    current: dict[str, float],
    persona_names: list[str],
    delta: float,
) -> dict[str, float]:
    """persona_style_preference の更新 + clip + 50 key 上限 (FIFO drop)."""
    updated = dict(current)
    for name in persona_names:
        name = str(name)
        score = updated.get(name, 0.0)
        updated[name] = max(_CLIP_LOW, min(_CLIP_HIGH, score + delta))
    if len(updated) > _PERSONA_STYLE_KEY_CAP:
        keys_to_keep = list(updated.keys())[-_PERSONA_STYLE_KEY_CAP:]
        updated = {k: updated[k] for k in keys_to_keep}
    return updated


__all__ = [
    "apply_yes",
    "apply_no",
    "_ACCEPTED_CAP",
    "_REJECTED_CAP",
    "_PERSONA_STYLE_KEY_CAP",
    "_INFERRED_TAGS_CAP",
    "_CLIP_LOW",
    "_CLIP_HIGH",
]
