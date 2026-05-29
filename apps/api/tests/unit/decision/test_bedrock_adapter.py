"""Unit tests for BedrockLLMAdapter (infrastructure/decision/llm_providers/bedrock_adapter.py).

litellm.acompletion を monkeypatch して AWS Bedrock を呼ばずに complete / stream /
rate-limit retry / timeout / API error / guardrail kwargs を網羅する。
"""
from __future__ import annotations

import asyncio

import litellm
import pytest
from litellm import exceptions as litellm_exceptions

from yesman_api.domain.decision.errors import DecisionError
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.llm_providers.bedrock_adapter import (
    BedrockLLMAdapter,
)


def _cfg(**overrides) -> AppConfig:  # noqa: ANN003
    base = dict(
        llm_provider="bedrock",
        bedrock_region="ap-northeast-1",
        bedrock_model_id="google.gemma-3-12b-it",
        decision_llm_retry_count=0,
        decision_llm_timeout_seconds=5.0,
        decision_llm_stream_total_timeout_seconds=5.0,
    )
    base.update(overrides)
    return AppConfig(**base)


def _ok_response(content: str = "今夜は鍋にしよう。") -> dict:
    return {"choices": [{"message": {"content": content}}]}


class _AsyncChunks:
    def __init__(self, chunks: list[dict]) -> None:
        self._chunks = list(chunks)

    def __aiter__(self) -> "_AsyncChunks":
        return self

    async def __anext__(self) -> dict:
        if not self._chunks:
            raise StopAsyncIteration
        return self._chunks.pop(0)


def _seq(*responses):  # noqa: ANN002
    """呼び出しごとに responses を順に返す/raise する fake acompletion。"""
    it = iter(responses)

    async def _fake(*args, **kwargs):  # noqa: ANN002, ANN003
        r = next(it)
        if isinstance(r, BaseException):
            raise r
        return r

    return _fake


# ============================================================
# complete
# ============================================================
async def test_complete_success(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(litellm, "acompletion", _seq(_ok_response("提案A")))
    adapter = BedrockLLMAdapter(_cfg())
    out = await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert out == "提案A"


async def test_complete_rate_limit_then_success(monkeypatch) -> None:  # noqa: ANN001
    # backoff sleep を no-op 化して高速に
    async def _noop(_s: float) -> None:
        return None

    monkeypatch.setattr(asyncio, "sleep", _noop)
    rate_err = litellm_exceptions.RateLimitError(
        message="429", llm_provider="bedrock", model="m"
    )
    monkeypatch.setattr(litellm, "acompletion", _seq(rate_err, _ok_response("retry-ok")))
    adapter = BedrockLLMAdapter(_cfg())
    out = await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert out == "retry-ok"


async def test_complete_timeout(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(litellm, "acompletion", _seq(asyncio.TimeoutError()))
    adapter = BedrockLLMAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_timeout"


async def test_complete_api_connection_error(monkeypatch) -> None:  # noqa: ANN001
    err = litellm_exceptions.APIConnectionError(
        message="conn", llm_provider="bedrock", model="m"
    )
    monkeypatch.setattr(litellm, "acompletion", _seq(err))
    adapter = BedrockLLMAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_unavailable"


# ============================================================
# stream
# ============================================================
async def test_stream_success(monkeypatch) -> None:  # noqa: ANN001
    chunks = [
        {"choices": [{"delta": {"content": "今夜は"}}]},
        {"choices": [{"delta": {"content": "鍋"}}]},
        {"choices": [{"delta": {}}]},  # 空 delta は skip
    ]

    async def _fake(*args, **kwargs):  # noqa: ANN002, ANN003
        return _AsyncChunks(chunks)

    monkeypatch.setattr(litellm, "acompletion", _fake)
    adapter = BedrockLLMAdapter(_cfg())
    got = [c async for c in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}])]
    assert "".join(got) == "今夜は鍋"


async def test_stream_api_error(monkeypatch) -> None:  # noqa: ANN001
    err = litellm_exceptions.APIConnectionError(
        message="conn", llm_provider="bedrock", model="m"
    )
    monkeypatch.setattr(litellm, "acompletion", _seq(err))
    adapter = BedrockLLMAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        async for _ in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}]):
            pass
    assert ei.value.reason == "llm_unavailable"


# ============================================================
# guardrail kwargs / aclose
# ============================================================
def test_guardrail_kwargs_dev_returns_empty() -> None:
    adapter = BedrockLLMAdapter(_cfg(app_env="dev"))
    assert adapter._guardrail_kwargs() == {}


def test_guardrail_kwargs_prod_returns_config() -> None:
    adapter = BedrockLLMAdapter(
        _cfg(app_env="prod", bedrock_guardrail_id="gr-1", bedrock_guardrail_version="2")
    )
    kw = adapter._guardrail_kwargs()
    gc = kw["extra_body"]["guardrailConfig"]
    assert gc["guardrailIdentifier"] == "gr-1"
    assert gc["guardrailVersion"] == "2"


async def test_aclose_noop() -> None:
    adapter = BedrockLLMAdapter(_cfg())
    assert await adapter.aclose() is None
