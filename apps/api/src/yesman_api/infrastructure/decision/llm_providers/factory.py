"""LLMProviderFactory — config.llm_provider に応じて Bedrock / LiteLLM / Claude CLI / Mock を生成."""
from __future__ import annotations

from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


class LLMProviderFactory:
    def __init__(self, config: AppConfig) -> None:
        self._cfg = config
        self._adapter: LLMProviderAdapter | None = None

    async def create(self) -> LLMProviderAdapter:
        if self._adapter is not None:
            return self._adapter
        backend = self._cfg.llm_provider
        if backend == "bedrock":
            # lazy import (litellm は重い、Mock backend では不要)
            from yesman_api.infrastructure.decision.llm_providers.bedrock_adapter import (
                BedrockLLMAdapter,
            )

            self._adapter = BedrockLLMAdapter(self._cfg)
        elif backend == "litellm":
            # OpenAI 互換 proxy (opencode.ai/zen 等) を LiteLLM 経由で呼ぶ
            from yesman_api.infrastructure.decision.llm_providers.litellm_adapter import (
                LiteLLMAdapter,
            )

            self._adapter = LiteLLMAdapter(self._cfg)
        elif backend == "claude-cli":
            # Anthropic 公式 Claude Code CLI (`claude` コマンド) を subprocess 経由で呼ぶ
            from yesman_api.infrastructure.decision.llm_providers.claude_cli_adapter import (
                ClaudeCLIAdapter,
            )

            self._adapter = ClaudeCLIAdapter(self._cfg)
        elif backend == "mock":
            # e2e で LIVE badge / chat-like timing を観測可能にするため、env config で
            # per-persona delay を設定可能にする (default 0.0 = 即時、CI/dev は 0.5 推奨).
            delay = self._cfg.mock_llm_persona_delay_seconds
            persona_delays = (
                {"慎重派": delay, "楽観派": delay, "効率派": delay} if delay > 0 else None
            )
            self._adapter = MockLLMProvider(persona_delays=persona_delays)
        else:
            raise RuntimeError(f"Unknown LLM_PROVIDER: {backend!r}")
        return self._adapter

    async def dispose(self) -> None:
        if self._adapter is not None:
            await self._adapter.aclose()
            self._adapter = None


__all__ = ["LLMProviderFactory"]
