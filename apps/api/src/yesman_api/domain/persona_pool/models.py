"""anonymous-strangers persona pool — domain models.

派生元: aidlc-docs/inception/anonymous-strangers/application-design.md §Data Model.

匿名 persona spec は外部に persona_id (UUID) のみ流通させ、user.sub は内部 mapping
(MockPoolRepository._mapping) に閉じ込める (NFR-6 / FR-1)。

2026-05-24 変更: 「口グセ (quirks / quirks_original)」を仕様から削除. persona の signal は
value_tags のみで構成し、value_tags の件数で FR-9 opt-in guard を判定する.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, uuid4

PrimaryLanguage = Literal["ja", "en", "fr", "ar", "zh"]
Formality = Literal["polite", "casual", "blunt"]

MAX_VALUE_TAGS = 5
MIN_SIGNAL_TOTAL = 3  # FR-9 opt-in guard (value_tags の最小件数)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class AnonymousPersonaSpec:
    """API 流通用 persona spec.

    persona_id 以外は外部に出して OK。user.sub は内部 mapping 経由でのみ参照可能。

    Notes:
        - value_tags の上限は FR-1 で規定 (最大 5).
        - formality は FR-8、primary_language は FR-3.
        - 2026-05-24: quirks は仕様削除済、本 model に field は持たない.
    """

    persona_id: UUID
    value_tags: tuple[str, ...]
    primary_language: PrimaryLanguage
    formality: Formality
    seed_at: datetime = field(default_factory=_utcnow)

    def __post_init__(self) -> None:
        if len(self.value_tags) > MAX_VALUE_TAGS:
            raise ValueError(
                f"value_tags exceeds {MAX_VALUE_TAGS}: got {len(self.value_tags)}"
            )

    @property
    def signal_total(self) -> int:
        """FR-9 guard 用: value_tags の件数 (口グセ仕様削除後、tags のみ)."""
        return len(self.value_tags)

    @classmethod
    def new(
        cls,
        *,
        value_tags: tuple[str, ...] | list[str],
        primary_language: PrimaryLanguage,
        formality: Formality,
    ) -> "AnonymousPersonaSpec":
        return cls(
            persona_id=uuid4(),
            value_tags=tuple(value_tags),
            primary_language=primary_language,
            formality=formality,
        )


@dataclass(frozen=True)
class PoolCitation:
    """合議で anonymous persona が使われた記録 (US-2.2 の 「今日 N 件」 用).

    citing_user_sub と cited_persona_id を持つが、cited_persona_id ↔ source user.sub
    の逆引きは PoolRepository 内部 mapping のみが行う。
    """

    citing_user_sub: str
    cited_persona_id: UUID
    decision_id: UUID | None  # mock fixture では None も許容
    cited_at: datetime = field(default_factory=_utcnow)


__all__ = [
    "AnonymousPersonaSpec",
    "Formality",
    "MAX_VALUE_TAGS",
    "MIN_SIGNAL_TOTAL",
    "PoolCitation",
    "PrimaryLanguage",
]
