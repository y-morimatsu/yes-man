"""anonymous-strangers persona pool — repository Protocol.

実装は infrastructure/persistence/mock_pool_repository.py (MVP は mock のみ、
本番化時に SqlModel 実装を追加する TODO は NFR-1 に記録済)。
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol
from uuid import UUID

from yesman_api.domain.persona_pool.models import (
    AnonymousPersonaSpec,
    PoolCitation,
)


class InsufficientProfileError(Exception):
    """FR-9 / US-2.4 guard 違反: value_tags 件数 < MIN_SIGNAL_TOTAL で opt-in 要求."""


class PoolRepository(Protocol):
    """anonymous persona pool repository (in-memory in MVP)."""

    def has_optin(self, sub: str) -> bool: ...

    def opt_in(self, sub: str, spec: AnonymousPersonaSpec) -> AnonymousPersonaSpec:
        """sub の persona を pool に登録 (idempotent: 既存 sub は上書き)."""
        ...

    def opt_out(self, sub: str) -> None:
        """sub の persona を pool から除外 (idempotent: 未登録でも no-op)."""
        ...

    def get_spec_for_sub(self, sub: str) -> AnonymousPersonaSpec | None:
        """opt-in 中の sub の spec を取得 (UI で「現在公開中」preview 表示用)."""
        ...

    def list_all(self) -> list[AnonymousPersonaSpec]:
        """pool 内全 spec を返す (ordering 不問). サイズ確認・debug 用."""
        ...

    def list_for_selection(
        self,
        *,
        excluding_sub: str,
        limit: int = 20,
    ) -> list[AnonymousPersonaSpec]:
        """selection UI 用に caller exclude した spec 一覧を返す.

        2026-05-24 v4: anonymous の random sampling 廃止に伴い、user が選択するための
        list endpoint. caller 自身の persona は exclude (NFR-6 + 「自分を除外」).
        """
        ...

    def get_by_id(
        self,
        persona_id: UUID,
        *,
        excluding_sub: str,
    ) -> AnonymousPersonaSpec | None:
        """persona_id で spec を取得. caller 自身の persona なら None (exclude).

        2026-05-24 v4: selected_personas を resolve するために使用.
        """
        ...

    def sample(
        self,
        *,
        n: int,
        excluding_sub: str,
    ) -> list[AnonymousPersonaSpec]:
        """random n 件抽選 (自分の sub は除外).

        - n 件未満しか pool にない場合は不足を fixture seed で補完
        - excluding_sub は server 側必須 (client から exclude を受けない、NFR-6)
        """
        ...

    def record_citation(self, citation: PoolCitation) -> PoolCitation: ...

    def count_citations_for_sub(
        self,
        sub: str,
        *,
        since: datetime | None = None,
    ) -> int:
        """sub に紐づく persona が cite された回数 (US-2.2 「今日 N 件」 用).

        Note: sub→persona_id の逆引きは Repository 内部 mapping を使う。
        cited_by_me ではなく **cited (自分の persona が他者の合議に登場した回数)** を返す。
        """
        ...

    def list_citations_by_user(
        self,
        sub: str,
        *,
        since: datetime | None = None,
    ) -> list[PoolCitation]:
        """sub が cite した persona (= 自分の合議で召喚した anonymous persona) の履歴.

        US-3.1 「これまで決めてくれた世界の誰か」リスト用。
        """
        ...


__all__ = ["InsufficientProfileError", "PoolRepository"]
