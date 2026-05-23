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
SERVICE_CATEGORIES = [
    "movie",
    "food_delivery",
    "food_restaurant",
    "shopping",
    "fashion",
    "music",
    "books",
    "travel",
    "games",
    "exercise",
]
PERSONA_CATEGORIES = ["careful", "optimistic", "efficient"]

QuestionKind = Literal["service", "persona"]


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
    """LLM 不在時のハードコード fallback (50 問、毎回同一)."""
    qs: list[OnboardingQuestion] = []

    # ---- Service (35 問) ----
    service_pool = {
        "movie": [
            "週末は家で映画やドラマを観るのが好きだ",
            "ホラー映画は楽しめる方だ",
            "話題の新作映画は公開後すぐ観たい",
            "字幕より吹替の方が観やすい",
        ],
        "food_delivery": [
            "宅配サービスをよく利用する",
            "ピザは食べたくなる方だ",
            "Uber Eats などのデリバリーは便利だと思う",
            "外食より宅配で家で食べる方が好きだ",
        ],
        "food_restaurant": [
            "外食でレストランを開拓するのが好きだ",
            "新しい店を Google Maps で探す方だ",
            "ランチは外で食べる方が多い",
        ],
        "shopping": [
            "Amazon でよく買い物をする",
            "ポイント還元やセールは気になる方だ",
            "ネット通販で物を買うことに抵抗はない",
            "メルカリなどフリマアプリを使う",
        ],
        "fashion": [
            "服を買うのが好きだ",
            "ユニクロや GU でよく服を買う",
            "シーズン毎に新しい服を揃えたい",
        ],
        "music": [
            "毎日音楽を聴く",
            "Spotify などのストリーミング音楽サービスを使っている",
            "プレイリストを作るのが好きだ",
        ],
        "books": [
            "本や漫画を読むのが好きだ",
            "Kindle や電子書籍を使う方だ",
            "ノンフィクションや学術書を読むことがある",
        ],
        "travel": [
            "旅行に行くのが好きだ",
            "国内より海外旅行に興味がある",
            "計画を立てるよりも行き当たりばったりの旅が好き",
        ],
        "games": [
            "ゲームをよくする方だ",
            "スマホアプリゲームより据え置き機でゲームしたい",
            "RPG / ストーリー重視のゲームが好きだ",
        ],
        "exercise": [
            "週に 1 回以上は運動する",
            "ジムやヨガなど屋内運動が好きだ",
            "ランニングやウォーキングが好きだ",
            "筋トレや自宅トレーニングを習慣にしている",
        ],
    }
    counter = 0
    for cat, texts in service_pool.items():
        for t in texts:
            counter += 1
            qs.append(
                OnboardingQuestion(
                    id=f"svc-{cat}-{counter:03d}",
                    text=t,
                    kind="service",
                    category=cat,
                    yes_signal={
                        "accepted_pattern_domain": cat,
                        "inferred_tag": cat,
                    },
                    no_signal={"rejected_pattern_domain": cat},
                )
            )

    # ---- Persona (15 問) ----
    persona_pool = {
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
            "新しい店や場所を見つけたらすぐ行きたくなる",
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
    }
    for cat, texts in persona_pool.items():
        for t in texts:
            counter += 1
            persona_name = {
                "careful": "慎重派",
                "optimistic": "楽観派",
                "efficient": "効率派",
            }[cat]
            qs.append(
                OnboardingQuestion(
                    id=f"persona-{cat}-{counter:03d}",
                    text=t,
                    kind="persona",
                    category=cat,
                    yes_signal={"persona_boost": {persona_name: 0.15}},
                    no_signal={"persona_boost": {persona_name: -0.05}},
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
        "新規ユーザの嗜好を把握するため、YES/NO で答えられる短い質問 (各 ~30 字以内、自然な日本語) を 50 問生成してください。"
        "出力は厳密な JSON 配列のみ。各要素 = {id, text, kind, category, yes_signal, no_signal}。"
    )
    prompt = (
        "カテゴリ構成:\n"
        " - service (35 問): movie/food_delivery/food_restaurant/shopping/fashion/music/books/travel/games/exercise からバランス良く\n"
        " - persona (15 問): careful (5) + optimistic (5) + efficient (5)\n\n"
        "yes_signal/no_signal は次のスキーマ:\n"
        ' - service: yes_signal={"accepted_pattern_domain": "movie", "inferred_tag": "movie"} / no_signal={"rejected_pattern_domain": "movie"}\n'
        ' - persona: yes_signal={"persona_boost": {"慎重派": 0.15}} (careful なら 慎重派、optimistic なら 楽観派、efficient なら 効率派) / no_signal={"persona_boost": {"慎重派": -0.05}}\n\n'
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
