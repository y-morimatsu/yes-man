"""ConsumerSupervisor — Consumer の永続継続 (exponential backoff cap 300s).

NFR Design §5 + ultrathink NFR Req I1 (max 3 回固定 → exponential backoff 永続継続) +
ultrathink NFR Design I3 (Python 3.11+ asyncio.timeout) 反映.
"""
from __future__ import annotations

import asyncio
from typing import Awaitable, Callable

from yesman_api.shared.logging import get_logger


class ConsumerSupervisor:
    def __init__(
        self,
        *,
        run_consumer: Callable[[], Awaitable[None]],
        stop_consumer: Callable[[], Awaitable[None]],
        backoff_max_seconds: float = 300.0,
    ) -> None:
        self._run = run_consumer
        self._stop = stop_consumer
        self._backoff_max = backoff_max_seconds
        self._task: asyncio.Task | None = None
        self._stop_supervisor = asyncio.Event()
        self._logger = get_logger("learning.supervisor")

    async def start(self) -> None:
        self._task = asyncio.create_task(self._supervise())

    async def stop(self) -> None:
        self._stop_supervisor.set()
        await self._stop()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=10.0)
            except asyncio.TimeoutError:
                self._task.cancel()

    async def _supervise(self) -> None:
        """exponential backoff で永続継続 (60 → 120 → 240 → 300 cap, 上限なし).

        ultrathink NFR Design I3: Python 3.11+ asyncio.timeout context manager で
        cancel 挙動を明確化.
        """
        backoff = 60.0
        while not self._stop_supervisor.is_set():
            try:
                await self._run()
                # 正常終了 (stop_event 経由): supervisor も停止
                break
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._logger.error(
                    "consumer.crashed", error=str(exc), backoff=backoff
                )
                # exponential backoff cap (60 → 120 → 240 → 300 cap)
                try:
                    async with asyncio.timeout(backoff):
                        await self._stop_supervisor.wait()
                    # stop_supervisor 立ったら抜ける
                    break
                except TimeoutError:
                    pass
                backoff = min(backoff * 2, self._backoff_max)


__all__ = ["ConsumerSupervisor"]
