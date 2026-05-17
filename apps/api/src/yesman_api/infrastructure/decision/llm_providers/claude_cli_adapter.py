"""ClaudeCLIAdapter — Anthropic 公式 Claude Code CLI (`claude` コマンド) を subprocess
経由で呼ぶ LLM provider.

NFR Design §2 LLMProviderAdapter Protocol 準拠 (complete + stream + aclose).
SDK / HTTP 経由ではなく、開発機にインストール済の `claude` を spawn する形態のため、
LiteLLM / Bedrock の API key 不要、ローカル開発の "つなぎ" 用途に最適.

設定:
    LLM_PROVIDER          = "claude-cli"
    CLAUDE_CLI_PATH       = "claude"        # PATH 上の binary 名 or 絶対パス
    CLAUDE_CLI_MODEL      = "sonnet"        # 任意、未指定で CLI default
    CLAUDE_CLI_EXTRA_ARGS = []              # 任意の追加 flag

実装方針:
- 起動方式 : per-call `asyncio.create_subprocess_exec` (cold start ~1s 許容)
- system   : `--system-prompt <text>` で **override** (Claude Code default coding-assistant prompt を
             置換、合議用 pure LLM として動作). `--append-system-prompt` は使わない (coding prompt
             の末尾に append されるため persona 演技が coding context に汚染される)
- 認証     : claude CLI の OAuth subscription / keychain 認証をそのまま流用 (ANTHROPIC_API_KEY
             不要). `--bare` flag は付けない (bare では keychain を読まずに API key 必須になる).
             副作用として CLAUDE.md / hooks / plugin sync は読まれるが、`--system-prompt` で
             override しているため LLM の system prompt には混入しない (cwd の coding context は
             ユーザー prompt 側に少量混入する余地はあるが、persona 出力品質には実害なし)
- user     : stdin pipe で投入 (ARG_MAX 制約回避、shell injection 不可)
- complete : `--output-format text`、stdout 全文取得
- stream   : `--output-format text` + stdout 256 byte chunk read で逐次 yield
- timeout  : asyncio.timeout で I/O キャンセル保証
- error    : exit code != 0 → DecisionError("llm_unavailable")
             TimeoutError       → DecisionError("llm_timeout")
             FileNotFoundError  → DecisionError("llm_unavailable", "claude CLI not found")

セキュリティ:
- shell=False (`create_subprocess_exec` は配列 argv 必須)、shell metachar injection 不可
- system / user 共に subprocess の独立 fd 経由、Python 側で escape 不要
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from yesman_api.domain.decision.errors import DecisionError
from yesman_api.infrastructure.config import AppConfig


# stdout chunk size: claude CLI は text mode で文字単位 flush しないが、
# 256 byte 単位で読めば SSE の chunk として体感的に streaming 感が出る.
_STDOUT_CHUNK_SIZE = 256


class ClaudeCLIAdapter:
    provider_name = "claude-cli"

    def __init__(self, config: AppConfig) -> None:
        if not config.claude_cli_path:
            raise RuntimeError(
                "CLAUDE_CLI_PATH is required when LLM_PROVIDER=claude-cli"
            )
        self._cfg = config

    # ----------------------------------------------------------------
    # 内部ヘルパ
    # ----------------------------------------------------------------
    @staticmethod
    def _build_user_content(messages: list[dict[str, str]]) -> str:
        """messages 配列 (role + content) を単一 prompt に combine.

        claude -p mode は単一 user prompt のみ。multi-turn は将来検討.
        system role は --append-system-prompt 側で渡すため除外.
        """
        parts: list[str] = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if role == "system":
                continue  # --append-system-prompt 側で渡す
            if role == "assistant":
                parts.append(f"[前回の AI 応答]\n{content}")
            else:
                parts.append(content)
        return "\n\n".join(parts)

    def _build_cmd(self, *, output_format: str, system: str) -> list[str]:
        cmd: list[str] = [
            self._cfg.claude_cli_path,
            "-p",
            "--output-format",
            output_format,
            "--system-prompt",  # default coding prompt を override (append ではない)
            system,
        ]
        if self._cfg.claude_cli_model:
            cmd += ["--model", self._cfg.claude_cli_model]
        cmd += list(self._cfg.claude_cli_extra_args)
        return cmd

    # ----------------------------------------------------------------
    # complete (non-streaming)
    # ----------------------------------------------------------------
    async def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,  # claude CLI に temperature flag は無いため無視
    ) -> str:
        timeout_seconds = self._cfg.decision_llm_timeout_seconds
        user_content = self._build_user_content(messages)
        cmd = self._build_cmd(output_format="text", system=system)

        for attempt in range(self._cfg.decision_llm_retry_count + 1):
            try:
                async with asyncio.timeout(timeout_seconds):
                    proc = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                    stdout, stderr = await proc.communicate(
                        user_content.encode("utf-8")
                    )
                if proc.returncode != 0:
                    raise DecisionError(
                        "llm_unavailable",
                        detail=(
                            f"claude CLI exit {proc.returncode}: "
                            f"{stderr.decode('utf-8', errors='replace')[:400]}"
                        ),
                    )
                return stdout.decode("utf-8", errors="replace").strip()
            except asyncio.TimeoutError as exc:
                if attempt == self._cfg.decision_llm_retry_count:
                    raise DecisionError("llm_timeout", detail=str(exc)) from exc
                await asyncio.sleep(0.2)
            except FileNotFoundError as exc:
                raise DecisionError(
                    "llm_unavailable",
                    detail=f"claude CLI not found: {self._cfg.claude_cli_path}",
                ) from exc
        raise RuntimeError("unreachable")

    # ----------------------------------------------------------------
    # stream (chunked text)
    # ----------------------------------------------------------------
    async def stream(
        self,
        *,
        system: str,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        total_timeout = self._cfg.decision_llm_stream_total_timeout_seconds
        user_content = self._build_user_content(messages)
        cmd = self._build_cmd(output_format="text", system=system)

        proc: asyncio.subprocess.Process | None = None
        try:
            async with asyncio.timeout(total_timeout):
                try:
                    proc = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdin=asyncio.subprocess.PIPE,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )
                except FileNotFoundError as exc:
                    raise DecisionError(
                        "llm_unavailable",
                        detail=f"claude CLI not found: {self._cfg.claude_cli_path}",
                    ) from exc

                if proc.stdin is None or proc.stdout is None:
                    raise DecisionError(
                        "llm_unavailable", detail="subprocess pipe setup failed"
                    )

                # user content を stdin へ流し close
                proc.stdin.write(user_content.encode("utf-8"))
                await proc.stdin.drain()
                proc.stdin.close()

                # stdout を chunk 単位で read → 逐次 yield
                # claude CLI は text mode で response を progressive 出力するため、
                # UTF-8 multibyte 中断防止に IncrementalDecoder を使う.
                import codecs

                decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
                while True:
                    chunk = await proc.stdout.read(_STDOUT_CHUNK_SIZE)
                    if not chunk:
                        break
                    text = decoder.decode(chunk)
                    if text:
                        yield text
                # 残バッファを flush
                tail = decoder.decode(b"", final=True)
                if tail:
                    yield tail

                await proc.wait()
                if proc.returncode != 0:
                    stderr_bytes = b""
                    if proc.stderr is not None:
                        stderr_bytes = await proc.stderr.read()
                    raise DecisionError(
                        "llm_unavailable",
                        detail=(
                            f"claude CLI exit {proc.returncode}: "
                            f"{stderr_bytes.decode('utf-8', errors='replace')[:400]}"
                        ),
                    )
        except asyncio.TimeoutError as exc:
            # timeout 時は subprocess を確実に kill (orphan 化防止)
            if proc is not None and proc.returncode is None:
                try:
                    proc.kill()
                    await proc.wait()
                except ProcessLookupError:
                    pass
            raise DecisionError(
                "llm_timeout",
                detail=f"claude CLI stream total timeout {total_timeout}s",
            ) from exc

    # ----------------------------------------------------------------
    # aclose
    # ----------------------------------------------------------------
    async def aclose(self) -> None:
        # subprocess は per-call で起動・終了するため明示 close 不要
        return None


__all__ = ["ClaudeCLIAdapter"]
