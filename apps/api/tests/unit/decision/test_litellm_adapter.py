"""Unit tests for LiteLLMAdapter (infrastructure/decision/llm_providers/litellm_adapter.py).

litellm.acompletion を monkeypatch して OpenAI 互換 proxy を呼ばずに __init__ ガード /
complete / stream / timeout / API error を網羅する。
"""
from __future__ import annotations

import asyncio

import litellm
import pytest
from litellm import exceptions as litellm_exceptions

from yesman_api.domain.decision.errors import DecisionError
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.llm_providers.litellm_adapter import LiteLLMAdapter


def _cfg(**overrides) -> AppConfig:  # noqa: ANN003
    base = dict(
        llm_provider="litellm",
        litellm_base_url="http://localhost:4000",
        litellm_api_key="sk-dummy",
        litellm_model="kimi",
        decision_llm_retry_count=0,
        decision_llm_timeout_seconds=5.0,
        decision_llm_stream_total_timeout_seconds=5.0,
    )
    base.update(overrides)
    return AppConfig(**base)


class _AsyncChunks:
    def __init__(self, chunks: list[dict]) -> None:
        self._chunks = list(chunks)

    def __aiter__(self) -> "_AsyncChunks":
        return self

    async def __anext__(self) -> dict:
        if not self._chunks:
            raise StopAsyncIteration
        return self._chunks.pop(0)


def _raises(exc: BaseException):  # noqa: ANN201
    async def _fake(*args, **kwargs):  # noqa: ANN002, ANN003
        raise exc

    return _fake


# ============================================================
# __init__ guards
# ============================================================
def test_init_requires_base_url() -> None:
    with pytest.raises(RuntimeError, match="LITELLM_BASE_URL"):
        LiteLLMAdapter(_cfg(litellm_base_url=""))


def test_init_requires_api_key() -> None:
    with pytest.raises(RuntimeError, match="LITELLM_API_KEY"):
        LiteLLMAdapter(_cfg(litellm_api_key=""))


def test_model_property_prefixes_openai() -> None:
    adapter = LiteLLMAdapter(_cfg(litellm_model="kimi-k2"))
    assert adapter._model == "openai/kimi-k2"


# ============================================================
# complete
# ============================================================
async def test_complete_success(monkeypatch) -> None:  # noqa: ANN001
    async def _fake(*args, **kwargs):  # noqa: ANN002, ANN003
        return {"choices": [{"message": {"content": "OK提案"}}]}

    monkeypatch.setattr(litellm, "acompletion", _fake)
    adapter = LiteLLMAdapter(_cfg())
    out = await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert out == "OK提案"


async def test_complete_timeout(monkeypatch) -> None:  # noqa: ANN001
    monkeypatch.setattr(litellm, "acompletion", _raises(asyncio.TimeoutError()))
    adapter = LiteLLMAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_timeout"


async def test_complete_api_connection_error(monkeypatch) -> None:  # noqa: ANN001
    err = litellm_exceptions.APIConnectionError(message="x", llm_provider="openai", model="m")
    monkeypatch.setattr(litellm, "acompletion", _raises(err))
    adapter = LiteLLMAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_unavailable"


# ============================================================
# stream
# ============================================================
async def test_stream_success(monkeypatch) -> None:  # noqa: ANN001
    chunks = [
        {"choices": [{"delta": {"content": "やって"}}]},
        {"choices": [{"delta": {"content": "みよう"}}]},
    ]

    async def _fake(*args, **kwargs):  # noqa: ANN002, ANN003
        return _AsyncChunks(chunks)

    monkeypatch.setattr(litellm, "acompletion", _fake)
    adapter = LiteLLMAdapter(_cfg())
    got = [c async for c in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}])]
    assert "".join(got) == "やってみよう"


async def test_stream_api_error(monkeypatch) -> None:  # noqa: ANN001
    err = litellm_exceptions.APIConnectionError(message="x", llm_provider="openai", model="m")
    monkeypatch.setattr(litellm, "acompletion", _raises(err))
    adapter = LiteLLMAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        async for _ in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}]):
            pass
    assert ei.value.reason == "llm_unavailable"


async def test_aclose_noop() -> None:
    adapter = LiteLLMAdapter(_cfg())
    assert await adapter.aclose() is None
