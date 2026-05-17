"""initial: 7 tables + indexes + UNIQUE constraint

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-10 00:00:00

Tables (FD §3 / Infra Design §1):
- profiles
- decisions
- preference_profiles
- silence_logs
- personas
- persona_reports
- user_persona_selections
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------
    # profiles
    # ------------------------------------------------------------
    op.create_table(
        "profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("age_group", sa.String(length=20), nullable=True),
        sa.Column("occupation", sa.String(length=100), nullable=True),
        sa.Column(
            "value_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("life_stage", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_profiles_email", "profiles", ["email"], unique=True)

    # ------------------------------------------------------------
    # decisions
    # ------------------------------------------------------------
    op.create_table(
        "decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.user_id"),
            nullable=False,
        ),
        sa.Column("domain_classification", sa.String(length=50), nullable=False),
        sa.Column("user_input", sa.Text(), nullable=False),
        sa.Column("user_input_hash", sa.String(length=64), nullable=False),
        sa.Column("proposal_text", sa.Text(), nullable=False),
        sa.Column(
            "persona_outputs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("user_choice", sa.String(length=10), nullable=False),
        sa.Column("no_attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("llm_provider", sa.String(length=50), nullable=False),
        sa.Column(
            "selected_persona_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_decisions_user_id", "decisions", ["user_id"])
    op.create_index("ix_decisions_user_input_hash", "decisions", ["user_input_hash"])
    op.create_index("ix_decisions_created_at", "decisions", ["created_at"])
    op.create_index(
        "ix_decisions_user_created", "decisions", ["user_id", "created_at"]
    )

    # ------------------------------------------------------------
    # preference_profiles
    # ------------------------------------------------------------
    op.create_table(
        "preference_profiles",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.user_id"),
            primary_key=True,
        ),
        sa.Column(
            "accepted_patterns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "rejected_patterns",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "persona_style_preference",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "inferred_tags",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "last_updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # ------------------------------------------------------------
    # silence_logs
    # ------------------------------------------------------------
    op.create_table(
        "silence_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.user_id"),
            nullable=False,
        ),
        sa.Column("detected_domain", sa.String(length=20), nullable=False),
        sa.Column("triggered_by", sa.String(length=30), nullable=False),
        sa.Column("user_input_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_silence_logs_user_id", "silence_logs", ["user_id"])
    op.create_index("ix_silence_logs_detected_domain", "silence_logs", ["detected_domain"])
    op.create_index("ix_silence_logs_created_at", "silence_logs", ["created_at"])

    # ------------------------------------------------------------
    # personas
    # ------------------------------------------------------------
    op.create_table(
        "personas",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.user_id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_builtin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("yes_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("ix_personas_owner_user_id", "personas", ["owner_user_id"])
    op.create_index("ix_personas_is_shared", "personas", ["is_shared"])

    # ------------------------------------------------------------
    # persona_reports
    # ------------------------------------------------------------
    op.create_table(
        "persona_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "persona_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("personas.id"),
            nullable=False,
        ),
        sa.Column(
            "reporter_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.user_id"),
            nullable=False,
        ),
        sa.Column("reason", sa.String(length=30), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=30),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint(
            "persona_id", "reporter_user_id", name="uq_persona_report_user"
        ),
    )
    op.create_index("ix_persona_reports_persona_id", "persona_reports", ["persona_id"])
    op.create_index("ix_persona_reports_status", "persona_reports", ["status"])

    # ------------------------------------------------------------
    # user_persona_selections
    # ------------------------------------------------------------
    op.create_table(
        "user_persona_selections",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("profiles.user_id"),
            primary_key=True,
        ),
        sa.Column(
            "persona_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )


def downgrade() -> None:
    op.drop_table("user_persona_selections")
    op.drop_index("ix_persona_reports_status", table_name="persona_reports")
    op.drop_index("ix_persona_reports_persona_id", table_name="persona_reports")
    op.drop_table("persona_reports")
    op.drop_index("ix_personas_is_shared", table_name="personas")
    op.drop_index("ix_personas_owner_user_id", table_name="personas")
    op.drop_table("personas")
    op.drop_index("ix_silence_logs_created_at", table_name="silence_logs")
    op.drop_index("ix_silence_logs_detected_domain", table_name="silence_logs")
    op.drop_index("ix_silence_logs_user_id", table_name="silence_logs")
    op.drop_table("silence_logs")
    op.drop_table("preference_profiles")
    op.drop_index("ix_decisions_user_created", table_name="decisions")
    op.drop_index("ix_decisions_created_at", table_name="decisions")
    op.drop_index("ix_decisions_user_input_hash", table_name="decisions")
    op.drop_index("ix_decisions_user_id", table_name="decisions")
    op.drop_table("decisions")
    op.drop_index("ix_profiles_email", table_name="profiles")
    op.drop_table("profiles")
