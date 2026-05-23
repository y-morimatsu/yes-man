# Screen Mockups (SVG) — INCEPTION フェーズ + Post-CONSTRUCTION 改修注記

本ディレクトリは INCEPTION フェーズ (2026-05-09) で生成された 6 画面の SVG mockup を保持。`README.md` (リポジトリ root) の `## 📱 画面イメージ` セクションから 240px 幅で参照される。

## ファイル一覧

| ファイル | screen 番号 | 内容 | 最終更新 |
|---|---|---|---|
| `01-home-input.svg` | screen-01 | Home (Decision Input) — テキスト + 音声 + persona selector | 2026-05-09 |
| `02-discussion-live.svg` | screen-02 | Live Discussion (SSE) — 3 人格 thinking chips + chunk 配信 | **2026-05-22** (Post-CONSTRUCTION v2 反映、Pack A) |
| `03-proposal-card.svg` | screen-03 | 提案カード + Swipe (Yes/No) — confetti 演出は v2 で追加 (動的、SVG では未表現) | 2026-05-09 |
| `04-score-dashboard.svg` | screen-04 | 委任度スコア + 円グラフ + 30 日 trend + **📜 Yes 採択履歴 20 件** | **2026-05-22** (Post-CONSTRUCTION v2 反映、Decision History) |
| `05-silence-domain.svg` | screen-05 | 応答停止 (Silence Theater dark theme) | 2026-05-09 |
| `06-persona-pool.svg` | screen-06 | ペルソナ共有プール + 💡 Dynamic Routing badge | **2026-05-19** (Post-CONSTRUCTION 反映) |

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

### 04-score-dashboard.svg — スコア反転 (`317280b` + `2400f45`)
| 修正対象 | 修正前 (CONSTRUCTION) | 修正後 (Post-CONSTRUCTION) |
|---|---|---|
| 大% 表示 | `8` (No 比率) | `92` (Yes 比率、131/142) |
| 円弧 stroke-dasharray | `35 360` (~9% 表示) | `358 360` (~92% 表示) |
| ラベル | `委任度 (No 比率)` | `委任度 (Yes 比率)` |
| line chart polyline | 下降トレンド (`372 → 422` 単調増加 y、つまり下方向) | **上昇トレンド** (`410 → 358` 単調減少 y、つまり上方向、30% → 95% 推移) |
| chart 全点 cy | (372,378,388,402,414,420,422) | (410,390,378,371,366,362,358) |
| 注釈フッタ | `スコアが ひくいほど AI を信頼できています` | `スコアが たかいほど AI を信頼できています` |

**意味論**: Yes-ratio モデルでは「高い = 委任度高 = AI を信頼している」。CONSTRUCTION 段階の "No 比率" 表記は逆だったため、コミット `317280b` で全面反転。さらに `2400f45` で `ScoreRadialChart` + `ScoreLineChart` 新規 component による視覚化を実装、本 SVG も同コンセプトを反映。

**色**: `#9F88C8` (purple) を Yes-ratio progress arc に使用 (README screen-04 説明と整合)、`#E8775A` (coral) を 30 日 trend line に使用。

### 06-persona-pool.svg — Dynamic Persona Routing badge 追加 (`07c1c78`、Closes #4)
- 3 つの builtin persona card (慎重派 / 楽観派 / 効率派) の右上に `💡おすすめ` **pink pill badge** を追加
  - 配色: `fill="#FFD6E0" stroke="#FF8FAE"` (pink、INCEPTION color palette 内)
  - 文字色: `fill="#E8775A"` (coral)
- フッタに badge 凡例を追加: 「💡 = 嗜好プロファイルに基づく自動推奨 top-3 (Dynamic Persona Routing)」
- Cold-start user (PreferenceProfile 空) では badge 非表示、本 mockup は学習済 state を想定

**意味論**: `DecisionEngine._resolve_personas` が `PreferenceProfileRepository.persona_style_preference` 降順で builtin top-3 を選ぶようになった (`07c1c78`)。UI 側では `usePreference` + `usePersona.builtin()` 合成で top-3 にのみ badge を表示。Custom Persona (共有プール由来) は自動推奨対象外。

### その他の screen は不変 (v1 時点)
- `01-home-input.svg`: 現状実装と整合 (テキスト input + 音声ボタン + persona selector + 送信ボタン + 「決められない」を 委ねよう フッタ)
- `05-silence-domain.svg`: 現状実装と整合 (dark theme + … + 4 ドメイン icon)

→ v1 時点の改修対象は `04` `06` の 2 SVG のみ。

---

## Post-CONSTRUCTION 改修注記 v2 (2026-05-22) — Pack A + Decision History

PR #15 (Demo UX Polish Pack A、`a731786` 2026-05-22 merged) と feature/web-score-decision-history (本ブランチ、Decision History 機能) の実装内容を SVG に反映。

### 04-score-dashboard.svg — 履歴セクション追加 + 煽り文 (Pack A + Decision History)

**viewbox 拡張**: `280×520` → `280×880` (Decision History 3 件分の card list を表示するため)。

| 修正対象 | 修正前 (v1) | 修正後 (v2) | 出典 |
|---|---|---|---|
| pink bubble copy | `「うまく まかせられて いますね」` | `「過去 30 日、決定の 92% を YesMan に委ねました。うまく任せられています 🎉」` (2 行) | Pack A `a731786` (spec [2026-05-22-demo-ux-polish-pack-a-design.md](../../../../docs/superpowers/specs/2026-05-22-demo-ux-polish-pack-a-design.md) §3) |
| 履歴セクション | (なし) | divider + `📜 最近の Yes 採択 (最大 20 件)` + 3 サンプル item (✓ + 質問 + → 提案 + 🕒 相対時刻 ・ 採用回数) + `↓ 続きはスクロール` | Decision History (spec [2026-05-22-score-decision-history-design.md](../../../../docs/superpowers/specs/2026-05-22-score-decision-history-design.md) §6) |
| 採用回数バリアント | (新規) | Item 1: `🌟 1 回目で採用` (一発採用、`attempt_count=1`) / Item 2: `🔄 3 回目で採用` (regenerate session) / Item 3: `🔄 5 回目で採用` | mock seed regenerate session で生成、`attempt_count = 同 user_input_hash 内の created_at 順 1-indexed` |

**意味論**: 「人生の N% を委ねた中身」が一覧で見える。一発採用 (🌟) と複数回再生成後の採用 (🔄) を視覚的に区別、YesMan の段階的 microcopy で誘導された結果が可視化される。

### 02-discussion-live.svg — PersonaThinkingChips 追加 (Pack A #3)

**viewbox 拡張**: `280×520` → `280×580` (chips セクション 40px 分)。

| 修正対象 | 修正前 (v1) | 修正後 (v2) |
|---|---|---|
| chips section (y=108-148) | (なし) | 3 chips 横並び: `🛡️ ✓ 慎重派` / `☀️ ✓ 楽観派` / `⚡ 考え中…` (3 つ目は pulse `opacity 1↔0.55` アニメ + dashed border) |
| LIVE badge 位置 | y=130 | **y=180** (chips を上に配置するため 50px 下に移動) |
| 全 element の y 座標 | (元の値) | **+50px シフト** (3 bubble / progress / hint / SSE labels) |

**意味論**: SSE streaming 中、どの persona が既に発話済みでどの persona がまだ思考中かを **chip 列で一目把握** できる。LIVE badge (🔴) は streaming 全体の進行を、chips は persona 個別の発話状態を示す。

### 03-proposal-card.svg — confetti 演出 (Pack A #4、SVG では非表示)

**変更なし** (静的 SVG では animation を表現できないため)。

ただし実装には Yes 採択時に `canvas-confetti` で画面全体に粒が舞う演出が追加されている (spec Pack A §6):
- `particleCount: 50`、`colors: ["#9F88C8", "#E8775A", "#FFD6E0"]` (brand purple / coral / pink)
- `prefers-reduced-motion: reduce` 時は発火しない (a11y)
- NudgeBanner 内の `✨🎉✨ + 「素晴らしい従順さです」` celebration は不変、confetti は **画面全体に被さる別レイヤー**

### Home Summary card (Pack A #2、専用 SVG なし)

Home Hub (`/`) には新たに `📊 最近の YesMan` Summary カード (件数 / Yes 比率 / progress bar) が追加されたが、本 SVG セット (screen-01〜06) には Home Hub の mockup が存在しない (元々の INCEPTION で省略されていた)。実装内容は spec [2026-05-22-demo-ux-polish-pack-a-design.md](../../../../docs/superpowers/specs/2026-05-22-demo-ux-polish-pack-a-design.md) §4 を参照。

→ 将来的に `07-home-hub.svg` を新規追加する候補 (本 PR では skip)。

### 不変
- `01-home-input.svg` / `05-silence-domain.svg` / `06-persona-pool.svg`: v2 時点でも変更なし。
- `03-proposal-card.svg`: confetti は dynamic animation のため SVG mockup には反映しない。

→ FE-DESIGN-01 の "screens as Source of Truth" 原則は維持、v2 改修は本 README で明示的に追跡。

---

## Post-CONSTRUCTION 改修注記 v3 (2026-05-23) — token streaming + Yes nudge LLM + gamification

PR #86 (token streaming) / #89 (preference inline handler) / #94 (Yes nudge LLM) / #95 + #97 (gamification + mascot) の実装内容を SVG / 本 README に追跡。

### 02-discussion-live.svg — 演出が DOM-only に移行 (SVG 不変)

**変更なし** (静的 SVG では下記の dynamic 演出を表現できないため)。

実装側 (`apps/web/src/features/decision/`) に v3 で以下が追加されている (PR #86 / #95):

| 演出 | 実装 |
|---|---|
| **chips の廃止** | 上記 v2 で追加した `PersonaThinkingChips` は v3 で **廃止** (重複情報のため)、bubble header に persona icon + 「発言中…」 amber pill を統合 (`packages/ui/src/composites/DecisionUtteranceBubble.tsx`) |
| **persona pre-fill** | 新 SSE event `personas` で 3 persona 分の bubble を delta 到着前から `text=""` で render、`min-h-16` で skeleton 同等の height 維持 |
| **token streaming** | `utterance_delta` event 毎に bubble の text を append、bubble 末尾に typing dots (●●● blink、CSS `ym-typing-dot`) を表示 |
| **bubble slide-in** | 新発話登場時に `ym-bubble-slide-in` (240ms ease-out) |

→ Source of Truth は SVG ではなく実装 (chips 廃止 + 動的 streaming は SVG で表現困難)。

### 03-proposal-card.svg — Yes 誘導演出が SVG 外 (SVG 不変)

**変更なし** (animation + dynamic confetti のため SVG では表現外)。

実装側 (`packages/ui/src/composites/SwipeChoice.tsx` + `apps/web/src/features/decision/`) に v3 で以下が追加 (PR #95 + #97):

| 演出 | 実装 |
|---|---|
| **swipe card 右辺 green glow pulse** | `dx=0` 時に `ym-yes-edge-glow` (inset box-shadow 2.2s loop)、Yes 方向を passive 誘導 |
| **「→ → → Yes」 marching arrows** | swipe hint テキストを 3 stagger chevron animation (`ym-swipe-hint-arrow` 1.4s) + success color の `Yes` ラベル |
| **proposal 到着 notification** | proposal 初到着で `📨 合議が完了しました` slide-down banner (2.4s で fade out) |
| **Yes 連続採択 combo badge** | `YesComboBadge` tier 別 🔥/🌟/⚡/🏆 + pop-in animation (`ym-combo-pop`) |
| **tier 別 confetti 強度** | 1: 50 粒子 / 3+: 70 + 黄色 / 5+: 90 + 紫 / 10+: 3 wave 大爆発 + 金 |
| **コンボ break** | No 採択直後 (combo>0) で `💔 コンボ break` shake 演出 (`ym-combo-break` 1.4s) |
| **No 後 microcopy LLM 動的生成** | `POST /v1/decisions/{id}/yes-nudge` で stage 別 tone の Yes nudge を 30 字以内で生成、`NoMicroCopyBanner.dynamicMessage` で優先表示 |

### 全画面共通 — YesMan マスコット (新 component)

**新規**: `apps/web/src/features/decision/YesManMascot.tsx`。

| state | message | bubble 配色 |
|---|---|---|
| `streaming` | じっくり 考え中… | amber |
| `proposing` | 迷ったら 任せて! | pink |
| `yes` (1.6s) | やった! いいね! | green |
| `no` (1.6s) | 次は うまくいくよ! | gray |
| `silenced` | あなたが 決める領域 | dark |
| `hidden` | (非表示) | — |

- 位置: `fixed top-20 right-4` (header 直下、右上)
- レイアウト: bubble 左 / 🤵 右、tail は右向き
- bobbing (`ym-mascot-bob` 2.4s) + pop-in (`ym-mascot-bubble-in` 240ms)
- `pointer-events-none` で操作妨害なし
- `prefers-reduced-motion: reduce` で全 animation 無効化

将来的に専用 SVG `07-mascot.svg` を追加する候補 (本 release では skip)。

### 不変
- `01-home-input.svg` / `04-score-dashboard.svg` / `05-silence-domain.svg` / `06-persona-pool.svg`: v3 時点で変更なし。
- (`02-discussion-live.svg` の v2 PersonaThinkingChips 描画は v3 実装と乖離するが、Source of Truth が実装 / 設計判断に移行したため SVG は据え置き)

→ v3 改修は **動的 UX 演出が主体** のため SVG では表現困難、`packages/ui/src/styles/globals.css` の `@keyframes` 群 + composites + decision feature 配下に Source of Truth が分散。
