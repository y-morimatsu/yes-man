# YesMan ADR (Architecture Decision Records)

YesMan のプロダクト仕様に対する機能追加・修正の意思決定を時系列に記録した ADR 集です。

- ファイル名規約: `ADR-{uuid-v7}-{英語スラッグ}.md`
- UUID v7 は生成時刻ベースの単調増加タイムスタンプを埋め込んでいるため、ファイル名は **決定の時系列順にソート** されます。
- 各 ADR は コンテキスト / 決定 / 結果 (トレードオフ) と、関連コミット・関連 ADR を記載します。

## 一覧 (時系列)

| # | 日付 | ステータス | 決定 |
|---|---|---|---|
| 1 | 2026-05-10 | Accepted | [AI-DLC + Kiro 流 Spec-Driven Development を開発プロセスに採用する](ADR-019e7362-e531-7920-8bd2-32b70218af59-adopt-ai-dlc-spec-driven.md) |
| 2 | 2026-05-10 | Accepted | [pnpm workspace による monorepo 構成にする](ADR-019e7362-e919-713a-ab52-c652cb582cfc-monorepo-pnpm-workspace.md) |
| 3 | 2026-05-10 | Accepted | [バックエンドを DDD + ヘキサゴナル (Ports & Adapters) で構成する](ADR-019e7362-ed01-7690-b2e1-14d72d767f76-backend-ddd-hexagonal.md) |
| 4 | 2026-05-10 | Accepted | [外部依存を環境変数で切り替える Strategy + DI を設計の中核にする](ADR-019e7362-f0e9-75db-b6cf-4eee6656dcc1-strategy-di-env-backend-switching.md) |
| 5 | 2026-05-10 | Accepted | [LLM を LLMProviderAdapter Protocol で抽象化する](ADR-019e7362-f4d1-72dc-b35c-0d303f48aece-llm-provider-protocol.md) |
| 6 | 2026-05-10 | Accepted | [3 ペルソナの並列合議で提案を生成する合議エンジンにする](ADR-019e7362-f8b9-7b1b-b83e-0f70c71fcf49-three-persona-consensus.md) |
| 7 | 2026-05-10 | Accepted | [倫理 4 ドメインで AI を沈黙させる SilenceGuard を設ける](ADR-019e7362-fca1-7091-9c43-a47f6b729c34-silence-guard-ethical-domains.md) |
| 8 | 2026-05-10 | Accepted | [沈黙ログには本文を残さずハッシュのみ保存する](ADR-019e7363-0089-745c-95c7-5616c7a01ecd-silencelog-hash-only.md) |
| 9 | 2026-05-10 | Superseded | [委任度スコアで「AI にどれだけ任せたか」を可視化する](ADR-019e7363-0471-7eec-8bcf-93588e3a91ad-autonomy-delegation-score.md) |
| 10 | 2026-05-10 | Accepted | [フロントを React + Vite + TanStack Query + useReducer で構成する](ADR-019e7363-0859-753b-a901-09cd0baabf0a-frontend-react-reducer-stack.md) |
| 11 | 2026-05-10 | Accepted | [api-client を依存ゼロの純 fetch ラッパーにする](ADR-019e7363-0c41-7ce7-8705-671b7ca9ec25-api-client-pure-fetch.md) |
| 12 | 2026-05-10 | Accepted | [PWA としてインストール可能なアプリにする](ADR-019e7363-1029-75f7-a538-ebb3be47b0e7-pwa-installable.md) |
| 13 | 2026-05-18 | Accepted | [委任度スコアの意味を No 比率から Yes 比率へ反転する](ADR-019e7363-1411-707c-a7f1-e51435244ed6-score-semantics-yes-ratio.md) |
| 14 | 2026-05-19 | Accepted | [音声入出力を Web Speech API と Server STT/TTS の 2 backend 切替にする](ADR-019e7363-17f9-7a79-890c-50e172df15cf-voice-dual-backend.md) |
| 15 | 2026-05-19 | Accepted | [Git-Flow + Conventional Commits + --no-ff マージを規約化する](ADR-019e7363-1be1-73e7-8a92-8e1c8975808f-git-flow-branching.md) |
| 16 | 2026-05-19 | Superseded | [嗜好プロファイルから推奨ペルソナを自動選択する](ADR-019e7363-1fc9-7ab4-8ce0-9126fc8e4bfc-dynamic-persona-routing.md) |
| 17 | 2026-05-21 | Accepted | [Mock 認証でログイン/登録とマルチユーザーをローカル再現する](ADR-019e7363-23b1-78a5-968a-1a6d4f3f829b-mock-auth-multi-user.md) |
| 18 | 2026-05-22 | Accepted | [合議をペルソナ並列 + token streaming + 事前表示でリアルタイム化する](ADR-019e7363-2799-7759-9414-3e8db26aa36e-realtime-consensus-streaming.md) |
| 19 | 2026-05-22 | Accepted | [決定履歴エンドポイントと ScorePage の推移表示を追加する](ADR-019e7363-2b81-7442-b728-f4292fbcf250-decision-history-score-trend.md) |
| 20 | 2026-05-22 | Accepted | [モバイル UX として BottomNav 4-tab + safe-area 対応に刷新する](ADR-019e7363-2f69-7088-a58d-aee90e510d3e-mobile-bottom-nav.md) |
| 21 | 2026-05-22 | Accepted | [ホームに YES/NO Quick-Start (事前生成テンプレプール) を置く](ADR-019e7363-3351-7b2e-b982-87fdf56a89de-quickstart-yes-no-pool.md) |
| 22 | 2026-05-23 | Accepted | [No 採択後の Yes 後押し microcopy を LLM で動的生成する](ADR-019e7363-3739-7949-8cc6-35f7d121342c-yes-nudge-llm-microcopy.md) |
| 23 | 2026-05-23 | Accepted | [Yes 連鎖で深掘りする drill-down と外部サービス CTA を導入する](ADR-019e7363-3b21-7e11-9d90-a1c97bdd4639-drilldown-decision-chain.md) |
| 24 | 2026-05-23 | Accepted | [新規ユーザーの嗜好を性格×生活の Yes/No swipe で把握する](ADR-019e7363-3f09-75b8-9ec4-76c9c7e6b768-onboarding-preference-capture.md) |
| 25 | 2026-05-24 | Accepted | [匿名共有ペルソナプール (知り合い) を導入する](ADR-019e7363-42f1-7224-b5f7-7739cb392aa5-anonymous-persona-pool.md) |
| 26 | 2026-05-26 | Accepted | [合議プロンプトを厳格化し「投げ返さず 1 つに決める」を強制する](ADR-019e7363-46d9-7397-b8d2-76a223e4e759-consensus-prompt-strict.md) |
| 27 | 2026-05-26 | Accepted | [drill-down 最終段で Yes 確定時に外部サービスを自動で開く](ADR-019e7363-4ac1-7829-99da-d272406fe9d0-drilldown-auto-open-confirm.md) |
| 28 | 2026-05-26 | Accepted | [service_catalog を Amazon 優先 + デモ 10 シナリオ着地保証にする](ADR-019e7363-4ea9-7096-bb18-8e0c4317719d-service-catalog-amazon-first.md) |
| 29 | 2026-05-26 | Accepted | [カスタムペルソナ作成 UX を刷新する (modal 大型化 + AvatarEditor + 最小 10 字)](ADR-019e7363-5291-7e24-a225-3d7db3e9bb71-custom-persona-create-ux.md) |
| 30 | 2026-05-27 | Accepted | [実デプロイは CloudFront + S3 の静的配信スタックから始める](ADR-019e7363-5679-758e-9059-10476b5fa857-web-static-cloudfront-s3.md) |
| 31 | 2026-05-27 | Accepted | [FastAPI を Lambda Web Adapter (container image) + Function URL で Lambda 化する](ADR-019e7363-5a61-7a96-9cd9-5d4d80e7d451-fastapi-lambda-web-adapter.md) |
| 32 | 2026-05-27 | Accepted | [LWA を RESPONSE_STREAM モードにして Lambda 上で SSE を実現する](ADR-019e7363-5e49-77d6-9890-69dde840a807-lwa-response-stream-sse.md) |
| 33 | 2026-05-27 | Accepted | [Bedrock モデルを試行錯誤の末 Google Gemma 3 12B IT に決める](ADR-019e7363-6231-75a3-855f-85a159446e9c-bedrock-model-gemma.md) |
| 34 | 2026-05-27 | Accepted | [Bedrock RPM 制約への緩和策一式を入れる](ADR-019e7363-6619-7e5d-9572-bc3ea837ed5c-bedrock-rpm-mitigations.md) |
| 35 | 2026-05-27 | Accepted | [SPA fallback を CloudFront Function に一本化する (404 errorResponses 廃止)](ADR-019e7363-6a01-7510-b03e-9df906102c33-spa-fallback-cloudfront-function.md) |
| 36 | 2026-05-28 | Accepted | [MockStore を S3 pickle で永続化し Lambda マルチインスタンス分断を解消する](ADR-019e7363-6de9-776b-a21d-3e1620fc03c5-mockstore-s3-persistence.md) |
| 37 | 2026-05-28 | Accepted | [新規ユーザーにビルトイン 3 ペルソナをデフォルト選択させる](ADR-019e7363-71d1-720b-aae2-b2cfb5e5da96-default-builtin-persona-selection.md) |
| 38 | 2026-05-28 | Accepted | [デモモードを email gate + DemoLLMAdapter で実現する (再デプロイ不要)](ADR-019e7363-75b9-74e9-9961-6b8ec1cfcb2c-demo-mode-email-gate.md) |
| 39 | 2026-05-28 | Accepted | [デモの seed 履歴を 5/15 起点に揃え、スコア 73% と整合させる](ADR-019e7363-79a1-73b6-8f35-527aed366ba0-demo-seed-history.md) |
| 40 | 2026-05-29 | Accepted | [ペルソナアバターを yesman-avatar: base64 emoji で符号化し全画面で統一表示する](ADR-019e7363-7d89-780c-b99f-b1059b26f859-persona-avatar-encoding.md) |
| 41 | 2026-05-29 | Accepted | [SwipeChoice を 4 方向スワイプ (案E) に再設計する](ADR-019e7363-8171-71bc-a941-1e4d0dc7c371-four-direction-swipe-redesign.md) |
| 42 | 2026-05-29 | Accepted | [実装済みコードを基にサービス設計書を整備する](ADR-019e7363-8559-7f68-9236-f3a5fcf0b0cd-service-design-docs.md) |

## 凡例 (ステータス)

- **Accepted**: 採用され有効な決定。
- **Superseded**: 後続の ADR に置き換えられた決定 (`Superseded by` 参照)。

## 関連資料

- [docs/design/](../design/) — サービス設計書 (概要/フロント/バック/インフラ/データモデル)
- [aidlc-docs/](../../aidlc-docs/) — AI-DLC の Inception / Construction 思考トレース
