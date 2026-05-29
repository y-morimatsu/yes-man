# 合議をペルソナ並列 + token streaming + 事前表示でリアルタイム化する

- **ADR ID**: `019e7363-2799-7759-9414-3e8db26aa36e` (UUID v7)
- **slug**: `realtime-consensus-streaming`
- **日付**: 2026-05-22
- **ステータス**: Accepted
- **関連コミット**: `4e6874e`, `e5d1f38`
- **関連 ADR**: [3 ペルソナの並列合議で提案を生成する合議エンジンにする](ADR-019e7362-f8b9-7b1b-b83e-0f70c71fcf49-three-persona-consensus.md), [フロントを React + Vite + TanStack Query + useReducer で構成する](ADR-019e7363-0859-753b-a901-09cd0baabf0a-frontend-react-reducer-stack.md)

## コンテキスト

合議結果を一括返却すると待ち時間が体感で長い。チャットのように議論が進む様子を見せたい。

## 決定

3 ペルソナの LLM 呼び出しを `asyncio.gather` で並列化し、SSE で `personas` 事前表示 → `utterance_delta` トークン逐次 → `utterance` 確定 → `proposal` の順にストリーミングする。

## 結果 (トレードオフ)

- 体感待ち時間が大幅に短縮し、議論の臨場感が出た。
- Lambda 上で SSE を流すため LWA の RESPONSE_STREAM が必須になった ([lwa-response-stream-sse])。
- フロント reducer に delta 累積 / pre-fill の action を追加した。
