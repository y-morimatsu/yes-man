# 新規ユーザーにビルトイン 3 ペルソナをデフォルト選択させる

- **ADR ID**: `019e7363-71d1-720b-aae2-b2cfb5e5da96` (UUID v7)
- **slug**: `default-builtin-persona-selection`
- **日付**: 2026-05-28
- **ステータス**: Accepted
- **関連コミット**: `de82d6f`
- **これが置き換える ADR (Supersedes)**: [嗜好プロファイルから推奨ペルソナを自動選択する](ADR-019e7363-1fc9-7ab4-8ce0-9126fc8e4bfc-dynamic-persona-routing.md)
- **関連 ADR**: [匿名共有ペルソナプール (知り合い) を導入する](ADR-019e7363-42f1-7224-b5f7-7739cb392aa5-anonymous-persona-pool.md)

## コンテキスト

自動ルーティングは制御感に欠け、未選択だと合議が始められない。初回からすぐ合議できる既定が要る。

## 決定

新規ユーザーは慎重派/楽観派/効率派のビルトイン 3 ペルソナをデフォルト選択とし、ユーザーは知り合い/カスタムを含めて手動で unified 選択 (最大 3) できる。固定 ID をフロント/バックで共有する。

## 結果 (トレードオフ)

- 初回から合議でき、かつ「誰に決めてもらうか」を自分で選べる。
- Dynamic Persona Routing を置き換えた。
- 選択状態は localStorage (`yesman:unified-selection-v1`) で永続化する。
