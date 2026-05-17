"""builtin personas: system user + 3 builtin personas (慎重派 / 楽観派 / 効率派)

Revision ID: 0002_builtin_personas
Revises: 0001_initial
Create Date: 2026-05-10 00:01:00

Seeds:
- profiles: 1 system user (00000000-0000-0000-0000-000000000001)
- personas: 3 builtin personas (is_builtin=true, owner=system_user)

UUIDs are deterministic so re-running upgrade does not duplicate.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_builtin_personas"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001"
PERSONA_CAUTIOUS_ID = "00000000-0000-0000-0000-0000000000a1"
PERSONA_OPTIMIST_ID = "00000000-0000-0000-0000-0000000000a2"
PERSONA_EFFICIENT_ID = "00000000-0000-0000-0000-0000000000a3"


def upgrade() -> None:
    # System user (owner for builtin personas)
    op.execute(
        sa.text(
            """
            INSERT INTO profiles (user_id, email, value_tags, created_at, updated_at)
            VALUES (
                :user_id,
                'system@yesman.internal',
                '[]'::jsonb,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (user_id) DO NOTHING
            """
        ).bindparams(user_id=SYSTEM_USER_ID)
    )

    # 3 builtin personas
    builtin_personas = [
        {
            "id": PERSONA_CAUTIOUS_ID,
            "name": "慎重派",
            "description": "リスクを丁寧に検討して背中を押す慎重派の友人",
            "prompt_text": (
                "あなたは慎重派の友人です。提案には常にリスク要素を 1-2 個指摘しつつ、"
                "それでも「やってみる価値がある」と前向きに背中を押す YES の回答を返します。"
            ),
        },
        {
            "id": PERSONA_OPTIMIST_ID,
            "name": "楽観派",
            "description": "可能性を最大限信じてくれる前向きな友人",
            "prompt_text": (
                "あなたは楽観派の友人です。ユーザーの提案を「絶対うまくいく！」と全力で肯定し、"
                "成功した未来をイメージさせる YES の回答を返します。"
            ),
        },
        {
            "id": PERSONA_EFFICIENT_ID,
            "name": "効率派",
            "description": "コスト・時間効率の観点で背中を押す効率派の友人",
            "prompt_text": (
                "あなたは効率派の友人です。提案を「時間/コスト効率がいい」「ROI が高い」"
                "という観点で評価し、最短ルートで実行を勧める YES の回答を返します。"
            ),
        },
    ]

    for p in builtin_personas:
        op.execute(
            sa.text(
                """
                INSERT INTO personas (
                    id, owner_user_id, name, description, prompt_text,
                    is_shared, is_blocked, is_builtin, is_deleted,
                    usage_count, yes_count, created_at, updated_at
                )
                VALUES (
                    :id, :owner_id, :name, :description, :prompt_text,
                    true, false, true, false,
                    0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                ON CONFLICT (id) DO NOTHING
                """
            ).bindparams(
                id=p["id"],
                owner_id=SYSTEM_USER_ID,
                name=p["name"],
                description=p["description"],
                prompt_text=p["prompt_text"],
            )
        )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM personas WHERE id IN (:p1, :p2, :p3)").bindparams(
            p1=PERSONA_CAUTIOUS_ID,
            p2=PERSONA_OPTIMIST_ID,
            p3=PERSONA_EFFICIENT_ID,
        )
    )
    op.execute(
        sa.text("DELETE FROM profiles WHERE user_id = :user_id").bindparams(
            user_id=SYSTEM_USER_ID
        )
    )
