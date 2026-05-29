---
name: update-design-docs
description: YesMan のプロダクト仕様変更 (機能追加・修正・API/データモデル/インフラ/プロンプト変更・ADR 採択) を、設計書 (docs/design/01-05 + docs/design/README.md)、プロジェクト README.md、アーキテクチャ図 (docs/architecture/*.drawio, *.drawio.svg) に整合性を保ちながら追随反映するスキル。ユーザーが「設計書を更新」「ドキュメント反映」「drawio を更新」「README も直して」「プロダクト仕様に合わせて設計書を最新化」等と頼んだとき、または機能をマージした後・ADR を採択した後に起動する。コード・ADR・既存設計書を正としてクロスリファレンスを同期し、Mermaid 図と drawio XML の妥当性を検証することが核心の責務。
---

# update-design-docs

YesMan のプロダクト仕様変更を、設計書・README・アーキテクチャ図に整合性を保って反映する。

## 責務

**対象ドキュメント**:
1. `docs/design/01-overview.md` — コンセプト/機能/ユースケース/技術スタック/全体アーキ/非機能/AI-DLC
2. `docs/design/02-frontend-design.md` — 画面/reducer/SSE/SwipeChoice/api-client/認証/PWA
3. `docs/design/03-backend-design.md` — DDD/API スキーマ/合議エンジン/プロンプト/沈黙ガード/LLM 抽象化/エラー
4. `docs/design/04-infrastructure-design.md` — WebStaticStack/env/CloudFront/CI-CD/フルスタック構成
5. `docs/design/05-data-model.md` — ER 図/テーブル定義/enum/JSONB/MockStore/マイグレーション
6. `docs/design/README.md` — 設計書索引/2 層アーキテクチャ観
7. `README.md` (リポジトリルート) — プロジェクト概要/コアコンセプト/画面/機能/アーキ図/技術スタック/ER 図/シーケンス図
8. `docs/architecture/yesman-aws-arch.drawio` (+ `.png`) — AWS アーキ図 (フルスタック構想)
9. `docs/architecture/yesman-aws-architecture-simple.drawio.svg` — 簡易アーキ図 (編集可能 SVG)

**責務の核心**: ドキュメント間のクロスリファレンスを同期する。たとえば API を追加したら 03 のエンドポイント表・スキーマ、02 の api-client メソッド表・ApiError reason、README の機能節が全部揃うようにする。データモデルを変えたら 05 のテーブル定義・ER 図と README の ER 図 (Mermaid) と 03 のモデル表を揃える。

**責務外**: コード変更そのものはしない (ドキュメントの追随のみ)。ADR の新規作成はしない (別タスク。docs/adr は決定の参照元として読むだけ)。`docs/presentation/` の更新はしない (プレゼン資料は別管理)。

## 引数

ユーザーが `--mode` / `--feature` / `--scope` を明示するか、起動プロンプトに含める。明示がなければ既定で進め、最初の応答で前提を一言宣言する。

- `--mode` = **`report`** / **`propose`** (既定) / **`apply`**
  - `report`: 影響範囲と更新プランだけ出力、ファイルは一切変更しない。
  - `propose`: ファイル毎に diff を見せ、承認を得てから `Edit` する。
  - `apply`: 確認なしで適用。ただし **drawio はどのモードでも編集前に変更サマリーを出す** (破損リスクが高い)。
- `--feature` = 変更内容の自由記述 (省略時は直近 git log / diff / docs/adr から推測)。
- `--scope` = 対象ファイル絞り込み (省略時は影響する全ファイル)。

## ワークフロー

### Step 1: コンテキスト収集 — 「現在のプロダクト仕様」を確定する

`--feature` が明示されていればそれを使う。なければ以下から「何が変わったか」を推測し、ユーザーに一文で確認する:

- `git log --oneline -20` / `git diff main...HEAD` — コード側の変更 (`apps/` `packages/` `infra/`)
- `git status` — 未コミット変更
- `docs/adr/` — 最新の ADR (README の一覧で時系列確認、関連 ADR を読む)
- **正の優先順位**: 実コード > ADR > 既存設計書。設計書が古ければコードと ADR を正として直す。

### Step 2: 変更タイプの分類

`references/doc-anatomy.md` の「変更タイプ → 該当箇所」表で影響ドキュメントを特定する。代表タイプ:

| タイプ | 主に影響する箇所 |
|---|---|
| API 追加/変更 | 03 (エンドポイント表+スキーマ+エラー), 02 (api-client メソッド+ApiError), README (機能) |
| データモデル変更 | 05 (テーブル+ER+enum+JSONB), README (ER 図 Mermaid), 03 (モデル表) |
| インフラ/デプロイ変更 | 04 (WebStaticStack+env+CloudFront+CI), 01 (全体アーキ), README (アーキ), **drawio** |
| 合議/プロンプト/沈黙ガード変更 | 03 (該当節), 01 (機能), README (コアコンセプト) |
| フロント/UX 変更 | 02 (該当節), 01 (機能), README (画面/機能) |
| Strategy+DI (backend 切替) 追加 | 01 (env 表), 03/04 (factory), README (技術スタック/ローカル起動) |
| ADR 採択後の追随 | ADR の Decision/Consequences が指す範囲に応じて上記から選ぶ |

複数該当する場合は全タイプの和集合を更新する。

### Step 3: 更新プラン生成

`references/doc-anatomy.md` を **必ず** `Read` し、各対象ファイルを `Read` して現状把握。次の構造でプランを出す:

```
# 更新プラン
## 変更: <feature 要約>  ## タイプ: <分類>
### docs/design/03-backend-design.md
- [追加] §3.2 エンドポイント表に POST /v1/... を追加
- [修正] §3.12 エラー一覧に reason を追加
### README.md
- [修正] 「🚀 主要機能」に一行
### docs/architecture/yesman-aws-arch.drawio
- [追加] <component> ボックス (drawio-editing.md パターン B)
### 整合性チェック
- 03 の API 名 = 02 の api-client メソッド ✓ / 数値 (3 ペルソナ等) 一致 ✓
```

差分は最小化する。「ついでに整理」はしない。

### Step 4: モード別実行

- `report`: プラン出力で終了。
- `propose`: ファイル毎に Read → diff 提示 → 承認 → `Edit`。drawio は Step 6。
- `apply`: 即 `Edit`。drawio だけは Step 6 に従い編集サマリーを先に出す。

### Step 5: Mermaid 検証 (Markdown 編集後・必須)

設計書と README は Mermaid 図を多数含む。Mermaid を追加/変更したら **必ず** `scripts/validate.sh` で全 Mermaid をレンダリング検証する (OK/NG を報告)。NG があれば直してから次へ。`erDiagram` のキーは `PK` / `FK` / `UK` のみ (複数は `PK, FK`)。

### Step 6: drawio 編集 (特殊・高リスク)

drawio を触る前に **必ず** `references/drawio-editing.md` を `Read` する。要点:
- `yesman-aws-arch.drawio` は **フルスタック構想** (API Gateway / AgentCore / Aurora DSQL 等) を描く。実デプロイ MVP (CloudFront+S3+Lambda Function URL+Bedrock+MockStore) とは **別レイヤ**。変更がどちらの層に属するかを必ず仕分ける ([consistency-rules.md](references/consistency-rules.md) の 2 層原則)。
- 変更予定を箇条書きで出す → 既存 mxCell をコピーして id を変える → XML 妥当性を `python3 -c "import xml.etree.ElementTree as ET; ET.parse('...')"` で検証。
- `.png` はエクスポート成果物。drawio を編集したら **PNG は手動再エクスポートが必要** (再エクスポートできない場合は報告に明記)。
- 大規模レイアウト変更は無理に XML 直編集せず、`docs/architecture/update-needed.md` に手動更新指示を残す選択肢を取り、ユーザーに確認する。

### Step 7: 整合性検証

`references/consistency-rules.md` に従い、編集後に以下を確認:
- 03 の API ↔ 02 の api-client メソッド / ApiError reason が一致
- 05 のテーブル/enum ↔ README の ER 図 ↔ 03 のモデル表が一致
- env 変数 (5 つの `*_BACKEND` 等) が 01/03/04/README で一致
- 数値 (3 ペルソナ / 4 沈黙ドメイン / MAX_DRILL_DEPTH=4 / 5 環境変数切替) が全ファイルで一致
- 2 層 (MVP / フルスタック) の記述が 01/04/design-README/drawio で矛盾しない
- drawio に追加したボックス名と設計書の用語が揃う
- `scripts/validate.sh` が全 Mermaid + drawio XML で green

### Step 8: 完了報告

- 編集ファイル一覧 (行数差分)
- Mermaid / drawio 検証結果 (OK/NG)
- 整合性チェック結果
- 手動対応が必要な項目 (PNG 再エクスポート、drawio 手動更新等)

## 原則

- **整合 > 詳細**。一つだけ詳しくて他と食い違うのは害悪。
- **feature 記述を鵜呑みにしない**。コードと ADR で二重確認する。
- **コードを勝手に変えない**。設計が間違っていそうでも指摘に留める。
- **推測より確認**。feature が曖昧 / 更新先が複数候補 / drawio を壊しそう、はユーザーに問い返す。
- **drawio と PNG の不一致を放置しない**。少なくとも報告する。

## 関連ファイル

- `references/doc-anatomy.md` — 各ドキュメントの章立てと「変更タイプ → 該当箇所」対応 (Step 3 で必ず読む)
- `references/drawio-editing.md` — yesman の drawio を壊さず編集する手順 + 2 層の仕分け (drawio 前に必ず読む)
- `references/consistency-rules.md` — ドキュメント間クロスリファレンス規則 (Step 7 で参照)
- `scripts/validate.sh` — Mermaid レンダリング検証 + drawio/SVG XML 妥当性検証 (Step 5/7 で実行)
