# FastAPI を Lambda Web Adapter (container image) + Function URL で Lambda 化する

- **ADR ID**: `019e7363-5a61-7a96-9cd9-5d4d80e7d451` (UUID v7)
- **slug**: `fastapi-lambda-web-adapter`
- **日付**: 2026-05-27
- **ステータス**: Accepted
- **関連コミット**: `fedd1ed`, `deea0bf`, `fd5db69`
- **関連 ADR**: [実デプロイは CloudFront + S3 の静的配信スタックから始める](ADR-019e7363-5679-758e-9059-10476b5fa857-web-static-cloudfront-s3.md), [LWA を RESPONSE_STREAM モードにして Lambda 上で SSE を実現する](ADR-019e7363-5e49-77d6-9890-69dde840a807-lwa-response-stream-sse.md)

## コンテキスト

常時起動の ECS/ALB はコストと運用が重い。ハッカソン MVP では FastAPI をサーバレスで動かしたい。zip では 250 MiB unzipped 上限に当たる。

## 決定

FastAPI を AWS Lambda Web Adapter で Lambda 化し、container image 方式 (ARM64) で配置する。Function URL (authType=NONE) を CloudFront `/api/*` ビヘイビアに統合し、ログイン不要で Bedrock を呼ぶ経路を作る (#208)。

## 結果 (トレードオフ)

- 常時起動コストを回避しつつ FastAPI をそのまま動かせる。
- container image で依存サイズ上限を回避できた。
- Function URL 直アクセスを防ぐため `X-Origin-Verify` ヘッダ検証を入れた。
