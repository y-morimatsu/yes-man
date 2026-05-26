"""MockPoolRepository unit tests (v3-γ Task 1)."""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import pytest

from yesman_api.domain.persona_pool.models import (
    AnonymousPersonaSpec,
    PoolCitation,
)
from yesman_api.fixtures.anonymous_pool_seed import (
    FIXTURE_POOL,
    fixture_specs,
    self_persona_id_for,
)
from yesman_api.infrastructure.persistence.mock_pool_repository import (
    MockPoolRepository,
)


def _make_spec(
    sub: str,
    language: str = "ja",
    formality: str = "casual",
) -> AnonymousPersonaSpec:
    """sub-deterministic な persona_id を持つ test fixture (I-1 fix 後の opt_in assert と整合)."""
    from yesman_api.fixtures.anonymous_pool_seed import self_persona_id_for

    return AnonymousPersonaSpec(
        persona_id=self_persona_id_for(sub),
        value_tags=("tag1", "tag2"),
        primary_language=language,  # type: ignore[arg-type]
        formality=formality,  # type: ignore[arg-type]
    )


# ============================================================
# fixture-only behaviour
# ============================================================
class TestFixtureSeed:
    # 2026-05-26: 多言語 5 fixture → ライフスタイル別 4 fixture (沖縄移住 / 料理研究家
    # / FIRE達成 / 子育て中) に置換. language は全員 ja に統一.
    def test_fixture_pool_has_4_ja_personas(self):
        specs = fixture_specs()
        assert len(specs) == 4
        languages = {s.primary_language for s in specs}
        assert languages == {"ja"}

    def test_fixture_pool_has_3_formalities(self):
        formalities = {s.formality for s in fixture_specs()}
        assert {"polite", "casual", "blunt"}.issubset(formalities)

    def test_repo_starts_with_4_fixtures(self):
        repo = MockPoolRepository(seed_fixtures=True)
        assert len(repo.list_all()) == 4

    def test_repo_without_seed_is_empty(self):
        repo = MockPoolRepository(seed_fixtures=False)
        assert repo.list_all() == []


# ============================================================
# opt-in / opt-out
# ============================================================
class TestOptIn:
    def test_opt_in_adds_to_pool(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        saved = repo.opt_in("sub-A", spec)
        assert repo.has_optin("sub-A") is True
        # repo は persona_id を sub-deterministic に正規化するため attribute 比較
        stored = repo.get_spec_for_sub("sub-A")
        assert stored is not None
        assert stored.value_tags == spec.value_tags
        assert stored.primary_language == spec.primary_language
        assert stored.formality == spec.formality
        assert saved == stored
        assert len(repo.list_all()) == 1

    def test_opt_in_is_idempotent_same_sub(self):
        repo = MockPoolRepository(seed_fixtures=False)
        s1 = _make_spec("sub-A")
        repo.opt_in("sub-A", s1)
        # 同 sub に対して別 spec を 2 度 opt-in → 上書き、index は 1 個に保たれる
        s2 = _make_spec("sub-A", language="en")
        repo.opt_in("sub-A", s2)
        # 最新の attribute が反映される
        stored = repo.get_spec_for_sub("sub-A")
        assert stored is not None
        assert stored.primary_language == "en"
        assert len(repo.list_all()) == 1

    def test_opt_out_removes_from_pool(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)
        repo.opt_out("sub-A")
        assert repo.has_optin("sub-A") is False
        assert repo.get_spec_for_sub("sub-A") is None
        assert len(repo.list_all()) == 0

    def test_opt_out_idempotent_for_unknown_sub(self):
        repo = MockPoolRepository(seed_fixtures=False)
        repo.opt_out("sub-unknown")  # 何も raise しない

    def test_opt_in_seeds_citations_once(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)
        first = repo.count_citations_for_sub("sub-A")
        # 同 sub を再 opt-in しても citation は重複追加されない
        repo.opt_in("sub-A", spec)
        assert repo.count_citations_for_sub("sub-A") == first
        assert first == 5  # seed_citations_for(default count=5)


# ============================================================
# sample
# ============================================================
class TestSample:
    def test_sample_returns_n_items(self):
        repo = MockPoolRepository(seed_fixtures=True)  # 4 fixtures
        out = repo.sample(n=2, excluding_sub="sub-NONE")
        assert len(out) == 2
        # 全要素が pool 内
        all_ids = {s.persona_id for s in repo.list_all()}
        for s in out:
            assert s.persona_id in all_ids

    def test_sample_excludes_self(self):
        repo = MockPoolRepository(seed_fixtures=True, rng=random.Random(42))
        my = _make_spec("sub-A")
        my_canonical = repo.opt_in("sub-A", my)
        out = repo.sample(n=10, excluding_sub="sub-A")
        # 4 fixture + 1 self = 5 candidates、self exclude で 4 件返る
        assert len(out) == 4
        assert my_canonical.persona_id not in {s.persona_id for s in out}

    def test_sample_zero_returns_empty(self):
        repo = MockPoolRepository(seed_fixtures=True)
        assert repo.sample(n=0, excluding_sub="sub-X") == []

    def test_sample_more_than_available(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)
        # 1 spec しかないが n=5 を要求 → exclude=self で 0 件
        out = repo.sample(n=5, excluding_sub="sub-A")
        assert out == []


# ============================================================
# citations
# ============================================================
class TestCitations:
    def test_record_and_count(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)
        # 既に seed 5 件入っている → 1 件追加 (self persona は seed と同 ID なので加算)
        from yesman_api.fixtures.anonymous_pool_seed import self_persona_id_for

        repo.record_citation(
            PoolCitation(
                citing_user_sub="sub-B",
                cited_persona_id=self_persona_id_for("sub-A"),
                decision_id=None,
            )
        )
        assert repo.count_citations_for_sub("sub-A") == 6

    def test_count_with_since(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)
        old = repo.count_citations_for_sub("sub-A")
        # 30 日前を切ると 5 件は当日中なので残る
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        assert repo.count_citations_for_sub("sub-A", since=cutoff) == old
        # 1 時間後を切ると 5 件のうち過去 1 時間以内のだけ残る (seed は時間ずらし)
        recent_cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
        assert repo.count_citations_for_sub("sub-A", since=recent_cutoff) <= old

    def test_list_citations_by_user_filters_by_citing(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)  # 5 seed citations citing_user_sub != sub-A
        # 自分が cite した記録は seed には含まれない
        assert repo.list_citations_by_user("sub-A") == []
        # 1 件追加
        target = fixture_specs()[0]
        repo.record_citation(
            PoolCitation(
                citing_user_sub="sub-A",
                cited_persona_id=target.persona_id,
                decision_id=None,
            )
        )
        out = repo.list_citations_by_user("sub-A")
        assert len(out) == 1
        assert out[0].cited_persona_id == target.persona_id


# ============================================================
# Internal mapping protection (NFR-6)
# ============================================================
class TestPrivacy:
    def test_no_reverse_lookup_method(self):
        repo = MockPoolRepository(seed_fixtures=False)
        spec = _make_spec("sub-A")
        repo.opt_in("sub-A", spec)
        # PoolRepository protocol には reverse lookup method がない
        # (= API 経路で persona_id → sub を逆引きできない)
        assert not hasattr(repo, "lookup_sub_by_persona_id")
        # I-2 fix: sub ↔ persona_id 突合は self_persona_id_for(sub) で
        # deterministic に算出するため、専用 mapping table (_persona_id_to_sub) は不要.
        assert not hasattr(repo, "_persona_id_to_sub")
