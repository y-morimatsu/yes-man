# ホームに YES/NO Quick-Start (事前生成テンプレプール) を置く

- **ADR ID**: `019e7363-3351-7b2e-b982-87fdf56a89de` (UUID v7)
- **slug**: `quickstart-yes-no-pool`
- **日付**: 2026-05-22
- **ステータス**: Accepted
- **関連コミット**: `0f16f0f`, `5352a83`
- **関連 ADR**: [SwipeChoice を 4 方向スワイプ (案E) に再設計する](ADR-019e7363-8171-71bc-a941-1e4d0dc7c371-four-direction-swipe-redesign.md)

## コンテキスト

「何を相談するか」を毎回入力させると初動が重い。すぐに Yes/No 体験へ入れる入口がほしい。

## 決定

Bedrock で事前生成したテンプレプールから Yes/No 候補を提示する Quick-Start を導入し、UI は合議結果と同じ SwipeChoice に統一する。

## 結果 (トレードオフ)

- 起動直後から「決めてもらう」体験に入れる。
- No 連続 5 回で自由入力モードへ切り替える設計にした。
- dedupe を dev/demo では無効化できるようにした。
