# anonymous-strangers (案 5) — 設計仕様

- **Date**: 2026-05-24
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: ✅ **実装完了 (2026-05-24 final)** — 詳細な現状仕様は §7 参照 (このドキュメントは初期構想を保持、§7 が現状実装の Source of Truth)
- **Scope**: 匿名の他ユーザー persona と漫画的吹き出しステージで合議する新機能
- **Branch**: `feature/next-spec-ideas-anonymous-strangers` (`feature/next-spec-ideas` から派生)
- **Related**:
  - drawio mockup: [diagrams/2026-05-24-anonymous-strangers-screens.drawio](diagrams/2026-05-24-anonymous-strangers-screens.drawio) (2 ページ: 画面フロー + コンポーネント依存)
  - 元アイデア: [../idea/合議アイデアとして考えたこと.txt](../idea/合議アイデアとして考えたこと.txt) (案 5)
  - mockup HTML: [../idea/mockup-anonymous-strangers.html](../idea/mockup-anonymous-strangers.html)
  - 画面キャプチャ: [../../../aidlc-docs/inception/anonymous-strangers/screens/](../../../aidlc-docs/inception/anonymous-strangers/screens/) (13 PNG)
  - AI-DLC inception 成果物: [../../../aidlc-docs/inception/anonymous-strangers/](../../../aidlc-docs/inception/anonymous-strangers/) (5 ファイル)
  - 関連 idea (別 branch、後置): [../idea/mockup-group-chat.html](../idea/mockup-group-chat.html)

---

## 1. 背景

YesMan v0.4.0 + drill-down chain + onboarding を経て、ハッカソン後半の差別化要素として「**実在する他人の人格と合議する**」体験を追加する。AI が学習して提案するのは Gemini 等で既体験 = 新鮮さなし、と元 ideator も明言:

> AI が自分ごのみのことを学習して提案してくれるって、もうみんなが経験している...そこで差別化をはかるなら、「**その先に実在する誰かがいる (ここがリアル!)**」というのが案 5 は差別化がはかれる。

### 解決したい課題

1. **合議 persona が builtin 3 種 (cautious/bold/pragmatic) しかない** — 多様性が薄い
2. **AI が決めた感が抜けない** — 「自分の opt-in 公開した価値観が、世界の誰かの合議で動く」という**メタ的相互参加**を体験したい
3. **多言語 + 多文化背景** — 「アラビア語と中国語と英語で合議して、わたしの今日の夕飯を決めてくれる」(元アイデア)
4. **形式の選択肢** — 敬語 / タメ口 / blunt の persona 差で会話のトーンを変える

---

## 2. ユーザストーリー

> ユーザーが YesMan を開き、Persona Selection 画面で **「世界の誰か」 tab** を選ぶと、自分 + ランダム 2 名の匿名 persona (blob アバター) が card で示される。↻ で別の 2 名に shuffle 可能。「決めてもらう」を tap すると `/decision` に遷移し、地球の地平線を背景に 3 つの blob が立つ **漫画的ステージ** が始まる。各 persona が順番に発話 — 話している persona の吹き出しは大・full opacity・shadow、既出は小・opacity 0.55。各 bubble 下の「**原文を表示**」リンクで日本語訳 ⇔ 元言語 (en/fr/ar/zh) を切替できる。完了したら結論カードに集約、YES で採択。

### 受入基準 (Gherkin)

```gherkin
# Persona Selection の 2-source tab
Given 認証済みで /personas/selection を開く
When Layout が描画される
Then 「builtin 3 人」と「世界の誰か (random 2 人)」の 2 tab が表示される
  And localStorage `yesman:persona-source` が空 (初回) の時、default は「builtin」
  And 「世界の誰か」 tab tap で AnonymousRandomCard が表示される

# AnonymousRandomCard と shuffle
Given 「世界の誰か」tab を選択
When AnonymousRandomCard が表示される
Then 自分の icon + 匿名 blob 2 名 (orange + blue) が表示される
  And ↻ button tap で別の 2 名に shuffle される
  And 500ms 以内の連続 tap は debounce される (1 回のみ実行)

# 漫画ステージ
Given AnonymousRandomCard で「決めてもらう」tap
When /decision に遷移、 stageMode=manga になる
Then 地球地平線 (3 色半円) + 3 blob actor が表示される
  And 各 persona の bubble が大/小切替で順次表示される
  And 発話前 persona の頭上に typing dots (●●●) が思考吹き出しで出る
  And token streaming は **使わない** — 完成発話を slide-in animation で fade-in

# 原文表示 toggle
Given MangaStage で fr persona の bubble が大表示されている
When bubble 下の「原文を表示」 button tap
Then bubble text が "Du japonais ! Si t'as enchaîné..." に切替
  And button label が「翻訳を表示」に変わる
  And button の aria-pressed が true になる
  And Arabic persona の bubble は dir=rtl で表示される

# opt-in toggle と guard
Given preference profile 由来 tags + 口グセ < 3 の user
When /profile を開く
Then OptInCard のトグルが disabled
  And inline message "嗜好把握が足りないので公開できません。何回か決定を試してみてください" が表示される

Given tags + 口グセ >= 3 の user で OptInCard のトグルが OFF
When トグル card 内を確認
Then 流通対象 preview (現在 OFF: もし ON にすると以下が流通します) が常時表示される
  And tags 一覧 (max 5) + 口グセ 一覧 (max 3) が見える

Given OptInCard でトグル ON
When POST /v1/persona-pool/opt-in が呼ばれる
Then anonymous persona spec が pool に登録される
  And user.sub は API レスポンスから絶対に流通しない (persona_id UUID のみ)
  And 「今日 N 件の決め事に登場しました」が表示される (mock seed で N=5)

# 既存 builtin 経路 regression
Given default 「builtin」 tab + 合議実行
When /decision に遷移
Then 既存 ChatStage (token streaming + chat bubble) が render される
  And MangaStage は render されない
  And 既存 e2e 12 spec (100/100) が PASS を維持する
```

---

## 3. アーキテクチャ

### 3.1 全体図

詳細は [diagrams/2026-05-24-anonymous-strangers-screens.drawio](diagrams/2026-05-24-anonymous-strangers-screens.drawio) 「02_コンポーネント依存」ページ参照。

```
Web (apps/web)                  | API (apps/api, FastAPI)
─────────────────────────────── | ────────────────────────────────────
★ PersonaSourceTabs.tsx         | ★ persona_pool_router.py (5 endpoint)
★ AnonymousRandomCard.tsx       |   ↳ Depends(get_current_user) 必須
★ MangaStage.tsx                | ★ MockPoolRepository (in-memory)
★ MangaBubble.tsx               |   ↳ sub↔persona_id mapping (internal only)
★ EarthHorizon.tsx              | ★ AnonymousPersonaSpec
★ BlobAvatar.tsx                | ★ anonymous_seed.py
★ OriginalTextToggle.tsx        | ★ anonymous_pool_seed.py (5 fixture)
★ AnonymousPersonaList.tsx      | 🔄 engine.py (persona_source 分岐)
★ AnonymousPersonaDetail.tsx    | 🔄 AuthMiddleware (既存 U3-auth 透過)
★ OptInCard.tsx                 |
🔄 DecisionPage.tsx (stageMode) |
🔄 reducer.ts (Utterance 拡張)  |
🔄 ProfilePage.tsx              |
🔄 sse.ts (Utterance 拡張)      |
★ persona-pool.ts (api-client)  |
```

### 3.2 SSE Event (anonymous 経路は token streaming 不採用)

| event | builtin (既存) | anonymous (新) |
|---|---|---|
| `personas` | persona list pre-fill | 同じ (display_name = "世界の誰か #1") |
| `utterance_delta` | token chunk yield | **emit しない** (FR-3) |
| `utterance` | 最終 cleaned text | 完成発話 + `original` + `primary_language` + `formality` |

### 3.3 LLM Prompt (multilingual、hybrid fixture + LLM)

- **fixture 5 名** (en/fr/ar/zh/ja 各 1): LLM 呼び出しなし、hardcoded `original` / `translation_ja` を即時 emit
- **6 名目以降**: LLM JSON 出力 `{"original", "translation_ja"}` を parse
- 既存 `_parse_json_loose` で吸収、欠落時は `translation_ja` を `original` にも fallback (link 非表示)

```text
あなたは {value_tags} の価値観を持ち、口グセは "{quirks}" の人物です。
日常会話で {primary_language} を話します。
話し方は {formality} (polite / casual / blunt) です。

ユーザーの相談: {user_input}
他 persona の発話: {prior_utterances}

JSON で返答してください:
{
  "original": "{primary_language} での発話 (1-2 文)",
  "translation_ja": "日本語訳 (1-2 文)"
}
```

---

## 4. 実装計画 (1 unit、~26-30h)

詳細は [aidlc-docs/inception/anonymous-strangers/units-decomposition.md](../../../aidlc-docs/inception/anonymous-strangers/units-decomposition.md) の Task 1-10 参照。

| Task | 内容 | 時間 |
|---|---|---|
| 1 | Backend persona_pool + auth + fixture + PBT | 4-5h |
| 2 | engine.py anonymous resolve + LLM hybrid | 2h |
| 3 | API client 拡張 | 30min |
| 4 | PersonaSelection 2-source tabs | 2h |
| **5** | **MangaStage + i18n font + RTL + position** (最重) | **8-10h** |
| 6 | AnonymousPersonaList + Detail | 2h |
| 7 | OptInCard + preview + guard | 2h |
| 8 | e2e + mock LLM mode + regression | 3-4h |
| 9 | Demo video (~60s) | 1h |
| 10 | drawio + screenshots + 仕上げ | 1.5h |

---

## 5. 制約 / 留意事項

- **アイデア検証期**: develop / main へ自動 merge **しない** (memory `project-ideation-phase-no-auto-merge`、user 明示許可必須)
- **ハッカソン Pragmatism**: 単独開発、PR review は省略可、e2e + unit tests は必須 green
- **i18n font**: Noto Sans Arabic + Noto Sans SC を Google Fonts CDN で `font-display: swap`、1s timeout で graceful degrade
- **Privacy**: `user.sub` は API 流通禁止、内部 mapping のみ保持 (opt-out 時の新規召喚除外と citations 自己集計に必要)
- **既存 regression**: default `persona-source = "builtin"`、StageRenderer default mode = "chat"、e2e 12 spec 100/100 維持

---

## 6. ultrathink fixes 反映状況 (2026-05-24)

Critical 5 / Important 6 / Improvements 6 件すべて適用済 (詳細 [aidlc-docs/audit.md](../../../aidlc-docs/audit.md) 参照):

- C1: token streaming 諦め (anonymous は完成発話一括 emit)
- C2: 「今日 N 件」は mock seed fixture で 5 件
- C3: 「不可逆 mapping」→「内部 mapping は保持、API 不流通」へ表現訂正
- C4: AuthMiddleware integration を interface 層に明記
- C5: 3 source → 2 source (知り合いは別 branch)
- I1: MangaStage 見積 5-6h → 8-10h
- I2: i18n font は CDN preconnect (Tailwind ではない)
- I3: hybrid fixture + LLM
- I4: e2e mock LLM mode で flakiness 抑制
- I5: 既存 e2e 100/100 維持の verify を Task 8 に
- I6: Cognito/Mock 両対応の AuthBackendAdapter Protocol 経由を明記
- Imp1: demo の opt-in 反映 sequence を Task 9 に
- Imp2: localStorage key `yesman:persona-source` 予約
- Imp3: OptInCard で preview 常時表示
- Imp4: Property-Based Testing 1 件 (Task 1 + Task 5)
- Imp5: persona attribute に formality 追加 (MVP 含む)
- Imp6: 空 profile での opt-in guard (FR-9 / US-2.4)

---

## 7. 現状実装 (2026-05-24 final) — 初期構想からの差分

実装過程で UX 検証 + ハッカソンデモ向け改修を経て、初期構想 (§1〜§6) から以下の変更があった。**ここが現状の Source of Truth**。

### 7.1 Persona Selection: 2-tab → **3-tab**

| 項目 | 旧 (§2 Gherkin) | 現状 |
|---|---|---|
| Tab 数 | 2 (builtin / anonymous) | **3 (builtin / anonymous / **my**)** |
| `PersonaSource` type | `"builtin" \| "anonymous"` | `"builtin" \| "anonymous" \| "my"` |
| 自作 persona の置き場 | builtin tab 内に mix 表示 | **専用 my tab に分離** |
| 自作 0 件時 | (該当なし) | 空状態 placeholder + 「＋ 新規」 中央 CTA |

### 7.2 Anonymous: random sampling → **explicit 選択**

| 項目 | 旧 | 現状 |
|---|---|---|
| 表示 component | `AnonymousRandomCard` (自分 + random 2 名) | **`AnonymousSelectionList`** (opt-in pool 全件 list) |
| 選択 UI | ↻ shuffle | **user explicit 選択 (チェック式)** |
| Caller 扱い | 自分 + 2 名で render | **caller は完全除外** (「自分は世界の誰かではない」) |
| Backend endpoint | `GET /v1/persona-pool/random` | **`GET /v1/persona-pool/list?limit=N`** (旧 random は廃止) |

### 7.3 Selection 統一: **unified selection { source, id }[]**

| 項目 | 旧 | 現状 |
|---|---|---|
| 選択 state | persona_source ごとに別 storage | **`{ source: "builtin"\|"anonymous"\|"my", id: string }[]`** で統一 |
| Storage | (実装次第) | **localStorage key `yesman:unified-selection`** (max 3 across all sources) |
| Hook | (該当なし) | **`useUnifiedSelection`** (isSelected / toggle / reset / countBySource) |

### 7.4 ペルソナ作成 Modal の追加 (`/personas/selection` に統合)

旧 spec では `/personas` (PersonaListPage) のみ作成可だったが、現状は `/personas/selection` にも **「＋ 新規」 button + PersonaCreateModal** を追加。
- 作成成功時: `useCreatePersona` が my list を invalidate + `onCreated` callback で **my タブへ自動切替**
- moderator reject 時: server `detail.message` を error Toast

### 7.5 builtin おすすめ badge の常時表示

旧仕様: preference profile 由来の top N のみ「💡 おすすめ」 badge を付与 → 初回 user で profile 空時 badge 0 件。
現状: **builtin 3 種 (慎重 / 楽観 / 効率) は常に推奨**、preference top N は追加で merge (my persona も推奨対象に)。

### 7.6 MangaStage: 単一層 absolute → **flex column** + theme color

| 項目 | 旧 | 現状 |
|---|---|---|
| Layout | 単一の position:absolute parent + 内部絶対配置 | **flex column 3 段 (Overlay / Spacer / Cluster 220px)** |
| Mobile fit | iPhone SE で重なり多発 | flex flow で物理的に分離 |
| Actor 配色 | 固定 (`green/orange/blue`) by index | **persona theme color** (慎重=sky / 楽観=amber / 効率=violet)。anonymous は BlobAvatar (id hash) |
| Actor 表示 | BlobAvatar のみ | builtin は **emoji icon (🛡️/☀️/⚡) + gradient bg**、anonymous は BlobAvatar |
| Bubble bg | `pink` / `cream` (variant) | builtin は theme pastel (sky-100 / amber-100 / violet-100) で **bgColorOverride**、anonymous は pink |
| Self injection | builtin 経路で self_spec injection | **完全廃止** (selected_personas のみ) |
| 経路統一 | ChatStage (builtin) vs MangaStage (anonymous) | **全経路 MangaStage** (両経路統一、ChatStage 廃止) |

### 7.7 Bubble / Actor click 前面化 (新機能)

過去 bubble (small / opacity 0.3) または actor (icon/blob) を tap で前面化:
- `focusedPersonaId` state、同要素 再 tap で auto に戻る
- `MangaBubble` に `onClick` prop 追加 → `role=button` + Enter/Space キー対応
- actor は wrapping `<div>` → **`<button>`** に変更、placeholder は `disabled`
- 詳細 testid: `manga-actor-{0,1,2}`, `manga-bubble-{0,1,2}`

### 7.8 StageHeader: streaming → **completed** で文言切替

| 状態 | Title | Subtitle |
|---|---|---|
| streaming | 「決め中」 | 「● N 人で 考え中」 |
| **completed** | 「結論」 | 「● N 人の意見が まとまりました」 |

`<StageHeader status="streaming" \| "completed">` で切替。

### 7.9 Yes 採択後の overlay 残置 (UX 改善)

旧: SwipeChoice 押下後 proposal card 全体が unmount → overlay が一瞬で空白。
現状: **read-only な「決まったこと」 read-only card を同じ overlay 位置に残置** (`proposal-result-card-chosen`)、pink nudge は「✨ 決まりました。あとは行動するだけ ♪」に切替。

### 7.10 原文表示 toggle / Anonymous 履歴専用画面の **撤去**

| 機能 | 状態 |
|---|---|
| 原文表示 (`OriginalTextToggle`) | **削除** (UX 過剰、翻訳されたままで十分) |
| `AnonymousPersonaList` (履歴専用画面) | **削除** (Score に統合) |
| `AnonymousPersonaDetail` (詳細画面) | **削除** |
| 「今日 N 件の決め事に登場」 | **削除** (OptInCard preview のみ残置) |
| 口グセ (quirks) | **削除** (UX 過剰、prompt に組み込み済) |

### 7.11 Profile + AvatarEditor (新規)

| 項目 | 旧 (Inception 範囲外) | 現状 |
|---|---|---|
| Profile card | ProfileSummaryCard + BasicAttributesCard 分離 | **ProfileCard 統合** (案 A) |
| Avatar | default のみ | **8 color preset + 12 emoji preset + custom emoji** |
| Backend persist | (なし) | **`profile.avatar_config` JSONB** field を追加 |
| Mode | `"default"` | `"default" \| "color" \| "emoji" \| "image"` (image は将来枠) |

### 7.12 Home / Score の UI 構成変更

- **Home**: 委任率 strip を **画面先頭に移動** + placeholder 入力 box (mic icon) を **廃止**
- **Score**: 「📊 過去の傾向」 section (`PreferenceTrends` component) を embed、`/preferences` ページと shared

### 7.13 関連ドキュメント

現状実装の **画面遷移 / data-testid / 再生成手順** は別ファイルに分離:

📄 **[2026-05-24-final-ui-walkthrough.md](2026-05-24-final-ui-walkthrough.md)** — 実画面キャプチャ + Mermaid フロー + testid 一覧

実画面キャプチャ: [docs/screens/current/](../../screens/current/) (26 PNG、`tests/e2e/scripts/capture-current-screens.mjs` で再生成)
ツアー動画: [docs/demo/output/YesMan-tour-20260524-231509.mp4](../../demo/output/YesMan-tour-20260524-231509.mp4) (~3:50)
