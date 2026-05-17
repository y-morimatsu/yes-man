# U3 / auth — NFR Requirements

**Unit**: U3 / auth
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-15
**Status**: 🟡 IN REVIEW (light review mode)
**Upstream**: U3 Functional Design (approved 2026-05-15)

---

## 0. 位置付け

U3 Functional Design で定義した AuthBackendAdapter + JWT 検証 middleware + Profile CRUD に対する非機能要件を確定する。U1 / infra で構築済の Cognito User Pool (yesman-{env}-user-pool) と U2 / storage の `profiles` テーブルを前提とし、上位要件 (NFR-SEC / NFR-EXT / NFR-PERF / NFR-AVAIL) から U3 担当範囲を抜き出した。

| 上位 NFR | U3 担当範囲 |
|---|---|
| NFR-SEC-02 | Cognito 認証必須、パスワードポリシー (U1 で User Pool 設定済、U3 は検証側) |
| NFR-SEC-03 | API への全リクエスト Cognito 認証必須 — U3 middleware で担保 |
| NFR-SEC-04 | TLS 1.2+、Aurora KMS — U3 は転送時 (HTTPS) のみ寄与 |
| NFR-SEC-07 | CORS / 入力バリデーション — U3 で CORS / Profile DTO バリデーション |
| NFR-EXT-04 | 認証バックエンド Strategy 切替 — U3 で Cognito / cognito-local / Mock |
| NFR-PERF-* | API 応答 SLA (上位) — U3 担当 (verify + Profile CRUD) は十分余裕を持つ目標 |
| NFR-AVAIL-* | JWKS 取得失敗時のフォールバック挙動 |

---

## 1. 性能要件 (PERF)

| ID | 要件 | 計測方法 |
|---|---|---|
| **PERF-U3-01** | JWT 検証 (JWKS キャッシュヒット時) p95 < **20ms** | uvicorn access log + middleware 内 monotonic 計測 |
| **PERF-U3-02** | JWKS 初回取得 p95 < **500ms** (httpx + Cognito public endpoint) | initial-fetch counter + duration histogram |
| **PERF-U3-03** | JWKS キャッシュ TTL = **1 hour** (再取得頻度: pool あたり最大 24 req/day) | キャッシュレイヤの monotonic.time 比較 |
| **PERF-U3-04** | JWKS kid mismatch 時の retry: **1 回まで** (= 1 リクエストあたり JWKS GET 最大 2 回)。並行 verify_token で kid mismatch が同時発生した場合、**JWKS refetch は `asyncio.Lock` で直列化** (thundering herd 防止)。**ultrathink Imp1 反映 2026-05-15** | counter で `jwks_refetch_total` を計測 |
| **PERF-U3-05** | Profile CRUD (GET/PATCH/DELETE) レイテンシ p95 < **100ms** (U2 Repo p95<50ms + middleware + serialization の合算) | uvicorn access log |
| **PERF-U3-06** | get-or-create フローで race condition 発生時の再試行: **1 回まで** (`IntegrityError` → re-get) | error_counter + retry_counter |
| **PERF-U3-07** | AuthBackendAdapter は **プロセスワイドのシングルトン** (lifespan で 1 回初期化、リクエストごとの生成禁止) — JWKS キャッシュとコネクションプールを共有。**uvicorn workers=N の場合、JWKS GET は N×(1/h) で発生** — 本番想定 workers=2-4 では問題なし、それ以上は共有キャッシュ (Redis 等) を検討。**ultrathink Imp4 反映 2026-05-15** | コード review |

### 計測点 (将来 U1 監視と連携)
- middleware 内で `request.state.auth_verify_duration_ms` を保持
- CloudWatch Embedded Metrics Format (EMF) で `AuthVerifyDurationMs` / `JwksCacheHit` / `JwksRefetchCount` を出力
- 本ステージでは指標定義のみ、実装は Code Gen Phase で structlog + EMF helper

---

## 2. セキュリティ要件 (SEC)

| ID | 要件 | 担当範囲 |
|---|---|---|
| **SEC-U3-01** | JWT 署名検証必須: RS256 (Cognito 既定)。`HS256` 等の異なるアルゴリズムは拒否 (`reason: algorithm_mismatch` で 401) | CognitoAuthAdapter / `_JwtVerifier` |
| **SEC-U3-02** | `iss` クレーム検証: `https://cognito-idp.{region}.amazonaws.com/{user_pool_id}` と完全一致 | `_JwtVerifier` |
| **SEC-U3-03** | `aud` または `client_id` クレーム検証: App Client ID と一致 (ID Token は `aud`、Access Token は `client_id`、ただし SEC-U3-04 で Access Token は拒否) | `_JwtVerifier` |
| **SEC-U3-04** | `token_use` クレームは **`id` と `access` の両方を受け入れる** (OAuth/OIDC + AWS Cognito 公式推奨)。Access Token の場合は `username`/`sub` のみ利用し、email は **lazy 取得**: (a) 既存 Profile から、または (b) Cognito userInfo endpoint (`/oauth2/userInfo`、TTL 5min キャッシュ) から。`token_use` が `id`/`access` 以外は `reason: token_use_unsupported` で 401。**ultrathink C1 反映 2026-05-15** |
| **SEC-U3-05** | `exp` / `nbf` 検証: clock skew **±30 秒** 許容 (Cognito 推奨) | `_JwtVerifier` |
| **SEC-U3-06** | JWKS 取得は **HTTPS 必須** (Cognito 本番)、cognito-local モードのみ HTTP 許容 (環境変数バリデーションで制御) | factory |
| **SEC-U3-07** | Bearer Token は **`Authorization` header からのみ** 受け入れ。Cookie / Query string は不可 (CSRF 軽減) | middleware |
| **SEC-U3-08** | CORS: `CORS_ALLOWED_ORIGINS` 環境変数で許可オリジン (CloudFront URL) のみ。デフォルト deny。`Access-Control-Allow-Credentials: false` (Bearer なので Cookie 不要) | FastAPI CORSMiddleware |
| **SEC-U3-09** | Profile CRUD 入力バリデーション: `occupation` max 100 chars、`value_tags` max 20 個 / 各 max 30 chars、`preferences` max 50 key-value / 各 value max 200 chars (将来上限変更可能な定数化) | Pydantic DTO |
| **SEC-U3-10** | 監査ログに **email を直接出力しない**。`user.sub` のみ構造化フィールドに記録。**`audit.profile.updated`** (sub + changed_fields キー一覧 + timestamp + backend、value は出さない) と **`audit.profile.deleted`** (sub + timestamp + backend) を構造化ログ出力 — GDPR / 個人情報保護法の追跡要件に対応。命名規則 `audit.{entity}.{action}` の **3-segment 形式** で CloudWatch Logs Insights / Athena query での filterability を確保。**ultrathink I3 (NFR Req) + I5 (NFR Design) 反映 2026-05-15** | structlog + middleware |
| **SEC-U3-11** | Mock backend は **`APP_ENV in {dev, ci}` 限定**。`stg` / `prod` では起動拒否 — 起動時 `AppConfig` バリデーションで `RuntimeError` を raise。特殊トークン挙動 (`mock-expired` 等) も **dev/ci 限定** で発火。**ultrathink I5 反映 2026-05-15** | config.py 拡張 |
| **SEC-U3-12** | `email_verified=False` のユーザーも **U3 では許可** (Hosted UI 側で verify 強制設定済、再確認は不要)。将来 Profile CRUD で再検証が必要になった時点で 403 を返す拡張余地を残す (= deny フラグを config で持つ) | 設計上の保留事項として明示 |

---

## 3. 拡張性要件 (EXT)

| ID | 要件 |
|---|---|
| **EXT-U3-01** | AuthBackendAdapter Protocol は **公開 IF を `verify_token` + `aclose` の 2 メソッドに固定**。追加 backend (Auth0, Firebase Auth, Keycloak) は Protocol 実装のみで差し替え可能 |
| **EXT-U3-02** | バックエンド選択は環境変数 `AUTH_BACKEND` (`cognito` / `cognito-local` / `mock`) で完結 (FR-AUTH-07)。コード変更不要 |
| **EXT-U3-03** | JWKS URL / issuer / audience は backend ごとに環境変数化 (Cognito は `COGNITO_*`、cognito-local は `COGNITO_LOCAL_*`)。ハードコード禁止 |
| **EXT-U3-04** | Middleware の bypass paths は **クラス変数 (frozenset) + 環境変数オーバーライド可** (`AUTH_BYPASS_PATHS_EXTRA` カンマ区切り) — 例: 内部ヘルスチェック追加時に再コンパイル不要 |

---

## 4. 可用性 / 障害耐性 (AVAIL)

| ID | 要件 |
|---|---|
| **AVAIL-U3-01** | JWKS 取得タイムアウト: **`httpx.Timeout(connect=3s, read=3s, write=2s, pool=5s)`** = 単一 HTTP リクエスト上限約 **7s** (TLS handshake 含む)。タイムアウト時は **1 回 retry**、それでも失敗なら 503 (`reason: jwks_unavailable`)。**ultrathink I1 反映 2026-05-15** |
| **AVAIL-U3-02** | JWKS キャッシュ stale-while-error: TTL 切れでも fetch 失敗時は古いキャッシュを **5 分間だけ** 使い続ける (Cognito 障害時の暫定継続稼働)。ただし **stale 利用は `kid` が既存キャッシュにある場合のみ** — 未知 kid は stale でも 503 を返し、key rotation 中の障害長期化を防ぐ。**ultrathink I4 反映 2026-05-15** |
| **AVAIL-U3-03** | AuthBackendFactory の初期化失敗 (config 不正) は **lifespan startup で fail-fast** (= ECS タスク起動失敗 → ALB target unhealthy → ロールバック)。**`AUTH_BACKEND=cognito` 時は `COGNITO_REGION` / `COGNITO_USER_POOL_ID` / `COGNITO_APP_CLIENT_ID` を必須**、**`AUTH_BACKEND=cognito-local` 時は `COGNITO_LOCAL_ISSUER_URL` を必須**、未設定なら `RuntimeError`。**ultrathink Imp3 反映 2026-05-15** |
| **AVAIL-U3-04** | Profile CRUD の DB エラー (U2 経由) は **HTTPException 503** にマップ。500 (= unhandled) を返さない |
| **AVAIL-U3-05** | Middleware が AuthError 以外の例外を捕捉した場合は **500 + `reason: internal_error`** + sentry-like structured log (現状は CloudWatch Logs に ERROR レベル) |

---

## 5. テスト要件 (TEST)

| ID | 要件 |
|---|---|
| **TEST-U3-01** | Contract test: MockAuthAdapter / CognitoAuthAdapter / CognitoLocalAuthAdapter が同一 `AuthBackendAdapter` Protocol を実装することを **`@runtime_checkable` Protocol + `isinstance()` ベース** で動的検証 (U2 で採用済パターン継承、`inspect.signature` 比較は positional/keyword 差で false positive を生むため不採用)。**ultrathink Imp5 反映 2026-05-15** |
| **TEST-U3-02** | PBT (Hypothesis): 任意のバイト列 / 改変 JWT を `verify_token` に渡しても **必ず `AuthError` で完了する** (= プロセスクラッシュ・予期せぬ例外型を出さない)。`given(st.text() / st.binary())` で 100 例 / job |
| **TEST-U3-03** | Unit カバレッジ: AuthMiddleware / `_JwtVerifier` / MockAuthAdapter / profile handlers — **数値目標は U-Test 段階で全ユニット横断に確定**。U3 単独では initial target として ≥ 90% を意識するが必達ではない (U2 でも数値目標未設定で整合)。**ultrathink Imp6 反映 2026-05-15** |
| **TEST-U3-04** | Integration: Mock JWT + Mock Repositories で `/v1/profiles/me` の GET → PATCH → GET → DELETE → GET (404) を一気通貫 |
| **TEST-U3-05** | JWKS キャッシュテスト: `httpx.MockTransport` で JWKS endpoint を模擬し、(1) cache hit、(2) TTL 経過後 refetch、(3) kid mismatch → refetch、(4) stale-while-error の 4 ケース |
| **TEST-U3-06** | エラー reason 全網羅: `missing` / `malformed` / `expired` / `invalid_signature` / `issuer_mismatch` / `audience_mismatch` / `unknown_kid` / `token_use_mismatch` / `algorithm_mismatch` の 9 ケースをそれぞれ 401 で検証 |

---

## 6. 環境変数 (U3 新規)

| 環境変数 | デフォルト | 必須 | 説明 |
|---|---|---|---|
| `AUTH_BACKEND` | `mock` | - | `cognito` / `cognito-local` / `mock` (U2 で `AppConfig` に追加済) |
| `COGNITO_REGION` | - | `cognito` 時 | 例: `ap-northeast-1` |
| `COGNITO_USER_POOL_ID` | - | `cognito` 時 | 例: `ap-northeast-1_XXXXXXXXX` (U1 AuthStack Output) |
| `COGNITO_APP_CLIENT_ID` | - | `cognito` 時 | U1 AuthStack Output |
| `COGNITO_LOCAL_ISSUER_URL` | - | `cognito-local` 時 | 例: `http://localhost:9229/local_xxx` |
| `MOCK_USER_SUB` | `11111111-1111-1111-1111-111111111111` | - | Mock backend の固定 user id。**U2 system user (`00000000-...`) との混同回避** のため別系統。**ultrathink Imp2 反映 2026-05-15** |
| `MOCK_USER_EMAIL` | `test@yesman.local` | - | Mock backend の固定 email |
| `MOCK_AUTO_USER` | `false` | - | `true` で Authorization header 省略時も mock user として通過 |
| `CORS_ALLOWED_ORIGINS` | `` (deny) | 本番必須 | カンマ区切りのオリジン (例: `https://yesman-prod.cloudfront.net`) |
| `AUTH_BYPASS_PATHS_EXTRA` | `` | - | デフォルト bypass に追加するパス (カンマ区切り) |
| `JWKS_CACHE_TTL_SECONDS` | `3600` | - | JWKS キャッシュ TTL (テストで短縮可能) |
| `JWKS_STALE_WHILE_ERROR_SECONDS` | `300` | - | Cognito 障害時の stale 許容 |

---

## 7. 引き継ぎ (NFR Design / Infrastructure Design)

NFR Design で確定する事項:
- **JWT ライブラリ選定**: `python-jose[cryptography]` vs `pyjwt[crypto]` — Cognito JWKS 検証実績で `python-jose` を有力候補に推奨
- **httpx クライアント設定**: タイムアウト構造体 (`httpx.Timeout(connect=3, read=3, write=2, pool=5)`)、リトライポリシー (Tenacity vs 手動)
- **キャッシュ実装**: 単純 dict + `asyncio.Lock` で十分 (1 プロセス内、Cognito JWKS は通常 1-3 kid のみ、thundering herd 直列化)
- **userInfo endpoint キャッシュ (C1 由来)**: Access Token モードで email 取得時の `/oauth2/userInfo` レスポンスを **TTL 5min** でメモリキャッシュ (sub をキー)。Cognito userInfo は `cognito-idp:GetUser` 相当の rate limit (10 RPS) があるため
- **Middleware order**: CORSMiddleware (外側) → AuthMiddleware → RouterDispatch — FastAPI の `app.add_middleware()` は **後勝ち** (内側) なので `add_middleware(AuthMiddleware)` → `add_middleware(CORSMiddleware)` の順で追加
- **AuthBackendFactory lifespan**: `app.state.auth_adapter` に格納、shutdown で `await adapter.aclose()`
- **structlog 構造化ログ**: U3 でログ helper を `apps/api/src/yesman_api/shared/logging.py` に新設、U4 以降が再利用

Infrastructure Design で確定する事項:
- **CORS 環境変数の所有権 (ultrathink I2 反映)**: `CORS_ALLOWED_ORIGINS` は **U1 EdgeStack で生成される CloudFront URL** に依存。U1 ApiStack の TaskDefinition に CloudFront URL を **SSM Parameter Store 経由で注入する責任を U3 Infrastructure Design 段階で確定** する。注入経路の選択肢: (a) U1 EdgeStack が SSM Parameter `/yesman/{env}/cloudfront-url` を出力、ApiStack が ECS Task Definition の Secrets から読込、(b) CDK Cross-Stack Reference で直接渡す。空文字なら **本番起動時に AVAIL-U3-03 fail-fast でブロック** する追加検証も必要
- **U2 Profile スキーマ拡張 (ultrathink C2 反映)**: U3 で実装する Profile CRUD API (FR-AUTH-02) は `gender` (複数選択可) と `preferences` を必要とするが、**U2 で実装済の SQLModel Profile にこれら 2 カラムが欠落** している。U3 Infrastructure Design で以下を計画:
  - `apps/api/src/yesman_api/domain/persistence/models.py` の `Profile` に追加:
    - `gender: list[str] = Field(default_factory=list, sa_column=Column(JSONB, nullable=False, server_default="[]"))` — multi-select (FR-AUTH-02)
    - `preferences: dict[str, str] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False, server_default="{}"))` — 自由形式 (FR-LEARN-02 整合)
  - `apps/api/alembic/versions/20260515_0000_0003_profile_gender_preferences.py` を新規追加 (`ALTER TABLE profiles ADD COLUMN gender JSONB NOT NULL DEFAULT '[]', ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}'`)
  - Mock store (`mock_repositories.py`) は SQLModel フィールド経由のため自動追従。`tests/property/test_jsonb_roundtrip.py` には Profile gender/preferences の roundtrip ケースを追加検討
  - **実コード変更は U3 Code Generation Phase で実施** (Infrastructure Design 承認時に U2 配下のファイルへの遡及修正が確定する)

---

## 8. 承認チェックリスト

- [x] PERF-U3 (JWT verify p95 < 20ms / JWKS TTL 1h / kid mismatch retry asyncio.Lock 直列化 / Profile CRUD < 100ms / シングルトン + workers コスト注記)
- [x] SEC-U3 (RS256 強制 / iss/aud 完全一致 / **token_use=id|access 両方受け入れ + email lazy 取得** / Bearer header only / CORS deny default / Profile 入力上限 / audit.profile_updated + audit.profile_deleted / **Mock は dev/ci 限定**)
- [x] EXT-U3 (Protocol IF 固定 / 環境変数で切替 / bypass paths 環境変数オーバーライド)
- [x] AVAIL-U3 (JWKS タイムアウト connect=3/read=3/write=2/pool=5 total~7s / 1 retry / **stale-while-error 5 分 + kid 既存時のみ** / lifespan fail-fast + cognito/cognito-local 必須環境変数バリデーション / DB エラー → 503)
- [x] TEST-U3 (Contract **isinstance ベース** / PBT / **カバレッジ目標は U-Test 集約** / Integration lifecycle / JWKS キャッシュ 4 ケース / エラー reason 9 ケース)
- [x] 環境変数一覧 (MOCK_USER_SUB を **`11111111-...`** に変更、U2 system user と区別)
- [x] **CORS 環境変数所有権 (U1 SSM Parameter 注入) を Infrastructure Design に引き継ぎ**
- [x] **U2 Profile スキーマ拡張 (gender + preferences 2 カラム + 0003 migration) を Infrastructure Design に引き継ぎ**
- [x] FR-AUTH-01〜07 / NFR-EXT-04 / NFR-SEC-02〜04, 07 / NFR-AVAIL カバレッジ確認

### ultrathink レビュー (2026-05-15) 反映済 13 件
- **Critical 2**: C1 token_use=id|access 両方受け入れ + userInfo lazy / C2 U2 Profile gender + preferences 追加計画
- **Important 5**: I1 タイムアウト構造体 / I2 CORS 所有権引き継ぎ / I3 audit.profile_updated 追加 / I4 stale 利用は kid 既存時のみ / I5 Mock は dev/ci 限定
- **Improvements 6**: Imp1 asyncio.Lock 直列化 / Imp2 MOCK_USER_SUB 別系統 / Imp3 cognito 必須環境変数バリデーション / Imp4 workers コスト注記 / Imp5 isinstance ベース contract / Imp6 カバレッジ U-Test 集約
