# AI-DLC State Tracking

## Project Information
- **Project Name**: YesMan
- **Project Type**: Greenfield
- **Start Date**: 2026-05-09T00:00:00Z
- **Current Stage**: 🎉 **CONSTRUCTION フェーズ完全完了** + 🔁 **Post-CONSTRUCTION 改修フェーズ v4** (Hackathon Pragmatism + Git-Flow `feature/* → develop → main` 運用、2026-05-17 〜 進行中) / OPERATIONS phase (placeholder)
- **Last Approved Stage**: CONSTRUCTION - Build and Test (approved 2026-05-16、CONSTRUCTION フェーズ 11 unit + Build and Test ALWAYS EXECUTE 全完了)
- **Latest Commit**: `73d1dda` (2026-05-24、`feature/next-spec-ideas-anonymous-strangers` branch、anonymous-strangers feature + UI ポリッシュ 126 files / +19866 / -3310、merge 承認待ち)
- **Post-CONSTRUCTION 改修フェーズ v4 主要追加** (2026-05-24):
  - **anonymous-strangers feature (案 5)**: 「世界の誰か」匿名 persona pool との合議。`persona_pool` domain (models / protocols / MockPoolRepository) + 5 endpoint (list / detail / opt-in / opt-out / status)。decision engine の **mixed 経路** (builtin + anonymous + my の任意 mix、selected_personas DTO で渡す)、self_spec injection は廃止。
  - **3-source persona selection**: ビルトイン / 世界の誰か / **カスタム (自作)** の 3-tab に再設計。`PersonaSource = "builtin" | "anonymous" | "my"`、`localStorage:yesman:persona-source`。`useUnifiedSelection` で `{ source, id }[]` を統一管理 (max 3 across all sources)。
  - **ペルソナ作成 Modal**: `/personas/selection` に「＋ 新規」 button 追加、PersonaCreateModal を共有。成功時 `useCreatePersona` invalidate + `onCreated` callback で **my タブに自動切替**。builtin おすすめ badge は **常時表示** (preference top N は追加で merge)。
  - **MangaStage (漫画ステージ)**: 3 actor が底辺に並ぶ漫画調レイアウト + EarthHorizon 背景。**flex column 3 段** (Overlay / Spacer / Cluster 220px) で mobile fit。builtin persona は **theme color icon** (慎重=sky 🛡️ / 楽観=amber ☀️ / 効率=violet ⚡)、anonymous は BlobAvatar。Bubble bg も同 theme で `bgColorOverride`。両経路 (builtin + anonymous) で統一 (旧 ChatStage 廃止)。
  - **Bubble / Actor click 前面化**: 過去 bubble (small / opacity 0.3) または actor を tap で前面化、再 tap で auto に戻る。`MangaBubble` に `onClick` prop、actor wrapper は `<button>` 化。
  - **StageHeader 状態切替**: 「決め中 / 考え中」 (streaming) → 「結論 / まとまりました」 (completed)。
  - **Yes 採択後 overlay 残置**: SwipeChoice 押下後も「決まったこと」 read-only card を overlay 同位置に残置、「ばーんと消える」体感を抑制。
  - **Avatar カスタマイズ**: 8 color preset + 12 emoji preset + custom emoji 入力。`profile.avatar_config` (JSONB) で persist。ProfileCard 統合 (案 A) で表示 / 編集を一元化。
  - **Home / Score 再構成**: 委任率 strip を Home 先頭に移動 + placeholder 入力 box 廃止。Score に「📊 過去の傾向」 (PreferenceTrends) を embed (`/preferences` と shared)。BottomNav 4-tab (Home / スコア / ペルソナ / プロフィール)、履歴専用画面は撤去。
  - **削除した機能**: 原文表示 (`OriginalTextToggle`) / 口グセ (quirks) / AnonymousPersonaList / Detail / 「今日 N 件」 (UX 過剰として撤去)。
  - 影響ユニット: U4-decision / U7d-features / U7c-api-client / U7b-ui / U2-storage (profile.avatar_config) / **新規 persona_pool domain**
  - tests: api 約 290 PASS / web **262 PASS** / 42 files / ui **51 PASS** / e2e 安定化済
  - 関連 spec: `2026-05-24-anonymous-strangers-design.md` §7 (現状実装からの差分) + `2026-05-24-final-ui-walkthrough.md` (画面遷移 + testid)
  - キャプチャ: `docs/screens/current/` (26 PNG) / ツアー動画: `docs/demo/output/YesMan-tour-20260524-231509.mp4` (~3:50)
- **Latest Post-CONSTRUCTION v3 Commit**: PR #97 merged (`51c613c`、2026-05-23、v0.4.0 release pending)
- **Post-CONSTRUCTION 改修フェーズ v3 主要追加** (2026-05-23):
  - **議論チャット token streaming + persona pre-fill (PR #86、`e791650`)**: `engine.run_stream` を `_llm.stream()` ベースに refactor、`asyncio.Queue` で 3 persona 並列 stream し新 SSE event `utterance_delta` (chunk yield) を emit。`personas` event で delta 前に bubble pre-fill。失敗 persona も空 text utterance event で「発言中…」状態を解除。frontend reducer に `onPersonasResolved` + `onUtteranceDelta` action 追加、`Utterance.done` で streaming 中 / 確定済を区別。`PersonaThinkingChips` 廃止、`DecisionUtteranceBubble` header に persona icon + 「発言中…」amber pill 統合。同 PR で QuickStart catchAll 除外バグ修正 + `VITE_QUICKSTART_DEDUPE=off` env var 追加。
  - **EVENT_BACKEND=inline-async で preference 同プロセス更新 (PR #89、`a094204`、Closes #88)**: `SyncPublisher` no-op バグを修正。`InlineLearningHandler` (`RepositoryFactory.bundle()` 経由で `apply_yes`/`apply_no`) を新設、`EventPublisherFactory(config, repo_factory=...)` で injection。`.env` 既定値を `sync` → `inline-async` に変更し dev/demo で preference profile が反映されるよう修復。
  - **No 後の microcopy を LLM 動的生成 + Yes nudge tone (PR #94、`5261d9d`、Closes #93)**: `NudgeMessageGenerator.generate_yes_microcopy()` を新設、stage 別 tone (1 軽い前向き / 2 共感 / 3 不安吸い上げ / 5+ 委ねる)、新 endpoint `POST /v1/decisions/{id}/yes-nudge` (同期返却、2s timeout + stage 別 fallback)。frontend `useYesNudge` + `NoMicroCopyBanner.dynamicMessage` prop。同 PR で `useChooseMutation` で `["decisions"]` キャッシュ invalidate (ScorePage 「最近の Yes 採択」 反映遅延バグ修正)。
  - **合議 / Yes-No 演出ゲーミフィケーション (PR #95 + #97、`7282539` + `51c613c`)**: chat 風 typing dots (●●● blink) + bubble slide-in + proposal 到着 「📨 合議完了」 notification banner。Yes 連続採択 combo system (`useYesCombo` localStorage 日次 reset、`YesComboBadge` tier 🔥/🌟/⚡/🏆) + tier 別 confetti 強度 (10 連で 3 wave 大爆発 + 金色)。Yes 誘導: SwipeChoice 右辺 green glow pulse + 「→ → → Yes」 marching arrows、YesMan マスコット (🤵 右上 fixed + 5 状況別 speech bubble、bobbing + pop-in)。`globals.css` に keyframes 9 種追加、`prefers-reduced-motion: reduce` 対応。
  - 影響ユニット: U4-decision / U7d-features / U7c-api-client / U7b-ui / U5-learning
  - tests: api **284 PASS** / 14 SKIP (新 13) / web **209 PASS** / 35 files (新 27) / e2e 101 PASS / 12 SKIP
- **Post-CONSTRUCTION 改修フェーズ v3 主要追加** (2026-05-22):
  - **YES/NO Quick-Start (`feature/quick-start-yes-no` → PR #78 merged、spec `2026-05-22-yes-no-quickstart-design.md` v2)**: DecisionPage の起動時 UI を 「テキスト入力」から「時刻×曜日に応じた YES/NO クイック質問」に置換。質問 pool は Bedrock LLM で **build-time 生成 + checked-in JSON** (runtime LLM ゼロ)。5 連続 NO で textbox に fallback。
    - 新規 script: `apps/api/scripts/generate_quick_start_templates.py` (Sonnet 4.6、Pydantic schema validate、max 3 retry、`--seed` で deterministic fallback pool)
    - 新規 schema: `apps/api/src/yesman_api/application/quick_start/schema.py`
    - 新規 web module: `quickStartTemplates.ts` / `quickStartHistory.ts` / `useQuickStart.ts` / `QuickStartCard.tsx`
    - 影響ユニット: U4-decision (script) / U7d-features (DecisionPage UI 改修)
    - tests: api 7 件 + web 24 件 = 31 件 PASS / e2e は `gotoAuthenticated` helper に `skipQuickStart` option を追加して既存 spec 互換
  - **Quick-Start UI を SwipeChoice 統一 (`feature/quick-start-swipe-ui`、spec v3)**: 上記 v2 の YES/NO 操作を **合議結果 (DecisionResult) と同じ左右スワイプ UX** に統一。`SwipeChoice` component を再利用し、独自 Y/N ボタンと keyboard hint を撤廃。`DecisionPage` 側で `<QuickStartCard key={quick.current.id} ...>` 形で re-key し、SwipeChoice の confirming/dx 残留を防止。tests: web unit 170 PASS / quick-start e2e 7/7 PASS (swipe fallback button + ArrowLeft/Right + SSE 統合) / build OK。
- **Post-CONSTRUCTION 改修フェーズ v2 主要追加** (2026-05-22):
  - **Pack A (PR #15、`a731786` merged to develop → main v0.2.0)**: Demo UX Polish 4 件 (Score 煽り文 / Home Summary カード / SSE thinking chips / Yes confetti)
  - **Decision History (feature/web-score-decision-history、6 task)**: `GET /v1/decisions` 履歴 endpoint + `attempt_count` (user_input_hash group) + Mock seed regenerate session + Web `DecisionHistoryList` + utilities (`formatRelativeTime` / `truncate`) + ScorePage 組込
  - 影響ユニット: U4-decision (API endpoint + scorer) / U7d-features (Score / Home / Decision の全 UI) / U7c-api-client (history method)
  - 全文書反映: `screens/02-discussion-live.svg` + `screens/04-score-dashboard.svg` 拡張、`screens/README.md` + `diagrams/README.md` + 各 unit `functional-design.md` に Post-CONSTRUCTION v2 改修注記を追記
- **U1 完了**: 全 4 ステージ承認済 (Functional Design SKIP / NFR Req / NFR Design / Infrastructure Design / Code Gen Part 1+2)、`infra/` に 24 ファイル / 約 2,959 行
- **Hackathon**: AWS Hackathon

## Workspace State
- **Existing Code**: No
- **Programming Languages**: N/A (no code yet)
- **Build System**: N/A
- **Project Structure**: Empty (greenfield)
- **Reverse Engineering Needed**: No
- **Workspace Root**: /Users/morimatsu/lab/ai-dlc-hackathon

## Code Location Rules
- **Application Code**: Workspace root (NEVER in aidlc-docs/)
- **Documentation**: aidlc-docs/ only
- **Structure patterns**: See code-generation.md Critical Rules

## Extension Configuration
| Extension | Enabled | Decided At |
|---|---|---|
| Security Baseline | Yes | Requirements Analysis (2026-05-09) |
| Property-Based Testing | Yes | Requirements Analysis (2026-05-09) |
| Construction Flow | Yes | Issue #6 implementation (2026-05-19) |
| Frontend Design | Yes | Issue #6 implementation (2026-05-19) |
| Visual Supplements | Yes (Full) | drill-down-auto-open Requirements Analysis (2026-05-26) |

### Feature-specific overrides
| Feature | Extension | Enforcement | Decided At |
|---|---|---|---|
| drill-down-auto-open | Visual Supplements | **Full** | 2026-05-26 (Q1=A) |
| drill-down-auto-open | Frontend Design | **Full** | 2026-05-26 (Q2=A) |
| drill-down-auto-open | Security Baseline | **Full** | 2026-05-26 (Q3=A) |
| drill-down-auto-open | Property-Based Testing | **Skip (No)** | 2026-05-26 (Q4=C, feature-specific override of project-wide Yes — drill-down handler は単純な条件分岐、pure function なし) |
| drill-down-auto-open | Construction Flow | **Partial (01/03/05)** | 2026-05-26 (Q5=B, parallel sub-agent / approval gating / phase summary は scope 外、exploration / multi-approach / confidence-filtered review のみ強制) |

## Stage Progress
### 🔵 INCEPTION PHASE
- [x] Workspace Detection (2026-05-09)
- [ ] Reverse Engineering (SKIP - greenfield)
- [x] Requirements Analysis (approved 2026-05-09 / **post-approval addition: FR-PERSONA 追加 2026-05-09T05:00Z**)
- [x] User Stories (approved 2026-05-09 / **post-approval addition: Journey G 7 ストーリー追加 2026-05-09T05:15Z**)
- [x] Workflow Planning (approved 2026-05-09 / **post-approval update: ユニット数 7→12, ストーリー数 25→32, 受け入れ基準 13→16 反映 2026-05-09**)
- [x] Application Design (approved 2026-05-09 / **post-approval update: PersonaCatalogService + PersonaModerator + 3 新テーブル + Page 10 Sequence 追加 2026-05-09 / FR-CV: DiscussionStreamer + DiscussionService + LiveDiscussionView + DiscussionHistoryView + Page 11 Sequence 追加 2026-05-10**)
- [x] Units Generation (**approved 2026-05-10T03:50:00Z** / 12 ユニット: U1〜U7d + U-Persona + U-Test、依存マトリクス + Story Map 完備、FR-CV B7・B8 マッピング反映済)

> **🔄 FR-PERSONA 追加に関するメタ情報** (2026-05-09T05:00:00Z 以降):
> 既に承認済みの全ステージ (Requirements / User Stories / Workflow Planning / Application Design) に対して、要求仕様 FR-PERSONA (3.11 ペルソナ・カタログ・共有) を後から追加。再承認は不要として下流ドキュメントへ整合的に反映済。整合性レビュー結果は audit.md (2026-05-09T05:45:00Z) を参照。

### 🟢 CONSTRUCTION PHASE

#### U1 / infra (Phase 0、進行中)
- [⏭] Functional Design — **SKIP** (新規データモデル/業務ロジックなし、CDK 構成のみ)
- [x] NFR Requirements — **approved 2026-05-10T09:00:00Z** / `aidlc-docs/construction/U1-infra/nfr-requirements/nfr-requirements.md` / ultrathink レビュー後 9 件修正適用済 (Aurora 表現修正 / PBT N/A 明示 / EventBridge HTTP POST 確定 / FR-AI-01〜03 トレース / CW Billing Alarm / dev CORS / `/health` 所有者 / ECR Pull 設定 Open Issue / CI Python 依存)
- [x] NFR Design — **approved 2026-05-10T10:00:00Z** / `aidlc-docs/construction/U1-infra/nfr-design/nfr-design.md` / ultrathink レビュー後 6 件修正適用済 (Critical: ALB HTTP only + CF prefix list SG / Important: min=1↔Multi-AZ トレードオフ明示, Cognito Symbol 推奨に降格 / Improvements: ALB マルチサブネット注釈, Aurora Cluster Mode 表現修正, CloudFront Origin Timeout 60s 確定)
- [x] Infrastructure Design — **approved 2026-05-10T10:30:00Z** / `aidlc-docs/construction/U1-infra/infrastructure-design/infrastructure-design.md` / ultrathink レビュー後 9 件修正適用済 (Important: Cognito generateSecret false + PKCE, X-Origin-Verify を FastAPI middleware 検証 / Improvements: pnpm workspace, EdgeStack region, CDK_DEFAULT_ACCOUNT 推奨, prefix list ID 取得手順, DB credentials fromGeneratedSecret pattern, Mfa.OPTIONAL typo, Bedrock モデル ARN region 注意, rotation Log Group 除外, AWS Budgets 権限 Runbook)
- [x] Code Generation Part 1: Planning — **approved 2026-05-10T11:00:00Z** / `aidlc-docs/construction/U1-infra/code/code-generation-plan.md` / ultrathink レビュー後 9 件修正適用済 (**Critical: EventBridge → SQS パターン変更で Infrastructure Design も遡及修正** / Important: ファイル数表記統一 / Improvements: pnpm workspace スコープ外明示, cdk.json feature flag 削除, test account fallback, RDS rotation Lambda VPC 配置, Bedrock ARN format 例示, CFN template 埋め込み trade-off 文書化, Test 品質 5 件以上 assertion 明示)
- [x] Code Generation Part 2: Generation — **approved 2026-05-10T12:00:00Z** / ultrathink レビュー後 9 件修正適用済 (Important: Transcribe IAM action 不正修正, ApiStack fallback image を nginx:alpine に変更 / Improvements: Hosted UI URL コメント追加, US_SOCIAL_SECURITY_NUMBER 削除, iamAuthentication コメント明示, edge-stack origins 統合, monitoring-stack Metric 直接構築, LLM secrets に generateSecretString 明示, README snapshot 初回実行ガイド追加)
  - Phase A: ✅ プロジェクト設定 + 共通設定 7 files
  - Phase B: ✅ 7 Stack 実装 (network/auth/ai/data/api/edge/monitoring) 約 50KB
  - Phase C: ✅ bin/yesman.ts
  - Phase D: ✅ 7 test ファイル (snapshot + 5+ assertions each)
  - Phase E: ✅ README.md + RUNBOOK.md (8 章)

### ✅ U1 / infra COMPLETE (2026-05-10T12:00:00Z)
- 全 4 ステージ承認済 (Functional Design SKIP)
- 24 ファイル / 約 2,959 行 / `infra/` ディレクトリ完成

#### U2 / storage (Phase 1、完了)
- [x] Functional Design — **approved 2026-05-10T13:00:00Z** / ultrathink レビュー後 9 件修正適用済 (Critical: 認証パターン案 B採用 = U3 FastAPI middleware JWT 検証 / Important: Built-in personas seed migration + atomic record_usage 設計 / Improvements: domain enum 明確化, persona_reports UNIQUE 制約, count_no_by_user TypedDict, silence_logs hash U4 担当明示, RepositoryFactory パターン, Built-in personas seed 0002_builtin_personas)
- [x] NFR Requirements — **approved 2026-05-10T13:15:00Z (light review)** / `aidlc-docs/construction/U2-storage/nfr-requirements/nfr-requirements.md` / PERF-U2-01..07 + SEC-U2-01..06 + TEST-U2-01..04
- [x] NFR Design — **approved 2026-05-10T13:30:00Z (light review)** / `aidlc-docs/construction/U2-storage/nfr-design/nfr-design.md` / SQLAlchemy engine config (pool_size 5, max_overflow 15, pool_pre_ping True) + SQL query patterns + Alembic config + Repository implementation patterns
- [x] Infrastructure Design — **approved 2026-05-10T13:45:00Z (light review)** / `aidlc-docs/construction/U2-storage/infrastructure-design/infrastructure-design.md` / apps/api/ ディレクトリ構造 (DDD 4-layer) + pyproject 依存 + 環境変数 + 24 ファイル生成計画
- [x] Code Generation Part 1: Planning — **approved 2026-05-10T13:50:00Z (light review)** / `aidlc-docs/construction/U2-storage/code/code-generation-plan.md` / 7 Phase (A-G)、24 ファイル
- [x] Code Generation Part 2: Generation — **complete 2026-05-15 (light review)** / `apps/api/` 配下に 24 主要ファイル + package marker / AST parse OK
  - Phase A: ✅ pyproject.toml + alembic.ini + 5 package markers
  - Phase B: ✅ domain/persistence/models.py (7 SQLModel) + application/persistence/protocols.py (6 Protocol + DatabaseHealth + DecisionCountSummary + DuplicateReportError)
  - Phase C: ✅ infrastructure/config.py + persistence/{engine, factory, sqlmodel_repositories, mock_repositories}.py (health は sqlmodel_repositories.py + mock_repositories.py に集約)
  - Phase D: ✅ interface/deps.py + interface/http/health.py + main.py
  - Phase E: ✅ alembic/env.py + script.py.mako + versions/0001_initial.py + 0002_builtin_personas.py
  - Phase F: ✅ tests/conftest.py + unit/persistence/test_mock_repositories.py + integration/persistence/test_sqlmodel_repositories.py + test_health.py + contract/test_repository_protocol.py + property/test_jsonb_roundtrip.py
  - Phase G: ✅ apps/api/RUNBOOK.md (6 章)

### ✅ U2 / storage COMPLETE (2026-05-15、light review mode)
- 全 5 ステージ + Code Gen Part 1+2 完了
- 24 主要ファイル + 16 package marker / `apps/api/` ディレクトリ完成
- DDD 4-layer (domain / application / infrastructure / interface) + Strategy + DI パターン (RepositoryFactory)
- 3 backend (aurora / docker-postgres / mock) 切替可能

#### U3 / auth (Phase 1、進行中)
- [x] Functional Design — **approved 2026-05-15 (light review)** / **C1 ultrathink 反映済 2026-05-15 (§8.1 / §3.1 / §4 token 受け入れポリシー id+access 両方化)** / `aidlc-docs/construction/U3-auth/functional-design/functional-design.md`
- [x] NFR Requirements — **approved 2026-05-15 (ultrathink full / 13 fixes applied)** / `aidlc-docs/construction/U3-auth/nfr-requirements/nfr-requirements.md` / Critical 2 (C1: id+access 両受け入れ + userInfo lazy / C2: U2 Profile gender+preferences 拡張計画 → Infra Design 引き継ぎ) + Important 5 (I1 timeout 構造 / I2 CORS 所有権 → Infra Design 引き継ぎ / I3 audit.profile_updated 追加 / I4 stale は kid 既存時のみ / I5 Mock は dev/ci 限定) + Improvements 6 (Imp1 asyncio.Lock 直列化 / Imp2 MOCK_USER_SUB 別系統 / Imp3 cognito 必須 env / Imp4 workers コスト / Imp5 isinstance contract / Imp6 カバレッジ U-Test 集約)
- [x] NFR Design — **approved 2026-05-15 (ultrathink full / 10 fixes applied)** / `aidlc-docs/construction/U3-auth/nfr-design/nfr-design.md` / Important 5 (I1 _JwtVerifier unverified token_use 分岐 / I2 JwksCache.get_key force_refetch / I3 CognitoLocal userInfo オプション化 / I4 Starlette 0.32+ 明示 / I5 audit.profile.{action} 3-segment) + Improvements 5 (Imp1 empty_jwks 検知 / Imp2 sub 必須化 / Imp3 UserInfo dataclass で email_verified キャッシュ / Imp4 401 Cache-Control: no-store / Imp5 mock-malformed FD 遡及)
- [x] Infrastructure Design — **approved 2026-05-15 (ultrathink full / 12 fixes applied)** / `aidlc-docs/construction/U3-auth/infrastructure-design/infrastructure-design.md` / Critical 3 (C1: Profile PK = user_id 統一、FD/NFR Design 遡及 / C2: ProfileRepository.upsert ベース、FD/NFR Design 遡及 / C3: U1 ApiStack 既存 Cognito env + U3 差分のみ追加 + APP_ENV ctx.envName 修正) + Important 5 (I1 SSM valueFromLookup + ブートストラップ / I2 ファイル数 21 訂正 / I3 IAM 削除 / I4 Phase G に main.py 集約 / I5 fixture 責務分担表) + Improvements 4 (Imp1 Mock store 表現精度 / Imp2 respx 不採用根拠 / Imp3 Mermaid 凡例 / Imp4 MOCK_AUTO_USER + 特殊トークン例) + 1 PR 集約方針
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 11 fixes applied)**
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (AST parse all OK)** / 全 Phase A-I + U2 既存テスト更新
  - Phase A: ✅ Profile gender+preferences + AppConfig 拡張 + Alembic 0003 + shared/logging
  - Phase B: ✅ AuthenticatedUser + AuthBackendAdapter Protocol + AuthError
  - Phase C: ✅ _http + JwksCache (force_refetch + empty_jwks) + UserInfoCache (UserInfo dataclass) + _JwtVerifier (token_use 分岐)
  - Phase D: ✅ CognitoAuthAdapter + CognitoLocalAuthAdapter (userinfo オプション) + MockAuthAdapter (SPECIAL_TOKENS 3 種) + AuthBackendFactory
  - Phase E: ✅ AuthMiddleware + _LazyAuthMiddleware + deps.py 拡張 (get_current_user + get_auth_adapter)
  - Phase F: ✅ ProfileResponse/Request DTO + GET/PATCH/DELETE /v1/profiles/me + audit.profile.{updated,deleted}
  - Phase G: ✅ main.py 完成版 (validate_runtime + lifespan + middleware order + profiles router include)
  - Phase H: ✅ 10 テストファイル (fixtures/jwt + unit/auth × 5 + integration/auth + contract + property) + 50+ テストケース
  - Phase I: ✅ pyproject (5 依存追加) + .env.example (24 環境変数) + RUNBOOK §7 (U3 章 7.1-7.7) + CDK 3 ファイル (api/edge/bin)
  - U: ✅ U2 既存テスト更新 (sample_profile_full fixture + jsonb_roundtrip に gender/preferences ケース)

### ✅ U3 / auth COMPLETE (2026-05-16、ultrathink + Plan 全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 24 + 変更 9 + Alembic 1 + .env.example + RUNBOOK + pyproject = **37 ファイル**
- AuthBackendAdapter Protocol + 3 Strategy (Cognito/cognito-local/Mock) + JWT 検証 middleware + Profile CRUD + structlog audit
- ultrathink レビュー累計 46 件適用 (FD/NFR Req/NFR Design/Infra Design/Code Gen Plan)

#### U4 / decision (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 13 fixes applied)** / `aidlc-docs/construction/U4-decision/functional-design/functional-design.md` / Important 7 + Improvements 6
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 12 fixes applied)** / Important 7 + Improvements 5
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 11 fixes applied)** / Critical 1 + Important 6 + Improvements 4
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 9 fixes applied)** / Important 5 + Improvements 4
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 9 fixes applied)**
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (AST parse all OK)** / Phase A.0-I 全完了
  - Phase A.0: ✅ U2 patch (count_no_by_user pending 除外、2 ファイル変更)
  - Phase A: ✅ constants + pii_filter + config 拡張 (新規 2 + 変更 1)
  - Phase B: ✅ domain/decision models/errors + application Protocols (新規 6)
  - Phase C: ✅ LLMProvider (Bedrock + Mock + Factory) (新規 5)
  - Phase D: ✅ EventPublisher (3 backend + Factory) (新規 5)
  - Phase E: ✅ SilenceGuard + ConsensusOrchestrator + tee_chunks (新規 2)
  - Phase F: ✅ DecisionEngine + Nudge + Scorer (新規 3)
  - Phase G: ✅ interface (DTO + decisions + scores + deps 拡張) (新規 3 + 変更 1)
  - Phase H: ✅ main.py 完成版 (4 factory + 4 instance 初期化)
  - Phase I: ✅ テスト 18 (Unit 10 + Integration 4 + Contract 2 + PBT 4) + fixture 1 + pyproject + .env + RUNBOOK §8 + CDK (api-stack: SilenceHashSaltSecret + environment +9 + secrets +1)

### ✅ U4 / decision COMPLETE (2026-05-16、ultrathink 累計 54 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 23 + 変更 3 + U2 patch 2 + テスト 18 + fixture 1 + CDK + ドキュメント = **47 ファイル**
- コア合議機能完全実装 (SilenceGuard 2 段判定 + LLMProvider Bedrock/Mock + ConsensusOrchestrator single-prompt + DecisionEngine SSE/non-SSE + Nudge 非同期 + AutonomyScorer + EventPublisher 3 backend)
- ultrathink レビュー累計 54 件 (FD 13 + NFR Req 12 + NFR Design 11 + Infra Design 9 + Code Gen Plan 9)

#### U5 / learning (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 10 fixes applied)** / `aidlc-docs/construction/U5-learning/functional-design/functional-design.md` / Critical 1 (C1 SQS UUID/datetime 型変換) + Important 5 (I1 ColdStart Loader 一元 / I2 keywords MVP skip / I3 YAML サンプル / I4 U4 遡及 3 ファイル明示 / I5 SQS WaitTime 5s) + Improvements 4 (Imp1 delete_message error / Imp2 50 key 上限 / Imp3 PATCH clip / Imp4 DELETE → ColdStart 再推定)
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 7 fixes applied)** / Important 4 + Improvements 3
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U5-learning/nfr-design/nfr-design.md` / Important 3 (I1 persona_names 統一 / I2 N+1 注記 / I3 asyncio.timeout) + Improvements 3 (Imp1 json.dumps names / Imp2 queue_url コメント / Imp3 keyword-only signature)
- [ ] NFR Design
- [ ] Infrastructure Design
- [ ] Code Generation Part 1 + 2

#### U-Persona / Custom Persona + 共有プール (完了)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 10 fixes)**
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 6 fixes)**
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 6 fixes)**
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 5 fixes)**
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 5 fixes)**
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (AST parse all OK)** / Phase A.0a-F 全完了
  - Phase A.0a: ✅ U2 `Persona.is_blocked` 既存確認 (patch 不要)
  - Phase B.5 先行: ✅ access.py 単独実装
  - Phase A.0b: ✅ U4 engine.py 遡及 (selection_repo + keyword-only + record_usage) + fixtures patch
  - Phase B 残り: ✅ domain/persona 6 ファイル (models / errors / anonymizer / constants / moderator / catalog)
  - Phase C: ✅ interface 4 (DTO + personas router 8 endpoint + persona_selections router 3 endpoint + deps 拡張)
  - Phase D: ✅ AppConfig +3 env vars + validate_runtime + main.py (PersonaModerator singleton + 2 router include)
  - Phase E: ✅ tests 10 (unit 4 + integration placeholder 3 + PBT 1 + init 2)
  - Phase F: ✅ .env.example +3 + RUNBOOK §10 + api-stack.ts (PersonaAnonymizerSaltSecret + env +2 + secrets +1)

### ✅ U-Persona COMPLETE (2026-05-16、ultrathink 累計 32 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 14 (domain/persona 7 + interface 3 + tests 10) + 変更 5 (engine + fixtures + config + main + deps) + .env + RUNBOOK + CDK = **約 22 ファイル**
- コア機能完全実装 (Custom Persona CRUD + 共有プール匿名化 + PersonaModerator U3 流用 + PersonaReport AUTO_BLOCK + UserPersonaSelection 上限 3 + U4 DecisionEngine 統合)
- ultrathink レビュー累計 32 件 (FD 10 + NFR Req 6 + NFR Design 6 + Infra Design 5 + Code Gen Plan 5)

#### U6 / voice (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 8 fixes applied)** / `aidlc-docs/construction/U6-voice/functional-design/functional-design.md` / Important 4 + Improvements 4
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U6-voice/nfr-requirements/nfr-requirements.md` / Important 3 + Improvements 3
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U6-voice/nfr-design/nfr-design.md` / Important 3 + Improvements 3
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U6-voice/infrastructure-design/infrastructure-design.md` / Important 3 + Improvements 3
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U6-voice/code/code-generation-plan.md` / Important 3 + Improvements 2
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (AST parse all 27 files OK)** / Phase A.0a-G 全完了
  - Phase A.0a: ✅ SilenceGuard DRY refactor (`_match_regex_domain` + `evaluate_regex_only`)
  - Phase A.0b: ✅ tests/fixtures/voice/silence_1s.mp3 (7942 bytes minimal binary、fallback 動作)
  - Phase B: ✅ domain/voice 3 ファイル (models / errors / constants + __init__)
  - Phase C: ✅ application/voice (Protocol) + infrastructure/voice 4 (Mock / WebSpeechApi / AWS / Factory)
  - Phase D: ✅ interface 2 (DTO + voice router 3 endpoint + deps 拡張 2 関数)
  - Phase E: ✅ config 6 env vars + validate_runtime + main.py (VoiceProviderFactory + router)
  - Phase F: ✅ tests 8 (unit 5 + integration 1 placeholder + init 2)
  - Phase G: ✅ .env.example +6 + RUNBOOK §11 + api-stack.ts (VoiceBucket + IAM 3 policy + env +6 + tag)

### ✅ U6 / voice COMPLETE (2026-05-16、ultrathink 累計 31 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 16 (domain/voice 4 + application/voice 1 + infrastructure/voice 4 + interface 2 + tests 5) + 変更 5 (silence_guard / config / main / deps / api-stack) + .env + RUNBOOK + script + fixture mp3 = **約 27 ファイル**
- コア機能完全実装 (3 backend Strategy + Polly Neural × Takumi + Transcribe OutputKey prefix + 二段 fail-safe 削除 + SilenceGuard regex-only fast-path + asyncio.timeout)
- ultrathink レビュー累計 31 件 (FD 8 + NFR Req 6 + NFR Design 6 + Infra Design 6 + Code Gen Plan 5)

#### U7c / api-client (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 7 fixes applied)** / `aidlc-docs/construction/U7c-api-client/functional-design/functional-design.md` / Critical 1 + Important 3 + Improvements 3
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7c-api-client/nfr-requirements/nfr-requirements.md` / Important 3 + Improvements 2
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7c-api-client/nfr-design/nfr-design.md` / Important 3 + Improvements 2
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7c-api-client/infrastructure-design/infrastructure-design.md` / Important 3 + Improvements 2
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U7c-api-client/code/code-generation-plan.md` / Critical 1 + Important 3 + Improvements 2
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (29 ファイル + 671 src LOC + 502 tests LOC)** / Phase A.0-G 全完了
  - Phase A.0: ✅ pre-flight check (root に package.json / pnpm-workspace.yaml / packages/ 不在確認)
  - Phase A: ✅ monorepo 基盤 (`pnpm-workspace.yaml` + root `package.json`)
  - Phase B: ✅ `apps/api/scripts/dump_openapi.py` + placeholder `apps/api/openapi.json`
  - Phase C: ✅ packages/api-client 設定 5 (package.json / tsconfig / vitest.config / eslintrc / gitignore)
  - Phase D: ✅ `src/generated/schema.ts` placeholder (実生成は CI で)
  - Phase E: ✅ src/ runtime 12 (auth/errors/sse/client/index + 7 modules + modules/index)
  - Phase F: ✅ tests 8 (client / auth / errors / sse / 3 modules + setup) + msw v2 setupFiles
  - Phase G: ✅ JSON + YAML 構文検証 OK、src 671 LOC + tests 502 LOC

### ✅ U7c / api-client COMPLETE (2026-05-16、ultrathink 累計 28 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 29 ファイル (monorepo 基盤 2 + dump_openapi.py 1 + openapi.json 1 + api-client 25) + apps/api 影響 2 (script + json) = **約 29 ファイル**
- コア機能完全実装 (静的 OpenAPI dump + 7 module YesmanApiClient + TokenProvider + ApiError discriminated union + DecisionStream SSE wrapper + msw v2 test 構成)
- ultrathink レビュー累計 28 件 (FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 + Code Gen Plan 6)

#### U7b / ui (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 7 fixes applied)** / `aidlc-docs/construction/U7b-ui/functional-design/functional-design.md` / Critical 1 + Important 3 + Improvements 3
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7b-ui/nfr-requirements/nfr-requirements.md` / Important 3 + Improvements 2
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7b-ui/nfr-design/nfr-design.md` / Important 3 + Improvements 2
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7b-ui/infrastructure-design/infrastructure-design.md` / Important 3 + Improvements 2
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7b-ui/code/code-generation-plan.md` / Important 3 + Improvements 2
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (48 files + 786 src LOC + 305 tests LOC + 136 stories LOC)** / Phase A.0-G 全完了
  - Phase A.0: ✅ pre-flight check (packages/ui 不在確認)
  - Phase A: ✅ packages/ui 設定 6 (package.json + tsconfig + vitest.config + eslintrc + gitignore + .storybook)
  - Phase B: ✅ tokens 4 + preset 1 + globals.css 1 (cva + Tailwind v4 互換)
  - Phase C: ✅ primitives 7 (Spinner / Button / Card / Input / Toast / ToastProvider / Modal) + index
  - Phase D: ✅ icons 4 (Mic/Check/X + index) + composites 4 (PersonaCard / DecisionUtteranceBubble / ChoiceButtons / VoiceMicButton) + index
  - Phase E: ✅ hooks 2 (useToast / useMediaQuery) + index + entry index
  - Phase F: ✅ stories 6 (Button/Card/PersonaCard/ChoiceButtons/VoiceMicButton/Toast)
  - Phase G: ✅ tests 9 (setup + 3 primitives + 3 composites + 2 hooks)、JSON 構文 OK

### ✅ U7b / ui COMPLETE (2026-05-16、ultrathink 累計 27 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 48 ファイル (Phase A 6 + B 6 + C 8 + D 9 + E 4 + F 6 + G 9)
- コア機能完全実装 (cva + brand-600 default + Card polymorphic + ChoiceButtons rename + VoiceMicButton state machine + ToastProvider counter ID + useMediaQuery SSR safe + Storybook 8 + Vitest+RTL)
- ultrathink レビュー累計 27 件 (FD 7 + NFR Req 5 + NFR Design 5 + Infra Design 5 + Code Gen Plan 5)

#### U7a / web-shell (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 7 fixes applied)** / `aidlc-docs/construction/U7a-web-shell/functional-design/functional-design.md` / Critical 1 + Important 3 + Improvements 3
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7a-web-shell/nfr-requirements/nfr-requirements.md` / Important 3 + Improvements 2
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U7a-web-shell/nfr-design/nfr-design.md` / Critical 1 + Important 3 + Improvements 2
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7a-web-shell/infrastructure-design/infrastructure-design.md` / Important 3 + Improvements 2
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7a-web-shell/code/code-generation-plan.md` / Important 3 + Improvements 2
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (32 files + 495 src LOC + 220 tests LOC)** / Phase A.0-G 全完了
  - Phase A.0: ✅ pre-flight check (apps/web 不在確認)
  - Phase A: ✅ 設定 9 (package.json + tsconfig + vite.config + vitest.config + postcss + index.html + eslint + gitignore + .env.example)
  - Phase B: ✅ public assets (favicon + icons README) + entry 2 (main.tsx + App.tsx)
  - Phase C: ✅ shell 8 (env + auth + AuthProvider + RequireAuth + ApiProvider + ErrorBoundary + Layout + routes)
  - Phase D: ✅ features placeholder 4 (Home + SignIn + Callback + Profile) + styles main.css
  - Phase E: ✅ tests 6 (setup + mocks/aws-amplify + 4 shell tests)
  - Phase F: ✅ edge-stack.ts patch (Lifecycle 30day) + `.github/workflows/pr-frontend.yml`
  - Phase G: ✅ JSON 構文 OK、src 495 LOC + tests 220 LOC

### ✅ U7a / web-shell COMPLETE (2026-05-16、ultrathink 累計 28 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 32 ファイル + edge-stack.ts patch + CI workflow
- コア機能完全実装 (Vite + React 18 + React Router v6 + Cognito v6 + AuthProvider + ApiProvider useRef pattern + Suspense Layout + ErrorBoundary + PWA VitePWA skipWaiting/clientsClaim/runtimeCaching + msw mock 分離 + vi.stubEnv)
- ultrathink レビュー累計 28 件 (FD 7 + NFR Req 5 + NFR Design 6 + Infra Design 5 + Code Gen Plan 5)

#### U7d / features (進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 7 fixes applied)** / `aidlc-docs/construction/U7d-features/functional-design/functional-design.md` / Critical 1 + Important 3 + Improvements 3
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 7 fixes applied)** / `aidlc-docs/construction/U7d-features/nfr-requirements/nfr-requirements.md` / Critical 1 + Important 3 + Improvements 3
- [x] NFR Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7d-features/nfr-design/nfr-design.md` / Important 3 + Improvements 2
- [x] Infrastructure Design — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7d-features/infrastructure-design/infrastructure-design.md` / Important 3 + Improvements 2
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (ultrathink full / 5 fixes applied)** / `aidlc-docs/construction/U7d-features/code/code-generation-plan.md` / Important 3 + Improvements 2
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (32 新規 files + src 1904 LOC + tests 442 LOC)** / Phase A.0-G 全完了
  - Phase A.0: ✅ pre-flight (apps/web/src/features/ 既存 placeholder + react-query 未追加確認)
  - Phase A: ✅ package.json (deps: @tanstack/react-query + devDep: devtools/visualizer/size-limit/preset-app) + vite.config.ts (manualChunks + visualizer)
  - Phase B: ✅ QueryProvider + App.tsx + routes.tsx (5 新 path)
  - Phase C: ✅ voice 4 (config/input/MicInput/strings) + score 4 (scoreLevel/useScore/Page/strings)
  - Phase D: ✅ decision 7 (reducer/stream/useDecision/Result/NudgeBanner/Page/strings) + persona 5 (usePersona/CreateModal/ListPage/SelectionPage/strings) + preference 3 (usePreference/Page/strings)
  - Phase E: ✅ home (placeholder→本実装) + profile (placeholder→二段階削除実装) + useProfile + strings
  - Phase F: ✅ tests 8 (reducer/scoreLevel pure fn + ScorePage/usePersona/useProfile/useVoiceInput/useDecisionStream/DecisionPage) + setup 拡張 (getUserMedia + MediaRecorder mock)
  - Phase G: ✅ src 1904 LOC + tests 442 LOC + JSON 構文 OK

### ✅ U7d / features COMPLETE (2026-05-16、ultrathink 累計 29 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 32 files (shell 1 QueryProvider + features 25 + tests 8 - hidden tools) + 変更 5 (App/routes/HomePage/ProfilePage/vite.config + package.json) = 約 32+ ファイル変更
- コア機能完全実装 (React Query + state machine reducer + manualChunks + threshold UI + 二段階削除 + Voice STT + Persona Selection 上限 3 + Nudge 30s polling)
- ultrathink レビュー累計 29 件 (FD 7 + NFR Req 7 + NFR Design 5 + Infra Design 5 + Code Gen Plan 5)

#### U-Test (横断、進行中)
- [x] Functional Design — **approved 2026-05-16 (ultrathink full / 6 fixes applied)** / `aidlc-docs/construction/U-Test/functional-design/functional-design.md` / Critical 1 + Important 3 + Improvements 2
- [x] NFR Requirements — **approved 2026-05-16 (ultrathink full / 3 fixes applied)** / `aidlc-docs/construction/U-Test/nfr-requirements/nfr-requirements.md` / Important 2 + Improvements 1
- [x] NFR Design — **approved 2026-05-16 (light review)** / `aidlc-docs/construction/U-Test/nfr-design/nfr-design.md` / source tree + config 確定
- [x] Infrastructure Design — **approved 2026-05-16 (light review)** / `aidlc-docs/construction/U-Test/infrastructure-design/infrastructure-design.md` / CI workflow + Playwright cache
- [x] Code Generation Part 1 (Planning) — **approved 2026-05-16 (light review)** / `aidlc-docs/construction/U-Test/code/code-generation-plan.md` / 4 Phase + 31 ファイル
- [x] Code Generation Part 2 (Generation) — **complete 2026-05-16 (28 files + 490 LOC)** / 全 Phase A-E 完了
  - Phase A: ✅ fixtures/shared/ 3 + tests/README.md
  - Phase B: ✅ e2e 9 (package + tsconfig + config + 2 fixtures + 5 specs)
  - Phase C: ✅ integration 7 (pyproject + conftest + 5 tests) + PBT 2 (score_consistency + decision_reducer)
  - Phase D: ✅ load 5 (config + 3 scenarios + README) + smoke 2 (smoke.sh + README) + CI 2 (pr-test.yml + load-test.yml)
  - Phase E: ✅ JSON/YAML/Python AST/Shell syntax 全 OK

### ✅ U-Test COMPLETE (2026-05-16、ultrathink 累計 9 件全反映)
- 全 6 ステージ承認済 (FD / NFR Req / NFR Design / Infra Design / Code Gen Part 1+2)
- 新規 28 files (e2e 9 + integration 7 + fixtures 3 + load 5 + smoke 2 + CI 2)
- E2E (Playwright) + Integration (pytest) + PBT (Hypothesis + fast-check) + Load (k6) + Smoke (shell) 5 種統合
- Mock everywhere portable (Docker 不要)、CI ~8 min budget 内
- ultrathink レビュー累計 9 件 (FD 6 + NFR Req 3 + NFR Design 0 light + Infra 0 light + Plan 0 light)

---

## 🎉 CONSTRUCTION フェーズ COMPLETE (2026-05-16)

### 全 11 unit COMPLETE
| Unit | ファイル数 | LOC | ultrathink 累計 |
|---|---|---|---|
| U1 / infra | 24 | ~2,959 | 9 |
| U2 / storage | 24 | - | light |
| U3 / auth | - | - | - |
| U4 / decision | 47 | - | 54 |
| U5 / learning | - | - | 18 |
| U-Persona | 22 | - | 32 |
| U6 / voice | 27 | - | 31 |
| U7c / api-client | 29 | 1,173 | 28 |
| U7b / ui | 48 | 1,227 | 27 |
| U7a / web-shell | 32 | 715 | 28 |
| U7d / features | 32 | 2,346 | 29 |
| **U-Test (横断)** | **28** | **490** | **9** |
| **合計** | **約 313 ファイル** | **~10,000+ LOC** | **約 265 件** |

### CONSTRUCTION サマリ
- Backend: FastAPI + DDD 4-layer + 6 unit (U2-U6 + U-Persona)
- Frontend: PWA Vite + React 18 + 3 package (api-client/ui/web)
- 横断: E2E + Integration + PBT + Load + Smoke
- AWS インフラ: CDK 構築済 (U1)
- ultrathink: 全 unit で適用、累計 265+ 件のレビュー fix

次は **OPERATIONS フェーズ** (placeholder)、または Build and Test 統合実行へ。

#### 統合
- [x] Build and Test — **instructions complete 2026-05-16** / `aidlc-docs/construction/build-and-test/` に 5 files (build / unit-test / integration-test / performance-test / summary)
  - build-instructions.md: Backend + Frontend + CDK 統合 build 手順
  - unit-test-instructions.md: pytest + vitest unit + PBT、~150 + ~85 = ~235 cases
  - integration-test-instructions.md: pytest cross-unit + Playwright E2E + Smoke
  - performance-test-instructions.md: k6 3 scenarios + NFR PERF 目標値集約
  - build-and-test-summary.md: 全体 overview + 受入基準 + ~320 test case 集計
  - ✅ **承認 2026-05-16** ("承認する")、CONSTRUCTION フェーズ完全完了

---

## 🏆 CONSTRUCTION フェーズ完全完了 (2026-05-16)

```
🔵 INCEPTION                          ✅ COMPLETE
🟢 CONSTRUCTION
   ├─ Per-Unit Loop (11/11)           ✅ COMPLETE
   └─ Build and Test ALWAYS EXECUTE   ✅ COMPLETE
🟡 OPERATIONS                          ⏳ placeholder
```

### 最終サマリ
- **11/11 unit COMPLETE** (U1 infra + U2 storage + U3 auth + U4 decision + U5 learning + U-Persona + U6 voice + U7c api-client + U7b ui + U7a web-shell + U7d features + U-Test)
- **約 313 ファイル / 10,000+ LOC** 生成
- **ultrathink 累計 ~265 件** のレビュー fix 適用
- **CI workflow 4 種** (pr-frontend + pr-test + deploy-web + load-test) 設計済
- **~320 test case** (pytest 190 + vitest 85 + E2E 25 + Integration 25 + Smoke 3 + Load 3 scenarios)

### 未実施事項 (CONSTRUCTION scope 外)
- 実機 `pnpm install + pip install + pnpm build + pytest + pnpm test` の CI 初回実行
- AWS 実 deploy (`cdk deploy --all`)
- AWS Hackathon 提出物 (README / demo video / arch 図)

### 🟡 OPERATIONS PHASE
- [ ] Operations (PLACEHOLDER)

---

## 🔁 Post-CONSTRUCTION 改修ログ (2026-05-17 〜 2026-05-19)

CONSTRUCTION 全完了 (2026-05-16) 以降に発生した実装/仕様変更を記録する。`main` ブランチへ直接 commit する **Hackathon Pragmatism 緩和ルール** (CLAUDE.md `Git-Flow Branching Model` 章) の下で運用。CONSTRUCTION 段階の各設計ドキュメントは「2026-05-16 当時の Snapshot + 末尾の Post-CONSTRUCTION 改修注記」で構成される。

### 改修一覧

| Date | Commit | Scope | 影響ドキュメント |
|---|---|---|---|
| 2026-05-17 | `b3bceb0` | E2E 100/100 PASS レポート確定 | `construction/build-and-test/` 5 ファイル |
| 2026-05-17 | `317280b` | **委任度スコアの意味反転** (No 比率 → Yes 比率) | `inception/requirements/requirements.md`、`construction/U4-decision/functional-design`、`construction/U7d-features/functional-design`、`construction/U7d-features/code/code-generation-plan` |
| 2026-05-17 | `2400f45` | INCEPTION screen-04/05 厳密準拠 + AuthBypass 整合 (`ScoreRadialChart` + `ScoreLineChart` 新規 / `ScoreResponse.history` 追加) | `construction/U4-decision/functional-design`、`construction/U7d-features/functional-design`、`construction/U7c-api-client/functional-design`、`inception/application-design/ui-mockups` |
| 2026-05-17 | `2b08a75` | デモ体験 UX 改修一式 (`usePrefetchedDecisions` / `SwipeChoice` state-leak fix / `PreferencePage` 再設計 / Mock seed 105 decisions 30 days / CORS `PUT` 許可 / README ローカル起動章 +177 LOC) | `construction/U2-storage/functional-design` (CORS allow_methods)、`construction/U7d-features/functional-design`、`construction/U7d-features/code/code-generation-plan` |
| 2026-05-17 | `9a52954` | Playwright artifacts を `.gitignore` 追加 | `construction/U-Test/code/code-generation-plan` (.gitignore 記述補足) |
| 2026-05-19 | `1c7c5eb` | **AI-DLC Extensions 追加** (Construction Flow + Frontend Design)、Issue #6 | `aidlc-state.md` `## Extension Configuration` (反映済)、`construction/*` 全 unit (Pragmatic 適用方針) |
| 2026-05-19 | `1924411` | FE-DESIGN ルール準拠の style fix 8 件 (`font-serif` h2 5 箇所、`Layout max-w-md`、`SwipeChoice duration-150`、header palette `#F5E5C4`) | `construction/U7a-web-shell/functional-design`、`construction/U7b-ui/functional-design`、`construction/U7d-features/functional-design` |
| 2026-05-19 | `775f6a5` | **Voice backend 切替 UI** (`useVoiceBackend` + `useWebSpeechRecognition` 新規、`ProfilePage` radio、`VoiceMicButton` toggle 化、api-client `FormData` content-type 自動化) | `construction/U6-voice/functional-design`、`construction/U7d-features/functional-design`、`construction/U7c-api-client/functional-design`、`construction/U7b-ui/functional-design` |
| 2026-05-19 | `c44e032` | CLAUDE.md += Git-Flow Branching Model | `CLAUDE.md` (リポジトリ root)、本セクション |
| 2026-05-19 | `07c1c78` | **Dynamic Persona Routing** (Closes #4) — `DecisionEngine._resolve_personas` 拡張、嗜好プロファイルから top-3 builtin persona を自動推奨、`PersonaSelectionPage` 「💡おすすめ」pink pill badge | `construction/U4-decision/functional-design`、`construction/U-Persona/functional-design`、`construction/U5-learning/functional-design`、`construction/U7d-features/functional-design` |
| 2026-05-19 | `28c8adc` | Splash の「→ スワイプして同意」削除 | `construction/U7d-features/functional-design` (Splash 文言) |
| 2026-05-23 | `e791650` (PR #86) | **議論チャット token streaming + persona pre-fill** — `engine.run_stream` を `_llm.stream()` ベースに refactor (`asyncio.Queue` fan-in)、新 SSE event `utterance_delta` (chunk yield) + `personas` (delta 前 pre-fill) + 既存 `utterance` (最終 cleaned) を併用。`PersonaThinkingChips` は廃止し bubble header に persona icon + name + 「発言中…」amber pill を統合。frontend reducer に `onPersonasResolved` + `onUtteranceDelta` 追加、`Utterance.done` で streaming 中 / 確定済を区別。同 PR で QuickStart catchAll 除外バグ修正 + `VITE_QUICKSTART_DEDUPE=off` env var 追加。 | `construction/U4-decision/functional-design`、`construction/U7d-features/functional-design`、`construction/U7c-api-client/functional-design`、`construction/U7b-ui/functional-design` |
| 2026-05-23 | `a094204` (PR #89、Closes #88) | **EVENT_BACKEND=inline-async で preference profile を同プロセス更新** — `SyncPublisher` no-op バグ修正、`InlineLearningHandler` (`apply_yes`/`apply_no` を同 process で実行) を新設し `EventPublisherFactory` で injection。`.env` 既定値を `sync` → `inline-async` に変更。 | `construction/U4-decision/functional-design`、`construction/U5-learning/functional-design` |
| 2026-05-23 | `5261d9d` (PR #94、Closes #93) | **No 後 microcopy を LLM 動的生成 + Yes nudge tone** — `NudgeMessageGenerator.generate_yes_microcopy()` 新設、stage 別 tone (軽い前向き / 共感 / 不安吸い上げ / 委ねる)、新 `POST /v1/decisions/{id}/yes-nudge` endpoint (同期返却、2s timeout + stage 別 fallback)。frontend `useYesNudge` hook + `NoMicroCopyBanner.dynamicMessage` prop。同 PR で `useChooseMutation` で `["decisions"]` キャッシュ invalidate も追加 (ScorePage 「最近の Yes 採択」が直前 YES を反映しないバグ修正)。 | `construction/U4-decision/functional-design`、`construction/U7c-api-client/functional-design`、`construction/U7d-features/functional-design` |
| 2026-05-23 | `7282539` + `51c613c` (PR #95 + #97) | **合議 / Yes-No 演出ゲーミフィケーション** — chat 風 typing dots + bubble slide-in + proposal 到着 notification banner、Yes 連続採択 combo system (`useYesCombo` localStorage 日次 reset + `YesComboBadge` tier 🔥/🌟/⚡/🏆 + tier 別 confetti 強度 (10 連で 3 wave 大爆発))、Yes 誘導: SwipeChoice 右辺 green グロー pulse + 「→ → → Yes」 marching arrows、YesMan マスコット (🤵 右上 fixed + 状況別 speech bubble 5 種、bobbing + pop-in animation)。`globals.css` に keyframes 9 種追加、`prefers-reduced-motion: reduce` で無効化。 | `construction/U7b-ui/functional-design`、`construction/U7d-features/functional-design` |

### Extension Configuration (Post-CONSTRUCTION 追加)
| Extension | Enabled | 適用方針 |
|---|---|---|
| Construction Flow | Yes (Pragmatic) | Hackathon 緩和ルール下では 03 (Multi-Approach Proposal) / 04 (Approval Gating) を skip、01/02/05/06/07 のみ適用 |
| Frontend Design | Yes (Pragmatic) | INCEPTION drawio をソース・オブ・トゥルースとして 01/03/04 を厳密適用、02/05/06/07 はベストエフォート |

### Build and Test 実機結果
- **e2e**: Playwright `tests/e2e/` で **100/100 PASS** (b3bceb0 にて確定、12 spec × 平均 8.3 test)
  - `auth.spec.ts` 3 / `decision.spec.ts` 3 / `design.spec.ts` 9 / `inception-complete-screens.spec.ts` 19 / `inception-design.spec.ts` 20 / `inception-mobile.spec.ts` 14 / `inception-structural.spec.ts` 11 / `no-burst-regenerate.spec.ts` 5 / `persona.spec.ts` 3 / `score.spec.ts` 2 / `swipe-and-discussion.spec.ts` 9 / `voice.spec.ts` 2
- **API unit/integration/contract/property**: 53 `test_*.py` ファイル (内訳: `apps/api/tests/`)
- **Web unit (Vitest)**: 14 ファイル (内訳: `apps/web/tests/`)
- **Cross-unit integration (pytest)**: 5 ファイル (内訳: `tests/integration/tests/`)

### Post-CONSTRUCTION 改修原則
1. **Snapshot 不変性**: 各 unit の `functional-design.md` / `nfr-*` / `infrastructure-design.md` / `code-generation-plan.md` 本体は 2026-05-16 当時の承認済 Snapshot を保持
2. **Post-CONSTRUCTION 改修注記**: 改修が発生した unit には末尾に `## Post-CONSTRUCTION 改修注記 (YYYY-MM-DD)` セクションを追記
3. **audit.md は Append-only**: 全ての改修は `audit.md` 末尾に時系列追記
4. **本 `aidlc-state.md` の改修ログ表**: 上記「改修一覧」を単一の起点として参照

---

## アイデア検証 (Post-v0.4.0) — Idea Track

> v0.4.0 release 後、user 明示許可なく develop/main へ merge しない (memory: `project-ideation-phase-no-auto-merge`)。各 idea は branch 内で完結し、demo 動画とともに評価される。

### v3-α: drill-down decision chain (merged into `feature/next-spec-ideas`)
- branch: `feature/drill-down-decision` (deleted、`feature/next-spec-ideas` に統合)
- 機能: YES 採択 → 最大 4 段 chain で深堀り (映画 → ホラー → 貞子)、final で service catalog CTA
- 状態: ✅ 実装完了、demo 動画 ~258s 録画済

### v3-β: 新規登録時 嗜好把握 onboarding (merged into `feature/next-spec-ideas`)
- branch: `feature/next-spec-ideas` 上で直接実装
- 機能: 50 問 YES/NO (性格 25 + 生活 20 + 興味 5)、SwipeChoice 再利用、per-user 完了 flag
- 状態: ✅ 実装完了、demo 動画 ~258s に統合済

### v3-γ: anonymous-strangers (案 5、Inception 完了)
- **branch**: `feature/next-spec-ideas-anonymous-strangers`
- **由来**: [docs/superpowers/idea/合議アイデアとして考えたこと.txt](../docs/superpowers/idea/合議アイデアとして考えたこと.txt) 案 5 (ideator 一推し)、mockup [docs/superpowers/idea/mockup-anonymous-strangers.html](../docs/superpowers/idea/mockup-anonymous-strangers.html)
- **core**: 自分の opt-in 公開した価値観 tags + 口グセが、世界の誰かの合議で persona として動く相互参加体験
- **inception 成果物** ([aidlc-docs/inception/anonymous-strangers/](inception/anonymous-strangers/)):
  - requirements.md (6 FR + 6 NFR + 5 SC、Standard depth)
  - user-stories.md (4 Epic + 9 Story、P0-P3 優先度)
  - workflow-plan.md (どの stage 実行 / skip、Hackathon Pragmatism 適用)
  - application-design.md (component 階層 + data model + LLM prompt + i18n)
  - units-decomposition.md (1 unit、10 task、~18-19h)
- **Inception Stage Progress**:
  - [x] Workspace Detection (brownfield、既存 v0.4.0 + drill-down + onboarding)
  - [⏭] Reverse Engineering (skip、既知)
  - [x] Requirements Analysis (Standard depth、mockup を input)
  - [x] User Stories (Standard depth)
  - [x] Workflow Planning
  - [x] Application Design
  - [x] Units Generation (1 unit、Minimal)
- **状態**: ⏳ user 承認待ち (Construction 開始可否)
- **next step**: user approve → Task 1 (backend persona pool 基盤) から着手

### v3-γ rev2: ultrathink fixes + drawio + screenshots (2026-05-24)
- ultrathink レビュー: Critical 5 / Important 6 / Improvements 6 件、全 17 fixes applied
- inception 成果物 5 ファイル全 update、合計時間見積 ~18-19h → **~26-30h** = 3-4 営業日
- drawio 追加: [aidlc-docs/inception/anonymous-strangers/diagrams/anonymous-strangers-design.drawio](inception/anonymous-strangers/diagrams/anonymous-strangers-design.drawio) (2 page: 画面フロー + コンポーネント依存)、同内容を [docs/superpowers/specs/diagrams/2026-05-24-anonymous-strangers-screens.drawio](../docs/superpowers/specs/diagrams/2026-05-24-anonymous-strangers-screens.drawio) にもコピー
- superpowers spec: [docs/superpowers/specs/2026-05-24-anonymous-strangers-design.md](../docs/superpowers/specs/2026-05-24-anonymous-strangers-design.md) (brainstorming + Gherkin 受入基準)
- 画面キャプチャ: [aidlc-docs/inception/anonymous-strangers/screens/](inception/anonymous-strangers/screens/) (13 PNG、全景 1 + mockup 12 画面、2.4MB)
- 状態: ⏳ Construction 着手承認待ち
