"""SqlModel repository integration tests — Docker PostgreSQL を使う実 DB テスト.

実行:
  export YESMAN_TEST_DATABASE_URL="postgresql+asyncpg://yesman:dev@localhost:5432/yesman_test"
  docker compose up -d  (postgres)
  pytest tests/integration -m integration
"""
from __future__ import annotations

import uuid

import pytest

from yesman_api.application.persistence.protocols import DuplicateReportError
from yesman_api.domain.persistence.models import (
    Decision,
    Persona,
    PersonaReport,
    Profile,
    SilenceLog,
)
from yesman_api.infrastructure.persistence.factory import RepositoryFactory

pytestmark = pytest.mark.integration


async def _make_user(factory: RepositoryFactory) -> uuid.UUID:
    user_id = uuid.uuid4()
    async with factory.bundle() as b:
        await b.profile.upsert(
            Profile(user_id=user_id, email=f"{user_id}@test.local")
        )
    return user_id


async def test_pg_profile_upsert(pg_factory: RepositoryFactory):
    user_id = uuid.uuid4()
    async with pg_factory.bundle() as b:
        p = await b.profile.upsert(
            Profile(user_id=user_id, email=f"{user_id}@x.local", age_group="30s")
        )
        assert p.email.endswith("@x.local")
    async with pg_factory.bundle() as b:
        got = await b.profile.get(user_id)
        assert got is not None
        assert got.age_group == "30s"


async def test_pg_decision_jsonb_roundtrip(pg_factory: RepositoryFactory):
    user_id = await _make_user(pg_factory)
    persona_outputs = {"慎重派": "やってみよう", "楽観派": "絶対イケる"}
    async with pg_factory.bundle() as b:
        d = Decision(
            user_id=user_id,
            domain_classification="daily",
            user_input="ランチに何を食べよう？",
            user_input_hash="a" * 64,
            proposal_text="今日はラーメンに挑戦してみては",
            persona_outputs=persona_outputs,
            user_choice="yes",
            llm_provider="bedrock",
            selected_persona_ids=[str(uuid.uuid4()), str(uuid.uuid4())],
        )
        await b.decision.insert(d)
    async with pg_factory.bundle() as b:
        items = await b.decision.list_by_user(user_id)
        assert len(items) == 1
        assert items[0].persona_outputs == persona_outputs
        assert len(items[0].selected_persona_ids) == 2


async def test_pg_decision_count_no(pg_factory: RepositoryFactory):
    user_id = await _make_user(pg_factory)
    async with pg_factory.bundle() as b:
        for choice in ["yes", "no", "no", "pending"]:
            await b.decision.insert(
                Decision(
                    user_id=user_id,
                    domain_classification="daily",
                    user_input="x",
                    user_input_hash="h" + choice,
                    proposal_text="p",
                    user_choice=choice,
                    llm_provider="mock",
                )
            )
    async with pg_factory.bundle() as b:
        summary = await b.decision.count_no_by_user(user_id)
        assert summary == {"no_count": 2, "total": 4}


async def test_pg_persona_record_usage_atomic(pg_factory: RepositoryFactory):
    user_id = await _make_user(pg_factory)
    async with pg_factory.bundle() as b:
        p = await b.persona.insert(
            Persona(
                owner_user_id=user_id,
                name="atomic-test",
                description="d",
                prompt_text="prompt",
            )
        )
        persona_id = p.id
    # 3 concurrent UPDATEs (via separate session/transactions)
    async with pg_factory.bundle() as b:
        await b.persona.record_usage(persona_id, was_yes=True)
    async with pg_factory.bundle() as b:
        await b.persona.record_usage(persona_id, was_yes=False)
    async with pg_factory.bundle() as b:
        await b.persona.record_usage(persona_id, was_yes=True)
    async with pg_factory.bundle() as b:
        got = await b.persona.get(persona_id)
        assert got is not None
        assert got.usage_count == 3
        assert got.yes_count == 2


async def test_pg_persona_report_unique_constraint(pg_factory: RepositoryFactory):
    user_id = await _make_user(pg_factory)
    async with pg_factory.bundle() as b:
        p = await b.persona.insert(
            Persona(
                owner_user_id=user_id,
                name="report-target",
                description="d",
                prompt_text="prompt",
            )
        )
        persona_id = p.id

    async with pg_factory.bundle() as b:
        await b.persona_report.insert(
            PersonaReport(
                persona_id=persona_id,
                reporter_user_id=user_id,
                reason="malicious",
            )
        )
    with pytest.raises(DuplicateReportError):
        async with pg_factory.bundle() as b:
            await b.persona_report.insert(
                PersonaReport(
                    persona_id=persona_id,
                    reporter_user_id=user_id,
                    reason="other",
                )
            )


async def test_pg_silence_log_count_by_domain(pg_factory: RepositoryFactory):
    user_id = await _make_user(pg_factory)
    async with pg_factory.bundle() as b:
        for domain in ["religion", "religion", "election"]:
            await b.silence.insert(
                SilenceLog(
                    user_id=user_id,
                    detected_domain=domain,
                    triggered_by="prompt-self-check",
                    user_input_hash="h" * 64,
                )
            )
    async with pg_factory.bundle() as b:
        counts = await b.silence.count_by_domain(user_id)
        assert counts == {"religion": 2, "election": 1}
