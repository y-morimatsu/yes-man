# MockStore を S3 pickle で永続化し Lambda マルチインスタンス分断を解消する

- **ADR ID**: `019e7363-6de9-776b-a21d-3e1620fc03c5` (UUID v7)
- **slug**: `mockstore-s3-persistence`
- **日付**: 2026-05-28
- **ステータス**: Accepted
- **関連コミット**: `12651de`, `35af9bd`, `81c8563`
- **関連 ADR**: [FastAPI を Lambda Web Adapter (container image) + Function URL で Lambda 化する](ADR-019e7363-5a61-7a96-9cd9-5d4d80e7d451-fastapi-lambda-web-adapter.md), [外部依存を環境変数で切り替える Strategy + DI を設計の中核にする](ADR-019e7362-f0e9-75db-b6cf-4eee6656dcc1-strategy-di-env-backend-switching.md)

## コンテキスト

Aurora を立てない MVP では状態を MockStore (in-memory) に持つが、Lambda は複数インスタンスに分かれるためインスタンス間で状態が分断される。同時実行 1 固定は試したが不適切だった。

## 決定

MockStore をリクエスト開始で S3 から pickle ロード、終了で保存する。保存は load + merge + put の last-write-wins にして並行 write の取りこぼしを防ぐ。決定は即時 S3 永続化する。

## 結果 (トレードオフ)

- Lambda マルチインスタンスでも状態の一貫性を確保できた。
- DB なしでデモの履歴・スコアを維持できる。
- 強整合ではなく last-write-wins のため厳密な同時更新には不向き (MVP では許容)。
