"""Unit tests for ConsumerSupervisor (infrastructure/learning/supervisor.py).

run_consumer / stop_consumer を fake coroutine に差し替え、正常終了・クラッシュ後の
backoff 待機・stop による graceful 停止を、実 SQS なしで検証する。
"""
from __future__ import annotations

import asyncio

from yesman_api.infrastructure.learning.supervisor import ConsumerSupervisor


async def test_normal_completion_stops_supervisor() -> None:
    ran = asyncio.Event()

    async def _run() -> None:
        ran.set()  # 正常終了 (consumer が stop_event 経由で抜けた想定)

    async def _stop() -> None:
        pass

    sup = ConsumerSupervisor(run_consumer=_run, stop_consumer=_stop)
    await sup.start()
    assert sup._task is not None
    await asyncio.wait_for(sup._task, timeout=2.0)  # _supervise が break して完了
    assert ran.is_set()
    await sup.stop()


async def test_crash_then_stop_breaks_backoff() -> None:
    calls = {"n": 0}

    async def _run() -> None:
        calls["n"] += 1
        raise RuntimeError("consumer crashed")

    stopped = {"v": False}

    async def _stop() -> None:
        stopped["v"] = True

    sup = ConsumerSupervisor(
        run_consumer=_run, stop_consumer=_stop, backoff_max_seconds=300.0
    )
    await sup.start()
    # run() がクラッシュして backoff 待機に入るのを待つ
    await asyncio.sleep(0.05)
    await sup.stop()  # stop_supervisor を立て backoff の wait を解除させる
    assert calls["n"] >= 1
    assert stopped["v"] is True
    assert sup._task is not None and sup._task.done()
