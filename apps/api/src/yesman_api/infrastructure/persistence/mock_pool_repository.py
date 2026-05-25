"""anonymous-strangers PoolRepository — in-memory mock 実装 (MVP).

TODO(NFR-1): 本番化時に SqlModel 実装を別 module (sqlmodel_pool_repository.py) に追加.
MVP は単一プロセス、複数 user は同一 process 上に共存する想定 (Mock backend のみ)。
"""
from __future__ import annotations

import random
from datetime import datetime
from threading import RLock
from uuid import UUID

from yesman_api.domain.persona_pool.models import (
    AnonymousPersonaSpec,
    PoolCitation,
)
from yesman_api.domain.persona_pool.protocols import PoolRepository
from yesman_api.fixtures.anonymous_pool_seed import (
    fixture_specs,
    seed_citations_for,
    self_persona_id_for,
)


class MockPoolRepository(PoolRepository):
    """In-memory PoolRepository (MVP).

    前提:
      - opt_in() に渡される spec は persona_id = self_persona_id_for(sub) で
        derive 済 (derive_spec 経由)。Repository は spec の persona_id を尊重する.
      - sub ↔ persona_id 逆引きは「sub から deterministic に算出」可能なため
        専用 mapping table は不要 (= NFR-6 の API 流通禁止と整合).

    内部状態:
      - _by_sub:    sub → AnonymousPersonaSpec    (opt-in 中の user の spec)
      - _by_id:     persona_id → AnonymousPersonaSpec (lookup 高速化、fixture も含む)
      - _citations: list[PoolCitation]             (時系列、opt-out 後も保持 FR-1)
      - _fixtures:  list[AnonymousPersonaSpec]     (1 user only でも合議成立させる seed)
    """

    def __init__(
        self,
        *,
        seed_fixtures: bool = True,
        rng: random.Random | None = None,
    ) -> None:
        self._lock = RLock()
        self._by_sub: dict[str, AnonymousPersonaSpec] = {}
        self._by_id: dict[UUID, AnonymousPersonaSpec] = {}
        self._citations: list[PoolCitation] = []
        self._rng = rng or random.Random()
        self._fixtures: list[AnonymousPersonaSpec] = (
            fixture_specs() if seed_fixtures else []
        )
        # fixture も _by_id index に入れる (sample で同居)
        for spec in self._fixtures:
            self._by_id[spec.persona_id] = spec

    # -----------------------
    # Opt-in / out
    # -----------------------
    def has_optin(self, sub: str) -> bool:
        with self._lock:
            return sub in self._by_sub

    def opt_in(
        self, sub: str, spec: AnonymousPersonaSpec
    ) -> AnonymousPersonaSpec:
        """spec をそのまま (= persona_id 尊重して) pool に登録する.

        前提: caller は spec.persona_id = self_persona_id_for(sub) として渡す
        (derive_spec が保証). Repository は responsibility を分離し canonical 化しない.
        """
        with self._lock:
            assert spec.persona_id == self_persona_id_for(sub), (
                "spec.persona_id must equal self_persona_id_for(sub); "
                "use derive_spec(sub=...) to construct."
            )
            existing = self._by_sub.get(sub)
            if existing is not None:
                # persona_id は sub-deterministic で不変だが、defensive に pop
                self._by_id.pop(existing.persona_id, None)
            self._by_sub[sub] = spec
            self._by_id[spec.persona_id] = spec
            # Demo: 当日 5 件分 seed citation を初回 opt-in 時にのみ追加
            if existing is None and not any(
                c.cited_persona_id == spec.persona_id for c in self._citations
            ):
                self._citations.extend(seed_citations_for(sub))
            return spec

    def opt_out(self, sub: str) -> None:
        with self._lock:
            existing = self._by_sub.pop(sub, None)
            if existing is None:
                return
            self._by_id.pop(existing.persona_id, None)
            # 既存 citation は (FR-1) 履歴に残す = 何もしない

    def get_spec_for_sub(self, sub: str) -> AnonymousPersonaSpec | None:
        with self._lock:
            return self._by_sub.get(sub)

    def list_all(self) -> list[AnonymousPersonaSpec]:
        with self._lock:
            # 重複なし (sub-bound と fixture は _by_id で union 済)
            return list(self._by_id.values())

    # -----------------------
    # 2026-05-24 v4: selection UI 用 list / get_by_id
    # -----------------------
    def list_for_selection(
        self,
        *,
        excluding_sub: str,
        limit: int = 20,
    ) -> list[AnonymousPersonaSpec]:
        """selection UI 用 — caller 自身の persona を exclude した一覧.

        NFR-6: caller 自身は表示しない (「自分を世界の誰かから除外」).
        """
        with self._lock:
            excluded_id = (
                self._by_sub[excluding_sub].persona_id
                if excluding_sub in self._by_sub
                else None
            )
            candidates = [
                spec
                for spec in self._by_id.values()
                if spec.persona_id != excluded_id
            ]
            return candidates[:limit]

    def get_by_id(
        self,
        persona_id: UUID,
        *,
        excluding_sub: str,
    ) -> AnonymousPersonaSpec | None:
        """persona_id で spec を取得. caller 自身の persona なら None."""
        with self._lock:
            spec = self._by_id.get(persona_id)
            if spec is None:
                return None
            excluded_id = (
                self._by_sub[excluding_sub].persona_id
                if excluding_sub in self._by_sub
                else None
            )
            if spec.persona_id == excluded_id:
                return None  # caller 自身は拒否
            return spec

    # -----------------------
    # Sample
    # -----------------------
    def sample(
        self,
        *,
        n: int,
        excluding_sub: str,
    ) -> list[AnonymousPersonaSpec]:
        if n <= 0:
            return []
        with self._lock:
            # 自分の sub に紐づく persona は除外
            excluded_id = (
                self._by_sub[excluding_sub].persona_id
                if excluding_sub in self._by_sub
                else None
            )
            candidates = [
                spec
                for spec in self._by_id.values()
                if spec.persona_id != excluded_id
            ]
            # 不足分は fixture から補完 (NFR-1) — _by_id に既に fixture も入っている
            # ので、足りないことは原則ない (fixture 5 + opt-in N ≧ n を満たす)
            if len(candidates) < n:
                # 究極の fallback: fixture 全部使ってもまだ足りない → 同じ persona を
                # 複製しないように、できる分だけ返す (テストで偶発的に発生する想定)
                return self._rng.sample(candidates, len(candidates))
            return self._rng.sample(candidates, n)

    # -----------------------
    # Citations
    # -----------------------
    def record_citation(self, citation: PoolCitation) -> PoolCitation:
        with self._lock:
            self._citations.append(citation)
            return citation

    def count_citations_for_sub(
        self,
        sub: str,
        *,
        since: datetime | None = None,
    ) -> int:
        """自分の persona が他者の合議で cite された件数.

        sub→persona_id を内部 mapping で逆引き (FR-1: 流通させない、内部のみ)。
        """
        with self._lock:
            target_id = self._self_persona_id(sub)
            if target_id is None:
                return 0
            return sum(
                1
                for c in self._citations
                if c.cited_persona_id == target_id
                and (since is None or c.cited_at >= since)
            )

    def list_citations_by_user(
        self,
        sub: str,
        *,
        since: datetime | None = None,
    ) -> list[PoolCitation]:
        with self._lock:
            return [
                c
                for c in self._citations
                if c.citing_user_sub == sub
                and (since is None or c.cited_at >= since)
            ]

    # -----------------------
    # Internal helpers
    # -----------------------
    def _self_persona_id(self, sub: str) -> UUID | None:
        """sub に紐づく persona_id を内部 mapping から取得.

        opt-in 中なら sub → spec.persona_id を返す。
        opt-out 後でも (FR-1) 既存 citation との突合のため `self_persona_id_for(sub)`
        (fixture seed と同じ deterministic UUID) を試す。
        """
        spec = self._by_sub.get(sub)
        if spec is not None:
            return spec.persona_id
        # MVP: opt-out 後でも seed citation との突合が効くように deterministic ID を返す
        return self_persona_id_for(sub)


__all__ = ["MockPoolRepository"]
