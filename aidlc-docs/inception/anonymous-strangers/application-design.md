# Application Design — anonymous-strangers

> **派生元**: [requirements.md](requirements.md) + [user-stories.md](user-stories.md)
> **既存ベース**: v0.4.0 + drill-down chain + onboarding
> **改訂**: 2026-05-24 ultrathink fixes applied (C1-C5 + I2 + I3 + Imp5)
>
> **2026-05-24 Simplification**: 仕様簡素化により以下を削除 (現状コードが正、本ドキュメント内の旧記述は無効):
> - **Data Model**: `AnonymousPersonaSpec.quirks` / `quirks_original` field を撤去 ([apps/api/src/yesman_api/domain/persona_pool/models.py](../../../apps/api/src/yesman_api/domain/persona_pool/models.py))。`signal_total = len(value_tags)`.
> - **LLM Prompt**: JSON 出力 `{original, translation_ja}` を廃止、plain text 日本語応答 (1-2 文) を返す ([apps/api/src/yesman_api/domain/decision/engine.py](../../../apps/api/src/yesman_api/domain/decision/engine.py) `_build_anonymous_prompt`).
> - **SSE utterance event**: `original` field を撤去、`{persona_id, persona_name, text, primary_language, formality}` のみ ([packages/api-client/src/sse.ts](../../../packages/api-client/src/sse.ts)).
> - **Frontend**: `OriginalTextToggle` component / 「原文を表示」 toggle を削除. `ProfileSummaryCard` の「あなたの 口グセ」 section / `AnonymousPersonaDetail` の 口グセ section / `OptInCard` preview 内 口グセ 表示 を撤去.
> - **DTO**: `AnonymousPersonaDTO` から `quirks` / `quirks_original` を撤去 ([apps/api/src/yesman_api/interface/http/dto/persona_pool.py](../../../apps/api/src/yesman_api/interface/http/dto/persona_pool.py)).
> - **Fixture**: `FixtureUtterance` を `{text: str}` の単一 field に簡素化 ([apps/api/src/yesman_api/fixtures/anonymous_pool_seed.py](../../../apps/api/src/yesman_api/fixtures/anonymous_pool_seed.py))、各 fixture は日本語完成 text のみ保持.

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────┐
│ Web (apps/web, React 18 + Vite)                                     │
│                                                                     │
│  Pages:                                                             │
│    /personas/selection ── 既存 + 2-source tab (builtin / anonymous) │
│    /decision           ── stage renderer 切替 (chat vs manga)       │
│    /personas/anonymous ── (new) これまで決めてくれた誰か list       │
│    /personas/anonymous/:id ── (new) 匿名 persona 詳細               │
│    /profile           ── 既存 + opt-in card 追加 (preview 常時)     │
│                                                                     │
│  Features:                                                          │
│    decision/                                                        │
│      MangaStage.tsx     ── (new) 漫画ステージ renderer              │
│      MangaBubble.tsx    ── (new) 重なる吹き出し (size + opacity)    │
│      EarthHorizon.tsx   ── (new) 地平線背景 (3 色 半円)              │
│      OriginalTextToggle.tsx ── (new) ARIA-described 切替            │
│    personas/                                                        │
│      PersonaSourceTabs.tsx ── (new) builtin / anonymous tab         │
│      AnonymousRandomCard.tsx ── (new) self + 2 anon + ↻             │
│      AnonymousPersonaList.tsx ── (new)                              │
│      AnonymousPersonaDetail.tsx ── (new)                            │
│    profile/                                                         │
│      OptInCard.tsx      ── (new) トグル + preview + guard           │
│                                                                     │
│  index.html: Noto Sans Arabic + Noto Sans SC CDN preconnect         │
│                                                                     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP/SSE (既存 packages/api-client)
                           │ (AuthMiddleware 透過 = Cognito/Mock 両対応)
┌──────────────────────────▼──────────────────────────────────────────┐
│ API (apps/api, FastAPI)                                             │
│                                                                     │
│  既存 endpoints (流用):                                             │
│    POST /v1/decisions/streaming  ── SSE 合議 (utterance 拡張)       │
│    GET  /v1/preferences/me        ── (no change)                    │
│                                                                     │
│  新 endpoints (全て AuthMiddleware 必須):                          │
│    GET   /v1/persona-pool/random?n=2                                │
│            ── exclude=self は server 側で自動適用 (NFR-6)           │
│    POST  /v1/persona-pool/opt-in                                    │
│            ── 422 if tags+quirks 合計 < 3 (FR-9 guard)              │
│    DELETE /v1/persona-pool/opt-in                                   │
│    GET   /v1/persona-pool/me/citations                              │
│            ── 「今日 N 件」用、mock seed fixture が 5 件返す         │
│    GET   /v1/persona-pool/cited-by-me?since=...                     │
│            ── 過去ログ用、anonymous persona の citation 履歴        │
│                                                                     │
│  Interface 層:                                                      │
│    interface/http/persona_pool_router.py (new)                      │
│      ── APIRouter、deps.get_current_user 依存                       │
│      ── 422 error response models (FR-9 違反)                       │
│                                                                     │
│  Domain:                                                            │
│    domain/persona_pool.py (new):                                    │
│      AnonymousPersonaSpec + PoolRepository Protocol                 │
│    domain/decision/engine.py (修正):                                │
│      persona_source 分岐 + anonymous の場合は LLM JSON 経路         │
│    application/learning/anonymous_seed.py (new):                    │
│      preference profile → AnonymousPersonaSpec 変換                 │
│      tags max 5 + 口グセ max 3 + formality 推論                     │
│    fixtures/anonymous_pool_seed.py (new):                           │
│      5 名分 hardcoded spec + original/translation_ja per language   │
│      + 5 件分 seed citation events                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Model (mock repository に追加)

```python
# domain/persona_pool.py

@dataclass(frozen=True)
class AnonymousPersonaSpec:
    persona_id: str            # UUID、API 流通用
    value_tags: tuple[str, ...]  # 価値観タグ (max 5)
    quirks: tuple[str, ...]      # 口グセ短文 (max 3、各 30 字以内)
    primary_language: Literal["ja", "en", "fr", "ar", "zh"]
    formality: Literal["polite", "casual", "blunt"]  # FR-8
    seed_at: datetime
    # 派生元 user.sub は **別 mapping table (in-memory dict)** で保持
    # 内部のみ、API 流通させない (NFR-6)

@dataclass(frozen=True)
class PoolCitation:
    citing_user_sub: str
    cited_persona_id: str
    decision_id: str
    cited_at: datetime

class PoolRepository(Protocol):
    def sample(self, *, n: int, excluding_sub: str) -> list[AnonymousPersonaSpec]: ...
    def add_or_update(self, sub: str, spec: AnonymousPersonaSpec) -> None: ...
    def remove_for_sub(self, sub: str) -> None: ...
    def has_optin(self, sub: str) -> bool: ...
    def list_citations_for_sub(
        self, sub: str, *, since: datetime | None = None
    ) -> list[PoolCitation]: ...
```

### Fixture per-language (5 名)

```python
# fixtures/anonymous_pool_seed.py
FIXTURES = [
    # (lang, formality, tags, quirks, hardcoded_utterance_examples)
    ("en", "casual", ("即決派", "肉好き", "自由人"),
        ("Definitely curry!", "Don't sweat the small stuff.", "Let's just try it."),
        {"original": "Definitely curry! Get the spicy one — gives you energy.",
         "translation_ja": "カレーいいよ！スパイスきいた元気でるやつ"}),
    ("fr", "polite", ("和食派", "健康志向", "慎重派"),
        ("Du japonais !", "Pourquoi pas ?", "Avec une miso"),
        {"original": "Du japonais ! Si t'as enchaîné le gras, prends du sashimi avec une miso.",
         "translation_ja": "和食 おいしいじゃん！揚げ物 続いてるなら、お刺身とかさ、お味噌汁つきで"}),
    ("ar", "polite", ("家族派", "倹約家", "保守派"), (...), {...}),
    ("zh", "blunt", ("コスパ重視", "効率派", "現実派"), (...), {...}),
    ("ja", "casual", ("夜型", "ラーメン好き", "面倒くさがり"), (...), {...}),
]
SEED_CITATIONS = 5  # mock の 「今日 N 件」用
```

## SSE Event Compatibility (anonymous 経路は token streaming 不採用)

| event | 既存 builtin | 新 anonymous |
|---|---|---|
| `personas` | personas list pre-fill | 同じ (display_name = "世界の誰か #1") |
| `utterance_delta` | token chunk yield | **emit しない** |
| `utterance` | 最終 cleaned text | 完成発話一括 + `original` + `primary_language` + `formality` |
| `proposal` | depth, service 等 | 同じ (no change) |

```jsonc
// 新 utterance payload (anonymous 経路):
event: utterance
data: {
  "persona_id": "p_anonymous_xxx",
  "text": "和食 おいしいじゃん！揚げ物 続いてるなら、お刺身とかさ",  // = translation_ja
  "original": "Du japonais ! Si t'as enchaîné le gras, prends du sashimi avec une miso.",
  "primary_language": "fr",
  "formality": "polite"
}
```

→ frontend は `id.startsWith("p_anonymous_")` で 漫画ステージ renderer に振り分け、`original` 存在時のみ「原文を表示」 toggle を render。

## LLM Prompt 設計 (multilingual speech、hybrid fixture + LLM)

### fixture 5 名の場合
- LLM 呼び出しなし、fixture の hardcoded `original` / `translation_ja` を `utterance` event に直接 emit
- demo の安定性 + Arabic/SC 品質保証

### 6 名目以降 (LLM 動的生成)

```text
あなたは {value_tags} の価値観を持ち、口グセは "{quirks}" の人物です。
日常会話で {primary_language} を話します。
話し方は {formality} (polite / casual / blunt) です。

ユーザーの相談: {user_input}
他 persona の発話: {prior_utterances}

JSON で返答してください (必ず両方の field を埋めること):
{
  "original": "{primary_language} での発話 (1-2 文)",
  "translation_ja": "日本語訳 (1-2 文)"
}
```

- 既存 `_parse_json_loose` で吸収、`original` が欠落時は `translation_ja` を `original` にも fallback (link 非表示)
- `formality` は tone control に直結 (polite → 「ですます」、casual → 「タメ口」、blunt → 「短文・断定」)

## Frontend Component 階層 (decision page、anonymous 経路)

```
<DecisionPage>
  └ <StageRenderer mode={stageMode}>          // 既存 chat or new manga
      ├ if mode === "chat":  <ChatStage>...   // 既存 builtin persona 用 (no change)
      └ if mode === "manga": <MangaStage>     // 新規 anonymous 用
          ├ <EarthHorizon colors={["green","orange","blue"]} />
          ├ <ActorRow>
          │   ├ <PhotoIcon persona={me} />
          │   ├ <BlobAvatar persona={anon1} color="orange" gaze="upright" />
          │   └ <BlobAvatar persona={anon2} color="blue"  gaze="downleft" />
          ├ for each persona in speakingOrder:
          │   ├ <MangaBubble
          │   │    size={isCurrentSpeaker ? "large" : "small"}
          │   │    persona={...}
          │   │    fadeIn={isCurrentSpeaker}  // slide-in animation
          │   │  >
          │   │    {translatedText}
          │   │    {original && <OriginalTextToggle original={...} lang={primary_language} />}
          │   │  </MangaBubble>
          │   └ if isAboutToSpeak: <TypingBubble />
          └ when all done: <ResultCard /> (既存流用)
```

### OriginalTextToggle 仕様
- `<button aria-pressed={showOriginal} aria-label="原文を表示">原文を表示</button>`
- press 後は `aria-pressed=true` + label が「翻訳を表示」、bubble 内側に `dir="rtl"` を ar の時のみ適用
- screen reader でも切替が読み上げられる (NFR-4)

## Persona Selection 画面の拡張 (2-source tabs)

```
<PersonaSelectionPage>
  ├ <PersonaSourceTabs>  // (new) 2-tab 切替
  │   ├ Tab: "Builtin 3 人"             → 既存 builtin persona list
  │   └ Tab: "世界の誰か (random 2 人)"  → AnonymousRandomCard
  ├ if selected source === "anonymous":
  │   └ <AnonymousRandomCard>
  │       ├ self icon + random anonymous 2 名 (blob, gaze direction)
  │       ├ ↻ shuffle button (500ms debounce) → GET /v1/persona-pool/random?n=2
  │       └ "この 3 人に決めてもらう" → /decision (stageMode="manga")
```

- localStorage key: `yesman:persona-source` (既存 `yesman:onboarding:completed-subs`, `yesman:quickstart:dedupe-disabled` と衝突しないこと、Imp2)
- default = `builtin` (regression 防止、Imp2 / FR-7)

## 既存資産 reuse map

| 既存資産 | reuse 方法 |
|---|---|
| `apps/web/src/features/decision/reducer.ts` | `stageMode: "chat" \| "manga"` field + `Utterance.original?: string` / `formality?: string` 追加 |
| `apps/web/src/features/decision/DecisionPage.tsx` | StageRenderer を mount 切替 (anonymous source 時 = "manga") |
| `packages/api-client/src/sse.ts` | event type は変更なし、`utterance` payload に optional `original` / `primary_language` / `formality` 追加 |
| `apps/api/src/yesman_api/domain/decision/engine.py` | persona resolver 内で `persona_source == "anonymous"` 分岐、`pool_repo.sample(n=2, excluding_sub=user.sub)` 呼び出し |
| `apps/api/src/yesman_api/application/learning/inline_handler.py` | opt-in 済 user の YES 採択時に `anonymous_seed.derive()` で spec を update |
| **既存 AuthMiddleware (U3-auth)** | 新 5 endpoint は `Depends(get_current_user)` で透過、Cognito/Mock 切替は既存 AuthBackendAdapter Protocol が処理 |

## i18n font 戦略 (CDN preconnect、Tailwind ではない)

```html
<!-- apps/web/index.html に追加 -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500&family=Noto+Sans+SC:wght@400;500&display=swap">
```

```css
/* packages/ui/src/styles/globals.css に追加 */
.lang-ar { font-family: "Noto Sans Arabic", system-ui, sans-serif; direction: rtl; }
.lang-zh { font-family: "Noto Sans SC", system-ui, sans-serif; }
```

- `font-display: swap` で初回表示は system font fallback、後追い差替え (FOIT 回避)
- 1s timeout で fetch 失敗時は system font のまま継続表示 (NFR-5、graceful degrade)
- Arabic/SC は重い (~500KB-1MB)、初回 page load 後の lazy load 想定

## エラー / フォールバック

| ケース | 動作 |
|---|---|
| opt-in pool が空 (user 1 人だけ) | fixture 5 名で常時補完 (NFR-1) |
| LLM が `original` / `translation_ja` を欠落 | `original = translation_ja` で fallback (toggle 非表示) |
| RTL font 未 load | 1s timeout で fallback、原文表示は system font で継続 (機能 degrade、UI 維持) |
| shuffle 連打 | client-side debounce 500ms (US-1.1 AC-2) |
| 空 profile での opt-in | 422 error from server (FR-9)、UI 側でトグル disabled (US-2.4) |
| ありえないが pool < n | 不足分は fixture から fallback、最低 2 名は確保 |
