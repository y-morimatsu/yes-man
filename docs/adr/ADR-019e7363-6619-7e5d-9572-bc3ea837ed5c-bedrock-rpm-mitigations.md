# Bedrock RPM 制約への緩和策一式を入れる

- **ADR ID**: `019e7363-6619-7e5d-9572-bc3ea837ed5c` (UUID v7)
- **slug**: `bedrock-rpm-mitigations`
- **日付**: 2026-05-27
- **ステータス**: Accepted
- **関連コミット**: `deebad6`, `6677c15`, `70b66cd`
- **関連 ADR**: [Bedrock モデルを試行錯誤の末 Google Gemma 3 12B IT に決める](ADR-019e7363-6231-75a3-855f-85a159446e9c-bedrock-model-gemma.md), [倫理 4 ドメインで AI を沈黙させる SilenceGuard を設ける](ADR-019e7362-fca1-7091-9c43-a47f6b729c34-silence-guard-ethical-domains.md)

## コンテキスト

Bedrock の RPM スパイクで RateLimitError が出る。同時実行 quota 10 も制約になる。

## 決定

RateLimitError に exponential backoff retry を入れ、SilenceGuard の LLM 自己判定を env でスキップ可能化 (regex のみ運用) し、Lambda メモリを 1024→2048 MB に上げる。

## 結果 (トレードオフ)

- RPM スパイクを吸収し、デモ中の失敗を減らせた。
- 実デプロイ構成では `SILENCE_GUARD_LLM_ENABLED=false` で RPM を節約する。
- 沈黙判定は regex のみでも倫理 4 ドメインを概ねカバーできる前提。
