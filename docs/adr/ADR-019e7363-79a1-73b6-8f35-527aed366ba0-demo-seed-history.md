# デモの seed 履歴を 5/15 起点に揃え、スコア 73% と整合させる

- **ADR ID**: `019e7363-79a1-73b6-8f35-527aed366ba0` (UUID v7)
- **slug**: `demo-seed-history`
- **日付**: 2026-05-28
- **ステータス**: Accepted
- **関連コミット**: `b71ea46`, `835e059`, `d7af758`
- **関連 ADR**: [デモモードを email gate + DemoLLMAdapter で実現する (再デプロイ不要)](ADR-019e7363-75b9-74e9-9961-6b8ec1cfcb2c-demo-mode-email-gate.md), [委任度スコアの意味を No 比率から Yes 比率へ反転する](ADR-019e7363-1411-707c-a7f1-e51435244ed6-score-semantics-yes-ratio.md)

## コンテキスト

デモユーザーに「使い込んだ感」を出すには、ホーム・スコア・推移グラフが互いに矛盾しない履歴が要る。

## 決定

デモ履歴の開始日を 5/15 に固定し、推移グラフも 5/15 起点に truncate する。合議結論は実文言にし、スコア 73% (`DEMO_SCORE_RATIO=0.73`) と breakdown を整合させる。

## 結果 (トレードオフ)

- ホーム/スコア/履歴/グラフが一貫した「使い込み」を演出できる。
- read endpoint 側でも seed して値の整合を取った。
- デモ固有の数値は demo_mode に集約され通常経路に漏れない。
