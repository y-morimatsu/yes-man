"""Application configuration loaded from environment variables (pydantic-settings).

Environment variable mappings:
- APP_ENV         : prod | stg | dev | ci
- LOG_LEVEL       : DEBUG | INFO | WARNING | ERROR
- STORAGE_BACKEND : aurora | docker-postgres | mock         (FR-HIST-04)
- AUTH_BACKEND    : cognito | cognito-local | mock          (FR-AUTH-05)
- LLM_PROVIDER    : bedrock | ollama | codex-cli | claude-code-cli | gemini-cli | mock
- VOICE_BACKEND   : aws | web-speech-api | mock
- EVENT_BACKEND   : eventbridge | inline-async | sync
- DATABASE_URL    : full PostgreSQL connection URL (docker-postgres / dev)
- AURORA_HOST / AURORA_PORT / AURORA_DBNAME / DATABASE_USERNAME / DATABASE_PASSWORD
- ORIGIN_VERIFY_SECRET : CloudFront → ALB origin verification

U3 auth additions:
- COGNITO_REGION / COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID / COGNITO_HOSTED_UI_URL
- COGNITO_LOCAL_ISSUER_URL / COGNITO_LOCAL_USERINFO_URL
- MOCK_USER_SUB / MOCK_USER_EMAIL / MOCK_AUTO_USER
- CORS_ALLOWED_ORIGINS / AUTH_BYPASS_PATHS_EXTRA
- JWKS_CACHE_TTL_SECONDS / JWKS_STALE_WHILE_ERROR_SECONDS / USERINFO_CACHE_TTL_SECONDS
"""
from __future__ import annotations

from typing import Literal
from urllib.parse import quote_plus
from uuid import UUID

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["prod", "stg", "dev", "ci"] = "dev"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    app_version: str = "0.1.0"

    # Backend swap (FR-AUTH-05 / FR-HIST-04 / FR-VOICE-01 / FR-AI-01..03)
    storage_backend: Literal["aurora", "docker-postgres", "mock"] = "mock"
    auth_backend: Literal["cognito", "cognito-local", "mock"] = "mock"
    llm_provider: str = "mock"
    voice_backend: Literal["aws", "web-speech-api", "mock"] = "mock"
    event_backend: Literal["eventbridge", "inline-async", "sync"] = "sync"

    # Direct DATABASE_URL (docker-postgres / dev override)
    database_url: str = "sqlite+aiosqlite:///:memory:"  # default for ci/mock (unused if mock backend)

    # Aurora connection parts (本番、Secrets Manager 経由で組み立て)
    aurora_host: str | None = None
    aurora_port: int = 5432
    aurora_dbname: str = "yesman"
    database_username: str = "yesman"
    database_password: str = ""

    # Origin verification (U1)
    origin_verify_secret: str = ""

    # Observability — X-Ray daemon (U1 NFR Design §observability)
    # ECS sidecar の AWS X-Ray Daemon は UDP 2000 で listen (デフォルト).
    xray_daemon_address: str = "127.0.0.1:2000"

    # ------------------------------------------------------------------
    # U3 auth (NFR Design §9.1)
    # ------------------------------------------------------------------
    cognito_region: str | None = None
    cognito_user_pool_id: str | None = None
    cognito_app_client_id: str | None = None
    cognito_hosted_ui_url: str | None = None  # https://yesman-prod.auth.ap-northeast-1.amazoncognito.com
    cognito_local_issuer_url: str | None = None  # http://localhost:9229/local_xxx
    cognito_local_userinfo_url: str | None = None  # 任意、未設定で ID Token only mode

    mock_user_sub: UUID = UUID("11111111-1111-1111-1111-111111111111")
    # email-validator>=2.2 が .local 等の reserved TLD を弾くため example.com を採用
    mock_user_email: EmailStr = "test@example.com"  # type: ignore[assignment]
    mock_auto_user: bool = False
    # MOCK 起動時にデモ用の過去 30 日履歴を mock_user_sub に投入する (Yes 比率推移グラフの可視化用)
    mock_seed_demo_decisions: bool = False

    cors_allowed_origins: list[str] = Field(default_factory=list)
    auth_bypass_paths_extra: list[str] = Field(default_factory=list)

    jwks_cache_ttl_seconds: float = 3600.0
    jwks_stale_while_error_seconds: float = 300.0
    userinfo_cache_ttl_seconds: float = 300.0

    # ------------------------------------------------------------------
    # U4 decision (NFR Design §9 + Infra Design §1)
    # ------------------------------------------------------------------
    bedrock_region: str = "ap-northeast-1"
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    bedrock_guardrail_id: str = ""
    bedrock_guardrail_version: str = "DRAFT"

    # LiteLLM 経由の OpenAI 互換 proxy (opencode.ai/zen, etc) 用設定
    # LLM_PROVIDER=litellm の時に使用
    litellm_base_url: str | None = None
    litellm_api_key: str = ""
    litellm_model: str = "gpt-4o-mini"

    # Claude CLI provider (LLM_PROVIDER=claude-cli) - Anthropic 公式 CLI を subprocess で起動
    # `which claude` でインストール確認、`claude --version` で 2.x 以上推奨
    claude_cli_path: str = "claude"
    # model alias (sonnet/opus/haiku) または完全名 (claude-sonnet-4-6 等)。未指定で CLI default
    claude_cli_model: str | None = None
    # 追加 CLI 引数 (任意、例: ["--allowed-tools", "Read"])
    claude_cli_extra_args: list[str] = Field(default_factory=list)

    decision_llm_timeout_seconds: float = 30.0
    decision_llm_stream_initial_timeout_seconds: float = 5.0
    decision_llm_stream_total_timeout_seconds: float = 120.0
    decision_llm_per_persona_timeout_seconds: float = 30.0
    """spec 2026-05-21 parallel-persona-consensus §6: persona 単発 LLM call の timeout."""
    decision_llm_proposal_timeout_seconds: float = 20.0
    """spec 2026-05-21 parallel-persona-consensus §6: proposal LLM call の timeout."""
    decision_llm_retry_count: int = 1
    nudge_generation_enabled: bool = True
    nudge_cache_ttl_seconds: float = 600.0
    event_bus_name: str = ""
    silence_hash_salt: str = ""

    # ------------------------------------------------------------------
    # U5 / learning (NFR Design §7)
    # ------------------------------------------------------------------
    learning_consumer_enabled: bool = True
    learning_long_poll_seconds: int = 5
    learning_retry_sleep_seconds: float = 30.0
    learning_supervisor_backoff_max_seconds: float = 300.0
    # U1 ApiStack で `DECISION_EVENTS_QUEUE_URL` を ECS Task environment に注入済 (既存).
    # AppConfig 側は受け取り側で default は空文字 → eventbridge + consumer_enabled で validate_runtime が必須化.
    decision_events_queue_url: str = ""

    # ------------------------------------------------------------------
    # U-Persona (Infra Design §1 / NFR Req SEC-UP-04)
    # ------------------------------------------------------------------
    persona_anonymizer_salt: str = ""
    persona_report_auto_block_threshold: int = 5
    persona_moderator_llm_timeout_seconds: float = 5.0

    # ------------------------------------------------------------------
    # U6 voice (Infra Design §1, NFR Req §7)
    # voice_backend は既に上部で定義済 ("aws" / "web-speech-api" / "mock")
    # ------------------------------------------------------------------
    polly_voice_id: str = "Takumi"           # Polly Neural × ja-JP (NFR Design §4.1.1)
    polly_engine: str = "neural"
    polly_region: str = "ap-northeast-1"
    transcribe_region: str = "ap-northeast-1"
    voice_s3_bucket: str = ""                # aws 時必須化、validate_runtime で検証
    voice_tts_presigned_ttl_seconds: int = 3600  # NFR Req SEC-U6-05 (max 3600)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def assemble_database_url(self) -> str:
        """Aurora モード時は parts から URL を組み立てる、それ以外は database_url を返す。"""
        if self.storage_backend == "aurora" and self.aurora_host:
            return (
                f"postgresql+asyncpg://{self.database_username}:{quote_plus(self.database_password)}"
                f"@{self.aurora_host}:{self.aurora_port}/{self.aurora_dbname}"
            )
        return self.database_url

    def validate_runtime(self) -> None:
        """起動時の条件付き必須バリデーション (AVAIL-U3-03 / SEC-U3-11)。

        - Mock backend は dev/ci 環境限定 (SEC-U3-11)
        - cognito backend は COGNITO_* 4 個必須 (Imp3)
        - cognito-local backend は issuer + app_client_id 必須
        - 本番 cognito は HTTPS 必須
        - 本番は CORS_ALLOWED_ORIGINS 必須

        失敗時は RuntimeError を raise → lifespan fail-fast → ECS タスク起動失敗。
        """
        if self.auth_backend == "mock" and self.app_env not in {"dev", "ci"}:
            raise RuntimeError(
                f"AUTH_BACKEND=mock is not allowed when APP_ENV={self.app_env!r}. "
                "Only dev/ci environments may use mock backend."
            )
        if self.auth_backend == "cognito":
            missing = [
                k
                for k in (
                    "cognito_region",
                    "cognito_user_pool_id",
                    "cognito_app_client_id",
                    "cognito_hosted_ui_url",
                )
                if not getattr(self, k)
            ]
            if missing:
                raise RuntimeError(
                    f"AUTH_BACKEND=cognito requires environment variables: {missing}"
                )
            if self.cognito_hosted_ui_url and not self.cognito_hosted_ui_url.startswith("https://"):
                raise RuntimeError("COGNITO_HOSTED_UI_URL must use https in cognito mode")
        if self.auth_backend == "cognito-local":
            if not self.cognito_local_issuer_url:
                raise RuntimeError("AUTH_BACKEND=cognito-local requires COGNITO_LOCAL_ISSUER_URL")
            if not self.cognito_app_client_id:
                raise RuntimeError("AUTH_BACKEND=cognito-local requires COGNITO_APP_CLIENT_ID")
        if self.app_env == "prod" and not self.cors_allowed_origins:
            raise RuntimeError("CORS_ALLOWED_ORIGINS must be set in production")

        # U4 / decision (NFR Design §9 + NFR Req AVAIL-U4-09)
        if self.llm_provider == "mock" and self.app_env not in {"dev", "ci"}:
            raise RuntimeError(
                f"LLM_PROVIDER=mock is not allowed when APP_ENV={self.app_env!r}. "
                "Only dev/ci environments may use mock LLM."
            )
        if self.app_env == "prod" and not self.silence_hash_salt:
            raise RuntimeError(
                "SILENCE_HASH_SALT must be set in production (NFR Req SEC-U4-03)"
            )
        if self.event_backend == "eventbridge" and not self.event_bus_name:
            raise RuntimeError(
                "EVENT_BACKEND=eventbridge requires EVENT_BUS_NAME"
            )

        # U5 / learning (NFR Req AVAIL-U5-09 + EXT-U5-03)
        if (
            self.event_backend == "eventbridge"
            and self.learning_consumer_enabled
            and not self.decision_events_queue_url
        ):
            raise RuntimeError(
                "LEARNING_CONSUMER_ENABLED=true with EVENT_BACKEND=eventbridge "
                "requires DECISION_EVENTS_QUEUE_URL (NFR Req EXT-U5-03)"
            )

        # U-Persona (NFR Req SEC-UP-04 / Infra Design §1)
        if self.app_env == "prod" and not self.persona_anonymizer_salt:
            raise RuntimeError(
                "PERSONA_ANONYMIZER_SALT must be set in production (NFR Req SEC-UP-04)"
            )
        if self.persona_report_auto_block_threshold < 1:
            raise RuntimeError(
                "PERSONA_REPORT_AUTO_BLOCK_THRESHOLD must be >= 1"
            )

        # U6 voice (NFR Req §7 / Infra Design §1)
        if self.voice_backend == "aws":
            if not self.voice_s3_bucket:
                raise RuntimeError(
                    "VOICE_BACKEND=aws requires VOICE_S3_BUCKET (NFR Req §7)"
                )
            if self.voice_tts_presigned_ttl_seconds > 3600:
                raise RuntimeError(
                    "VOICE_TTS_PRESIGNED_TTL_SECONDS must be <= 3600 (NFR Req SEC-U6-05)"
                )


_config: AppConfig | None = None


def get_config() -> AppConfig:
    """Lazy singleton accessor."""
    global _config
    if _config is None:
        _config = AppConfig()
    return _config


def reset_config_cache() -> None:
    """Process-wide singleton をクリア (test fixture 用).

    複数の conftest で APP_ENV/AUTH_BACKEND 等を切り替える場合、
    本関数で `_config` をクリアしてから再 `get_config()` で env から再構築.
    Production code path では呼び出さないこと.
    """
    global _config
    _config = None


__all__ = ["AppConfig", "get_config", "reset_config_cache"]
