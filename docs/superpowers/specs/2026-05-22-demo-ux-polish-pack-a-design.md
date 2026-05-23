# Demo UX Polish Pack A — 「派手な瞬間」増幅 設計仕様

- **Date**: 2026-05-22
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**:
  - `apps/api/src/yesman_api/domain/decision/scorer.py` (message テンプレ変更のみ)
  - `apps/web/src/features/home/HomePage.tsx` (Summary カード追加)
  - `apps/web/src/features/decision/DecisionResult.tsx` (streaming 中演出 + Yes 採択時 confetti)
  - `apps/web/src/features/decision/strings.ts` (文言追加)
  - `apps/web/package.json` (`canvas-confetti` 追加)
- **Branch**: `feature/web-demo-ux-polish-pack-a` (develop から派生)
- **Related**:
  - 戦略コンテキスト: [../research/2026-05-22-hackathon-competitive-analysis.md](../research/2026-05-22-hackathon-competitive-analysis.md)
  - 並列 persona 合議 (基盤): [./2026-05-21-parallel-persona-consensus.md](./2026-05-21-parallel-persona-consensus.md)

---

## 1. 背景

AWS Summit Japan 2026 AI-DLC ハッカソン予選 (2026-05-30) まで残り 8 日。競合分析 ([../research/2026-05-22-hackathon-competitive-analysis.md](../research/2026-05-22-hackathon-competitive-analysis.md)) の結果、YesMan は「論破せず受容的 / 日常全般 / 完全委任」という独自ポジションを持つが、**地味になりやすい**ことが最大リスクと判明した。

既存実装は十分に厚く (沈黙演出 / Score radial + line + bubble / Decision prefetch / persona 並列 SSE 全部実装済み)、ゼロから作る必要はない。本 spec は**既存実装の上に「派手な瞬間」を増幅する 4 つの UX polish** をまとめて適用する。

### 解決したい課題

1. **Score ピンクバブルの文言が平均的すぎる** — 現状 `_MESSAGE_HIGH/MID/LOW` が「うまく任せられています」程度。「人生の N% を YesMan に委ねました」型の自尊心を揺さぶる具体性が欠ける
2. **Home Hub にログイン直後の "動いている感" がない** — 5 機能 nav カードのみで、ユーザが現在どう使っているかのシグナルゼロ
3. **streaming 中の演出が "AI が考えています…" テキスト 1 行のみ** — SSE 合議の生き物感が淡白、競合分析の「派手な瞬間 #1 SSE 合議」を活かしきれていない
4. **Yes 採択時の祝祭が NudgeBanner カード内に閉じている** — 画面全体に広がる動的演出がなく、プロジェクター越しのインパクトが弱い

---

## 2. ユーザストーリー

> ハッカソン審査員が `/auth/signin` → ログイン → `/` (Home) に到達した瞬間、**今日の YesMan サマリ** が目に飛び込み「動いている感」を体感する。`/decision` で「今日のランチどう？」と入力すると、3 人格チップが pulse アニメで議論を開始し、提案カードに Yes スワイプした瞬間に画面上から confetti が舞う。`/score` を開くと「過去 30 日、決定の 92% を YesMan に委ねました」と具体的な数値で自尊心を揺さぶる文言が表示される。

### 受入基準 (Gherkin)

```
# 設計 1: Score 煽り文
Given /score を表示する
When ratio が 92% (high) である
Then pink bubble に「過去 30 日、決定の 92% を YesMan に委ねました」を含む文言が表示される

Given /score を表示する
When ratio が 60% (mid) である
Then pink bubble に「過去 30 日、決定の 60% を YesMan に委ねました」を含む文言が表示される

# 設計 2: Home サマリ
Given ログイン直後に / (Home) を表示する
When score API が 12 件 / Yes 比率 92% を返す
Then nav カードの上部に Summary カードが表示される
  And Summary カードは「12 件の決定 / Yes 比率 92%」を表示する
  And Summary カードクリックで /score へ navigate する

Given Home を表示する
When score API が total=0 を返す
Then Summary カードは「今日の決定はまだありません」を表示する
  And Summary カードクリックで /decision へ navigate する

# 設計 3: streaming 中演出
Given /decision で user_input を送信する
When SSE streaming が開始される
Then 🛡️ 慎重派 / ☀️ 楽観派 / ⚡ 効率派 の 3 つの persona チップが表示される
  And まだ発話していない persona は pulse アニメで「考え中…」と表示される
  And 発話到着順に "考え中…" → "✓" に切り替わる

Given prefetch buffer から swap される
When DecisionResult が remount される
Then thinking アニメは表示されない (即時 swap のため)

# 設計 4: Yes 祝祭演出
Given /decision の SwipeChoice で Yes が選ばれる
When choose API が成功する
Then 画面上部から confetti (50 個程度、purple/coral/pink) が 1.5 秒間舞う
  And 既存 NudgeBanner ✨🎉✨ celebration も従来通り表示される
  And prefers-reduced-motion: reduce 時は confetti を発火しない

Given /decision の SwipeChoice で No が選ばれる
Then confetti は発火しない
```

---

## 3. 設計 1: Score 煽り文の強化

### 変更対象

- `apps/api/src/yesman_api/domain/decision/scorer.py` L31-34 (定数)
- `apps/api/src/yesman_api/domain/decision/scorer.py` L52-57 (message 選択ロジック)

### 変更内容

ratio を文言にフォーマット埋め込みする。`_MESSAGE_*` を「テンプレ + 動的フォーマット関数」に置換:

```python
# Before
_MESSAGE_HIGH = "あなたは AI を信頼してくれていますね。うまく任せられています。"
_MESSAGE_MID = "選択を AI に任せながら、あなた自身の意思も大切にされています。"
_MESSAGE_LOW = "Yes が少なめです。AI への委任を少しずつ広げてみてはいかがでしょう。"

# After
def _format_message(yes_ratio: float) -> str:
    pct = round(yes_ratio * 100)
    if yes_ratio >= 0.8:
        return f"過去 30 日、あなたは決定の {pct}% を YesMan に委ねました。うまく任せられています 🎉"
    elif yes_ratio >= 0.5:
        return f"過去 30 日、あなたは決定の {pct}% を YesMan に委ねました。もう少し任せる余地がありそうです。"
    else:
        return f"過去 30 日、あなたは決定の {pct}% だけ YesMan に委ねています。もっと任せてみては？"
```

- `compute` 内の message 選択を `message = _format_message(yes_ratio)` の 1 行に簡素化
- `total == 0` の `_MESSAGE_HISTORY_EMPTY` は変更しない (履歴ゼロ時の特殊文言)

### UI 側

無変更。`apps/web/src/features/score/ScorePage.tsx` の pink bubble は `data.message` をそのまま描画するため、API 文言変更が即座に反映される。

### テスト

- `apps/api/tests/unit/decision/test_scorer.py` の既存 message 期待値を新文言に更新
- 新規追加: `_format_message(0.92)` が「92%」を含むことを確認するユニットテスト 1 件 (round 挙動の garantee)

---

## 4. 設計 2: Home Hub の「今日のサマリ」カード

### 変更対象

- `apps/web/src/features/home/HomePage.tsx` (Summary カードを nav カード群の上に追加)

### 変更内容

`useScore()` hook を流用し、Summary カード 1 枚を追加。以下のレイアウト:

```
┌─────────────────────────────────────────────┐
│  📊 今日の YesMan                            │
│                                              │
│   12 件の決定 / Yes 比率 92%                 │
│   ━━━━━━━━━━━━━━━━━━━ 92%                    │
│   「うまく任せられています」                 │
└─────────────────────────────────────────────┘
        ↓ クリックで /score へ
[💭 合議で決定] [🎭 Persona 管理] [📊 委任度 スコア]
[🧠 嗜好プロファイル] [👤 プロフィール]
```

### 表示パターン

| 条件                  | 表示                                                        | クリック先  |
|-----------------------|-------------------------------------------------------------|-------------|
| `total > 0` (通常)    | 「{total} 件の決定 / Yes 比率 {ratio}%」 + プログレスバー + message | `/score`    |
| `total === 0` (初回)  | 「今日の決定はまだありません。" 合議で決定 " からどうぞ」  | `/decision` |
| `isPending`           | Spinner (既存 `@yesman/ui` の Spinner)                       | (clickable 無効) |
| `isError`             | カードを表示しない (silent fail、Home 自体は崩さない)         | —           |

### 実装メモ

- `useScore()` は既存 `apps/web/src/features/score/useScore.ts` を import
- カードのスタイルは `ScorePage` と整合 (`Card` + 内部 pink bubble は省略、簡潔版)
- 「今日の YesMan」と書いているが、score API は過去 30 日累計のため、文言は **「最近の YesMan」** に修正することも検討 (要 user 判断)
  - 本 spec では **「最近の YesMan」を採用** (誤解を生まない)
- レスポンシブ: nav カード上部に full-width で配置、`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` の nav とは別 section

### テスト

- `apps/web/src/features/home/__tests__/HomePage.test.tsx` (新規) に以下:
  - `total > 0` で「件の決定」「Yes 比率」が表示される
  - `total === 0` で「まだありません」が表示される
  - Summary カードクリックで `/score` へ navigate される
  - `isError` 時に Summary カードが描画されない

---

## 5. 設計 3: streaming 中の 3 人格「考え中」演出

### 変更対象

- `apps/web/src/features/decision/DecisionResult.tsx` (streaming 中の表示を強化)
- 新規 `apps/web/src/features/decision/PersonaThinkingChips.tsx` (チップコンポーネント)

### 変更内容

`isStreaming` 時に 3 人格チップを横並びで表示。utterances 配列に存在する persona は「✓」、未発話は「考え中…」+ `animate-pulse`。

```tsx
// PersonaThinkingChips.tsx (新規)
interface PersonaThinkingChipsProps {
  utterances: Utterance[];
  // persona は decision 開始時に固定の 3 人格 (慎重派 / 楽観派 / 効率派) を想定
  // ただし persona_id は dynamic な場合もあるため、utterances から既出 id を抽出して
  // 既知 3 ロールと突合する設計とする (堅牢性確保)
}

const FIXED_ROLES = [
  { emoji: "🛡️", name: "慎重派", key: "cautious" },
  { emoji: "☀️", name: "楽観派", key: "optimistic" },
  { emoji: "⚡", name: "効率派", key: "efficient" },
];
```

レンダリング:

```
[🛡️ 考え中…]  [☀️ 考え中…]  [⚡ 考え中…]
       ↓ (発話到着順に "確定" 表示へ切り替え)
[🛡️ ✓ 慎重派]  [☀️ 考え中…]  [⚡ 考え中…]
       ↓
[🛡️ ✓ 慎重派]  [☀️ ✓ 楽観派]  [⚡ 考え中…]
```

### DecisionResult.tsx の変更

```tsx
// isStreaming のとき、LIVE badge の直後に追加
// 注: LIVE badge は 2026-05-22 Mobile App Polish 5f32c72 で削除済。
// 現在の実装では PersonaThinkingChips は utterance bubble 群の前 (先頭) に配置されている。
{isStreaming && (
  <PersonaThinkingChips utterances={utterances} />
)}
```

### マッチングロジック

utterances から `persona_name` を見て、FIXED_ROLES とゆるく突合 (「慎重」「楽観」「効率」の部分一致):

- マッチした role → "✓" + persona_name
- マッチしないが utterance がある → 4 つ目以降は表示しない (FIXED_ROLES の 3 つに収める割り切り)
- 全 FIXED_ROLES のうち未マッチ → "考え中…" + pulse

### スタイル (Tailwind)

```tsx
className={`
  inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
  ${spoken
    ? "bg-brand-100 text-brand-700 border border-brand-300"
    : "bg-neutral-100 text-neutral-500 border border-neutral-300 animate-pulse"}
`}
```

### prefetch swap 時の挙動

`DecisionResult` の `key={decisionId}` で remount されるため、新 decisionId の utterances は最初から全件入っている (即時 swap)。`isStreaming === false` なので thinking chips は表示されない。意図通り。

### prefers-reduced-motion

`animate-pulse` は Tailwind デフォルトで `prefers-reduced-motion: reduce` 時に自動的に弱まる挙動だが、明示的に止める場合は `motion-reduce:animate-none` を併記する:

```tsx
animate-pulse motion-reduce:animate-none
```

### テスト

- `apps/web/src/features/decision/__tests__/PersonaThinkingChips.test.tsx` (新規):
  - utterances 空 → 3 つ全部 "考え中…" + pulse class
  - 慎重派 utterance 1 件 → 慎重派 ✓、他 2 つ "考え中…"
  - 3 件全て揃う → 全 "✓"

---

## 6. 設計 4: Yes 採択時の confetti 演出

### 変更対象

- `apps/web/package.json` (`canvas-confetti` 依存追加)
- `apps/web/src/features/decision/DecisionResult.tsx` (Yes ハンドラ内で confetti 発火)

### 変更内容

#### 依存追加

```json
{
  "dependencies": {
    "canvas-confetti": "^1.9.3"
  },
  "devDependencies": {
    "@types/canvas-confetti": "^1.9.0"
  }
}
```

`pnpm add canvas-confetti -F @yesman/web` および `pnpm add -D @types/canvas-confetti -F @yesman/web`。

#### 発火ロジック

`handleChoose("yes")` 成功時に confetti を発火 (既存の `setChosen("yes")` 直後):

```tsx
import confetti from "canvas-confetti";

const fireConfetti = () => {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  confetti({
    particleCount: 50,
    spread: 80,
    origin: { y: 0.2 }, // 画面上部から
    colors: ["#9F88C8", "#E8775A", "#FFD6E0"], // brand purple / coral / pink
    ticks: 150,
    scalar: 1.1,
  });
};

// handleChoose 内
if (choice === "yes") {
  setChosen("yes");
  setNoCount(count);
  fireConfetti(); // 追加
}
```

### NudgeBanner との関係

NudgeBanner の `✨🎉✨` celebration は **そのまま維持**。confetti は **画面全体に被さる別レイヤー** として並行発火。

- NudgeBanner = カード内に閉じた celebration (継続表示)
- confetti = 画面全体に 1.5 秒だけ広がる動的演出 (一過性)

両者は補完関係。

### bundle size 影響

- `canvas-confetti` minified ~10KB
- 既存 size-limit (250KB) には十分余裕あり
- code splitting は不要 (Yes 採択時に即発火する必要があるため eager load)

### テスト

- `apps/web/src/features/decision/__tests__/DecisionResult.test.tsx` (既存または新規):
  - Yes 採択時に `canvas-confetti` の default export が呼ばれる (vi.mock で stub)
  - No 採択時に confetti が呼ばれない
  - `prefers-reduced-motion: reduce` 時に confetti が呼ばれない (matchMedia mock)

---

## 7. テスト戦略

### 全体方針

- 新規ユニットテスト 4 件 (各設計 1 件) を `apps/web/src/features/**/__tests__/` および `apps/api/tests/unit/` に追加
- 既存 e2e (Playwright 100 件) への影響は無 (UI 構造の追加のみ、既存 selector への変更なし)
- 設計 1 の API 文言変更で `test_scorer.py` の expected message を更新 (回帰扱い、設計内)

### 検証コマンド

```bash
# Web 側
pnpm -F @yesman/web test
pnpm -F @yesman/web lint
pnpm -F @yesman/web build

# API 側
cd apps/api && uv run pytest tests/unit/decision/test_scorer.py

# 全体 e2e (時間が許せば)
pnpm -F @yesman/web test:e2e
```

### prefers-reduced-motion 検証

- 設計 3 (pulse): Tailwind `motion-reduce:animate-none` 適用、devtools で `Emulate CSS prefers-reduced-motion: reduce` 設定して目視確認
- 設計 4 (confetti): `matchMedia` チェックで早期 return、devtools で同設定して発火しないことを目視確認

---

## 8. 実装順序とコミット粒度

リスク低い順 + 着手しやすい順:

| Step | 設計 | 内容                            | コミット (Conventional Commits) |
|:----:|:----:|---------------------------------|----------------------------------|
| 1    | #1   | Score 煽り文 (API + テスト更新) | `feat(api): score message に "過去 30 日、N% を委ねました" 型を採用` |
| 2    | #4   | Yes confetti                    | `feat(web): Yes 採択時に画面全体 confetti を発火` |
| 3    | #2   | Home Summary カード             | `feat(web): Home Hub に「最近の YesMan」サマリカードを追加` |
| 4    | #3   | streaming 中 thinking chips     | `feat(web): SSE streaming 中の 3 人格 thinking chips を追加` |

各 commit は単独で動作 / テスト PASS の状態を保つ (機能トグル不要、追加のみ)。

### PR

4 commit を 1 PR にまとめて develop へマージ。PR タイトル候補:

> `feat(web,api): Demo UX Polish Pack A — 派手な瞬間 4 件を増幅`

PR description に本 spec へのリンク + 4 件の before/after スクリーンショット (任意)。

### マージ後の追跡

- 5/26 (火) 時点で全 4 件 develop に入っていることを確認
- 5/27 (水) のリハーサルで「派手な瞬間 5 つ」(沈黙 / SSE 合議 / 委任度スコア + 本 Pack A の Home サマリ / confetti) の発火順序とタイミングを最終確認

---

## 9. リスクとオープン論点

| ID  | リスク / 論点                                                       | 対応                                                       |
|-----|---------------------------------------------------------------------|------------------------------------------------------------|
| O1  | 設計 2 の文言「今日の YesMan」vs「最近の YesMan」                   | 本 spec では **「最近の YesMan」** を採用 (score API が 30 日累計のため) |
| O2  | 設計 3 で persona_name の突合が部分一致では脆い (動的 persona 想定) | FIXED_ROLES の 3 つ固定で割り切る。動的 persona は出ない前提で実装 |
| O3  | 設計 4 confetti が低スペック端末で重い                              | particleCount=50 / ticks=150 で軽量側にチューニング、prefers-reduced-motion で完全停止 |
| O4  | 設計 1 でテスト期待値変更が回帰扱いか                                | 同 PR 内で test と実装を同時更新 = 回帰ではなく機能変更扱い |
| O5  | bundle size が 250KB を超える                                       | canvas-confetti は 10KB、超過しない見込み (CI の size-limit で fail 時のみ対処) |

---

## 10. 完了の定義 (DoD)

- [ ] 設計 1: `/score` を mock データで開き、新文言「過去 30 日、決定の N% を…」が pink bubble に表示される
- [ ] 設計 2: ログイン直後の `/` で Summary カードが表示され、クリックで `/score` へ遷移する (total=0 時は `/decision` へ)
- [ ] 設計 3: `/decision` で「今日のランチどう？」と入力 → 3 人格 thinking chips が pulse → 順次 ✓ に切り替わる
- [ ] 設計 4: Yes スワイプ → confetti が 1.5 秒舞う、NudgeBanner も従来通り表示される
- [ ] 全 4 件の commit が develop に入っている
- [ ] e2e Playwright 100 件すべて PASS のまま (回帰なし)
- [ ] size-limit 違反なし
