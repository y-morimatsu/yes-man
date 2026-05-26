"""Anonymous persona pool — 4 hardcoded fixtures (ライフスタイル別「知り合い」) + 5 seed citations.

派生元: aidlc-docs/inception/anonymous-strangers/application-design.md §Data Model.
2026-05-26: ハッカソンデモ向けに 5 件多言語 fixture から 4 件ライフスタイル別
「知り合い」 (沖縄移住 / 料理研究家 / FIRE達成 / 子育て中) に置換.

これらは:
- pool が 1 user only でも合議が成立するための seed
- 「知り合い」 タブで日常価値観の異なる ペルソナを呼べる demo 用 seed
- US-2.2 「今日 N 件登場しました」を実装するための seed citation events
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from yesman_api.domain.persona_pool.models import (
    AnonymousPersonaSpec,
    Formality,
    PoolCitation,
    PrimaryLanguage,
)


def _stable_uuid(seed: str) -> UUID:
    """Deterministic UUID derived from a seed string (so fixture identifiers don't drift)."""
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return UUID(bytes=digest[:16])


def _seed_at(days_ago: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


@dataclass(frozen=True)
class FixtureUtterance:
    """1 fixture persona の発話サンプル (1 例、日本語).

    engine.py で LLM 呼び出し回避時に再利用、bubble に直接 emit する。
    2026-05-24: 原文表示機能削除に伴い、日本語 text のみを保持。
    """

    text: str


@dataclass(frozen=True)
class AnonymousPoolFixture:
    spec: AnonymousPersonaSpec
    utterance_sample: FixtureUtterance


def _spec(
    *,
    seed: str,
    value_tags: tuple[str, ...],
    language: PrimaryLanguage,
    formality: Formality,
    days_ago: int,
) -> AnonymousPersonaSpec:
    return AnonymousPersonaSpec(
        persona_id=_stable_uuid(seed),
        value_tags=value_tags,
        primary_language=language,
        formality=formality,
        seed_at=_seed_at(days_ago),
    )


# ============================================================
# 4 hardcoded persona fixtures (2026-05-26: ライフスタイル別「知り合い」 set)
# 各 persona は「主タグ — 価値観の説明」 を value_tags 3 要素に分解.
# language は全員 ja (知り合い = 日本語話者想定), formality は性格別.
# ============================================================
FIXTURE_POOL: tuple[AnonymousPoolFixture, ...] = (
    # #沖縄移住 — ゆったりした暮らしを大切にする
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:lifestyle:okinawa",
            value_tags=("沖縄移住", "ゆったり暮らし", "スローライフ"),
            language="ja",
            formality="casual",
            days_ago=14,
        ),
        utterance_sample=FixtureUtterance(
            text="無理せず ゆっくり選ぼうよ。近場で 気持ちよく過ごせるのが いちばん。",
        ),
    ),
    # #料理研究家 — 食を中心に生活設計する
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:lifestyle:cook",
            value_tags=("料理研究家", "食中心", "生活設計"),
            language="ja",
            formality="polite",
            days_ago=11,
        ),
        utterance_sample=FixtureUtterance(
            text="旬の食材を活かした 一品が おすすめです。栄養バランスも整いますよ。",
        ),
    ),
    # #FIRE 達成 — お金と時間の両立を重視する
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:lifestyle:fire",
            value_tags=("FIRE達成", "経済自立", "時間優先"),
            language="ja",
            formality="blunt",
            days_ago=6,
        ),
        utterance_sample=FixtureUtterance(
            text="費用対効果と 時間効率の 両方で 最適なものを 選ぼう。",
        ),
    ),
    # #子育て中 — 家族と過ごす時間を最優先する
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:lifestyle:parenting",
            value_tags=("子育て中", "家族時間", "育児優先"),
            language="ja",
            formality="casual",
            days_ago=3,
        ),
        utterance_sample=FixtureUtterance(
            text="子どもも 一緒に楽しめるのが いいよね。家族で 過ごす時間を 大事にしよう。",
        ),
    ),
)


def fixture_specs() -> list[AnonymousPersonaSpec]:
    """4 fixture specs を新しい list で返す (PoolRepository への seed 用)."""
    return [fix.spec for fix in FIXTURE_POOL]


def fixture_utterances() -> dict[UUID, FixtureUtterance]:
    """persona_id → utterance sample の lookup table (engine.py が参照)."""
    return {fix.spec.persona_id: fix.utterance_sample for fix in FIXTURE_POOL}


def seed_citations_for(
    user_sub: str,
    *,
    count: int = 5,
) -> list[PoolCitation]:
    """US-2.2「今日 N 件登場」用 demo seed citation events (mock 専用).

    user_sub: 「自分の persona が cite された」記録を生成する対象 user.
              ハッカソン MVP では opt-in 中の demo user.sub を渡す。
              本番 (NFR-1 TODO) では DB の global aggregate に置き換える。
    """
    # demo 用 fixture: 当日中で 5 件分 (US-2.2 AC-1)
    now = datetime.now(timezone.utc)
    return [
        PoolCitation(
            citing_user_sub=f"demo-citing-{i}",
            cited_persona_id=_stable_uuid(f"demo-self-{user_sub}"),
            decision_id=None,
            cited_at=now - timedelta(hours=i),
        )
        for i in range(count)
    ]


def self_persona_id_for(user_sub: str) -> UUID:
    """opt-in 中 user の deterministic persona_id (seed citation との突合用)."""
    return _stable_uuid(f"demo-self-{user_sub}")


__all__ = [
    "AnonymousPoolFixture",
    "FIXTURE_POOL",
    "FixtureUtterance",
    "fixture_specs",
    "fixture_utterances",
    "seed_citations_for",
    "self_persona_id_for",
]
