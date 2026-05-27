"""SilenceGuard — 沈黙演出ドメインの判定 (FR-DM-SILENT, FR-AI-06).

NFR Design §3 + ultrathink I1 (fail-closed) + Imp3 (LLM prompt 改善) 反映:
- 2 段判定: 正規表現 fast path + LLM 自己判定
- LLM 失敗時は **fail-closed** (= is_silenced=True で安全側)、倫理/法的リスク回避優先
- prod 時のみ Bedrock Guardrails で更に二重化 (LLMProviderAdapter 内で適用)
- user_input 本文は保存しない (SilenceLog は hash のみ、NFR-PRIV-04)
"""
from __future__ import annotations

import hashlib
import re

from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.domain.decision.errors import DecisionError
from yesman_api.domain.decision.models import SilenceDomain, SilenceVerdict


SILENCE_KEYWORDS: dict[SilenceDomain, list[str]] = {
    "religion": [
        "神", "仏", "宗教", "宗派", "信仰", "祈り", "教会", "寺院", "イスラム",
        "キリスト", "仏教", "ヒンドゥー", "ユダヤ", "改宗", "信者",
    ],
    "election": [
        "投票", "選挙", "政党", "自民", "立憲", "公明", "共産", "維新", "国民民主",
        "比例", "候補者", "立候補", "公認", "総裁",
    ],
    "violence": [
        "殺害", "殺す", "殺し", "暴力", "刺す", "刺せ", "撲殺", "ナイフ", "拳銃", "テロ",
        "爆発", "復讐", "報復", "傷つけ", "殴る", "蹴る", "暴行",
    ],
    "obscene": [
        "セックス", "性行為", "アダルト", "ポルノ", "猥褻", "ハレンチ", "下半身",
        "性器", "陰部", "AV",
    ],
}


_FIXED_SILENCE_RESPONSE = (
    "この内容については AI が判断を代行できません。ご自身でじっくり考えていただけたらと思います。"
)


class SilenceGuard:
    def __init__(
        self,
        *,
        llm: LLMProviderAdapter,
        salt: str,
        llm_enabled: bool = True,
    ) -> None:
        self._llm = llm
        self._salt = salt
        # 2026-05-27: Bedrock RPM quota が低い env では LLM 判定を skip して
        # regex fast-path のみで運用. paraphrased 入力は素通りするが、ハッカソン
        # dev 用途では許容. AppConfig.silence_guard_llm_enabled で制御.
        self._llm_enabled = llm_enabled
        self._regex_map: dict[SilenceDomain, re.Pattern[str]] = {
            domain: re.compile("|".join(re.escape(k) for k in keywords))
            for domain, keywords in SILENCE_KEYWORDS.items()
        }

    def _match_regex_domain(self, user_input: str) -> SilenceVerdict | None:
        """regex fast-path 共通実装 (U6 Code Gen Plan ultrathink I1 DRY refactor).

        evaluate / evaluate_regex_only の両方から呼ぶ。マッチなしは None.
        """
        for domain, pattern in self._regex_map.items():
            if pattern.search(user_input):
                return SilenceVerdict(
                    is_silenced=True,
                    domain=domain,
                    response_text=_FIXED_SILENCE_RESPONSE,
                )
        return None

    async def evaluate(self, *, user_input: str) -> SilenceVerdict:
        # 1 段目: 正規表現 fast path (共通 helper、U6 I1)
        verdict = self._match_regex_domain(user_input)
        if verdict is not None:
            return verdict
        # 2 段目: LLM 自己判定 (env disabled なら skip)
        if not self._llm_enabled:
            return SilenceVerdict(is_silenced=False, domain=None, response_text=None)
        return await self._llm_judge(user_input)

    def evaluate_regex_only(self, *, user_input: str) -> SilenceVerdict:
        """regex fast-path のみ (LLM stage skip)、同期メソッド.

        U6 voice TTS path 等、レイテンシ予算 < 1.5s で LLM 呼び出し (300ms-2s) を避けたい用途.
        トレードオフ: paraphrased/obfuscated 入力 (例: 「神 様」スペース埋め) は素通り.
        TTS 音声化での攻撃インパクトは user 自身の発話と同等のため許容 (U6 NFR Design §4.3.3).
        """
        verdict = self._match_regex_domain(user_input)
        if verdict is not None:
            return verdict
        return SilenceVerdict(is_silenced=False, domain=None, response_text=None)

    async def _llm_judge(self, user_input: str) -> SilenceVerdict:
        """LLM に短いプロンプトでドメイン判定させる.

        ultrathink Imp3 反映: prompt を「該当する場合はドメイン名 1 つのみ、
        該当しない場合は `none`」と明確化、temperature=0 + 短い出力期待.
        """
        system = (
            "あなたは入力分類器です。ユーザー入力が以下のいずれかのドメインに該当するか判定してください: "
            "religion / election / violence / obscene / none。"
            "該当する場合はドメイン名を **1 つのみ** 出力、該当しない場合は `none` のみ出力 (他の単語は出さない)。"
        )
        try:
            output = await self._llm.complete(
                system=system,
                messages=[{"role": "user", "content": user_input}],
                temperature=0.0,
            )
        except DecisionError:
            # ultrathink I1 反映: LLM 失敗時は fail-closed (安全側 = 沈黙)
            return SilenceVerdict(
                is_silenced=True,
                domain=None,
                response_text=_FIXED_SILENCE_RESPONSE,
            )
        normalized = output.lower().strip()
        for domain in ("religion", "election", "violence", "obscene"):
            if domain in normalized:
                return SilenceVerdict(
                    is_silenced=True,
                    domain=domain,  # type: ignore[arg-type]
                    response_text=_FIXED_SILENCE_RESPONSE,
                )
        return SilenceVerdict(is_silenced=False, domain=None, response_text=None)

    def compute_input_hash(self, *, user_id: str, user_input: str) -> str:
        """SilenceLog.user_input_hash 用の sha256.

        本文は保存しない (NFR-PRIV-04)、salt + user_id + input で逆探不可.
        """
        data = (self._salt + user_id + user_input).encode("utf-8")
        return hashlib.sha256(data).hexdigest()


__all__ = ["SilenceGuard", "SILENCE_KEYWORDS"]
