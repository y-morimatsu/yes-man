"""Contract test — MOCK と SqlModel が同じ Protocol を満たすことを静的+動的に検証.

Protocol は実行時 isinstance チェック不可 (typing.Protocol、@runtime_checkable 未付与)
なので、ここではメソッド存在 + 引数シグネチャ整合を assert で確認する。
"""
from __future__ import annotations

import inspect

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
from yesman_api.infrastructure.persistence.mock_repositories import (
    MockDatabaseHealth,
    MockDecisionRepository,
    MockPersonaReportRepository,
    MockPersonaRepository,
    MockPreferenceProfileRepository,
    MockProfileRepository,
    MockSilenceLogRepository,
    MockUserPersonaSelectionRepository,
)
from yesman_api.infrastructure.persistence.sqlmodel_repositories import (
    SqlModelDatabaseHealth,
    SqlModelDecisionRepository,
    SqlModelPersonaReportRepository,
    SqlModelPersonaRepository,
    SqlModelPreferenceProfileRepository,
    SqlModelProfileRepository,
    SqlModelSilenceLogRepository,
    SqlModelUserPersonaSelectionRepository,
)

PROTOCOL_PAIRS: list[tuple[type, tuple[type, type]]] = [
    (ProfileRepository, (MockProfileRepository, SqlModelProfileRepository)),
    (DecisionRepository, (MockDecisionRepository, SqlModelDecisionRepository)),
    (
        PreferenceProfileRepository,
        (MockPreferenceProfileRepository, SqlModelPreferenceProfileRepository),
    ),
    (SilenceLogRepository, (MockSilenceLogRepository, SqlModelSilenceLogRepository)),
    (PersonaRepository, (MockPersonaRepository, SqlModelPersonaRepository)),
    (
        PersonaReportRepository,
        (MockPersonaReportRepository, SqlModelPersonaReportRepository),
    ),
    (
        UserPersonaSelectionRepository,
        (
            MockUserPersonaSelectionRepository,
            SqlModelUserPersonaSelectionRepository,
        ),
    ),
    (DatabaseHealth, (MockDatabaseHealth, SqlModelDatabaseHealth)),
]


def _protocol_methods(proto: type) -> dict[str, list[str]]:
    """Return {method_name: [param_names]} for protocol methods (public, non-dunder)."""
    result: dict[str, list[str]] = {}
    for name, member in inspect.getmembers(proto):
        if name.startswith("_"):
            continue
        if not callable(member):
            continue
        try:
            sig = inspect.signature(member)
        except (TypeError, ValueError):
            continue
        params = [p for p in sig.parameters if p != "self"]
        result[name] = params
    return result


def _impl_methods(impl_cls: type) -> dict[str, list[str]]:
    """Return public method signatures of an impl class."""
    result: dict[str, list[str]] = {}
    for name, member in inspect.getmembers(impl_cls):
        if name.startswith("_"):
            continue
        if not callable(member):
            continue
        try:
            sig = inspect.signature(member)
        except (TypeError, ValueError):
            continue
        params = [p for p in sig.parameters if p != "self"]
        result[name] = params
    return result


def test_all_protocols_implemented():
    for proto, (mock_cls, sql_cls) in PROTOCOL_PAIRS:
        proto_methods = _protocol_methods(proto)
        for impl in (mock_cls, sql_cls):
            impl_methods = _impl_methods(impl)
            for method_name, proto_params in proto_methods.items():
                assert method_name in impl_methods, (
                    f"{impl.__name__} missing method {method_name} from {proto.__name__}"
                )
                impl_params = impl_methods[method_name]
                # Protocol parameter names should be a subset (impl may add)
                missing = [p for p in proto_params if p not in impl_params]
                assert not missing, (
                    f"{impl.__name__}.{method_name} missing params {missing} "
                    f"from {proto.__name__}.{method_name}"
                )
