# クロスリファレンス整合性規則

複数ドキュメントに同じ事実が分散している。更新後 (SKILL.md Step 7) にこれらが揃っているか検証する。
「片方だけ詳しくて食い違う」状態は、古い片方が嘘になるので最も避けるべき。

## 1. API の整合 (03 ↔ 02 ↔ README)

- `03-backend §3.2` のエンドポイント (メソッド + パス) は、`02-frontend §2.6` の api-client メソッドと 1:1 対応する。
  - 例: `POST /v1/decisions/request/stream` ↔ `decisions.streamRequest()`、`GET /v1/scores/me` ↔ `scores.getMe()`。
- `03 §3.12` のエラー reason は `02 §2.6` の `ApiError.reason` 一覧に存在する (例: `decision_not_found`, `rejected_by_moderator`, `tts_throttled`)。
- API の req/res スキーマ (`03 §3.2`) は実 DTO (`apps/api/.../interface/http/dto/`) と矛盾しない。
- 新機能の API は README の「🚀 主要機能」にユーザー視点で 1 行現れる。

## 2. データモデルの整合 (05 ↔ README ↔ 03)

- `05 §5.2` のテーブル/フィールドは、README「🗂️ データモデル (ER 図)」の Mermaid erDiagram と一致する。
  - テーブル追加・フィールド追加・FK 変更は **両方** に反映する。
- `05 §5.3` の enum 値 (DomainClassification / UserChoice / SilenceDomain / PersonaSource 等) は実 `models.py` の Literal と一致する。
- `03 §3.8` のモデル概要表 (もしあれば) は 05 の正規定義と矛盾しない (03 はサマリ、05 が一次)。
- ER 図のキー記法: Mermaid は `PK` / `FK` / `UK` のみ。複合は `PK, FK`。

## 3. backend 切替 (Strategy + DI) の整合 (01 ↔ 03/04 ↔ README)

- 5 つの環境変数 `LLM_PROVIDER` / `STORAGE_BACKEND` / `AUTH_BACKEND` / `VOICE_BACKEND` / `EVENT_BACKEND` と、その取りうる値は次で一致する:
  - `01 §1.7` の env 表
  - `03` の各 factory 節 / `04 §4.2` の Lambda env
  - README「🛠️ 技術スタック」「🚀 ローカル起動」の早見表
- 新しい Adapter 実装を足したら、上記すべてに値を追加する (例: `LLM_PROVIDER` に新値)。

## 4. 数値の整合 (全ファイル)

同じ数値が複数箇所に出る。1 箇所変えたら全箇所を揃える:

| 数値 | 出現箇所 |
|---|---|
| 3 ペルソナ (慎重派/楽観派/効率派) | 01 §1.2, 03 §3.3, README コアコンセプト |
| 沈黙 4 ドメイン (宗教/選挙/暴力/卑猥) | 01 §1.2/§1.8, 03 §3.5, README |
| `MAX_DRILL_DEPTH = 4` | 03 §3.3, 01 §1.2 |
| 5 つの `*_BACKEND` env 切替 | 01 §1.7, design-README, README |
| ペルソナ最大 3 人選択 | 02, 03, 05 |
| ADR 件数 (docs/adr) | docs/adr/README |
| 設計書ドキュメント数 (01-05) | design/README 索引 |

## 5. 2 層アーキテクチャの整合 (01 ↔ 04 ↔ design-README ↔ drawio)

YesMan は **実デプロイ MVP** と **フルスタック構想** の 2 層を持つ。この区別を全ドキュメントで保つ:

| 層 | 一次ドキュメント | 内容 |
|---|---|---|
| 実デプロイ MVP | `04 §4.2`, `01 §1.6` | CloudFront + S3 + Lambda Function URL + Bedrock Gemma + MockStore/S3 + mock 認証 |
| フルスタック構想 | `04 §4.5`, `yesman-aws-arch.drawio` | ECS/API GW/AgentCore + Aurora + Cognito + EventBridge |

- `design/README` の「2 層のアーキテクチャ観」節がこの定義の正本。ここを変えたら 01/04 も合わせる。
- **MVP の変更を構想図 (drawio) に混ぜない / 構想を MVP 設計書に書かない**。
- README「🏗️ アーキテクチャ」がどちらを指すか曖昧にしない。

## 6. 用語の統一

- ペルソナ系統の呼称: 「プリセット (builtin)」「知り合い (匿名共有プール / anonymous)」「カスタム (自作 / my)」。過去に「匿名」→「知り合い」へリネームした経緯があるため、UI 文言は「知り合い」に統一。
- 委任度スコアは **Yes 比率モデル** (高いほど委任できている)。「No 比率」表現は古い (反転済み)。
- service_catalog は各カテゴリ **Amazon 系を第一候補**。
- アバターは `yesman-avatar:<base64(JSON)>` 符号化で全画面統一表示。

## 7. ADR との整合 (docs/adr → 設計書)

- ADR は決定の履歴。設計書はその決定の「現在の姿」。新 ADR が採択されたら、その Decision/Consequences が指す設計書箇所を更新する。
- ADR が `Superseded` の決定は、設計書には **置き換え後の姿だけ** が載る (古い決定は ADR にのみ残す)。
- 本スキルは ADR を新規作成しない (参照のみ)。

## 検証の実務

- Mermaid: `scripts/validate.sh` で全 `.md` の Mermaid をレンダリング検証。
- drawio/SVG: 同スクリプトで XML 妥当性検証。
- API/モデル/env/数値の一致は grep で突き合わせる。例:
  - `grep -rn "MAX_DRILL_DEPTH\|もっと絞る\|depth" docs/design README.md`
  - `grep -rn "STORAGE_BACKEND\|LLM_PROVIDER" docs/design README.md`
- 不一致は その場で直すか、残タスクとして報告する。
