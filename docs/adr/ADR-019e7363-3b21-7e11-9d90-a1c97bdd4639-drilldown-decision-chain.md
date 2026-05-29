# Yes 連鎖で深掘りする drill-down と外部サービス CTA を導入する

- **ADR ID**: `019e7363-3b21-7e11-9d90-a1c97bdd4639` (UUID v7)
- **slug**: `drilldown-decision-chain`
- **日付**: 2026-05-23
- **ステータス**: Accepted
- **関連コミット**: `d81cb00`
- **関連 ADR**: [service_catalog を Amazon 優先 + デモ 10 シナリオ着地保証にする](ADR-019e7363-4ea9-7096-bb18-8e0c4317719d-service-catalog-amazon-first.md), [drill-down 最終段で Yes 確定時に外部サービスを自動で開く](ADR-019e7363-4ac1-7829-99da-d272406fe9d0-drilldown-auto-open-confirm.md)

## コンテキスト

「映画を観よう」のような大まかな提案だけでは行動に移しにくい。段階的に具体化して最後は実行 (購入/視聴) まで導きたい。

## 決定

`MAX_DRILL_DEPTH=4` で、深掘りのたびに前段提案を `chain_context` に積み、方向性→媒体→ジャンル→固有名と絞り込む。最終段で外部サービス (Amazon 等) の CTA を提案に同梱する。

## 結果 (トレードオフ)

- 相談から実行までを 1 つの連鎖で完結させられる。
- depth 別にプロンプトの絞り込み指示を変える必要が生じた ([consensus-prompt-strict])。
- 外部サービスの紐付けに service_catalog が必要になった。
