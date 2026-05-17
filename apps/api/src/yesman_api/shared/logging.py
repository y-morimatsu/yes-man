"""Structured logging helper using structlog + stdlib logging.

JSON output integrates with CloudWatch Logs / aws-xray for production observability.
Audit events (SEC-U3-10) follow the `audit.{entity}.{action}` 3-segment naming convention.
"""
from __future__ import annotations

import logging
from typing import Any

import structlog


def configure_logging(*, level: str = "INFO") -> None:
    """Configure structlog + stdlib logging.

    Idempotent — safe to call multiple times. Called once from lifespan startup.
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


def get_logger(name: str | None = None) -> Any:
    """Return a bound logger. Type intentionally `Any` to avoid structlog version drift."""
    return structlog.get_logger(name)


def audit_log(event: str, **fields: Any) -> None:
    """Emit a structured audit event.

    SEC-U3-10: audit events must NEVER include the raw email value.
    Only `sub` and other safe metadata go in `**fields`.

    Examples:
        audit_log("audit.profile.updated", sub=user.sub, backend=user.backend,
                  changed_fields=["age_group", "occupation"])
        audit_log("audit.profile.deleted", sub=user.sub, backend=user.backend)
    """
    get_logger("audit").info(event, **fields)


__all__ = ["configure_logging", "get_logger", "audit_log"]
