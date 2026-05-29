# バックエンドを DDD + ヘキサゴナル (Ports & Adapters) で構成する

- **ADR ID**: `019e7362-ed01-7690-b2e1-14d72d767f76` (UUID v7)
- **slug**: `backend-ddd-hexagonal`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`, `de7e889`
- **関連 ADR**: [外部依存を環境変数で切り替える Strategy + DI を設計の中核にする](ADR-019e7362-f0e9-75db-b6cf-4eee6656dcc1-strategy-di-env-backend-switching.md)

## コンテキスト

LLM・DB・認証・音声・イベントなど外部依存が多く、テスト容易性と差し替え可能性を両立する必要があった。

## 決定

`domain / application / infrastructure / interface` の 4 レイヤに分け、依存方向を常に外→内にする。domain は外部ライブラリ非依存とし、外部依存はすべて application 層の Protocol (Port) で抽象化する。

## 結果 (トレードオフ)

- domain を純粋に保てるためユニットテストが高速・決定論的になる。
- Adapter を差し替えるだけで本番/ローカル/テストを同一コードで動かせる。
- レイヤ間のボイラープレート (factory / deps) が増える。
