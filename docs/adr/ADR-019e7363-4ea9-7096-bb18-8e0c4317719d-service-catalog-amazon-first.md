# service_catalog を Amazon 優先 + デモ 10 シナリオ着地保証にする

- **ADR ID**: `019e7363-4ea9-7096-bb18-8e0c4317719d` (UUID v7)
- **slug**: `service-catalog-amazon-first`
- **日付**: 2026-05-26
- **ステータス**: Accepted
- **関連コミット**: `b6117ad`, `13af21a`
- **関連 ADR**: [Yes 連鎖で深掘りする drill-down と外部サービス CTA を導入する](ADR-019e7363-3b21-7e11-9d90-a1c97bdd4639-drilldown-decision-chain.md)

## コンテキスト

ハッカソンが Amazon (AWS) のイベントであり、drill-down 最終段の CTA は各カテゴリで Amazon 系を第一候補にしたい。デモの 10 シナリオは必ず着地させたい。

## 決定

各カテゴリ (movie/shopping/fashion/music/books/games 等) の既定サービスを Amazon 系 (Prime Video / Amazon / Kindle / Audible 等) に統一し、`pick_service` を 完全名一致 → ブランド部分一致 → カテゴリ既定 の優先順で解決する。デモ 10 シナリオが必ず着地するよう catalog を拡張する。

## 結果 (トレードオフ)

- イベント文脈に沿い、かつ提案が必ず実在サービスに着地する。
- カテゴリ判定の順序 (audio_books > books, food_delivery > food_restaurant) を調整した。
- Amazon 以外が自然な領域 (旅行=じゃらん等) は例外として残した。
