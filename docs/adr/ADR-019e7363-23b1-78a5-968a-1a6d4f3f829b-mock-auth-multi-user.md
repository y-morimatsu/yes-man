# Mock 認証でログイン/登録とマルチユーザーをローカル再現する

- **ADR ID**: `019e7363-23b1-78a5-968a-1a6d4f3f829b` (UUID v7)
- **slug**: `mock-auth-multi-user`
- **日付**: 2026-05-21
- **ステータス**: Accepted
- **関連コミット**: `ce686fa`, `a0ea19d`
- **関連 ADR**: [外部依存を環境変数で切り替える Strategy + DI を設計の中核にする](ADR-019e7362-f0e9-75db-b6cf-4eee6656dcc1-strategy-di-env-backend-switching.md), [デモモードを email gate + DemoLLMAdapter で実現する (再デプロイ不要)](ADR-019e7363-75b9-74e9-9961-6b8ec1cfcb2c-demo-mode-email-gate.md)

## コンテキスト

Cognito を立てずに、ログイン/登録/ログアウトの動線と複数ユーザーの体験をローカル・デモで再現したい。

## 決定

`AUTH_BACKEND=mock` で localStorage に email/sub を保持し、Bearer を `mock-user:<base64url({sub,email})>` 形式で送る。バックエンドがデコードして `AuthenticatedUser` を生成する。

## 結果 (トレードオフ)

- 再デプロイなしに sign-in する email を変えるだけでユーザーを切り替えられる。
- この仕組みが後のデモモード (email gate) の土台になった。
- 本番では Cognito (PKCE) に切り替える前提。
