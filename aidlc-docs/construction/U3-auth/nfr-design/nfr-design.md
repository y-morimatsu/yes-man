# U3 / auth — NFR Design

**Unit**: U3 / auth
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-15
**Status**: 🟡 IN REVIEW (light review mode)
**Upstream**: U3 Functional Design (approved + C1 反映済) + U3 NFR Requirements (approved with 13 ultrathink fixes)

---

## 0. 位置付け

U3 NFR Requirements §7 引き継ぎで列挙した「NFR Design で確定する事項」を実装パターンとして具体化する。Code Generation Plan が直接参照するアーキテクチャ・コード骨格を提供。

| 確定対象 | 担当セクション |
|---|---|
| JWT ライブラリ選定 | §1 |
| httpx クライアント設定 | §2 |
| JWKS キャッシュ (TTL 1h + stale 5min + kid 既存時のみ stale + `asyncio.Lock`) | §3 |
| userInfo キャッシュ (C1 由来、TTL 5min) | §4 |
| `_JwtVerifier` 共通ヘルパー | §5 |
| 3 Strategy 実装パターン | §6 |
| AuthMiddleware ASGI 実装 | §7 |
| FastAPI middleware order + lifespan 統合 | §8 |
| AppConfig 拡張 + 起動時バリデーション (条件付き必須) | §9 |
| structlog 構造化ログ helper | §10 |
| 依存ライブラリ (pyproject 追加) | §11 |

---

## 1. JWT ライブラリ選定: **PyJWT** を採用

### 1.1 候補比較

| 観点 | `pyjwt[crypto]` | `python-jose[cryptography]` |
|---|---|---|
| GitHub stars / 直近コミット | 5.5k+ / **活発** (毎月リリース) | 1.5k+ / **緩やか** (年単位リリース) |
| Cognito JWKS 検証実績 | 公式 AWS sample で広く採用 (2024 以降) | 旧 sample (2020 頃) で多用 |
| RS256 / RSA-OAEP | 標準サポート | 標準サポート |
| 型ヒント | 公式 `.pyi` 同梱 | 限定的 |
| 依存 | `cryptography` のみ | `cryptography` + `pyasn1` + `rsa` (推移依存大) |
| `leeway` (clock skew) | ✅ サポート | ✅ サポート |
| ライセンス | MIT | MIT |

### 1.2 決定: **`pyjwt[crypto]>=2.9,<3.0`**
- Cognito JWKS との相性、メンテナンス活発度、依存ツリーの軽さで PyJWT が優位
- API: `jwt.decode(token, key, algorithms=["RS256"], audience=..., issuer=..., leeway=30, options={"require": ["exp", "iat", "iss"]})`
- JWKS から RSA 公開鍵を生成: `jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))`

---

## 2. httpx クライアント設定

### 2.1 共通設定

```python
# infrastructure/auth/_http.py
import httpx

def make_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(connect=3.0, read=3.0, write=2.0, pool=5.0),
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        headers={"User-Agent": "yesman-api/0.1 (+httpx)"},
    )
```

- **タイムアウト** (AVAIL-U3-01): connect 3s + read 3s + write 2s + pool 5s → 単一 GET 上限 ~7s (TLS handshake 込み)
- **max_connections=10** で Cognito JWKS / userInfo の 2 endpoint を同時 10 並行まで許容
- **keepalive 5** で 1h TTL 間の cache miss / hit 時に接続再利用

### 2.2 リトライポリシー
- **Tenacity は採用しない**。1 回 retry のみのシンプルな手動実装で十分:

```python
async def fetch_with_retry(client: httpx.AsyncClient, url: str) -> httpx.Response:
    for attempt in range(2):  # 最大 2 試行 = 1 retry
        try:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.NetworkError) as exc:
            if attempt == 1:
                raise
            await asyncio.sleep(0.2)  # 200ms backoff
    raise RuntimeError("unreachable")
```

---

## 3. JWKS キャッシュ実装

### 3.1 データ構造 (ultrathink I2 + Imp1 反映)

```python
# infrastructure/auth/jwks_cache.py
from __future__ import annotations
import asyncio, json, time
from typing import Any
import httpx
import jwt

class JwksCache:
    """JWKS keys cached with TTL + stale-while-error.

    PERF-U3-03: TTL 1h
    PERF-U3-04: kid mismatch retry 1 回 + asyncio.Lock で thundering herd 直列化
    AVAIL-U3-02: stale 5min、ただし kid 既存時のみ
    """
    def __init__(
        self,
        url: str,
        *,
        ttl: float,
        stale_seconds: float,
        http: httpx.AsyncClient,
    ) -> None:
        self._url = url
        self._ttl = ttl
        self._stale_seconds = stale_seconds
        self._http = http
        self._keys: dict[str, Any] = {}  # kid -> RSA public key (PyJWT 互換)
        self._fetched_at: float | None = None  # monotonic
        self._lock = asyncio.Lock()

    async def get_key(self, kid: str, *, force_refetch: bool = False) -> Any:
        """`force_refetch=True` で fresh でも必ず JWKS を再取得 (kid mismatch retry 用)。
        ultrathink I2 反映 2026-05-15 — retry を確実化。
        """
        if not force_refetch and self._is_fresh() and kid in self._keys:
            return self._keys[kid]
        async with self._lock:
            # double-check (他リクエストが fetch 済の可能性)
            if not force_refetch and self._is_fresh() and kid in self._keys:
                return self._keys[kid]
            try:
                await self._fetch()
            except (httpx.HTTPError, httpx.TimeoutException) as exc:
                # AVAIL-U3-02: stale 利用は kid 既存時のみ
                if self._is_stale_usable() and kid in self._keys:
                    return self._keys[kid]
                raise JwksUnavailable(str(exc)) from exc
            if kid in self._keys:
                return self._keys[kid]
            raise UnknownKid(kid)

    async def _fetch(self) -> None:
        resp = await fetch_with_retry(self._http, self._url)
        data = resp.json()
        new_keys: dict[str, Any] = {}
        for jwk in data.get("keys", []):
            new_keys[jwk["kid"]] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
        if not new_keys:
            # ultrathink Imp1 反映 2026-05-15: 空 JWKS は障害扱い、stale 経路へ流す
            raise JwksUnavailable("empty_jwks")
        self._keys = new_keys
        self._fetched_at = time.monotonic()

    def _is_fresh(self) -> bool:
        return self._fetched_at is not None and time.monotonic() - self._fetched_at < self._ttl

    def _is_stale_usable(self) -> bool:
        return (
            self._fetched_at is not None
            and time.monotonic() - self._fetched_at < self._ttl + self._stale_seconds
        )


class JwksUnavailable(Exception):
    pass

class UnknownKid(Exception):
    def __init__(self, kid: str) -> None:
        super().__init__(kid)
        self.kid = kid
```

### 3.2 設計判断
- `_keys: dict[str, RSAPublicKey]` の形で **RSA 公開鍵オブジェクトを直接キャッシュ** (毎回 `from_jwk` を呼ばない最適化)
- `asyncio.Lock` でフェッチを直列化 → 100 並行 verify で kid mismatch 発生時も JWKS GET は 1 回だけ
- `_is_stale_usable()` は TTL 切れ + stale 期間内の判定。`fetch_at + ttl + stale_seconds` 経過後は完全失効

---

## 4. userInfo キャッシュ実装 (C1 由来)

### 4.1 データ構造 (ultrathink Imp3 反映)

```python
# infrastructure/auth/userinfo_cache.py
import asyncio, time
from dataclasses import dataclass
import httpx

@dataclass(frozen=True, slots=True)
class UserInfo:
    email: str
    email_verified: bool


class UserInfoCache:
    """Access Token 由来の sub に対する email + email_verified を
    Cognito userInfo endpoint から lazy 取得。

    C1 (NFR Req SEC-U3-04): TTL 5min、sub をキーにキャッシュ。
    Cognito userInfo は 10 RPS rate limit があるため、並行リクエストは sub ごとに asyncio.Lock。
    ultrathink Imp3 反映 2026-05-15: email_verified もキャッシュに含める (将来の SEC-U3-12 拡張用)。
    """
    def __init__(
        self,
        userinfo_url: str,
        *,
        ttl: float,
        http: httpx.AsyncClient,
    ) -> None:
        self._url = userinfo_url
        self._ttl = ttl
        self._http = http
        self._cache: dict[str, tuple[UserInfo, float]] = {}  # sub -> (UserInfo, expires_at_monotonic)
        self._locks: dict[str, asyncio.Lock] = {}

    async def get_userinfo(self, *, sub: str, access_token: str) -> UserInfo:
        now = time.monotonic()
        cached = self._cache.get(sub)
        if cached and now < cached[1]:
            return cached[0]
        lock = self._locks.setdefault(sub, asyncio.Lock())
        async with lock:
            # double-check
            cached = self._cache.get(sub)
            if cached and time.monotonic() < cached[1]:
                return cached[0]
            resp = await fetch_with_retry_authed(self._http, self._url, access_token)
            payload = resp.json()
            email = str(payload.get("email", "")).lower().strip()
            if not email:
                raise UserInfoEmailMissing(sub)
            email_verified = _coerce_bool(payload.get("email_verified", True))
            info = UserInfo(email=email, email_verified=email_verified)
            self._cache[sub] = (info, time.monotonic() + self._ttl)
            return info


def _coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() == "true"
    return bool(value)


class UserInfoEmailMissing(Exception):
    pass


async def fetch_with_retry_authed(
    client: httpx.AsyncClient, url: str, access_token: str
) -> httpx.Response:
    headers = {"Authorization": f"Bearer {access_token}"}
    for attempt in range(2):
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.HTTPStatusError, httpx.NetworkError):
            if attempt == 1:
                raise
            await asyncio.sleep(0.2)
    raise RuntimeError("unreachable")
```

### 4.2 設計判断
- **per-sub Lock** で同一 sub の並行リクエストがあっても userInfo を 1 回しか呼ばない (rate limit 対策)
- TTL 5min は Cognito 公式 `cognito-idp:GetUser` の rate limit と整合
- 失敗時 (`UserInfoEmailMissing` / httpx 例外) は `AuthError("userinfo_unavailable")` にマップ
- **メモリリーク防止**: `_locks` は sub ごとに増えていくため、LRU で上限 (例: 1000) を将来追加 — U3 では未対応 (デモ規模なら不要)

---

## 5. `_JwtVerifier` 共通ヘルパー (ultrathink I1 + I2 + Imp2 反映)

### 5.1 シグネチャ

```python
# infrastructure/auth/_verifier.py
from dataclasses import dataclass
from datetime import datetime, timezone
import jwt

@dataclass(frozen=True, slots=True)
class JwtVerifyConfig:
    issuer: str                     # https://cognito-idp.{region}.amazonaws.com/{pool_id} 等
    audience: str                   # App Client ID (id token は aud に、access token は client_id に)
    leeway_seconds: int = 30        # SEC-U3-05 clock skew
    algorithms: tuple[str, ...] = ("RS256",)


class _JwtVerifier:
    """ultrathink I1 反映 2026-05-15: token_use を unverified payload で先に判別し、
    ID Token / Access Token を明示的に分岐 (例外フローに依存しない)。
    """
    REQUIRED_CLAIMS = ("exp", "iat", "iss", "sub")  # ultrathink Imp2 反映: sub も必須

    def __init__(self, *, jwks: JwksCache, config: JwtVerifyConfig) -> None:
        self._jwks = jwks
        self._cfg = config

    async def verify(self, token: str) -> dict:
        # 1. header 抽出 (unverified) — alg + kid のチェック
        try:
            unverified_header = jwt.get_unverified_header(token)
            unverified_payload = jwt.decode(token, options={"verify_signature": False})
        except jwt.DecodeError as exc:
            raise AuthError("malformed", detail=str(exc)) from exc
        kid = unverified_header.get("kid")
        alg = unverified_header.get("alg")
        if alg not in self._cfg.algorithms:
            raise AuthError("algorithm_mismatch", detail=f"alg={alg!r}")
        if not kid:
            raise AuthError("malformed", detail="missing kid")

        # 2. token_use を先に判別 (I1: unverified 段階で分岐)
        token_use = unverified_payload.get("token_use")
        if token_use not in {"id", "access"}:
            raise AuthError("token_use_unsupported", detail=f"token_use={token_use!r}")

        # 3. 公開鍵取得 (kid mismatch → force_refetch で 1 回 retry)
        try:
            key = await self._jwks.get_key(kid)
        except UnknownKid:
            try:
                key = await self._jwks.get_key(kid, force_refetch=True)  # I2: 確実な refetch
            except UnknownKid:
                raise AuthError("unknown_kid")
        except JwksUnavailable as exc:
            raise AuthError("jwks_unavailable", detail=str(exc)) from exc

        # 4. token_use に応じた署名 + クレーム検証 (I1: 例外でなく if/else 分岐)
        decode_options = {"require": list(self.REQUIRED_CLAIMS)}
        try:
            if token_use == "id":
                claims = jwt.decode(
                    token,
                    key=key,
                    algorithms=list(self._cfg.algorithms),
                    issuer=self._cfg.issuer,
                    audience=self._cfg.audience,           # ID Token は aud=app_client_id
                    leeway=self._cfg.leeway_seconds,
                    options=decode_options,
                )
            else:  # access
                claims = jwt.decode(
                    token,
                    key=key,
                    algorithms=list(self._cfg.algorithms),
                    issuer=self._cfg.issuer,
                    leeway=self._cfg.leeway_seconds,
                    options={**decode_options, "verify_aud": False},  # Access Token は aud 不在
                )
                if claims.get("client_id") != self._cfg.audience:
                    raise AuthError("audience_mismatch", detail="client_id mismatch")
        except jwt.ExpiredSignatureError as exc:
            raise AuthError("expired") from exc
        except jwt.InvalidIssuerError as exc:
            raise AuthError("issuer_mismatch") from exc
        except jwt.InvalidAudienceError as exc:
            raise AuthError("audience_mismatch") from exc
        except jwt.InvalidSignatureError as exc:
            raise AuthError("invalid_signature") from exc
        except jwt.MissingRequiredClaimError as exc:
            raise AuthError("malformed", detail=f"missing claim: {exc!s}") from exc
        except jwt.InvalidTokenError as exc:
            raise AuthError("malformed", detail=str(exc)) from exc

        return claims
```

### 5.2 設計判断
- **I1 反映**: 1 回目 `jwt.decode(verify_signature=False)` で unverified payload を取得し、`token_use` で経路分岐。これにより:
  - 例外フロー (`InvalidAudienceError` を fallback トリガに使う) を廃止
  - PyJWT のバージョン依存挙動から独立 (将来 aud 任意化されても挙動が変わらない)
  - テスト網羅が直線化 (id token path / access token path / unsupported path の 3 経路)
- **Imp2 反映**: `REQUIRED_CLAIMS = ("exp", "iat", "iss", "sub")` で sub を必須化。Cognito は出すが、防御層として明示
- **I2 反映**: kid mismatch 時の retry を `force_refetch=True` で確実化 — PERF-U3-04 が機能する

---

## 6. 3 Strategy 実装パターン

### 6.1 CognitoAuthAdapter

```python
# infrastructure/auth/cognito_adapter.py
class CognitoAuthAdapter:
    backend_name = "cognito"

    def __init__(
        self,
        *,
        region: str,
        user_pool_id: str,
        app_client_id: str,
        hosted_ui_url: str,        # https://yesman-prod.auth.ap-northeast-1.amazoncognito.com
        jwks_cache_ttl: float = 3600,
        jwks_stale_seconds: float = 300,
        userinfo_ttl: float = 300,
    ) -> None:
        self._issuer = f"https://cognito-idp.{region}.amazonaws.com/{user_pool_id}"
        jwks_url = f"{self._issuer}/.well-known/jwks.json"
        userinfo_url = f"{hosted_ui_url.rstrip('/')}/oauth2/userInfo"
        self._http = make_http_client()
        self._jwks = JwksCache(jwks_url, ttl=jwks_cache_ttl, stale_seconds=jwks_stale_seconds, http=self._http)
        self._userinfo = UserInfoCache(userinfo_url, ttl=userinfo_ttl, http=self._http)
        self._verifier = _JwtVerifier(
            jwks=self._jwks,
            config=JwtVerifyConfig(issuer=self._issuer, audience=app_client_id),
        )

    async def verify_token(self, token: str) -> AuthenticatedUser:
        claims = await self._verifier.verify(token)
        sub = claims["sub"]
        token_use = claims["token_use"]
        if token_use == "id":
            email = (claims.get("email") or "").lower().strip()
            if not email:
                raise AuthError("missing_email")
            email_verified = _coerce_bool(claims.get("email_verified", True))
        else:  # access — ultrathink Imp3 反映: email_verified も userInfo から取得
            try:
                info = await self._userinfo.get_userinfo(sub=sub, access_token=token)
            except (UserInfoEmailMissing, httpx.HTTPError) as exc:
                raise AuthError("userinfo_unavailable", detail=str(exc)) from exc
            email = info.email
            email_verified = info.email_verified
        return AuthenticatedUser(
            sub=sub,
            email=email,
            email_verified=email_verified,
            issued_at=datetime.fromtimestamp(claims["iat"], tz=timezone.utc),
            expires_at=datetime.fromtimestamp(claims["exp"], tz=timezone.utc),
            raw_claims=claims,
            backend=self.backend_name,
        )

    async def aclose(self) -> None:
        await self._http.aclose()
```

### 6.2 CognitoLocalAuthAdapter (ultrathink I3 反映)

CognitoAuthAdapter を継承せず、**コンストラクタ引数のみ差し替える派生** とする (継承よりコンポジションを優先)。**userInfo endpoint はオプション**: 未設定なら Access Token モードを動的に拒否 (cognito-local のバージョン差に強い):

```python
# infrastructure/auth/cognito_local_adapter.py
class CognitoLocalAuthAdapter:
    backend_name = "cognito-local"

    def __init__(
        self,
        *,
        issuer_url: str,
        app_client_id: str,
        userinfo_url: str | None = None,        # ultrathink I3 反映: None なら ID Token only mode
        jwks_cache_ttl: float = 3600,
        jwks_stale_seconds: float = 300,
        userinfo_ttl: float = 300,
    ) -> None:
        self._issuer = issuer_url               # http://localhost:9229/local_xxx
        jwks_url = f"{issuer_url.rstrip('/')}/.well-known/jwks.json"
        self._http = make_http_client()
        self._jwks = JwksCache(jwks_url, ttl=jwks_cache_ttl, stale_seconds=jwks_stale_seconds, http=self._http)
        self._userinfo: UserInfoCache | None = (
            UserInfoCache(userinfo_url, ttl=userinfo_ttl, http=self._http)
            if userinfo_url is not None else None
        )
        self._verifier = _JwtVerifier(
            jwks=self._jwks,
            config=JwtVerifyConfig(issuer=self._issuer, audience=app_client_id),
        )

    async def verify_token(self, token: str) -> AuthenticatedUser:
        claims = await self._verifier.verify(token)
        sub = claims["sub"]
        token_use = claims["token_use"]
        if token_use == "id":
            email = (claims.get("email") or "").lower().strip()
            if not email:
                raise AuthError("missing_email")
            email_verified = _coerce_bool(claims.get("email_verified", True))
        else:  # access
            if self._userinfo is None:
                # cognito-local が userInfo を提供しない構成では Access Token を拒否
                raise AuthError(
                    "token_use_unsupported",
                    detail="cognito-local without userInfo URL: id token only",
                )
            try:
                info = await self._userinfo.get_userinfo(sub=sub, access_token=token)
            except (UserInfoEmailMissing, httpx.HTTPError) as exc:
                raise AuthError("userinfo_unavailable", detail=str(exc)) from exc
            email = info.email
            email_verified = info.email_verified
        return AuthenticatedUser(
            sub=sub,
            email=email,
            email_verified=email_verified,
            issued_at=datetime.fromtimestamp(claims["iat"], tz=timezone.utc),
            expires_at=datetime.fromtimestamp(claims["exp"], tz=timezone.utc),
            raw_claims=claims,
            backend=self.backend_name,
        )

    async def aclose(self) -> None:
        await self._http.aclose()
```

- **コード重複は許容**: 60-70% は同一だが、ライフサイクルは独立し、issuer/url のみ違うため `_BaseHostedAuthAdapter` 抽象クラスとして共通化する case もある — U3 では **2 ファイル別々** で書き、Code Generation Phase で重複が許容範囲なら共通化見送り (シンプル優先)
- **`cognito_local_userinfo_url` 環境変数**: `AppConfig` に追加 (§9 で更新)。未設定運用は **CI / オフライン開発** で実用的

### 6.3 MockAuthAdapter (ultrathink Imp5 反映: FD §3.3 にも mock-malformed 追記)

```python
# infrastructure/auth/mock_adapter.py
from datetime import datetime, timedelta, timezone

class MockAuthAdapter:
    backend_name = "mock"

    SPECIAL_TOKENS: dict[str, str] = {
        "mock-expired": "expired",
        "mock-anonymous": "missing",
        "mock-malformed": "malformed",   # ultrathink Imp5 反映 — FD §3.3 にも反映済
    }

    def __init__(self, *, mock_sub: UUID, mock_email: str) -> None:
        self._sub = str(mock_sub)
        self._email = mock_email.lower()

    async def verify_token(self, token: str) -> AuthenticatedUser:
        if token == "":
            raise AuthError("missing")
        if token in self.SPECIAL_TOKENS:
            raise AuthError(self.SPECIAL_TOKENS[token])
        now = datetime.now(timezone.utc)
        return AuthenticatedUser(
            sub=self._sub,
            email=self._email,
            email_verified=True,
            issued_at=now,
            expires_at=now + timedelta(hours=1),
            raw_claims={"sub": self._sub, "email": self._email, "token_use": "id", "mock": True},
            backend=self.backend_name,
        )

    async def aclose(self) -> None:
        pass
```

### 6.4 AuthBackendFactory

```python
# infrastructure/auth/factory.py
class AuthBackendFactory:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._adapter: AuthBackendAdapter | None = None

    async def create(self) -> AuthBackendAdapter:
        if self._adapter is not None:
            return self._adapter
        if self._config.auth_backend == "cognito":
            self._adapter = CognitoAuthAdapter(
                region=self._config.cognito_region,        # type: ignore[arg-type]
                user_pool_id=self._config.cognito_user_pool_id,
                app_client_id=self._config.cognito_app_client_id,
                hosted_ui_url=self._config.cognito_hosted_ui_url,
                jwks_cache_ttl=self._config.jwks_cache_ttl_seconds,
                jwks_stale_seconds=self._config.jwks_stale_while_error_seconds,
                userinfo_ttl=self._config.userinfo_cache_ttl_seconds,
            )
        elif self._config.auth_backend == "cognito-local":
            self._adapter = CognitoLocalAuthAdapter(
                issuer_url=self._config.cognito_local_issuer_url,  # type: ignore[arg-type]
                app_client_id=self._config.cognito_app_client_id,
                userinfo_url=self._config.cognito_local_userinfo_url,  # I3: オプション、None で ID Token only
                jwks_cache_ttl=self._config.jwks_cache_ttl_seconds,
                jwks_stale_seconds=self._config.jwks_stale_while_error_seconds,
                userinfo_ttl=self._config.userinfo_cache_ttl_seconds,
            )
        elif self._config.auth_backend == "mock":
            self._adapter = MockAuthAdapter(
                mock_sub=self._config.mock_user_sub,
                mock_email=self._config.mock_user_email,
            )
        return self._adapter

    async def dispose(self) -> None:
        if self._adapter is not None:
            await self._adapter.aclose()
```

---

## 7. AuthMiddleware ASGI 実装

### 7.1 実装スケッチ

```python
# interface/middleware/auth.py
from __future__ import annotations
import json
from starlette.types import ASGIApp, Receive, Scope, Send

class AuthMiddleware:
    BYPASS_PATHS_DEFAULT: frozenset[str] = frozenset({
        "/health", "/docs", "/redoc", "/openapi.json",
    })
    BYPASS_PREFIXES_DEFAULT: tuple[str, ...] = ("/internal/",)

    def __init__(
        self,
        app: ASGIApp,
        *,
        adapter: AuthBackendAdapter,
        extra_bypass_paths: frozenset[str] = frozenset(),
        mock_auto_user: bool = False,
    ) -> None:
        self.app = app
        self._adapter = adapter
        self._bypass_paths = self.BYPASS_PATHS_DEFAULT | extra_bypass_paths
        self._bypass_prefixes = self.BYPASS_PREFIXES_DEFAULT
        self._mock_auto_user = mock_auto_user
        self._logger = get_logger("auth.middleware")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        if self._is_bypass(path) or scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)
        token = self._extract_bearer(scope.get("headers", []))
        try:
            if token is None:
                if self._mock_auto_user and self._adapter.backend_name == "mock":
                    token = "mock-auto"
                else:
                    raise AuthError("missing")
            user = await self._adapter.verify_token(token)
        except AuthError as exc:
            return await self._send_401(send, exc)
        scope.setdefault("state", {})["user"] = user
        await self.app(scope, receive, send)

    def _is_bypass(self, path: str) -> bool:
        return path in self._bypass_paths or any(path.startswith(p) for p in self._bypass_prefixes)

    @staticmethod
    def _extract_bearer(headers: list[tuple[bytes, bytes]]) -> str | None:
        # Authorization: Bearer xxx
        for name, value in headers:
            if name.lower() == b"authorization":
                raw = value.decode("latin-1")
                if raw.lower().startswith("bearer "):
                    return raw[7:].strip()
                return None
        return None

    async def _send_401(self, send: Send, exc: AuthError) -> None:
        body = json.dumps({"detail": "authentication required", "reason": exc.reason}).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"www-authenticate", b'Bearer error="invalid_token"'),
                (b"cache-control", b"no-store"),    # ultrathink Imp4 反映: 401 を CDN/proxy がキャッシュしない
            ],
        })
        await send({"type": "http.response.body", "body": body})
```

### 7.2 設計判断
- **ASGI レベル実装** (BaseHTTPMiddleware を使わない): リクエストボディを消費せず、performance overhead が低い
- **`scope["state"]["user"]`**: FastAPI の `Request.state.user` から読み取れる (Starlette は scope の state を request.state にマップ)
- **`Authorization` header 重複**: ASGI スコープ headers では最後の値で上書きされる前提 (httpx / uvicorn ともに最終値採用)。`I1` で言及した重複対策は ASGI レベルではアプリ側で対応不要
- **`OPTIONS` メソッドは bypass**: CORSMiddleware を外側に置く設計でも preflight が認証で 401 にならない保険
- **`scope.setdefault("state", {})`**: Starlette は `scope["state"]` を保証するが、純粋 ASGI test (httpx ASGITransport) では未初期化のことがあるため setdefault

---

## 8. FastAPI middleware order + lifespan 統合

### 8.1 `main.py` 改訂 (U3 で更新)

```python
# apps/api/src/yesman_api/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from yesman_api.infrastructure.config import get_config
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.infrastructure.auth.factory import AuthBackendFactory
from yesman_api.interface.middleware.auth import AuthMiddleware
from yesman_api.interface.http.health import router as health_router
from yesman_api.interface.http.profiles import router as profiles_router
from yesman_api.shared.logging import configure_logging, get_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    config = get_config()
    configure_logging(level=config.log_level)
    repo_factory = RepositoryFactory(config)
    auth_factory = AuthBackendFactory(config)
    adapter = await auth_factory.create()
    app.state.repo_factory = repo_factory
    app.state.auth_adapter = adapter
    app.state.auth_factory = auth_factory
    app.state.config = config
    get_logger("startup").info("app.start", auth_backend=adapter.backend_name, storage_backend=config.storage_backend)
    try:
        yield
    finally:
        await auth_factory.dispose()
        await repo_factory.dispose()


def create_app() -> FastAPI:
    config = get_config()
    config.validate_runtime()  # AVAIL-U3-03: 条件付き必須バリデーション + Mock 起動拒否
    app = FastAPI(title="YesMan API", version=config.app_version, lifespan=lifespan)

    # 注: FastAPI.add_middleware は後勝ち = 内側。CORS を外側に置くため最後に add する。
    # adapter は lifespan で生成されるため AuthMiddleware は **factory 経由で lazy 取得** する
    # ラッパーを使う (= adapter 解決を __call__ 時に遅延)
    app.add_middleware(_LazyAuthMiddleware)         # 内側
    app.add_middleware(                              # 外側
        CORSMiddleware,
        allow_origins=config.cors_allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(health_router)
    app.include_router(profiles_router)
    return app


class _LazyAuthMiddleware:
    """AuthMiddleware を lifespan 後にバインドするラッパー。

    FastAPI の add_middleware は instantiate 時に adapter を必要とするが、
    lifespan startup までは adapter が存在しない。`app.state` 経由で lazy 取得する。

    依存: Starlette >= 0.32 (scope["app"] が FastAPI/Starlette アプリインスタンスを指すことが保証される)。
    ultrathink I4 反映 2026-05-15 — Starlette バージョン依存を §11 依存追加で明示。
    純粋 ASGI テストでは `tests/conftest.py` の `attach_auth_adapter` ヘルパーで scope["app"].state.auth_adapter を直接セット。
    """
    def __init__(self, app, **kwargs):
        self.app = app
        self._kwargs = kwargs
        self._inner: AuthMiddleware | None = None

    async def __call__(self, scope, receive, send):
        if self._inner is None:
            # scope["app"] = FastAPI app (Starlette 0.30+)
            fastapi_app = scope.get("app")
            adapter = fastapi_app.state.auth_adapter
            config = fastapi_app.state.config
            self._inner = AuthMiddleware(
                self.app,
                adapter=adapter,
                extra_bypass_paths=frozenset(config.auth_bypass_paths_extra),
                mock_auto_user=config.mock_auto_user,
            )
        await self._inner(scope, receive, send)


app = create_app()
__all__ = ["app", "create_app"]
```

### 8.2 設計判断
- **`_LazyAuthMiddleware`**: lifespan で adapter を作るタイミングと middleware instantiate タイミングのギャップを埋めるため。最初のリクエストで `app.state.auth_adapter` を解決し、以降は self._inner にキャッシュ
- **CORS 設定**: `allow_credentials=False` (Bearer なので Cookie 不要、SEC-U3-08)、`allow_methods` と `allow_headers` は必要最小限
- **lifespan ログ**: `app.start` イベントを構造化ログに出力 (backend 切替が分かる)

---

## 9. AppConfig 拡張 + 起動時バリデーション

### 9.1 拡張内容

`apps/api/src/yesman_api/infrastructure/config.py` を以下のように拡張:

```python
from uuid import UUID
from pydantic import EmailStr, Field, model_validator

class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # existing fields (U2)
    app_env: Literal["prod", "stg", "dev", "ci"] = "dev"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    app_version: str = "0.1.0"
    storage_backend: Literal["aurora", "docker-postgres", "mock"] = "mock"
    auth_backend: Literal["cognito", "cognito-local", "mock"] = "mock"
    llm_provider: str = "mock"
    voice_backend: Literal["aws", "web-speech-api", "mock"] = "mock"
    event_backend: Literal["eventbridge", "inline-async", "sync"] = "sync"
    database_url: str = "sqlite+aiosqlite:///:memory:"
    aurora_host: str | None = None
    aurora_port: int = 5432
    aurora_dbname: str = "yesman"
    database_username: str = "yesman"
    database_password: str = ""
    origin_verify_secret: str = ""

    # U3 new
    cognito_region: str | None = None
    cognito_user_pool_id: str | None = None
    cognito_app_client_id: str | None = None
    cognito_hosted_ui_url: str | None = None       # https://yesman-prod.auth.ap-northeast-1.amazoncognito.com
    cognito_local_issuer_url: str | None = None    # http://localhost:9229/local_xxx
    cognito_local_userinfo_url: str | None = None  # ultrathink I3 反映: cognito-local 用、未設定なら ID Token only mode
    mock_user_sub: UUID = UUID("11111111-1111-1111-1111-111111111111")
    mock_user_email: EmailStr = "test@yesman.local"
    mock_auto_user: bool = False
    cors_allowed_origins: list[str] = Field(default_factory=list)
    auth_bypass_paths_extra: list[str] = Field(default_factory=list)
    jwks_cache_ttl_seconds: float = 3600.0
    jwks_stale_while_error_seconds: float = 300.0
    userinfo_cache_ttl_seconds: float = 300.0

    def assemble_database_url(self) -> str:
        if self.storage_backend == "aurora" and self.aurora_host:
            return (
                f"postgresql+asyncpg://{self.database_username}:{quote_plus(self.database_password)}"
                f"@{self.aurora_host}:{self.aurora_port}/{self.aurora_dbname}"
            )
        return self.database_url

    def validate_runtime(self) -> None:
        """起動時の条件付き必須バリデーション (AVAIL-U3-03 / SEC-U3-11)。

        FR-AUTH-05/07 + ultrathink Imp3 / I5 反映。
        """
        # SEC-U3-11: Mock backend は dev/ci 限定
        if self.auth_backend == "mock" and self.app_env not in {"dev", "ci"}:
            raise RuntimeError(
                f"AUTH_BACKEND=mock is not allowed when APP_ENV={self.app_env!r}. "
                f"Only dev/ci environments may use mock backend."
            )
        # Imp3: cognito 必須環境変数
        if self.auth_backend == "cognito":
            missing = [k for k in (
                "cognito_region", "cognito_user_pool_id", "cognito_app_client_id", "cognito_hosted_ui_url",
            ) if not getattr(self, k)]
            if missing:
                raise RuntimeError(
                    f"AUTH_BACKEND=cognito requires environment variables: {missing}"
                )
        if self.auth_backend == "cognito-local":
            if not self.cognito_local_issuer_url:
                raise RuntimeError("AUTH_BACKEND=cognito-local requires COGNITO_LOCAL_ISSUER_URL")
            if not self.cognito_app_client_id:
                raise RuntimeError("AUTH_BACKEND=cognito-local requires COGNITO_APP_CLIENT_ID")
        # SEC-U3-06: cognito 本番は HTTPS 必須
        if self.auth_backend == "cognito":
            if self.cognito_hosted_ui_url and not self.cognito_hosted_ui_url.startswith("https://"):
                raise RuntimeError("COGNITO_HOSTED_UI_URL must use https in prod")
        # CORS: 本番は空文字 deny を許容しない
        if self.app_env == "prod" and not self.cors_allowed_origins:
            raise RuntimeError("CORS_ALLOWED_ORIGINS must be set in production")
```

### 9.2 設計判断
- **`validate_runtime()` を `model_validator(mode='after')` ではなく明示メソッド化**: pydantic-settings の env loading 時にではなく `create_app()` 内で呼ぶ → テスト時にバリデーション無しで AppConfig を作れる柔軟性
- **`app_env` に `stg` を追加**: U2 は `prod/dev/ci` の 3 値だったが、ultrathink I5 で `stg` を追加 (= Mock 拒否対象を明確化)。これは **U2 への遡及修正** が必要 (Infrastructure Design で計画)
- **`EmailStr` 依存**: pydantic-settings から自動 `email-validator>=2.0` を引いてくる

---

## 10. structlog 構造化ログ helper

### 10.1 新設ファイル

```python
# apps/api/src/yesman_api/shared/logging.py
from __future__ import annotations
import logging
import structlog

def configure_logging(*, level: str = "INFO") -> None:
    """structlog + stdlib logging の統合設定。

    JSON 出力で CloudWatch Logs / aws-xray と整合。
    """
    log_level = logging.getLevelName(level)
    logging.basicConfig(level=log_level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(log_level),
        cache_logger_on_first_use=True,
    )

def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)

def audit_log(event: str, **fields) -> None:
    """SEC-U3-10: audit イベントは構造化フィールドのみ。値の中身は出さない。"""
    get_logger("audit").info(event, **fields)
```

### 10.2 利用例 (Profile DELETE / PATCH) — ultrathink I5 反映: イベント名 `audit.profile.{action}` 3-segment 統一

```python
# interface/http/profiles.py
# ultrathink Infra C1+C2 反映 2026-05-15: PK は user_id、Repository は upsert を使う
@router.delete("/me", status_code=204)
async def delete_my_profile(
    user: AuthenticatedUser = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> None:
    await repo.delete(user_id=UUID(user.sub))
    audit_log("audit.profile.deleted", sub=user.sub, backend=user.backend)
    return None


@router.patch("/me", response_model=ProfileResponse)
async def update_my_profile(
    payload: ProfileUpdateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    repo: ProfileRepository = Depends(get_profile_repo),
) -> ProfileResponse:
    existing = await repo.get(user_id=UUID(user.sub))
    if existing is None:
        raise HTTPException(status_code=404, detail="profile not initialized")
    updated = _apply_patch(existing, payload)
    saved = await repo.upsert(updated)
    audit_log(
        "audit.profile.updated",
        sub=user.sub,
        backend=user.backend,
        changed_fields=sorted(payload.model_dump(exclude_unset=True).keys()),
    )
    return ProfileResponse.model_validate(saved)
```

**命名規則**: `audit.{entity}.{action}` 3-segment (CloudWatch Logs Insights / Athena query での filterability 重視)。U4 以降の audit イベントも同形式で追加 (`audit.decision.created` 等)。

---

## 11. 依存ライブラリ (pyproject 追加)

`apps/api/pyproject.toml` の `[project.dependencies]` に追加:

```toml
dependencies = [
    # existing (U2)
    "fastapi>=0.115,<0.116",
    "uvicorn[standard]>=0.32,<0.33",
    "sqlmodel>=0.0.22,<0.1",
    "sqlalchemy[asyncio]>=2.0,<2.1",
    "asyncpg>=0.30,<0.31",
    "alembic>=1.14,<1.15",
    "pydantic-settings>=2.6,<2.7",
    "aws-xray-sdk>=2.14,<2.15",
    "boto3>=1.35,<1.36",
    # U3 new
    "pyjwt[crypto]>=2.9,<3.0",
    "httpx>=0.27,<0.28",
    "structlog>=24.4,<25.0",
    "email-validator>=2.2,<3.0",   # EmailStr 用 (pydantic-settings 推移依存)
    "starlette>=0.40,<0.42",        # ultrathink I4 反映: _LazyAuthMiddleware の scope["app"] 依存 (Starlette >= 0.32 で保証、FastAPI 0.115 が引いてくる版を明示)
]
```

dev 依存への追加なし (httpx は dev でも使えるため新規追加なし、JWT モックは `pyjwt` 本体で十分)。

---

## 12. 引き継ぎ (Infrastructure Design)

Infrastructure Design で確定する事項:

- **ディレクトリ構造**: `apps/api/src/yesman_api/application/auth/` (Protocol + AuthError), `infrastructure/auth/` (Cognito/CognitoLocal/Mock + Factory + JwksCache + UserInfoCache + _JwtVerifier + _http helper), `interface/middleware/auth.py`, `interface/http/profiles.py`, `interface/http/dto/profile.py`, `shared/logging.py`, `domain/auth/models.py`
- **U2 Profile スキーマ拡張 (C2)**: `models.py` Profile に `gender` + `preferences` JSONB 2 カラム追加 + `0003_profile_gender_preferences` Alembic migration 計画 (NFR Req §7 で言及済の最終仕様)
- **U2 AppConfig 拡張 (Imp3 / I5)**: `app_env: Literal["prod", "stg", "dev", "ci"]` に `stg` 追加、U3 環境変数 12 個追加、`validate_runtime()` メソッド追加 — `config.py` への遡及修正計画
- **U1 ApiStack 環境変数注入 (I2)**: `apiContainer.environment` に COGNITO_REGION / COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID / COGNITO_HOSTED_UI_URL / CORS_ALLOWED_ORIGINS / AUTH_BACKEND / APP_ENV / LOG_LEVEL を追加。値は CDK Cross-Stack Reference で AuthStack → ApiStack に渡す。CloudFront URL (EdgeStack) は SSM Parameter Store 経由 (循環参照回避)
- **OpenAPI スキーマ**: profiles router を include した後 `/openapi.json` から TS クライアント生成 (U7c で使用)、`api-client/` ワークスペースで auto-generated 型を扱う

---

## 13. 承認チェックリスト

- [x] JWT ライブラリ選定 (PyJWT 採用 + 根拠)
- [x] httpx 設定 (Timeout 構造体 + 手動 1 回 retry + keepalive)
- [x] JwksCache 実装スケッチ (TTL + stale + asyncio.Lock + kid 既存時のみ stale + **force_refetch + empty_jwks 検知**)
- [x] UserInfoCache 実装スケッチ (TTL 5min + per-sub Lock + **UserInfo dataclass で email + email_verified 両方キャッシュ**)
- [x] _JwtVerifier ヘルパー (PyJWT decode + **unverified payload 段階で token_use 分岐** + sub 必須 + 9 種エラーマッピング)
- [x] 3 Strategy + Factory 実装パターン (**CognitoLocal の userInfo はオプション化**)
- [x] AuthMiddleware ASGI 実装 + Lazy ラッパー + **401 に Cache-Control: no-store**
- [x] FastAPI middleware order (CORS 外側 / Auth 内側) + **Starlette 0.32+ 必須を依存で明示**
- [x] AppConfig 拡張 + validate_runtime (cognito 必須 / Mock prod 拒否 / CORS prod 必須 / cognito HTTPS / cognito_local_userinfo_url オプション)
- [x] structlog helper + audit_log (**`audit.profile.updated` / `audit.profile.deleted` 3-segment 統一**)
- [x] 依存ライブラリ (pyjwt[crypto] + httpx + structlog + email-validator + starlette)
- [x] Infrastructure Design への引き継ぎ事項 (ディレクトリ / U2 Profile 拡張 / U2 AppConfig 拡張 / U1 ApiStack 環境変数注入)

### ultrathink レビュー (2026-05-15) 反映済 10 件
- **Important 5**: I1 _JwtVerifier を unverified token_use 分岐方式に / I2 JwksCache.get_key force_refetch / I3 cognito_local_userinfo_url オプション化 / I4 Starlette 0.32+ 依存明示 / I5 audit.profile.{action} 3-segment 統一
- **Improvements 5**: Imp1 JwksCache._fetch() で empty_jwks 検知 / Imp2 _JwtVerifier sub 必須化 / Imp3 UserInfoCache を UserInfo dataclass (email + email_verified) に拡張 / Imp4 401 に Cache-Control: no-store / Imp5 MockAuthAdapter mock-malformed 特殊トークン明示 + FD §3.3 への遡及反映

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-15 承認時の Snapshot (ultrathink full 10 fixes 適用済) を保持。

**Important 5 / Improvements 5 の合計 10 件の修正点は全て継続有効**。`_JwtVerifier unverified token_use 分岐`、`JwksCache.get_key force_refetch`、`CognitoLocal userInfo オプション化`、`Starlette 0.32+ 明示`、`audit.profile.{action} 3-segment` 等の NFR Design は不変。

→ U3 NFR Design は CONSTRUCTION 完了状態のまま継続有効。Post-CONSTRUCTION 期間中、middleware / JWT 検証 path の logic 変更なし。
