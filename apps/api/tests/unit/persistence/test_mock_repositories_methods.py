"""Unit tests for Mock*Repository の未カバーメソッド (mock_repositories.py).

silence / persona (record_usage / block / list_shared sort) / persona_report
(count / mark_reviewed / 重複) / decision (search_by_input_hash / asc) /
preference delete / user_persona_selection を、MockStore 直結で検証する。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from yesman_api.domain.persistence.models import (
    Decision,
    Persona,
    PersonaReport,
    PreferenceProfile,
    SilenceLog,
    UserPersonaSelection,
)
from yesman_api.infrastructure.persistence.mock_repositories import (
    DuplicateReportError,
    MockDecisionRepository,
    MockPersonaReportRepository,
    MockPersonaRepository,
    MockPreferenceProfileRepository,
    MockSilenceLogRepository,
    MockStore,
    MockUserPersonaSelectionRepository,
)


def _decision(uid: uuid.UUID, *, choice: str = "pending", h: str = "hash") -> Decision:
    return Decision(
        user_id=uid,
        domain_classification="daily",
        user_input="x",
        user_input_hash=h,
        proposal_text="p",
        user_choice=choice,
        llm_provider="mock",
    )


def _persona(uid: uuid.UUID, *, usage: int, yes: int, shared: bool = True) -> Persona:
    return Persona(
        id=uuid.uuid4(),
        owner_user_id=uid,
        name="共有派",
        description="d",
        prompt_text="あなたは共有人格です。",
        is_shared=shared,
        is_builtin=False,
        usage_count=usage,
        yes_count=yes,
    )


# ============================================================
# Decision
# ============================================================
async def test_decision_search_and_order_and_choice() -> None:
    store = MockStore()
    repo = MockDecisionRepository(store)
    uid = uuid.uuid4()
    d1 = await repo.insert(_decision(uid, h="aaa"))
    await repo.insert(_decision(uid, h="bbb"))
    found = await repo.search_by_input_hash(uid, "aaa")
    assert len(found) == 1

    asc = await repo.list_by_user(uid, order_by="created_at_asc")
    assert len(asc) == 2

    updated = await repo.update_choice(d1.id, "no", 2)
    assert updated.user_choice == "no" and updated.no_attempt_count == 2
    summary = await repo.count_no_by_user(uid)
    assert summary["no_count"] == 1 and summary["total"] == 1


# ============================================================
# SilenceLog
# ============================================================
async def test_silence_log_list_and_count() -> None:
    store = MockStore()
    repo = MockSilenceLogRepository(store)
    uid = uuid.uuid4()
    for domain in ("election", "election", "religion"):
        await repo.insert(
            SilenceLog(
                user_id=uid,
                detected_domain=domain,
                triggered_by="prompt-self-check",
                user_input_hash="h",
            )
        )
    logs = await repo.list_by_user(uid)
    assert len(logs) == 3
    counts = await repo.count_by_domain(uid)
    assert counts["election"] == 2 and counts["religion"] == 1


# ============================================================
# Persona: record_usage / block / list_shared sorts
# ============================================================
async def test_persona_record_usage_and_block() -> None:
    store = MockStore()
    repo = MockPersonaRepository(store)
    uid = uuid.uuid4()
    p = _persona(uid, usage=0, yes=0)
    await repo.insert(p)

    await repo.record_usage(p.id, was_yes=True)
    await repo.record_usage(p.id, was_yes=False)
    stored = store.personas[p.id]
    assert stored.usage_count == 2 and stored.yes_count == 1

    await repo.block(p.id)
    assert store.personas[p.id].is_blocked is True

    # 不在 id は no-op
    await repo.record_usage(uuid.uuid4(), was_yes=True)
    await repo.block(uuid.uuid4())


@pytest.mark.parametrize("sort", ["popularity", "newest", "acceptance"])
async def test_persona_list_shared_sorts(sort: str) -> None:
    store = MockStore()
    repo = MockPersonaRepository(store)
    uid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    for i in range(3):
        p = _persona(uid, usage=i, yes=i)
        p.created_at = now - timedelta(days=i)
        await repo.insert(p)
    shared = await repo.list_shared(page=0, page_size=10, sort=sort)
    assert len(shared) == 3


# ============================================================
# PersonaReport
# ============================================================
async def test_persona_report_lifecycle() -> None:
    store = MockStore()
    repo = MockPersonaReportRepository(store)
    pid = uuid.uuid4()
    reporter = uuid.uuid4()
    rep = await repo.insert(
        PersonaReport(persona_id=pid, reporter_user_id=reporter, reason="other")
    )
    assert await repo.count_by_persona(pid) == 1
    pending = await repo.list_pending()
    assert len(pending) == 1

    # 重複報告は弾く
    with pytest.raises(DuplicateReportError):
        await repo.insert(
            PersonaReport(persona_id=pid, reporter_user_id=reporter, reason="malicious")
        )

    await repo.mark_reviewed(rep.id, "block")
    assert store.persona_reports[rep.id].status == "reviewed-blocked"
    await repo.mark_reviewed(uuid.uuid4(), "dismiss")  # 不在 no-op


# ============================================================
# Preference delete / UserPersonaSelection
# ============================================================
async def test_preference_delete_and_selection_upsert() -> None:
    store = MockStore()
    pref_repo = MockPreferenceProfileRepository(store)
    uid = uuid.uuid4()
    await pref_repo.upsert(PreferenceProfile(user_id=uid, inferred_tags=["x"]))
    await pref_repo.delete(uid)
    assert await pref_repo.get(uid) is None

    sel_repo = MockUserPersonaSelectionRepository(store)
    ids = [str(uuid.uuid4())]
    await sel_repo.upsert(UserPersonaSelection(user_id=uid, persona_ids=ids))
    got = await sel_repo.get(uid)
    assert got is not None and got.persona_ids == ids
