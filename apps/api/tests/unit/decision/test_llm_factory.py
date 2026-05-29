"""Unit tests for LLMProviderFactory (infrastructure/decision/llm_providers/factory.py).

mock backend は実 MockLLMProvider で検証。bedrock/litellm/claude-cli の dispatch は
重い依存・外部呼び出しを避けるため monkeypatch でダミー adapter に差し替えて分岐を網羅。
"""
from __future__ import annotations

import importlib

import pytest

from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.llm_providers.factory import LLMProviderFactory
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


async def test_mock_backend_no_delay() -> None:
    factory = LLMProviderFactory(AppConfig(llm_provider="mock"))
    adapter = await factory.create()
    assert isinstance(adapter, MockLLMProvider)
    # memoize: 2 回目も同一インスタンス
    assert await factory.create() is adapter
    await factory.dispose()
    # dispose 後は再生成
    assert await factory.create() is not adapter
    await factory.dispose()


async def test_mock_backend_with_persona_delay() -> None:
    factory = LLMProviderFactory(
        AppConfig(llm_provider="mock", mock_llm_persona_delay_seconds=0.01)
    )
    adapter = await factory.create()
    assert isinstance(adapter, MockLLMProvider)
    await factory.dispose()


async def test_unknown_backend_raises() -> None:
    factory = LLMProviderFactory(AppConfig(llm_provider="bogus-provider"))
    with pytest.raises(RuntimeError, match="Unknown LLM_PROVIDER"):
        await factory.create()


class _DummyAdapter:
    def __init__(self, *args, **kwargs) -> None:  # noqa: ANN002, ANN003
        self.disposed = False

    async def aclose(self) -> None:
        self.disposed = True


@pytest.mark.parametrize(
    ("backend", "modpath", "clsname"),
    [
        (
            "bedrock",
            "yesman_api.infrastructure.decision.llm_providers.bedrock_adapter",
            "BedrockLLMAdapter",
        ),
        (
            "litellm",
            "yesman_api.infrastructure.decision.llm_providers.litellm_adapter",
            "LiteLLMAdapter",
        ),
        (
            "claude-cli",
            "yesman_api.infrastructure.decision.llm_providers.claude_cli_adapter",
            "ClaudeCLIAdapter",
        ),
    ],
)
async def test_dispatch_branches(monkeypatch, backend, modpath, clsname) -> None:  # noqa: ANN001
    mod = importlib.import_module(modpath)
    monkeypatch.setattr(mod, clsname, _DummyAdapter)
    factory = LLMProviderFactory(AppConfig(llm_provider=backend))
    adapter = await factory.create()
    assert isinstance(adapter, _DummyAdapter)
    await factory.dispose()
    assert adapter.disposed is True
