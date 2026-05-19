# Unit of Work 計画 / Unit of Work Plan

**プロジェクト**: YesMan
**作成日**: 2026-05-09
**Phase**: Units Generation - Part 1: Planning

> **📌 Post-Approval Update Notice (2026-05-09T05:15:00Z → 2026-05-10 更新)**
>
> 本計画書は Units Generation Part 1 の Q&A スナップショットです。承認後、以下の変更が反映されています:
> - FR-PERSONA (3.11) 追加に伴い、ユニットが **11 → 12 (U-Persona 追加)**、ストーリーが **25 → 32** に増加
> - FR-CV (3.12) 追加 (2026-05-10) に伴い、ストーリーが **32 → 34** (Journey B B7・B8) に増加
> - 本気のサービスとしての方針整合化 (2026-05-10): 「罪悪感」「逆説的」等の satire 用語を「再考」「委任度」に統一
>
> 最新内容は [unit-of-work.md / unit-of-work-dependency.md / unit-of-work-story-map.md](../application-design/) を参照してください。本ファイルは Q&A の歴史的記録として保持されます。

---

## 0. 前提

- Application Design 承認済 — Python/FastAPI on ECS Fargate + Aurora Serverless v2 + Strategy+DI
- User Stories 承認済 — 25 ストーリー × 6 Journey + Internal/Dev
- Workflow Planning 推奨ユニット: U1〜U7 (確認用初期案)
- 開発体制: 2〜3 名フルスタック、ハッカソン期限約 1 ヶ月

---

## 1. ユニット分解の方針への質問

以下に **`[Answer]:`** タグへ A/B/C... または自由記述で回答してください。

---

### Question 1: ユニット = サービス? モジュール?
ユニットの実体は何にしますか？

A) **モジュラー・モノリス**: API は単一 FastAPI コンテナ (1 デプロイ単位)、内部にモジュール (auth/decision/learning/voice/storage) を分けて並列開発。**サービス分割なし**
B) **マイクロサービス分割**: ユニットごとに独立した FastAPI コンテナをデプロイ (ECS Service が複数)
C) **API は 1 コンテナ + 非同期 Worker のみ別コンテナ** (Hybrid)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 2: Workflow Planning 推奨ユニット (U1〜U7) の妥当性
Workflow Planning では以下を推奨しました：

```
U1 Infrastructure (CDK)
U2 Storage & History
U3 Auth & Profile
U4 Decision (合議+LLM+沈黙ガード)
U5 Learning (嗜好プロファイル)
U6 Voice
U7 Frontend PWA
```

これを正式ユニットとして採用しますか？

A) **そのまま採用** (U1〜U7)
B) **修正して採用** (Other で修正案を記述)
C) **再構成**: 別の分け方を提案してほしい (粒度・名前など Other で指定)
X) Other (please describe after [Answer]: tag below)

[Answer]: U7 Frontend PWAを細分化する

---

### Question 3: モノレポ内のディレクトリ構造
モノレポのトップレベルディレクトリはどう構成しますか？

A) **`apps/` + `packages/` + `infra/`** (Turborepo 標準)
```
yesman/
├── apps/
│   ├── web/           (React PWA)
│   └── api/           (FastAPI コンテナ)
├── packages/
│   ├── shared-types/  (OpenAPI 自動生成型)
│   ├── ui/            (共有 UI コンポーネント)
│   └── eslint-config/
├── infra/             (AWS CDK)
└── docker-compose.yml
```

B) **`frontend/` + `backend/` + `infrastructure/`** (シンプル平坦)
C) **DDD レイヤード**: `domains/`, `interfaces/`, `infrastructure/`
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 4: Backend (FastAPI コンテナ) 内部構造
コンテナ内 (`apps/api/`) のディレクトリ構成は？

A) **DDD ライク (Hexagonal)**:
```
apps/api/
├── src/
│   ├── domain/         (Entity, ValueObject)
│   ├── application/    (Service, UseCase)
│   ├── infrastructure/ (Repository 実装, Adapter)
│   ├── interfaces/     (FastAPI Router, DTO)
│   └── main.py         (DI 起動)
├── alembic/            (migrations)
└── pyproject.toml
```

B) **モジュール per 機能 (Vertical Slice)**:
```
apps/api/
├── src/
│   ├── auth/
│   ├── decisions/
│   ├── learning/
│   ├── voice/
│   ├── shared/
│   └── main.py
├── alembic/
└── pyproject.toml
```

C) **FastAPI 公式チュートリアル形 (Flat + routers)**
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 5: ユニット間共有コード
ユニット間で共有するコードはどう扱いますか？

A) **`packages/shared-types/`** (TS) と **共有 Python パッケージ** (`apps/api/src/shared/`) の両方で型・ドメインモデルを共有
B) **OpenAPI スキーマを唯一の真実** とし、フロント・バックともに自動生成 (TS = openapi-typescript / Python = Pydantic)
C) **手動同期** (規模が小さいうちは OK)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 6: ユニットの並列度・担当割当
2〜3 名フルスタックでの担当方針は？

A) **完全に流動的** (誰がどこを触ってもよい、PR レビューで品質担保)
B) **ユニット担当制** (1 ユニット = 1 オーナー、他の人もコミット可能)
C) **フロント担当 + バック担当 + インフラ担当の役割分担**
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

### Question 7: Internal/Dev (Journey F) のユニット位置づけ
Journey F (設定切替) のストーリーはユニット定義にどう反映しますか？

A) Journey F は **U1 (Infrastructure) と U-API 内のモジュール** に解消（独立ユニット化しない）
B) Journey F を **独立ユニット U-Config** として立てる
C) Journey F は要件として各ユニットに横串で適用 (cross-cutting concern)
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 8: 非同期 Worker のユニット位置づけ
EventBridge → API Destinations → ECS HTTP の非同期処理は？

A) **同じ FastAPI コンテナ** で `/internal/events/*` を受ける (専用 Worker なし)
B) **専用 Worker コンテナ** を立てる (別ユニット U-Worker)
C) Web から見えない **Internal-only ECS Service** として独立
X) Other (please describe after [Answer]: tag below)

[Answer]: A

---

### Question 9: テストユニット
テストはどう構成しますか？

A) 各ユニット内の `tests/` ディレクトリで完結 (per-unit test)
B) **独立テストユニット U-Test** を立てて E2E と PBT を集約
C) 単体テストはユニット内、E2E は独立
X) Other (please describe after [Answer]: tag below)

[Answer]: B

---

### Question 10: 命名規約
ユニット名の表記は？

A) **U1, U2, ...** (番号、Workflow Planning と同じ)
B) **kebab-case の意味のある名前** (`infra`, `api`, `web`, `shared-types` など)
C) **両方**: ユニット ID (U1) + ディレクトリ名 (`infra`)
X) Other (please describe after [Answer]: tag below)

[Answer]: C

---

## 2. 実行ステップ (承認後に Part 2 で実行)

- [ ] `aidlc-docs/inception/application-design/unit-of-work.md` を作成（ユニット定義 + 責務 + コード組織化戦略）
- [ ] `aidlc-docs/inception/application-design/unit-of-work-dependency.md` を作成（ユニット間依存マトリクス + 並列実行可否）
- [ ] `aidlc-docs/inception/application-design/unit-of-work-story-map.md` を作成（25 ストーリー × ユニット マッピング、すべての Story がいずれかのユニットに紐付くことを保証）
- [ ] ユニット境界・依存・カバレッジを検証
- [ ] レビュー用サマリ提示

---

## 3. 完了したら

すべての `[Answer]:` を埋めたら「**完了**」「**done**」と教えてください。回答を分析し、矛盾・曖昧性があれば追加質問、なければ承認プロンプトを表示します。

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本 plan 本体は 2026-05-10 当時の Unit of Work 生成計画 Snapshot を保持 (12 ユニット: U1〜U7d + U-Persona + U-Test、依存マトリクス + Story Map 完備)。

### Unit 境界の見直しなし
Post-CONSTRUCTION で発生した 11 commit はいずれも既存 unit 境界の内側で完結し、unit 数 (12) / 責務分担 / 依存マトリクスに変更なし。

### 新依存 edge の追加 (unit 内 logic 拡張)
- U4 (decision) → U5 (learning): `PreferenceProfileRepository` 読み取り依存追加 (`07c1c78`)

詳細は `aidlc-docs/inception/application-design/unit-of-work.md` 末尾の「Post-CONSTRUCTION 改修注記」参照。
