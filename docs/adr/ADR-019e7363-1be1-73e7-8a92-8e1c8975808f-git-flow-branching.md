# Git-Flow + Conventional Commits + --no-ff マージを規約化する

- **ADR ID**: `019e7363-1be1-73e7-8a92-8e1c8975808f` (UUID v7)
- **slug**: `git-flow-branching`
- **日付**: 2026-05-19
- **ステータス**: Accepted
- **関連コミット**: `c44e032`

## コンテキスト

複数人・AI 併用の開発で、履歴の追跡性とリリース管理を保ちたい。ハッカソンの速度も殺したくない。

## 決定

`main` / `develop` / `feature/*` / `bugfix/*` の Git-Flow、Conventional Commits、`Co-Authored-By` trailer を CLAUDE.md に明文化する。develop へは PR 経由・`--no-ff` マージ (squash は使わず branch 線を残す)。単独開発時の緩和ルールも許容する。

## 結果 (トレードオフ)

- PR 番号と branch 線が履歴に残り、本 ADR 群のような時系列追跡が可能になった。
- アイデア検証期は CI green でも user 明示許可なく develop/main へ merge しない運用とした。
- 破壊的操作 (force-push / reset --hard) は明示承認制。
