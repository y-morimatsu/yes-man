# 外部依存を環境変数で切り替える Strategy + DI を設計の中核にする

- **ADR ID**: `019e7362-f0e9-75db-b6cf-4eee6656dcc1` (UUID v7)
- **slug**: `strategy-di-env-backend-switching`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`, `de7e889`
- **関連 ADR**: [バックエンドを DDD + ヘキサゴナル (Ports & Adapters) で構成する](ADR-019e7362-ed01-7690-b2e1-14d72d767f76-backend-ddd-hexagonal.md), [LLM を LLMProviderAdapter Protocol で抽象化する](ADR-019e7362-f4d1-72dc-b35c-0d303f48aece-llm-provider-protocol.md)

## コンテキスト

ローカル開発を AWS 不要で完結させ、CI を mock で高速に回し、本番を AWS で動かす——これを 1 つのコードベースで実現したい。

## 決定

`LLM_PROVIDER` / `STORAGE_BACKEND` / `AUTH_BACKEND` / `VOICE_BACKEND` / `EVENT_BACKEND` の 5 つの環境変数で Adapter 実装を切り替える。各 `infrastructure/*/factory.py` が起動時に singleton を 1 度だけ生成する。

## 結果 (トレードオフ)

- 差し替え可能性が YesMan の最大の設計特徴になり、デプロイ構成 (MVP/フルスタック) もこの軸で表現できる。
- 新しい依存を足すたびに Protocol + factory + 各 Adapter を実装する規律が要る。
- 環境変数の組合せ爆発を避けるため、検証済みプリセット (実デプロイ構成) を固定した。
