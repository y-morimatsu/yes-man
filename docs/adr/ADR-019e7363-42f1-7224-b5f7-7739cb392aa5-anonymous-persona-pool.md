# 匿名共有ペルソナプール (知り合い) を導入する

- **ADR ID**: `019e7363-42f1-7224-b5f7-7739cb392aa5` (UUID v7)
- **slug**: `anonymous-persona-pool`
- **日付**: 2026-05-24
- **ステータス**: Accepted
- **関連コミット**: `73d1dda`, `845a298`, `4240c34`
- **関連 ADR**: [嗜好プロファイルから推奨ペルソナを自動選択する](ADR-019e7363-1fc9-7ab4-8ce0-9126fc8e4bfc-dynamic-persona-routing.md), [カスタムペルソナ作成 UX を刷新する (modal 大型化 + AvatarEditor + 最小 10 字)](ADR-019e7363-5291-7e24-a225-3d7db3e9bb71-custom-persona-create-ux.md)

## コンテキスト

ビルトイン 3 ペルソナだけでは多様性に欠ける。他者の価値観を匿名で借りて合議に参加させたい。

## 決定

ライフスタイル別 fixture を持つ匿名共有プール (anonymous-strangers) を導入し、UI 表記を「知り合い」に統一する。匿名化のため言語/口調メタを付与し、MangaStage で漫画調に表示する。

## 結果 (トレードオフ)

- プリセット/知り合い/カスタムの 3 系統からペルソナを混在選択できるようになった。
- 匿名プールの opt-in と引用カウントの仕組みが必要になった。
- 合議表示に chat / manga の StageMode 分岐が生まれた。
