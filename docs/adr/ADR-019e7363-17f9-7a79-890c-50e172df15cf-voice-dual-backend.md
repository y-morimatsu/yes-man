# 音声入出力を Web Speech API と Server STT/TTS の 2 backend 切替にする

- **ADR ID**: `019e7363-17f9-7a79-890c-50e172df15cf` (UUID v7)
- **slug**: `voice-dual-backend`
- **日付**: 2026-05-19
- **ステータス**: Accepted
- **関連コミット**: `775f6a5`
- **関連 ADR**: [外部依存を環境変数で切り替える Strategy + DI を設計の中核にする](ADR-019e7362-f0e9-75db-b6cf-4eee6656dcc1-strategy-di-env-backend-switching.md)

## コンテキスト

ブラウザ内蔵音声は無料・低遅延だが対応がまちまち。サーバ側 (Polly/Transcribe) は安定だがコストと遅延がある。

## 決定

`VOICE_BACKEND` で `web-speech-api` / `aws` / `mock` を切替可能にし、フロントに backend 選択 UI を設ける。非対応ブラウザは Server STT へ自動 fallback する。

## 結果 (トレードオフ)

- ユーザー環境に応じて最適な音声経路を選べる。
- web-speech-api はクライアント実行のためサーバ呼び出しは 409 を返す設計になった。
- TTS はレイテンシ予算のため SilenceGuard を regex のみで通す。
