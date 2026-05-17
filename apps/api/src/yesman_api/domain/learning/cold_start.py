"""ColdStartEstimator — 履歴なしユーザーの初期 preference_profile 推定 (FR-LEARN-05).

NFR Design §2: クラス内定数 3 個 (ultrathink EXT-U5-01)、将来 ML モデル差替え可能.
"""
from __future__ import annotations

from datetime import datetime, timezone

from yesman_api.domain.persistence.models import PreferenceProfile, Profile


# クラス内定数 (将来差替え可能)
_AGE_GROUP_PERSONA_BIAS: dict[str, dict[str, float]] = {
    "10s": {"楽観派": 0.2},
    "20s": {"楽観派": 0.2},
    "50s": {"慎重派": 0.2},
    "60s+": {"慎重派": 0.2},
}

_OCCUPATION_KEYWORDS_BIAS: dict[str, dict[str, float]] = {
    "engineer": {"効率派": 0.3},
    "doctor": {"慎重派": 0.2},
    "designer": {"楽観派": 0.2},
}

_LIFE_STAGE_TAGS: dict[str, list[str]] = {
    "working": ["work-focused"],
    "parenting": ["family-focused"],
    "student": ["study-focused"],
}


class ColdStartEstimator:
    def estimate(self, profile: Profile) -> PreferenceProfile:
        inferred_tags: list[str] = []
        persona_style: dict[str, float] = {}

        # 1. 年齢層 → persona bias
        if profile.age_group and profile.age_group in _AGE_GROUP_PERSONA_BIAS:
            persona_style.update(_AGE_GROUP_PERSONA_BIAS[profile.age_group])

        # 2. 職業キーワード → persona bias
        if profile.occupation:
            occ_lower = profile.occupation.lower()
            for keyword, bias in _OCCUPATION_KEYWORDS_BIAS.items():
                if keyword in occ_lower:
                    for name, delta in bias.items():
                        persona_style[name] = persona_style.get(name, 0.0) + delta

        # 3. 価値観タグ転写
        inferred_tags.extend(profile.value_tags or [])

        # 4. life_stage → ドメインヒント
        if profile.life_stage in _LIFE_STAGE_TAGS:
            inferred_tags.extend(_LIFE_STAGE_TAGS[profile.life_stage])

        # 重複排除 + 上限 50 (dict.fromkeys で順序保持)
        inferred_tags = list(dict.fromkeys(inferred_tags))[:50]

        return PreferenceProfile(
            user_id=profile.user_id,
            accepted_patterns=[],
            rejected_patterns=[],
            persona_style_preference=persona_style,
            inferred_tags=inferred_tags,
            last_updated_at=datetime.now(timezone.utc),
        )


__all__ = ["ColdStartEstimator"]
