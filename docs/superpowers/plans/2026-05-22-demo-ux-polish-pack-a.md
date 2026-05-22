# Demo UX Polish Pack A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ハッカソン予選 (2026-05-30) のデモで「派手な瞬間」を 4 件増幅する: Score 煽り文 / Home サマリ / streaming 中 thinking chips / Yes 採択 confetti。

**Architecture:** 既存実装 (沈黙演出 / Score radial+line+bubble / SSE 並列 persona / Decision prefetch) には触れず、上から演出を追加するだけ。API は scorer.py の message テンプレ 1 ファイルのみ変更。Web は新規 2 ファイル + 既存 2 ファイル修正。

**Tech Stack:** React 18 + TypeScript + Tailwind / FastAPI + Python 3.12 (uv) / Vitest + msw / pytest-asyncio / canvas-confetti (新規依存)

**Spec:** [../specs/2026-05-22-demo-ux-polish-pack-a-design.md](../specs/2026-05-22-demo-ux-polish-pack-a-design.md)

**Branch:** `feature/web-demo-ux-polish-pack-a` (develop から派生済、spec doc commit `87f8133` あり)

---

## File Structure

| ファイル                                                                                                    | 種別     | 責務                                                       |
|-------------------------------------------------------------------------------------------------------------|----------|------------------------------------------------------------|
| `apps/api/src/yesman_api/domain/decision/scorer.py`                                                          | 修正     | `_MESSAGE_*` 定数を `_format_message(ratio)` 関数に置換     |
| `apps/api/tests/unit/decision/test_scorer.py`                                                                | 修正     | 期待文言を新フォーマット (`過去 30 日、N% を委ねました`) に更新 + 新規 1 件 |
| `apps/web/package.json`                                                                                      | 修正     | `canvas-confetti` および `@types/canvas-confetti` 追加      |
| `apps/web/src/features/decision/DecisionResult.tsx`                                                          | 修正     | (a) streaming 時に `<PersonaThinkingChips>` 表示、(b) Yes 採択時に confetti 発火 |
| `apps/web/src/features/decision/PersonaThinkingChips.tsx`                                                    | 新規     | 3 人格チップ (発話済 ✓ / 未発話 pulse)                       |
| `apps/web/src/features/home/HomePage.tsx`                                                                    | 修正     | nav カード上部に Summary カードを追加                       |
| `apps/web/tests/features/decision/PersonaThinkingChips.test.tsx`                                             | 新規     | チップ表示・状態切替のユニットテスト                       |
| `apps/web/tests/features/decision/DecisionResult.test.tsx`                                                   | 新規     | Yes 採択時に confetti が呼ばれるテスト                      |
| `apps/web/tests/features/home/HomePage.test.tsx`                                                             | 新規     | Summary カード表示・遷移先テスト                           |

---

## Pre-Flight

- [ ] **Step 0.1: ブランチと作業ディレクトリ確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon && git branch --show-current && git log --oneline -3
```

Expected: `feature/web-demo-ux-polish-pack-a` ブランチ、HEAD は `87f8133 docs(specs): Demo UX Polish Pack A 設計仕様を追加`

- [ ] **Step 0.2: 依存と test ベースラインを確認**

Run:
```bash
pnpm -F @yesman/web test 2>&1 | tail -10
```

Expected: 既存 Web tests 全 PASS (本 plan で追加する test 以外)

Run:
```bash
cd apps/api && uv run pytest tests/unit/decision/test_scorer.py -v && cd ../..
```

Expected: `test_total_zero_returns_null_ratio` / `test_high_yes_ratio_message` / `test_low_yes_ratio_message` 全 PASS

---

## Task 1: Score 煽り文 (API)

**Files:**
- Modify: `apps/api/src/yesman_api/domain/decision/scorer.py:31-34` (定数) と `:52-57` (message 選択)
- Modify: `apps/api/tests/unit/decision/test_scorer.py:33-46` (既存 2 件の expected 文言)
- Modify: `apps/api/tests/unit/decision/test_scorer.py` 末尾 (新規 1 件追加)

- [ ] **Step 1.1: 既存 test_scorer.py の期待文言を新フォーマットに更新**

`apps/api/tests/unit/decision/test_scorer.py` の `test_high_yes_ratio_message` と `test_low_yes_ratio_message` を以下に書き換える:

```python
@pytest.mark.asyncio
async def test_high_yes_ratio_message():
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=1, total=10))
    result = await scorer.compute(uuid4())
    assert result.ratio == 0.9
    assert "90%" in result.message
    assert "委ねました" in result.message


@pytest.mark.asyncio
async def test_low_yes_ratio_message():
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=7, total=10))
    result = await scorer.compute(uuid4())
    assert result.ratio == 0.3
    assert "30%" in result.message
    assert "委ねています" in result.message
```

- [ ] **Step 1.2: 新規 mid range と percentage formatting テストを追加**

`apps/api/tests/unit/decision/test_scorer.py` の末尾に追記:

```python
@pytest.mark.asyncio
async def test_mid_yes_ratio_message():
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=4, total=10))
    result = await scorer.compute(uuid4())
    assert result.ratio == 0.6
    assert "60%" in result.message
    assert "委ねました" in result.message


@pytest.mark.asyncio
async def test_percentage_rounded_correctly():
    # 7/30 = 0.233... → ratio=0.233 → 23% (round to integer)
    scorer = AutonomyScorer(decision_repo=_StubRepo(no_count=23, total=30))
    result = await scorer.compute(uuid4())
    assert "23%" in result.message
```

- [ ] **Step 1.3: テストを実行して FAIL することを確認**

Run:
```bash
cd apps/api && uv run pytest tests/unit/decision/test_scorer.py -v
```

Expected: 4 件中 `test_high_yes_ratio_message` / `test_low_yes_ratio_message` / `test_mid_yes_ratio_message` / `test_percentage_rounded_correctly` が FAIL (現状の `_MESSAGE_HIGH/MID/LOW` には `"%"` / `"委ねました"` が含まれない)

- [ ] **Step 1.4: scorer.py を新フォーマットに書き換え**

`apps/api/src/yesman_api/domain/decision/scorer.py:31-34` の `_MESSAGE_HIGH/MID/LOW` を削除し、代わりに以下を挿入 (`_MESSAGE_HISTORY_EMPTY` と `_HISTORY_DAYS` は維持):

```python
_MESSAGE_HISTORY_EMPTY = "まだ意思決定の履歴がありません。"

_HISTORY_DAYS = 30


def _format_message(yes_ratio: float) -> str:
    pct = round(yes_ratio * 100)
    if yes_ratio >= 0.8:
        return f"過去 30 日、あなたは決定の {pct}% を YesMan に委ねました。うまく任せられています 🎉"
    if yes_ratio >= 0.5:
        return f"過去 30 日、あなたは決定の {pct}% を YesMan に委ねました。もう少し任せる余地がありそうです。"
    return f"過去 30 日、あなたは決定の {pct}% だけ YesMan に委ねています。もっと任せてみては？"
```

そして `compute` 内の message 選択 (L52-57) を以下の 1 行に置換:

```python
        yes_ratio = round((total - no_count) / total, 3)
        message = _format_message(yes_ratio)
        history = await self._build_history(user_id)
```

(if/elif/else ブロックは丸ごと削除)

- [ ] **Step 1.5: テストを再実行して全 PASS を確認**

Run:
```bash
cd apps/api && uv run pytest tests/unit/decision/test_scorer.py -v
```

Expected: 5 件 (`test_total_zero_returns_null_ratio` 含む) すべて PASS

- [ ] **Step 1.6: 周辺 API テストへの影響確認**

Run:
```bash
cd apps/api && uv run pytest tests/ -k "score" -v
```

Expected: scorer 関連の全テスト PASS (property test 含む)

- [ ] **Step 1.7: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/api/src/yesman_api/domain/decision/scorer.py apps/api/tests/unit/decision/test_scorer.py
git commit -m "$(cat <<'EOF'
feat(api): score message に "過去 30 日、N% を委ねました" 型を採用

ハッカソン予選デモ「派手な瞬間」増幅 (Pack A #1).
_MESSAGE_HIGH/MID/LOW 定数を _format_message(ratio) 関数に置換し、
具体的な割合 (N%) を文言に埋め込む.

UI 側 (ScorePage pink bubble) は無変更で新文言が反映される.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Yes 採択時の confetti 演出 (Web)

**Files:**
- Modify: `apps/web/package.json` (依存追加)
- Modify: `apps/web/src/features/decision/DecisionResult.tsx:49-64` (handleChoose 内に confetti 発火追加)
- Create: `apps/web/tests/features/decision/DecisionResult.test.tsx` (confetti 呼び出しの mock テスト)

- [ ] **Step 2.1: canvas-confetti を web app に追加**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm add canvas-confetti@^1.9.3 -F @yesman/web
pnpm add -D @types/canvas-confetti@^1.9.0 -F @yesman/web
```

Expected: `apps/web/package.json` の dependencies に `canvas-confetti` が追加され、devDependencies に `@types/canvas-confetti` が追加される。

- [ ] **Step 2.2: DecisionResult.test.tsx を新規作成 (FAIL する test を先に書く)**

`apps/web/tests/features/decision/DecisionResult.test.tsx` を新規作成:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import { ToastProvider } from "@yesman/ui";
import { DecisionResult } from "../../../src/features/decision/DecisionResult";

// canvas-confetti を mock (default export を vi.fn() に差替え)
vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

import confetti from "canvas-confetti";

const server = setupServer();

function setup(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <ToastProvider>
              <DecisionResult
                utterances={[]}
                proposal="コンビニのサラダチキン定食"
                decisionId="test-id-1"
                onComplete={() => {}}
                onNoChosen={() => {}}
                {...props}
              />
            </ToastProvider>
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("DecisionResult — Yes confetti", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  beforeEach(() => {
    vi.mocked(confetti).mockClear();
  });

  it("fires confetti on Yes selection", async () => {
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choose", () =>
        HttpResponse.json({ no_attempt_count: 0 }),
      ),
    );
    const { getByRole } = setup();
    const yesButton = getByRole("button", { name: /Yes/ });
    yesButton.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(confetti).toHaveBeenCalledTimes(1);
  });

  it("does not fire confetti on No selection", async () => {
    server.use(
      http.post("http://localhost:8000/v1/decisions/test-id-1/choose", () =>
        HttpResponse.json({ no_attempt_count: 1 }),
      ),
    );
    const { getByRole } = setup();
    const noButton = getByRole("button", { name: /No/ });
    noButton.click();
    await new Promise((r) => setTimeout(r, 50));
    expect(confetti).not.toHaveBeenCalled();
  });
});
```

> **Note:** SwipeChoice コンポーネントが Yes/No ボタンを `role="button"` で公開している前提。もし `getByRole("button", { name: /Yes/ })` が見つからない場合は、`screen.debug()` で actual な DOM を確認し、`data-testid` か別の selector に差し替える。

- [ ] **Step 2.3: テストを実行して FAIL することを確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- DecisionResult.test
```

Expected: `fires confetti on Yes selection` が FAIL (confetti is not called - 実装まだ無いため)

- [ ] **Step 2.4: DecisionResult.tsx に confetti 発火を実装**

`apps/web/src/features/decision/DecisionResult.tsx` の import 群に追加:

```tsx
import confetti from "canvas-confetti";
```

(L14-23 の既存 import 群の直後)

そして `handleChoose` の Yes 分岐 (L54-57) を以下に置換:

```tsx
      if (choice === "yes") {
        setChosen("yes");
        setNoCount(count);
        fireConfetti();
      } else {
        // INCEPTION Journey C: No → 親に regenerate 委譲
        onNoChosen?.(count);
      }
```

そして `DecisionResult` 関数本体の冒頭 (state hooks の後) に `fireConfetti` を定義:

```tsx
  const fireConfetti = () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    confetti({
      particleCount: 50,
      spread: 80,
      origin: { y: 0.2 },
      colors: ["#9F88C8", "#E8775A", "#FFD6E0"],
      ticks: 150,
      scalar: 1.1,
    });
  };
```

- [ ] **Step 2.5: テストを再実行して PASS を確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- DecisionResult.test
```

Expected: 2 件 PASS

- [ ] **Step 2.6: lint と build (size-limit) を確認**

Run:
```bash
pnpm -F @yesman/web lint && pnpm -F @yesman/web build
```

Expected: lint エラーなし、build 成功、size-limit 違反なし (250KB main bundle 内)

- [ ] **Step 2.7: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/package.json apps/web/src/features/decision/DecisionResult.tsx apps/web/tests/features/decision/DecisionResult.test.tsx pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(web): Yes 採択時に画面全体 confetti を発火

ハッカソン予選デモ「派手な瞬間」増幅 (Pack A #4).
NudgeBanner 内の ✨🎉✨ celebration はそのまま維持、
canvas-confetti で画面上部から 50 粒の祝祭を 1.5 秒舞わせる.
prefers-reduced-motion: reduce 時は発火しない.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Home Hub の Summary カード (Web)

**Files:**
- Modify: `apps/web/src/features/home/HomePage.tsx` (Summary カードを section 先頭に追加)
- Create: `apps/web/tests/features/home/HomePage.test.tsx` (Summary カード表示・遷移テスト)

- [ ] **Step 3.1: HomePage.test.tsx を新規作成 (FAIL する test を先に書く)**

`apps/web/tests/features/home/HomePage.test.tsx` を新規作成:

```tsx
import { describe, expect, it } from "vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../../../src/shell/ApiProvider";
import { AuthProvider } from "../../../src/shell/AuthProvider";
import HomePage from "../../../src/features/home/HomePage";

const server = setupServer();

function setup(score: {
  no_count: number;
  total: number;
  ratio: number | null;
  message: string;
}) {
  server.use(
    http.get("http://localhost:8000/v1/scores/me", () =>
      HttpResponse.json({ ...score, history: [] }),
    ),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ApiProvider>
          <QueryClientProvider client={qc}>
            <HomePage />
          </QueryClientProvider>
        </ApiProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("HomePage Summary card", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("renders summary with count and ratio when total > 0", async () => {
    setup({ no_count: 1, total: 12, ratio: 0.92, message: "OK" });
    await waitFor(() => {
      expect(screen.getByText(/12 件の決定/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Yes 比率 92%/)).toBeInTheDocument();
  });

  it("renders empty state when total === 0", async () => {
    setup({ no_count: 0, total: 0, ratio: null, message: "empty" });
    await waitFor(() => {
      expect(screen.getByText(/まだありません/)).toBeInTheDocument();
    });
  });

  it("summary card links to /score when has data", async () => {
    setup({ no_count: 1, total: 12, ratio: 0.92, message: "OK" });
    await waitFor(() => {
      expect(screen.getByText(/12 件の決定/)).toBeInTheDocument();
    });
    const link = screen
      .getByText(/12 件の決定/)
      .closest("a");
    expect(link).toHaveAttribute("href", "/score");
  });

  it("summary card links to /decision when empty", async () => {
    setup({ no_count: 0, total: 0, ratio: null, message: "empty" });
    await waitFor(() => {
      expect(screen.getByText(/まだありません/)).toBeInTheDocument();
    });
    const link = screen
      .getByText(/まだありません/)
      .closest("a");
    expect(link).toHaveAttribute("href", "/decision");
  });
});
```

- [ ] **Step 3.2: テストを実行して FAIL することを確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- HomePage.test
```

Expected: 4 件すべて FAIL (HomePage に該当文言が存在しないため)

- [ ] **Step 3.3: HomePage.tsx に Summary カードを実装**

`apps/web/src/features/home/HomePage.tsx` を以下に書き換え:

```tsx
/** HomePage — Hub Dashboard with summary card (Pack A #2) + 5 機能 nav. */
import { Link } from "react-router-dom";
import { Card } from "@yesman/ui";
import { useScore } from "../score/useScore";

function SummaryCard() {
  const { data, isPending, isError } = useScore();

  if (isPending) {
    return (
      <Card>
        <p className="text-sm text-neutral-500">読み込み中...</p>
      </Card>
    );
  }
  if (isError || !data) {
    return null; // silent fail: Home itself は崩さない
  }

  if (data.total === 0) {
    return (
      <Link to="/decision" className="block">
        <Card>
          <h2 className="font-serif font-semibold text-brand-700">
            📊 最近の YesMan
          </h2>
          <p className="text-sm text-neutral-600 mt-2">
            今日の決定はまだありません。「💭 合議で決定」からどうぞ
          </p>
        </Card>
      </Link>
    );
  }

  const pct = data.ratio !== null ? Math.round(data.ratio * 100) : 0;

  return (
    <Link to="/score" className="block">
      <Card>
        <h2 className="font-serif font-semibold text-brand-700">
          📊 最近の YesMan
        </h2>
        <p className="text-base text-neutral-800 mt-2">
          <span className="font-bold font-mono">{data.total}</span> 件の決定 /
          <span className="ml-1">
            Yes 比率 <span className="font-bold font-mono">{pct}%</span>
          </span>
        </p>
        <div
          className="mt-2 h-2 rounded-full bg-neutral-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full"
            style={{ width: `${pct}%`, background: "#9F88C8" }}
          />
        </div>
        <p className="text-xs italic text-neutral-500 mt-2">{data.message}</p>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Pack A #2: Summary カード (上部) */}
      <SummaryCard />

      {/* Hub: 5 機能 nav (drawio 画面ツリー Home ハブ画面相当) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card>
          <Link to="/decision" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              💭 合議で決定
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              AI ペルソナと合議して、Yes/No で採択
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/personas" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              🎭 Persona 管理
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              ペルソナ作成・共有プール閲覧
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/score" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              📊 委任度 スコア
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              Yes/No 採択履歴の自己分析
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/preferences" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              🧠 嗜好プロファイル
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              学習された嗜好の閲覧・リセット
            </p>
          </Link>
        </Card>
        <Card>
          <Link to="/profile" className="block">
            <h3 className="font-serif font-semibold text-brand-700">
              👤 プロフィール
            </h3>
            <p className="text-sm text-neutral-500 mt-1">
              ユーザー情報・アカウント管理
            </p>
          </Link>
        </Card>
      </section>
    </div>
  );
}
```

- [ ] **Step 3.4: テストを再実行して PASS を確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- HomePage.test
```

Expected: 4 件すべて PASS

- [ ] **Step 3.5: lint と build を確認**

Run:
```bash
pnpm -F @yesman/web lint && pnpm -F @yesman/web build
```

Expected: エラーなし

- [ ] **Step 3.6: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/home/HomePage.tsx apps/web/tests/features/home/HomePage.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): Home Hub に「最近の YesMan」サマリカードを追加

ハッカソン予選デモ「派手な瞬間」増幅 (Pack A #2).
ログイン直後の Home に直近 30 日の決定数・Yes 比率・コメントを
カード 1 枚で見せる. total=0 時は /decision へ誘導、
データありは /score へリンク.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: streaming 中の 3 人格 thinking chips (Web)

**Files:**
- Create: `apps/web/src/features/decision/PersonaThinkingChips.tsx`
- Create: `apps/web/tests/features/decision/PersonaThinkingChips.test.tsx`
- Modify: `apps/web/src/features/decision/DecisionResult.tsx:72-86` (LIVE badge の直後に chips 挿入)

- [ ] **Step 4.1: PersonaThinkingChips.test.tsx を新規作成 (FAIL する test を先に書く)**

`apps/web/tests/features/decision/PersonaThinkingChips.test.tsx` を新規作成:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PersonaThinkingChips } from "../../../src/features/decision/PersonaThinkingChips";
import type { Utterance } from "../../../src/features/decision/reducer";

function makeUtterance(persona_name: string, text = "..."): Utterance {
  return {
    persona_id: persona_name,
    persona_name,
    text,
  };
}

describe("PersonaThinkingChips", () => {
  it("renders all 3 personas as thinking when utterances empty", () => {
    render(<PersonaThinkingChips utterances={[]} />);
    expect(screen.getAllByText(/考え中/)).toHaveLength(3);
    expect(screen.getByText(/🛡️/)).toBeInTheDocument();
    expect(screen.getByText(/☀️/)).toBeInTheDocument();
    expect(screen.getByText(/⚡/)).toBeInTheDocument();
  });

  it("marks cautious as done when 慎重派 utterance arrives", () => {
    render(
      <PersonaThinkingChips
        utterances={[makeUtterance("慎重派")]}
      />,
    );
    expect(screen.getByText(/✓ 慎重派/)).toBeInTheDocument();
    expect(screen.getAllByText(/考え中/)).toHaveLength(2);
  });

  it("marks all 3 as done when all utterances arrived", () => {
    render(
      <PersonaThinkingChips
        utterances={[
          makeUtterance("慎重派"),
          makeUtterance("楽観派"),
          makeUtterance("効率派"),
        ]}
      />,
    );
    expect(screen.getByText(/✓ 慎重派/)).toBeInTheDocument();
    expect(screen.getByText(/✓ 楽観派/)).toBeInTheDocument();
    expect(screen.getByText(/✓ 効率派/)).toBeInTheDocument();
    expect(screen.queryByText(/考え中/)).not.toBeInTheDocument();
  });

  it("applies animate-pulse class to thinking chips only", () => {
    const { container } = render(<PersonaThinkingChips utterances={[]} />);
    const pulsing = container.querySelectorAll(".animate-pulse");
    expect(pulsing.length).toBe(3);
  });
});
```

- [ ] **Step 4.2: テストを実行して FAIL することを確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- PersonaThinkingChips
```

Expected: 全 4 件 FAIL (モジュールが存在しないため)

- [ ] **Step 4.3: PersonaThinkingChips.tsx を新規作成**

`apps/web/src/features/decision/PersonaThinkingChips.tsx` を新規作成:

```tsx
/**
 * PersonaThinkingChips — SSE streaming 中に 3 人格の「考え中 / ✓」を可視化.
 * Pack A #3: 派手な瞬間 (SSE 合議) を増幅.
 *
 * utterances は persona_name で部分マッチ (「慎重」「楽観」「効率」) して
 * 固定 3 ロール (🛡️ 慎重派 / ☀️ 楽観派 / ⚡ 効率派) と突合.
 * - 発話済 → bg-brand-100 + ✓ {role.name}
 * - 未発話 → bg-neutral-100 + 考え中… (pulse animate)
 */
import type { Utterance } from "./reducer";

interface FixedRole {
  emoji: string;
  name: string;
  matchKey: string; // utterance.persona_name に含まれていれば spoken と判定
}

const FIXED_ROLES: FixedRole[] = [
  { emoji: "🛡️", name: "慎重派", matchKey: "慎重" },
  { emoji: "☀️", name: "楽観派", matchKey: "楽観" },
  { emoji: "⚡", name: "効率派", matchKey: "効率" },
];

export interface PersonaThinkingChipsProps {
  utterances: Utterance[];
}

export function PersonaThinkingChips({ utterances }: PersonaThinkingChipsProps) {
  const spokenNames = new Set(utterances.map((u) => u.persona_name));

  return (
    <div className="flex flex-wrap gap-2" role="region" aria-label="人格の発話状態">
      {FIXED_ROLES.map((role) => {
        const spoken = Array.from(spokenNames).some((name) =>
          name.includes(role.matchKey),
        );
        return (
          <span
            key={role.name}
            className={
              spoken
                ? "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-brand-100 text-brand-700 border border-brand-300"
                : "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-neutral-100 text-neutral-500 border border-neutral-300 animate-pulse motion-reduce:animate-none"
            }
          >
            <span aria-hidden>{role.emoji}</span>
            {spoken ? `✓ ${role.name}` : "考え中…"}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4.4: テストを再実行して PASS を確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- PersonaThinkingChips
```

Expected: 4 件 PASS

- [ ] **Step 4.5: DecisionResult.tsx に PersonaThinkingChips を組み込む**

`apps/web/src/features/decision/DecisionResult.tsx` の import 群に追加 (L23 直後):

```tsx
import { PersonaThinkingChips } from "./PersonaThinkingChips";
```

そして isStreaming の LIVE badge ブロック (L72-86) の直後、utterances bubbles ブロック (L88) の直前に挿入:

```tsx
      {/* Pack A #3: 3 人格 thinking chips (streaming 中のみ表示) */}
      {isStreaming && <PersonaThinkingChips utterances={utterances} />}
```

- [ ] **Step 4.6: 既存 DecisionResult.test.tsx と DecisionPage.test.tsx へのリグレッションがないか確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test -- decision
```

Expected: decision フォルダ配下の全 test PASS (Task 2 の DecisionResult.test, PersonaThinkingChips.test, 既存 DecisionPage.test, reducer.test, useDecisionStream.test 全て)

- [ ] **Step 4.7: lint と build を確認**

Run:
```bash
pnpm -F @yesman/web lint && pnpm -F @yesman/web build
```

Expected: エラーなし、size-limit OK

- [ ] **Step 4.8: Commit**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git add apps/web/src/features/decision/DecisionResult.tsx apps/web/src/features/decision/PersonaThinkingChips.tsx apps/web/tests/features/decision/PersonaThinkingChips.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): SSE streaming 中の 3 人格 thinking chips を追加

ハッカソン予選デモ「派手な瞬間」増幅 (Pack A #3).
SSE streaming 中に 🛡️ 慎重派 / ☀️ 楽観派 / ⚡ 効率派 の
チップを表示し、未発話は pulse アニメで「考え中…」、
発話到着で「✓ {persona_name}」に切り替わる.

prefers-reduced-motion: reduce 時は pulse 停止.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Post-Implementation Verification

- [ ] **Step 5.1: Web 全テスト**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web test
```

Expected: 既存 + 新規あわせて全 PASS

- [ ] **Step 5.2: API 全テスト**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run pytest tests/ -v && cd ../..
```

Expected: 全 PASS

- [ ] **Step 5.3: Web build + size-limit**

Run:
```bash
pnpm -F @yesman/web build && pnpm -F @yesman/web size
```

Expected: build 成功、size-limit 違反なし

- [ ] **Step 5.4: 手動デモシナリオで動作確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
pnpm -F @yesman/web dev
```

別ターミナルで API を起動 (既存 README の手順):
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon/apps/api && uv run uvicorn yesman_api.main:app --reload
```

ブラウザで:
1. http://localhost:5173 → Splash → SignIn → Home
2. **Summary カード** が「最近の YesMan」として表示されることを確認 (total=0 → 「まだありません」、データありなら件数と Yes 比率)
3. `/decision` → 「ランチどう？」と入力 → 送信
4. SSE streaming 中に **🛡️/☀️/⚡ チップが pulse** していることを確認、発話到着順に ✓ に切り替わることを確認
5. 提案カードで **Yes をスワイプ → confetti が画面上部から舞う** ことを確認
6. `/score` → pink bubble に **「過去 30 日、N% を YesMan に委ねました」** が表示されることを確認

- [ ] **Step 5.5: コミット履歴を確認**

Run:
```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git log --oneline 87f8133..HEAD
```

Expected: 4 件の feat commit (Task 1〜4) が並ぶ

- [ ] **Step 5.6: PR 作成 (user が指示した場合のみ)**

```bash
cd /Users/morimatsu/lab/ai-dlc-hackathon
git push -u origin feature/web-demo-ux-polish-pack-a
gh pr create --base develop --title "feat(web,api): Demo UX Polish Pack A — 派手な瞬間 4 件を増幅" --body "$(cat <<'EOF'
## Summary
- ハッカソン予選 (2026-05-30) デモ用 UX polish 4 件
- Score 煽り文 / Home サマリ / streaming 中 thinking chips / Yes confetti
- 設計: [docs/superpowers/specs/2026-05-22-demo-ux-polish-pack-a-design.md](../blob/develop/docs/superpowers/specs/2026-05-22-demo-ux-polish-pack-a-design.md)
- 計画: [docs/superpowers/plans/2026-05-22-demo-ux-polish-pack-a.md](../blob/develop/docs/superpowers/plans/2026-05-22-demo-ux-polish-pack-a.md)

## Test plan
- [x] API scorer unit tests PASS (5 件)
- [x] Web unit tests PASS (HomePage / DecisionResult / PersonaThinkingChips 含む)
- [x] Web build + size-limit OK
- [x] 手動デモシナリオで 4 件すべて動作確認
- [ ] CI e2e Playwright 全 PASS (CI で検証)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> push と PR 作成は user が明示的に指示した場合のみ実行。本 plan の自動実行範囲外。

---

## Self-Review Results

**1. Spec coverage:**

| Spec 設計 | Task | Step | Status |
|-----------|------|------|--------|
| §3 設計 1: Score 煽り文 | Task 1 | 1.1〜1.7 | ✓ |
| §4 設計 2: Home サマリ | Task 3 | 3.1〜3.6 | ✓ |
| §5 設計 3: thinking chips | Task 4 | 4.1〜4.8 | ✓ |
| §6 設計 4: Yes confetti | Task 2 | 2.1〜2.7 | ✓ |
| §7 テスト戦略 (4 件のユニットテスト) | Task 1〜4 各 .1 / .2 ステップ | ✓ |
| §8 実装順序 (#1 → #4 → #2 → #3) | Task 1 → 2 → 3 → 4 | ✓ |
| §10 DoD 5 項目 | Step 5.1〜5.4 | ✓ |

**2. Placeholder scan:** 全ステップに具体的なコード / コマンド / 期待出力あり。"TBD" / "TODO" / "実装する" などのみ書いて中身がないステップなし。

**3. Type consistency:**
- `Utterance` 型は `apps/web/src/features/decision/reducer.ts` から import (Task 2 / Task 4 で利用)
- `FixedRole.matchKey` は Task 4.3 で定義し、同じ Task 内で利用、他 Task との参照無
- API `_format_message` の signature `(yes_ratio: float) -> str` は Task 1 内で完結
- canvas-confetti は default export として import (Task 2.2 mock も 2.4 import も同形)

**4. Discovered gap fix:**
- 当初 plan で `apps/web/src/features/decision/__tests__/` 配下に書こうとしていたが、リポジトリの test 配置は `apps/web/tests/features/<area>/` 規約。spec で「`__tests__/` 配下」と書いた箇所 (spec §3-7 のテスト戦略) を実 plan では正しい path に修正済。
- DecisionResult test で `ToastProvider` 必須 (`useToast` を内部で呼んでいるため) — Step 2.2 でラップ済。
