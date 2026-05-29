# drill-down 最終段で Yes 確定時に外部サービスを自動で開く

- **ADR ID**: `019e7363-4ac1-7829-99da-d272406fe9d0` (UUID v7)
- **slug**: `drilldown-auto-open-confirm`
- **日付**: 2026-05-26
- **ステータス**: Accepted
- **関連コミット**: `a9d6331`, `7c127fd`
- **関連 ADR**: [Yes 連鎖で深掘りする drill-down と外部サービス CTA を導入する](ADR-019e7363-3b21-7e11-9d90-a1c97bdd4639-drilldown-decision-chain.md), [service_catalog を Amazon 優先 + デモ 10 シナリオ着地保証にする](ADR-019e7363-4ea9-7096-bb18-8e0c4317719d-service-catalog-amazon-first.md)

## コンテキスト

最終段で「Amazon で開きますか?」に Yes したら、そのまま外部サービスへ遷移して実行まで運びたい。だがブラウザの popup blocker が障壁になる。

## 決定

drill-down 最終段の Yes で外部サービスを自動 open する。確定前に confirm phase を挟み、iOS Safari の popup blocker を避けるため `window.open` を click ハンドラ最初に呼ぶ。

## 結果 (トレードオフ)

- 相談→実行 (購入/視聴) の動線が途切れず完結する。
- popup blocker 回避のため同期的な open 呼び出しが必須になった。
- case A (外部購入) / case B (自宅完結) で最終 signal の文言を分けた。
