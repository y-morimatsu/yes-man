# YES/NO Quick-Start 実装計画

**Plan ID**: 2026-05-22-yes-no-quickstart
**Spec**: [docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md](../specs/2026-05-22-yes-no-quickstart-design.md)
**Branch**: `feature/quick-start-yes-no` (from `develop`)
**Approved Spec Version**: v2 (2026-05-22、Bedrock pre-generation 仕様確定)
**承認済み Open Issues**: OI-1 連続 5 回 NO / OI-2 catchAll 末尾固定 / OI-3 Y/N shortcut 必須 / OI-4 reload で reset / OI-5 session 中復帰不可 / OI-6 手動 script + checked-in / OI-7 30 件 / OI-8 Sonnet 4.6

---

## Phase 1: API 側 Pre-Generation Script

### Task 1.1: Pydantic schema 定義
- [ ] `apps/api/src/yesman_api/application/quick_start/__init__.py` (空 package marker)
- [ ] `apps/api/src/yesman_api/application/quick_start/schema.py`:
  - `QuickStartTemplate` (id / title / hours / dayKind / preferenceTag / priority)
  - `QuickStartTemplatePool` (generatedAt / generatedBy / schemaVersion / templates / catchAll)
  - hours は 0-23 の整数 list (Pydantic validator で範囲制約)
  - dayKind は `Literal["weekday","weekend","any"]`
  - id は kebab-case ASCII (regex validator)

### Task 1.2: Script 本体
- [ ] `apps/api/scripts/generate_quick_start_templates.py`:
  - argparse: `--count` (default 30) / `--out` (default `apps/web/src/features/decision/quickStartTemplates.generated.json`) / `--model` (default Sonnet 4.6)
  - 既存 `BedrockLLMAdapter` を再利用 or LiteLLM 直接呼び出し
  - prompt 設計:
    - role: 日本語 UX writer + AI 哲学者
    - 出力 format: JSON only (markdown code fence なし)、`templates: [...]` 配列で N+1 件 (本体 N 件 + catchAll 1 件)
    - 制約: title は 4-15 文字、id は kebab-case 英小文字、hours は適切な時刻帯を選ぶ
    - YesMan の哲学 (人間最後の仕事は YES で承認すること、日常の小さな決定を YES/NO で促す) を inject
  - validation:
    - LLM 出力を Pydantic `QuickStartTemplatePool.model_validate` で parse
    - 失敗時 max 3 retry (LLM に「前回の出力は schema 違反、再生成せよ」を inject)
    - 全 retry 失敗で `sys.exit(1)` + clear error message
  - 成功時:
    - `generatedAt` = `datetime.now(timezone.utc).isoformat()`
    - `generatedBy` = model id
    - `schemaVersion` = 1
    - JSON 出力 (indent=2, ensure_ascii=False)

### Task 1.3: Script test
- [ ] `apps/api/tests/scripts/test_generate_quick_start_templates.py`:
  - LiteLLM `acompletion` を monkeypatch で mock
  - happy path: valid JSON → schema validate OK → ファイル書き込み確認
  - schema 違反 → retry → 2 回目 success
  - 3 回失敗 → exit 1
  - kebab-case id validator が機能する

---

## Phase 2: Script 実行 / JSON 生成

### Task 2.1: 実行
- [ ] dev 環境で `cd apps/api && uv run python scripts/generate_quick_start_templates.py`
- [ ] 出力 JSON を目視で品質 review (title が日本語として自然か、hours が妥当か)
- [ ] 不適切なら prompt 微調整 + 再実行

### Task 2.2: 認証不可時の fallback
- [ ] Bedrock 認証が dev 環境で失敗する場合:
  - script 自体は完成 / commit する
  - JSON は手書き seed 30 件で先行 commit (top に `generatedBy: "seed-manual"` を明示)
  - user 環境で再生成する想定で進める

---

## Phase 3: Web 側 実装

### Task 3.1: Type 定義 + selection pure function
- [ ] `apps/web/src/features/decision/quickStartTemplates.ts`:
  - `QuickStartTemplate` / `QuickStartTemplatePool` TS 型
  - `import templatesJson from "./quickStartTemplates.generated.json"`
  - pure `selectQuickStartQueue(now: Date, excludeIds: Set<string>): QuickStartTemplate[]`
    - now から hours / dayKind を resolve
    - excludeIds (直近 24h YES 採択 id) を除外
    - priority 降順 + (tie-break: id ASC) で sort
    - 末尾に catchAll を強制追加

### Task 3.2: localStorage helper
- [ ] `apps/web/src/features/decision/quickStartHistory.ts`:
  - `getRecentYesIds(now: Date): Set<string>` (24h 以内に YES 採択した template.id を localStorage から取得)
  - `recordYes(id: string, at: Date): void`
  - localStorage key: `yesman:quickstart:recent-yes` / value: `{ id, at }[]`
  - 24h 過ぎたエントリは get 時に prune

### Task 3.3: useQuickStart hook
- [ ] `apps/web/src/features/decision/useQuickStart.ts`:
  - state: `queue` / `current` / `noCount` / `mode: "quick" | "text"`
  - actions: `accept(): string` (current.title を返す + recordYes) / `reject(): void` (noCount++) / `switchToText(): void`
  - noCount === 5 で mode = "text" に切替
  - queue は init 時に `selectQuickStartQueue` で構築、reject 時に shift
  - now は injectable (test 用)

### Task 3.4: QuickStartCard component
- [ ] `apps/web/src/features/decision/QuickStartCard.tsx`:
  - props: `title: string`, `noCount: number`, `onYes(): void`, `onNo(): void`, `onSwitchToText(): void`
  - UI は spec §7 mockup 通り (rounded-2xl + brand-600 border + coral YES + white NO + 「✏️ 自分で入力する」 link)
  - aria-live="polite" on card
  - keyboard listener: Y → onYes / N → onNo (Y/N キーボード hint は kbd 要素で表示)
  - NO 1〜4 で薄く「▼ NO {n}/5」表示 (5 で fallback 発火するので 4 まで)

### Task 3.5: DecisionPage 改修
- [ ] `apps/web/src/features/decision/DecisionPage.tsx`:
  - 初期 status === "idle" の場合、`mode === "quick"` なら QuickStartCard 表示、`mode === "text"` なら既存 textbox + voice
  - QuickStartCard の onYes で `dispatch({ type: "setInput", input: title })` + 既存 start ロジック呼び出し
  - 既存 textbox + voice UI は QuickStartCard のすぐ下に既存 mockup 通りに配置

### Task 3.6: strings 拡張
- [ ] `apps/web/src/features/decision/strings.ts`:
  - `quickStartSuffix`: "してみますか？"
  - `quickStartYes`: "✅ YES"
  - `quickStartNo`: "❌ NO"
  - `quickStartSwitchToText`: "✏️ 自分で入力する"
  - `quickStartKeyboardHint`: "Y キー = YES / N キー = NO"

---

## Phase 4: Tests

### Task 4.1: Web unit tests
- [ ] `apps/web/tests/features/decision/quickStartTemplates.test.ts`:
  - 11-14 時の平日 → lunch-weekday が queue 先頭
  - 18 時 weekend → dinner / weekend-movie 系が含まれる
  - excludeIds で除外確認
  - catchAll が常に末尾
  - 同一 priority の tie-break が stable

- [ ] `apps/web/tests/features/decision/quickStartHistory.test.ts`:
  - recordYes + getRecentYesIds 往復
  - 24h 経過した entry が prune される (now を injectable に)

- [ ] `apps/web/tests/features/decision/useQuickStart.test.tsx`:
  - accept で title 返却 + recordYes 呼ばれる
  - reject で noCount++ + queue shift
  - noCount === 5 で mode === "text" に遷移
  - switchToText で即 mode === "text"

- [ ] `apps/web/tests/features/decision/QuickStartCard.test.tsx`:
  - YES クリックで onYes
  - NO クリックで onNo
  - Y キーで onYes / N キーで onNo
  - 「自分で入力」 link クリックで onSwitchToText
  - aria-live="polite" attribute 確認

- [ ] `apps/web/tests/features/decision/DecisionPage.test.tsx` 更新:
  - 初期 render で QuickStartCard が表示される (textbox は隠れる)
  - 5 連続 NO で textbox 出現
  - YES → 既存 stream 開始の dispatch 確認

### Task 4.2: API unit test (Phase 1.3 で記述済)

### Task 4.3: E2E
- [ ] `tests/e2e/tests/quick-start.spec.ts`:
  - シナリオ 1 (YES happy): 起動 → カード表示 → YES クリック → 合議開始 (utterance bubble 出現)
  - シナリオ 2 (3-NO 後 YES): NO 3 回 → 4 件目で YES → 合議開始
  - シナリオ 3 (5-NO fallback): NO 5 回 → textbox 出現 → 「決定する」が dependently 動作

---

## Phase 5: Documentation

### Task 5.1: README 追記
- [ ] `README.md` の dev workflow セクションに:
  - 「QuickStart template の再生成」 sub-section
  - command: `cd apps/api && uv run python scripts/generate_quick_start_templates.py`
  - 出力先と git commit するか否か
  - AWS 認証要件 (Bedrock access、region)

### Task 5.2: aidlc-state.md 更新
- [ ] `Latest Post-CONSTRUCTION Commit` を新 commit に更新
- [ ] `Post-CONSTRUCTION 改修フェーズ v3` セクションに本仕様を追加

---

## Phase 6: Verify + Ship

### Task 6.1: Verify
- [ ] `pnpm --filter @yesman/web test -- --run` → ALL PASS
- [ ] `pnpm --filter @yesman/web build` → success
- [ ] `cd apps/api && uv run pytest tests/scripts/ -v` → script test PASS
- [ ] e2e は dev サーバ起動が必要なので、まず unit test + build で gate、e2e は manual で時間あれば実行
- [ ] dev サーバ起動 → 手動ブラウザで QuickStart カード表示確認

### Task 6.2: Commit + Push + PR + Merge
- [ ] git add (新規 / 修正ファイルを specific path で stage、playwright-report や uv.lock は除外)
- [ ] 1 commit にまとめる: `feat(api,web): YES/NO Quick-Start (Bedrock pre-generated template pool)`
- [ ] git push -u origin feature/quick-start-yes-no
- [ ] gh pr create --base develop
- [ ] gh pr merge --merge (self-approve 不可は前回と同じ pattern、hackathon pragmatism で review 省略)
- [ ] ローカル develop を pull で sync

---

## Risk / Mitigation

| Risk | Mitigation |
|---|---|
| Bedrock 認証が dev 環境で動かない | Phase 2.2 fallback: seed JSON で先行 commit、後で再生成 |
| LLM が schema 違反を続ける | retry 3 回 + clear error、seed JSON で fallback |
| DecisionPage の既存 test が壊れる | Phase 4.1 で test 更新を計画的に実施、既存挙動 (textbox 経由の合議) は textbox 表示時に維持 |
| keyboard shortcut が textarea / input にも反応してしまう | QuickStartCard が active な間のみ listener 登録、textbox 表示時は unmount |
| catchAll が常に出ることで「ランダムな質問」が頻発しすぎる | priority 10 で末尾固定、queue 中の他 template を全て試した後にのみ提示される |
