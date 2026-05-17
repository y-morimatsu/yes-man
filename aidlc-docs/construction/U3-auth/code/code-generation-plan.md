# U3 / auth — Code Generation Plan (Part 1)

**Unit**: U3 / auth
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-15
**Status**: 🟡 IN REVIEW (light review mode)
**Upstream**:
- FD (approved + C1/Imp5 + Infra-C1/C2 反映)
- NFR Req (approved 13 fixes + I5 統一)
- NFR Design (approved 10 fixes + C2 遡及)
- Infrastructure Design (approved 12 fixes)

---

## 0. 位置付け

Infrastructure Design §10 で確定した **Phase A〜I の 9 phase 分割**を、Part 2 (Generation) で実行可能な **チェックボックス付き詳細タスクリスト** として展開する。Part 2 はこの Plan の通りにファイルを生成・変更し、各 Phase 完了時に AST/syntax check と関連テスト実行で品質を担保する。

---

## 1. 全体方針

### 1.1 ファイル集計 (Infra §1.2 確定値)

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 21 |
| **変更 Python (本体)** | 4 |
| **新規 Alembic migration** | 1 |
| **新規テスト (Python + fixture)** | 9 |
| **新規ドキュメント** | 1 (.env.example) |
| **変更ドキュメント** | 1 (RUNBOOK.md) |
| **変更 pyproject.toml** | 1 |
| **変更 CDK (TypeScript)** | 3 (api-stack / edge-stack / bin/yesman) |
| **合計** | **41 ファイル** |

### 1.2 順序

Phase A → B → C → D → E → F → G → H → I の **線形順序**。Phase G (main.py 完成) より前に Phase A〜F でファイルを揃え、Phase G で一気にアプリを動作可能状態に切り替える。

### 1.3 品質基準

各 Phase 完了時に以下を全て満たすこと:

- ✅ **AST parse OK**: `python3 -m py_compile <file>` で構文エラー無し
- ✅ **import 解決**: 該当ファイルを `python3 -c "import yesman_api.<module>"` で読込確認
- ✅ **既存テスト回帰なし**: U2 既存テストが fail しない (Phase A の Profile スキーマ変更後は U2 既存 sample_profile fixture の更新が必要 — §6.5 参照)
- ✅ **新規テスト pass**: 該当 Phase のテストが全て green
- ✅ **ruff check 通過**: `ruff check apps/api/src apps/api/tests`
- ✅ **mypy 通過 (best effort)**: 型エラーが発生した箇所はコメントで保留可

### 1.4 ロールバック方針

Phase 単位で実装が破綻したら **その Phase の全ファイルを破棄して再着手**。Phase の境界が安全な状態 (= U2 既存機能が動作する状態) を維持。

---

## 2. Phase A: 既存ファイル変更 + shared 新設

**目的**: U3 が依存する基盤 (config 拡張 + Profile スキーマ拡張 + structlog helper) を整備。**main.py は触らず U2 既存状態のまま**。

### Phase A タスク (5 ファイル)

- [ ] **A.1** `apps/api/src/yesman_api/infrastructure/config.py` を変更 — ultrathink I1 反映: NFR Design §9.1 のコードブロックを完全に転載
  - `app_env: Literal["prod", "stg", "dev", "ci"] = "dev"` (既存 3 値 + `stg` 追加)
  - `log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"` (新規フィールド)
  - U3 環境変数 13 個追加 (NFR Design §9.1 通り):
    - `cognito_region: str | None = None`
    - `cognito_user_pool_id: str | None = None`
    - `cognito_app_client_id: str | None = None`
    - `cognito_hosted_ui_url: str | None = None`
    - `cognito_local_issuer_url: str | None = None`
    - `cognito_local_userinfo_url: str | None = None`
    - `mock_user_sub: UUID = UUID("11111111-1111-1111-1111-111111111111")`
    - `mock_user_email: EmailStr = "test@yesman.local"`
    - `mock_auto_user: bool = False`
    - `cors_allowed_origins: list[str] = Field(default_factory=list)`
    - `auth_bypass_paths_extra: list[str] = Field(default_factory=list)`
    - `jwks_cache_ttl_seconds: float = 3600.0`
    - `jwks_stale_while_error_seconds: float = 300.0`
    - `userinfo_cache_ttl_seconds: float = 300.0`
  - `validate_runtime()` メソッド追加 (4 段バリデーション):
    - (a) `auth_backend == "mock"` かつ `app_env not in {"dev", "ci"}` → `RuntimeError`
    - (b) `auth_backend == "cognito"`: `cognito_region` / `user_pool_id` / `app_client_id` / `hosted_ui_url` 必須
    - (c) `auth_backend == "cognito-local"`: `cognito_local_issuer_url` / `cognito_app_client_id` 必須
    - (d) `auth_backend == "cognito"` かつ `cognito_hosted_ui_url` が `https://` で始まらない → `RuntimeError`
    - (e) `app_env == "prod"` かつ `cors_allowed_origins` 空 → `RuntimeError`
- [ ] **A.2** `apps/api/src/yesman_api/domain/persistence/models.py` を変更
  - Profile に `gender: list[str]` JSONB カラム追加 (age_group の直後)
  - Profile に `preferences: dict[str, str]` JSONB カラム追加 (value_tags の直後)
- [ ] **A.3** `apps/api/alembic/versions/20260515_0000_0003_profile_gender_preferences.py` を新規作成
  - upgrade: `ALTER TABLE profiles ADD COLUMN gender JSONB NOT NULL DEFAULT '[]', ADD COLUMN preferences JSONB NOT NULL DEFAULT '{}'`
  - downgrade: 上記 2 カラム削除
  - revision = "0003_profile_gender_preferences", down_revision = "0002_builtin_personas"
- [ ] **A.4** `apps/api/src/yesman_api/shared/__init__.py` を新規作成 (空 + module docstring)
- [ ] **A.5** `apps/api/src/yesman_api/shared/logging.py` を新規作成
  - `configure_logging(level: str)` — structlog JSON Renderer + ISO timestamp + dict_tracebacks
  - `get_logger(name: str | None = None)` — bound logger 返却
  - `audit_log(event: str, **fields)` — `audit` ロガーで構造化出力

### Phase A 完了基準

- [ ] AST parse OK (5 ファイル)
- [ ] `alembic upgrade head` が成功 (0003 まで一気に適用、in-memory SQLite or Docker Postgres で確認)
- [ ] U2 既存テスト (Profile を扱う 3 ファイル) を更新せずに走らせると **`gender` / `preferences` カラム不足で失敗** することを確認 → §6.5 で更新

---

## 3. Phase B: domain/auth + application/auth

**目的**: AuthenticatedUser ドメインモデル + AuthBackendAdapter Protocol + AuthError 例外を定義。実装は持たず純粋なインターフェース層。

### Phase B タスク (5 ファイル)

- [ ] **B.1** `apps/api/src/yesman_api/domain/auth/__init__.py` を新規作成 — ultrathink Imp2 反映: **空ファイル** (U2 既存 `domain/__init__.py` パターン踏襲、将来 re-export 追加の余地は残す)
- [ ] **B.2** `apps/api/src/yesman_api/domain/auth/models.py` を新規作成
  - `@dataclass(frozen=True, slots=True)` で AuthenticatedUser
  - フィールド: sub, email, email_verified, issued_at, expires_at, raw_claims, backend
- [ ] **B.3** `apps/api/src/yesman_api/application/auth/__init__.py` を新規作成 — **空ファイル** (Imp2)
- [ ] **B.4** `apps/api/src/yesman_api/application/auth/protocols.py` を新規作成
  - `@runtime_checkable class AuthBackendAdapter(Protocol)` — `backend_name: str`, `verify_token`, `aclose`
- [ ] **B.5** `apps/api/src/yesman_api/application/auth/errors.py` を新規作成
  - `class AuthError(Exception)` — `reason: str`, `detail: str | None`

### Phase B 完了基準

- [ ] AST parse OK (5 ファイル)
- [ ] `python3 -c "from yesman_api.domain.auth.models import AuthenticatedUser; from yesman_api.application.auth.protocols import AuthBackendAdapter; from yesman_api.application.auth.errors import AuthError"` が通る

---

## 4. Phase C: infrastructure/auth 共通ヘルパー

**目的**: HTTP クライアント設定 + JWT 検証ロジック + JWKS / userInfo キャッシュ。3 Adapter から共通利用される基盤。

### Phase C タスク (5 ファイル)

- [ ] **C.1** `apps/api/src/yesman_api/infrastructure/auth/__init__.py` を新規作成 (空)
- [ ] **C.2** `apps/api/src/yesman_api/infrastructure/auth/_http.py` を新規作成
  - `make_http_client()` — httpx.AsyncClient with `Timeout(connect=3, read=3, write=2, pool=5)` + `Limits(max_connections=10, keepalive=5)` + User-Agent
  - `fetch_with_retry(client, url)` — 1 回 retry (200ms backoff、httpx.TimeoutException / httpx.HTTPStatusError / httpx.NetworkError 捕捉)
  - `fetch_with_retry_authed(client, url, access_token)` — 同上 + Authorization Bearer header
- [ ] **C.3** `apps/api/src/yesman_api/infrastructure/auth/jwks_cache.py` を新規作成
  - `class JwksCache` — `get_key(kid, *, force_refetch=False)` + asyncio.Lock + double-check + stale-while-error (kid 既存時のみ) + empty_jwks 検知
  - `class JwksUnavailable(Exception)` / `class UnknownKid(Exception)`
- [ ] **C.4** `apps/api/src/yesman_api/infrastructure/auth/userinfo_cache.py` を新規作成
  - `@dataclass(frozen=True, slots=True) class UserInfo(email: str, email_verified: bool)`
  - `class UserInfoCache` — `get_userinfo(*, sub, access_token)` + per-sub Lock + TTL 5min
  - `_coerce_bool(value)` ヘルパー
  - `class UserInfoEmailMissing(Exception)`
- [ ] **C.5** `apps/api/src/yesman_api/infrastructure/auth/_verifier.py` を新規作成
  - `@dataclass(frozen=True, slots=True) class JwtVerifyConfig(issuer, audience, leeway_seconds=30, algorithms=("RS256",))`
  - `class _JwtVerifier` — `verify(token)` で unverified token_use 分岐、ID/Access 経路、`REQUIRED_CLAIMS = ("exp", "iat", "iss", "sub")`、PyJWT decode、`force_refetch=True` retry
  - 9 種 AuthError reason (malformed / algorithm_mismatch / unknown_kid / expired / issuer_mismatch / audience_mismatch / invalid_signature / token_use_unsupported / jwks_unavailable)

### Phase C 完了基準

- [ ] AST parse OK (5 ファイル)
- [ ] `JwksCache` / `UserInfoCache` / `_JwtVerifier` を分離して import 可能
- [ ] PyJWT / httpx が依存解決済 (Phase I で pyproject 更新前にローカル `pip install pyjwt[crypto] httpx structlog email-validator starlette` が必要 — RUNBOOK に記載)

---

## 5. Phase D: 3 Adapter + Factory

**目的**: Cognito / cognito-local / Mock の Strategy 実装 + AuthBackendFactory による DI。

### Phase D タスク (4 ファイル)

- [ ] **D.1** `apps/api/src/yesman_api/infrastructure/auth/cognito_adapter.py` を新規作成
  - `class CognitoAuthAdapter` — `backend_name = "cognito"`
  - コンストラクタ: region / user_pool_id / app_client_id / hosted_ui_url / TTL 引数
  - `verify_token` — verifier 経由 + token_use 分岐 (id: claims から email、access: UserInfoCache 経由)
  - `aclose` — `await self._http.aclose()`
- [ ] **D.2** `apps/api/src/yesman_api/infrastructure/auth/cognito_local_adapter.py` を新規作成
  - `class CognitoLocalAuthAdapter` — `backend_name = "cognito-local"`
  - コンストラクタ: issuer_url / app_client_id / userinfo_url (オプション、None で Access Token 拒否) / TTL 引数
  - `verify_token` — userinfo_url=None なら token_use=access を `token_use_unsupported` で拒否
- [ ] **D.3** `apps/api/src/yesman_api/infrastructure/auth/mock_adapter.py` を新規作成
  - `class MockAuthAdapter` — `backend_name = "mock"`
  - `SPECIAL_TOKENS: dict[str, str]` で 3 種 (mock-expired / mock-anonymous / mock-malformed)
  - 空文字列は `AuthError("missing")`
  - 通常パス: 固定 mock_sub + mock_email で AuthenticatedUser 返却
- [ ] **D.4** `apps/api/src/yesman_api/infrastructure/auth/factory.py` を新規作成
  - `class AuthBackendFactory(config)` — `create()` で config.auth_backend に dispatch、`dispose()` で adapter.aclose()
  - process-wide singleton (lifespan で 1 回生成)

### Phase D 完了基準

- [ ] AST parse OK (4 ファイル)
- [ ] `python3 -c "from yesman_api.infrastructure.auth.factory import AuthBackendFactory"` で 3 adapter 全て import 解決
- [ ] `isinstance(MockAuthAdapter(...), AuthBackendAdapter)` が True (runtime_checkable Protocol 適合)

---

## 6. Phase E: middleware + deps 拡張

**目的**: ASGI middleware で Bearer token を検証し request.state.user にセット + Depends 統合。

### Phase E タスク (3 ファイル)

- [ ] **E.1** `apps/api/src/yesman_api/interface/middleware/__init__.py` を新規作成 — **空ファイル** (Imp2)
- [ ] **E.2** `apps/api/src/yesman_api/interface/middleware/auth.py` を新規作成
  - `class AuthMiddleware` — ASGI スコープレベル実装
    - `BYPASS_PATHS_DEFAULT = frozenset({"/health", "/docs", "/redoc", "/openapi.json"})`
    - `BYPASS_PREFIXES_DEFAULT = ("/internal/",)`
    - OPTIONS は bypass、Bearer 抽出 (header 重複は最終値)、`AuthError` を 401 にマップ
    - 401 レスポンスに `WWW-Authenticate: Bearer error="invalid_token"` + `Cache-Control: no-store`
  - `class _LazyAuthMiddleware` — `scope["app"].state.auth_adapter` を最初のリクエストで lazy bind
- [ ] **E.3** `apps/api/src/yesman_api/interface/deps.py` を変更
  - 既存 (U2): `get_factory` / `get_bundle` / `get_*_repo` / `get_db_health`
  - 追加: `get_current_user(request: Request) -> AuthenticatedUser` — `request.state.user` から取得、なければ 401 HTTPException
  - 追加: `get_auth_adapter(request: Request) -> AuthBackendAdapter` — `request.app.state.auth_adapter` から取得

### Phase E 完了基準

- [ ] AST parse OK (2 新規 + 1 変更)
- [ ] AuthMiddleware を AppBackendFactory + MockAuthAdapter と組み合わせて単独テストで動作確認 (Phase H で本格テスト)

---

## 7. Phase F: profiles router + DTO

**目的**: `/v1/profiles/me` の GET / PATCH / DELETE エンドポイント + Pydantic DTO。

### Phase F タスク (3 ファイル)

- [ ] **F.1** `apps/api/src/yesman_api/interface/http/dto/__init__.py` を新規作成 — **空ファイル** (Imp2)
- [ ] **F.2** `apps/api/src/yesman_api/interface/http/dto/profile.py` を新規作成
  - `class ProfileResponse(BaseModel)` — user_id (UUID) / email / age_group / gender (list[str]) / occupation / value_tags / preferences / life_stage / created_at / updated_at
  - `class ProfileUpdateRequest(BaseModel)` — 全フィールド optional、max_length 制約
  - `model_config = ConfigDict(from_attributes=True)` で SQLModel からの validate サポート
- [ ] **F.3** `apps/api/src/yesman_api/interface/http/profiles.py` を新規作成
  - `router = APIRouter(prefix="/v1/profiles", tags=["profiles"])`
  - GET `/me` — get-or-create (repo.get → 無ければ Profile() upsert)
  - PATCH `/me` — get → 無ければ 404 → patch 適用 → upsert + `audit.profile.updated` log
  - DELETE `/me` — delete + `audit.profile.deleted` log + 204
  - `_apply_patch(existing, payload)` ヘルパー (model_dump(exclude_unset=True) で部分更新)

### Phase F 完了基準

- [ ] AST parse OK (3 ファイル)
- [ ] `from yesman_api.interface.http.profiles import router` で router 取得可能
- [ ] router.routes に 3 endpoint (GET/PATCH/DELETE `/me`) が登録されている (`len(router.routes) >= 3`)

---

## 8. Phase G: main.py 完成版

**目的**: lifespan で RepositoryFactory + AuthBackendFactory を初期化、middleware order (CORS 外側 / Auth 内側)、profiles router を include。**Phase F までで揃ったすべてを 1 コミットで結合**。

### Phase G タスク (1 ファイル変更)

- [ ] **G.1** `apps/api/src/yesman_api/main.py` を変更
  - `lifespan`: AppConfig 読込 + configure_logging + RepositoryFactory init + AuthBackendFactory init + adapter create() + app.state に格納 + startup ログ + shutdown 時 dispose
  - `create_app()`:
    - `config.validate_runtime()` を最初に呼ぶ (Mock prod 拒否 / cognito 必須 env / CORS prod 必須)
    - `FastAPI(title, version, lifespan)`
    - `app.add_middleware(_LazyAuthMiddleware)` (内側)
    - `app.add_middleware(CORSMiddleware, allow_origins=..., allow_credentials=False, ...)` (外側)
    - `app.include_router(health_router)` (既存)
    - `app.include_router(profiles_router)` (新規)
  - `app = create_app()` モジュールトップ

### Phase G 完了基準

- [ ] AST parse OK
- [ ] `uvicorn yesman_api.main:app --port 8000` で起動可能 (Mock backend、AUTH_BACKEND=mock の前提)
- [ ] `curl http://localhost:8000/health` → 200 (DB ok)
- [ ] `curl -H "Authorization: Bearer anything" http://localhost:8000/v1/profiles/me` → 200 + Profile 自動作成 (mock user)
- [ ] `curl http://localhost:8000/v1/profiles/me` (Authorization なし) → 401 + reason: missing + Cache-Control: no-store
- [ ] `curl http://localhost:8000/openapi.json | jq '.paths | keys'` → `["/health", "/v1/profiles/me"]`

---

## 9. Phase H: テスト

**目的**: Unit / Integration / Contract / PBT の網羅。

### Phase H タスク (新規 9 + 変更 1 = 10 ファイル)

#### H.1 Fixtures
- [ ] **H.1.1** `apps/api/tests/fixtures/__init__.py` を新規作成
- [ ] **H.1.2** `apps/api/tests/fixtures/jwt.py` を新規作成
  - `_rsa_keypair_cached`: RSA 鍵ペアを module-level でキャッシュ (テスト全体で 1 ペア共有、生成コスト削減)
  - `make_jwks_response(keys: list)` — JWKS endpoint の JSON レスポンス生成
  - `make_id_token(sub, email, issuer, audience, kid, *, exp_in=3600)` — 有効 ID JWT 発行
  - `make_access_token(sub, client_id, issuer, kid, *, exp_in=3600)` — 有効 Access JWT 発行
  - `tamper_token(token)` — 末尾文字改変 (invalid_signature テスト用)

#### H.2 conftest 拡張
- [ ] **H.2.1** `apps/api/tests/conftest.py` を変更
  - 追加 fixture: `app_config_mock`, `auth_factory_mock`, `mock_user`, `client_with_mock_auth`, `attach_auth_adapter`

#### H.3 Unit テスト (4 + 1 = 5 ファイル)
- [ ] **H.3.1** `apps/api/tests/unit/auth/__init__.py`
- [ ] **H.3.2** `apps/api/tests/unit/auth/test_mock_adapter.py` — 3 特殊トークン + 通常パス (≥4 ケース)
- [ ] **H.3.3** `apps/api/tests/unit/auth/test_jwt_verifier.py` — 9 種エラー reason 網羅 (≥9 ケース)
- [ ] **H.3.4** `apps/api/tests/unit/auth/test_jwks_cache.py` — cache hit/miss/TTL/stale/force_refetch/empty_jwks (≥6 ケース)
- [ ] **H.3.5** `apps/api/tests/unit/auth/test_userinfo_cache.py` — TTL/per-sub lock/email_verified (≥3 ケース)
- [ ] **H.3.6** `apps/api/tests/unit/auth/test_auth_middleware.py` — ultrathink I3 + I4 反映: **bypass 6 種 + 401 9 種 + state.user セット + Cache-Control no-store + MOCK_AUTO_USER=true** の網羅:
  - bypass パス: `/health` / `/docs` / `/openapi.json` / `/redoc` / `/internal/foo` / OPTIONS の 6 種すべて bypass で透過
  - 401 reason: missing / malformed / expired / invalid_signature / issuer_mismatch / audience_mismatch / unknown_kid / token_use_unsupported / algorithm_mismatch の 9 種
  - state.user セット: 通常パスで `scope["state"]["user"]` に AuthenticatedUser が入る
  - Cache-Control: 401 レスポンスに `cache-control: no-store` header
  - MOCK_AUTO_USER=true で Authorization header なしでも mock_user で通過 + state.user セット (新規ケース)
  - 合計 **≥18 ケース**

#### H.4 Integration テスト
- [ ] **H.4.1** `apps/api/tests/integration/auth/__init__.py`
- [ ] **H.4.2** `apps/api/tests/integration/auth/test_profile_lifecycle.py` — Mock JWT + Mock Repo で GET (201 create) → PATCH → GET → DELETE → GET 404 を一気通貫 (≥4 ケース)

#### H.5 Contract テスト
- [ ] **H.5.1** `apps/api/tests/contract/test_auth_protocol.py` — `isinstance(adapter, AuthBackendAdapter)` で 3 Adapter 全て True

#### H.6 PBT
- [ ] **H.6.1** `apps/api/tests/property/test_jwt_robustness.py` — `@given(st.text() | st.binary())` で任意入力 → AuthError 確認 (max_examples=100)

### Phase H 完了基準 (ultrathink Imp5 反映: pytest コマンド例を明示)

```bash
# Unit tests (DB 不要)
pytest apps/api/tests/unit/auth/                             # 5 ファイル、各 ≥ 完了基準ケース数
pytest apps/api/tests/unit/persistence/                      # U2 既存、回帰なし確認

# Integration tests (Docker Postgres or Aurora 必要、-m integration マーカー)
pytest apps/api/tests/integration/auth/ -m integration       # profile lifecycle 統合
pytest apps/api/tests/integration/persistence/ -m integration # U2 既存、回帰なし確認

# Contract test
pytest apps/api/tests/contract/test_auth_protocol.py         # isinstance ベース、3 Adapter 全て True

# Property-based test
pytest apps/api/tests/property/test_jwt_robustness.py        # Hypothesis max_examples=100
pytest apps/api/tests/property/test_jsonb_roundtrip.py       # U2 既存 + U3 で gender/preferences ケース追加
```

- [ ] 上記すべてのコマンドが green (Integration は PG 環境を別途用意した状態で)
- [ ] U2 既存テストの回帰なし (§11 sample_profile fixture 確認後)

---

## 10. Phase I: ドキュメント + pyproject + CDK 修正

**目的**: 運用書類・依存定義・CDK 修正を完了し PR レビュー可能状態にする。

### Phase I タスク (4 変更/新規)

- [ ] **I.1** `apps/api/pyproject.toml` を変更
  - `[project.dependencies]` に追加: `pyjwt[crypto]>=2.9,<3.0`, `httpx>=0.27,<0.28`, `structlog>=24.4,<25.0`, `email-validator>=2.2,<3.0`, `starlette>=0.40,<0.42`
- [ ] **I.2** `apps/api/.env.example` を新規作成 (Infra Design §4 通り、24 環境変数)
- [ ] **I.3** `apps/api/RUNBOOK.md` を変更
  - U3 章追記: 認証 backend 切替手順 / `/v1/profiles/me` 動作確認 / Mock の 3 パターン (Bearer / MOCK_AUTO_USER / 特殊トークン) / cognito-local Docker 起動手順 / 本番 Cognito 環境変数 / Alembic 0003 適用手順
- [ ] **I.4** `infra/lib/stacks/api-stack.ts` を変更
  - environment に追加: `LOG_LEVEL`, `COGNITO_HOSTED_UI_URL`, `JWKS_CACHE_TTL_SECONDS`, `JWKS_STALE_WHILE_ERROR_SECONDS`, `USERINFO_CACHE_TTL_SECONDS`, `CORS_ALLOWED_ORIGINS`
  - `APP_ENV: 'prod'` hardcoded → `APP_ENV: ctx.envName`
  - ApiStackProps に `userPoolDomain: cognito.IUserPoolDomain` 追加
  - `ssm.StringParameter.valueFromLookup` で CORS_ALLOWED_ORIGINS 取得
- [ ] **I.5** `infra/lib/stacks/edge-stack.ts` を変更
  - 既存 distribution 作成後に `new ssm.StringParameter(this, 'CloudFrontUrlParam', ...)` 追加
- [ ] **I.6** `infra/bin/yesman.ts` を変更
  - `new ApiStack(..., { ..., userPoolDomain: authStack.userPoolDomain })` で渡す
- [ ] **I.7** `infra/test/api-stack.test.ts` を更新 — ultrathink I5 反映: snapshot update コマンドを明示
  - 既存 snapshot に追加 environment 6 個 (`LOG_LEVEL`, `COGNITO_HOSTED_UI_URL`, `JWKS_CACHE_TTL_SECONDS`, `JWKS_STALE_WHILE_ERROR_SECONDS`, `USERINFO_CACHE_TTL_SECONDS`, `CORS_ALLOWED_ORIGINS`) が反映されていることを assertion レベルで追加
  - `cd infra && pnpm test -- --updateSnapshot` で snapshot 更新、diff を確認してから commit
  - **RUNBOOK (I.3) にも** 「CDK 変更時の snapshot 更新手順」章を追記すること
- [ ] **I.8** RUNBOOK (`apps/api/RUNBOOK.md`) の U3 章に **「CDK スナップショット更新手順」サブセクション**を追加 — `pnpm test -- --updateSnapshot` の実行手順 + diff レビュー観点

### Phase I 完了基準

- [ ] `pyproject.toml` 依存が解決可能 (`pip install -e ".[dev]"` で成功)
- [ ] `cdk synth` が成功 (`cdk.context.json` の SSM lookup ブートストラップ後)
- [ ] `pytest infra/test` の既存 snapshot が更新済 (Profile 環境変数 6 個追加分)

---

## 11. 既存 U2 テスト・fixture の更新計画 (§6.5) — ultrathink Imp1 + Imp4 反映

### 失敗が発生する範囲 (Imp4 反映)
- **Integration テストのみ失敗**: `tests/integration/persistence/test_sqlmodel_repositories.py` / `test_health.py` (実 DB スキーマ + SQLModel ORM の不一致)
- **Unit / Mock / Contract テストは default_factory で正常動作** (`MockProfileRepository.upsert` は `copy.deepcopy(profile)` で SQLModel 全体保存、新規追加フィールドは `default_factory` で初期化済)
- **Property test (jsonb_roundtrip)** は Hypothesis 戦略を gender/preferences に対応させる必要がある (= 既存ケースは pass、新規追加ケースが必要)

### 更新タスク
- [ ] **U.1** `apps/api/tests/conftest.py` の `sample_profile` fixture (L83 既存) — **変更不要** (Imp1)。default_factory で gender=[], preferences={} に自動初期化される
  - **任意 (推奨)**: 明示的に non-empty 値を持つ `sample_profile_full` fixture を新規追加 (gender=["female"] + preferences={"theme": "dark"} 等)、Integration テストの往復確認で使用
- [ ] **U.2** `apps/api/tests/integration/persistence/test_sqlmodel_repositories.py` の Profile create/update テストで gender + preferences の往復確認を 1 ケース追加 (`sample_profile_full` fixture を利用)
- [ ] **U.3** `apps/api/tests/property/test_jsonb_roundtrip.py` に Profile gender + preferences の Hypothesis 戦略追加:
  - `gender`: `st.lists(st.text(min_size=1, max_size=10), max_size=5)`
  - `preferences`: `st.dictionaries(st.text(min_size=1, max_size=20), st.text(max_size=100), max_size=10)`
  - 既存 `value_tags` の roundtrip パターンを踏襲、@given で組み合わせ

---

## 12. 動作確認 (Phase G/H/I 完了後の最終確認) — ultrathink I2 + I6 + Imp3 反映

### 12.1 Mock backend (DB 不要、最速確認パターン)

```bash
# 1. 依存解決
cd apps/api && pip install -e ".[dev]"

# 2. Mock backend で起動 (Alembic 不要、Mock store がメモリ完結)
cp .env.example .env  # AUTH_BACKEND=mock, STORAGE_BACKEND=mock
uvicorn yesman_api.main:app --port 8000

# 3. 3 パターンの 401/200 確認
curl -i http://localhost:8000/health                                                # 200
curl -i http://localhost:8000/v1/profiles/me                                        # 401 + reason: missing + Cache-Control: no-store
curl -i -H "Authorization: Bearer mock-expired" http://localhost:8000/v1/profiles/me # 401 + reason: expired
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/profiles/me    # 200 + user_id=11111111-...

# 4. PATCH + DELETE
curl -i -X PATCH -H "Authorization: Bearer anything" -H "Content-Type: application/json" \
  -d '{"age_group": "30s", "gender": ["female"], "occupation": "engineer"}' \
  http://localhost:8000/v1/profiles/me                                              # 200 + 部分更新後
curl -i -X DELETE -H "Authorization: Bearer anything" http://localhost:8000/v1/profiles/me  # 204

# 5. OpenAPI 確認
curl http://localhost:8000/openapi.json | jq '.paths | keys'                       # ["/health", "/v1/profiles/me"]
```

### 12.2 PostgreSQL backend (Alembic + 実 DB 確認パターン)

**注**: Alembic 0001 が `postgresql.JSONB` 専用型を使用するため **SQLite では動作不可** (I2 確認済)。Docker Postgres or Aurora が必須。

```bash
# 1. Docker Postgres 起動
docker run -d --name yesman-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

# 2. Alembic 0003 まで適用
cd apps/api
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost/postgres \
  STORAGE_BACKEND=docker-postgres \
  alembic upgrade head                                                              # 0001 → 0002 → 0003 適用

# 3. 全テスト実行 (Integration 含む)
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost/postgres \
  pytest apps/api/tests/ -m "not integration or integration"                       # 全 pass

# 4. クリーンアップ
docker stop yesman-pg && docker rm yesman-pg
```

### 12.3 CDK synth 確認

```bash
# 6a. (初回のみ) SSM Parameter ブートストラップ — Imp3 反映
for env in dev stg prod; do
  aws ssm put-parameter --name /yesman/${env}/cloudfront-url --type String \
    --value 'https://placeholder.cloudfront.net' --description 'CORS bootstrap'
done

# 6b. CDK synth
cd infra
pnpm install
pnpm test -- --updateSnapshot   # snapshot 更新
cdk synth                        # 全 stack synth 成功
```

---

## 13. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| PyJWT のバージョン差で `jwt.decode(options={"verify_signature": False})` API が変更 | _verifier 動作不能 | `pyproject.toml` で `>=2.9,<3.0` ピン留め、CI で固定 |
| Mock backend で `MOCK_USER_SUB` UUID 形式不正で起動失敗 | dev/ci 環境が立ち上がらない | `AppConfig` 側で UUID 型を強制、`.env.example` にデフォルト値明記 |
| Alembic 0003 が既存 DB に対して NOT NULL DEFAULT 適用で大規模テーブルに長時間ロック | 低 (PG 13+ で fast-path) | **PostgreSQL 13+ では DEFAULT 定数式 (`'[]'::jsonb` / `'{}'::jsonb`) が fast-path** (テーブル書き換え不要、O(1) メタデータ更新のみ、数十ms で完了)。PG 11/12 では rewrite が発生し大規模テーブルでは長時間ロック。本プロジェクトは U1 で **Aurora PostgreSQL 15+** 想定確定のため fast-path 適用、本番でも問題なし (ultrathink I6 反映) |
| Phase G で main.py を書き換え中に既存テストが失敗 | Phase H に進めない | Phase G 完了基準を厳格化 (curl 動作確認 5 件、§8 完了基準) |
| SSM Parameter Store の `valueFromLookup` で初回 deploy 時にエラー | CDK deploy 失敗 | ブートストラップ手順 (CLI で put-parameter) を RUNBOOK に明記 |

---

## 14. 承認チェックリスト

- [x] Phase A〜I の 9 段階タスクが checkbox 形式で列挙
- [x] 各 Phase の完了基準が明示 (AST parse / import / テスト / curl / pytest コマンド)
- [x] U2 既存テスト・fixture の更新計画 (§11、失敗は Integration のみ + Hypothesis 戦略追加 + sample_profile_full 任意 fixture)
- [x] U1 CDK 修正計画 (api-stack / edge-stack / bin/yesman / test snapshot + RUNBOOK snapshot update 手順、§10)
- [x] 動作確認手順 3 パターン (§12 Mock / PostgreSQL / CDK synth + SSM ブートストラップ)
- [x] リスク 5 項目 + 緩和策 (Alembic 0003 は PG 13+ fast-path で確定)
- [x] 全ファイル集計: 新規 31 + 変更 10 = **41 ファイル** (本体 25 + Alembic 1 + テスト 9 + ドキュメント 2 + pyproject 1 + CDK 3)
- [x] ultrathink レビュー反映の引き継ぎ (FD/NFR Design/Infra Design の全 35 件 + Code Gen Plan の 11 件確定事項)

### ultrathink レビュー (2026-05-16) 反映済 11 件
- **Important 6**: I1 config 拡張詳細 (NFR Design §9.1 完全転載、フィールド型 + バリデーション 5 段) / I2 Alembic は PG 専用、SQLite で動作不可を明示 (§12 動作確認を Mock + PG 2 パターンに分離) / I3 MOCK_AUTO_USER テストケース追加 / I4 bypass パス 6 種網羅 + 401 reason 9 種 (≥18 ケース) / I5 CDK snapshot update コマンド + RUNBOOK 反映 (I.7 + I.8) / I6 Alembic 0003 ロックは PG 13+ fast-path で確定 (Aurora 15+ 想定)
- **Improvements 5**: Imp1 sample_profile fixture は変更不要 + sample_profile_full 任意 / Imp2 __init__.py を U2 既存パターン (空ファイル) に統一 / Imp3 §12 動作確認に SSM ブートストラップ手順追加 / Imp4 既存テスト失敗は Integration のみ明示 / Imp5 §9 完了基準に pytest コマンド例追加
