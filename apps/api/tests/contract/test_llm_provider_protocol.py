"""Contract test — LLMProviderAdapter Protocol を 2 backend が実装 (TEST-U4-01)."""
from __future__ import annotations

from yesman_api.application.decision.llm_provider import LLMProviderAdapter
from yesman_api.infrastructure.decision.llm_providers.mock_adapter import MockLLMProvider


def test_mock_implements_protocol():
    assert isinstance(MockLLMProvider(), LLMProviderAdapter)
    assert MockLLMProvider().provider_name == "mock"


def test_bedrock_class_implements_protocol():
    """BedrockLLMAdapter は litellm 依存のため class 名のみ検証 (instantiate しない)."""
    from yesman_api.infrastructure.decision.llm_providers import bedrock_adapter

    assert hasattr(bedrock_adapter.BedrockLLMAdapter, "complete")
    assert hasattr(bedrock_adapter.BedrockLLMAdapter, "stream")
    assert hasattr(bedrock_adapter.BedrockLLMAdapter, "aclose")
    assert bedrock_adapter.BedrockLLMAdapter.provider_name == "bedrock"
