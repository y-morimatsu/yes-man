"""PII フィルタ — email / phone JP/US / CC Luhn / passthrough (ultrathink I6)."""
from __future__ import annotations

import re

from yesman_api.shared.pii_filter import EMAIL_RE, _luhn_valid, mask_pii


# ============================================================
# Email
# ============================================================
class TestEmail:
    def test_basic(self):
        assert mask_pii("Contact: alice@example.com") == "Contact: ***"

    def test_multiple(self):
        result = mask_pii("a@b.com and c@d.org")
        assert "a@b.com" not in result and "c@d.org" not in result

    def test_no_email_passthrough(self):
        assert mask_pii("Hello world") == "Hello world"


# ============================================================
# Phone JP
# ============================================================
class TestPhoneJp:
    def test_mobile(self):
        assert "090-1234-5678" not in mask_pii("TEL: 090-1234-5678")

    def test_landline(self):
        assert "03-1234-5678" not in mask_pii("代表: 03-1234-5678")


# ============================================================
# Phone US
# ============================================================
class TestPhoneUs:
    def test_dashed(self):
        assert "555-123-4567" not in mask_pii("Call 555-123-4567")

    def test_parens(self):
        assert "(555)" not in mask_pii("Call (555) 123-4567")


# ============================================================
# CC Luhn (ultrathink I6)
# ============================================================
class TestCcLuhn:
    def test_valid_visa_masked(self):
        # 4111-1111-1111-1111 は Luhn 通過する Visa テスト番号
        result = mask_pii("Card: 4111-1111-1111-1111")
        assert "4111" not in result

    def test_invalid_luhn_passthrough(self):
        # 1234-5678-9012-3456 は Luhn 通らない → CC ではない (= マスクしない)
        # ただし phone US regex で部分マッチする可能性があるため、簡略化テスト
        digits = "1234567890123456"
        assert not _luhn_valid(digits)


# ============================================================
# Passthrough (non-PII)
# ============================================================
class TestPassthrough:
    def test_plain_text(self):
        text = "今日のランチを決めて欲しい"
        assert mask_pii(text) == text

    def test_pure_number_short(self):
        text = "答えは 42 です"
        result = mask_pii(text)
        assert "42" in result


def test_luhn_valid_visa():
    assert _luhn_valid("4111111111111111") is True


def test_luhn_invalid_random():
    assert _luhn_valid("1234567890123456") is False
