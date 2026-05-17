"""Mock repository unit tests — MOCK 単体動作確認 (PostgreSQL 不要)."""
from __future__ import annotations

import uuid

import pytest

from yesman_api.application.persistence.protocols import DuplicateReportError
from yesman_api.domain.persistence.models import (
    Decision,
    Persona,
    PersonaReport,
    PreferenceProfile,
    SilenceLog,
    UserPersonaSelection,
)
from yesman_api.infrastructure.persistence.factory import RepositoryBundle


# ============================================================
# Profile
# ============================================================
async def test_profile_upsert_and_get(mock_bundle: RepositoryBundle, sample_profile):
    await mock_bundle.profile.upsert(sample_profile)
    got = await mock_bundle.profile.get(sample_profile.user_id)
    assert got is not None
    assert got.email == sample_profile.email


async def test_profile_delete(mock_bundle: RepositoryBundle, sample_profile):
    await mock_bundle.profile.upsert(sample_profile)
    await mock_bundle.profile.delete(sample_profile.user_id)
    assert await mock_bundle.profile.get(sample_profile.user_id) is None


# ============================================================
# Decision
# ============================================================
async def test_decision_insert_and_list(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    for i in range(3):
        d = Decision(
            user_id=sample_user_id,
            domain_classification="daily",
            user_input=f"input {i}",
            user_input_hash=f"hash{i}",
            proposal_text="proposal",
            user_choice="yes" if i % 2 == 0 else "no",
            llm_provider="mock",
        )
        await mock_bundle.decision.insert(d)
    items = await mock_bundle.decision.list_by_user(sample_user_id)
    assert len(items) == 3
    # default order: created_at_desc
    assert items[0].user_input.startswith("input")


async def test_decision_count_no(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    for choice in ["yes", "no", "no", "yes"]:
        await mock_bundle.decision.insert(
            Decision(
                user_id=sample_user_id,
                domain_classification="daily",
                user_input="x",
                user_input_hash="h",
                proposal_text="p",
                user_choice=choice,
                llm_provider="mock",
            )
        )
    summary = await mock_bundle.decision.count_no_by_user(sample_user_id)
    assert summary == {"no_count": 2, "total": 4}


async def test_decision_search_by_input_hash(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    target_hash = "abc123"
    for i in range(3):
        await mock_bundle.decision.insert(
            Decision(
                user_id=sample_user_id,
                domain_classification="daily",
                user_input=f"x{i}",
                user_input_hash=target_hash if i < 2 else "other",
                proposal_text="p",
                user_choice="yes",
                llm_provider="mock",
            )
        )
    found = await mock_bundle.decision.search_by_input_hash(
        sample_user_id, target_hash
    )
    assert len(found) == 2


async def test_decision_update_choice(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    d = Decision(
        user_id=sample_user_id,
        domain_classification="daily",
        user_input="x",
        user_input_hash="h",
        proposal_text="p",
        user_choice="pending",
        llm_provider="mock",
    )
    inserted = await mock_bundle.decision.insert(d)
    updated = await mock_bundle.decision.update_choice(inserted.id, "no", 2)
    assert updated.user_choice == "no"
    assert updated.no_attempt_count == 2


# ============================================================
# PreferenceProfile
# ============================================================
async def test_preference_upsert_then_delete(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    pp = PreferenceProfile(
        user_id=sample_user_id,
        accepted_patterns=[{"tag": "a"}],
        rejected_patterns=[],
        persona_style_preference={"casual": 1.0},
        inferred_tags=["foo"],
    )
    await mock_bundle.preference.upsert(pp)
    got = await mock_bundle.preference.get(sample_user_id)
    assert got is not None
    assert got.inferred_tags == ["foo"]
    await mock_bundle.preference.delete(sample_user_id)
    assert await mock_bundle.preference.get(sample_user_id) is None


# ============================================================
# SilenceLog
# ============================================================
async def test_silence_log_insert_count(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    for domain in ["religion", "religion", "election"]:
        await mock_bundle.silence.insert(
            SilenceLog(
                user_id=sample_user_id,
                detected_domain=domain,
                triggered_by="prompt-self-check",
                user_input_hash="x" * 64,
            )
        )
    counts = await mock_bundle.silence.count_by_domain(sample_user_id)
    assert counts == {"religion": 2, "election": 1}


# ============================================================
# Persona
# ============================================================
async def test_persona_record_usage_atomic_count(
    mock_bundle: RepositoryBundle, sample_persona: Persona
):
    await mock_bundle.persona.insert(sample_persona)
    await mock_bundle.persona.record_usage(sample_persona.id, was_yes=True)
    await mock_bundle.persona.record_usage(sample_persona.id, was_yes=False)
    await mock_bundle.persona.record_usage(sample_persona.id, was_yes=True)
    got = await mock_bundle.persona.get(sample_persona.id)
    assert got is not None
    assert got.usage_count == 3
    assert got.yes_count == 2
    assert abs(got.yes_acceptance_rate - 2 / 3) < 1e-9


async def test_persona_soft_delete_excludes_from_list(
    mock_bundle: RepositoryBundle, sample_persona: Persona
):
    await mock_bundle.persona.insert(sample_persona)
    await mock_bundle.persona.soft_delete(sample_persona.id)
    visible = await mock_bundle.persona.list_by_owner(sample_persona.owner_user_id)
    assert visible == []
    all_items = await mock_bundle.persona.list_by_owner(
        sample_persona.owner_user_id, include_deleted=True
    )
    assert len(all_items) == 1


async def test_persona_list_shared_sort_popularity(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    for i in range(3):
        p = Persona(
            owner_user_id=sample_user_id,
            name=f"p{i}",
            description="d",
            prompt_text="prompt",
            is_shared=True,
            usage_count=i * 10,
        )
        await mock_bundle.persona.insert(p)
    shared = await mock_bundle.persona.list_shared(sort="popularity")
    assert [p.name for p in shared] == ["p2", "p1", "p0"]


# ============================================================
# PersonaReport — UNIQUE constraint
# ============================================================
async def test_persona_report_unique_violation(
    mock_bundle: RepositoryBundle, sample_persona: Persona, sample_user_id: uuid.UUID
):
    await mock_bundle.persona.insert(sample_persona)
    r1 = PersonaReport(
        persona_id=sample_persona.id,
        reporter_user_id=sample_user_id,
        reason="malicious",
    )
    await mock_bundle.persona_report.insert(r1)
    r2 = PersonaReport(
        persona_id=sample_persona.id,
        reporter_user_id=sample_user_id,
        reason="other",
    )
    with pytest.raises(DuplicateReportError):
        await mock_bundle.persona_report.insert(r2)


async def test_persona_report_mark_reviewed(
    mock_bundle: RepositoryBundle, sample_persona: Persona, sample_user_id: uuid.UUID
):
    await mock_bundle.persona.insert(sample_persona)
    r = PersonaReport(
        persona_id=sample_persona.id,
        reporter_user_id=sample_user_id,
        reason="malicious",
    )
    inserted = await mock_bundle.persona_report.insert(r)
    await mock_bundle.persona_report.mark_reviewed(inserted.id, "block")
    pending = await mock_bundle.persona_report.list_pending()
    assert pending == []


# ============================================================
# UserPersonaSelection
# ============================================================
async def test_user_persona_selection_upsert(
    mock_bundle: RepositoryBundle, sample_user_id: uuid.UUID
):
    sel = UserPersonaSelection(
        user_id=sample_user_id, persona_ids=[str(uuid.uuid4())]
    )
    await mock_bundle.user_persona_selection.upsert(sel)
    got = await mock_bundle.user_persona_selection.get(sample_user_id)
    assert got is not None
    assert len(got.persona_ids) == 1


# ============================================================
# Health
# ============================================================
async def test_mock_database_health(mock_bundle: RepositoryBundle):
    assert await mock_bundle.health.ping() is True
