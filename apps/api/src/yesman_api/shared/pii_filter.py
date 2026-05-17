"""PII フィルタ — LLM 送信前に email / 電話番号 / クレジットカード番号をマスク.

NFR Req SEC-U4-01 対応 (NFR-SEC-05 の実装層)。
ultrathink I6 反映: CC は **Luhn 検証付き** で電話番号や住所番地の誤検知を抑制。
"""
from __future__ import annotations

import re

# email (RFC5322 簡略版)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")

# 日本携帯/固定電話 (0X0-XXXX-XXXX / 0X-XXXX-XXXX 等)
PHONE_JP_RE = re.compile(
    r"(?<!\d)(0[5789]0[-\s]?\d{4}[-\s]?\d{4}|0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})(?!\d)"
)

# 米国電話 ((XXX) XXX-XXXX / XXX-XXX-XXXX / XXX.XXX.XXXX 等)
PHONE_US_RE = re.compile(r"\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}")

# クレジットカード候補 (13-19 桁、ハイフン/空白許容)
# Luhn 検証で確定 (生数字列の誤検知を抑制)
CC_CANDIDATE_RE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")


def _luhn_valid(digits_only: str) -> bool:
    """Luhn checksum 検証。CC 番号は通常 Luhn を通すため、
    電話番号 (0312345678901234 等) との区別に使う。
    """
    total, alt = 0, False
    for d in reversed(digits_only):
        if not d.isdigit():
            return False
        n = int(d)
        if alt:
            n *= 2
            if n > 9:
                n -= 9
        total += n
        alt = not alt
    return total % 10 == 0


def _mask_cc(text: str, mask: str) -> str:
    """CC 候補を抽出し、Luhn を通ったもののみマスク (誤検知抑制)."""

    def repl(m: re.Match[str]) -> str:
        raw = m.group(0)
        digits = re.sub(r"[ -]", "", raw)
        return mask if _luhn_valid(digits) else raw

    return CC_CANDIDATE_RE.sub(repl, text)


def mask_pii(text: str, *, mask: str = "***") -> str:
    """Email / 電話番号 / クレジットカード番号をマスクして返す。

    Usage:
        masked = mask_pii(user_input)
        await llm.complete(system=..., messages=[{"role": "user", "content": masked}])
    """
    text = EMAIL_RE.sub(mask, text)
    text = PHONE_JP_RE.sub(mask, text)
    text = PHONE_US_RE.sub(mask, text)
    text = _mask_cc(text, mask)
    return text


__all__ = ["mask_pii"]
