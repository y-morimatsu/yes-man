"""GET /health — liveness + DB readiness check (U2 担当範囲、ALB target group の health check 用)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from yesman_api.application.persistence.protocols import DatabaseHealth
from yesman_api.infrastructure.config import AppConfig
from yesman_api.interface.deps import get_app_config, get_db_health

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(
    response: Response,
    config: AppConfig = Depends(get_app_config),
    db_health: DatabaseHealth = Depends(get_db_health),
) -> dict[str, object]:
    """Returns 200 with detail when DB ping succeeds, 503 otherwise."""
    db_ok = False
    try:
        db_ok = await db_health.ping()
    except Exception:
        db_ok = False

    payload: dict[str, object] = {
        "status": "ok" if db_ok else "degraded",
        "version": config.app_version,
        "env": config.app_env,
        "storage_backend": config.storage_backend,
        "db": "up" if db_ok else "down",
    }
    if not db_ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return payload


__all__ = ["router"]
