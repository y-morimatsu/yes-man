# User Stories — anonymous-strangers

> **派生元**: [requirements.md](requirements.md) + [mockup 11 画面](../../../docs/superpowers/idea/mockup-anonymous-strangers.html)
> **改訂**: 2026-05-24 ultrathink fixes applied (US-2.1 / US-2.2 / US-2.3 + new US-2.4)
>
> **2026-05-24 Simplification**: 「口グセ (quirks)」および「原文を表示」機能を仕様から削除。**US-1.3 (多言語発話の原文を切り替える) は廃止**。US-2.1/US-2.3/US-2.4 等で「口グセ」言及は「value_tags のみ」に読み替え、US-3.2 AC-3 (口グセ 3 件) は撤回。要件全体は [requirements.md](requirements.md) 冒頭の Simplification 注記を参照。

## Personas (利用者像)

| Persona | 説明 |
|---|---|
| **Curious-Taro** (新規 user) | YesMan を初めて使う、世界の誰かに決めてもらう体験に興味がある |
| **Active-Hanako** (継続 user) | 過去合議数 24 件、自分の opt-in トグルを ON にして他者に貢献したい |
| **Privacy-Suzuki** | 価値観だけ匿名公開ならアリ、自分の email / 履歴は絶対流通させたくない |
| **Empty-Newbie** (onboarding 未完了) | 嗜好把握を skip した、preference profile がほぼ空 |

## Stories

### Epic-1: 世界の誰かと合議する

#### US-1.1: ランダム召喚で 3 人合議を開始する
- **As a** Curious-Taro
- **I want to** ホーム画面の「決めてもらう人」card で 3 人 (自分 + 匿名 2 名) を確認し、↻ で別の 2 名に切替できる
- **so that** 多様な視点からの合議を試せる
- **AC**:
  - [AC-1] ホーム card に 3 アバター stack が表示される (自分は顔写真風 icon、他 2 名は blob)
  - [AC-2] ↻ tap で member の 2 名が別の anonymous persona に shuffle される (LLM 呼び出し前なら何回でも、500ms debounce)
  - [AC-3] 「決めてもらう」 button tap → /decision に遷移、漫画ステージで合議が始まる
  - [AC-4] pool が 1 名以下 (fixture 全部 exclude=self になるケース) は seed fixture 5 名で常時補完される (NFR-1)

#### US-1.2: 漫画的に重なる吹き出しで合議を見る
- **As a** Curious-Taro
- **I want to** 3 persona が順番に発話する様子を漫画的に重なる bubble で見る
- **so that** 「3 人がワイワイ議論している」臨場感を体験できる
- **AC**:
  - [AC-1] 話している persona の bubble が大・full opacity・shadow、既出 bubble は小・opacity 0.55
  - [AC-2] 発話前 persona の頭上に typing dots (●●●) が思考吹き出しで表示される
  - [AC-3] 背景に地球地平線 (3 色半円) + 3 blob アバターが立つ
  - [AC-4] 完了後は決定カード 1 枚に集約、NO / YES button が出る
  - [AC-5] anonymous source 時は token streaming **なし**、完成発話を slide-in animation で fade-in (FR-3 / NFR-2)

#### US-1.3: 多言語発話の原文を切り替える
- **As a** Curious-Taro
- **I want to** 各 bubble 下の「原文を表示」リンクで翻訳⇔原文を切替
- **so that** persona が「実在の他人」(別言語話者) という臨場感を味わえる
- **AC**:
  - [AC-1] デフォルトは日本語訳が表示される
  - [AC-2] 「原文を表示」 tap で原文 (en/fr/ar/zh のいずれか) に切替、リンク文言が「翻訳を表示」に変わる
  - [AC-3] 5 言語 (ja/en/fr/ar/zh) 中、自分は ja、他 2 名は fixture から random 抽選で別言語が割り当てられる
  - [AC-4] 切替 button は ARIA-described、screen reader でも切替が読み上げられる (NFR-4)
  - [AC-5] Noto font 未 load 時は system font fallback で原文 toggle 継続表示 (NFR-5、機能 graceful degrade)

### Epic-2: opt-in で自分を世界に提供する

#### US-2.1: 「他の人の決め事に参加する」 トグル + 流通対象 preview
- **As an** Active-Hanako
- **I want to** プロフィール画面の opt-in トグル ON で、自分の価値観タグと口グセを world pool に公開する。流通対象データは常時 preview で見える
- **so that** メタ的に「自分の人格が世界のどこかで動いている」体験を、不安なく開始できる
- **AC**:
  - [AC-1] トグル ON 時、preference profile から派生した tags + 口グセ + formality + primary_language が anonymous persona として pool 登録される
  - [AC-2] 流通対象データ preview がトグル card 内に常時表示される: 現時点で流通する tags (max 5) + 口グセ (max 3) のリスト
  - [AC-3] 流通するのは tags + 口グセ短文 + formality + primary_language のみ、email / displayName / 生 chat log は絶対流通しない (NFR-6)
  - [AC-4] トグル OFF 時、新規合議では cite されなくなる (既存合議ログには痕跡が残ってよい)
  - [AC-5] 内部 mapping (sub ↔ persona_id) は backend 内に保持、API 経由では流通しない (FR-1)

#### US-2.2: 自分が cite された逆方向ステータス
- **As an** Active-Hanako
- **I want to** 「今日 N 件の決め事に登場しました」と数字で見える
- **so that** 自分の貢献度が実感できる
- **AC**:
  - [AC-1] トグル card 内に「今日 N 件」表示
  - [AC-2] N は server-side `GET /v1/persona-pool/me/citations` で取得 (mock backend が seed fixture から 5 件返す、本番化時は global aggregate へ昇格)
  - [AC-3] localStorage 集計**ではない** (他 session の cite を計測するには server-side が必須)

#### US-2.3: プライバシーガード (preview 必須)
- **As a** Privacy-Suzuki
- **I want to** 流通するデータが具体的に何かを **opt-in 前** に確認したい
- **so that** 抽象的な説明文 (「価値観タグや口グセが…」) ではなく、自分の **具体的な** tags リストを見てから判断できる
- **AC**:
  - [AC-1] トグル OFF 状態でも流通対象 preview を表示 (「現在 OFF: もし ON にすると以下が流通します」)
  - [AC-2] 内部 mapping は backend のみで保持される明示 ("display name / email は絶対送信されません")
  - [AC-3] トグル card に「あなたの 価値観タグや 口グセが、世界の だれかの 決め事に 使われます」明文表示

#### US-2.4: opt-in 前提条件 guard
- **As an** Empty-Newbie
- **I want to** 嗜好把握が不十分な状態では opt-in トグルが disabled で、何が必要かが分かる
- **so that** 中身の薄い persona を世界に流通させてしまうことを防げる
- **AC**:
  - [AC-1] preference profile 由来 tags + 口グセ合計 < 3 件の時、opt-in トグルが disabled
  - [AC-2] トグル下に inline message: "嗜好把握が足りないので公開できません。何回か決定を試してみてください"
  - [AC-3] tags 充足後、page reload なしで auto-enable (TanStack Query の cache invalidation 経由)

### Epic-3: これまで決めてくれた誰かを振り返る

#### US-3.1: 召喚された anonymous persona のリスト
- **As a** Curious-Taro
- **I want to** 「これまで決めてくれた世界の誰か」リストを見る
- **so that** 過去の合議参加者を振り返れる
- **AC**:
  - [AC-1] 履歴タブから anonymous persona list 画面に到達
  - [AC-2] 各 row は 匿名 blob アバター + 「3 日前」相対時刻 + chevron `›`
  - [AC-3] 名前は出さない (匿名性維持)

#### US-3.2: 匿名 persona のプロファイル詳細
- **As a** Curious-Taro
- **I want to** リストから 1 人選んで価値観タグと口グセを見る
- **so that** 「どんな人だったか」を後追いで知れる
- **AC**:
  - [AC-1] 詳細画面に 80px の blob アバター + 「N 回 一緒に決めた」
  - [AC-2] 価値観タグ row (3-5 個)
  - [AC-3] 口グセ 3 件 (各 quote の下に「原文: ...」を併記)

### Epic-4: 既存 build (v0.4.0 + drill-down + onboarding) を壊さない

#### US-4.1: 既存 builtin persona モードと共存
- **As an** existing user
- **I want to** 従来の builtin 3 persona (cautious / bold / pragmatic) も引き続き使える
- **so that** v0.4.0 の合議 UX が回帰しない
- **AC**:
  - [AC-1] /personas/selection 画面で「builtin 3 人」と「世界の誰か (random 2 人)」を 2-source タブで切替可能 (FR-7)
  - [AC-2] localStorage `yesman:persona-source` に最後の選択を永続化、新規 user の default は **builtin** (従来の流れを変えない)
  - [AC-3] 既存 e2e tests (mobile-chrome) が 100/100 PASS

## Story Mapping

| 優先度 | Epic | Story | 理由 |
|---|---|---|---|
| **P0** (MVP) | Epic-1 | US-1.1 + US-1.2 + US-1.3 | コア体験、ここがないと差別化ゼロ |
| **P0** | Epic-4 | US-4.1 | regression 防止、ここが壊れると release 不可 |
| **P0** | Epic-2 | US-2.4 | opt-in guard、空 persona 流通の事故防止 |
| **P1** | Epic-2 | US-2.1 + US-2.3 | opt-in の核心、preview で privacy 担保 |
| **P2** | Epic-3 | US-3.1 + US-3.2 | 過去ログ参照、後追い体験として valuable |
| **P2** | Epic-2 | US-2.2 | 逆方向ステータス、mock seed 5 件で demo は成立 |
