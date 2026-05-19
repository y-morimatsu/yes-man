# U3 / auth — Functional Design

**Unit**: U3 / auth — AuthAdapter + Cognito 連携 + プロフィール管理
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-15
**Status**: 🟡 IN REVIEW

---

## 0. ドキュメント位置付け

U2 / storage Functional Design §3.0 で確定済の **認証パターン案 B (FastAPI middleware で JWT 検証)** を実装するための機能設計。U1 / infra で構築済の Cognito User Pool (`AuthStack`) と U2 / storage で永続化される `profiles` テーブルを橋渡しする。

### 関連要件
- **FR-AUTH-01〜07** (認証 + プロフィール + 3 バックエンド切替)
- **FR-CV-11** (議論履歴のプライバシー: 自分の決定のみ閲覧可) — Repository への `user_id` 引き渡しは U3 middleware が担保
- **NFR-SEC-01〜04** (Cognito 必須、TLS、KMS 暗号化、認証必須エンドポイント)
- **NFR-SEC-07** (CORS / CSRF / レート制限 / 入力バリデーション)
- **NFR-EXT-04** (認証バックエンドの Strategy 切替)

### 上流前提
| 出典 | 内容 |
|---|---|
| U1 AuthStack | Cognito User Pool `yesman-{env}-user-pool`、App Client (SPA + PKCE、`generateSecret=false`)、Hosted UI Domain `yesman-{env}.auth.{region}.amazoncognito.com`、AccessToken/IdToken 有効期限 60min、RefreshToken 30 days |
| U2 §3.0 | 案 B 採用、middleware 実装場所 `interface/middleware/auth.py`、`/health` bypass、`/internal/events/*` は EventBridge 内部経路で middleware 非対象 |
| U2 ProfileRepository | `create(profile)` / `update(profile)` / `delete(profile_id)` / `get(profile_id)` / `list_by_owner(user_id)` を提供済 (`profiles` テーブル) |

### スコープ
- ✅ AuthBackendAdapter Protocol 定義 + 3 Strategy 実装 (Cognito / cognito-local / Mock)
- ✅ JWT 検証 middleware (`interface/middleware/auth.py`)
- ✅ AuthenticatedUser ドメインモデル
- ✅ Profile 自動初期化フロー (初回 `GET /v1/profiles/me`)
- ✅ Profile CRUD API (`/v1/profiles/me`) — FR-AUTH-02〜04 実現
- ✅ CORS 設定 (NFR-SEC-07 の一部)
- ⏭ レート制限 / CSRF / 入力バリデーション本格対応 → U7d (FE) と組み合わせて U-Test で確認、U3 では FastAPI 標準のバリデーションのみ
- ⏭ OAuth code → token exchange の proxy → 不採用 (FE が PKCE で直接 Cognito から token 取得し Bearer で送る前提、U7d 担当)
- ⏭ ペルソナ関連 API → U-Persona

---

## 1. AuthenticatedUser ドメインモデル

`apps/api/src/yesman_api/domain/auth/models.py`

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Mapping

@dataclass(frozen=True, slots=True)
class AuthenticatedUser:
    """JWT 検証成功後に request.state にセットされる認証済ユーザー。"""
    sub: str                       # Cognito sub (= profiles.id にもなる UUID 文字列)
    email: str                     # email クレーム (lowercased)
    email_verified: bool
    issued_at: datetime            # iat
    expires_at: datetime           # exp
    raw_claims: Mapping[str, object]  # 任意拡張用 (cognito:groups, custom:* 等)
    backend: str                   # "cognito" | "cognito-local" | "mock" — 監査・テスト用
```

### 設計判断
- `sub` は Cognito 標準 UUID v4 (例: `12345678-1234-1234-1234-123456789012`)、これを **`profiles.id` の主キーとして再利用** する。U2 で `Profile.id: UUID` 既定義済のため Cognito との 1:1 整合が取れる
- `email` は ID Token クレームから取得し、内部処理用に lowercased。Profile の表示用とは別管理
- `raw_claims` は読み取り専用 Mapping (typing.Mapping) — Persona / Decision 等の下流ユニットが将来 `cognito:groups` を見たい場合の拡張ポイント
- `backend` フィールドで監査ログに「Mock 経由か本番 Cognito 経由か」が見える

---

## 2. AuthBackendAdapter Protocol

`apps/api/src/yesman_api/application/auth/protocols.py`

```python
from typing import Protocol, runtime_checkable

@runtime_checkable
class AuthBackendAdapter(Protocol):
    """認証バックエンドの抽象 (FR-AUTH-05, NFR-EXT-04)。"""

    backend_name: str  # "cognito" / "cognito-local" / "mock"

    async def verify_token(self, token: str) -> AuthenticatedUser:
        """Bearer Token を検証し AuthenticatedUser を返す。失敗時は AuthError を raise。"""

    async def aclose(self) -> None:
        """HTTP クライアントや JWKS キャッシュの dispose。lifespan shutdown で呼ばれる。"""


class AuthError(Exception):
    """JWT 検証失敗の共通例外。middleware が 401 にマップする。"""
    def __init__(self, reason: str, *, detail: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason       # "expired" / "invalid_signature" / "missing" / "malformed" / "issuer_mismatch" / ...
        self.detail = detail       # クライアント向けの非機微なメッセージ
```

### 設計判断
- **Protocol のみ、最小インターフェース**: `verify_token` 1 本に絞る。OAuth code 交換 / refresh / revoke は API には不要 (PKCE 完結を前提) のため Adapter には含めない
- `runtime_checkable` で contract test (Mock/Cognito/CognitoLocal が同一 Protocol を実装することを inspect) が可能
- `AuthError.reason` は列挙的に文字列で型不要 — middleware の switch 簡略化と監査ログのフィルタを両立
- `aclose()` は U2 `DatabaseHealth` と同じパターンで lifespan 連携

---

## 3. 3 Strategy 実装方針

`apps/api/src/yesman_api/infrastructure/auth/` 配下に 3 ファイル + factory:

### 3.1 CognitoAuthAdapter (本番)

`infrastructure/auth/cognito_adapter.py`

- **JWKS 取得**: `https://cognito-idp.{region}.amazonaws.com/{user_pool_id}/.well-known/jwks.json` を `httpx.AsyncClient` で取得し、メモリキャッシュ (TTL 1h、ETag 対応)
- **Token 検証フロー** (`verify_token`):
  1. JWT を decode (kid 抽出、署名前 unverified)
  2. JWKS キャッシュから kid 一致の公開鍵を引く (なければ JWKS 再取得して 1 回 retry)
  3. `python-jose` (or `pyjwt`) で署名検証、`iss` = `https://cognito-idp.{region}.amazonaws.com/{user_pool_id}`、`aud` または `client_id` = App Client ID、`token_use` = `id` または `access` (どちらも許可、`id` を優先) を検証
  4. `exp` を現在時刻と比較 (clock skew 30 秒許容)
  5. クレームから `AuthenticatedUser` 生成
- **トークンタイプ**: **ID Token / Access Token 両方受け入れる** (ultrathink C1 反映)。Access Token モードでは `username` クレーム = sub のみ利用し、email は §8.1 の lazy 取得ロジックで補完
- **エラー応答**: 全失敗を `AuthError` に統合、`reason` で識別

### 3.2 CognitoLocalAuthAdapter (ローカル開発)

`infrastructure/auth/cognito_local_adapter.py`

- CognitoAuthAdapter とほぼ同一実装、JWKS URL のみ環境変数 `COGNITO_LOCAL_ISSUER_URL` から取得 (例: `http://localhost:9229/local_xxx`)
- 公式 [cognito-local](https://github.com/jagregory/cognito-local) は JWKS を `/.well-known/jwks.json` で公開している
- → **CognitoAuthAdapter の継承 or 共通ヘルパー (`_JwtVerifier`) として実装** し、URL/issuer/audience のみコンストラクタ引数で差し替える

### 3.3 MockAuthAdapter (CI / 自動テスト / オフライン開発)

`infrastructure/auth/mock_adapter.py`

- **トークン検証スキップ**: 任意の文字列を受け取り、固定 `AuthenticatedUser` を返す
- **固定 user**: `MOCK_USER_SUB`、`MOCK_USER_EMAIL` 環境変数 (デフォルト sub=`00000000-0000-0000-0000-000000000001`、email=`test@yesman.local`) — FR-AUTH-06
- **特殊トークン** (NFR Design Imp5 反映 2026-05-15):
  - `Bearer mock-expired` → `AuthError("expired")` を発生させる (テストで 401 検証用)
  - `Bearer mock-anonymous` → `AuthError("missing")`
  - `Bearer mock-malformed` → `AuthError("malformed")` (テストで malformed エラー reason 検証用)
  - それ以外 → 固定ユーザーで成功
- これにより Protocol contract test (`tests/contract/test_auth_protocol.py`) が同一インターフェースで動作

### 3.4 AuthBackendFactory

`infrastructure/auth/factory.py`

```python
class AuthBackendFactory:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._adapter: AuthBackendAdapter | None = None

    async def create(self) -> AuthBackendAdapter:
        if self._adapter is not None:
            return self._adapter
        match self._config.auth_backend:
            case "cognito":         self._adapter = CognitoAuthAdapter(...)
            case "cognito-local":   self._adapter = CognitoLocalAuthAdapter(...)
            case "mock":            self._adapter = MockAuthAdapter(...)
        return self._adapter

    async def dispose(self) -> None:
        if self._adapter is not None:
            await self._adapter.aclose()
```

- U2 の `RepositoryFactory` と同一パターン (lifespan で初期化 / dispose、process-wide singleton)
- 初期化は同期 (`__init__`) ではなく `create()` を非同期化 — JWKS のプリフェッチ等を行う余地を残す (実装ではコンストラクタで延期、最初の verify_token 時に JWKS 取得が一般的)

---

## 4. JWT 検証 Middleware

`apps/api/src/yesman_api/interface/middleware/auth.py`

```python
class AuthMiddleware:
    """Bearer Token を検証して request.state.user にセットする ASGI middleware。"""

    BYPASS_PATHS: frozenset[str] = frozenset({
        "/health", "/docs", "/openapi.json", "/redoc",
        # /internal/events/* は ECS-internal poller 経路 (Q: ALB 公開しない)
        # /v1/* のみ middleware 対象
    })

    def __init__(self, app: ASGIApp, *, adapter: AuthBackendAdapter) -> None:
        self.app = app
        self._adapter = adapter

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send); return
        path = scope.get("path", "")
        if self._should_bypass(path):
            await self.app(scope, receive, send); return
        # Authorization: Bearer <token>
        token = self._extract_bearer(scope.get("headers", []))
        try:
            if token is None:
                raise AuthError("missing")
            user = await self._adapter.verify_token(token)
        except AuthError as exc:
            await self._send_401(send, exc); return
        scope["state"]["user"] = user
        await self.app(scope, receive, send)
```

### 動作仕様
| パス | 認証 | 備考 |
|---|---|---|
| `/health` | bypass | ALB Target Group health check (U1 ApiStack) |
| `/docs`, `/openapi.json`, `/redoc` | bypass | FastAPI 標準 API ドキュメント (本番では別途無効化検討 — U3 では env 切替実装まで) |
| `/v1/*` | 必須 | 全エンドポイント |
| `/internal/*` | bypass | EventBridge → SQS → Poller 内部経路 (U4 で本格定義) |
| その他 | 必須 (default deny) | 未知パスでも 401 (= ホワイトリスト方式) |

### エラー応答 (401)

```json
{ "detail": "authentication required", "reason": "expired" }
```

| reason | HTTP | 意味 |
|---|---|---|
| `missing` | 401 | Authorization header 無し or Bearer prefix 無し |
| `malformed` | 401 | JWT 形式不正 |
| `expired` | 401 | `exp` 過ぎ |
| `invalid_signature` | 401 | 署名検証失敗 |
| `issuer_mismatch` | 401 | `iss` 不一致 |
| `audience_mismatch` | 401 | `aud` 不一致 |
| `unknown_kid` | 401 | JWKS に kid なし |
| `token_use_unsupported` | 401 | `token_use` クレームが `id`/`access` 以外 (ultrathink C1 反映) |
| `algorithm_mismatch` | 401 | RS256 以外の `alg` (SEC-U3-01 対応) |

→ クライアントは `reason` を見て **トークン期限切れ時のみ refresh を試みる** といった分岐が可能。

### 配置順序 (FastAPI middleware stack)
1. CORSMiddleware (外側) — preflight の `OPTIONS` は middleware 認証より前で 200 を返す
2. AuthMiddleware
3. （将来）RateLimitMiddleware (NFR-SEC-07、U-Test 段階で本格化)

### Mock モードでのバイパス挙動
- `AUTH_BACKEND=mock` の場合でも middleware は常に動作する (= mock_adapter で固定 user を返す)
- 開発初期で「Authorization header 自体省略でも通したい」要件があれば、`MOCK_AUTO_USER=true` 環境変数で「missing token → mock user として通す」拡張をオプション追加。デフォルト OFF (= 明示的に `Bearer anything` を送る)

---

## 5. Profile 自動初期化フロー

### 5.1 フロー (`GET /v1/profiles/me` 初回) — ultrathink C1 + C2 反映 2026-05-15

```
1. middleware で JWT 検証 → AuthenticatedUser{ sub, email, ... } を request.state にセット
2. profiles router の handler が CurrentUser (= AuthenticatedUser) を Depends 取得
3. ProfileRepository.get(user_id=user.sub) を呼ぶ
4a. 既存 → 200 + Profile DTO 返却
4b. 未存在 → 空 Profile (age_group=None, gender=[], occupation=None, value_tags=[], preferences={}, life_stage=None) を作成
       → ProfileRepository.upsert(Profile(user_id=user.sub, email=user.email, created_at=now, ...))
       → 201 + Profile DTO 返却
```

### 5.2 設計判断 (ultrathink C1 + C2 反映 2026-05-15)
- **Profile.user_id = AuthenticatedUser.sub (Cognito sub)** — U2 の Profile schema は `user_id: UUID (PK, "= Cognito sub")` なので、Cognito sub (UUID 文字列) をそのまま PK に使用
- **自動作成は GET 時のみ**: 初回 GET で「無ければ作る」 (get-or-create) — Cognito 側で sign-up 済みだが API に来ていないユーザーが Profile 未作成の状態にならない
- **U2 ProfileRepository は `upsert(profile)` で create/update を兼ねる** (U2 protocols.py L48-51 で確定): U3 は `repo.upsert(...)` を呼ぶ。`upsert` は内部で既存 profile の created_at 継承 + updated_at = now を実装済 (Mock: mock_repositories.py L71-79、SQLModel: 同等の SQL ON CONFLICT パターン)
- **PATCH /v1/profiles/me で更新**: 既存があれば部分更新 → `upsert`、無ければ 404 (= GET で作るのが前提、PATCH の暗黙作成はしない、handler 側で `get` → 無ければ 404 → あれば patch 適用後 `upsert`)
- **DELETE /v1/profiles/me で削除** (FR-AUTH-04): `repo.delete(user_id=user.sub)` 呼び出し。Profile 削除と同時に **U2 の Cascade 設定** に基づいて関連レコード (decisions / silence_logs / preference_profiles 等) が自動削除される
  - **U2 の現状**: 各 Repository は SQL ForeignKey に Cascade を設定済 (U2 §1 ER 図参照)。U3 では DELETE が trigger するだけ
  - **Cognito User Pool 側の削除は U3 スコープ外**: 本人が Hosted UI から退会するフローを別途設ける (FR-AUTH-04 で「プロフィールはいつでも編集・削除可能」と書かれているが、Cognito ユーザー削除は手動 or Cognito 管理 API 経由、U3 では実装しない)
- **GDPR / 個人情報保護法** (FR-AUTH-04): DELETE 操作は監査ログ (CloudWatch Logs) に `audit.profile.deleted` で記録 (U3 では構造化ログ出力のみ、本格的な audit table は将来)

---

## 6. Profile CRUD API

`apps/api/src/yesman_api/interface/http/profiles.py`

### 6.1 エンドポイント

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | `/v1/profiles/me` | 必須 | 自分の Profile 取得 (未存在なら自動作成して返す) |
| PATCH | `/v1/profiles/me` | 必須 | 自分の Profile 部分更新 |
| DELETE | `/v1/profiles/me` | 必須 | 自分の Profile 削除 (Cascade で関連データ削除) |

### 6.2 Pydantic DTO

`interface/http/dto/profile.py`

```python
# ultrathink C1 反映 2026-05-15: U2 Profile PK は user_id (Cognito sub)
# DTO は内部命名 user_id をそのまま外部公開する (FE/OpenAPI 整合性のためエイリアスを使わない)
class ProfileResponse(BaseModel):
    user_id: UUID                    # = Cognito sub、U2 Profile PK
    email: EmailStr
    age_group: AgeGroup | None       # "10s" | "20s" | ... | "60s+"
    gender: list[str]                # multi-select (FR-AUTH-02)、空 list = 未回答
    occupation: str | None           # max 100 chars
    value_tags: list[str]            # max 20 タグ、各 max 30 chars
    preferences: dict[str, str]      # 自由形式 (FR-LEARN-02 と整合)、空 dict = 未設定
    life_stage: LifeStage | None     # "student" | "working" | "parenting" | ...
    created_at: datetime
    updated_at: datetime

class ProfileUpdateRequest(BaseModel):
    age_group: AgeGroup | None = None
    gender: list[str] | None = None
    occupation: str | None = Field(default=None, max_length=100)
    value_tags: list[str] | None = Field(default=None, max_length=20)
    preferences: dict[str, str] | None = None
    life_stage: LifeStage | None = None
```

### 6.3 ハンドラ実装パターン

```python
# ultrathink C1 + C2 反映 2026-05-15: PK は user_id、ProfileRepository.upsert を使う
@router.get("/me", response_model=ProfileResponse)
async def get_my_profile(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> ProfileResponse:
    profile = await repo.get(user_id=UUID(user.sub))
    if profile is None:
        profile = Profile(user_id=UUID(user.sub), email=user.email)
        profile = await repo.upsert(profile)
    return ProfileResponse.model_validate(profile)
```

`get_current_user` は `interface/deps.py` に追加し、`request.state.user` (middleware がセット) から取り出す。

---

## 7. CurrentUser DI 統合

`apps/api/src/yesman_api/interface/deps.py` (U2 で作成済) に追記:

```python
from fastapi import Request, HTTPException
from yesman_api.domain.auth.models import AuthenticatedUser

def get_current_user(request: Request) -> AuthenticatedUser:
    user = getattr(request.state, "user", None)
    if user is None:
        # 通常 middleware が 401 を返すため、ここに来るのは middleware bypass パス誤設定 or テスト時のみ
        raise HTTPException(status_code=401, detail="authentication required")
    return user

def get_auth_adapter(request: Request) -> AuthBackendAdapter:
    return request.app.state.auth_adapter
```

→ 下流ユニット (U4 / U-Persona / U5 / U6 / U-Test) は `Depends(get_current_user)` を使うだけで認証済 user を取得可能。

---

## 8. ビジネスルール / Edge cases

### 8.1 Token 受け入れポリシー (ultrathink C1 反映 2026-05-15)

旧方針 (ID Token のみ受け入れ) は OAuth/OIDC ベストプラクティスおよび AWS Cognito 公式推奨に反するため改訂:

- **ID Token と Access Token の両方を受け入れる** (`token_use` クレーム = `id` または `access`)
- **email の取得ロジック**:
  | token_use | email 取得 |
  |---|---|
  | `id` | クレームの `email` を直接利用 (従来通り) |
  | `access` | (a) 既存 Profile に email があればそれを利用、(b) なければ **Cognito userInfo endpoint** (`https://{user-pool-domain}/oauth2/userInfo` に Bearer ヘッダで GET) を呼んで取得 → Profile 自動初期化時に保存。userInfo レスポンスは **sub をキーに TTL 5min でメモリキャッシュ** (Cognito userInfo の 10 RPS rate limit 対策) |
- **`token_use` が `id`/`access` 以外**: `reason: token_use_unsupported` で 401
- AuthBackendAdapter インターフェースは変更なし (`verify_token` の戻り値 `AuthenticatedUser.email` が `Optional` に近い意味合いになるが、middleware 層は **userInfo 呼び出しを CognitoAuthAdapter 内に閉じ込め**、外部から見ると常に email がある状態を保つ)
- **MockAuthAdapter**: token_use を判別する必要がなく、特殊トークン挙動は据え置き

### 8.2 JWKS キャッシュ更新
- TTL 1h で expire
- kid mismatch 時は即座に JWKS 再取得 (rate limit に注意: 1 リクエスト = 最大 2 回 JWKS GET、retry は単一回まで)
- 起動時のプリフェッチはしない (lazy = 初回 verify_token で取得)

### 8.3 Clock skew
- `exp` / `nbf` 検証時に ±30 秒を許容 (Cognito 推奨)

### 8.4 同時並行 Profile 自動作成 (race condition) — ultrathink C2 反映 2026-05-15
- U2 ProfileRepository は `upsert(profile)` で create/update を兼ねるため **race condition の特別ハンドリング不要**
- Mock 実装 (`mock_repositories.py` L71-79): 既存 profile があれば created_at を継承、updated_at を更新
- SQLModel 実装 (`sqlmodel_repositories.py`): SQL `INSERT ... ON CONFLICT (user_id) DO UPDATE SET ...` 相当パターン
- `get → upsert` の間に他リクエストが upsert しても、後勝ちで両 request が正常完了 (= 冪等)

### 8.5 Email 大文字小文字
- Cognito の `email` クレームは正規化されない可能性 → 検証側で `.lower().strip()` し、`profiles.email` も lowercased で保存

### 8.6 Cognito にあるが Profile が無いケース
- §5.1 の自動作成で吸収。GET 初回が必ず Profile を作るため、PATCH/DELETE の前に GET があれば 404 にならない
- ただし FE が GET をスキップして PATCH を呼ぶ場合 → 404 + `error_code: profile_not_initialized` を返す (FE 側で GET → PATCH の順序を守る前提)

### 8.7 削除後の Cognito User
- §5.2 の通り、Cognito User Pool 側の削除は U3 スコープ外
- 削除済 Profile に対して同じ Cognito user が再ログインしたら? → §5.1 の自動作成で **新規 Profile (空) として再作成** される (= 同じ sub で再利用)。これは「論理削除なしのリセット」相当。FR-AUTH-04 の意図 (リセット可能) と整合

### 8.8 PII 保護 (NFR-SEC-05)
- U3 では LLM への送信は無いため PII フィルタは不要 (U4 / U5 担当)
- ただし監査ログ出力時に **email を構造化ログのフィールドに直接出さない** — `user.sub` のみログに残し、email は `len(email)` 等のメタデータのみ (もしくは別ログストリーム + Restricted IAM)

---

## 9. テスト戦略

### 9.1 Unit テスト

`apps/api/tests/unit/auth/`

| ファイル | 対象 |
|---|---|
| `test_mock_adapter.py` | MockAuthAdapter — 固定 user / 特殊トークン (`mock-expired` / `mock-anonymous`) |
| `test_jwt_verifier.py` | 共通 `_JwtVerifier` ヘルパー — 正常 / expired / invalid_signature / issuer_mismatch / audience_mismatch / unknown_kid / malformed |
| `test_auth_middleware.py` | AuthMiddleware — bypass / 401 / state.user セット (httpx + ASGITransport) |
| `test_profile_handlers.py` | profiles router — get-or-create / PATCH / DELETE (MockAuthAdapter + MockRepositories) |

JWT モック生成は `tests/fixtures/jwt.py` で RSA 鍵ペア + JWS 発行ヘルパーを置き、JWKS endpoint も `httpx.MockTransport` で模擬する。

### 9.2 Integration テスト

`apps/api/tests/integration/auth/`

| ファイル | 対象 |
|---|---|
| `test_profile_lifecycle.py` | Mock JWT + Mock Repositories で profile lifecycle (GET → PATCH → GET → DELETE) を一気通貫 |
| `test_jwks_cache.py` | (任意) httpx MockTransport で JWKS endpoint を模擬し、cache hit/miss + TTL 経過後 refetch を検証 |

### 9.3 Contract テスト

`apps/api/tests/contract/test_auth_protocol.py`

- `inspect.signature` で MockAuthAdapter / CognitoAuthAdapter / CognitoLocalAuthAdapter が同一 `AuthBackendAdapter` Protocol を実装することを検証

### 9.4 PBT (Property-Based Testing)

`apps/api/tests/property/test_jwt_robustness.py`

- Hypothesis で任意のバイト列 / 改変 JWT を生成し、`verify_token` が **必ず AuthError を発生する** (= プロセスクラッシュしない) ことを検証
- TEST-U3-XX として NFR Req に記載予定

### 9.5 E2E (U-Test 連携)

- Playwright で **MockAuthAdapter モードで起動した API + 静的 FE** に対して Profile lifecycle を確認 — U-Test で実装

---

## 10. 次ステージ (NFR Requirements) への引き継ぎ

### 10.1 性能要件
- JWT 検証レイテンシ p95 < 20ms (キャッシュヒット時)
- JWKS 初回取得タイムアウト 5 秒、retry 1 回
- Profile CRUD レイテンシ p95 < 100ms (U2 Repo p95 < 50ms + middleware + serialization)

### 10.2 セキュリティ要件
- Symbol 不要・8 文字以上のパスワード (U1 で既に設定済、U3 では再確認)
- email_verified=False のユーザーは GET /v1/profiles/me で 403 (検討事項、U3 では一旦許可・後続で厳格化)
- Access Token vs ID Token の token_use チェック

### 10.3 拡張性要件
- AuthBackendAdapter Protocol の **公開鍵** API (verify_token のみ) を維持し、追加 backend (例: Auth0, Firebase Auth) が将来追加可能

### 10.4 環境変数
新規環境変数 (NFR Req / Infra Design でも記載):
- `COGNITO_REGION` (例: `ap-northeast-1`)
- `COGNITO_USER_POOL_ID` (例: `ap-northeast-1_XXXXXXXXX`)
- `COGNITO_APP_CLIENT_ID`
- `COGNITO_LOCAL_ISSUER_URL` (cognito-local 用、`http://localhost:9229/local_xxx`)
- `MOCK_USER_SUB` (default `00000000-0000-0000-0000-000000000001`)
- `MOCK_USER_EMAIL` (default `test@yesman.local`)
- `CORS_ALLOWED_ORIGINS` (CloudFront URL, comma-separated)

→ U1 ApiStack の `apiContainer.environment` への追加が必要 (= Infrastructure Design 段階で U1 への差し戻し or `apps/api/` 側の起動スクリプトで読み込み)

---

## 11. 承認チェックリスト

- [x] AuthenticatedUser ドメインモデル定義 (sub + email + claims + backend)
- [x] AuthBackendAdapter Protocol (最小 = `verify_token` + `aclose`)
- [x] 3 Strategy 実装方針 (Cognito / cognito-local / Mock)
- [x] JWT 検証 middleware + bypass パス + エラー reason 列挙
- [x] Profile 自動初期化フロー (GET get-or-create)
- [x] Profile CRUD API (FR-AUTH-02〜04)
- [x] CurrentUser DI (`get_current_user` Depends)
- [x] ビジネスルール (token_use / clock skew / race condition / email 正規化 / Cognito 削除のスコープ外)
- [x] テスト戦略 (Unit / Integration / Contract / PBT / E2E)
- [x] 次ステージ (NFR Requirements) への引き継ぎ事項
- [x] FR-AUTH-01〜07 全カバレッジ確認

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-15 承認時の Snapshot を保持。

**Auth ロジックへの直接変更なし** (post-CONSTRUCTION 期間 2026-05-17 〜 2026-05-19 を通じて `apps/api/src/yesman_api/{domain,application,infrastructure,interface}/auth/` および `middleware/` 配下に commit による変更なし)。

ただし以下の **波及効果** がある:
- **U7a-web-shell の AuthBypass guard 強化** (`2400f45`): frontend 側で `env.authBypass=true` 時に `signIn()` / `signOutUser()` が no-op になるよう厳密化。backend 側 `MockAuthAdapter` の SPECIAL_TOKENS 3 種 (`mock-valid` / `mock-expired` / `mock-malformed`) と整合した動作を維持。
- **Dynamic Persona Routing で `preference_repo` を inject** (`07c1c78`): DecisionEngine が認証済 user の preference を読むようになったが、`get_current_user` middleware の挙動は不変。

→ U3 / auth は CONSTRUCTION 完了状態のまま、認証 surface を維持して下流の機能拡張を支えている。
