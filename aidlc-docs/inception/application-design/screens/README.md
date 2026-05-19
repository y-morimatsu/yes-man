# Screen Mockups (SVG) — INCEPTION フェーズ + Post-CONSTRUCTION 改修注記

本ディレクトリは INCEPTION フェーズ (2026-05-09) で生成された 6 画面の SVG mockup を保持。`README.md` (リポジトリ root) の `## 📱 画面イメージ` セクションから 240px 幅で参照される。

## ファイル一覧

| ファイル | screen 番号 | 内容 | 最終更新 |
|---|---|---|---|
| `01-home-input.svg` | screen-01 | Home (Decision Input) — テキスト + 音声 + persona selector | 2026-05-09 |
| `02-discussion-live.svg` | screen-02 | Live Discussion (SSE) — 3 人格 chunk 配信 | 2026-05-09 |
| `03-proposal-card.svg` | screen-03 | 提案カード + Swipe (Yes/No) | 2026-05-09 |
| `04-score-dashboard.svg` | screen-04 | 委任度スコア + 円グラフ + 30 日 trend | **2026-05-19** (Post-CONSTRUCTION 反映) |
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

### その他の screen は不変
- `01-home-input.svg`: 現状実装と整合 (テキスト input + 音声ボタン + persona selector + 送信ボタン + 「決められない」を 委ねよう フッタ)
- `02-discussion-live.svg`: 現状実装と整合 (LIVE badge + 3 persona bubble + chunk progress)
- `03-proposal-card.svg`: 現状実装と整合 (提案カード + 議論を見る + 左右 swipe ヒント + AI nudge bubble)
- `05-silence-domain.svg`: 現状実装と整合 (dark theme + … + 4 ドメイン icon)

→ INCEPTION drawio + screens は FE-DESIGN-01 の Source of Truth、Post-CONSTRUCTION 改修は明示的に本 README で追跡。
