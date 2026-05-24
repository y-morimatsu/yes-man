# Units Decomposition + Implementation Plan — anonymous-strangers

> **派生元**: [requirements.md](requirements.md) / [user-stories.md](user-stories.md) / [application-design.md](application-design.md)
> **scope**: 単一 unit (ハッカソン MVP)、~**25-28h** = 3-4 営業日想定 (ultrathink fixes 反映後)
> **改訂**: 2026-05-24 I1 (manga stage +3-4h) + I4 (e2e +2-3h) + auth integration +30min 反映
>
> **2026-05-24 Simplification**: 「口グセ (quirks)」/「原文を表示」を仕様から削除. Tasks 内の旧記述 (Task 1 「口グセ max 3」, Task 5 `OriginalTextToggle.tsx` 新規, Task 6 「口グセ (原文付き)」, Task 8 「原文表示 toggle」, etc.) は無効. 詳細は [requirements.md](requirements.md) / [application-design.md](application-design.md) 冒頭の Simplification 注記を参照.

## Unit: anonymous-strangers

### Tasks (実装順)

#### Task 1: Backend — anonymous persona pool 基盤 + auth integration (~4-5h)
- [ ] [apps/api/src/yesman_api/domain/persona_pool.py](../../../apps/api/src/yesman_api/domain/persona_pool.py) (new): `AnonymousPersonaSpec` (formality 含む) + `PoolRepository` Protocol + `PoolCitation`
- [ ] [apps/api/src/yesman_api/application/learning/anonymous_seed.py](../../../apps/api/src/yesman_api/application/learning/anonymous_seed.py) (new): preference profile → AnonymousPersonaSpec 変換 (tags max 5 + 口グセ max 3 + formality 推論)
- [ ] [apps/api/src/yesman_api/infrastructure/persistence/mock_pool_repository.py](../../../apps/api/src/yesman_api/infrastructure/persistence/mock_pool_repository.py) (new): in-memory dict ベース、`PoolRepository` 実装
- [ ] [apps/api/src/yesman_api/interface/http/persona_pool_router.py](../../../apps/api/src/yesman_api/interface/http/persona_pool_router.py) (new): 5 endpoint
  - `Depends(get_current_user)` で AuthMiddleware 透過 (C4 fix)
  - `exclude` は client から受けず、server 側で自動 (NFR-6)
  - 422 error response if tags+quirks 合計 < 3 (FR-9 guard、US-2.4)
- [ ] [apps/api/src/yesman_api/main.py](../../../apps/api/src/yesman_api/main.py) に router 登録
- [ ] [apps/api/src/yesman_api/fixtures/anonymous_pool_seed.py](../../../apps/api/src/yesman_api/fixtures/anonymous_pool_seed.py) (new): demo 用 5 名 hardcoded (en/fr/ar/zh/ja 各 1、formality 違い) + 5 件 seed citation events
- [ ] pytest:
  - pool sample (n=2, excluding_sub=self) → 全て pool 内 / sub != requestor / k 件
  - opt-in toggle idempotency
  - FR-9 guard: 空 profile で opt-in → 422
  - **PBT 1 件追加** (Imp4): `sample(n=k)` の不変条件 (Property-Based Testing extension)
  - auth: 未認証 request は 401 (AuthMiddleware 経由を verify)

#### Task 2: Backend — engine.py で anonymous persona resolve (~2h)
- [ ] [apps/api/src/yesman_api/domain/decision/engine.py](../../../apps/api/src/yesman_api/domain/decision/engine.py) 修正: `persona_source: Literal["builtin", "anonymous"]` を request payload に追加 (default = "builtin"、regression 防止)
- [ ] anonymous source 時、`pool_repo.sample(n=2, excluding_sub=user.sub)` で抽選
- [ ] fixture 5 名 (hardcoded original / translation_ja) は LLM 呼び出しせず直接 emit (FR-3 hybrid)
- [ ] 6 名目以降は LLM prompt に value_tags / quirks / primary_language / formality を inject、JSON 出力 `{original, translation_ja}` を parse
- [ ] **token streaming は anonymous 経路では emit しない** (FR-3 / NFR-2)、完成発話を `utterance` event 一括 emit、payload に `original` / `primary_language` / `formality` 追加
- [ ] pytest:
  - anonymous source 経路で `original` / `translation_ja` 両方が emit される
  - fixture 経路で LLM 呼ばれない (mock LLM call counter で verify)
  - LLM `original` 欠落時の fallback (= translation_ja)

#### Task 3: API Client — payload 拡張 (~30min)
- [ ] [packages/api-client/src/sse.ts](../../../packages/api-client/src/sse.ts): `Utterance` type に optional `original?: string` + `primary_language?: string` + `formality?: string` 追加
- [ ] [packages/api-client/src/persona-pool.ts](../../../packages/api-client/src/persona-pool.ts) (new): 5 endpoint の client method
- [ ] `DecisionRequestPayload` に optional `persona_source?: "builtin" | "anonymous"` 追加

#### Task 4: Web — PersonaSelection 2-source tab 拡張 (~2h)
- [ ] [apps/web/src/features/personas/PersonaSourceTabs.tsx](../../../apps/web/src/features/personas/PersonaSourceTabs.tsx) (new): 2-tab UI (builtin / anonymous)
- [ ] [apps/web/src/features/personas/AnonymousRandomCard.tsx](../../../apps/web/src/features/personas/AnonymousRandomCard.tsx) (new): self + 2 anonymous + ↻ shuffle (500ms debounce)
- [ ] [apps/web/src/features/personas/PersonaSelectionPage.tsx](../../../apps/web/src/features/personas/PersonaSelectionPage.tsx) 修正: tab で source 切替、localStorage `yesman:persona-source` 永続化 (default = "builtin")
- [ ] vitest: source 切替 + localStorage 反映 + default = builtin

#### Task 5: Web — Decision MangaStage (~8-10h、最重、I1 反映)
- [ ] [packages/ui/src/composites/MangaBubble.tsx](../../../packages/ui/src/composites/MangaBubble.tsx) (new): size large/small + opacity transition + tail position + slide-in animation (token streaming 不採用、完成 text fade-in)
- [ ] [packages/ui/src/composites/EarthHorizon.tsx](../../../packages/ui/src/composites/EarthHorizon.tsx) (new): 3 色半円背景 (CSS のみ、SVG 不要、mockup 仕様準拠)
- [ ] [packages/ui/src/composites/BlobAvatar.tsx](../../../packages/ui/src/composites/BlobAvatar.tsx) (new): mockup `.blob` 仕様 (s-22 / 28 / 36 / 44 / 60 / 80 size variants + gaze direction (upright/downleft/upleft/downright/up) + 2 eyes pseudo-element)
- [ ] [apps/web/src/features/decision/MangaStage.tsx](../../../apps/web/src/features/decision/MangaStage.tsx) (new): 3 persona の bubble / actor row / typing dots layout
  - mockup の絶対 px position 固定 (bottom 184 / 152 / 170、actor margin-bottom 32/0/18、Pixel 5 viewport)
- [ ] [apps/web/src/features/decision/OriginalTextToggle.tsx](../../../apps/web/src/features/decision/OriginalTextToggle.tsx) (new): `aria-pressed` 切替 + label change ("原文を表示" ⇔ "翻訳を表示") + Arabic 時 `dir="rtl"` 適用
- [ ] [apps/web/src/features/decision/reducer.ts](../../../apps/web/src/features/decision/reducer.ts) 修正: `stageMode: "chat" | "manga"` field 追加 + `Utterance.original?: string` / `formality?: string`
- [ ] [apps/web/src/features/decision/DecisionPage.tsx](../../../apps/web/src/features/decision/DecisionPage.tsx) 修正: stageMode で StageRenderer 切替
- [ ] [apps/web/index.html](../../../apps/web/index.html) 修正 (I2): Google Fonts CDN preconnect + Noto Sans Arabic + Noto Sans SC 追加 (font-display: swap)
- [ ] [packages/ui/src/styles/globals.css](../../../packages/ui/src/styles/globals.css) 拡張: `ym-manga-bubble-pop`, `ym-bubble-fade-in`, `.lang-ar / .lang-zh` font-family 追加、`prefers-reduced-motion` honor
- [ ] vitest:
  - MangaBubble size / opacity 状態遷移
  - OriginalTextToggle の切替 + aria-pressed
  - RTL bubble (Arabic) で dir=rtl 適用
  - **PBT 1 件** (Imp4): bubble layout の不変条件 (発話中は size=large、必ず 1 つのみ large)

#### Task 6: Web — Anonymous persona list / detail (~2h)
- [ ] [apps/web/src/features/personas/AnonymousPersonaList.tsx](../../../apps/web/src/features/personas/AnonymousPersonaList.tsx) (new): citation 履歴 list (匿名 blob + 相対時刻、名前なし)
- [ ] [apps/web/src/features/personas/AnonymousPersonaDetail.tsx](../../../apps/web/src/features/personas/AnonymousPersonaDetail.tsx) (new): blob s-80 + tags + 口グセ (原文付き) + 「N 回 一緒に決めた」
- [ ] [apps/web/src/shell/routes.tsx](../../../apps/web/src/shell/routes.tsx) に 2 route 追加 (`/personas/anonymous`, `/personas/anonymous/:id`)
- [ ] vitest: list render + 詳細遷移

#### Task 7: Web — Profile OptInCard + preview + guard (~2h)
- [ ] [apps/web/src/features/profile/OptInCard.tsx](../../../apps/web/src/features/profile/OptInCard.tsx) (new):
  - トグル + 流通対象 preview (US-2.1 AC-2、US-2.3) を **常時表示** (OFF でも「もし ON にすると以下が流通します」)
  - 「今日 N 件の決め事に登場しました」スタット (server-side で取得、US-2.2)
  - 「あなたの 価値観タグや 口グセが…」明文 (US-2.3)
  - FR-9 guard: tags+quirks 合計 < 3 の時トグル disabled + inline message (US-2.4)
- [ ] [apps/web/src/features/profile/ProfilePage.tsx](../../../apps/web/src/features/profile/ProfilePage.tsx) 修正: OptInCard を mount
- [ ] React Query mutation: toggle → POST/DELETE /v1/persona-pool/opt-in、tags 充足後 auto-enable (cache invalidation)
- [ ] vitest:
  - toggle 状態遷移 + mock backend で永続化
  - 空 profile で disabled (US-2.4 AC-1)
  - preview の常時表示 (US-2.3 AC-1)

#### Task 8: Integration — e2e test + mock LLM mode (~3-4h、I4 反映)
- [ ] [tests/e2e/specs/anonymous-strangers.spec.ts](../../../tests/e2e/specs/anonymous-strangers.spec.ts) (new): mobile-chrome flow
  - 環境変数: `LLM_PROVIDER=mock` + `MOCK_LLM_PERSONA_DELAY_SECONDS=0.5` (flakiness 抑制)
  - PersonaSelection で「世界の誰か」tab → AnonymousRandomCard → 「決めてもらう」
  - MangaStage が render される (bubble size 切替 + typing dots)
  - 原文表示 toggle (`aria-pressed` 切替を verify)
  - YES 採択 → 履歴に 1 entry 追加
  - 空 profile で opt-in がトグル disabled (US-2.4 AC-1)
- [ ] **regression**: 既存 12 spec が 100/100 PASS を維持 (I5)
  - 特に `inception-mobile.spec.ts` / `persona.spec.ts` / `swipe-and-discussion.spec.ts`
  - StageRenderer default mode が "chat" (builtin 経路) であること

#### Task 9: Demo video (~1h)
- [ ] [tests/e2e/scripts/record-anonymous-strangers-tour.mjs](../../../tests/e2e/scripts/record-anonymous-strangers-tour.mjs) (new): ~60s tour
  - signup (新規 email) → onboarding (25 問 swipe で tags 充足、US-2.4 解除) → profile opt-in トグル ON → preview 確認
  - PersonaSelection の「世界の誰か」tab → AnonymousRandomCard → ↻ で shuffle 1 回 → 「決めてもらう」
  - MangaStage で fr/en/ja 3 言語 bubble 順次表示、各 bubble で「原文を表示」 toggle (Imp1: opt-in 反映 sequence を script 上で wait + retry)
  - YES → list → detail → profile (自分の citation 「今日 N 件」確認)
- [ ] [docs/demo/scripts/convert.sh](../../../docs/demo/scripts/convert.sh) で mp4 + GIF

#### Task 10: drawio + 画面キャプチャ + 仕上げ (~1.5h)
- [ ] [docs/superpowers/specs/2026-05-24-anonymous-strangers-design.md](../../../docs/superpowers/specs/2026-05-24-anonymous-strangers-design.md) (new): superpowers spec style の brainstorming doc
- [ ] [docs/superpowers/specs/diagrams/2026-05-24-anonymous-strangers-screens.drawio](../../../docs/superpowers/specs/diagrams/2026-05-24-anonymous-strangers-screens.drawio) (new): screen flow + component dependency
- [ ] [aidlc-docs/inception/application-design/screens/07-anonymous-strangers-flow.svg](../../../aidlc-docs/inception/application-design/screens/07-anonymous-strangers-flow.svg) (new) or mockup HTML から Playwright で各画面 screenshot 化 (11 PNG)
- [ ] [aidlc-docs/audit.md](../../audit.md) 改訂注記追記
- [ ] commit (Conventional Commits、Co-Authored-By trailer)
- [ ] `feature/next-spec-ideas-anonymous-strangers` branch に push (develop / main へは merge しない、user 明示許可待ち)

### Risk / 注意

| Risk | 対応 |
|---|---|
| pool が空 (1 user only) | seed 5 名 (Task 1 内 fixture) |
| LLM の JSON 出力崩れ | 既存 `_parse_json_loose` (engine.py 内) で吸収、欠落時は translation_ja を original にも使う、fixture 5 名は LLM 経由しないので影響しない |
| 漫画 bubble 重なり position 計算が複雑 | mockup の bottom-px 値をそのまま CSS に固定 (responsive は MVP 外、Pixel 5 viewport で最適化) |
| RTL font 未 load | 1s timeout で fallback、system font で原文 toggle 継続 (機能 degrade、UI 維持) |
| 既存 chat stage の regression | DecisionPage 内 stageMode が default "chat" であることを保証、e2e で確認 (Task 8) |
| e2e LLM flakiness | mock LLM mode `LLM_PROVIDER=mock` + `MOCK_LLM_PERSONA_DELAY_SECONDS=0.5` で deterministic |
| Auth integration 忘れ | Task 1 で `Depends(get_current_user)` 必須、pytest で 401 verify |

### Estimate

| Task | 時間 (改訂後) |
|---|---|
| Task 1 (backend + auth + fixture + PBT) | ~4-5h |
| Task 2 (engine.py anonymous resolve) | ~2h |
| Task 3 (api client) | ~30min |
| Task 4 (selection 2-source tabs) | ~2h |
| Task 5 (manga stage + i18n font + RTL + position) | ~8-10h |
| Task 6 (list + detail) | ~2h |
| Task 7 (opt-in card + preview + guard) | ~2h |
| Task 8 (e2e + mock LLM + regression check) | ~3-4h |
| Task 9 (demo video) | ~1h |
| Task 10 (drawio + screenshots + 仕上げ) | ~1.5h |
| **合計** | **~26-30h** = 約 **3-4 営業日** (集中時) / **1 週間** (分散時) |

### Verification

- [ ] `pnpm test` all green (unit + integration)
- [ ] `pnpm --filter @yesman/web test` green
- [ ] `cd apps/api && uv run pytest` green (新規 + 既存)
- [ ] `cd tests/e2e && npx playwright test` green (**既存 12 spec 100/100 維持 + 新 anonymous-strangers spec**)
- [ ] Demo 動画 (~60s) が `docs/demo/output/` に出力される、Pixel 5 viewport、Noto font load 確認
- [ ] Manual: localStorage clear → 新規 signup → onboarding → opt-in ON → PersonaSelection "世界の誰か" → 漫画ステージ → 原文 toggle → list → detail → profile (citations 5 件) を mobile viewport で確認
- [ ] AuthMiddleware 経由: 401 が出ない (logged in user)、未認証 request は 401 返す
