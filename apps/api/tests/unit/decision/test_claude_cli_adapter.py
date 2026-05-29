"""Unit tests for ClaudeCLIAdapter (infrastructure/decision/llm_providers/claude_cli_adapter.py).

subprocess は `asyncio.create_subprocess_exec` を monkeypatch して fake proc に差し替え、
外部プロセスを起動せずに complete / stream / error / timeout を網羅する。
"""
from __future__ import annotations

import asyncio

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
        claude_cli_model="sonnet",
        decision_llm_retry_count=0,
        decision_llm_timeout_seconds=5.0,
        decision_llm_stream_total_timeout_seconds=5.0,
    )
    base.update(overrides)
    return AppConfig(**base)


# ============================================================
# __init__ / helpers
# ============================================================
def test_init_requires_cli_path() -> None:
    with pytest.raises(RuntimeError, match="CLAUDE_CLI_PATH"):
        ClaudeCLIAdapter(_cfg(claude_cli_path=""))


def test_build_user_content_filters_system_and_marks_assistant() -> None:
    out = ClaudeCLIAdapter._build_user_content(
        [
            {"role": "system", "content": "SYS"},
            {"role": "assistant", "content": "前回"},
            {"role": "user", "content": "今回"},
        ]
    )
    assert "SYS" not in out
    assert "[前回の AI 応答]" in out
    assert "今回" in out


def test_build_cmd_includes_model_and_extra_args() -> None:
    adapter = ClaudeCLIAdapter(_cfg(claude_cli_extra_args=["--allowed-tools", "Read"]))
    cmd = adapter._build_cmd(output_format="text", system="be a persona")
    assert cmd[0] == "claude"
    assert "--system-prompt" in cmd and "be a persona" in cmd
    assert "--model" in cmd and "sonnet" in cmd
    assert cmd[-2:] == ["--allowed-tools", "Read"]


# ============================================================
# Fake subprocess primitives
# ============================================================
class _FakeCompleteProc:
    def __init__(self, *, stdout: bytes, stderr: bytes, returncode: int) -> None:
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode

    async def communicate(self, _input: bytes) -> tuple[bytes, bytes]:
        return self._stdout, self._stderr


def _patch_exec(monkeypatch, factory) -> None:  # noqa: ANN001
    async def _fake_exec(*args, **kwargs):  # noqa: ANN002, ANN003
        return factory()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _fake_exec)


# ============================================================
# complete
# ============================================================
async def test_complete_success(monkeypatch) -> None:  # noqa: ANN001
    _patch_exec(
        monkeypatch,
        lambda: _FakeCompleteProc(stdout="  提案です  ".encode(), stderr=b"", returncode=0),
    )
    adapter = ClaudeCLIAdapter(_cfg())
    out = await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert out == "提案です"


async def test_complete_nonzero_exit_raises(monkeypatch) -> None:  # noqa: ANN001
    _patch_exec(
        monkeypatch,
        lambda: _FakeCompleteProc(stdout=b"", stderr=b"boom", returncode=1),
    )
    adapter = ClaudeCLIAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_unavailable"


async def test_complete_file_not_found_raises(monkeypatch) -> None:  # noqa: ANN001
    async def _raise_fnf(*a, **k):  # noqa: ANN002, ANN003
        raise FileNotFoundError("claude")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _raise_fnf)
    adapter = ClaudeCLIAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_unavailable"


async def test_complete_timeout_raises(monkeypatch) -> None:  # noqa: ANN001
    async def _raise_timeout(*a, **k):  # noqa: ANN002, ANN003
        raise asyncio.TimeoutError()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _raise_timeout)
    adapter = ClaudeCLIAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        await adapter.complete(system="s", messages=[{"role": "user", "content": "x"}])
    assert ei.value.reason == "llm_timeout"


# ============================================================
# stream
# ============================================================
class _FakeStdin:
    def write(self, _data: bytes) -> None:
        pass

    async def drain(self) -> None:
        pass

    def close(self) -> None:
        pass


class _FakeStdout:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = list(chunks)

    async def read(self, _n: int) -> bytes:
        return self._chunks.pop(0) if self._chunks else b""


class _FakeStderr:
    def __init__(self, data: bytes = b"") -> None:
        self._data = data

    async def read(self) -> bytes:
        return self._data


class _FakeStreamProc:
    def __init__(self, *, chunks: list[bytes], returncode: int, stderr: bytes = b"") -> None:
        self.stdin = _FakeStdin()
        self.stdout = _FakeStdout(chunks)
        self.stderr = _FakeStderr(stderr)
        self.returncode = returncode

    async def wait(self) -> int:
        return self.returncode


async def test_stream_success(monkeypatch) -> None:  # noqa: ANN001
    _patch_exec(
        monkeypatch,
        lambda: _FakeStreamProc(chunks=["こん".encode(), "にちは".encode()], returncode=0),
    )
    adapter = ClaudeCLIAdapter(_cfg())
    collected = [
        c async for c in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}])
    ]
    assert "".join(collected) == "こんにちは"


async def test_stream_nonzero_exit_raises(monkeypatch) -> None:  # noqa: ANN001
    _patch_exec(
        monkeypatch,
        lambda: _FakeStreamProc(chunks=[b"partial"], returncode=2, stderr=b"err"),
    )
    adapter = ClaudeCLIAdapter(_cfg())
    with pytest.raises(DecisionError) as ei:
        async for _ in adapter.stream(system="s", messages=[{"role": "user", "content": "x"}]):
            pass
    assert ei.value.reason == "llm_unavailable"


async def test_aclose_noop() -> None:
    adapter = ClaudeCLIAdapter(_cfg())
    assert await adapter.aclose() is None
