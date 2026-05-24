# Requirements — anonymous-strangers (案 5)

> **位置付け**: YesMan v0.5.0-α 拡張。匿名の他ユーザーから派生した persona と合議する機能。
> **ベース**: [docs/superpowers/idea/合議アイデアとして考えたこと.txt](../../../docs/superpowers/idea/合議アイデアとして考えたこと.txt) 案 5
> **mockup**: [docs/superpowers/idea/mockup-anonymous-strangers.html](../../../docs/superpowers/idea/mockup-anonymous-strangers.html)
> **改訂**: 2026-05-24 ultrathink レビューで Critical 5 / Important 6 / Improvements 6 件適用済 (詳細は [audit.md](../../audit.md))
>
> **2026-05-24 Simplification**: 「口グセ (quirks)」および「原文を表示」機能を仕様から削除。persona の signal は **value_tags のみ**で構成、発話は **日本語完成 text のみ**を bubble に表示する (元言語表記は廃止)。本ドキュメント内の旧記述 (FR-1 「口グセ抜粋」, FR-3 「原文を表示」, FR-2 fixture の `original` field, US-1.3 全体, US-3.2 AC-3, NFR-5 RTL font, application-design Data Model `quirks`/`quirks_original`, LLM prompt の `{original, translation_ja}` JSON 等) は **本セクションが優先**し、現状コード ([apps/api/src/yesman_api/domain/persona_pool/models.py](../../../apps/api/src/yesman_api/domain/persona_pool/models.py) / [apps/api/src/yesman_api/domain/decision/engine.py](../../../apps/api/src/yesman_api/domain/decision/engine.py) / [packages/api-client/src/modules/persona-pool.ts](../../../packages/api-client/src/modules/persona-pool.ts)) が正。

## Intent Analysis

| 項目 | 値 |
|---|---|
| 要求の明確さ | **Clear** (mockup 11 画面で UI 確定) |
| 要求タイプ | **New Feature** (既存合議に新 persona pool 追加) |
| スコープ | **Multiple Components** (api + web + ui + sse 拡張) |
| 複雑度 | **Moderate** (既存 persona resolver + SSE 流用、新 UI が重い) |
| Depth | **Standard** |

## Vision

> AI が学習して提案するのは新鮮さがない (Gemini 等で既体験)。差別化は「**その先に実在する誰かがいる**」 — 自分の価値観タグ + 口グセを opt-in 公開し、世界の誰かの合議で persona として動く、という**メタ的な相互参加体験**。

## Functional Requirements

### FR-1: 匿名 Persona Pool
- ユーザーは自分の価値観 (preference profile から派生した tags + 口グセ抜粋 + formality) を **opt-in トグル** で「世界の誰か」プールに公開できる
- 公開時は **対外的に匿名化**: API レスポンスから user.sub / display_name / email は流通させない、persona_id (UUID) のみ
- **内部 mapping (sub ↔ persona_id) は backend 内部のみ保持** (opt-out 時の新規召喚除外、citations の自己集計に必要)、API 経由では絶対に流通しない
- いつでも opt-out 可能、opt-out 後は新規合議では使われない (既存合議ログには痕跡を残してよい)

### FR-2: ランダム召喚
- 合議メンバー選択画面で「世界からランダム 2 名を呼ぶ」ボタンを提供 (自分 + 匿名 2 名 = 3 人合議)
- ↻ ボタンで別の 2 名に **shuffle** 可能 (LLM 呼び出し前なら何度でも、client-side debounce 500ms)
- 召喚条件: opt-in 済み user 中、自分以外、preference profile から派生した tags が **3 件以上** の user からランダム抽選 (空 persona 防止)

### FR-3: 多言語 persona speech (token streaming 不採用)
- 各匿名 persona は **元言語属性** (元 user の言語、または抽選時にランダム付与) を持つ
- 発話は**翻訳済**で表示 (デフォルト: 日本語)、bubble 下の「**原文を表示**」リンクで原文⇔翻訳トグル
- デモ用に少なくとも 5 言語をサポート: ja, en, fr, ar, zh
- **token streaming は採用しない** (JSON 出力 `{"original", "translation_ja"}` の構造化要件と既存 `utterance_delta` chunk streaming は両立不能)。代わりに完成発話を `utterance` event で一括 emit + frontend で bubble slide-in animation で UX を担保
- **hybrid 戦略**: fixture 5 名 (各言語 1 名) は hardcoded `original` / `translation_ja` を持つ、6 名目以降のみ LLM 動的生成。fixture により demo 品質を保証 + LLM Arabic/Chinese 出力のクオリティ不安定を回避

### FR-4: 漫画吹き出しステージ UI
- 既存 chat bubble UI とは別に、**漫画的に重なる吹き出し**で 3 persona の発話を表現
- 話している persona の bubble は大・full 不透明・shadow、既出 bubble は小・opacity 0.55
- 地球の地平線演出 (3 色の半円が重なる) を背景に、blob アバター 3 体が立つ
- typing dots は発話前 persona の頭上に「考え中」吹き出しとして表示
- mockup の絶対 px position (bottom 184/152/170 と actor margin-bottom 32/0/18 の連動関係) は固定。Pixel 5 (393×851) viewport で最適化、レスポンシブは MVP 外

### FR-5: 過去ログとプロファイル参照
- 過去合議ログから「これまで決めてくれた世界の誰か」をリスト表示 (匿名アイコン + 「3 日前」等の相対時刻のみ)
- リストから 1 人選ぶと **プロファイル詳細** (価値観タグ + 口グセ 3 件 + 原文付き + 一緒に決めた回数)

### FR-6: 自分プロファイル + opt-in 制御
- プロフィール画面に「**他の人の決め事に参加する**」トグル + **流通対象データ preview**
- preview には**現時点で流通する** tags 一覧 (max 5) + 口グセ 一覧 (max 3) を **常時表示** (透明性確保)
- トグル ON 時、preference profile から派生した tags + 口グセ + formality が anonymous persona として pool 登録される
- 「今日 N 件の決め事に登場しました」の **逆方向ステータス** を表示 (= 自分の persona が他者の合議に何回 cite されたか)
- MVP では mock backend が起動時に **seed cite events を 5 件 fixture 生成** し、表示数を担保

### FR-7: 既存 builtin persona との共存 (2-source 切替)
- 既存の 3 builtin persona (cautious / bold / pragmatic) は維持
- 「Persona Selection」画面で **2 source (builtin / anonymous)** をタブ切替可能。「知り合い (家族・友人)」source は本 unit のスコープ外 (別 branch `feature/next-spec-ideas-group-chat` の課題)
- 選択は localStorage `yesman:persona-source` に永続化 (既存 key と衝突しないこと)、default は **`builtin`** (regression 防止)

### FR-8: Persona attribute に formality を追加 (MVP 推奨)
- 元アイデア:「敬語なのかフランクなのか、しゃべり方のくせ」を反映
- 各 anonymous persona は `formality: "polite" | "casual" | "blunt"` を持つ
- LLM prompt の tone control に直結、demo インパクトに寄与
- 追加コスト: spec model に 1 field + prompt 1 行のみ

### FR-9: opt-in 前提条件 guard
- 空 preference profile (onboarding 未完了 or 採択履歴 0) での opt-in は disabled
- guard: preference profile から派生する tags + 口グセ合計が **3 件以上** あること
- 未充足時、トグル下に "嗜好把握が足りないので公開できません。何回か決定を試してみてください" を inline message 表示

## Non-Functional Requirements

### NFR-1: バックエンドは mock 永続化で OK + seed cite fixture
- ハッカソンスコープでは DB を使わず、`apps/api` 既存の in-memory mock repository (`yesman:storage:mock`) を流用
- 単一サーバ・複数ユーザーシミュレーションは preference profile の seed データ + LLM 動的生成で代用
- mock backend は起動時に **anonymous_pool_seed.py** から 5 fixture persona (en/fr/ar/zh/ja 各 1) を pool 投入し、 **seed cite events 5 件**も生成する (「今日 N 件登場」を即時可視化)
- 本番化時 (Aurora) には SQLModel 拡張する TODO を残す (本 unit では実装しない)

### NFR-2: 既存 SSE 基盤を再利用 (token streaming は anonymous 経路では非採用)
- `/v1/decisions/streaming` の `personas` / `utterance` event をそのまま使用
- anonymous source 時は `utterance_delta` event を **emit しない** (完成 JSON が来てから 1 回だけ `utterance` を emit)
- `utterance` event の payload に optional `original?: string` + `primary_language?: string` + `formality?: string` を追加
- frontend は `id.startsWith("p_anonymous_")` で renderer を分岐し、漫画ステージ + slide-in animation で UX 担保

### NFR-3: パフォーマンス
- 3 persona 並列 streaming 完了まで **30 秒以内** (既存値踏襲、JSON 構造化出力 overhead 込み)
- 漫画吹き出し switching animation は **CSS keyframe のみ**、追加 JS 計算は最小化
- LLM 動的生成は最大 6 名目以降、fixture 5 名は遅延ゼロ

### NFR-4: アクセシビリティ
- `prefers-reduced-motion` を honor (既存 globals.css の方針を踏襲)
- bubble 切替は opacity transition のみ (位置・スケール変化は reduced-motion 時 off)
- 原文表示は ARIA-described 切替 button で実装、screen reader でも "原文を表示" → "翻訳を表示" の切替が読み上げられる
- RTL bubble は `dir="rtl"` を bubble 内側のみに適用、stage layout 全体は LTR を維持

### NFR-5: i18n font 戦略
- 各 persona の元言語と発話原文は LLM 出力 (or fixture) の `original` / `translation_ja` フィールドで持つ
- フォント読み込み: `apps/web/index.html` に `<link rel="preconnect"> + <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic&family=Noto+Sans+SC&display=swap">` を追加 (Tailwind の機能ではなく直接 CDN load)
- `font-display: swap` で初回表示は system font fallback、後追いで Noto に差替え (FOIT 回避)
- 1s 以内に Noto fetch 失敗時は system font の fallback で原文 toggle を継続表示 (機能 graceful degrade)

### NFR-6: プライバシー / 認証
- opt-in 公開時、preference profile の **生データ** (decision text, full chat log) は流通させない
- 流通するのは派生した **tags + 口グセ短文 (max 3 件・各 30 字以内) + formality + primary_language** のみ
- 新規 5 endpoint は既存 **AuthMiddleware を必須経由** (Cognito/Mock 両対応の AuthBackendAdapter Protocol を踏襲)、`user.sub` は `get_current_user` dep 経由で取得
- `GET /v1/persona-pool/random` の `exclude` パラメータは無視可能 (自分の sub を server 側で自動 exclude、untrusted client 値は信用しない)

## Out of Scope (明示的に除外)

- **本物の多ユーザー DB**: 単一 process 内 mock pool + seed fixture で OK
- **WebSocket / real-time chat**: SSE 単方向で十分
- **invite URL / QR code / 知り合いシェア**: 別 branch [feature/next-spec-ideas-group-chat](../../../docs/superpowers/idea/mockup-group-chat.html) のスコープ
- **3 source 切替 (builtin + 知り合い + 世界の誰か)**: 本 unit は 2 source のみ (builtin / anonymous)
- **persona 通報・モデレーション機能**: MVP 外、後続検討
- **本番 Aurora 永続化 + sub↔persona_id mapping の DB table 化**: NFR-1 の TODO として記録、本 unit では実装しない
- **opt-in グローバル統計の本格集計** (今日 N 件…の全体集計): mock seed fixture で代替

## Constraints

- C-1: 既存 v0.4.0 + drill-down + onboarding 機能を**壊さない** (PersonaSelectionPage で従来 mode との共存切替が要る、e2e 100/100 維持)
- C-2: 既存の Tailwind v4 + custom keyframe 方針を維持、新規ライブラリ依存は追加しない (Noto Sans は CDN 経由で font-face 追加のみ)
- C-3: LLM は既存 LiteLLM (Azure GPT-5.4-mini) を流用、追加 provider 不要
- C-4: ハッカソンスコープ内で完結 (DB / WebSocket / auth 強化は不要)
- C-5: 認証経路は既存 AuthMiddleware 透過、本番 = Cognito、dev = Mock (AuthBackendAdapter Protocol を使う)

## Success Criteria

- [SC-1] mockup の 11 画面と等価な user flow が動く (splash → signin → home → 3 人召喚 → 漫画ステージで合議 → YES → 過去ログ → プロファイル詳細)
- [SC-2] demo 動画 (~60s) で「fixture seed 5 名 + 自分の opt-in 1 名 = 計 6 名 pool」から 2 名 random 召喚され、漫画ステージに 3 言語 (ja + en + fr 等) が並ぶ様を見せる
- [SC-3] 既存 e2e (mobile-chrome) が壊れない (100/100 PASS 維持)
- [SC-4] 漫画吹き出し layout が prefers-reduced-motion で gracefully degrade する
- [SC-5] FR-9 (空 profile での opt-in guard) が動作、e2e で空 profile user が opt-in できないことを assert
