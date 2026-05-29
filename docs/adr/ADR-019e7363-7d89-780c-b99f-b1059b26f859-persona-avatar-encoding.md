# ペルソナアバターを yesman-avatar: base64 emoji で符号化し全画面で統一表示する

- **ADR ID**: `019e7363-7d89-780c-b99f-b1059b26f859` (UUID v7)
- **slug**: `persona-avatar-encoding`
- **日付**: 2026-05-29
- **ステータス**: Accepted
- **関連コミット**: `af1d32e`, `c9680cf`, `db95922`
- **関連 ADR**: [カスタムペルソナ作成 UX を刷新する (modal 大型化 + AvatarEditor + 最小 10 字)](ADR-019e7363-5291-7e24-a225-3d7db3e9bb71-custom-persona-create-ux.md), [デモモードを email gate + DemoLLMAdapter で実現する (再デプロイ不要)](ADR-019e7363-75b9-74e9-9961-6b8ec1cfcb2c-demo-mode-email-gate.md)

## コンテキスト

カスタム/デモのペルソナアイコンが画面ごとに文字だったり emoji だったりとバラバラで、選択画面・ホーム・議論画面 (MangaStage)・入力ピルで表示が一致しなかった。

## 決定

emoji + 色を `yesman-avatar:<base64(JSON{mode,color,emoji})>` として `avatar_url` に格納し、共通の `decodeAvatarConfig` で復号する。全表示箇所 (PersonaCard / SelectedPersonaAvatars / MangaStage / Home チップ / 入力ピル) でこれを使う。

## 結果 (トレードオフ)

- アバター表示が全画面で統一された。
- デモの妻/娘/ワンコのアイコンも一貫して出る。
- avatar_url を符号化文字列として使う規約を全コンポーネントで守る必要がある。
