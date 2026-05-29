# api-client を依存ゼロの純 fetch ラッパーにする

- **ADR ID**: `019e7363-0c41-7ce7-8705-671b7ca9ec25` (UUID v7)
- **slug**: `api-client-pure-fetch`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`
- **関連 ADR**: [pnpm workspace による monorepo 構成にする](ADR-019e7362-e919-713a-ab52-c652cb582cfc-monorepo-pnpm-workspace.md), [フロントを React + Vite + TanStack Query + useReducer で構成する](ADR-019e7363-0859-753b-a901-09cd0baabf0a-frontend-react-reducer-stack.md)

## コンテキスト

API 通信層を軽量に保ち、SSE や認証リトライを 1 箇所に集約したい。バンドルサイズも抑えたい。

## 決定

`packages/api-client` を外部依存なしの純 fetch ラッパー (size-limit 5KB) とし、8 モジュール統合 + `DecisionStream` (ReadableStream → AsyncGenerator) で SSE を扱う。型は openapi-typescript で生成する。

## 結果 (トレードオフ)

- 401 リトライ・ApiError 正規化・SSE パースを 1 箇所で管理できる。
- 依存ゼロのため再利用・差し替えが容易。
- OpenAPI スキーマと手書き型の整合を保つ運用が要る。
