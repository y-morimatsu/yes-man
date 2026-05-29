# typography-redesign — Requirements Analysis

**Feature ID**: typography-redesign
**Created**: 2026-05-27
**Author**: y-morimatsu (with Claude Opus 4.7)
**Workflow Phase**: 🔵 INCEPTION → Requirements Analysis (Standard depth)
**Status**: Draft (awaiting Gate 1 approval)

---

## 1. Intent Analysis

### User's stated intent (verbatim)
> "実機(iPhone13)スマホで確認しました。文字が小さいので目がつかれます。
> 全体的に大きくしたい。ai-dlcでデザインを見直したい。
> ヘッダの(YESManのタイトル文字やsigenout)の大きさは現状のままでOK"

### Inferred motivation
- iPhone 13 (実機 viewport ≈ 390×844 Retina @3x) で文字が小さすぎて長時間使用で疲労
- ハッカソンデモ + 日常使用を見据えた ergonomics 改善
- ヘッダはブランド要素 (YesMan title) + 補助 action (Sign out) で密度を保ちたい意図

### Reverse engineering snapshot (現状把握)
- Typography token は `packages/ui/src/tokens/typography.ts` に一元化
- Tailwind preset 経由で web 全体に適用 (`packages/ui/src/tailwind-preset.ts`)
- 現状の `fontSize` token (Tailwind default 完全一致):
  | token | rem | px (16px base) |
  |---|---|---|
  | xs | 0.75rem | 12 |
  | sm | 0.875rem | 14 |
  | base | 1rem | 16 |
  | lg | 1.125rem | 18 |
  | xl | 1.25rem | 20 |
  | 2xl | 1.5rem | 24 |
  | 3xl | 1.875rem | 30 |
  | 4xl | 2.25rem | 36 |
  | decision | 2rem | 32 |
  | persona | 1.125rem | 18 |
- 使用頻度 (`grep` 集計):
  | class | count | 主用途 |
  |---|---|---|
  | text-xs | **71** | label / caption / breadcrumb / pink nudge / hint |
  | text-sm | 44 | form label / button text / tab label |
  | text-base | 15 | input / textarea |
  | text-lg | 11 | h1 (pageTitle) / header brand |
  | text-xl | 6 | modal title / score number |
- 加えてインライン `fontSize: 12/13/14/16/18/22` が DecisionResult / SwipeChoice / ScoreRadialChart 等に散在 (10 箇所程度)

**根本原因**: `text-xs` (12px) が caption / banner / hint 等で 71 箇所と最頻使用 → 12px は Retina ディスプレイでは判読負荷が高い (Apple HIG 推奨 minimum 11pt = 14px〜).

---

## 2. Functional Requirements

### FR-TYP-01: 全 text-* token をスケールアップ
- `packages/ui/src/tokens/typography.ts` の `fontSize` 各ステップを増量する.
- 結果として Tailwind の `text-xs`〜`text-4xl` 各 class が一斉に拡大、app 全体の文字が読みやすくなる.
- スケール比は Application Design で確定するが、本要件では「最小サイズ (text-xs) が **14px 以上**」を必須条件とする (Apple HIG minimum 整合).

### FR-TYP-02: ヘッダのサイズ据置
- 画面上部 Header (Layout 内、YesMan ブランド title + Sign out リンク) は現状のサイズを維持.
- 実現手段は Application Design で確定 (絶対 px クラス `text-[Npx]` への置換、または header 内専用 CSS scope).
- 影響対象は Layout コンポーネント内の以下 2 element に限定:
  - YesMan ブランドタイトル
  - Sign out リンク
- bottom nav / sub-page header 等は対象外 (= 通常スケールアップする).

### FR-TYP-03: インライン fontSize の連動
- `style={{ fontSize: 18 }}` 等のインライン宣言 (DecisionResult の結論カード、ScoreRadialChart の数値、SwipeChoice 内の Yes/No ラベル等) も視覚一貫性のためにスケールアップする.
- 連動比はトークンスケール比と同等 (例: +15% なら 18→21).
- インライン値を rem / token 参照に置き換えるかは Application Design で判断.

### FR-TYP-04: タップ領域の最低保証
- 文字拡大に伴い button / link の縦サイズが連動拡大することは許容 (むしろ歓迎).
- 既存の `min-height` / `padding` 指定は触らない (= 暗黙に拡大).
- Apple HIG 推奨 44×44pt の最小タップ領域を満たすことを目視確認.

---

## 3. Non-Functional Requirements

### NFR-TYP-01: 視覚回帰の許容範囲
- 文字拡大による layout shift / 折返し増加は許容 (= 意図された変更).
- mobile viewport (390×844, iPhone 13 Retina) で 主要 5 画面 (Splash / SignIn / Decision / Score / Persona / Profile) が:
  - 縦 scroll 内に主要 CTA が収まる
  - 横 overflow が発生しない
  を満たす.

### NFR-TYP-02: テスト互換性
- 既存 unit / integration / e2e の `getByText` / `getByRole` selector は文字内容で引いているため、スケール変更で破壊されない想定.
- ただし `getBy*` で sizing に依存する assertion があれば修正対象.

### NFR-TYP-03: パフォーマンス影響なし
- token 値変更は CSS 再生成のみ、bundle size / runtime cost に有意な変化なし.

### NFR-TYP-04: ダーク mode / 配色への影響なし
- 本変更は font-size のみ、color / contrast には触れない.

---

## 4. Out of Scope

- 行間 (line-height) の再設計 (token に line-height があれば後追い検討)
- 配色 / コントラスト見直し
- アイコンサイズ
- アニメーション速度
- bottom nav の icon-only ボタンの拡大 (現状で十分のため)
- Vite / Tailwind バージョンアップ
- ダーク mode 配色

---

## 5. Acceptance Criteria (Gate 5 で確認)

- [ ] `packages/ui/src/tokens/typography.ts` の `fontSize` 各 step が Application Design 確定値に更新されている
- [ ] iPhone 13 viewport (390×844) で `/decision` `/score` `/persona` `/profile` の文字が「目で追える」 (体感確認)
- [ ] Layout の YesMan title + Sign out が現状サイズのまま
- [ ] 既存 unit + e2e test が green (typography 変更で壊れたものは修正済)
- [ ] インライン `fontSize:` 値もトークンと連動して拡大されている

---

## 6. Constraints

- ハッカソン期間中 → 大規模 refactor (rem 化 / CSS variable 化) は避け、最小 diff で達成
- branch `feature/morimatsu-brushup` 上で作業継続、merge は user 明示承認待ち (memory `project_ideation_phase_no_auto_merge`)
- Header 据置の手段は 2 element pin で OK (refactor 不要)

---

## 7. Risk / Open Questions

| ID | 内容 | 影響 | 対応 |
|---|---|---|---|
| R-1 | text-lg / text-xl も拡大すると header brand (text-lg 使用箇所もある) に波及 | 中 | header は FR-TYP-02 の絶対 px pin で対応 |
| R-2 | 大幅拡大 (例: +30%) で modal が viewport 高さを超え scroll 発生 | 低 | Modal は max-h-90vh + overflow-y-auto 済 |
| R-3 | スケール比が user の体感に合わない (大きすぎ / 小さすぎ) | 中 | Gate 1 で user に scale 候補を選択させる |

---

## Gate 1 Decision (Requirements Approval)

User からの承認待ち. 以下 2 点の決定が必要:

**Q1: スケール戦略**
- A: **均等 +15% 程度** (text-xs 12→14, sm 14→16, base 16→18, lg 18→21, xl 20→23) — 推奨
- B: 均等 +25% (text-xs 12→15, sm 14→18, base 16→20, lg 18→23, xl 20→25) — より大胆
- C: 小サイズ重点 (text-xs 12→14, sm 14→15, base〜xl 不変) — 最小 diff
- D: Other / カスタム

**Q2: ヘッダ据置の実装方針**
- A: **Layout の header 内 2 element に絶対 px class (`text-[18px]` / `text-[14px]`) を直接適用** — 推奨 (最小 diff)
- B: header 全体に `data-pinned-typography` 属性 + CSS で `text-xs` 等を override
- C: Other
