# No 採択後の Yes 後押し microcopy を LLM で動的生成する

- **ADR ID**: `019e7363-3739-7949-8cc6-35f7d121342c` (UUID v7)
- **slug**: `yes-nudge-llm-microcopy`
- **日付**: 2026-05-23
- **ステータス**: Accepted
- **関連コミット**: `8af4ff0`
- **関連 ADR**: [合議をペルソナ並列 + token streaming + 事前表示でリアルタイム化する](ADR-019e7363-2799-7759-9414-3e8db26aa36e-realtime-consensus-streaming.md)

## コンテキスト

No で別案を再生成した後、ユーザーがいつまでも決めきれない。優しく Yes へ背中を押す一言がほしい。

## 決定

No 後の新提案に対し、stage (no_attempt_count) に応じた後押し microcopy (<=60 字) を LLM で生成し、TTL キャッシュ + fallback 付きで返す。

## 結果 (トレードオフ)

- 「決めなくていい」体験を保ちつつ Yes へ誘導できる。
- 生成失敗時は fallback 文言で必ず何かを返す。
- 短時間・小コストで返すためキャッシュと timeout を設けた。
