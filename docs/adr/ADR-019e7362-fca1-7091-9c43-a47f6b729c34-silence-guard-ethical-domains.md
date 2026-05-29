# 倫理 4 ドメインで AI を沈黙させる SilenceGuard を設ける

- **ADR ID**: `019e7362-fca1-7091-9c43-a47f6b729c34` (UUID v7)
- **slug**: `silence-guard-ethical-domains`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`
- **関連 ADR**: [沈黙ログには本文を残さずハッシュのみ保存する](ADR-019e7363-0089-745c-95c7-5616c7a01ecd-silencelog-hash-only.md), [合議プロンプトを厳格化し「投げ返さず 1 つに決める」を強制する](ADR-019e7363-46d9-7397-b8d2-76a223e4e759-consensus-prompt-strict.md)

## コンテキスト

意思決定を代行するサービスとして、宗教・選挙・暴力・卑猥といった領域に踏み込むのは倫理的に不適切。

## 決定

regex の即時判定 + LLM 自己判定の 2 段で禁止ドメインを検出し、固定文言で応答を停止する。判定不能時は沈黙側に倒す fail-closed とし、Bedrock Guardrails も併用する。

## 結果 (トレードオフ)

- 「踏み込まない」ことをプロダクトの価値として明示できた。
- fail-closed により誤判定で踏み込むリスクを最小化した。
- Bedrock RPM 制約下では LLM 判定を env でスキップできるようにした ([bedrock-rpm-mitigations])。
