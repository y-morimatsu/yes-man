"""YesMan FastAPI app entrypoint (U4 完成版).

U4 で追加:
- LLMProviderFactory + EventPublisherFactory を lifespan で初期化
- SilenceGuard + ConsensusOrchestrator + DecisionEngine + NudgeCache + NudgeMessageGenerator を app.state にバインド
- decisions_router + scores_router を include
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from yesman_api.domain.decision.consensus import ConsensusOrchestrator
from yesman_api.domain.decision.engine import DecisionEngine
from yesman_api.domain.decision.nudge import NudgeCache, NudgeMessageGenerator
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.learning.cold_start import ColdStartEstimator
from yesman_api.domain.persona.moderator import PersonaModerator
from yesman_api.infrastructure.voice.factory import VoiceProviderFactory
from yesman_api.infrastructure.auth.factory import AuthBackendFactory
from yesman_api.infrastructure.config import get_config
from yesman_api.infrastructure.decision.event_publishers.factory import EventPublisherFactory
from yesman_api.infrastructure.decision.llm_providers.factory import LLMProviderFactory
from yesman_api.infrastructure.learning.consumer import DecisionConfirmedConsumer
from yesman_api.infrastructure.learning.supervisor import ConsumerSupervisor
from yesman_api.infrastructure.persistence.factory import RepositoryFactory
from yesman_api.infrastructure.persistence.mock_pool_repository import MockPoolRepository
from yesman_api.interface.http.decisions import router as decisions_router
from yesman_api.interface.http.health import router as health_router
from yesman_api.interface.http.persona_pool import router as persona_pool_router
from yesman_api.interface.http.persona_selections import router as persona_selections_router
from yesman_api.interface.http.personas import router as personas_router
from yesman_api.interface.http.preferences import router as preferences_router
from yesman_api.interface.http.profiles import router as profiles_router
from yesman_api.interface.http.scores import router as scores_router
from yesman_api.interface.http.voice import router as voice_router
from yesman_api.interface.middleware.auth import _LazyAuthMiddleware
from yesman_api.interface.middleware.origin_verify import OriginVerifyMiddleware
from yesman_api.shared.logging import configure_logging, get_logger


# X-Ray 計装 (NFR Design U1 §observability): 依存未インストール環境では skip
try:  # pragma: no cover - 依存環境差を吸収
    from aws_xray_sdk.core import xray_recorder  # type: ignore[import-untyped]
    from aws_xray_sdk.ext.fastapi.middleware import (  # type: ignore[import-untyped]
        XRayMiddleware,
    )

    _XRAY_AVAILABLE = True
except ImportError:  # pragma: no cover
    xray_recorder = None  # type: ignore[assignment]
    XRayMiddleware = None  # type: ignore[assignment]
    _XRAY_AVAILABLE = False


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    config = get_config()
    configure_logging(level=config.log_level)

    # Factory 群
    repo_factory = RepositoryFactory(config)
    auth_factory = AuthBackendFactory(config)
    llm_factory = LLMProviderFactory(config)
    # issue #88: inline-async 時に InlineLearningHandler 経由で
    # preference profile を同一プロセスで更新するため repo_factory を渡す
    event_factory = EventPublisherFactory(config, repo_factory=repo_factory)

    auth_adapter = await auth_factory.create()
    llm_provider = await llm_factory.create()
    event_publisher = await event_factory.create()

    # U4 シングルトン (stateless / process-wide)
    silence_guard = SilenceGuard(llm=llm_provider, salt=config.silence_hash_salt)
    orchestrator = ConsensusOrchestrator()
    nudge_cache = NudgeCache(ttl=config.nudge_cache_ttl_seconds)
    nudge_generator = NudgeMessageGenerator(
        llm=llm_provider,
        cache=nudge_cache,
        enabled=config.nudge_generation_enabled,
    )

    # U-Persona: PersonaModerator は SilenceGuard 流用、app-wide singleton
    persona_moderator = PersonaModerator(silence_guard=silence_guard)

    # U6 voice: VoiceProviderFactory + adapter は app-wide singleton (stateless)
    voice_factory = VoiceProviderFactory(config)
    voice_provider = await voice_factory.create()

    # v3-γ anonymous-strangers: in-memory pool singleton (NFR-1)
    # 1 user only でも合議が成立するよう fixture 4 名分を seed (ja, ライフスタイル別「知り合い」)。
    # SqlModel backend 経路は MVP 未実装、本番化時に追加する TODO は NFR-1 に記録済。
    anonymous_pool = MockPoolRepository(seed_fixtures=True)

    # DecisionEngine は per-request の RepositoryBundle を使うため、
    # ファクトリ参照を保持し handler 内で組み立てる方が綺麗だが、MVP では
    # bundle context manager を回避するため Mock-friendly な薄い wrapper を per-request で生成。
    # → ここでは singleton として decision_engine_factory のような pattern を採らず、
    # handler 経由で DI される際に Bundle を inject する。
    # 簡略化: DecisionEngine も singleton にし、内部で per-request bundle を渡せるよう refactor 余地を残す。

    # 永続化系 (RepositoryBundle) は per-request の DI で取得するため、DecisionEngine は
    # app.state で「Repository factory + その他の依存」を持つラッパーにする。
    # MVP では singleton DecisionEngine を作り、その中で **app-wide な Mock Repo** を使うパターン
    # にするか、handler 内で都度組み立てるかを選択する。
    # 本実装では handler 内で都度組み立てるシンプルパターンを採用 (= DecisionEngine は
    # `get_decision_engine` Depends 内で生成、その代わり nudge_cache 等は app.state)。
    # U5: ColdStartEstimator (singleton, stateless) + 条件付き Consumer Supervisor
    cold_start = ColdStartEstimator()
    consumer_supervisor: ConsumerSupervisor | None = None
    consumer_bundle = None  # Consumer 用 long-lived RepositoryBundle (※下記参照)
    if (
        config.event_backend == "eventbridge"
        and config.learning_consumer_enabled
        and config.decision_events_queue_url
    ):
        # NOTE (NFR Design §8 + Code Gen Plan E.2): Consumer は long-running、
        # request scope の RepositoryBundle context manager と相性悪のため、
        # consumer 用に独立 bundle を lifespan スコープで保持.
        consumer_bundle = await repo_factory.bundle().__aenter__()
        consumer = DecisionConfirmedConsumer(
            queue_url=config.decision_events_queue_url,
            region=config.bedrock_region,
            decision_repo=consumer_bundle.decision,
            preference_repo=consumer_bundle.preference,
            wait_time_seconds=config.learning_long_poll_seconds,
            retry_sleep_seconds=config.learning_retry_sleep_seconds,
        )
        consumer_supervisor = ConsumerSupervisor(
            run_consumer=consumer.run,
            stop_consumer=consumer.stop,
            backoff_max_seconds=config.learning_supervisor_backoff_max_seconds,
        )
        await consumer_supervisor.start()

    # Mock backend + MOCK_SEED_DEMO_DECISIONS=true で、デモ用の過去 30 日履歴を投入
    # (ScoreLineChart の右肩上がりトレンド可視化用)
    if config.mock_seed_demo_decisions and repo_factory.mock_store is not None:
        seeded = repo_factory.mock_store.seed_demo_decisions(user_id=config.mock_user_sub)
        if seeded > 0:
            get_logger("startup").info(
                "mock.seed_demo_decisions",
                user_id=str(config.mock_user_sub),
                seeded_count=seeded,
            )

    app.state.repo_factory = repo_factory
    app.state.auth_factory = auth_factory
    app.state.auth_adapter = auth_adapter
    app.state.llm_factory = llm_factory
    app.state.llm_provider = llm_provider
    app.state.event_factory = event_factory
    app.state.event_publisher = event_publisher
    app.state.silence_guard = silence_guard
    app.state.consensus_orchestrator = orchestrator
    app.state.nudge_cache = nudge_cache
    app.state.nudge_generator = nudge_generator
    app.state.cold_start_estimator = cold_start  # U5
    app.state.consumer_supervisor = consumer_supervisor  # U5 (None 可)
    app.state.persona_moderator = persona_moderator  # U-Persona
    app.state.voice_factory = voice_factory  # U6
    app.state.voice_provider = voice_provider  # U6
    app.state.anonymous_pool = anonymous_pool  # v3-γ anonymous-strangers
    app.state.config = config

    get_logger("startup").info(
        "app.start",
        auth_backend=auth_adapter.backend_name,
        llm_provider=llm_provider.provider_name,
        event_backend=event_publisher.backend_name,
        storage_backend=config.storage_backend,
        learning_consumer=consumer_supervisor is not None,
        app_env=config.app_env,
    )
    try:
        yield
    finally:
        if consumer_supervisor is not None:
            await consumer_supervisor.stop()
        if consumer_bundle is not None:
            # bundle の context manager を手動 close
            try:
                await consumer_bundle.__class__.__aexit__(consumer_bundle, None, None, None)  # type: ignore[attr-defined]
            except Exception:
                pass  # best-effort cleanup
        await voice_factory.dispose()  # U6
        await event_factory.dispose()
        await llm_factory.dispose()
        await auth_factory.dispose()
        await repo_factory.dispose()


def create_app() -> FastAPI:
    config = get_config()
    config.validate_runtime()
    app = FastAPI(
        title="YesMan API",
        version=config.app_version,
        lifespan=lifespan,
    )

    # add_middleware は後勝ち = 外側 (LIFO). request 入口から見た順序:
    #   X-Ray (outermost、全 request の trace) → CORS (OPTIONS 早期応答) →
    #   OriginVerify (CloudFront origin 検証) → Auth (innermost) → app
    app.add_middleware(_LazyAuthMiddleware)
    # OriginVerifyMiddleware: prod のみ、secret 設定済の場合のみ install
    if config.app_env == "prod" and config.origin_verify_secret:
        app.add_middleware(
            OriginVerifyMiddleware,
            expected_secret=config.origin_verify_secret,
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Origin-Verify",
            "X-Client-Version",  # api-client が defaultHeaders に設定 (CORS preflight 通過用)
        ],
    )
    # X-Ray: prod/stg のみ、aws_xray_sdk が利用可能な場合のみ
    if _XRAY_AVAILABLE and config.app_env in ("prod", "stg"):
        xray_recorder.configure(
            service=f"yesman-api-{config.app_env}",
            daemon_address=config.xray_daemon_address,
        )
        app.add_middleware(XRayMiddleware, recorder=xray_recorder)

    app.include_router(health_router)
    app.include_router(profiles_router)
    app.include_router(decisions_router)
    app.include_router(scores_router)
    app.include_router(preferences_router)  # U5
    app.include_router(personas_router)  # U-Persona
    app.include_router(persona_selections_router)  # U-Persona
    app.include_router(voice_router)  # U6
    app.include_router(persona_pool_router)  # v3-γ anonymous-strangers
    return app


app = create_app()


__all__ = ["app", "create_app"]
