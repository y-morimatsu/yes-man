"""Test for apps/api/scripts/generate_quick_start_templates.py.

Mock litellm.acompletion at the import path used by the script (`litellm` global).
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

_SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "generate_quick_start_templates.py"


def _load_script_module() -> Any:
    """Load the script as a module so we can call _generate_pool / _write_pool directly."""
    spec = importlib.util.spec_from_file_location(
        "generate_quick_start_templates_under_test", _SCRIPT_PATH
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def script_module() -> Any:
    return _load_script_module()


def _make_valid_pool_json(count: int = 3) -> str:
    """Build a syntactically-valid JSON string for the LLM happy path."""
    templates = [
        {
            "id": f"topic-{i}",
            "title": f"トピック {i}",
            "hours": [12, 13],
            "dayKind": "any",
            "preferenceTag": None,
            "priority": 80 - i,
        }
        for i in range(count)
    ]
    payload: dict[str, Any] = {
        "templates": templates,
        "catchAll": {
            "id": "catch-all",
            "title": "今 もっとも 気になっていること",
            "hours": [],
            "dayKind": "any",
            "preferenceTag": None,
            "priority": 10,
        },
    }
    return json.dumps(payload, ensure_ascii=False)


def _stub_acompletion(*responses: str):
    """Create an async callable returning the given responses in order."""
    queue = list(responses)

    async def _impl(**_kwargs: Any) -> dict[str, Any]:
        if not queue:
            raise AssertionError("acompletion called more times than expected")
        content = queue.pop(0)
        return {"choices": [{"message": {"content": content}}]}

    return _impl


@pytest.fixture
def fake_litellm(monkeypatch: pytest.MonkeyPatch):
    """Install a fake `litellm` module that captures acompletion calls."""

    class _FakeModule:
        aws_region_name: str | None = None
        acompletion = staticmethod(_stub_acompletion(_make_valid_pool_json()))

    monkeypatch.setitem(sys.modules, "litellm", _FakeModule)
    return _FakeModule


def test_happy_path_generates_pool(
    script_module: Any, fake_litellm: Any, tmp_path: Path
) -> None:
    fake_litellm.acompletion = _stub_acompletion(_make_valid_pool_json(count=3))

    import asyncio

    pool = asyncio.run(
        script_module._generate_pool(model="test-model", region="ap-northeast-1", count=3)
    )

    assert len(pool.templates) == 3
    assert pool.catchAll.id == "catch-all"
    assert pool.generatedBy == "test-model"
    assert pool.schemaVersion == 1

    out = tmp_path / "out.json"
    script_module._write_pool(pool, out)
    written = json.loads(out.read_text(encoding="utf-8"))
    assert written["templates"][0]["id"] == "topic-0"
    assert written["catchAll"]["title"] == "今 もっとも 気になっていること"


def test_retries_on_invalid_json_then_succeeds(
    script_module: Any, fake_litellm: Any
) -> None:
    fake_litellm.acompletion = _stub_acompletion(
        "this is not json",
        _make_valid_pool_json(count=2),
    )

    import asyncio

    pool = asyncio.run(
        script_module._generate_pool(model="test-model", region="ap-northeast-1", count=2)
    )
    assert len(pool.templates) == 2


def test_retries_on_schema_violation_then_succeeds(
    script_module: Any, fake_litellm: Any
) -> None:
    bad_payload = json.dumps(
        {
            "templates": [
                {  # id is NOT kebab-case
                    "id": "BadID",
                    "title": "x",
                    "hours": [],
                    "dayKind": "any",
                    "priority": 50,
                }
            ],
            "catchAll": {
                "id": "catch-all",
                "title": "気になっていること",
                "hours": [],
                "dayKind": "any",
                "priority": 10,
            },
        }
    )
    fake_litellm.acompletion = _stub_acompletion(bad_payload, _make_valid_pool_json(count=2))

    import asyncio

    pool = asyncio.run(
        script_module._generate_pool(model="test-model", region="ap-northeast-1", count=2)
    )
    assert len(pool.templates) == 2


def test_exhausts_retries_and_raises(script_module: Any, fake_litellm: Any) -> None:
    fake_litellm.acompletion = _stub_acompletion(
        "nope1",
        "nope2",
        "nope3",
    )

    import asyncio

    with pytest.raises(RuntimeError, match="Failed to obtain a valid template pool"):
        asyncio.run(
            script_module._generate_pool(model="test-model", region="ap-northeast-1", count=2)
        )


def test_strip_code_fence(script_module: Any) -> None:
    text = "```json\n{\"a\":1}\n```"
    assert script_module._strip_code_fence(text) == '{"a":1}'

    text2 = '  {"a":1}  '
    assert script_module._strip_code_fence(text2) == '{"a":1}'


def test_seed_pool_is_valid_and_marked(script_module: Any) -> None:
    pool = script_module._build_seed_pool()
    assert len(pool.templates) >= 25
    assert pool.catchAll.priority <= 20
    assert pool.generatedBy == script_module.SEED_GENERATED_BY
    assert pool.schemaVersion == 1
    # ids unique
    ids = [t.id for t in pool.templates] + [pool.catchAll.id]
    assert len(ids) == len(set(ids))


def test_seed_pool_truncation_respected(script_module: Any) -> None:
    pool = script_module._build_seed_pool(count=10)
    assert len(pool.templates) == 10
