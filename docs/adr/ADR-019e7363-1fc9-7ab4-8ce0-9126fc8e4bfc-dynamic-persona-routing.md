# 嗜好プロファイルから推奨ペルソナを自動選択する

- **ADR ID**: `019e7363-1fc9-7ab4-8ce0-9126fc8e4bfc` (UUID v7)
- **slug**: `dynamic-persona-routing`
- **日付**: 2026-05-19
- **ステータス**: Superseded
- **関連コミット**: `07c1c78`
- **これを置き換えた ADR (Superseded by)**: [新規ユーザーにビルトイン 3 ペルソナをデフォルト選択させる](ADR-019e7363-71d1-720b-aae2-b2cfb5e5da96-default-builtin-persona-selection.md), [匿名共有ペルソナプール (知り合い) を導入する](ADR-019e7363-42f1-7224-b5f7-7739cb392aa5-anonymous-persona-pool.md)

## コンテキスト

毎回ペルソナを選ばせるのは手間。嗜好プロファイルから合議に使う persona を自動で決められないか。

## 決定

嗜好プロファイルに基づき推奨 persona を自動選択する Dynamic Persona Routing を導入する (Issue #4)。

## 結果 (トレードオフ)

- 選択の手間を省けた一方、ユーザーが「誰に決めてもらうか」をコントロールしづらかった。
- 後にビルトイン 3 ペルソナのデフォルト選択 + 知り合い/カスタムの手動 unified 選択へ移行した。
