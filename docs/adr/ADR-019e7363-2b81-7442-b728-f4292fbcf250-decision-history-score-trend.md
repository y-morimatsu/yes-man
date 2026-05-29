# 決定履歴エンドポイントと ScorePage の推移表示を追加する

- **ADR ID**: `019e7363-2b81-7442-b728-f4292fbcf250` (UUID v7)
- **slug**: `decision-history-score-trend`
- **日付**: 2026-05-22
- **ステータス**: Accepted
- **関連コミット**: `bcd9a9b`, `aa25a2e`
- **関連 ADR**: [委任度スコアの意味を No 比率から Yes 比率へ反転する](ADR-019e7363-1411-707c-a7f1-e51435244ed6-score-semantics-yes-ratio.md)

## コンテキスト

委任度スコアを「点」ではなく「積み重ね」として見せ、過去の Yes 採択を振り返れるようにしたい。

## 決定

`GET /v1/decisions` 履歴 API (attempt_count 込み) を追加し、ScorePage に DecisionHistoryList と 30 日推移グラフを組み込む。

## 結果 (トレードオフ)

- スコアの説得力が増し、デモで「使い込んだ感」を出せる土台になった。
- 履歴クエリ高速化のため `(user_id, created_at)` 複合インデックスを用意した。
- Yes/No 採択後に履歴クエリを invalidate する必要があった。
