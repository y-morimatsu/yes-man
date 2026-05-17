"""MockLLMProvider — CI / 自動テスト / オフライン開発用 (FR-AUTH-06 相当).

NFR Design §2.3 + ultrathink I4 反映:
- stream_delay_seconds 可変 (default 0.0)、テスト時の無駄な待ち時間を回避
- chunk_size 可変 (default 10)、ストリーミングの粒度を調整可能
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator


class MockLLMProvider:
    provider_name = "mock"

    DEFAULT_OUTPUT = """\
<domain>daily</domain>
<utterance persona="慎重派">慎重派の意見: もう少し情報を集めてから決めるべきです。</utterance>
<utterance persona="楽観派">楽観派の意見: その選択肢は前向きで良いと思います。</utterance>
<utterance persona="効率派">効率派の意見: 短時間で完了する案を選ぶのが効率的です。</utterance>
<proposal>その選択肢で進めてください。</proposal>
"""

    SILENCE_OUTPUT = (
        "<domain>silenced</domain>"
        "<proposal>本件についてはお答えできません。</proposal>"
    )

    def __init__(
        self,
        *,
        override: str | None = None,
        stream_delay_seconds: float = 0.0,
        chunk_size: int = 10,
    ) -> None:
        self._override = override
        self._stream_delay = stream_delay_seconds
        self._chunk_size = chunk_size

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> str:
        return self._override or self.DEFAULT_OUTPUT

    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        output = self._override or self.DEFAULT_OUTPUT
        for i in range(0, len(output), self._chunk_size):
            yield output[i : i + self._chunk_size]
            if self._stream_delay > 0:
                await asyncio.sleep(self._stream_delay)

    async def aclose(self) -> None:
        return None


__all__ = ["MockLLMProvider"]
