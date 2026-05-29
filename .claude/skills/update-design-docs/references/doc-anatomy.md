# ドキュメント解剖図 (doc-anatomy)

各対象ドキュメントの章立てと、含まれる Mermaid/図、そして「変更タイプ → 触る箇所」の対応。
更新プラン生成 (SKILL.md Step 3) の前に必ず参照する。実際の行番号は変動するので、節見出しで `Read` して位置を確認すること。

## docs/design/01-overview.md

| 節 | 内容 | 図 |
|---|---|---|
| 1.1 サービスコンセプト | タグライン / コアバリュー / ターゲット 3 ペルソナ表 | — |
| 1.2 主要機能 | 機能 × 概要 × 実装の要点 の表 | — |
| 1.3 主要ユースケースの流れ | 相談→合議→drill-down→Yes のシーケンス | **Mermaid sequenceDiagram** |
| 1.4 モノレポ構成 | ディレクトリツリー + パッケージ表 | — |
| 1.5 技術スタック総覧 | カテゴリ × 技術 | — |
| 1.6 全体アーキテクチャ | 実デプロイ構成 | **Mermaid flowchart LR** |
| 1.7 Strategy + DI | 5 つの `*_BACKEND` env 表 | — |
| 1.8 非機能要件 | 性能/可用性/プライバシー/安全性/A11y/コスト | — |
| 1.9 開発プロセス (AI-DLC) | フェーズ表 / Git-Flow | — |

## docs/design/02-frontend-design.md

| 節 | 内容 | 図 |
|---|---|---|
| 2.1 技術スタックと方針 | 表 | — |
| 2.2 パッケージ責務 | web/ui/api-client の依存 | **Mermaid flowchart TD** |
| 2.3 ルーティングと画面 | Route × Component × 認証 表 / BottomNav | — |
| 2.4 機能モジュール | features/ 一覧 | — |
| 2.5 合議画面の状態管理 | State/Action 表 / SSE コールバック表 / StageMode / SwipeChoice 4 方向表 | **Mermaid stateDiagram-v2** |
| 2.6 API クライアント | モジュール別メソッド表 / ApiError.reason 一覧 / SSE | — |
| 2.7 認証フロー | Cognito / bypass / localStorage キー表 | — |
| 2.8 UI コンポーネント | composites / tokens / avatar 符号化 | — |
| 2.9 ビルド・テスト・PWA | Vite / PWA / env 変数表 | — |

## docs/design/03-backend-design.md

| 節 | 内容 | 図 |
|---|---|---|
| 3.1 アーキテクチャ (DDD/ヘキサゴナル) | 4 レイヤ表 + 起動シーケンス | **Mermaid flowchart TD ×2** |
| 3.2 API エンドポイント一覧 | グループ × メソッド × パス 表 + 主要 req/res スキーマ | — |
| 3.3 合議エンジン | SSE フロー / SSE イベント data 表 / drill-down depth 表 / ペルソナソース分岐 | **Mermaid sequenceDiagram** |
| 3.4 合議プロンプト設計 | PERSONA/PROPOSAL テンプレ制約表 | — |
| 3.5 沈黙ガードレール | 2 段判定 / キーワード辞書 / 固定応答 | **Mermaid flowchart LR** |
| 3.6 Service Catalog | カテゴリ × 既定サービス 表 (Amazon 優先) | — |
| 3.7 LLM プロバイダ抽象化 | Protocol / adapter 表 / timeout 定数表 | — |
| 3.8 永続化 | Repository 切替 (詳細は 05 へ) | **Mermaid flowchart LR** |
| 3.9 認証 | AuthBackend / Middleware / mock-user | — |
| 3.10 学習・音声・イベント | Loader / Consumer / Voice 表 | — |
| 3.11 デモモード | email gate / DemoLLMAdapter / seed | — |
| 3.12 エラー / HTTP ステータス | endpoint × reason × status 表 | — |
| 3.13 テスト構成 | unit/integration/contract/property | — |

## docs/design/04-infrastructure-design.md

| 節 | 内容 | 図 |
|---|---|---|
| 4.1 2 層のインフラ構成 | MVP vs フルスタック 表 | — |
| 4.2 WebStaticStack | リソース表 / Lambda env / CloudFront ビヘイビア表 / CF Functions の JS / IAM / セキュリティ | **Mermaid flowchart TB** |
| 4.3 デプロイフロー (CI/CD) | workflow step 表 / Dockerfile | **Mermaid flowchart LR** |
| 4.4 AWS サービス利用 | サービス × 用途 | — |
| 4.5 フルスタック構成 | 7-Stack | **Mermaid flowchart TB** |
| 4.6 簡素化の意思決定 | 簡素化 × 理由 | — |
| 4.7 運用メモ | リンク集 | — |

## docs/design/05-data-model.md

| 節 | 内容 | 図 |
|---|---|---|
| 5.1 ER 図 | 永続化モデル全体 + FK/カーディナリティ表 | **Mermaid erDiagram** |
| 5.2 テーブル別フィールド定義 | profiles/decisions/preference_profiles/silence_logs/personas/persona_reports/user_persona_selections | — |
| 5.3 Enum / Literal 定義 | DomainClassification / UserChoice / SilenceDomain 等 | — |
| 5.4 JSONB フィールド構造 | avatar_config / persona_outputs / *_patterns 等 | — |
| 5.5 In-flight ドメインモデル | DecisionRequest / ConsensusOutput / StreamEvent 等 | — |
| 5.6 MockStore | dict 群 / S3 pickle 永続化 | — |
| 5.7 マイグレーション | Alembic 0001-0003 / 固定 ID 規約 | — |

## docs/design/README.md (設計書索引)

- ドキュメント構成表 (01-05 へのリンク) — **新規ドキュメントを足したらここに行を追加**
- 「2 層のアーキテクチャ観」節 — MVP / フルスタックの定義 (consistency-rules の 2 層原則と一致させる)
- 関連資料リンク

## README.md (リポジトリルート, 大型 ~1270 行)

主要見出し (行番号は変動するので見出しで検索):
- `## 🎯 プロジェクト概要` / `## 💡 コア・コンセプト` (Yes 採択 UX / 委任度スコア / 沈黙 4 カテゴリ / 嗜好学習)
- `## 👥 想定ユーザー (3 ペルソナ)`
- `## 📱 画面イメージ` (実装スクリーン / Post-CONSTRUCTION v3/v4)
- `## 🚀 主要機能`
- `## 🏗️ アーキテクチャ` → `### AWS インフラ全体図` (drawio/png 参照) / `### アーキテクチャ採用理由`
- `## 🛠️ 技術スタック`
- `## 🚀 ローカル起動` (Mock/Claude CLI/LiteLLM の 3 モード + 早見表)
- `## 🗂️ データモデル (ER 図)` — **Mermaid erDiagram** (05 と同期必須)
- `## 🔄 ユーザーフロー (シーケンス図)` — **Mermaid sequenceDiagram ×2** (コア決定ループ / 沈黙演出)
- `## 📂 リポジトリ構成` / `## 🤖 AI-DLC による開発プロセス`

## docs/architecture/ (drawio)

| ファイル | 種別 | 表すもの | 編集 |
|---|---|---|---|
| `yesman-aws-arch.drawio` | mxGraph XML | **フルスタック構想** (API GW HTTP+WS / AgentCore / Cognito MFA+IdP / Aurora DSQL / DynamoDB / WAF / RUM / Polly / Transcribe / Nova Sonic) | drawio-editing.md パターンに従う |
| `yesman-aws-arch.png` | PNG | 上記の書き出し | drawio 編集後は **手動再エクスポート必須** |
| `yesman-aws-architecture-simple.drawio.svg` | 編集可能 SVG (XML) | 簡易アーキ図 | XML として編集可、妥当性検証必須 |

> 注意: `docs/presentation/specs/` にも同名 drawio がある場合があるが、それはプレゼン管理であり本スキールの責務外。

## 変更タイプ → 触る箇所 (クイックマップ)

| 変更 | docs/design | README.md | drawio |
|---|---|---|---|
| 新 API エンドポイント | 03 §3.2/§3.12, 02 §2.6 | 🚀 主要機能 | (API 経路が変われば) |
| データモデル/テーブル/enum | 05 §5.2-5.4, 03 §3.5 モデル表 | 🗂️ データモデル ER 図 | — |
| 新しい backend 実装 (`*_BACKEND`) | 01 §1.7, 03/04 factory | 🛠️ 技術スタック, 🚀 ローカル起動 | (インフラに出れば) |
| インフラ/CloudFront/Lambda/Bedrock | 04 §4.2-4.4, 01 §1.6 | 🏗️ アーキテクチャ | **必須** (層を仕分け) |
| 合議/プロンプト/drill-down/沈黙 | 03 §3.3-3.6, 01 §1.2 | 💡 コア・コンセプト, 🚀 主要機能 | — |
| フロント画面/ルート/UX | 02 §2.3-2.5, 01 §1.2 | 📱 画面イメージ, 🚀 主要機能 | — |
| 音声/学習/イベント | 03 §3.10, 01 §1.2 | 🚀 主要機能 | (フルスタック図に出れば) |
| 新規ドキュメント追加 | design/README 索引 | — | — |
