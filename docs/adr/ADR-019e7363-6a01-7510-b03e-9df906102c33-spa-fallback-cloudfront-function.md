# SPA fallback を CloudFront Function に一本化する (404 errorResponses 廃止)

- **ADR ID**: `019e7363-6a01-7510-b03e-9df906102c33` (UUID v7)
- **slug**: `spa-fallback-cloudfront-function`
- **日付**: 2026-05-27
- **ステータス**: Accepted
- **関連コミット**: `f71f7cf`
- **関連 ADR**: [実デプロイは CloudFront + S3 の静的配信スタックから始める](ADR-019e7363-5679-758e-9059-10476b5fa857-web-static-cloudfront-s3.md), [FastAPI を Lambda Web Adapter (container image) + Function URL で Lambda 化する](ADR-019e7363-5a61-7a96-9cd9-5d4d80e7d451-fastapi-lambda-web-adapter.md)

## コンテキスト

CloudFront の 404 errorResponses による SPA fallback が `/api/*` にも適用され、API レスポンスまで index.html に書き換わるバグが出た。

## 決定

errorResponses 方式を廃止し、viewer-request の CloudFront Function で拡張子なしパスを `/index.html` に rewrite する。`/api/*` は別 Function で prefix を strip する。

## 結果 (トレードオフ)

- SPA ディープリンクと API 経路が干渉しなくなった。
- rewrite ロジックが CDN エッジで完結し、オリジン負荷がない。
- Function のテストが CloudFront 越しで必要になった。
