"""Generate Quick-Start template pool via Bedrock LLM (build-time).

spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §6.4
plan: docs/superpowers/plans/2026-05-22-yes-no-quickstart.md Task 1.2

Usage:
    cd apps/api
    uv run python scripts/generate_quick_start_templates.py [--count 30] \\
        [--out ../web/src/features/decision/quickStartTemplates.generated.json] \\
        [--model anthropic.claude-sonnet-4-6-20250929-v1:0]

AWS credentials and Bedrock access for the chosen model are required.
On schema validation failure the script retries up to 3 times with a corrective
prompt; if all attempts fail it exits with code 1.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import ValidationError

# allow running directly from `apps/api` without installing the package
_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))

from yesman_api.application.quick_start.schema import (  # noqa: E402
    QuickStartTemplatePool,
)

DEFAULT_MODEL = "anthropic.claude-sonnet-4-6-20250929-v1:0"
DEFAULT_OUT = (
    _ROOT.parent / "web" / "src" / "features" / "decision" / "quickStartTemplates.generated.json"
)
DEFAULT_COUNT = 30
MAX_RETRIES = 3
SEED_GENERATED_BY = "seed-manual-v1"

# fallback pool — used when AWS credentials are unavailable (e.g. dev / CI without Bedrock).
# Replace by re-running this script without --seed once Bedrock access is set up.
SEED_TEMPLATES: list[dict[str, Any]] = [
    {"id": "lunch-weekday", "title": "今日のランチ", "hours": [11, 12, 13, 14], "dayKind": "weekday", "preferenceTag": None, "priority": 95},
    {"id": "lunch-weekend", "title": "週末のお昼ごはん", "hours": [11, 12, 13, 14], "dayKind": "weekend", "preferenceTag": None, "priority": 92},
    {"id": "dinner", "title": "今夜の夕食", "hours": [17, 18, 19, 20, 21], "dayKind": "any", "preferenceTag": None, "priority": 90},
    {"id": "morning-coffee", "title": "朝のコーヒー", "hours": [6, 7, 8, 9, 10], "dayKind": "any", "preferenceTag": None, "priority": 85},
    {"id": "morning-tea", "title": "朝の紅茶", "hours": [6, 7, 8, 9, 10], "dayKind": "any", "preferenceTag": None, "priority": 70},
    {"id": "weekend-outing", "title": "週末の外出先", "hours": [9, 10, 11, 12], "dayKind": "weekend", "preferenceTag": None, "priority": 88},
    {"id": "weekend-movie", "title": "週末に 観る 映画", "hours": [18, 19, 20, 21, 22, 23], "dayKind": "weekend", "preferenceTag": None, "priority": 80},
    {"id": "weekend-cafe", "title": "午後に 行く カフェ", "hours": [13, 14, 15, 16, 17], "dayKind": "weekend", "preferenceTag": None, "priority": 75},
    {"id": "weekend-book", "title": "週末に 読む 本", "hours": [10, 11, 12, 13, 14, 15], "dayKind": "weekend", "preferenceTag": None, "priority": 65},
    {"id": "weekend-walk", "title": "週末の 散歩 コース", "hours": [9, 10, 11, 15, 16, 17], "dayKind": "weekend", "preferenceTag": None, "priority": 70},
    {"id": "late-snack", "title": "深夜の 夜食", "hours": [22, 23, 0, 1], "dayKind": "any", "preferenceTag": None, "priority": 60},
    {"id": "tomorrow-outfit", "title": "明日 着る 服", "hours": [19, 20, 21, 22, 23], "dayKind": "any", "preferenceTag": None, "priority": 72},
    {"id": "tomorrow-plan", "title": "明日の 予定", "hours": [20, 21, 22, 23], "dayKind": "any", "preferenceTag": None, "priority": 68},
    {"id": "meeting-followup", "title": "この後の 進め方", "hours": [14, 15, 16, 17], "dayKind": "weekday", "preferenceTag": None, "priority": 78},
    {"id": "afternoon-break", "title": "午後の 休憩", "hours": [14, 15, 16], "dayKind": "weekday", "preferenceTag": None, "priority": 60},
    {"id": "snack-time", "title": "おやつ タイム", "hours": [14, 15, 16, 17], "dayKind": "any", "preferenceTag": None, "priority": 55},
    {"id": "exercise", "title": "今日の 運動", "hours": [6, 7, 8, 18, 19, 20, 21], "dayKind": "any", "preferenceTag": None, "priority": 50},
    {"id": "music-mood", "title": "今 聴きたい 音楽", "hours": [], "dayKind": "any", "preferenceTag": None, "priority": 45},
    {"id": "weekend-trip", "title": "週末の 小旅行", "hours": [8, 9, 10, 11, 12], "dayKind": "weekend", "preferenceTag": None, "priority": 73},
    {"id": "weekend-cooking", "title": "週末に 作る 料理", "hours": [10, 11, 16, 17, 18], "dayKind": "weekend", "preferenceTag": None, "priority": 67},
    {"id": "night-reflection", "title": "今日の 振り返り", "hours": [22, 23, 0], "dayKind": "any", "preferenceTag": None, "priority": 55},
    {"id": "morning-task", "title": "朝 一番に やる こと", "hours": [6, 7, 8, 9], "dayKind": "weekday", "preferenceTag": None, "priority": 75},
    {"id": "bedtime", "title": "今夜の 就寝時間", "hours": [21, 22, 23, 0], "dayKind": "any", "preferenceTag": None, "priority": 50},
    {"id": "shopping-list", "title": "今日 買う もの", "hours": [10, 11, 12, 13, 17, 18, 19], "dayKind": "any", "preferenceTag": None, "priority": 58},
    {"id": "study-topic", "title": "今 学びたい こと", "hours": [], "dayKind": "any", "preferenceTag": None, "priority": 40},
    {"id": "self-care", "title": "今夜の セルフケア", "hours": [19, 20, 21, 22, 23], "dayKind": "any", "preferenceTag": None, "priority": 52},
    {"id": "weekend-friend", "title": "週末に 会う 友人", "hours": [10, 11, 12, 13, 14, 15], "dayKind": "weekend", "preferenceTag": None, "priority": 63},
    {"id": "morning-stretch", "title": "朝の ストレッチ", "hours": [6, 7, 8, 9], "dayKind": "any", "preferenceTag": None, "priority": 48},
    {"id": "lunch-spot", "title": "ランチで 行く お店", "hours": [11, 12, 13], "dayKind": "any", "preferenceTag": None, "priority": 82},
    {"id": "evening-drink", "title": "今夜の 一杯", "hours": [18, 19, 20, 21, 22], "dayKind": "any", "preferenceTag": None, "priority": 58},
]

SEED_CATCH_ALL: dict[str, Any] = {
    "id": "anything-on-mind",
    "title": "今 もっとも 気になっていること",
    "hours": [],
    "dayKind": "any",
    "preferenceTag": None,
    "priority": 10,
}

SYSTEM_PROMPT = """\
あなたは「YesMan」アプリの UX ライター兼 AI 哲学者です。

YesMan の哲学: 「人間最後の仕事は、YES で承認すること。」
日常の小さな決定 (食事 / 服装 / 娯楽 / 行動など) を AI が提案し、ユーザは
YES/NO で答えるだけで決定できる、という思想を体現する Quick-Start 質問を
生成してください。

# 出力ルール (厳守)
- 必ず純粋な JSON のみを返す (markdown コードフェンス、説明文、前後の空白行いずれも禁止)
- スキーマ:
  {
    "templates": [
      {
        "id":            "kebab-case-ascii",          // 一意、英小文字とハイフンのみ
        "title":         "<4-15 字の日本語タイトル>",    // 末尾に「してみますか?」を付けない
        "hours":         [11, 12, 13],                 // この質問が自然な時刻 (0-23)、空配列なら任意
        "dayKind":       "weekday" | "weekend" | "any",
        "preferenceTag": null | "<persona_style_preference キー>",
        "priority":      0-100                          // 高いほど先に提示
      },
      ...
    ],
    "catchAll": { ... 同じ schema、任意時刻 / dayKind=any / priority=10 ... }
  }

# title 設計指針
- 「今日のランチ」「明日 着る 服」「週末に 観る 映画」のような、日常の小さな決定対象
- 動詞は付けず、名詞句 / 体言止めで簡潔に (UI 側で「してみますか?」を自動付加)
- 4-15 字 (日本語) 程度、半角スペースで読みやすく区切る
- 重複する話題を避け、時刻帯 / dayKind の組み合わせで適切に分散させる

# hours の付け方
- 朝食 / コーヒー: 6-10
- ランチ: 11-14
- 午後の作業: 14-17
- 夕食: 17-21
- 夜の娯楽: 19-23
- 深夜の振り返り: 22, 23, 0, 1
- 任意時刻が自然なものは hours=[] でも可

# id 命名
- 質問内容を要約した kebab-case (例: lunch-weekday, morning-coffee, weekend-movie)
- 全 templates + catchAll で 一意

# catchAll
- どんな時刻 / 曜日でも提示できる最終手段の質問
- 例: 「今 もっとも 気になっていること」
- priority は 10 程度 (常に末尾候補となる)

ユーザ要求の件数だけ templates 配列を生成し、必ず catchAll も 1 件付けてください。
"""

USER_PROMPT_TEMPLATE = """\
templates 配列に {count} 件、catchAll に 1 件、合計 {total} 件を JSON で生成してください。

- 時刻帯 / 曜日 / トピックは多様に
- 同一 id / 同一 title が重複しないように
- 出力は JSON オブジェクト 1 つのみ (前後に何も付けない)
"""

RETRY_PROMPT_TEMPLATE = """\
前回の出力は JSON schema validation に失敗しました:

エラー: {error}

スキーマと出力ルールを守って、もう一度 JSON のみを出力してください。
"""


def _strip_code_fence(text: str) -> str:
    """Remove ```json ... ``` if LLM ignored the instruction."""
    stripped = text.strip()
    if stripped.startswith("```"):
        # remove first fence line
        stripped = re.sub(r"^```[a-zA-Z]*\n", "", stripped)
        # remove trailing fence
        if stripped.endswith("```"):
            stripped = stripped[:-3]
    return stripped.strip()


async def _call_llm(
    model: str,
    region: str,
    system: str,
    messages: list[dict[str, str]],
) -> str:
    try:
        import litellm  # type: ignore[import-untyped]
    except ImportError as exc:
        raise RuntimeError(
            "litellm is not installed. Run from apps/api with the project's dev env."
        ) from exc

    litellm.aws_region_name = region
    resp = await litellm.acompletion(
        model=f"bedrock/{model}",
        messages=[{"role": "system", "content": system}] + messages,
        temperature=0.8,
        aws_region_name=region,
    )
    return resp["choices"][0]["message"]["content"]  # type: ignore[no-any-return]


async def _generate_pool(
    *,
    model: str,
    region: str,
    count: int,
) -> QuickStartTemplatePool:
    user_prompt = USER_PROMPT_TEMPLATE.format(count=count, total=count + 1)
    messages: list[dict[str, str]] = [{"role": "user", "content": user_prompt}]
    last_error: str | None = None

    for attempt in range(1, MAX_RETRIES + 1):
        if last_error:
            messages.append(
                {"role": "user", "content": RETRY_PROMPT_TEMPLATE.format(error=last_error)}
            )

        try:
            raw = await _call_llm(
                model=model,
                region=region,
                system=SYSTEM_PROMPT,
                messages=messages,
            )
        except Exception as exc:  # noqa: BLE001 - bubble Bedrock errors with attempt context
            raise RuntimeError(
                f"Bedrock call failed on attempt {attempt}/{MAX_RETRIES}: {exc}"
            ) from exc

        cleaned = _strip_code_fence(raw)
        try:
            payload: dict[str, Any] = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            last_error = f"JSON parse error: {exc.msg} at line {exc.lineno}"
            messages.append({"role": "assistant", "content": raw})
            print(f"[attempt {attempt}] {last_error}", file=sys.stderr)
            continue

        # inject metadata before schema validation so missing-field errors come from `templates`
        payload.setdefault("generatedAt", datetime.now(timezone.utc).isoformat())
        payload.setdefault("generatedBy", model)
        payload.setdefault("schemaVersion", 1)

        try:
            pool = QuickStartTemplatePool.model_validate(payload)
        except ValidationError as exc:
            last_error = str(exc)
            messages.append({"role": "assistant", "content": raw})
            print(f"[attempt {attempt}] schema validation failed:\n{exc}", file=sys.stderr)
            continue

        return pool

    raise RuntimeError(
        f"Failed to obtain a valid template pool after {MAX_RETRIES} attempts. "
        f"Last error: {last_error}"
    )


def _build_seed_pool(count: int | None = None) -> QuickStartTemplatePool:
    """Deterministic offline fallback used when Bedrock is unavailable."""
    templates = SEED_TEMPLATES if count is None else SEED_TEMPLATES[:count]
    payload: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedBy": SEED_GENERATED_BY,
        "schemaVersion": 1,
        "templates": templates,
        "catchAll": SEED_CATCH_ALL,
    }
    return QuickStartTemplatePool.model_validate(payload)


def _write_pool(pool: QuickStartTemplatePool, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        pool.model_dump_json(indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--region", default="ap-northeast-1")
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Skip Bedrock and write a deterministic hand-authored seed pool. "
        "Used in environments without AWS credentials. The output is marked "
        f"`generatedBy={SEED_GENERATED_BY}` so reviewers can tell it apart "
        "from genuine LLM output.",
    )
    args = parser.parse_args()

    if args.seed:
        pool = _build_seed_pool()
        _write_pool(pool, args.out)
        print(
            f"OK (seed): wrote {len(pool.templates)} seeded templates + catchAll to {args.out}",
            file=sys.stderr,
        )
        return 0

    try:
        pool = asyncio.run(
            _generate_pool(model=args.model, region=args.region, count=args.count)
        )
    except RuntimeError as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1

    _write_pool(pool, args.out)
    print(
        f"OK: generated {len(pool.templates)} templates + catchAll, wrote to {args.out}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
