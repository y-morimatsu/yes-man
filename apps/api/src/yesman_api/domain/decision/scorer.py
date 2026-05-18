"""AutonomyScorer — 委任度スコア計算 (FR-SCORE-01〜04).

ratio は Yes 比率 (Yes 回数 / 総決定回数)。値が大きいほど AI への委任度が高い。
history は INCEPTION screen-04 の「📈 推移」折れ線グラフ用、直近 30 日の累積 Yes 比率。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID

from yesman_api.application.persistence.protocols import DecisionRepository


@dataclass(frozen=True, slots=True)
class ScoreHistoryPoint:
    date: str  # ISO date (YYYY-MM-DD)
    yes_ratio: float | None  # その日までの累積 Yes 比率、その日に決定なしなら None
    total: int  # その日までの累積決定数


@dataclass(frozen=True, slots=True)
class ScoreSummary:
    no_count: int
    total: int  # 採択済 (yes / no) のみ
    ratio: float | None  # Yes 比率 = (total - no_count) / total、total=0 → None
    message: str
    history: list[ScoreHistoryPoint] = field(default_factory=list)


_MESSAGE_HISTORY_EMPTY = "まだ意思決定の履歴がありません。"
_MESSAGE_HIGH = "あなたは AI を信頼してくれていますね。うまく任せられています。"
_MESSAGE_MID = "選択を AI に任せながら、あなた自身の意思も大切にされています。"
_MESSAGE_LOW = "Yes が少なめです。AI への委任を少しずつ広げてみてはいかがでしょう。"

_HISTORY_DAYS = 30


class AutonomyScorer:
    def __init__(self, *, decision_repo: DecisionRepository) -> None:
        self._repo = decision_repo

    async def compute(self, user_id: UUID) -> ScoreSummary:
        summary = await self._repo.count_no_by_user(user_id)
        total = summary["total"]
        no_count = summary["no_count"]
        if total == 0:
            return ScoreSummary(
                no_count=0, total=0, ratio=None, message=_MESSAGE_HISTORY_EMPTY, history=[]
            )
        yes_ratio = round((total - no_count) / total, 3)
        if yes_ratio >= 0.8:
            message = _MESSAGE_HIGH
        elif yes_ratio >= 0.5:
            message = _MESSAGE_MID
        else:
            message = _MESSAGE_LOW
        history = await self._build_history(user_id)
        return ScoreSummary(
            no_count=no_count, total=total, ratio=yes_ratio, message=message, history=history
        )

    async def _build_history(self, user_id: UUID) -> list[ScoreHistoryPoint]:
        """直近 30 日 (UTC) の累積 Yes 比率を 1 日刻みで返す。

        - 採択済 (yes / no) の決定のみ集計 (pending 除外、FR-SCORE-01)
        - 累積モデル: 各日付の値は「その日 23:59:59Z までに採択済の全決定」を分母とする
          単発のスパイクではなく漸進的なトレンドを表現する (グラフ用途に最適)
        - 当該日まで決定 0 件 → yes_ratio=None (フロント側で値なしとして描画)
        """
        decisions = await self._repo.list_by_user(user_id, limit=10_000, order_by="created_at_asc")
        accepted = [d for d in decisions if d.user_choice in ("yes", "no")]
        if not accepted:
            return []

        today = datetime.now(timezone.utc).date()
        start = today - timedelta(days=_HISTORY_DAYS - 1)

        points: list[ScoreHistoryPoint] = []
        for i in range(_HISTORY_DAYS):
            day = start + timedelta(days=i)
            day_end = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc)
            up_to = [d for d in accepted if d.created_at and d.created_at <= day_end]
            t = len(up_to)
            if t == 0:
                points.append(ScoreHistoryPoint(date=day.isoformat(), yes_ratio=None, total=0))
            else:
                n = sum(1 for d in up_to if d.user_choice == "no")
                points.append(
                    ScoreHistoryPoint(
                        date=day.isoformat(),
                        yes_ratio=round((t - n) / t, 3),
                        total=t,
                    )
                )
        return points


__all__ = ["AutonomyScorer", "ScoreSummary", "ScoreHistoryPoint"]
