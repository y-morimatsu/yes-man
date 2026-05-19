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

### 不変
- `application-design.drawio` 全 11 ページ: Network / Layered / Sequence / Strategy DI / UoW / CDK / ER 図はアーキテクチャ図のため Post-CONSTRUCTION 改修の影響なし、ただし application-level な依存追加 (U4 → U5 `PreferenceProfileRepository` 読み取り、`07c1c78`) は本 README で代替表記

→ FE-DESIGN-01 の "drawio as Source of Truth" 原則は維持、drift を本ファイルで明示的に追跡する運用。
