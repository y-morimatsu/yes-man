# LLM を LLMProviderAdapter Protocol で抽象化する

- **ADR ID**: `019e7362-f4d1-72dc-b35c-0d303f48aece` (UUID v7)
- **slug**: `llm-provider-protocol`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`
- **関連 ADR**: [外部依存を環境変数で切り替える Strategy + DI を設計の中核にする](ADR-019e7362-f0e9-75db-b6cf-4eee6656dcc1-strategy-di-env-backend-switching.md), [3 ペルソナの並列合議で提案を生成する合議エンジンにする](ADR-019e7362-f8b9-7b1b-b83e-0f70c71fcf49-three-persona-consensus.md)

## コンテキスト

本番 (Bedrock)、OpenAI 互換 proxy、ローカルの `claude` CLI、テスト用 mock を、合議エンジンから区別なく使いたい。

## 決定

`complete()` / `stream()` / `aclose()` を持つ `LLMProviderAdapter` Protocol を定義し、`bedrock` / `litellm` / `claude-cli` / `mock` の 4 実装を `LLM_PROVIDER` で切り替える。`@runtime_checkable` で契約をテストする。

## 結果 (トレードオフ)

- 合議エンジンは LLM の実体を知らずに済み、mock で決定論的にテストできる。
- 後のデモモードを `DemoLLMAdapter` で既存 adapter をラップする形で実現でき、本物経路に手を入れずに済んだ。
- ストリーミング (SSE) を全 adapter で揃える必要がある。
