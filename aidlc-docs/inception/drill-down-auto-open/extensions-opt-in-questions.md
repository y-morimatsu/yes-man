# drill-down-auto-open — Extensions Opt-In 質問

**Workflow**: AI-DLC INCEPTION / Requirements Analysis (Extension Opt-In, Step 5.1)
**Created**: 2026-05-26
**Status**: 回答待ち

CLAUDE.md 規定 (`requirements-analysis.md` Step 5.1) に従い、`.aidlc-rule-details/extensions/` 配下の 5 つの extension について opt-in を確認します。回答結果は `aidlc-docs/aidlc-state.md` の `## Extension Configuration` に記録され、各 enabled extension の full rules が deferred load されます。

---

## 推奨案 (本 feature と既存 project の整合観点)

| Extension | 私のおすすめ | 理由 |
|---|---|---|
| Visual Supplements (補助図) | **C (No)** | 本 feature は **既存 UI の Yes button handler に 1 行追加** + LLM prompt 1 文修正のみ。新規 flow / アーキ / 画面なし → drawio 補助図は coverage 過剰 |
| Frontend Design (FE デザイン規律) | **A (Yes)** | 既存 yesman 全体で INCEPTION drawio / SVG canonical + Crimson Pro / Noto Serif JP / 既存 color palette を厳密遵守しており、整合維持が必要 |
| Security Baseline (セキュリティ) | **A (Yes)** | 外部 service URL を新タブで open するため `rel="noopener noreferrer"` 等の最低限の安全策が必須 (現状 CTA button は既に対応済) |
| Property-Based Testing (PBT) | **C (No)** | drill-down handler は state machine ではなく単純な分岐。pure function なし、serialization round-trip なし → coverage 過剰 |
| Construction Flow (CF) | **B (Partial)** | 本 feature 規模 (Code Generation 1 file 1-2 関数) だと parallel sub-agent / approval gating は overkill だが、explore + review は適用したい |

最終判断は user にお任せします。違う方針なら回答時に明示してください。

---

## Question 1: Visual Supplements (補助図) Extension

本 project において、**Visual Supplements ルール** (Inception / Construction フェーズの設計時に、Markdown だけでは伝わらない場合に drawio / HTML の補助図を必須化するルール — 特に flow / アーキ図 / UI 設計で重要) を強制しますか?

A) **はい — すべての VIS-SUPP ルールを blocking 制約として強制する** (非自明な flow / アーキ / UI を持つ project に推奨。Markdown / Mermaid だけでは空間レイアウト・複数アクター順序・視覚的設計意図を伝えきれない場合、モデルは **必ず** drawio (`.drawio` / `.drawio.svg`) または HTML mockup を能動的に生成し、Markdown 設計書から相互参照する)
B) **部分的 — VIS-SUPP-01 (flow 補助図) と VIS-SUPP-03 (UI mockup 補助図) のみ強制** (アーキ図 / storage 規約 / 相互参照ルールは適用外。アーキは別文書で既に整備済で、flow / UI 忠実度だけ重視したい場合)
C) **いいえ — VIS-SUPP ルールはすべて skip** (Markdown のみで設計、視覚補助の価値が薄い小規模 feature 向け)
X) その他 (`[Answer]:` の後に自由記述)

[Answer]: A

---

## Question 2: Frontend Design (FE デザイン規律) Extension

本 project において、**Frontend Design ルール** (Anthropic `frontend-design` plugin に着想を得た、意図的な美的コミットメントを保つルール) を強制しますか?

A) **はい — すべての FE-DESIGN ルールを blocking 制約として強制する** (INCEPTION drawio / SVG canonical が存在する場合に推奨。意図的な typography / color palette / motion vocabulary / mobile-first viewport / component 再利用を必須とし、Inter/Roboto の generic 見出し / Tailwind `emerald-*` デフォルト / shadcn-ui コピペ等の AI 既定スタイルを明示的に禁止)
B) **部分的 — FE-DESIGN-01, 03, 04 のみ強制** (SVG 継承 + color palette + anti-default。typography / motion / 再利用 / mobile-first は適用外。frontend は存在するが UI 整合性が主眼でない場合)
C) **いいえ — FE-DESIGN ルールはすべて skip** (意図的な美的制約なしの自由 UI 設計)
X) その他 (`[Answer]:` の後に自由記述)

[Answer]: A

---

## Question 3: Security Baseline (セキュリティ) Extension

本 project において、**Security ルール** を強制しますか?

A) **はい — すべての SECURITY ルールを blocking 制約として強制する** (production 級アプリケーションに推奨)
B) **いいえ — SECURITY ルールはすべて skip** (PoC / プロトタイプ / 実験的 project 向け)
X) その他 (`[Answer]:` の後に自由記述)

[Answer]: A

---

## Question 4: Property-Based Testing (PBT) Extension

本 project において、**Property-Based Testing ルール** を強制しますか?

A) **はい — すべての PBT ルールを blocking 制約として強制する** (ビジネスロジック / データ変換 / シリアライゼーション / stateful component を持つ project に推奨)
B) **部分的 — PBT ルールは pure function と シリアライゼーション round-trip のみに強制** (アルゴリズムの複雑度が限定的な project 向け)
C) **いいえ — PBT ルールはすべて skip** (単純な CRUD アプリ / UI のみの project / 重要ロジックなしの薄い統合層に向く)
X) その他 (`[Answer]:` の後に自由記述)

[Answer]: C

---

## Question 5: Construction Flow (CF) Extension

本 project において、**Construction Flow ルール** (Anthropic `feature-dev` plugin に着想を得たオーケストレーション型マルチエージェント workflow) を強制しますか?

A) **はい — すべての CONS-FLOW ルールを blocking 制約として強制する** (非自明な Construction stage に推奨。Claude Code Agent ツール経由の並列 sub-agent でコードベース探索 / 複数アプローチ設計 / clarifying questions / 高精度レビューを統合)
B) **部分的 — CONS-FLOW-01, 03, 05 のみ強制** (探索 + 複数アプローチ提案 + 信頼度フィルタ済レビュー。並列 sub-agent 実行 / 承認ゲート / 監査ログ要件は適用外。ハッカソン速度を保ちつつ最低限の設計厳密さを維持したい場合)
C) **いいえ — CONS-FLOW ルールはすべて skip** (デフォルトの `construction/code-generation.md` Plan → Generate 2-part flow に戻る)
X) その他 (`[Answer]:` の後に自由記述)

[Answer]: B

---

## 回答完了後のお願い

すべての `[Answer]:` に letter (A / B / C / X) を埋めて、「**完了**」「**done**」「**OK**」 のいずれかで知らせてください。次に:

1. opt-in 結果を `aidlc-docs/aidlc-state.md` の `## Extension Configuration` に記録
2. enabled extension の full rules ファイルを deferred load
3. 必要なら `requirements.md` に該当 extension 制約を追記
4. Workflow Planning に進む
