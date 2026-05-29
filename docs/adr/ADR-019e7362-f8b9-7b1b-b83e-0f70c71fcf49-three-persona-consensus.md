# 3 ペルソナの並列合議で提案を生成する合議エンジンにする

- **ADR ID**: `019e7362-f8b9-7b1b-b83e-0f70c71fcf49` (UUID v7)
- **slug**: `three-persona-consensus`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`, `de7e889`
- **関連 ADR**: [LLM を LLMProviderAdapter Protocol で抽象化する](ADR-019e7362-f4d1-72dc-b35c-0d303f48aece-llm-provider-protocol.md), [合議をペルソナ並列 + token streaming + 事前表示でリアルタイム化する](ADR-019e7363-2799-7759-9414-3e8db26aa36e-realtime-consensus-streaming.md)

## コンテキスト

ユーザーの判断疲労を肩代わりするには、単一回答ではなく複数視点の議論を経た 1 つの提案が説得力を持つ。

## 決定

慎重派 / 楽観派 / 効率派など 3 ペルソナの発言を生成し、それを集約して 1 つの最終提案 (30〜100 字・1 文) を作る `DecisionEngine` を中核に据える。

## 結果 (トレードオフ)

- 「複数人格が議論して 1 つに決める」体験が YesMan の核になった。
- 提案プロンプトに厳格な制約 (投げ返し禁止等) が必要になった ([consensus-prompt-strict])。
- 後に drill-down / 匿名プール / デモモードがこのエンジンの拡張として実装された。
