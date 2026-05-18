"""AutonomyScorer — 委任度スコア計算 (FR-SCORE-01〜04).

ratio は Yes 比率 (Yes 回数 / 総決定回数)。値が大きいほど AI への委任度が高い。
NFR Design §10 + ultrathink Imp5 (採択済のみ total) 反映:
- DecisionRepository.count_no_by_user は U4 Phase A.0 で pending 除外 patch 済
- total=0 (履歴なし) → ratio=null
"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from yesman_api.application.persistence.protocols import DecisionRepository


@dataclass(frozen=True, slots=True)
class ScoreSummary:
    no_count: int
    total: int  # 採択済 (yes / no) のみ
    ratio: float | None  # Yes 比率 = (total - no_count) / total、total=0 → None
    message: str


_MESSAGE_HISTORY_EMPTY = "まだ意思決定の履歴がありません。"
_MESSAGE_HIGH = "あなたは AI を信頼してくれていますね。うまく任せられています。"
_MESSAGE_MID = "選択を AI に任せながら、あなた自身の意思も大切にされています。"
_MESSAGE_LOW = "Yes が少なめです。AI への委任を少しずつ広げてみてはいかがでしょう。"


class AutonomyScorer:
    def __init__(self, *, decision_repo: DecisionRepository) -> None:
        self._repo = decision_repo

    async def compute(self, user_id: UUID) -> ScoreSummary:
        summary = await self._repo.count_no_by_user(user_id)
        total = summary["total"]
        no_count = summary["no_count"]
        if total == 0:
            return ScoreSummary(no_count=0, total=0, ratio=None, message=_MESSAGE_HISTORY_EMPTY)
        yes_ratio = round((total - no_count) / total, 3)
        if yes_ratio >= 0.8:
            message = _MESSAGE_HIGH
        elif yes_ratio >= 0.5:
            message = _MESSAGE_MID
        else:
            message = _MESSAGE_LOW
        return ScoreSummary(no_count=no_count, total=total, ratio=yes_ratio, message=message)


__all__ = ["AutonomyScorer", "ScoreSummary"]
