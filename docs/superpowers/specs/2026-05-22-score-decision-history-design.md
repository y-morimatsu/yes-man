# ScorePage Decision History 設計仕様

- **Date**: 2026-05-22
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**:
  - `apps/api/src/yesman_api/interface/http/decisions.py` (GET endpoint 追加)
  - `apps/api/src/yesman_api/interface/http/dto/decision.py` (末尾に DecisionHistoryItemDTO / DecisionHistoryResponse 追記)
  - `packages/api-client/src/modules/decisions.ts` (`history()` method 追加)
  - `apps/web/src/features/score/` 配下 (新規 hook + component + utility 3 ファイル)
  - `apps/web/src/features/score/ScorePage.tsx` (既存 Card / footnote の下に `<DecisionHistoryList />` を挿入)
- **Branch**: `feature/web-score-decision-history` (develop から派生済)
- **Related**:
  - drawio モックアップ: [diagrams/2026-05-22-score-decision-history-screens.drawio](diagrams/2026-05-22-score-decision-history-screens.drawio) (2 ページ)
  - Pack A (前段の Score 煽り文/Summary/confetti): [./2026-05-22-demo-ux-polish-pack-a-design.md](./2026-05-22-demo-ux-polish-pack-a-design.md)

---

## 1. 背景

`/score` ページは現在 **数値サマリ (radial chart + Yes 比率 + 30 日折れ線)** のみで、ユーザーが過去にどんな質問をして、AI のどんな提案を採用したかは確認できない。

ハッカソンデモ的にも「**この人は何を任せたのか**」が見えると説得力が増す ("人生の N% を YesMan に委ねました" の中身が分かる)。さらに **採用までに何回 No したか** (no_attempt_count) を併記することで、YesMan の段階的 microcopy で誘導された結果が可視化される ("5 回 No した末に Yes" = AI の粘り強さの記録)。

### 解決したい課題

1. **Score の数値が抽象的すぎる**: 「Yes 比率 92%」は分かるが、何を Yes したか不明
2. **No (棄却) は表示すべきでない**: YesMan の世界観 (Yes を称える) と整合せず、ノイズ。ただし Score 計算には引き続き `no_count` を利用するため DB には保持
3. **採用までの粘り強さが見えない**: 「1 回目で Yes」と「5 回目でようやく Yes」の質的差を表現する手段がない

---

## 2. ユーザストーリー

> ユーザーが `/score` を開くと、上半分に既存の委任度スコア (radial + bubble + line chart) が表示され、その下に **「📜 最近の Yes 採択」セクション** が現れる。最新 20 件の Yes 採択がカードリストで並び、各カードには質問・採用された提案・相対時刻・**何回目で採用したか** (1 回目なら 🌟、2 回目以降は 🔄) が表示される。No (棄却) した提案は履歴に表示されない (Score 計算用には DB に残る)。

### 受入基準 (Gherkin)

```
# API filter
Given /v1/decisions?limit=20&choice=yes に GET する
When ユーザーに yes/no/pending 混在の決定が 30 件存在する
Then response.items は user_choice='yes' のみ、最大 20 件、created_at DESC 順
  And 各 item に id, user_input, proposal_text, created_at, no_attempt_count が含まれる

# 表示
Given /score を開く
When score API と decision history API の両方が成功する
Then 既存 Score Card が表示される (変更なし)
  And その下に「📜 最近の Yes 採択 (最大 20 件)」セクションが表示される
  And Yes 採択された決定がカードリスト形式で並ぶ

# 採用回数表示
Given Yes 採択履歴の item を表示する
When no_attempt_count = 0 (一発採用)
Then 時刻行に「🌟 1 回目で採用」が表示される

Given Yes 採択履歴の item を表示する
When no_attempt_count = 4 (5 回目で Yes)
Then 時刻行に「🔄 5 回目で採用」が表示される

# 長文 truncate
Given user_input が 60 文字を超える
When 履歴 item に表示される
Then 60 文字までで切り、末尾に「…」が付与される
  And [...s] で count (絵文字 surrogate pair 対応)

# 空状態
Given Yes 採択がまだ 0 件
When /score を開く
Then ダッシュ枠 + 📭 + 「まだ Yes 採択の履歴がありません」が表示される

# silent fail
Given decision history API がエラーを返す
When /score を開く
Then 既存 Score Card は通常通り表示される
  And DecisionHistoryList は非表示 (silent fail, ScorePage は崩れない)
```

---

## 3. 設計 1: API endpoint `GET /v1/decisions`

### 変更対象

- `apps/api/src/yesman_api/interface/http/decisions.py` — 末尾に list endpoint 追加
- `apps/api/src/yesman_api/interface/http/dto/decision.py` — 末尾に `DecisionHistoryItemDTO`, `DecisionHistoryResponse` を追記 (既存 `DecisionResponse`/`ChoiceResponse`/`NudgeResponse` と同居)

### 仕様

- **Path**: `GET /v1/decisions`
- **Query**: `limit: int = 20` (1-100), `choice: Literal["yes", "no", "all"] = "yes"` (デフォルト yes のみ)
- **Auth**: 既存の `require_authenticated_user` dependency
- **実装**:
  ```python
  @router.get("", response_model=DecisionHistoryResponse)
  async def list_decisions(
      limit: int = Query(default=20, ge=1, le=100),
      choice: Literal["yes", "no", "all"] = Query(default="yes"),
      user: AuthenticatedUser = Depends(require_authenticated_user),
      repo: DecisionRepository = Depends(get_decision_repo),
  ) -> DecisionHistoryResponse:
      raw = await repo.list_by_user(user.user_id, limit=limit, order_by="created_at_desc")
      filtered = [d for d in raw if choice == "all" or d.user_choice == choice]
      items = [
          DecisionHistoryItemDTO(
              id=str(d.id),
              user_input=d.user_input,
              proposal_text=d.proposal_text,
              user_choice=d.user_choice,
              no_attempt_count=d.no_attempt_count,
              created_at=d.created_at,
          )
          for d in filtered[:limit]
      ]
      return DecisionHistoryResponse(items=items, limit=limit)
  ```

### DTO

```python
class DecisionHistoryItemDTO(BaseModel):
    id: str
    user_input: str
    proposal_text: str
    user_choice: Literal["yes", "no", "pending"]
    no_attempt_count: int
    created_at: datetime

class DecisionHistoryResponse(BaseModel):
    items: list[DecisionHistoryItemDTO]
    limit: int
```

### Filter ロジック

- API 層で application フィルタ (`filtered = [d for d in raw if ...]`)
- Repository は変更なし (既存 `list_by_user` の interface を維持)
- 注意: `choice=yes` で 20 件取りたい場合、raw が 20 件中 No が混在しているケースを考慮 → **取得 limit を 100 に拡張してから filter → slice(limit)** とすべきか?
  - 簡易対応: 100 件取得 → filter → 最大 limit 件返す (multi-page 取得は YAGNI)
  - 実装: `raw = await repo.list_by_user(user.user_id, limit=min(100, limit * 5), order_by="created_at_desc")`

### テスト

`apps/api/tests/integration/decision/test_list_decisions_endpoint.py` (新規):

- choice=yes で yes のみ返る
- choice=no で no のみ返る (デバッグ/将来用、API 自体は提供)
- choice=all で全件返る
- limit=5 で 5 件まで
- 件数 0 で `items=[]`
- 未認証で 401

---

## 4. 設計 2: api-client `DecisionsModule.history()`

### 変更対象

- `packages/api-client/src/modules/decisions.ts` — `history()` method 追加
- 型は既存の `components["schemas"]["DecisionHistoryResponse"]` を使う (openapi-gen が自動生成する前提、未生成なら手動 type 追加)

### 実装

```typescript
export type DecisionHistoryResponse = components["schemas"]["DecisionHistoryResponse"];
export type DecisionHistoryItem = components["schemas"]["DecisionHistoryItemDTO"];

export class DecisionsModule {
  // (既存 method 群)

  async history(opts?: { limit?: number; choice?: "yes" | "no" | "all" }): Promise<DecisionHistoryResponse> {
    const params = new URLSearchParams();
    if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
    if (opts?.choice !== undefined) params.set("choice", opts.choice);
    const query = params.toString();
    return request<DecisionHistoryResponse>(
      this.client,
      `/v1/decisions${query ? `?${query}` : ""}`,
    );
  }
}
```

### テスト

api-client はリポジトリ内で msw で型契約のみ確認する形 (既存パターン踏襲)。専用 test ファイル不要、Web 側の hook test で間接的に検証する。

---

## 5. 設計 3: Web `useDecisionHistory` hook

### 変更対象

- `apps/web/src/features/score/useDecisionHistory.ts` (新規)

### 実装

```typescript
import { useQuery } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";

export function useDecisionHistory(opts?: { limit?: number }) {
  const api = useApi();
  const limit = opts?.limit ?? 20;
  return useQuery({
    queryKey: ["decisions", "history", { limit, choice: "yes" }],
    queryFn: () => api.decisions.history({ limit, choice: "yes" }),
    staleTime: 30_000,
  });
}
```

- `staleTime: 30s` — 連続再描画で API 連打しない
- `queryKey` に `choice: "yes"` を含め、将来 choice 切替 UI を入れた時 cache 分離できる構造

---

## 6. 設計 4: Web `DecisionHistoryList` component

### 変更対象

- `apps/web/src/features/score/DecisionHistoryList.tsx` (新規)
- `apps/web/src/features/score/formatRelativeTime.ts` (新規 utility)
- `apps/web/src/features/score/truncate.ts` (新規 utility、絵文字 surrogate pair 対応)

### UI 仕様 (drawio Page 1 / Page 2 準拠)

セクション全体:
```
📜 最近の Yes 採択              (最大 20 件)
┌─────────────────────────────────────┐
│ ✓  「今日のランチどうしよう？」      │
│    → コンビニのサラダチキン定食     │
│    🕒 5 分前 ・ 🌟 1 回目で採用     │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ✓  「今夜の映画 何見よう？」          │
│    → Dune: Part Two                  │
│    🕒 昨日 ・ 🔄 3 回目で採用        │
└─────────────────────────────────────┘
...
```

### スタイル (Tailwind)

```tsx
// セクションヘッダ
<h2 className="font-serif font-semibold text-base text-brand-700 px-3">
  📜 最近の Yes 採択
  <span className="text-xs text-neutral-500 font-normal ml-2">
    (最大 20 件)
  </span>
</h2>

// item Card
<article className="rounded-xl border border-neutral-200 bg-white p-3 mb-2 flex gap-2">
  <span className="text-success-700 font-bold text-base flex-shrink-0" aria-hidden>✓</span>
  <div className="flex-1 min-w-0">
    <p className="font-serif italic text-sm text-neutral-800 truncate">
      「{truncate(item.user_input, 60)}」
    </p>
    <p className="text-sm text-neutral-700 truncate">
      → {truncate(item.proposal_text, 60)}
    </p>
    <p className="text-xs text-neutral-500 mt-1">
      🕒 {formatRelativeTime(item.created_at)}
      <span className="mx-1">・</span>
      {renderAdoptionCount(item.no_attempt_count)}
    </p>
  </div>
</article>
```

### 採用回数表示

```typescript
function renderAdoptionCount(noAttemptCount: number): string {
  const n = noAttemptCount + 1;
  if (n === 1) return `🌟 1 回目で採用`;
  return `🔄 ${n} 回目で採用`;
}
```

### 空状態

```tsx
// items.length === 0
<div className="rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center">
  <div className="text-2xl mb-2" aria-hidden>📭</div>
  <p className="text-sm italic text-neutral-500">
    まだ Yes 採択の履歴がありません
  </p>
</div>
```

### Loading / Error

- `isPending`: skeleton (3 つの灰色プレースホルダー card) を表示
- `isError`: コンポーネント全体を非表示 (silent fail、ScorePage は崩さない)

### Component シグネチャ

```typescript
export interface DecisionHistoryListProps {
  limit?: number; // default 20
}

export function DecisionHistoryList({ limit = 20 }: DecisionHistoryListProps): JSX.Element | null;
```

---

## 7. 設計 5: utilities

### `formatRelativeTime(iso: string): string`

```typescript
export function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin} 分前`;
  if (diffHour < 24) return `${diffHour} 時間前`;
  if (diffDay === 1) return "昨日";
  if (diffDay < 7) return `${diffDay} 日前`;
  return iso.slice(0, 10); // YYYY-MM-DD
}
```

未来時刻は想定外 (= 1 分未満として扱う、防御的)。

### `truncate(s: string, n: number): string`

```typescript
export function truncate(s: string, n: number): string {
  const chars = [...s]; // surrogate pair / emoji を 1 char として扱う
  if (chars.length <= n) return s;
  return chars.slice(0, n).join("") + "…";
}
```

---

## 8. 設計 6: ScorePage 組込

### 変更対象

- `apps/web/src/features/score/ScorePage.tsx` — 既存 Card の下に `<DecisionHistoryList />` を追加

### 変更内容

```tsx
import { DecisionHistoryList } from "./DecisionHistoryList";

// (既存 ScorePage コンポーネント末尾、解釈ガイド <p> の後ろに追加)
      <p className="text-center text-xs italic text-neutral-500">
        {t("paradoxNote")}
      </p>

      {/* NEW: Decision History (Yes 採択のみ 最大 20 件) */}
      <DecisionHistoryList />
    </div>
```

既存 Card や注釈は無変更。

---

## 9. テスト戦略

### API

- `apps/api/tests/integration/decision/test_list_decisions_endpoint.py` (新規):
  - choice=yes で yes のみ
  - choice=no で no のみ
  - choice=all で混在
  - limit=5 で 5 件
  - 空ケース
  - 認証なしで 401

### Web

- `apps/web/tests/features/score/formatRelativeTime.test.ts` (新規):
  - 30 秒前 → 「たった今」
  - 5 分前 → 「5 分前」
  - 23 時間前 → 「23 時間前」
  - 1 日前 → 「昨日」
  - 3 日前 → 「3 日前」
  - 8 日前 → 「YYYY-MM-DD」
- `apps/web/tests/features/score/truncate.test.ts` (新規):
  - 短い文字列はそのまま
  - 60 chars 超で truncate + 「…」
  - 絵文字混在で正しく count
- `apps/web/tests/features/score/DecisionHistoryList.test.tsx` (新規):
  - items 3 件表示
  - 「🌟 1 回目で採用」 (no_attempt_count=0)
  - 「🔄 3 回目で採用」 (no_attempt_count=2)
  - 空状態 (items=[]) で「まだ Yes 採択の履歴がありません」
  - isError で component が描画されない

### e2e

- 既存 `tests/e2e/tests/score.spec.ts` に新規 it 追加 (任意):
  - "ScorePage に DecisionHistoryList が表示される (mock LLM seed あり)"

---

## 10. 実装順序とコミット粒度

リスク低い順:

| Step | 設計 | 内容 | コミット |
|:----:|:----:|------|---------|
| 1 | #1 | API endpoint + DTO + test | `feat(api): GET /v1/decisions 履歴 endpoint を追加` |
| 2 | #2 | api-client `history()` method + type | `feat(api-client): DecisionsModule.history() を追加` |
| 3 | #5 | utilities (formatRelativeTime / truncate) + tests | `feat(web): score 履歴用 time/truncate utility を追加` |
| 4 | #3 + #4 | hook + component + tests | `feat(web): DecisionHistoryList コンポーネント新規` |
| 5 | #6 | ScorePage 組込 | `feat(web): ScorePage に DecisionHistoryList を組込` |

5 commit を 1 PR にまとめて `feature/web-score-decision-history → develop`。各 commit は単独で動作 / テスト PASS の状態。

---

## 11. リスクとオープン論点

| ID | 論点 | 対応方針 |
|----|------|----------|
| O1 | filter 後に limit 件数に達しない可能性 | 一旦 `min(100, limit * 5)` 件取得 → filter → slice(limit)。multi-page 取得は YAGNI |
| O2 | 「採用回数」の解釈差 | `no_attempt_count + 1` = 「ユーザーが見た提案数 (= 最終的に Yes した提案の番号)」。例: no_attempt_count=2 → 3 つ目の提案で Yes |
| O3 | line-clamp vs truncate (改行の扱い) | truncate (文字数) + `truncate` CSS class (line-clamp-1) を両方適用、改行コードは表示前に空白置換 |
| O4 | 履歴の更新 trigger | choose API 成功時に React Query `invalidateQueries(["decisions", "history"])` を呼ぶか? → YAGNI (staleTime 30s で十分、デモでも refresh で見える) |
| O5 | プライバシー (user_input 内 PII) | engine.py が `mask_pii` を呼んだ後の文字列が DB に入っているなら問題なし。要確認: 実は user_input は **生** で persist されている (engine.py で PII mask は LLM への入力のみ)。本人にしか見えないので OK |
| O6 | silenced 決定の扱い | `user_choice="pending"` で残る (silenced は yes/no 不可)。choice=yes filter で自動除外、追加対応不要 |

---

## 12. 完了の定義 (DoD)

- [ ] API `GET /v1/decisions?limit=20&choice=yes` が動作し、unit/integration test PASS
- [ ] api-client `DecisionsModule.history()` が型付きで callable
- [ ] `DecisionHistoryList` が `/score` 末尾に表示され、空状態 / loading / error / 採用回数 (🌟/🔄) すべて目視確認
- [ ] 全 Web unit test PASS、既存テストへの回帰なし
- [ ] e2e Playwright 全 PASS (mock seed 環境)
- [ ] size-limit 違反なし
