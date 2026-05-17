"""AutonomyScorer — 主体性スコア計算 (FR-SCORE-01〜04).

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
    ratio: float | None  # total=0 → None
    message: str


_MESSAGE_HISTORY_EMPTY = "まだ意思決定の履歴がありません。"
_MESSAGE_LOW = "あなたは AI を信頼してくれていますね。うまく任せられています。"
_MESSAGE_MID = "選択を AI に任せながら、あなた自身の意思も大切にされています。"
_MESSAGE_HIGH = "No が多めです。AI への委任を少しずつ広げてみてはいかがでしょう。"


class AutonomyScorer:
    def __init__(self, *, decision_repo: DecisionRepository) -> None:
        self._repo = decision_repo

    async def compute(self, user_id: UUID) -> ScoreSummary:
        summary = await self._repo.count_no_by_user(user_id)
        total = summary["total"]
        no_count = summary["no_count"]
        if total == 0:
            return ScoreSummary(no_count=0, total=0, ratio=None, message=_MESSAGE_HISTORY_EMPTY)
        ratio = round(no_count / total, 3)
        if ratio < 0.2:
            message = _MESSAGE_LOW
        elif ratio < 0.5:
            message = _MESSAGE_MID
        else:
            message = _MESSAGE_HIGH
        return ScoreSummary(no_count=no_count, total=total, ratio=ratio, message=message)


__all__ = ["AutonomyScorer", "ScoreSummary"]
