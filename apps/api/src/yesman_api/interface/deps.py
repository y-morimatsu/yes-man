"""FastAPI Depends 統合 — RepositoryFactory + RepositoryBundle を request scope で配布。

Pattern:
- app 起動時に RepositoryFactory を 1 個生成 (singleton、startup event)
- 各 request で `bundle: RepositoryBundle = Depends(get_bundle)` を inject
- bundle.profile / bundle.decision ... で各 Repository を取得
"""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends, HTTPException, Request

from yesman_api.application.auth.protocols import AuthBackendAdapter
from yesman_api.application.persistence.protocols import (
    DatabaseHealth,
    DecisionRepository,
    PersonaReportRepository,
    PersonaRepository,
    PreferenceProfileRepository,
    ProfileRepository,
    SilenceLogRepository,
    UserPersonaSelectionRepository,
)
from yesman_api.domain.auth.models import AuthenticatedUser
from yesman_api.infrastructure.config import AppConfig, get_config
from yesman_api.infrastructure.persistence.factory import (
    RepositoryBundle,
    RepositoryFactory,
)


def get_app_config() -> AppConfig:
    return get_config()


def get_factory(request: Request) -> RepositoryFactory:
    """Retrieve the app-scoped RepositoryFactory (set by main.py lifespan)."""
    factory = getattr(request.app.state, "repo_factory", None)
    if factory is None:
        raise RuntimeError(
            "RepositoryFactory not initialized. Check main.py lifespan setup."
        )
    return factory


async def get_bundle(
    factory: RepositoryFactory = Depends(get_factory),
) -> AsyncIterator[RepositoryBundle]:
    """Per-request RepositoryBundle (SqlModel: session + commit/rollback, Mock: shared)."""
    async with factory.bundle() as bundle:
        yield bundle


# --- Individual repository accessors (convenience) ---
def get_profile_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> ProfileRepository:
    return bundle.profile


def get_decision_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> DecisionRepository:
    return bundle.decision


def get_preference_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> PreferenceProfileRepository:
    return bundle.preference


def get_silence_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> SilenceLogRepository:
    return bundle.silence


def get_persona_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> PersonaRepository:
    return bundle.persona


def get_persona_report_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> PersonaReportRepository:
    return bundle.persona_report


def get_user_persona_selection_repo(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> UserPersonaSelectionRepository:
    return bundle.user_persona_selection


def get_db_health(
    bundle: RepositoryBundle = Depends(get_bundle),
) -> DatabaseHealth:
    return bundle.health


# --- Auth accessors (U3) ---
def get_current_user(request: Request) -> AuthenticatedUser:
    """AuthMiddleware が `request.state.user` にセットした AuthenticatedUser を返す.

    middleware の bypass 設定漏れ or 純粋 ASGI テストでセットされていない場合のフォールバックとして 401。
    """
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


def get_auth_adapter(request: Request) -> AuthBackendAdapter:
    """app-scoped AuthBackendAdapter (lifespan で AuthBackendFactory.create() の結果)."""
    adapter = getattr(request.app.state, "auth_adapter", None)
    if adapter is None:
        raise RuntimeError(
            "AuthBackendAdapter not initialized. Check main.py lifespan setup."
        )
    return adapter


# --- Decision accessors (U4 + U5 統合) ---
async def get_decision_engine(
    request: Request,
    bundle: RepositoryBundle = Depends(get_bundle),
):
    """per-request DecisionEngine (RepositoryBundle が request scope のため都度組み立て).

    U5 統合 (Phase A.0b): PreferenceProfileLoader を inject、U4 単体テストは preference_loader=None で動作.

    Demo mode (2026-05-28): email に "morimatsu" を含むユーザーのときだけ
    妻/娘/ワンコ ペルソナを冪等 seed し、LLM を DemoLLMAdapter で包む
    (scripted 合議/深掘り)。非 demo user には一切影響しない。
    """
    from uuid import UUID

    from yesman_api.domain.decision import demo_mode
    from yesman_api.domain.decision.engine import DecisionEngine
    from yesman_api.domain.learning.cold_start import ColdStartEstimator
    from yesman_api.domain.learning.loader import PreferenceProfileLoader

    llm = getattr(request.app.state, "llm_provider", None)
    event_publisher = getattr(request.app.state, "event_publisher", None)
    silence_guard = getattr(request.app.state, "silence_guard", None)
    orchestrator = getattr(request.app.state, "consensus_orchestrator", None)
    if not all((llm, event_publisher, silence_guard, orchestrator)):
        raise RuntimeError("Decision singletons not initialized in main.py lifespan")

    # --- Demo mode: demo user のみ seed + LLM ラップ ---
    _user = getattr(request.state, "user", None)
    if _user is not None and demo_mode.is_demo_user(getattr(_user, "email", None)):
        from yesman_api.infrastructure.decision.llm_providers.demo_adapter import (
            DemoLLMAdapter,
        )

        await demo_mode.ensure_demo_seeded(
            bundle.persona,
            bundle.user_persona_selection,
            UUID(_user.sub),
            decision_repo=bundle.decision,
        )
        llm = DemoLLMAdapter(llm)
    cold_start = getattr(request.app.state, "cold_start_estimator", None) or ColdStartEstimator()
    preference_loader = PreferenceProfileLoader(
        preference_repo=bundle.preference,
        profile_repo=bundle.profile,
        cold_start=cold_start,
    )
    # v3-γ anonymous-strangers: app.state.anonymous_pool が存在すれば inject
    # (Task 2 で persona_source="anonymous" 経路をサポート、未設定なら builtin only)
    pool_repo = getattr(request.app.state, "anonymous_pool", None)
    return DecisionEngine(
        llm=llm,
        orchestrator=orchestrator,
        silence_guard=silence_guard,
        decision_repo=bundle.decision,
        silence_repo=bundle.silence,
        persona_repo=bundle.persona,
        profile_repo=bundle.profile,
        event_publisher=event_publisher,
        preference_loader=preference_loader,
        selection_repo=bundle.user_persona_selection,
        # Issue #4: Dynamic Persona Routing 用
        preference_repo=bundle.preference,
        # v3-γ anonymous-strangers
        pool_repo=pool_repo,
    )


def get_llm_provider(request: Request):
    adapter = getattr(request.app.state, "llm_provider", None)
    if adapter is None:
        raise RuntimeError("LLMProvider not initialized")
    return adapter


def get_event_publisher(request: Request):
    publisher = getattr(request.app.state, "event_publisher", None)
    if publisher is None:
        raise RuntimeError("EventPublisher not initialized")
    return publisher


def get_nudge_cache(request: Request):
    cache = getattr(request.app.state, "nudge_cache", None)
    if cache is None:
        raise RuntimeError("NudgeCache not initialized")
    return cache


def get_nudge_generator(request: Request):
    gen = getattr(request.app.state, "nudge_generator", None)
    if gen is None:
        raise RuntimeError("NudgeMessageGenerator not initialized")
    return gen


def get_autonomy_scorer(
    decision_repo=Depends(get_decision_repo),
):
    """AutonomyScorer は per-request (decision_repo に依存)."""
    from yesman_api.domain.decision.scorer import AutonomyScorer

    return AutonomyScorer(decision_repo=decision_repo)


# --- Learning accessors (U5) ---
# get_preference_repo は U2 section (line 68) で定義済 (二重定義を解消、I-1 fix)


def get_preference_loader(
    request: Request,
    pref_repo=Depends(get_preference_repo),
    profile_repo=Depends(get_profile_repo),
):
    """per-request PreferenceProfileLoader (U5 ColdStart 一元発火).

    app.state.cold_start_estimator は singleton (main.py lifespan で初期化).
    """
    from yesman_api.domain.learning.cold_start import ColdStartEstimator
    from yesman_api.domain.learning.loader import PreferenceProfileLoader

    cold_start = getattr(request.app.state, "cold_start_estimator", None) or ColdStartEstimator()
    return PreferenceProfileLoader(
        preference_repo=pref_repo,
        profile_repo=profile_repo,
        cold_start=cold_start,
    )


# --- Voice accessors (U6) ---
def get_voice_provider(request: Request):
    """app-scoped VoiceProviderAdapter (lifespan で VoiceProviderFactory.create() の結果)."""
    provider = getattr(request.app.state, "voice_provider", None)
    if provider is None:
        raise RuntimeError(
            "VoiceProvider not initialized. Check main.py lifespan setup."
        )
    return provider


def get_silence_guard(request: Request):
    """app-scoped SilenceGuard (U4 lifespan で初期化済、U6 voice 等で inject 用に新規 export).

    U-Persona の get_persona_catalog 追加と同じ一貫性パターン (NFR Design §7.2 ultrathink I3).
    """
    guard = getattr(request.app.state, "silence_guard", None)
    if guard is None:
        raise RuntimeError(
            "SilenceGuard not initialized. Check main.py lifespan setup."
        )
    return guard


# --- Persona accessors (U-Persona) ---
def get_persona_catalog(
    request: Request,
    bundle: RepositoryBundle = Depends(get_bundle),
):
    """per-request PersonaCatalogService.

    Moderator + anonymizer_salt は app.state singleton で共有,
    persona_repo / selection_repo は per-request の bundle 由来.
    """
    from yesman_api.domain.persona.catalog import PersonaCatalogService

    moderator = getattr(request.app.state, "persona_moderator", None)
    if moderator is None:
        raise RuntimeError("PersonaModerator not initialized in main.py lifespan")
    config = getattr(request.app.state, "config", None) or get_config()
    return PersonaCatalogService(
        persona_repo=bundle.persona,
        selection_repo=bundle.user_persona_selection,
        moderator=moderator,
        anonymizer_salt=config.persona_anonymizer_salt,
    )


__all__ = [
    "get_app_config",
    "get_factory",
    "get_bundle",
    "get_profile_repo",
    "get_decision_repo",
    "get_preference_repo",
    "get_silence_repo",
    "get_persona_repo",
    "get_persona_report_repo",
    "get_user_persona_selection_repo",
    "get_db_health",
    "get_current_user",
    "get_auth_adapter",
    "get_decision_engine",
    "get_llm_provider",
    "get_event_publisher",
    "get_nudge_cache",
    "get_nudge_generator",
    "get_autonomy_scorer",
    "get_preference_loader",
    "get_persona_catalog",
    "get_voice_provider",
    "get_silence_guard",
]
