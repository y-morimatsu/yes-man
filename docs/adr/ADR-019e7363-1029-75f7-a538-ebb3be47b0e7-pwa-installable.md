# PWA としてインストール可能なアプリにする

- **ADR ID**: `019e7363-1029-75f7-a538-ebb3be47b0e7` (UUID v7)
- **slug**: `pwa-installable`
- **日付**: 2026-05-10
- **ステータス**: Accepted
- **関連コミット**: `48ef746`
- **関連 ADR**: [フロントを React + Vite + TanStack Query + useReducer で構成する](ADR-019e7363-0859-753b-a901-09cd0baabf0a-frontend-react-reducer-stack.md)

## コンテキスト

モバイルでネイティブアプリのような体験を、ストア配布なしで届けたい。

## 決定

vite-plugin-pwa で `autoUpdate` / `skipWaiting` / `clientsClaim` を有効化し、`/api/*` は `navigateFallbackDenylist` で SPA fallback から除外する。

## 結果 (トレードオフ)

- 「ホーム画面に追加」で URL バー非表示のフルスクリーン起動ができる (後に iOS/Android 対応を追加)。
- デプロイ後の古い precache 不整合を防ぐため `cleanupOutdatedCaches` を後日追加した。
- SSE を壊さないよう API パスを SW のフォールバック対象外にする必要があった。
