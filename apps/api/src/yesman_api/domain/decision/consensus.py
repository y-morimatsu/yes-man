"""ConsensusOrchestrator — parallel-persona-consensus のプロンプト構築 + 出力 clean.

spec 2026-05-21 §5, §10: legacy single-prompt XML parser (build_prompt / parse / stream_parse)
は削除済み。build_persona_prompt / build_proposal_prompt + clean output 関数のみ提供。
"""
from __future__ import annotations

import re

from yesman_api.domain.decision.models import (
    ConsensusOutput,
    PersonaUtterance,
)
from yesman_api.domain.persistence.models import Persona


# ============================================================
# spec 2026-05-21 parallel-persona-consensus: prompt templates
# ============================================================

PERSONA_PROMPT_TEMPLATE = """\
あなたは「{persona_name}」というペルソナです。

{persona_description}

ペルソナ指示:
{persona_prompt_text}

以下のユーザからの相談に対し、あなたの視点・性格を強く反映した
発言を **200 字以内** で 1 段落で述べてください。
冒頭に「{persona_name}の意見:」のようなラベルは不要、本文のみ出力してください。

**発話スタイルのガイドライン** (議論の自由度は保ちつつ、後段の集約を助けるため):
- **具体的な候補を列挙する場合は、1 つだけ挙げる** (NG: 『冷凍うどん＋卵＋冷凍野菜』
  → OK: 『冷凍うどんが手早くて良い』).
- 列挙が必要な議論 (リスク 2 つ / 観点 3 つ等) は許可するが、**食材 / 商品 / 経路 / ジャンルの「物」 を
  `+` / `、` / `と` で並べるのは 避ける** (集約しにくくなる).
- **ユーザに 決定を 投げ返す表現** (『〜から 選んで』『〜気軽に〜』) は 控えめに.
"""

PROPOSAL_PROMPT_TEMPLATE = """\
以下の意見を踏まえて、ユーザに対する **やさしい 1 つの助言** を
**30〜60 字 (最大 100 字) / 1 文 / 句点 (。) は 1 つだけ** で出してください.

YesMan の役割は **ユーザの代わりに 1 つに決めてあげる** こと.
ユーザは Yes/No スワイプで気軽に答えるので、以下を **必ず守って** ください:

0. **意見を「踏まえる」 とは、意見の方向性を 1 つに集約すること**.
   意見の中の **具体的な列挙表現 / 候補名 / 食材名 / `+` / `、` 連結はそのまま使わない**.
   YesMan が 1 つに **決める** ことが任務 — 「色々あるよ」 は禁止.
   例: 意見に「冷凍うどん＋卵＋冷凍野菜」「ごはんと味噌汁と漬物」 が出ても、
        proposal は **その中から 1 つに絞る** か **集約した 1 つの完成形** を出す.
1. **肯定的で 寄り添う 提案調** で出す
   (OK: 『〜しよう』『〜が 良いよ』『〜どう?』『〜してみる?』『〜が おすすめ』)
2. **命令形は 禁止**
   (NG: 『〜しろ』『〜するな』『〜せよ』『今すぐ〜』『迷わず〜』『即〜』)
3. **1 つの 具体的な action** に絞る
   (NG: `or` / `/` / `+` / `＋` / `&` / `(または)` / 『〜か〜』 / 『〜と〜』 /
        『〜、〜』 / 『〜および〜』 等での **複数要素の連結 / 列挙は 禁止**.
   例: 『ごはん＋目玉焼きにして 冷蔵庫の野菜を添えよう』 はダメ
       → 『ごはんに 目玉焼きを のせよう』 のように 1 つの完成形 action にまとめる)
4. **ユーザに 決定を 投げ返す表現は 禁止** ← yesman の本旨と矛盾するため最重要
   (NG: 『〜決めてみよう』『〜気軽に〜』『〜選んでみる?』『〜書き出して』
        『〜から 選ぼう』『〜の どちらかに 寄せて』『〜を 軸に 決めて』)
   → ユーザの代わりに **YesMan が 1 つに決めて** 提示する
5. **根拠 / 期待効果 / 説明の付加は 禁止** (1 文に詰めない)
   (NG: 『〜と 満足度が 上がるよ』『〜が 効率的だよ』『〜したほうが 楽だよ』
        『〜だから 〜』『まずは 〜』『すると 〜』)
   → action 動詞 1 つで完結する 短い文に
6. **action 動詞 + 大まかな対象** で構成
   (OK 例: 『今夜は 温かい一品を 作ろう』『お気に入りの 映画を 1 本 観よう』
          『コンビニで サラダチキンを 買おう』『散歩に 出かけよう』)
7. **冒頭に「最終助言:」「proposal:」 等のラベル は不要**、本文のみ
8. **末尾の決定 signal** (柔軟な drill-down 終了):
   - **これ以上絞り込み不要 と判断** したら、末尾を以下のいずれかで締めると **早期 final** 化:
     · 『〜開きますか?』 (外部サイトで購入/視聴できる場合)
     · 『〜決めますか?』『〜決まりますか?』 (自宅完結の場合)
     · 『これで決まり!』『これで決定!』『これに決めよう』 (断定の場合)
   - **まだ絞り込み余地ある** なら、末尾を『〜にしよう』『〜が おすすめ』『〜どう?』 で締める
     (中間段 — drill-down 継続)
   - 5 段強制ではなく、LLM が「もう決定 OK」 と思ったら **2〜3 段でも final 化可能**.

意見:
{utterance_block}
"""

_PERSONA_LABEL_RE = re.compile(r"^[^:：\n]+の意見[：:]\s*", re.MULTILINE)
_PROPOSAL_LABEL_RE = re.compile(r"^(最終助言|proposal)[：:]\s*", re.IGNORECASE)


class ConsensusOrchestrator:
    @staticmethod
    def _escape_persona_name(name: str) -> str:
        """ultrathink Imp1 反映: Custom Persona 名に `"` を含む場合の XML 属性 escape."""
        return name.replace('"', "&quot;")

    def build_persona_prompt(self, persona: Persona) -> str:
        """spec 2026-05-21 §5.1: persona 単発の system prompt を組み立てる."""
        name = self._escape_persona_name(persona.name)
        return PERSONA_PROMPT_TEMPLATE.format(
            persona_name=name,
            persona_description=persona.description or "",
            persona_prompt_text=persona.prompt_text or "",
        )

    def build_proposal_prompt(self, utterances: list[tuple[Persona, str]]) -> str:
        """spec 2026-05-21 §5.2: 全 persona 発言を踏まえた proposal の system prompt."""
        if not utterances:
            utterance_block = "(意見なし)"
        else:
            utterance_block = "\n".join(
                f"- {p.name}: {text}" for p, text in utterances
            )
        return PROPOSAL_PROMPT_TEMPLATE.format(utterance_block=utterance_block)


def clean_utterance_output(text: str) -> str:
    """LLM 応答から persona label prefix を除去 + strip + 200 字制限."""
    cleaned = _PERSONA_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 200)


def clean_proposal_output(text: str) -> str:
    """LLM 応答から proposal label prefix を除去 + strip + 100 字制限."""
    cleaned = _PROPOSAL_LABEL_RE.sub("", text, count=1).strip()
    return _truncate(cleaned, 100)


def _truncate(text: str, max_chars: int) -> str:
    """Unicode code point 数で max_chars 以内に truncate."""
    if len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"


__all__ = [
    "PERSONA_PROMPT_TEMPLATE",
    "PROPOSAL_PROMPT_TEMPLATE",
    "ConsensusOrchestrator",
    "clean_utterance_output",
    "clean_proposal_output",
]
