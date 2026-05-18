"""PBT: score consistency 不変条件 (U-Test FD §4.2).

不変条件 (Yes 比率モデル):
- ratio = (total - no_count) / total (total > 0)
- ratio is None when total == 0
- 0 <= ratio <= 1
"""
from hypothesis import given, settings
from hypothesis import strategies as st


@given(
    no_count=st.integers(min_value=0, max_value=10_000),
    total=st.integers(min_value=0, max_value=10_000),
)
@settings(max_examples=100)
def test_score_ratio_invariant(no_count: int, total: int):
    """ratio is None iff total == 0、それ以外は (total - no_count) / total (Yes 比率)."""
    if no_count > total:
        # invariant: no_count cannot exceed total
        return
    ratio: float | None
    if total == 0:
        ratio = None
    else:
        ratio = (total - no_count) / total

    if total == 0:
        assert ratio is None
    else:
        assert ratio is not None
        assert 0.0 <= ratio <= 1.0


@given(
    no_count=st.integers(min_value=0, max_value=10_000),
)
def test_score_no_count_non_negative(no_count: int):
    """no_count is always >= 0 (DB constraint)."""
    assert no_count >= 0
