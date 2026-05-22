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

ハッカソンデモ的にも「**この人は何を任せたのか**」が見えると説得力が増す ("人生の N% を YesMan に委ねました" の中身が分かる)。さらに **同じ質問に対して何回目の提案で Yes したか** (`attempt_count` = 同一 `user_input_hash` 内での `created_at` 順 1-indexed) を併記することで、YesMan の段階的 microcopy で誘導された結果が可視化される ("5 回目で Yes" = AI の粘り強さの記録)。

> **注**: 既存の `Decision.no_attempt_count` フィールドは **ユーザーの累積 No 数のスナップショット** (この決定の試行回数ではない、[engine.py:315-320](../../apps/api/src/yesman_api/domain/decision/engine.py#L315) 参照) なので、本機能では使えない。代わりに API 層で `user_input_hash` で grouping して `attempt_count` を新規計算する。

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
  And 各 item に id, user_input, proposal_text, created_at, attempt_count が含まれる

# attempt_count 計算 (hash grouping)
Given ユーザーが「今日のランチ」を 3 回 No してから 4 回目で Yes 採択 (= 同 user_input_hash 4 件、最後が yes)
When 履歴 API を呼ぶ
Then その Yes item の attempt_count = 4 が DTO に含まれる
  And 並行する別 user_input_hash の Yes item の attempt_count はそれ自身の hash 内 index

Given ユーザーが「服選んで」と入力して即 Yes 採択 (= 同 user_input_hash 1 件)
When 履歴 API を呼ぶ
Then attempt_count = 1

# 表示
Given /score を開く
When score API と decision history API の両方が成功する
Then 既存 Score Card が表示される (変更なし)
  And その下に「📜 最近の Yes 採択 (最大 20 件)」セクションが表示される
  And Yes 採択された決定がカードリスト形式で並ぶ

# 採用回数表示
Given Yes 採択履歴の item を表示する
When attempt_count = 1 (一発採用)
Then 時刻行に「🌟 1 回目で採用」が表示される

Given Yes 採択履歴の item を表示する
When attempt_count = 5 (5 回目で Yes)
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
- **Auth**: 既存の `get_current_user` dependency ([deps.py:105](../../apps/api/src/yesman_api/interface/deps.py#L105))
- **実装**:
  ```python
  from collections import defaultdict
  from typing import Literal

  @router.get("", response_model=DecisionHistoryResponse)
  async def list_decisions(
      limit: int = Query(default=20, ge=1, le=100),
      choice: Literal["yes", "no", "all"] = Query(default="yes"),
      user: AuthenticatedUser = Depends(get_current_user),
      repo: DecisionRepository = Depends(get_decision_repo),
  ) -> DecisionHistoryResponse:
      # Step 1: 全 decision を created_at 昇順で fetch (attempt_count 計算のため limit を broaden)
      RAW_CAP = 1000  # ユーザー 1 人あたり最大処理件数 (hackathon scale で十分)
      all_raw = await repo.list_by_user(
          user.user_id, limit=RAW_CAP, order_by="created_at_asc",
      )

      # Step 2: user_input_hash で group して attempt_count を計算 (1-indexed)
      attempt_idx: dict[str, int] = defaultdict(int)
      enriched: list[tuple[Decision, int]] = []
      for d in all_raw:
          attempt_idx[d.user_input_hash] += 1
          enriched.append((d, attempt_idx[d.user_input_hash]))

      # Step 3: choice filter + created_at 降順 sort
      filtered = [
          (d, idx) for d, idx in enriched
          if choice == "all" or d.user_choice == choice
      ]
      filtered.sort(key=lambda x: x[0].created_at, reverse=True)

      # Step 4: limit 件に絞って DTO 化
      items = [
          DecisionHistoryItemDTO(
              id=str(d.id),
              user_input=d.user_input,
              proposal_text=d.proposal_text,
              user_choice=d.user_choice,
              attempt_count=idx,
              created_at=d.created_at,
          )
          for d, idx in filtered[:limit]
      ]
      return DecisionHistoryResponse(items=items, limit=limit)
  ```

  **計算量**: O(N) where N = ユーザーの decision 総数 (cap 1000 件)。hackathon scale (1 user × ~100 件) では問題なし。production scale で問題になれば SQL window function `ROW_NUMBER() OVER (PARTITION BY user_input_hash ORDER BY created_at)` に置換可能 (PostgreSQL ネイティブ対応)。

### DTO

```python
class DecisionHistoryItemDTO(BaseModel):
    id: str
    user_input: str
    proposal_text: str
    user_choice: Literal["yes", "no", "pending"]
    attempt_count: int  # 同一 user_input_hash 内での created_at 順 1-indexed
    created_at: datetime

class DecisionHistoryResponse(BaseModel):
    items: list[DecisionHistoryItemDTO]
    limit: int
```

### Filter / Repository

- Repository は変更なし (既存 `list_by_user` の interface を維持)
- API 層で hash grouping → choice filter → limit slice の順
- `RAW_CAP=1000` の妥当性: 1 ユーザー 1 日 ~10 件で 100 日分。hackathon scale 十分。超える場合は本機能の attempt_count 計算が部分的に欠落する (= 1000 件超は古い hash group との接続が切れる) が、表示自体には影響しない

### Mock seed の更新 (デモで attempt_count バリエーションを見せるため)

**変更対象**: [apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py:155-189](../../apps/api/src/yesman_api/infrastructure/persistence/mock_repositories.py#L155)

**現状の問題**: 各 decision に unique hash (`f"demo-seed-{i}-{j:02d}"`) を割り当てているため、hash grouping すると全 item が attempt_count=1 になり、デモで「🌟 1 回目で採用」しか出ない。

**修正**: 各 "input" について 20% の確率で **regenerate session (2-5 attempts)** を生成し、session 内では同じ user_input_hash を共有する。Session の最後の attempt を yes (target_yes_ratio 命中時) / 残りを no として作成。

```python
for i in range(days):
    day_offset = days - 1 - i
    target_yes_ratio = 0.30 + (i / max(days - 1, 1)) * 0.65
    n_inputs = rng.randint(2, 5)
    for j in range(n_inputs):
        domain, input_text = rng.choice(domain_inputs)
        shared_hash = f"demo-seed-{i}-{j:02d}"
        # 20% は regenerate session (2-5 attempts)、80% は single attempt
        session_length = rng.randint(2, 5) if rng.random() < 0.2 else 1
        for attempt in range(session_length):
            is_last = (attempt == session_length - 1)
            # session 最後の attempt のみ yes 可能性あり、それ以外は必ず no
            if is_last:
                choice = "yes" if rng.random() < target_yes_ratio else "no"
            else:
                choice = "no"
            created_at = (
                now
                - timedelta(days=day_offset, hours=rng.randint(8, 22), minutes=rng.randint(0, 59))
                + timedelta(seconds=attempt * 30)  # session 内は 30 秒間隔
            )
            utterances = [
                {"persona_name": name, "text": text}
                for name, text in persona_specs
            ]
            decision = Decision(
                id=uuid4(),
                user_id=user_id,
                domain_classification=domain,
                user_input=input_text,
                user_input_hash=shared_hash,  # ← session 内で共有
                proposal_text="（デモ用の合議結論）",
                persona_outputs={"utterances": utterances},
                user_choice=choice,
                no_attempt_count=0,  # 本フィールドは履歴 UI では使わない (= 現状維持で OK)
                llm_provider="mock",
                selected_persona_ids=[],
                created_at=created_at,
            )
            self.decisions[decision.id] = decision
            seeded_decisions.append(decision)
```

**期待される効果**: デモ環境で「🌟 1 回目」「🔄 2 回目」「🔄 3-5 回目で採用」が混在し、UX のバリエーションが視認できる。

### テスト

`apps/api/tests/unit/decision/test_list_decisions_endpoint.py` (新規) — FastAPI `TestClient` + stub repo パターン (既存 `tests/unit/decision/test_scorer.py` 流儀。integration ではない理由は実 DB を必要としないため):

- choice=yes で yes のみ返る
- choice=no で no のみ返る (デバッグ/将来用、API 自体は提供)
- choice=all で全件返る
- limit=5 で 5 件まで
- 件数 0 で `items=[]`
- 未認証で 401
- **attempt_count 計算**: 同一 user_input_hash で no → no → yes と作った時、yes item の attempt_count = 3
- **attempt_count = 1**: 異なる user_input_hash 同士は独立 (= それぞれ 1)
- **attempt_count と sort**: created_at DESC 順なので、新しい hash の item が先頭、attempt_count はその hash 内の最終 index

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

> **配置の rationale**: `features/decision/` (= 既存の DecisionPage/DecisionResult と同居) ではなく **`features/score/`** に置く理由は、(a) ScorePage 専用で他から呼ばれない、(b) ScorePage の責務 (「過去の意思決定の可視化」) の一部として閉じている、(c) decision feature は「これから決める」フロー専用に保ち、「過去を見る」UI と分離した方が変更影響範囲が明確、の 3 点。useDecisionHistory hook も同じく `features/score/` に置き、score feature 内で完結させる。

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
  <span className="text-success font-bold text-base flex-shrink-0" aria-hidden>✓</span>
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
      {renderAdoptionCount(item.attempt_count)}
    </p>
  </div>
</article>
```

### 採用回数表示

```typescript
function renderAdoptionCount(attemptCount: number): string {
  if (attemptCount === 1) return `🌟 1 回目で採用`;
  return `🔄 ${attemptCount} 回目で採用`;
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

- `apps/api/tests/unit/decision/test_list_decisions_endpoint.py` (新規) — FastAPI `TestClient` + stub repo パターン (既存 `tests/unit/decision/test_scorer.py` 流儀。integration ではない理由は実 DB を必要としないため):
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
  - 「🌟 1 回目で採用」 (attempt_count=1)
  - 「🔄 3 回目で採用」 (attempt_count=3)
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
| 1 | #1 | API endpoint + DTO + hash grouping + test | `feat(api): GET /v1/decisions 履歴 endpoint (attempt_count 計算込)` |
| 2 | #1 | Mock seed に regenerate session を追加 (デモ用バリエーション) | `feat(api): mock seed_demo_decisions に regenerate session を追加` |
| 3 | #2 | api-client `history()` method + type | `feat(api-client): DecisionsModule.history() を追加` |
| 4 | #5 | utilities (formatRelativeTime / truncate) + tests | `feat(web): score 履歴用 time/truncate utility を追加` |
| 5 | #3 + #4 | hook + component + tests | `feat(web): DecisionHistoryList コンポーネント新規` |
| 6 | #6 | ScorePage 組込 | `feat(web): ScorePage に DecisionHistoryList を組込` |

6 commit を 1 PR にまとめて `feature/web-score-decision-history → develop`。各 commit は単独で動作 / テスト PASS の状態。

---

## 11. リスクとオープン論点

| ID | 論点 | 対応方針 |
|----|------|----------|
| O1 | filter 後に limit 件数に達しない可能性 | 一旦 `min(100, limit * 5)` 件取得 → filter → slice(limit)。multi-page 取得は YAGNI |
| O2 | 「採用回数」の解釈と semantics 一致 | `attempt_count` = 同一 `user_input_hash` 内の `created_at` 順 1-indexed = 「同じ質問について何回目の提案で Yes 採択したか」。`Decision.no_attempt_count` (累積 No 数のスナップショット) **ではない** ので、API 層で hash grouping して計算する (Section 3 参照)。production scale で N が大きくなったら SQL window function に置換 |
| O7 | hash grouping の計算量 | O(N), N = ユーザーの decision 総数。本機能では `RAW_CAP=1000` で頭打ち。それを超えるユーザーは古い hash group の attempt_count が不正確になる (= 表示は壊れないが厳密性を欠く)。hackathon scale で問題なし、production では SQL window function or per-hash caching で解決 |
| O3 | line-clamp vs truncate (改行の扱い) | truncate (文字数) + `truncate` CSS class (line-clamp-1) を両方適用、改行コードは表示前に空白置換 |
| O4 | 履歴の更新 trigger | choose API 成功時に React Query `invalidateQueries(["decisions", "history"])` を呼ぶか? → YAGNI (staleTime 30s で十分、デモでも refresh で見える) |
| O5 | プライバシー (user_input 内 PII) | DB の `user_input` 列は **生 (mask_pii 未適用)** で persist されている (engine.py の `mask_pii` は LLM への入力にのみ適用、永続化は raw)。本機能の API は `repo.list_by_user(user.user_id, ...)` で必ず認証ユーザー自身の user_id に固定されており、cross-user 参照 / admin override は **存在しない** ことを SEC-U4-09 (engine.py:311 `if decision.user_id != user_id` パターン) と整合して保証する。**残存リスク**: API access log / DB エクスポート / 監査ログ経由での運用者視認は可能 (= 本機能で増減せず、既存運用上の課題)。デモには影響なし、production 運用前に DB 暗号化 or `user_input` フィールド mask 化を別 issue で検討。 |
| O6 | silenced 決定の扱い | `user_choice="pending"` で残る (silenced は yes/no 不可)。choice=yes filter で自動除外、追加対応不要 |

---

## 12. 完了の定義 (DoD)

- [ ] API `GET /v1/decisions?limit=20&choice=yes` が動作し、unit/integration test PASS
- [ ] api-client `DecisionsModule.history()` が型付きで callable
- [ ] `DecisionHistoryList` が `/score` 末尾に表示され、空状態 / loading / error / 採用回数 (🌟/🔄) すべて目視確認
- [ ] 全 Web unit test PASS、既存テストへの回帰なし
- [ ] e2e Playwright 全 PASS (mock seed 環境)
- [ ] size-limit 違反なし
