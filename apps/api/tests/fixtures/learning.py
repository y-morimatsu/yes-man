"""U5 / learning 専用テスト fixture (Infra Design I2 反映、U4 fixture と分離).

decision_factory / preference_profile_factory / sqs_message_factory の 3 種.
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timezone
from uuid import UUID

from yesman_api.domain.persistence.models import Decision, PreferenceProfile


def decision_factory(
    *,
    user_id: UUID | None = None,
    decision_id: UUID | None = None,
    choice: str = "yes",
    domain: str = "daily",
    persona_names: list[str] | None = None,
) -> Decision:
    persona_names = persona_names or ["効率派", "慎重派"]
    return Decision(
        id=decision_id or _uuid.uuid4(),
        user_id=user_id or _uuid.uuid4(),
        domain_classification=domain,
        user_input="test input",
        user_input_hash="x" * 64,
        proposal_text="test proposal",
        persona_outputs={
            "utterances": [
                {
                    "persona_id": str(_uuid.uuid4()),
                    "persona_name": name,
                    "text": f"{name}の意見",
                }
                for name in persona_names
            ],
        },
        user_choice=choice,
        no_attempt_count=0,
        llm_provider="mock",
        selected_persona_ids=[str(_uuid.uuid4()) for _ in persona_names],
    )


def preference_profile_factory(
    *,
    user_id: UUID | None = None,
    accepted_patterns: list[dict] | None = None,
    rejected_patterns: list[dict] | None = None,
    persona_style_preference: dict[str, float] | None = None,
    inferred_tags: list[str] | None = None,
) -> PreferenceProfile:
    return PreferenceProfile(
        user_id=user_id or _uuid.uuid4(),
        accepted_patterns=accepted_patterns or [],
        rejected_patterns=rejected_patterns or [],
        persona_style_preference=persona_style_preference or {},
        inferred_tags=inferred_tags or [],
        last_updated_at=datetime.now(timezone.utc),
    )


def sqs_message_factory(
    *,
    user_id: UUID,
    decision_id: UUID,
    choice: str = "yes",
    domain: str = "daily",
    timestamp: datetime | None = None,
) -> dict:
    """EventBridge envelope 形式の SQS message body."""
    timestamp = timestamp or datetime.now(timezone.utc)
    return {
        "version": "0",
        "id": str(_uuid.uuid4()),
        "detail-type": "DecisionConfirmed",
        "source": "yesman.api",
        "time": timestamp.isoformat(),
        "detail": {
            "user_id": str(user_id),
            "decision_id": str(decision_id),
            "choice": choice,
            "domain": domain,
            "timestamp": timestamp.isoformat(),
        },
    }


__all__ = ["decision_factory", "preference_profile_factory", "sqs_message_factory"]
