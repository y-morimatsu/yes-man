# Diagrams (drawio) — INCEPTION フェーズ + Post-CONSTRUCTION 改修注記

本ディレクトリは INCEPTION フェーズ (2026-05-09 〜 2026-05-10) で生成された drawio 図表の **Source of Truth** を保持。FE-DESIGN-01 (INCEPTION drawio as Source of Truth) に基づき、frontend 実装はこれら drawio に従う。

## ファイル一覧

| ファイル | ページ数 | 内容 | 最終更新 |
|---|---:|---|---|
| `application-design.drawio` | 11 | Network Topology / Layered Architecture / 6 シーケンス図 / Strategy DI / UoW / CDK Stack Order / ER 図 | 2026-05-09 (INCEPTION 承認) |
| `ui-mockups.drawio` | 9 | 01 画面ツリー / 02 Onboarding / 03 Decision / 04 NoBurst / 05 Silence / 06 Score Dashboard / 07 Persona / 08 Design System / 09 Discussion | 2026-05-19 (Post-CONSTRUCTION 注記反映) |

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

CONSTRUCTION 完了 (2026-05-16) 以降の実装変更を drawio に反映した内容:

### ui-mockups.drawio
| 修正対象 | 修正前 | 修正後 | commit |
|---|---|---|---|
| Splash 「→ スワイプして同意」(p2_p0_action) | 表示あり | **削除** | `28c8adc` |
| Splash disclaimer 内の「主体性スコア」 | `「主体性スコア」「沈黙演出」` | `「委任度スコア」「沈黙演出」` | `317280b` |
| Decision page スコア表記 (p3_p3_score) | `主体性スコア: 8% ↓` | `委任度スコア: 92% ↑` | `317280b` |
| Score Dashboard ページタイトル (p6_title) | `主体性スコア・ダッシュボード` | `委任度スコア・ダッシュボード` | `317280b` |
| Score Dashboard ヘッダ (p6_hdr) | `← Home          主体性スコア` | `← Home          委任度スコア` | `317280b` |
| Score Dashboard 大% 表示 (p6_score_big) | `8%` (#FFA726 orange) | `92%` (#9F88C8 purple、INCEPTION スクリーン-04 準拠) | `317280b` + `2400f45` |
| Score Dashboard label (p6_score_label) | `No 回数 / 総決定回数` | `Yes 回数 / 総決定回数` | `317280b` |
| Score Dashboard chart text (p6_chart_text) | `下降トレンド (望ましい)` | `上昇トレンド (望ましい / Yes 比率モデル)` | `317280b` |
| Score Dashboard 注記 (p6_note) | `主体性スコアが「低い」ほど AI が褒めてくる` | `委任度スコアが「高い」ほど AI が褒めてくる (Yes 比率モデル)` | `317280b` |

### 未反映 (drawio 拡張候補、Post-CONSTRUCTION で実装のみ追加)
以下の機能は **実装には反映済**だが drawio mockup には未反映 (drawio の絵としての visual 表現を追加する優先度が低いため):

- **Voice backend toggle UI** (Profile page の radio セクション、`775f6a5`) — Profile page mockup は drawio で未定義
- **Dynamic Persona Routing 💡 おすすめ badge** (PersonaSelectionPage、`07c1c78`) — Persona Management page (`07_Persona_Management`) には badge 未表示、ただし screens/06-persona-pool.svg には反映済
- **`usePrefetchedDecisions` 動作** (No 連打 prefetch buffer、`2b08a75`) — visual difference なし
- **ScoreLineChart 30 日 trend** (`2400f45`) — drawio の Score Dashboard page p6_chart_text で簡易表現済

### 不変 (v1 時点)
- `application-design.drawio` 全 11 ページ: Network / Layered / Sequence / Strategy DI / UoW / CDK / ER 図はアーキテクチャ図のため Post-CONSTRUCTION 改修の影響なし、ただし application-level な依存追加 (U4 → U5 `PreferenceProfileRepository` 読み取り、`07c1c78`) は本 README で代替表記

→ FE-DESIGN-01 の "drawio as Source of Truth" 原則は維持、drift を本ファイルで明示的に追跡する運用。

---

## Post-CONSTRUCTION 改修注記 v2 (2026-05-22) — Pack A + Decision History

PR #15 (Demo UX Polish Pack A、`a731786` merged) と feature/web-score-decision-history ブランチ (Decision History 機能) の visual 仕様変更を追跡。

### 新規 drawio (本 README の管轄外、spec 配下)

本 v2 改修分の drawio mockup は **spec 配下に別管理** されている (AI-DLC 形式の inception drawio を肥大化させず、feature 単位で spec drawio を持つ運用):

| Spec drawio | ページ数 | 内容 | commit |
|---|---:|---|---|
| [`docs/superpowers/specs/diagrams/2026-05-21-splash-signin-screens.drawio`](../../../../docs/superpowers/specs/diagrams/2026-05-21-splash-signin-screens.drawio) | 4 | SplashPage / SignInPage redesign mockup | `a0ea19d` (PR #11) |
| [`docs/superpowers/specs/diagrams/2026-05-20-mock-auth-screens.drawio`](../../../../docs/superpowers/specs/diagrams/2026-05-20-mock-auth-screens.drawio) | — | Mock auth login/register/logout flow | `ce686fa` (PR #9) |
| [`docs/superpowers/specs/diagrams/2026-05-22-score-decision-history-screens.drawio`](../../../../docs/superpowers/specs/diagrams/2026-05-22-score-decision-history-screens.drawio) | 2 | **Decision History**: ScorePage 全体 + DecisionHistoryItem 詳細 (truncate / 空状態 / 採用回数バリアント) | feature/web-score-decision-history |

### ui-mockups.drawio (本 README 管轄、v2 では未反映)

v2 改修の以下の visual 変更は **本 drawio に未反映** (理由: spec drawio 側に集約済、本 drawio の page を増やすメリットが薄い):

- **Pack A #1 Score 煽り文**: Score Dashboard ページ (p6) の AI コメント表記が「うまく まかせられて いますね」→「過去 30 日、決定の N% を YesMan に委ねました。…」に変更 — 代替表現として `screens/04-score-dashboard.svg` に反映済
- **Pack A #2 Home Summary カード**: Home Hub (`/`) の nav カード上部に Summary カード追加 — Home Hub mockup が本 drawio には存在しないため未追加 (将来 `07-home-hub.svg` 新規候補)
- **Pack A #3 SSE thinking chips**: Discussion Live ページ (p9) の LIVE badge 上に 3 persona chips 追加 — `screens/02-discussion-live.svg` に反映済
- **Pack A #4 Yes confetti**: 提案カード Yes 採択時の画面全体 confetti — dynamic animation のため static drawio では非表現
- **Decision History**: Score Dashboard ページ (p6) の下部に履歴セクション追加 — `screens/04-score-dashboard.svg` を viewbox 280×880 に拡張済、本 drawio の Score Dashboard page は不変

→ 本 v2 改修の visual reference は **spec drawio + screens SVG が Source of Truth**。`ui-mockups.drawio` は v1 時点の design snapshot として保持される (`drift` を本ファイルで追跡)。
