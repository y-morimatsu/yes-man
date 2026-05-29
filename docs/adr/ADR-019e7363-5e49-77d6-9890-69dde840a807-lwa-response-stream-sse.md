# LWA を RESPONSE_STREAM モードにして Lambda 上で SSE を実現する

- **ADR ID**: `019e7363-5e49-77d6-9890-69dde840a807` (UUID v7)
- **slug**: `lwa-response-stream-sse`
- **日付**: 2026-05-27
- **ステータス**: Accepted
- **関連コミット**: `2d43ede`
- **関連 ADR**: [合議をペルソナ並列 + token streaming + 事前表示でリアルタイム化する](ADR-019e7363-2799-7759-9414-3e8db26aa36e-realtime-consensus-streaming.md), [FastAPI を Lambda Web Adapter (container image) + Function URL で Lambda 化する](ADR-019e7363-5a61-7a96-9cd9-5d4d80e7d451-fastapi-lambda-web-adapter.md)

## コンテキスト

合議のリアルタイム表示は SSE 前提。だが通常の Lambda はレスポンスをバッファするため SSE が成立しない。

## 決定

`AWS_LWA_INVOKE_MODE=response_stream` を設定し、CloudFront の `/api/*` ビヘイビアは圧縮無効・キャッシュ無効にして chunk buffering を回避する。

## 結果 (トレードオフ)

- Lambda + CloudFront でも合議のトークンストリーミングが流れる。
- API ビヘイビアの圧縮を切る必要があり、設定が default ビヘイビアと分かれた。
- SSE 経路の動作確認が CloudFront 越しで必須になった。
