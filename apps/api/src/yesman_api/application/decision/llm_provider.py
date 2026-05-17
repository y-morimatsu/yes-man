"""LLMProviderAdapter Protocol — Strategy 切替対象 (FR-AI-01〜03, NFR-EXT-02).

3 実装 (BedrockLLMAdapter / MockLLMProvider / 将来の Anthropic API 等) が
この Protocol に準拠する。Contract test で `@runtime_checkable` + `isinstance` 検証.
"""
from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable


@runtime_checkable
class LLMProviderAdapter(Protocol):
    """LLM プロバイダーの抽象。non-stream + stream の 2 系統 + dispose."""

    provider_name: str  # "bedrock" / "mock" / "openai" / ...

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> str:
        """非ストリーミング: 完了レスポンスを一括返却 (FR-CV-12 CLI フォールバック)."""
        ...

    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """ストリーミング: chunk (string) を yield (FR-CV-08).

        Note: `if False: yield ""` は Python typing 上 AsyncGenerator として
        認識させるための慣習 (ultrathink Code Gen Plan I3)。Protocol 実装側で
        本物の async generator を返すために必要。
        """
        if False:
            yield ""

    async def aclose(self) -> None:
        """HTTP クライアントや内部リソースの dispose. lifespan shutdown で呼ばれる."""
        ...


__all__ = ["LLMProviderAdapter"]
