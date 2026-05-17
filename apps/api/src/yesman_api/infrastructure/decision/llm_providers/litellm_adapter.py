"""LiteLLMAdapter — OpenAI 互換 proxy (opencode.ai/zen 等) を LiteLLM 経由で呼ぶ.

NFR Design §2.2 BedrockLLMAdapter と同じ I/F (complete + stream + aclose).
Bedrock 専用ではなく汎用 OpenAI-compat endpoint 用、`api_base + api_key + model`
3 つの env を pydantic-settings で受け取り、LiteLLM の `openai/<model>` プレフィックスで呼ぶ.

設定例:
    LITELLM_BASE_URL=https://opencode.ai/zen/go/v1
    LITELLM_API_KEY=sk-...
    LITELLM_MODEL=kimi-k2.6
    LLM_PROVIDER=litellm

ultrathink: asyncio.timeout で I/O キャンセル保証 (bedrock_adapter と同設計).
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

try:
    import litellm  # type: ignore[import-untyped]
    from litellm import exceptions as litellm_exceptions  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    litellm = None  # type: ignore[assignment]
    litellm_exceptions = None  # type: ignore[assignment]

from yesman_api.domain.decision.errors import DecisionError
from yesman_api.infrastructure.config import AppConfig


class LiteLLMAdapter:
    provider_name = "litellm"

    def __init__(self, config: AppConfig) -> None:
        if litellm is None:
            raise RuntimeError("litellm is not installed. Add to pyproject.toml")
        if not config.litellm_base_url:
            raise RuntimeError(
                "LITELLM_BASE_URL is required when LLM_PROVIDER=litellm"
            )
        if not config.litellm_api_key:
            raise RuntimeError(
                "LITELLM_API_KEY is required when LLM_PROVIDER=litellm"
            )
        self._cfg = config

    @property
    def _model(self) -> str:
        # LiteLLM の OpenAI 互換 proxy 経路は `openai/<model>` で指定する
        return f"openai/{self._cfg.litellm_model}"

    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> str:
        timeout_seconds = self._cfg.decision_llm_timeout_seconds
        for attempt in range(self._cfg.decision_llm_retry_count + 1):
            try:
                async with asyncio.timeout(timeout_seconds):
                    resp = await litellm.acompletion(
                        model=self._model,
                        messages=[{"role": "system", "content": system}] + messages,
                        temperature=temperature,
                        timeout=timeout_seconds,
                        api_base=self._cfg.litellm_base_url,
                        api_key=self._cfg.litellm_api_key,
                    )
                return resp["choices"][0]["message"]["content"]
            except (litellm_exceptions.Timeout, asyncio.TimeoutError) as exc:
                if attempt == self._cfg.decision_llm_retry_count:
                    raise DecisionError("llm_timeout", detail=str(exc)) from exc
                await asyncio.sleep(0.2)
            except (
                litellm_exceptions.APIError,
                litellm_exceptions.APIConnectionError,
            ) as exc:
                raise DecisionError("llm_unavailable", detail=str(exc)) from exc
        raise RuntimeError("unreachable")

    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        total_timeout = self._cfg.decision_llm_stream_total_timeout_seconds
        try:
            async with asyncio.timeout(total_timeout):
                try:
                    stream = await litellm.acompletion(
                        model=self._model,
                        messages=[{"role": "system", "content": system}] + messages,
                        temperature=temperature,
                        stream=True,
                        timeout=total_timeout,
                        api_base=self._cfg.litellm_base_url,
                        api_key=self._cfg.litellm_api_key,
                    )
                except (
                    litellm_exceptions.APIError,
                    litellm_exceptions.APIConnectionError,
                ) as exc:
                    raise DecisionError("llm_unavailable", detail=str(exc)) from exc

                async for chunk in stream:
                    delta = (chunk["choices"][0].get("delta") or {}).get("content", "")
                    if delta:
                        yield delta
        except asyncio.TimeoutError as exc:
            raise DecisionError(
                "llm_timeout", detail=f"stream total timeout {total_timeout}s"
            ) from exc

    async def aclose(self) -> None:
        # LiteLLM は内部 httpx をリサイクル、明示 close 不要
        pass


__all__ = ["LiteLLMAdapter"]
