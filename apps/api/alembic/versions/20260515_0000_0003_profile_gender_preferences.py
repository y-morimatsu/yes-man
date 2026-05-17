"""profile gender + preferences columns

Revision ID: 0003_profile_gender_preferences
Revises: 0002_builtin_personas
Create Date: 2026-05-15

Adds two JSONB columns required for FR-AUTH-02 (gender multi-select, preferences free-form).

Notes:
- PostgreSQL 13+ では JSONB DEFAULT '[]'::jsonb / '{}'::jsonb は fast-path で適用される
  (テーブル書き換えなし、O(1) メタデータ更新のみ)。本プロジェクトの Aurora 15+ 想定で問題なし。
- 既存行には server_default が遡及適用されるため、データ移行不要。
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0003_profile_gender_preferences"
down_revision = "0002_builtin_personas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "profiles",
        sa.Column(
            "gender",
            JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "profiles",
        sa.Column(
            "preferences",
            JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("profiles", "preferences")
    op.drop_column("profiles", "gender")
