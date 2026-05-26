"""Property-Based Tests — anonymous-strangers Pool (Imp4 fix, I-1 反映後).

PoolRepository.sample(n=k, excluding_sub=sub) の不変条件:
  - len(result) == min(k, pool_size_excluding_self)
  - all result ∈ pool_specs
  - all result.persona_id != self_persona_id_for(excluding_sub)
  - no duplicates
"""
from __future__ import annotations

from hypothesis import HealthCheck, given, settings, strategies as st

from yesman_api.domain.persona_pool.models import AnonymousPersonaSpec
from yesman_api.fixtures.anonymous_pool_seed import self_persona_id_for
from yesman_api.infrastructure.persistence.mock_pool_repository import (
    MockPoolRepository,
)


_LANGS = ("ja", "en", "fr", "ar", "zh")
_FORMALITIES = ("polite", "casual", "blunt")


_SPEC_PARAMS_STRATEGY = st.tuples(
    st.sampled_from(_LANGS),
    st.sampled_from(_FORMALITIES),
    st.lists(
        st.text(min_size=1, max_size=10),
        min_size=0,
        max_size=5,
        unique=True,
    ).map(tuple),
)


def _build_spec(sub: str, params: tuple) -> AnonymousPersonaSpec:
    """sub-deterministic な spec を作る (I-1 fix 後の opt_in assert と整合)."""
    lang, form, tags = params
    return AnonymousPersonaSpec(
        persona_id=self_persona_id_for(sub),
        value_tags=tags,
        primary_language=lang,
        formality=form,
    )


@settings(
    max_examples=50,
    deadline=2000,
    suppress_health_check=[HealthCheck.too_slow],
)
@given(
    extras=st.lists(_SPEC_PARAMS_STRATEGY, min_size=0, max_size=10),
    n=st.integers(min_value=0, max_value=20),
)
def test_sample_invariants(extras, n):
    """sample(n=k, excluding_sub=X) の不変条件を holds する."""
    repo = MockPoolRepository(seed_fixtures=True)  # 4 fixtures
    # ランダムな extra specs を opt-in (sub-derived persona_id)
    for i, params in enumerate(extras):
        sub = f"sub-extra-{i}"
        repo.opt_in(sub, _build_spec(sub, params))

    # 自分の sub は extra と被らない
    my_sub = "sub-self-unique"
    my_spec = AnonymousPersonaSpec(
        persona_id=self_persona_id_for(my_sub),
        value_tags=("t",),
        primary_language="ja",
        formality="casual",
    )
    repo.opt_in(my_sub, my_spec)

    pool_all = repo.list_all()
    pool_ids = {s.persona_id for s in pool_all}
    expected_max = len(pool_all) - 1  # exclude self
    expected_len = min(n, expected_max) if n > 0 else 0

    result = repo.sample(n=n, excluding_sub=my_sub)

    # 不変 1: 件数 (要求数 or 利用可能数の min)
    assert len(result) == expected_len, (
        f"len(result)={len(result)} != expected={expected_len} "
        f"(n={n}, pool_size={len(pool_all)})"
    )

    result_ids = {s.persona_id for s in result}
    # 不変 2: 全要素が pool 内
    assert result_ids.issubset(pool_ids)
    # 不変 3: 自分自身 (sub-deterministic persona_id) は含まない
    assert self_persona_id_for(my_sub) not in result_ids
    # 不変 4: 重複なし
    assert len(result_ids) == len(result)


@settings(max_examples=30, deadline=2000)
@given(
    spec_params_list=st.lists(_SPEC_PARAMS_STRATEGY, min_size=1, max_size=5),
)
def test_opt_in_idempotent_property(spec_params_list):
    """同 sub への opt_in は何度繰り返しても pool size に影響しない (最後の spec の attribute だけ反映)."""
    repo = MockPoolRepository(seed_fixtures=False)
    sub = "sub-test"
    for params in spec_params_list:
        repo.opt_in(sub, _build_spec(sub, params))
    # 最終的に 1 spec だけ pool にある
    assert len(repo.list_all()) == 1
    stored = repo.get_spec_for_sub(sub)
    last_params = spec_params_list[-1]
    last_lang, last_form, last_tags = last_params
    assert stored is not None
    assert stored.primary_language == last_lang
    assert stored.formality == last_form
    assert stored.value_tags == last_tags
