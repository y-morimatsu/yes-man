# フロントを React + Vite + TanStack Query + useReducer で構成する

- **ADR ID**: `019e7363-0859-753b-a901-09cd0baabf0a` (UUID v7)
- **slug**: `frontend-react-reducer-stack`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`, `de7e889`
- **関連 ADR**: [api-client を依存ゼロの純 fetch ラッパーにする](ADR-019e7363-0c41-7ce7-8705-671b7ca9ec25-api-client-pure-fetch.md)

## コンテキスト

グローバルストアを持ち込まずに、サーバ状態と画面内の一時状態を素直に扱いたい。合議画面は複雑な状態遷移を持つ。

## 決定

サーバ由来データは TanStack Query (キャッシュ + 再取得)、画面内の一時状態は `useReducer` / `useState` とし、Redux 等のグローバルストアは持たない。合議画面は discriminated union の reducer で state machine 化する。

## 結果 (トレードオフ)

- 状態の責務が明確になり、合議のリアルタイム表示・drill-down・先読みを reducer の action として拡張できた。
- reducer の property-based test で不変条件を担保できる。
- 複数機能をまたぐ状態共有は Context / Query に寄せる必要がある。
