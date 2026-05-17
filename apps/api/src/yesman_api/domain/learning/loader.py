"""PreferenceProfileLoader — U4 連携 helper + ColdStart 一元発火 + YAML format.

NFR Design §3 + ultrathink Imp1 (json.dumps names safe) 反映.
"""
from __future__ import annotations

import json
from uuid import UUID

from yesman_api.application.persistence.protocols import (
    PreferenceProfileRepository,
    ProfileRepository,
)
from yesman_api.domain.learning.cold_start import ColdStartEstimator
from yesman_api.domain.persistence.models import PreferenceProfile


class PreferenceProfileLoader:
    def __init__(
        self,
        *,
        preference_repo: PreferenceProfileRepository,
        profile_repo: ProfileRepository,
        cold_start: ColdStartEstimator,
    ) -> None:
        self._pref_repo = preference_repo
        self._profile_repo = profile_repo
        self._cold_start = cold_start

    async def load(self, user_id: UUID) -> PreferenceProfile:
        """preference を取得、なければ ColdStart で初期化 + upsert + 返却.

        ultrathink FD I1: ColdStart 発火は Loader のみ (Consumer は呼ばない).
        """
        existing = await self._pref_repo.get(user_id)
        if existing is not None:
            return existing
        profile = await self._profile_repo.get(user_id)
        if profile is None:
            # AVAIL-U5-06: Profile も無い場合は空 PreferenceProfile で fallback
            return PreferenceProfile(user_id=user_id)
        estimated = self._cold_start.estimate(profile)
        return await self._pref_repo.upsert(estimated)

    async def load_for_prompt(self, user_id: UUID) -> str:
        """LLM プロンプト注入用 YAML を返す (U4 ConsensusOrchestrator 連携)."""
        pref = await self.load(user_id)
        return _format_yaml(pref)


def _format_yaml(pref: PreferenceProfile) -> str:
    """NFR Req PERF-U5-08: < 2KB に収める。手書き format で PyYAML 依存不要.

    ultrathink Imp1: persona_names は json.dumps で double-quote 表現 (YAML-safe).
    """
    lines = ["# ユーザー嗜好プロファイル"]

    # inferred_tags (top 20)
    if pref.inferred_tags:
        tags_str = ", ".join(pref.inferred_tags[:20])
        lines.append(f"inferred_tags: [{tags_str}]")

    # preferred_personas (top 5 by abs(score))
    if pref.persona_style_preference:
        top_5 = sorted(
            pref.persona_style_preference.items(),
            key=lambda kv: abs(kv[1]),
            reverse=True,
        )[:5]
        lines.append("preferred_personas:")
        for name, score in top_5:
            sign = "+" if score >= 0 else ""
            lines.append(f"  - {name}: {sign}{score:.2f}")

    # recent_accepted (最新 5 件、domain + persona_names のみ)
    if pref.accepted_patterns:
        lines.append("recent_accepted:")
        for p in pref.accepted_patterns[-5:]:
            domain = p.get("domain", "?")
            names = p.get("persona_names", [])
            names_str = json.dumps(names, ensure_ascii=False)  # ultrathink Imp1
            lines.append(f"  - {{domain: {domain}, persona_names: {names_str}}}")

    # rejected はカウントのみ (プロンプト肥大化防止)
    if pref.rejected_patterns:
        lines.append(f"recent_rejected_count: {len(pref.rejected_patterns)}")

    return "\n".join(lines)


__all__ = ["PreferenceProfileLoader"]
