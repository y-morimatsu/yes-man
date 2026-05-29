# AI-DLC + Kiro 流 Spec-Driven Development を開発プロセスに採用する

- **ADR ID**: `019e7362-e531-7920-8bd2-32b70218af59` (UUID v7)
- **slug**: `adopt-ai-dlc-spec-driven`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`

## コンテキスト

AWS Summit Japan 2026 ハッカソンで、要件が曖昧なまま実装に入ると手戻りが大きい。AI を活用しつつ、要件→設計→タスク→実装の各段で人間レビューを挟む規律が必要だった。

## 決定

AWS AI-DLC (Inception → Construction → Operations) を骨格に、Kiro 流の 3 フェーズ承認ワークフロー (Requirements → Design → Tasks → Implementation) を採用する。思考トレースは `aidlc-docs/` に蓄積し、ルール詳細は `.aidlc-rule-details/` 等から読み込む。

## 結果 (トレードオフ)

- 各フェーズで人間承認が必要になり、意思決定が監査可能 (`audit.md`) になる。
- システムを 14 Units (U1-infra / U2-U6 backend / U7a-d frontend / U-Persona / U-Test) に分解して並行設計できた。
- ハッカソンの速度を出すため `-y` ファストトラックや緩和ルールも併用する余地を残した。
