# デモモードを email gate + DemoLLMAdapter で実現する (再デプロイ不要)

- **ADR ID**: `019e7363-75b9-74e9-9961-6b8ec1cfcb2c` (UUID v7)
- **slug**: `demo-mode-email-gate`
- **日付**: 2026-05-28
- **ステータス**: Accepted
- **関連コミット**: `b1c7774`, `772f515`, `4aa304e`
- **関連 ADR**: [Mock 認証でログイン/登録とマルチユーザーをローカル再現する](ADR-019e7363-23b1-78a5-968a-1a6d4f3f829b-mock-auth-multi-user.md), [LLM を LLMProviderAdapter Protocol で抽象化する](ADR-019e7362-f4d1-72dc-b35c-0d303f48aece-llm-provider-protocol.md), [デモの seed 履歴を 5/15 起点に揃え、スコア 73% と整合させる](ADR-019e7363-79a1-73b6-8f35-527aed366ba0-demo-seed-history.md)

## コンテキスト

審査・デモで安定したシナリオを見せたいが、フラグ切替で再デプロイするのは不可 (時間と安定性のリスク)。本物の合議エンジンや Bedrock 経路には手を入れたくない。

## 決定

`LLM_PROVIDER=mock` のような全体フラグではなく、sign-in する email に `morimatsu` を含む場合のみデモを発火させる。`DemoLLMAdapter` が本物 adapter をラップし、仕込んだ入力には scripted 応答、それ以外は本物 LLM に委譲する。妻/娘/ワンコ ペルソナとスコア 73% を既定で出す。

## 結果 (トレードオフ)

- 再デプロイなしに email だけでデモを on/off できる ([mock-auth-multi-user] の土台を活用)。
- 本物経路を一切汚さず、いつでも通常モードに戻せる。
- デモ用の固定ペルソナ ID・seed 履歴を別途用意する必要があった。
