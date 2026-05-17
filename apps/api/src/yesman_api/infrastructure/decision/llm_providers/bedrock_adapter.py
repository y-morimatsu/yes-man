"""BedrockLLMAdapter — AWS Bedrock 経由の LLM 呼び出し (LiteLLM 抽象化).

NFR Design §2.2 + ultrathink I2 (Guardrails 引数 3 候補) 反映:
- LiteLLM 1.55+ で `extra_body={"guardrailConfig": ...}` が推奨パターン
- 動作確認時に LiteLLM 最新ドキュメントを確認、必要なら boto3 直接呼び出しに切替
"""
from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator

try:
    import litellm  # type: ignore[import-untyped]
    from litellm import exceptions as litellm_exceptions  # type: ignore[import-untyped]
except ImportError:  # pragma: no cover
    litellm = None  # type: ignore[assignment]
    litellm_exceptions = None  # type: ignore[assignment]

from yesman_api.domain.decision.errors import DecisionError
from yesman_api.infrastructure.config import AppConfig


class BedrockLLMAdapter:
    provider_name = "bedrock"

    def __init__(self, config: AppConfig) -> None:
        if litellm is None:
            raise RuntimeError("litellm is not installed. Add to pyproject.toml")
        self._cfg = config
        # LiteLLM global config (region)
        litellm.aws_region_name = config.bedrock_region

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
                # ultrathink ★★ FU: LiteLLM の timeout kwarg に加え asyncio.timeout で
                # I/O キャンセル保証 (LiteLLM 内部 timeout は HTTP layer のみで pending
                # socket read を強制中断できないケースがある).
                async with asyncio.timeout(timeout_seconds):
                    resp = await litellm.acompletion(
                        model=f"bedrock/{self._cfg.bedrock_model_id}",
                        messages=[{"role": "system", "content": system}] + messages,
                        temperature=temperature,
                        timeout=timeout_seconds,
                        aws_region_name=self._cfg.bedrock_region,
                        **self._guardrail_kwargs(),
                    )
                return resp["choices"][0]["message"]["content"]
            except (litellm_exceptions.Timeout, asyncio.TimeoutError) as exc:
                if attempt == self._cfg.decision_llm_retry_count:
                    raise DecisionError("llm_timeout", detail=str(exc)) from exc
                await asyncio.sleep(0.2)
            except (litellm_exceptions.APIError, litellm_exceptions.APIConnectionError) as exc:
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
            # ultrathink ★★ FU: streaming 全体に asyncio.timeout を被せ、stuck stream を
            # 確実に切断 (LiteLLM の timeout kwarg は接続時のみで chunk 間隔は対象外).
            async with asyncio.timeout(total_timeout):
                try:
                    stream = await litellm.acompletion(
                        model=f"bedrock/{self._cfg.bedrock_model_id}",
                        messages=[{"role": "system", "content": system}] + messages,
                        temperature=temperature,
                        stream=True,
                        timeout=total_timeout,
                        aws_region_name=self._cfg.bedrock_region,
                        **self._guardrail_kwargs(),
                    )
                except (litellm_exceptions.APIError, litellm_exceptions.APIConnectionError) as exc:
                    raise DecisionError("llm_unavailable", detail=str(exc)) from exc

                async for chunk in stream:
                    delta = (chunk["choices"][0].get("delta") or {}).get("content", "")
                    if delta:
                        yield delta
        except asyncio.TimeoutError as exc:
            raise DecisionError("llm_timeout", detail=f"stream total timeout {total_timeout}s") from exc

    def _guardrail_kwargs(self) -> dict[str, Any]:
        """SEC-U4-06/07: prod のみ Guardrail 適用.

        ultrathink I2 反映: LiteLLM 1.55+ で `extra_body={"guardrailConfig": ...}` が推奨.
        動作確認時に LiteLLM ドキュメント確認、必要なら boto3 直接呼び出しに切替.
        """
        if self._cfg.app_env != "prod" or not self._cfg.bedrock_guardrail_id:
            return {}
        return {
            "extra_body": {
                "guardrailConfig": {
                    "guardrailIdentifier": self._cfg.bedrock_guardrail_id,
                    "guardrailVersion": self._cfg.bedrock_guardrail_version,
                },
            },
        }

    async def aclose(self) -> None:
        # LiteLLM は内部で boto3 をリサイクル、明示 close 不要
        pass


__all__ = ["BedrockLLMAdapter"]
