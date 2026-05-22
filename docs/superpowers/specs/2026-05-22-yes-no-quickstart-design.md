# YES/NO Quick-Start (DecisionPage 入力簡素化)

**Spec ID**: 2026-05-22-yes-no-quickstart
**Phase**: Post-CONSTRUCTION 改修 v3
**Status**: 🟡 Requirements Analysis (Revised draft v2 — AI pre-generation 仕様追加、awaiting approval)
**Author**: y-morimatsu (AI-assisted, Claude Opus 4.7)
**Related units**: U4-decision (Pre-generation script) / U7d-features (DecisionPage UI + generated JSON consumer)

---

## 1. Background / Motivation

現状 `DecisionPage` の初期表示は「自由テキスト入力 + 送信 / 音声」のみで、ユーザは毎回「何を 決めますか?」を能動的に思考する必要がある。

ハッカソンの体験コンセプト「YES で承認するだけ」と相反する摩擦点となっており、特に **想像力・タイピング負荷が高い疲労時のユーザ** にとっては入口での離脱要因となる。

本改修では「**人間最後の仕事は YES で承認すること**」の体験を入口から徹底するため、初期画面で **時間・シチュエーションに応じた質問候補を提示し、YES/NO だけで決定対象を確定できるフロー** を追加する。

候補質問は **runtime ではなく事前 (build-time) に AI (Bedrock LLM) で生成** し、JSON として checked-in する。これにより:

- runtime LLM コスト・レイテンシ ゼロ (UX 一貫性 / cold-start 高速)
- 手書き template より自然な日本語・多様なバリエーション
- 必要時に再生成 script を実行することで pool を更新可能

## 2. Functional Requirements

### FR-QS-01: 起動時の Quick-Start 質問提示

`DecisionPage` の初期 (`status === "idle"`) 状態では、テキスト入力欄ではなく **「~~してみますか?」形式の YES/NO 質問カード** を表示する。

- 質問文は **事前 (build-time) に Bedrock LLM で生成済みの template pool** から、時刻帯 + 曜日 + ユーザ嗜好に基づき選定 (詳細: §6)。
- runtime での LLM 呼び出しは行わない (JSON は client bundle に embedded)。
- 候補は優先度順に 1 件ずつ提示。
- 直近 24h 以内に「YES」採択された質問 id は候補から除外し、繰り返し提案を防ぐ。

### FR-QS-02: YES / NO 操作の semantics

- **YES**: 表示中の質問を `decision.user_input` として確定し、既存の合議フロー (`/v1/decisions/stream` SSE) を起動する。以後は既存 `DecisionResult` フローに合流。
- **NO**: 「この質問じゃない」を意味し、次の候補質問を提示する。NO カウンタを +1 する。

### FR-QS-03: テキスト fallback (5 回 NO ルール)

ユーザが **連続 5 回 NO** を選択した場合、Quick-Start カードを閉じて **従来のテキスト入力欄 + 音声ボタン** に切り替える。

- カウンタは page reload で reset。
- 一度 textbox に切り替わった後は同 session 中は Quick-Start に戻らない (UX 一貫性)。
- textbox 表示時には小さな「💭 おまかせ提案を試す」 link を併設 (任意で Quick-Start に戻れる脱出口)。

### FR-QS-04: Quick-Start からの「テキスト入力に切替」操作

5 回未満でも、ユーザが能動的に textbox に切り替えたい場合のため、Quick-Start カード下に **「✏️ 自分で入力する」link** を常設。クリックで即 fallback。

### FR-QS-05: 既存合議フローへの完全互換

YES 確定後の挙動 (proposal 生成 / utterance bubbles / Yes/No 採択 / Score 計算) は **一切変更しない**。Quick-Start は input の「入口」だけを置き換える純粋な UI 拡張。

## 3. Non-Functional Requirements

### NFR-QS-01: パフォーマンス

- 初期質問表示は **API 呼び出しなし** で実現する (`<150ms` 描画)。Template は client-side embedded で OK。

### NFR-QS-02: アクセシビリティ

- YES/NO ボタンは min-height 48px、両者の色コントラスト ≥ 4.5:1。
- 質問カードは `aria-live="polite"` で screen reader にも変更を通知。
- キーボード操作: Y キー = YES、N キー = NO の shortcut を提供 (`<kbd>` hint 併記)。

### NFR-QS-03: テスタビリティ

- 質問選定ロジックは **pure function** として分離 (current time / day-of-week / recent_yes_inputs を引数に取り、`Question | null` を返す)。
- 「現在時刻」は injectable な `now` 関数で差し替え可能にし、unit test で時刻依存挙動を verify する。

## 4. User Stories (Journey 拡張)

既存 Journey A (合議 happy path) に新規プレシーケンス Journey A-Quick を追加。

| ID | Story | 採用条件 |
|---|---|---|
| A-Quick-1 | ユーザとして、起動時に「今日のランチ?」のような YES/NO 質問が出てほしい (タイピング不要) | FR-QS-01 |
| A-Quick-2 | YES を押したらそのまま合議が始まり、3 ペルソナの議論が見える | FR-QS-02 |
| A-Quick-3 | 提示された質問が違うとき、NO で次候補に切替できる | FR-QS-02 |
| A-Quick-4 | 5 回連続で違うとき、テキスト入力に切替されて自由に入力できる | FR-QS-03 |
| A-Quick-5 | Quick-Start が邪魔なときは即 textbox に切替できる | FR-QS-04 |

## 5. UX Flow

```
[起動]
   │
   ▼
[status=idle / qs_no_count=0]
   │
   ├─[Quick-Start カード表示]
   │    質問: 「{title} してみますか?」
   │    [✅ YES]     [❌ NO]
   │    └─ ✏️ 自分で入力する
   │
   ├──YES──▶ user_input = title → 既存 stream() ▶ DecisionResult
   │
   ├──NO──▶ qs_no_count += 1
   │        ├─ count < 5 → 次候補表示
   │        └─ count == 5 → textbox fallback (永続)
   │
   └─自分で入力する──▶ textbox fallback
```

## 6. Question Template Pool (AI Pre-generated)

時刻 (24 帯 / 帯域指定) × 曜日種別 (平日 / 週末 / 任意) × 直近 user 嗜好の 3 軸で template を引く。template の本文は **build-time に Bedrock LLM で生成** され、JSON として checked-in される。

### 6.1 Template スキーマ

```typescript
interface QuickStartTemplate {
  id: string;                  // 一意 ID (履歴 dedupe key、kebab-case、生成時に LLM が命名)
  title: string;               // 質問本文 (例: "今日のランチ" — 末尾の "してみますか?" は UI 側で付与)
  /** 表示条件: 時刻帯。空配列はどの時刻でも表示可 */
  hours: number[];             // 0-23
  /** "weekday" | "weekend" | "any" */
  dayKind: "weekday" | "weekend" | "any";
  /** persona_style_preference 上位による補正 (省略可) */
  preferenceTag?: string;
  /** 同時刻帯内での相対優先度 (高いほど先) */
  priority: number;
}

interface QuickStartTemplatePool {
  /** 生成 metadata */
  generatedAt: string;         // ISO8601
  generatedBy: string;         // 例: "anthropic.claude-sonnet-4-6-20250929-v1:0"
  schemaVersion: 1;
  /** 候補 template 一覧 (推奨 25-40 件) */
  templates: QuickStartTemplate[];
  /** 全件除外時の catch-all (常に最後の候補として使用) */
  catchAll: QuickStartTemplate;
}
```

### 6.2 生成例 (実物は AI で生成、本表は形式参考)

| ID | title | hours | dayKind | priority |
|---|---|---|---|---|
| `lunch-weekday` | 今日のランチ | 11-14 | weekday | 90 |
| `lunch-weekend` | 今日のランチ | 11-14 | weekend | 90 |
| `dinner` | 今夜の夕食 | 17-21 | any | 90 |
| `morning-coffee` | 朝のコーヒー or 紅茶 | 6-10 | any | 80 |
| `weekend-outing` | 週末の外出先 | 9-12 | weekend | 85 |
| `late-snack` | 夜食 | 22, 23, 0, 1, 2 | any | 70 |
| `tomorrow-outfit` | 明日 着る 服 | 19-23 | any | 65 |
| `weekend-movie` | 週末に 観る 映画 | 18-23 | weekend | 75 |
| `meeting-followup` | この後の進め方 | 14-17 | weekday | 60 |
| ... (~25-40 件 / Bedrock 生成) | | | | |
| `random` (catchAll) | 今 もっとも 気になっていること | 0-23 | any | 10 |

実際の pool は §6.4 の script で生成され、`apps/web/src/features/decision/quickStartTemplates.generated.json` に保存される。

### 6.3 選定アルゴリズム (runtime / pure function)

```
1. 現在時刻 H・曜日 D を取得 (NFR-QS-03 で injectable)
2. 候補 = templates から hours/dayKind に合致するもの
3. 直近 24h で YES 採択された template.id を除外 (localStorage)
4. 過去 session で連続 NO した id は同 session 末尾に re-queue
5. priority 降順 + tie-break で stable な順序を持つ queue を構築
6. user YES/NO に応じて 1 件ずつ pop
7. queue 空 → catchAll を提示 (それでも NO なら fallback ロジック §FR-QS-03 に従う)
```

### 6.4 Pre-Generation Script

#### 配置
- `apps/api/scripts/generate_quick_start_templates.py` (Bedrock 呼び出し)
- 出力先: `apps/web/src/features/decision/quickStartTemplates.generated.json`

#### 仕様

- 実行: `uv run python apps/api/scripts/generate_quick_start_templates.py [--count N] [--out PATH] [--model MODEL_ID]`
- 既定 model: `anthropic.claude-sonnet-4-6-20250929-v1:0` (既存 LLM 接続と統一)
- 既定 count: 30
- 既存の `apps/api/src/yesman_api/infrastructure/llm/*` の Bedrock client を再利用
- prompt: 「YesMan の哲学 (人間最後の仕事は YES で承認すること) に沿う、日常の小さな決定を YES/NO で促す質問を N 件、JSON で生成せよ」
- LLM 出力を **JSON Schema (Pydantic Model) で validate** し、不正な場合はリトライ (max 3 回)
- 生成結果は決定論的にならないが、`schemaVersion`/`generatedAt`/`generatedBy` を埋め込みトレーサビリティ確保
- script 実行は **dev のみ** (CI 自動実行は v1 では行わない、OI-6 参照)

#### Idempotency

同じ JSON を再生成した場合でも、`id` が同一なら client 側 localStorage の dedupe state (直近 YES 採択 id) は維持される。`id` 命名は LLM に kebab-case ASCII (例: `weekend-cafe-visit`) を要求し、可読性 + 安定 dedupe を担保。

#### Build-time の checked-in 戦略

- `quickStartTemplates.generated.json` は **git に commit される** (ハッカソン pragmatism: 確定的なバンドル / cold-start 高速)
- ファイル top に LLM 生成 metadata を含むので、PR レビュー時に diff から品質 review 可能
- 再生成手順は `README.md` に追記

## 7. UI 設計 (Mockup)

```
+--------------------------------------------------+
| 何を きめますか？                                |
|                                                  |
|  +--------------------------------------------+  |
|  | 💭 今日のランチ                            |  |
|  |    してみますか？                          |  |
|  |                                            |  |
|  |  [  ❌ NO  ]      [  ✅ YES  ]            |  |
|  |                                            |  |
|  |  Y キー = YES / N キー = NO                |  |
|  +--------------------------------------------+  |
|                                                  |
|         ✏️ 自分で入力する                        |
|                                                  |
| ▼ NO {n}/5 ─────────────────                    |
+--------------------------------------------------+
```

- カード: rounded-2xl border-2 brand-600、bg-cream
- YES: coral `#E8775A` solid (既存 primary button と統一)
- NO: white + border (negative なので押しやすく)
- 進捗 indicator: NO 1〜4 は薄く `▼ NO 1/5` 表示、5 で fallback 切替

## 8. Data Model 影響

**新規テーブル不要**。template は client-side embedded。

ただし、後続改修 (v2) で「YES 採択された Quick-Start の dedupe」を実現するため、`Decision` レコードに **`source` カラム** (`"text" | "voice" | "quickstart"`) を追加する余地を残す (今回 scope 外、後述)。

## 9. API 変更

**変更なし** (FR-QS-05 互換性)。Quick-Start で確定した質問は通常通り `POST /v1/decisions/stream` の `user_input` に渡るのみ。

## 10. 影響範囲

| Unit | 変更内容 | 規模 |
|---|---|---|
| **U4-decision** (新規 script) | `apps/api/scripts/generate_quick_start_templates.py` (Bedrock 経由 build-time 生成) | 新規 ~180 LOC |
| **U4-decision** (test) | `apps/api/tests/scripts/test_generate_quick_start_templates.py` (Bedrock mock + JSON schema validate) | 新規 ~100 LOC |
| **U7d-features** (生成 asset) | `apps/web/src/features/decision/quickStartTemplates.generated.json` (checked-in、~30 件) | 新規 (生成物) |
| **U7d-features** (DecisionPage) | Quick-Start カード組込 / fallback ロジック / strings 拡張 | 改修 ~+150 LOC |
| **U7d-features** (新規 component) | `QuickStartCard.tsx` + `useQuickStart.ts` (state + queue) | 新規 ~150 LOC |
| **U7d-features** (新規 module) | `quickStartTemplates.ts` (json import + 選定 pure function + 型定義) | 新規 ~120 LOC |
| **U7d-features** (test) | `quickStartTemplates.test.ts` + `useQuickStart.test.tsx` + `QuickStartCard.test.tsx` | 新規 ~300 LOC |
| **U7d-features** (e2e) | `tests/e2e/tests/quick-start.spec.ts` 新規 3 シナリオ | 新規 ~80 LOC |
| **U7d-features** (DecisionPage.test.tsx) | 初期 render 期待値更新 (textbox → QuickStartCard) | 軽微 |
| **README.md** | 「QuickStart template の再生成手順」セクション追加 | 軽微 (~+20 行) |

## 11. Out of Scope (今回やらない)

- **runtime LLM 呼び出し** (v1 は build-time 生成 + checked-in JSON で完結)
- **CI での自動再生成** (v1 は手動 script 実行のみ、OI-6 参照)
- **位置情報・天気・カレンダー連携** によるシチュエーション拡張
- **過去履歴学習** による template 並び替え (priority 固定 + persona_style_preference 軽微補正のみ)
- `Decision.source` カラム追加と analytics (将来の dedupe / 効果測定向け、別 spec)
- 「直近 24h YES 除外」のサーバ側 query 実装 (v1 は client-side で `localStorage` に直近 YES の `template.id` を保存して dedupe)
- ユーザごとの **personalized template pool** (v1 は全 user 共通 pool、persona_style_preference による軽微 priority 補正のみ)

## 12. Open Issues / Decisions to Confirm

下記は user 承認時に最終確定したい設計判断:

| # | 項目 | 提案 | 代替 |
|---|---|---|---|
| OI-1 | 5 回ルールの解釈 | **連続 5 回 NO** で fallback | 累積 5 回 NO (session 通算) |
| OI-2 | catch-all `random` の扱い | priority 10 で常に末尾、user は最終手段としてアクセス | 削除し、queue 終端で自動 fallback |
| OI-3 | キーボード shortcut Y/N | NFR で必須 | shortcut 不要、ボタンのみ |
| OI-4 | session 間の NO カウンタ永続化 | reload で reset | localStorage 永続 |
| OI-5 | textbox fallback 時の Quick-Start 復帰 | session 中は復帰不可、reload で再表示 | いつでも復帰 link 提供 |
| **OI-6** | **template 生成 script の運用** | **手動実行 + checked-in JSON** (ハッカソン pragmatism) | (a) CI 定期実行 / (b) runtime API endpoint 化 / (c) 起動時 prefetch |
| **OI-7** | **生成件数** | **30 件 (時刻帯 + 曜日 + catch-all を十分カバー)** | 15 / 50 / 100 |
| **OI-8** | **生成 model** | **`anthropic.claude-sonnet-4-6-20250929-v1:0` (既存 LLM 接続と統一)** | Opus 4.7 (品質優先・コスト高) / Haiku 4.5 (安価・品質低) |

## 13. Acceptance Criteria (本仕様完成時の verification)

### UI / 挙動
- [ ] 起動時に「~~してみますか?」形式の YES/NO カードが表示される
- [ ] YES で既存合議 SSE が走り、DecisionResult に proposal が出る
- [ ] NO で次候補に切替、4 回目までは Quick-Start 維持
- [ ] 5 回連続 NO で textbox に切替、reload まで Quick-Start 非表示
- [ ] 「✏️ 自分で入力する」 link でいつでも textbox に切替可
- [ ] 11-14 時の平日に「今日のランチ」相当の template が最初に出る (template 選定 pure function test、template 名は AI 生成済 JSON 依存)
- [ ] 過去 24h に YES 採択した template.id は再提示されない
- [ ] Y/N キーボード shortcut で YES/NO を選択できる

### Pre-Generation Script
- [ ] `uv run python apps/api/scripts/generate_quick_start_templates.py --count 30` が正常終了し、JSON が出力される
- [ ] 出力 JSON は `QuickStartTemplatePool` schema に validate される (Pydantic)
- [ ] 出力 JSON top に `generatedAt` / `generatedBy` / `schemaVersion` が含まれる
- [ ] LLM が不正 JSON を返した場合に max 3 回 retry し、それでも失敗すれば exit 1 + 明確な error message を出す
- [ ] unit test で Bedrock client を mock し、生成 → schema validate → 書き込みのフローを検証

### Integration
- [ ] checked-in `quickStartTemplates.generated.json` が web build に bundle され、runtime で LLM 呼び出しが発生しない (network panel で確認)
- [ ] e2e: 新規 spec で 3 シナリオ (YES happy / 3-NO / 5-NO fallback) PASS

---

**Next step**: 本 spec の approval 後に、`docs/superpowers/plans/2026-05-22-yes-no-quickstart.md` (実装計画) を作成し、Code Generation に進む。
