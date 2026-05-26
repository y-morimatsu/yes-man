# drill-down-auto-open — Review Findings (CONS-FLOW-05)

**Reviewed**: 2026-05-26
**Reviewer agent**: feature-dev:code-reviewer (invoked from main agent)
**Confidence threshold**: 80% (blocking) / <80% advisory
**Scope**: 4 source files + 2 test files + 1 e2e refactor (Approach B Clean 実装)

## Summary

| Severity | Blocking (>=80%) | Advisory (<80%) |
|---|---|---|
| Critical | 0 | 0 |
| Important | **1** | 1 |
| Minor | 0 | 2 |
| **計** | **1** | **3** |

## Blocking Findings

| # | Rule ID | Location | Severity | Confidence | Description | Suggested Fix |
|---|---|---|---|---|---|---|
| 1 | DAO-RVW-001 | [tests/e2e/tests/drill-down-decision.spec.ts:97-102](tests/e2e/tests/drill-down-decision.spec.ts#L97) | Important | **82** | `context.waitForEvent("page")` で返る `popup` に対し即座に `popup.url()` を評価しているが、Playwright の `BrowserContext.waitForEvent("page")` はページ生成時点 (about:blank) で解決するため、`window.open` の navigation が完了する前に `popup.url()` が `about:blank` を返して flaky になる race condition。加えて要件書 §8 指定の `page.waitForEvent("popup")` と異なる API を使用しており、他ページ起因の新規タブも捕捉する誤検知リスクあり。 | `page.waitForEvent("popup")` に変更し、`popup.waitForURL(/amazon\.co\.jp/)` を `popup.url()` 評価の前に挿入する: `const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 10_000 }), yesBtnFinal.click()]); await popup.waitForURL(/amazon\.co\.jp/, { timeout: 5_000 }); expect(popup.url()).toContain("amazon.co.jp"); await popup.close();` |

## Advisory Findings (non-blocking)

| # | Rule ID | Location | Severity | Confidence | Description | Suggested Fix |
|---|---|---|---|---|---|---|
| A1 | DAO-RVW-002 | [packages/ui/tests/composites/SwipeChoice.test.tsx](packages/ui/tests/composites/SwipeChoice.test.tsx) header comment | Important | 75 | テストファイルの JSDoc コメント「3 Yes path (right-swipe / fallback button / ArrowRight) すべてで onYesSync 発火を検証」が誤解を招く. 実際は **2 path (button click / ArrowRight)** のみカバー、right-swipe path (react-swipeable の `onSwipedRight`) のテストは欠落. jsdom での touch gesture シミュレーション困難という技術的制約はあるが、コメントが実態を誇張. 実装 (SwipeChoice.tsx:131) は目視確認可能だがテストによる回帰保護なし. | コメントを「jsdom でテスト可能な 2 path (button click / ArrowRight) を検証」に修正、または `fireEvent.pointerDown/Move/Up` でスワイプシミュレーション追加 (react-swipeable は `trackMouse: true` で pointer events 利用可) |
| A2 | DAO-RVW-003 | [packages/ui/src/composites/SwipeChoice.tsx:77-79](packages/ui/src/composites/SwipeChoice.tsx#L77) | Minor | 65 | `invokeYesSync` の実装直近コメント「3 Yes path すべてで setTimeout(onYes, 180) の前に呼ぶ」が button click path では不正確. button click path は `setTimeout` 無しで `onYes()` を直接同期呼出、`invokeYesSync()` は `onYes()` の直前. 実装の正確性は問題ないがメンテナビリティ minor issue. | コメントを「swipe / keyboard path では setTimeout(onYes, 180) の前に、button click path では onYes() の直前に同期呼出す」に修正 |
| A3 | DAO-RVW-004 | [apps/web/tests/features/decision/DecisionResult.test.tsx:228-247](apps/web/tests/features/decision/DecisionResult.test.tsx#L228) | Minor | 70 | `isFinal=false && onDrillDown=undefined` のケースで `handleChoose("yes")` が通常 `choose.mutateAsync` 経路に fallback するシナリオのテストが欠如. 実装上は `if (choice === "yes" && !isFinal && onDrillDown)` 分岐で自然 fallback するが、`window.open` が呼ばれないことの assertion 無し. | `it("isFinal=false && onDrillDown=undefined: window.open も onDrillDown も呼ばれない", ...)` を追加し、openSpy が未コールであることを assert |

## Compliance Re-check

要件 FR-DAO-01..09 / NFR-DAO-01..10 / 各 Extension rule に対する実装の verify:

| Rule | Status | Notes |
|---|---|---|
| FR-DAO-01 (depth==MAX のみ疑問形) | ✅ Compliant | 3 path (builtin L275 / anonymous L777 / mixed L1259) 厳密一致 |
| FR-DAO-02 (window.open 発火) | ✅ Compliant | DecisionResult.tsx L342 |
| FR-DAO-03 (await 前に同期発火) | ✅ Compliant | onYesSync は SwipeChoice 内で発火、handleChoose の await mutateAsync より前 |
| FR-DAO-04 (UI state 維持) | ✅ Compliant | NudgeBanner + chosen card + CTA 残置確認 |
| FR-DAO-05 (中間段 window.open なし) | ✅ Compliant | DecisionResult test L207-226 |
| FR-DAO-06 (service=null は open なし) | ✅ Compliant | 同上 |
| FR-DAO-07 (全 service 同一挙動) | ✅ Compliant | 実装は service.url を汎用使用 |
| FR-DAO-08 (mock DRILL_DOWN_PROPOSALS[4] 疑問形) | ✅ Compliant | mock_adapter.py L39 |
| FR-DAO-09 (SwipeChoice 3 path 同期発火) | ⚠️ Compliant (実装) / Partial (test) | 実装 OK、テストは 2 path のみ (→ Advisory A1) |
| NFR-DAO-01 (CTA fallback) | ✅ Compliant | DecisionResult L453-472 |
| NFR-DAO-02 (元タブ state 維持) | ✅ Compliant | window.open は新タブ、React state 影響なし |
| NFR-DAO-03 (回帰 PASS) | ✅ Compliant | api 80 / ui 9 / web 123 / e2e 2 全 PASS |
| NFR-DAO-06 (noopener,noreferrer) | ✅ Compliant | SECURITY-13 適合確認 |
| NFR-DAO-07 (popup block fail-safe) | ✅ Compliant | SwipeChoice try-catch + CTA fallback |
| NFR-DAO-08 (FE-DESIGN-07 component reuse) | ✅ Compliant | 新 prop 2 個 non-breaking |
| NFR-DAO-10 (a11y aria-label) | ✅ Compliant | "Yes、提案を採択 (新しいタブで XXX を開きます)" |
| SECURITY-13 (Integrity) | ✅ Compliant | `noopener,noreferrer` 確認 |
| SECURITY-15 (Exception handling) | ✅ Compliant | invokeYesSync try-catch + handleChoose try-catch |
| FE-DESIGN-07 (Component reuse) | ✅ Compliant (extended) | SwipeChoice non-breaking 拡張 |
| CONS-FLOW-01 (Exploration) | ✅ Compliant | code-generation-plan.md §1 で 9 件 path:line 引用 |
| CONS-FLOW-03 (Multi-approach) | ✅ Compliant | 3 approach 提示、推奨 B を justify |
| CONS-FLOW-05 (Confidence-filtered review) | ✅ **本 doc で実施** | confidence>=80 の blocking 1 件、<80 advisory 3 件 |

**Blocking findings の Compliance impact**: DAO-RVW-001 は **NFR-DAO-03 (回帰 PASS) の test reliability** に影響. 現状 10 秒で PASS 観測されているが、CI 環境 (高負荷時 / network 不安定時) で flaky 化リスクあり.

## Recommended Disposition

**✅ Approve with required fix (Blocking #1 修正後 Approve)**

**根拠**:
- Blocking Finding 1 件 (DAO-RVW-001) は test reliability の race condition で、修正は 2 行追加で完結
- core 機能の実装品質は高く、FR-DAO-01..09 / NFR-DAO-01..10 / SECURITY-13/15 / FE-DESIGN-07 全 compliant
- popup block 回避・a11y semantic・noopener,noreferrer・fail-safe いずれも要件通り実装
- Advisory 3 件は機能への実害なく、minor 改善のため次 PR / follow-up で対応可

**Action items**:
1. **必須 (Blocking #1 修正)**: drill-down-decision.spec.ts の popup 検証パターンを `page.waitForEvent("popup")` + `popup.waitForURL(/amazon/)` に変更
2. **任意 (Advisory)**: A1 (test comment 修正 or right-swipe test 追加), A2 (SwipeChoice コメント修正), A3 (DecisionResult fallback test 追加) — 次 PR / Code Generation v2 で対応

## Resolutions (2026-05-26 14:57)

| ID | Action Taken | 結果 |
|---|---|---|
| **DAO-RVW-001 (Blocking)** | drill-down-decision.spec.ts:96-106 を `page.waitForEvent("popup")` + `popup.waitForURL(/amazon\.co\.jp/)` に変更 | ✅ Fixed. e2e 2 件 PASS 再確認済 (10.7s) |
| **DAO-RVW-002 (Advisory A1)** | 残置 (jsdom 制約のため次 PR で `fireEvent.pointer*` 追加を検討) | Deferred |
| **DAO-RVW-003 (Advisory A2)** | SwipeChoice.tsx:77-81 のコメントを「swipe/keyboard は setTimeout 前、button click は onYes 直前」に修正 | ✅ Fixed |
| **DAO-RVW-004 (Advisory A3)** | 残置 (fallback path test 追加は次 PR で) | Deferred |

## Final Disposition: ✅ **Approve (Gate 3 PASSED)**

Blocking 修正済 + e2e retest PASS 確認. Advisory 2 件は deferred (次 PR / 手動 follow-up).
