# カスタムペルソナ作成 UX を刷新する (modal 大型化 + AvatarEditor + 最小 10 字)

- **ADR ID**: `019e7363-5291-7e24-a225-3d7db3e9bb71` (UUID v7)
- **slug**: `custom-persona-create-ux`
- **日付**: 2026-05-26
- **ステータス**: Accepted
- **関連コミット**: `69e2296`
- **関連 ADR**: [匿名共有ペルソナプール (知り合い) を導入する](ADR-019e7363-42f1-7224-b5f7-7739cb392aa5-anonymous-persona-pool.md), [ペルソナアバターを yesman-avatar: base64 emoji で符号化し全画面で統一表示する](ADR-019e7363-7d89-780c-b99f-b1059b26f859-persona-avatar-encoding.md)

## コンテキスト

自作ペルソナの作成体験が窮屈で、prompt の最小文字数 (30) も入力ハードルが高かった。

## 決定

作成 modal を大型化し AvatarEditor を埋め込む。prompt_text の最小長を 30→10 字に緩和する。

## 結果 (トレードオフ)

- 気軽に自作ペルソナを作れるようになった。
- アバター編集の導線がここで整い、後の avatar 符号化に繋がった。
- moderation (沈黙チェック + 通報 + 自動ブロック) は維持する。
