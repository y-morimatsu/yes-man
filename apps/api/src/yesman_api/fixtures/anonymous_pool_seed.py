"""Anonymous persona pool — 5 hardcoded fixtures (ja/en/fr/ar/zh) + 5 seed citations.

派生元: aidlc-docs/inception/anonymous-strangers/application-design.md §Data Model.

これらは:
- pool が 1 user only でも合議が成立するための seed
- 多言語クオリティ (Arabic / Chinese) を LLM に依存させないための代替コンテンツ
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
# 5 hardcoded persona fixtures (en/fr/ar/zh/ja × formality)
# ============================================================
FIXTURE_POOL: tuple[AnonymousPoolFixture, ...] = (
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:en:casual",
            value_tags=("即決派", "肉好き", "自由人"),
            language="en",
            formality="casual",
            days_ago=14,
        ),
        utterance_sample=FixtureUtterance(
            text="カレーいいよ! スパイスきいた元気でるやつ",
        ),
    ),
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:fr:polite",
            value_tags=("和食派", "健康志向", "慎重派"),
            language="fr",
            formality="polite",
            days_ago=11,
        ),
        utterance_sample=FixtureUtterance(
            text="和食 おいしいじゃん! 揚げ物 続いてるなら、お刺身とかさ、お味噌汁つきで",
        ),
    ),
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:ar:polite",
            value_tags=("家族派", "倹約家", "保守派"),
            language="ar",
            formality="polite",
            days_ago=9,
        ),
        utterance_sample=FixtureUtterance(
            text="家で 家族と簡単な 料理を 作りましょう、外食より そのほうが いいですよ",
        ),
    ),
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:zh:blunt",
            value_tags=("コスパ重視", "効率派", "現実派"),
            language="zh",
            formality="blunt",
            days_ago=6,
        ),
        utterance_sample=FixtureUtterance(
            text="迷うな、下の ラーメン屋。20 分で 済む、コスパ最強",
        ),
    ),
    AnonymousPoolFixture(
        spec=_spec(
            seed="anon:ja:casual",
            value_tags=("夜型", "ラーメン好き", "面倒くさがり"),
            language="ja",
            formality="casual",
            days_ago=3,
        ),
        utterance_sample=FixtureUtterance(
            text="あー、ラーメンで いいんじゃない? もう めんどいし、あとで 寝るから 軽めで",
        ),
    ),
)


def fixture_specs() -> list[AnonymousPersonaSpec]:
    """5 fixture specs を新しい list で返す (PoolRepository への seed 用)."""
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
