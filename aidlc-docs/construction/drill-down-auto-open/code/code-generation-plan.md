# drill-down-auto-open — Code Generation Plan

**Feature ID**: drill-down-auto-open
**Phase**: AI-DLC CONSTRUCTION / Code Generation (Part 1: Planning)
**Created**: 2026-05-26
**Status**: 承認待ち (Gate 2 — architecture / multi-approach)
**Extensions enforced**: CONS-FLOW-01 (Exploration / blocking), CONS-FLOW-03 (Multi-approach / blocking), CONS-FLOW-05 (Confidence-filtered review / deferred to Review stage); CONS-FLOW-02/04/06/07 advisory
**Based on**: [requirements.md v2](../../../inception/drill-down-auto-open/requirements.md), [workflow-plan.md](../../../inception/drill-down-auto-open/workflow-plan.md), [application-design.md](../../../inception/drill-down-auto-open/application-design.md), [HTML mockup](../../../inception/drill-down-auto-open/mockups/proposal-final-before-after.html)

## 1. Exploration Findings (CONS-FLOW-01, blocking)

### 1.1 既存 patterns to reuse (path:line で引用)

| パターン | 引用 path:line | 再利用方法 |
|---|---|---|
| SwipeChoice 3 Yes path の setTimeout(180ms) callback | [packages/ui/src/composites/SwipeChoice.tsx:92-101](packages/ui/src/composites/SwipeChoice.tsx#L92), [:169-173](packages/ui/src/composites/SwipeChoice.tsx#L169), [:238-242](packages/ui/src/composites/SwipeChoice.tsx#L238) | `onYesSync?: () => void` callback を **setTimeout の前に** invoke (try-catch で保護) — 3 path 同一 pattern |
| handleChoose の drill-down 分岐 | [apps/web/src/features/decision/DecisionResult.tsx:171-178](apps/web/src/features/decision/DecisionResult.tsx#L171) | `if (choice === "yes" && !isFinal && onDrillDown)` は維持. window.open は handleChoose 内ではなく SwipeChoice の `onYesSync` で発火することで API await 影響なし |
| 既存 external CTA `<a target="_blank" rel="noopener noreferrer">` | [apps/web/src/features/decision/DecisionResult.tsx:437-456](apps/web/src/features/decision/DecisionResult.tsx#L437) | 同 URL を `window.open(url, "_blank", "noopener,noreferrer")` で発火、CTA は fallback として残置 (NFR-DAO-01) |
| engine.py prompt branch condition | [apps/api/src/yesman_api/domain/decision/engine.py:272-282](apps/api/src/yesman_api/domain/decision/engine.py#L272) (builtin), [:771-775](apps/api/src/yesman_api/domain/decision/engine.py#L771) (anonymous) | `remaining <= 1` → `depth == MAX_DRILL_DEPTH` に厳密化、final guide 文言を疑問形「開きますか?」要求に変更 (3 path) |
| MAX_DRILL_DEPTH module-level 定数 | [apps/api/src/yesman_api/domain/decision/engine.py:74](apps/api/src/yesman_api/domain/decision/engine.py#L74) | 値 4 維持、3 path の prompt 分岐から module-level として参照 |
| is_final 判定 3 箇所 | [engine.py:470](apps/api/src/yesman_api/domain/decision/engine.py#L470), [:1039](apps/api/src/yesman_api/domain/decision/engine.py#L1039), [:1269](apps/api/src/yesman_api/domain/decision/engine.py#L1269) | `is_final = depth >= MAX_DRILL_DEPTH` 維持 (prompt 分岐 condition と境界一致) |
| mock_adapter DRILL_DOWN_PROPOSALS + _pick_proposal | [apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py:30-39](apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py#L30), [:67-86](apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py#L67) | `[4]` の文言だけ「開きますか?」末尾に変更、`[1]..[3]` は断定形維持、`_pick_proposal` ロジック不変 |
| useChooseMutation cache invalidate | [apps/web/src/features/decision/useDecision.ts:9-24](apps/web/src/features/decision/useDecision.ts#L9) | `["score"]` + `["decisions"]` invalidate 既存、本 feature では変更不要 |
| drill-down e2e helper clickYesUntilNudgeBanner | [tests/e2e/fixtures/drill-down.ts](tests/e2e/fixtures/drill-down.ts) | maxClicks=8 既存、comment update 「Yes 5 click で final + popup 発火」 |

### 1.2 隣接 components の影響

| Component | 影響 | 対応 |
|---|---|---|
| anonymous-strangers / quick-start / decision 各 feature の SwipeChoice 使用箇所 | SwipeChoice props 拡張 (optional 2 個) で **非破壊** | 既存 caller の test を regression run、追加変更不要 |
| NudgeBanner ([NudgeBanner.tsx](apps/web/src/features/decision/NudgeBanner.tsx)) | window.open 発火後も従来通り render | 変更なし |
| service_catalog.pick_service | proposal_text に「開きますか?」を含むようになるが、keyword 検出は service 名 (Amazon Prime Video / 出前館 等) で hit | 変更なし、既存 catalog policy 維持 |
| score / decisions history (`["score"]` `["decisions"]` query) | choose API 後 invalidate 既存 | 変更なし |

### 1.3 INCEPTION canonical references (UI unit のため必須)

- [aidlc-docs/inception/application-design/screens/03-proposal-card.svg](aidlc-docs/inception/application-design/screens/03-proposal-card.svg) — FE-DESIGN-01 継承元 (proposal text / Yes/No / pink nudge 構造)
- [aidlc-docs/inception/drill-down-auto-open/mockups/proposal-final-before-after.html](aidlc-docs/inception/drill-down-auto-open/mockups/proposal-final-before-after.html) — 本 feature 固有の visual supplement (VIS-SUPP-03 Compliant)

### 1.4 隣接コードの pre-existing rule 違反 surveillance

- **No adjacent yesman-impl / extension violations detected** in the touched files
- 既存の `pink-nudge` banner 切替 ([DecisionResult.tsx:361-394](apps/web/src/features/decision/DecisionResult.tsx#L361)) は FE-DESIGN-03 palette 適合済
- 既存 CTA `<a>` は SECURITY-13 (noopener,noreferrer) 適合済 (確認: [DecisionResult.tsx:437-456](apps/web/src/features/decision/DecisionResult.tsx#L437))
- mockup 内の inline color values は INCEPTION palette HEX と一致

### 1.5 設計に与えた影響 (findings → design rationale)

| Finding | 設計判断 |
|---|---|
| SwipeChoice 3 path で setTimeout(180ms) が共通 | `onYesSync` を **3 path 同一位置 (setTimeout 前)** に挿入 — popup block 完全回避を全 path で保証 |
| 既存 CTA `<a>` は SECURITY-13 適合済 | window.open でも同 option `("noopener,noreferrer")` を採用、両者の安全水準を統一 |
| handleChoose に window.open を入れると await 越えで block されうる | window.open は SwipeChoice の `onYesSync` callback に分離、handleChoose は choose API のみ責務 — concerns 分離 + popup block 完全回避 (FR-DAO-03 / FR-DAO-09) |
| mock の `_pick_proposal` は chain_len marker 検出のみ | `[4]` 文言変更だけで他 mock test は影響なし |

## 2. Proposal Approaches (CONS-FLOW-03, blocking)

3 案を提示し、推奨を justify する.

---

### Approach A: Minimal-change (SwipeChoice 触らず DecisionResult のみ)

**Files to modify**:
- 既存: [apps/web/src/features/decision/DecisionResult.tsx:171-197](apps/web/src/features/decision/DecisionResult.tsx#L171) (handleChoose 拡張、await mutateAsync の前に window.open)
- 既存: [apps/api/src/yesman_api/domain/decision/engine.py:272-282](apps/api/src/yesman_api/domain/decision/engine.py#L272), [:771-775](apps/api/src/yesman_api/domain/decision/engine.py#L771) (prompt 分岐厳密化)
- 既存: [apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py:30-39](apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py#L30) (DRILL_DOWN_PROPOSALS[4])
- 既存 test: [drill-down-decision.spec.ts](tests/e2e/tests/drill-down-decision.spec.ts), [DecisionResult.test.tsx](apps/web/tests/features/decision/DecisionResult.test.tsx) 拡張

**Pros**:
- 改修ファイル最少 (3 source + 2 test)
- packages/ui は不変、他 feature の SwipeChoice 利用箇所への影響ゼロ
- diff が読みやすく、revert もシンプル

**Cons**:
- **handleChoose は SwipeChoice の `setTimeout(180ms)` callback から呼ばれる** ため、window.open が user gesture chain から ~180ms 離れる
- **iOS Safari / Firefox strict で popup block 多発リスク** (modern Chrome は許容するが strict mode で不安定)
- requirements.md **FR-DAO-09 を satisfy できない** (FR-DAO-09 は SwipeChoice 全 Yes path で user gesture chain 内同期発火を要求)
- NFR-DAO-10 (aria-label 動的切替) を実現するには SwipeChoice か親側 wrapper を弄る必要があり、結局 minimal change で済まない

**Compliance impact**:
- FR-DAO-09: ❌ Non-compliant (popup block 回避未達)
- NFR-DAO-10: ⚠️ Partial (動的 aria-label を SwipeChoice の外側でやろうとすると DOM 直接操作になり FE-DESIGN-07 違反)

---

### Approach B: Clean (SwipeChoice 拡張 + onYesSync / yesAriaLabelOverride 追加) ⭐

**Files to modify**:
- 既存: [packages/ui/src/composites/SwipeChoice.tsx](packages/ui/src/composites/SwipeChoice.tsx) — 新 optional props 2 個 (`onYesSync`, `yesAriaLabelOverride`) を追加、3 Yes path で `onYesSync?.()` を setTimeout 前に try-catch invoke
- 既存: [apps/web/src/features/decision/DecisionResult.tsx](apps/web/src/features/decision/DecisionResult.tsx) — SwipeChoice に上記 props を `isExternalOpenable` 条件で渡す
- 既存: [apps/api/src/yesman_api/domain/decision/engine.py](apps/api/src/yesman_api/domain/decision/engine.py) — 3 path の prompt 分岐 condition 厳密化 (`remaining <= 1` → `depth == MAX_DRILL_DEPTH`)、final guide 文言疑問形要求
- 既存: [apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py](apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py) — DRILL_DOWN_PROPOSALS[4] のみ疑問形
- 既存 test 拡張 + 新 test 1 件 (SwipeChoice onYesSync verify)
- (新規 file 無し)

**Pros**:
- requirements.md **FR-DAO-09 を完全 satisfy** (3 path 全部で user gesture chain 内同期発火)
- **NFR-DAO-10 (a11y) も最小 surface で実現** (yesAriaLabelOverride で動的切替、DOM 直接操作なし)
- SwipeChoice は **non-breaking** (新 props は optional)、他 feature 影響ゼロ
- **concerns 分離が明確** (window.open は SwipeChoice の責務、choose API は DecisionResult の責務)
- popup block 完全回避 — iOS Safari / Firefox strict でも安全
- packages/ui composite として **将来 reuse 可能** (他の "Yes で外部 open" feature にも応用可)
- FE-DESIGN-07 適合 — composite 拡張で ad-hoc 化を防ぐ

**Cons**:
- packages/ui に touch (= TypeScript の API 拡張)、SwipeChoice unit test を 3 path × 2 prop の組合せで追加する必要あり
- diff は Approach A より少し大きい (1 ファイル増)

**Compliance impact**:
- FR-DAO-01..09: ✅ All compliant
- NFR-DAO-01..10: ✅ All compliant
- FE-DESIGN-07: ✅ Compliant (extended) — composite 拡張で documented

---

### Approach C: Pragmatic (DecisionResult で `<a>` を programmatic click) — 参考

**Files to modify**:
- 既存: [apps/web/src/features/decision/DecisionResult.tsx](apps/web/src/features/decision/DecisionResult.tsx) — `<a ref={ctaRef} ...>` を hidden で render、handleChoose で `ctaRef.current?.click()` を `await mutateAsync` の前に同期 fire
- 既存: engine.py / mock_adapter.py 改修は同じ

**Pros**:
- SwipeChoice 触らずに済む
- `<a>` の click は browser によっては popup block 回避できる場合あり

**Cons**:
- programmatic `<a>.click()` も `setTimeout` 越えだと block されうる (実質 Approach A と同じ問題)
- hidden `<a>` を render する hack で FE-DESIGN-04 (anti-default) 違反気味
- a11y 観点で hidden link は混乱を招く可能性
- 全体として Approach A と Clean の中途半端、利点が薄い

**Compliance impact**:
- FR-DAO-09: ❌ Non-compliant
- FE-DESIGN-04: ⚠️ Borderline

---

### 推奨: ✅ **Approach B (Clean)**

**根拠**:
1. **requirements.md FR-DAO-09 は本 feature の Critical 制約** (ultrathink C2 で specifically 追加された). Approach A / C はこれを満たせない
2. **AD §2.1 で documented した SwipeChoice 公開 API 仕様と完全一致** — design と実装が無矛盾
3. **長期保守性**: composite 拡張 = `packages/ui` の正規 enhancement として将来他 feature にも reuse 可能 (e.g., 「合議結果を share する」「予約サイトを開く」等の future feature)
4. **Hackathon Pragmatism との両立**: 改修 surface は 4 ファイル + 2 test (Approach A の 3 + 2 から 1 ファイル増のみ)、diff size は許容範囲

その他の project-specific factor:
- 本 project は既に anonymous-strangers / quick-start で `packages/ui` 拡張パターン (新 prop 追加 + non-breaking) を採用しており、整合
- Hackathon 期間中の単独開発で iOS Safari 手動確認も含むため、popup block 完全回避は user 体験上重要

## 3. Generation Plan (Part 2 で実行する作業 checklist)

承認後、以下を **指定順序** で実装:

### 3.1 Backend (Python)

- [ ] **3.1.1** [engine.py](apps/api/src/yesman_api/domain/decision/engine.py) builtin path (L272 付近): `if remaining <= 1:` → `if depth == MAX_DRILL_DEPTH:`、final guide を疑問形「開きますか?」要求に変更 (AD §2.3 の text に従う)
- [ ] **3.1.2** engine.py anonymous persona prompt (L771 付近): 同上の改修
- [ ] **3.1.3** engine.py mixed path (該当箇所): 同上の改修
- [ ] **3.1.4** [mock_adapter.py](apps/api/src/yesman_api/infrastructure/decision/llm_providers/mock_adapter.py) DRILL_DOWN_PROPOSALS[4]: `"...観ましょう。"` → `"...開きますか?"` (FR-DAO-08)
- [ ] **3.1.5** API unit test 確認: `pytest tests/unit/decision/` で 80 件全 PASS

### 3.2 UI primitive (TypeScript)

- [ ] **3.2.1** [SwipeChoice.tsx](packages/ui/src/composites/SwipeChoice.tsx) interface: `onYesSync?: () => void` + `yesAriaLabelOverride?: string` を `SwipeChoiceProps` に追加
- [ ] **3.2.2** SwipeChoice の 3 Yes path で `try { onYesSync?.(); } catch {}` を **setTimeout(180ms) の前** (button click path では `onYes()` の前) に挿入
- [ ] **3.2.3** Yes button の `aria-label` を `yesAriaLabelOverride ?? "Yes、提案を採択"` に変更
- [ ] **3.2.4** SwipeChoice 新 unit test (`packages/ui/tests/composites/SwipeChoice.test.tsx`): 3 path × onYesSync invoke order + try-catch + aria-label override

### 3.3 Frontend feature (TypeScript / React)

- [ ] **3.3.1** [DecisionResult.tsx](apps/web/src/features/decision/DecisionResult.tsx): `isExternalOpenable = isFinal && service !== null` derive、SwipeChoice に `onYesSync` / `yesAriaLabelOverride` を条件付き渡し (AD §2.2 の pseudo-code に従う)
- [ ] **3.3.2** [DecisionResult.test.tsx](apps/web/tests/features/decision/DecisionResult.test.tsx): `vi.spyOn(window, "open")` で window.open call の引数を verify、isFinal false / service null 時 undefined を渡すことを verify
- [ ] **3.3.3** web vitest 全 PASS 確認: `pnpm vitest run tests/features/decision/`

### 3.4 E2E (Playwright)

- [ ] **3.4.1** [drill-down-decision.spec.ts](tests/e2e/tests/drill-down-decision.spec.ts) 既存 "Yes 5 連打で final" を **疑問形 proposal text 検出** + **`page.waitForEvent("popup")`** pattern に拡張 (requirements §8 の code snippet)
- [ ] **3.4.2** popup URL `expect(popup.url()).toContain("amazon.co.jp")` + `await popup.close()` で副作用回避
- [ ] **3.4.3** [drill-down.ts](tests/e2e/fixtures/drill-down.ts) helper comment update: 「Yes 5 click で final + popup 発火」
- [ ] **3.4.4** e2e 全 PASS 確認

### 3.5 Real-LLM 検証 (option)

- [ ] **3.5.1** `RUN_REAL_LLM_E2E=1 pnpm playwright test drill-down-real-llm-multi` で Amazon 系到達率 ≥ 90% 確認
- [ ] **3.5.2** real-LLM spec で final proposal text に `/開きますか[??]/` regex match を assert 追加 (任意)

### 3.6 手動確認

- [ ] **3.6.1** Chrome デスクトップ + Pixel 5 emulation: 「映画見たい」→ Yes 5 click → 新タブで Amazon Prime Video が開く
- [ ] **3.6.2** iOS Safari (NFR-DAO-04 M4 scope, 手動): popup block されないことを確認、される場合は CTA fallback で復帰可能を確認

### 3.7 Documentation update

- [ ] **3.7.1** [aidlc-docs/aidlc-state.md](aidlc-docs/aidlc-state.md) に Post-CONSTRUCTION 改修フェーズ v4 / drill-down-auto-open を追記
- [ ] **3.7.2** [memory](/Users/morimatsu/.claude/projects/-Users-morimatsu-lab-ai-dlc-hackathon/memory/) に新 feedback / project memory が必要か判断 (drill-down は既に [feedback_amazon_first_service_catalog.md](memory/feedback_amazon_first_service_catalog.md) で documented、本 feature は実装詳細なので memory 不要かもしれない)

### 3.8 完了確認

- [ ] **3.8.1** requirements.md §10 Compliance Matrix の各 rule status を実装後の actual で再評価 (Compliant が維持されているか)
- [ ] **3.8.2** [phase-summary.md](aidlc-docs/construction/drill-down-auto-open/code/phase-summary.md) 生成 (CONS-FLOW-07 advisory だが、適用しておくと audit が綺麗): files 変更一覧 / tests 一覧 / Compliance matrix 最終版 / Unresolved TODOs

## 4. Risk / Rollback

| 項目 | 評価 |
|---|---|
| Risk | **Low** (4 file 改修、optional prop / 文言変更が中心) |
| Rollback | 各 file 単位で revert 可能、SwipeChoice 新 prop は optional なので backward-compatible |
| Test 戦略 | 既存 test 全 PASS + 新 test 追加で coverage 維持 |
| 既存挙動への影響 | 中間段 (depth < MAX) の挙動は不変、他 feature の SwipeChoice 使用箇所は不変 |

## 5. Approval Gate 2 (CONS-FLOW-04 advisory + CONS-FLOW-03 blocking)

> CONS-FLOW-03 (Multi-approach) は **blocking**. 推奨 Approach B (Clean) で進めることを user に確認.

**承認の方法**:
- 「**Approach B で OK**」「**Clean で進める**」「**proceed**」など、Approach の明示があると安全
- 別 Approach (A or C、または自由記述) を選びたい場合はその旨を明示
- 修正点があれば箇条書きで指摘

承認後、**Generation (実装)** に進みます (Part 2). 完了後 **Review (CONS-FLOW-05)** で confidence ≥ 80% findings の有無を確認し、Gate 3 で最終承認をいただきます.
