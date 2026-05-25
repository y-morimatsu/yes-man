"""Build-time generation of onboarding (signup 後) YES/NO 質問プール.

apps/api/scripts/generate_quick_start_templates.py と同パターン:
- LiteLLM (LiteLLM 既定: Azure / opencode / Bedrock など、`.env` 設定に従う) で
  35 service カテゴリ + 15 persona カテゴリ = 50 問を生成
- Pydantic で schema validate
- JSON を `apps/web/src/features/onboarding/onboardingQuestions.generated.json` に書く

実行例 (cwd = apps/api):
  .venv/bin/python scripts/generate_onboarding_questions.py
  # または再現性のため seed 指定で fallback ハードコード集合を使う
  .venv/bin/python scripts/generate_onboarding_questions.py --seed-fallback
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

# repo root の apps/api/src を Python path に追加
SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
sys.path.insert(0, str(SRC_DIR))

OUT_PATH = (
    SCRIPT_DIR.parent.parent.parent
    / "apps"
    / "web"
    / "src"
    / "features"
    / "onboarding"
    / "onboardingQuestions.generated.json"
)


# ---------------------------------------------------------------
# Schema
# ---------------------------------------------------------------
# 2026-05-23 (rev2): user 希望で「性格 + 生活面」中心に再設計.
# Service-specific 質問は最小限 (broad interest 4 件のみ)、合計 50 問.
PERSONALITY_CATEGORIES = ["careful", "optimistic", "efficient", "social", "creative"]
LIFESTYLE_CATEGORIES = [
    "morning_night",       # 朝型 / 夜型
    "indoor_outdoor",      # インドア / アウトドア
    "planner_impulsive",   # 計画的 / 即興的
    "experience_material", # 体験重視 / 物質重視
    "energy_solo_crowd",   # 一人時間 / 大勢
]

QuestionKind = Literal["personality", "lifestyle", "interest"]


@dataclass
class OnboardingQuestion:
    id: str
    text: str  # YES/NO 質問文 (statement 形式、 ~30 字以内)
    kind: QuestionKind
    category: str
    # YES 採択時の signal
    yes_signal: dict = field(default_factory=dict)
    # NO 採択時の signal
    no_signal: dict = field(default_factory=dict)


# ---------------------------------------------------------------
# Fallback (LLM 失敗時 + テスト用、決定論的)
# ---------------------------------------------------------------
def fallback_questions() -> list[OnboardingQuestion]:
    """ハードコード fallback (50 問、毎回同一).

    2026-05-23 (rev2): 性格 + 生活面 中心構成。
      - personality (25 問): careful / optimistic / efficient / social / creative の 5 軸 × 5 問
      - lifestyle  (20 問): 5 dim × 4 問 (生活パターン / 価値観 / エネルギー方向)
      - interest    (5 問): broad な興味 (本/音楽/運動/料理/旅 の有無) — 服やネット通販等の
        service 直結質問は外す (drill-down で自然に拾える)
    """
    qs: list[OnboardingQuestion] = []
    counter = 0

    # ============================================================
    # personality (25 問 = 5 軸 × 5 問)
    # ============================================================
    personality_pool = {
        "careful": [
            "新しいことを始める前にしっかり調べる方だ",
            "重要な決断には時間をかけたい",
            "リスクは避けたい性格だ",
            "メリットとデメリットを書き出して比較するタイプだ",
            "失敗を予測してから動く方だ",
        ],
        "optimistic": [
            "未知のことでもまず試してみる方だ",
            "失敗してもなんとかなると思える",
            "新しい場所を見つけたらすぐ行きたくなる",
            "ポジティブな気分でいることが多い",
            "明るい話題の方が好きだ",
        ],
        "efficient": [
            "時間を無駄にしたくない方だ",
            "ToDo リストや手帳でタスク管理する",
            "短時間で複数のことを並行処理するのが得意だ",
            "コスパや費用対効果を重視する",
            "最短ルートで目的を達成したい",
        ],
        "social": [
            "人と会って話すと元気になる方だ",
            "大人数の集まりに行くのは楽しい",
            "初対面の人ともすぐ仲良くなれる",
            "誰かと一緒に過ごす時間が好きだ",
            "SNS や チャットで人とよく繋がる",
        ],
        "creative": [
            "アート / 音楽 / 文章を創るのが好きだ",
            "決まったやり方より自分なりのやり方を試す",
            "新しいアイデアを思いつくのが楽しい",
            "「もし◯◯だったら」と空想することが多い",
            "見たことのない作品に強く惹かれる",
        ],
    }
    persona_name_map = {
        "careful": "慎重派",
        "optimistic": "楽観派",
        "efficient": "効率派",
        "social": "社交派",
        "creative": "創造派",
    }
    for cat, texts in personality_pool.items():
        for t in texts:
            counter += 1
            persona = persona_name_map[cat]
            qs.append(
                OnboardingQuestion(
                    id=f"persona-{cat}-{counter:03d}",
                    text=t,
                    kind="personality",
                    category=cat,
                    yes_signal={
                        "persona_boost": {persona: 0.15},
                        "inferred_tag": cat,
                    },
                    no_signal={"persona_boost": {persona: -0.05}},
                )
            )

    # ============================================================
    # lifestyle (20 問 = 5 dim × 4 問) — yes_signal / no_signal で両方向に tag
    # ============================================================
    # 各 dimension は (yes 側 tag, no 側 tag, yes 質問×4)
    lifestyle_dims = {
        "morning_night": (
            "morning-person",
            "night-owl",
            [
                "朝起きるのは比較的得意だ",
                "午前中の方が集中力が高い",
                "夜更かしより早寝早起きを好む",
                "休日の朝も普段と同じ時間に起きる",
            ],
            # 強い persona signal は付けない (生活面は persona より tag 優先)
            {"楽観派": 0.03},
        ),
        "indoor_outdoor": (
            "outdoor-lover",
            "indoor-cocoon",
            [
                "週末は外に出かけたい派だ",
                "自然の中にいると気分が落ち着く",
                "散歩や旅をすると元気が出る",
                "室内に長くいると窮屈に感じる",
            ],
            {"楽観派": 0.05},
        ),
        "planner_impulsive": (
            "planner",
            "impulsive",
            [
                "予定を立ててから動くタイプだ",
                "旅行も calendar に書き込んで進める方だ",
                "計画通りに事が進むと安心する",
                "段取りを考えるのは苦にならない",
            ],
            {"慎重派": 0.08, "効率派": 0.05},
        ),
        "experience_material": (
            "experience-seeker",
            "material-collector",
            [
                "モノを買うより体験にお金を使いたい",
                "旅行や ライブ など 思い出に残ることを優先する",
                "物欲はあまり強い方ではない",
                "経験のためなら遠出も気にならない",
            ],
            {"創造派": 0.05},
        ),
        "energy_solo_crowd": (
            "solo-recharge",
            "crowd-energy",
            [
                "1 人の時間でエネルギーを回復する方だ",
                "静かなカフェや図書館で過ごすのが好きだ",
                "大勢といると疲れてしまう方だ",
                "深く考えごとをする時間が必要だ",
            ],
            {"創造派": 0.04, "慎重派": 0.03},
        ),
    }
    for cat, (yes_tag, no_tag, texts, persona_boost) in lifestyle_dims.items():
        for t in texts:
            counter += 1
            qs.append(
                OnboardingQuestion(
                    id=f"life-{cat}-{counter:03d}",
                    text=t,
                    kind="lifestyle",
                    category=cat,
                    yes_signal={
                        "inferred_tag": yes_tag,
                        "persona_boost": persona_boost,
                    },
                    no_signal={"inferred_tag": no_tag},
                )
            )

    # ============================================================
    # interest (5 問) — broad な興味 (service には直結させない)
    # ============================================================
    interest_pool = {
        "reading": "本や記事を読むのが日常の一部だ",
        "music": "音楽は毎日のように聴いている",
        "exercise": "体を動かす習慣がある",
        "cooking": "料理を楽しむ方だ",
        "travel": "旅をして新しい土地を見るのが好きだ",
    }
    for cat, t in interest_pool.items():
        counter += 1
        qs.append(
            OnboardingQuestion(
                id=f"int-{cat}-{counter:03d}",
                text=t,
                kind="interest",
                category=cat,
                yes_signal={"inferred_tag": cat},
                no_signal={},
            )
        )

    return qs


# ---------------------------------------------------------------
# LLM 生成 (optional)
# ---------------------------------------------------------------
async def generate_via_llm() -> list[OnboardingQuestion]:
    """LiteLLM 経由で 50 問を生成 (single-prompt + JSON 出力)."""
    try:
        from yesman_api.infrastructure.config import AppConfig
        from yesman_api.infrastructure.decision.llm_providers.litellm_adapter import (
            LiteLLMAdapter,
        )

        cfg = AppConfig()
        adapter = LiteLLMAdapter(cfg)
    except Exception as exc:
        print(f"⚠ LLM adapter unavailable ({exc})、fallback を使う", file=sys.stderr)
        return fallback_questions()

    system = (
        "あなたは YesMan という意思決定支援サービスの onboarding 質問プールを生成するアシスタントです。"
        "新規ユーザの **性格と生活パターン** を把握するため、YES/NO で答えられる短い質問 "
        "(各 ~30 字以内、自然な日本語、丁寧な statement 形式) を 50 問生成してください。"
        "出力は厳密な JSON 配列のみ。各要素 = {id, text, kind, category, yes_signal, no_signal}。"
    )
    prompt = (
        "カテゴリ構成 (合計 50 問):\n"
        " - personality (25 問): careful / optimistic / efficient / social / creative の 5 軸 × 5 問\n"
        " - lifestyle  (20 問): morning_night / indoor_outdoor / planner_impulsive / "
        "experience_material / energy_solo_crowd の 5 dim × 4 問\n"
        " - interest    (5 問): reading / music / exercise / cooking / travel の broad な興味\n\n"
        "yes_signal / no_signal のスキーマ:\n"
        ' - personality: yes_signal={"persona_boost":{"慎重派":0.15}, "inferred_tag":"careful"} / '
        ' no_signal={"persona_boost":{"慎重派":-0.05}}\n'
        '   (careful→慎重派, optimistic→楽観派, efficient→効率派, social→社交派, creative→創造派)\n'
        ' - lifestyle: yes_signal={"inferred_tag":"<yes側ラベル>", "persona_boost":{...}}'
        ' / no_signal={"inferred_tag":"<no側ラベル>"}\n'
        '   (yes/no で別タグを付け、value system を両方向にラベル化)\n'
        ' - interest: yes_signal={"inferred_tag":"<category>"} / no_signal={}\n\n'
        "**Service-specific (Amazon, Netflix, ユニクロ 等の固有名) は質問本文に含めない**。"
        "それらは drill-down で自然に拾われる。生活と価値観に焦点を当てる。\n"
        "JSON のみ出力、説明文 / Markdown コードブロック禁止。"
    )

    try:
        raw = await adapter.complete(
            system=system,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.4,
        )
        cleaned = raw.strip()
        # Markdown コードブロックが含まれていたら剥がす
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        data = json.loads(cleaned)
        if not isinstance(data, list) or len(data) < 30:
            raise ValueError(f"LLM response 期待 list (>= 30) だが、 len={len(data) if isinstance(data, list) else 'N/A'}")
        questions: list[OnboardingQuestion] = []
        for item in data:
            questions.append(
                OnboardingQuestion(
                    id=str(item["id"]),
                    text=str(item["text"])[:60],
                    kind=str(item["kind"]),
                    category=str(item["category"]),
                    yes_signal=dict(item.get("yes_signal") or {}),
                    no_signal=dict(item.get("no_signal") or {}),
                )
            )
        return questions
    except Exception as exc:
        print(f"⚠ LLM 生成失敗 ({exc})、fallback を使う", file=sys.stderr)
        return fallback_questions()


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--seed-fallback",
        action="store_true",
        help="LLM を呼ばずに hardcoded fallback を使う (決定論的)",
    )
    args = parser.parse_args()

    if args.seed_fallback:
        questions = fallback_questions()
        generated_by = "fallback-handcurated-v1"
    else:
        try:
            questions = asyncio.run(generate_via_llm())
            generated_by = (
                "litellm-"
                + (os.environ.get("LITELLM_MODEL") or "unknown")
                if any(q.id.startswith("svc-") is False for q in questions[:1])
                else "fallback-handcurated-v1"
            )
        except Exception as exc:
            print(f"⚠ LLM 経路失敗 ({exc})、fallback を使う", file=sys.stderr)
            questions = fallback_questions()
            generated_by = "fallback-handcurated-v1"

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedBy": generated_by,
        "schemaVersion": 1,
        "questions": [asdict(q) for q in questions],
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"✅ {len(questions)} 問を生成、{OUT_PATH} に出力")


if __name__ == "__main__":
    main()
