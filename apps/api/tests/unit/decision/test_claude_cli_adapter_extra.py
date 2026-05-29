"""Additional unit tests for ClaudeCLIAdapter — stream errors / timeout / complete retry.

subprocess は asyncio.create_subprocess_exec を monkeypatch して網羅する (外部プロセス起動なし)。
"""
from __future__ import annotations

import asyncio
import types

import pytest

from yesman_api.domain.decision.errors import DecisionError
from yesman_api.infrastructure.config import AppConfig
from yesman_api.infrastructure.decision.llm_providers.claude_cli_adapter import (
    ClaudeCLIAdapter,
)


def _cfg(**overrides) -> AppConfig:  # noqa: ANN003
    base = dict(
        llm_provider="claude-cli",
        claude_cli_path="claude",
        decision_llm_retry_count=0,
        decision_llm_timeout_seconds=5.0,
        decision_llm_stream_total_timeout_seconds=5.0,
    )
    base.update(overrides)
    return AppConfig(**base)


async def test_stream_file_not_found(monkeypatch) -> None:  # noqa: ANN001
    async def _raise_fnf(*a, **k):  # noqa: ANN002, ANN003
        raise FileNotFoundError("claude")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _raise_fnf)
    adapter = ClaudeCLIAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        async for _ in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}]):
            pass
    assert ei.value.reason == "llm_unavailable"


async def test_stream_timeout_kills_process(monkeypatch) -> None:  # noqa: ANN001
    class _SlowStdout:
        async def read(self, _n: int) -> bytes:
            await asyncio.sleep(1.0)  # total_timeout (0.01) を超過させる
            return b""

    class _Stdin:
        def write(self, _d: bytes) -> None: ...
        async def drain(self) -> None: ...
        def close(self) -> None: ...

    class _Stderr:
        async def read(self) -> bytes:
            return b""

    proc = types.SimpleNamespace(
        stdin=_Stdin(),
        stdout=_SlowStdout(),
        stderr=_Stderr(),
        returncode=None,
        killed=False,
    )

    def _kill() -> None:
        proc.killed = True
        proc.returncode = -9

    async def _wait() -> int:
        return proc.returncode

    proc.kill = _kill
    proc.wait = _wait

    async def _exec(*a, **k):  # noqa: ANN002, ANN003
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _exec)
    adapter = ClaudeCLIAdapter(_cfg(decision_llm_stream_total_timeout_seconds=0.01))
    with pytest.raises(DecisionError) as ei:
        async for _ in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}]):
            pass
    assert ei.value.reason == "llm_timeout"
    assert proc.killed is True


async def test_complete_retry_then_success(monkeypatch) -> None:  # noqa: ANN001
    counter = {"n": 0}

    async def _exec(*a, **k):  # noqa: ANN002, ANN003
        proc = types.SimpleNamespace(returncode=0)

        async def _communicate(_inp: bytes):  # noqa: ANN202
            counter["n"] += 1
            if counter["n"] == 1:
                raise asyncio.TimeoutError()
            return (b"OK!", b"")

        proc.communicate = _communicate
        return proc

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _exec)
    adapter = ClaudeCLIAdapter(_cfg(decision_llm_retry_count=1))
    out = await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert out == "OK!"
    assert counter["n"] == 2
