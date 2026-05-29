# pnpm workspace による monorepo 構成にする

- **ADR ID**: `019e7362-e919-713a-ab52-c652cb582cfc` (UUID v7)
- **slug**: `monorepo-pnpm-workspace`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`
- **関連 ADR**: [api-client を依存ゼロの純 fetch ラッパーにする](ADR-019e7363-0c41-7ce7-8705-671b7ca9ec25-api-client-pure-fetch.md)

## コンテキスト

フロント・バック・共通 UI・API クライアント・IaC を 1 リポジトリで一貫管理し、型とスキーマを共有したい。

## 決定

`apps/web` `apps/api` `packages/ui` `packages/api-client` `infra` を pnpm workspace で束ねる monorepo にする。OpenAPI スキーマからフロントの型を自動生成する。

## 結果 (トレードオフ)

- 型・スキーマがパッケージ境界を越えて共有でき、契約の不整合を早期検出できる。
- CI ではワークスペースを依存順 (ui → api-client → web) にビルドする必要がある。
- 1 つの PR で複数パッケージを横断する変更が起きやすい。
