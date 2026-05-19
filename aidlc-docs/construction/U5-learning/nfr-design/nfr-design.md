# U5 / learning — NFR Design

**Unit**: U5 / learning
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: U5 FD (10 fixes) + NFR Req (7 fixes)

---

## 0. 位置付け

NFR Req §7 引き継ぎを実装パターンとして具体化する。U4 で確立した Strategy + Factory + Singleton パターンを継承しつつ、U5 固有の SQS Consumer + Supervisor + YAML format を扱う。

| 確定対象 | 担当セクション |
|---|---|
| PreferenceProfileBuilder (純粋関数) | §1 |
| ColdStartEstimator (定数マッピング) | §2 |
| PreferenceProfileLoader (YAML format + ColdStart 一元発火) | §3 |
| SQS Consumer (asyncio.to_thread + boto3) | §4 |
| Supervisor (exponential backoff cap 300s) | §5 |
| YAML format (PyYAML or 手書き) | §6 |
| AppConfig 拡張 + validate_runtime | §7 |
| U4 への遡及修正パターン | §8 |
| 依存ライブラリ | §9 |

---

## 1. PreferenceProfileBuilder (純粋関数)

`apps/api/src/yesman_api/domain/learning/builder.py`

NFR Req EXT-U5-02: **純粋関数** として実装 (副作用なし、入力 PreferenceProfile を deepcopy + 変更 + 返却)。

### 1.1 シグネチャ + 不変条件

```python
import copy
from datetime import datetime, timezone

from yesman_api.domain.persistence.models import Decision, PreferenceProfile


_ACCEPTED_CAP = 100
_REJECTED_CAP = 100
_PERSONA_STYLE_KEY_CAP = 50
_INFERRED_TAGS_CAP = 50
_PERSONA_STYLE_YES_DELTA = 0.1
_PERSONA_STYLE_NO_DELTA = -0.05
_CLIP_LOW = -1.0
_CLIP_HIGH = 1.0


def apply_yes(profile: PreferenceProfile, decision: Decision) -> PreferenceProfile:
    """Yes 採択時の incremental update (純粋関数).

    ultrathink I1 反映 2026-05-16: persona_style_preference の key は **persona_name 文字列**
    (selected_persona_ids = UUID 文字列ではなく、_build_pattern が抽出した persona_names を使う).
    これにより ColdStart の persona_name キーと一貫性確保.
    """
    new_profile = copy.deepcopy(profile)
    pattern = _build_pattern(decision)
    persona_names = pattern["persona_names"]  # ← I1 反映: pattern から取得
    new_profile.accepted_patterns = (new_profile.accepted_patterns + [pattern])[-_ACCEPTED_CAP:]
    new_profile.persona_style_preference = _apply_persona_delta(
        new_profile.persona_style_preference,
        persona_names,
        _PERSONA_STYLE_YES_DELTA,
    )
    new_profile.last_updated_at = datetime.now(timezone.utc)
    return new_profile


def apply_no(profile: PreferenceProfile, decision: Decision) -> PreferenceProfile:
    """No 採択時の incremental update (純粋関数).

    ultrathink I1 反映: persona_names は _build_pattern から取得し統一.
    """
    new_profile = copy.deepcopy(profile)
    pattern = _build_pattern(decision)
    persona_names = pattern["persona_names"]
    new_profile.rejected_patterns = (new_profile.rejected_patterns + [pattern])[-_REJECTED_CAP:]
    new_profile.persona_style_preference = _apply_persona_delta(
        new_profile.persona_style_preference,
        persona_names,
        _PERSONA_STYLE_NO_DELTA,
    )
    # inferred_tags は No では更新しない (傾向ノイズ防止、FD §2.3)
    new_profile.last_updated_at = datetime.now(timezone.utc)
    return new_profile


def _build_pattern(decision: Decision) -> dict:
    """U5 MVP: keywords は空 list (ultrathink FD I2)、将来差替え."""
    persona_names = []
    for utterance in (decision.persona_outputs or {}).get("utterances", []):
        name = utterance.get("persona_name")
        if name:
            persona_names.append(name)
    return {
        "domain": decision.domain_classification,
        "keywords": [],  # MVP: keywords 抽出 skip
        "persona_names": persona_names,
        "weight": 1.0,
        "decision_id": str(decision.id),
        "timestamp": decision.created_at.isoformat(),
    }


def _apply_persona_delta(
    current: dict[str, float],
    persona_names: list[str] | list,
    delta: float,
) -> dict[str, float]:
    """persona_style_preference の更新 + clip [-1.0, 1.0] + 50 key 上限."""
    updated = dict(current)
    for name in persona_names:
        name = str(name)
        score = updated.get(name, 0.0)
        updated[name] = max(_CLIP_LOW, min(_CLIP_HIGH, score + delta))
    # 50 key 上限 (FIFO で古い key を drop、Python 3.7+ dict は挿入順保持)
    if len(updated) > _PERSONA_STYLE_KEY_CAP:
        keys_to_keep = list(updated.keys())[-_PERSONA_STYLE_KEY_CAP:]
        updated = {k: updated[k] for k in keys_to_keep}
    return updated
```

### 1.2 注意点
- `selected_persona_ids` は U2 Decision モデルで `list[str]` (JSONB)、persona_names は `persona_outputs` JSONB の `utterances` から取得 (= 永続化済 LLM 出力 parse 結果)
- `last_updated_at` の **単調増加** は PBT TEST-U5-05 (f) で検証 (`datetime.now(timezone.utc)` が確実に増えることを assertion)

---

## 2. ColdStartEstimator (定数マッピング)

`apps/api/src/yesman_api/domain/learning/cold_start.py`

```python
from datetime import datetime, timezone
from uuid import UUID

from yesman_api.domain.persistence.models import PreferenceProfile, Profile


# ultrathink EXT-U5-01: クラス内定数化、将来 ML モデル差替え可能
_AGE_GROUP_PERSONA_BIAS: dict[str, dict[str, float]] = {
    "10s": {"楽観派": 0.2},
    "20s": {"楽観派": 0.2},
    "50s": {"慎重派": 0.2},
    "60s+": {"慎重派": 0.2},
}

_OCCUPATION_KEYWORDS_BIAS: dict[str, dict[str, float]] = {
    "engineer": {"効率派": 0.3},
    "doctor": {"慎重派": 0.2},
    "designer": {"楽観派": 0.2},
}

_LIFE_STAGE_TAGS: dict[str, list[str]] = {
    "working": ["work-focused"],
    "parenting": ["family-focused"],
    "student": ["study-focused"],
}


class ColdStartEstimator:
    def estimate(self, profile: Profile) -> PreferenceProfile:
        inferred_tags: list[str] = []
        persona_style: dict[str, float] = {}

        # 1. 年齢層 → persona bias
        if profile.age_group and profile.age_group in _AGE_GROUP_PERSONA_BIAS:
            persona_style.update(_AGE_GROUP_PERSONA_BIAS[profile.age_group])

        # 2. 職業キーワード → persona bias
        if profile.occupation:
            occ_lower = profile.occupation.lower()
            for keyword, bias in _OCCUPATION_KEYWORDS_BIAS.items():
                if keyword in occ_lower:
                    for name, delta in bias.items():
                        persona_style[name] = persona_style.get(name, 0.0) + delta

        # 3. 価値観タグ転写
        inferred_tags.extend(profile.value_tags or [])

        # 4. life_stage → ドメインヒント
        if profile.life_stage in _LIFE_STAGE_TAGS:
            inferred_tags.extend(_LIFE_STAGE_TAGS[profile.life_stage])

        # 上限 50 適用
        inferred_tags = list(dict.fromkeys(inferred_tags))[:50]

        return PreferenceProfile(
            user_id=profile.user_id,
            accepted_patterns=[],
            rejected_patterns=[],
            persona_style_preference=persona_style,
            inferred_tags=inferred_tags,
            last_updated_at=datetime.now(timezone.utc),
        )
```

### 2.1 設計判断
- **定数マッピング 3 個** を module-level で公開 (extensibility、テストで差替え容易)
- 価値観タグ重複排除に `dict.fromkeys` を使う (順序保持、Python 3.7+)

---

## 3. PreferenceProfileLoader (YAML format + ColdStart 一元発火)

`apps/api/src/yesman_api/domain/learning/loader.py`

NFR Req I1 反映: **ColdStart 発火は Loader のみ** (Consumer は呼ばない)。

### 3.1 シグネチャ

```python
from datetime import datetime
from uuid import UUID

from yesman_api.application.persistence.protocols import (
    PreferenceProfileRepository,
    ProfileRepository,
)
from yesman_api.domain.learning.cold_start import ColdStartEstimator
from yesman_api.domain.persistence.models import PreferenceProfile


class PreferenceProfileLoader:
    def __init__(
        self,
        *,
        preference_repo: PreferenceProfileRepository,
        profile_repo: ProfileRepository,
        cold_start: ColdStartEstimator,
    ) -> None:
        self._pref_repo = preference_repo
        self._profile_repo = profile_repo
        self._cold_start = cold_start

    async def load(self, user_id: UUID) -> PreferenceProfile:
        """preference を取得、なければ ColdStart で初期化 + upsert + 返却."""
        existing = await self._pref_repo.get(user_id)
        if existing is not None:
            return existing
        profile = await self._profile_repo.get(user_id)
        if profile is None:
            # Profile も無い (= Decision API 経由で Profile auto-create されてない異常系)
            return PreferenceProfile(user_id=user_id)
        estimated = self._cold_start.estimate(profile)
        return await self._pref_repo.upsert(estimated)

    async def load_for_prompt(self, user_id: UUID) -> str:
        """LLM プロンプト注入用 YAML を返す (= U4 連携の主 entry point)."""
        pref = await self.load(user_id)
        return _format_yaml(pref)
```

### 3.2 YAML format 実装

```python
def _format_yaml(pref: PreferenceProfile) -> str:
    """NFR Req PERF-U5-08: < 2KB に収める。手書き format で PyYAML 依存不要."""
    lines = ["# ユーザー嗜好プロファイル"]

    # inferred_tags
    if pref.inferred_tags:
        lines.append(f"inferred_tags: [{', '.join(pref.inferred_tags[:20])}]")

    # preferred_personas (top 5 by abs(score))
    if pref.persona_style_preference:
        top_5 = sorted(
            pref.persona_style_preference.items(),
            key=lambda kv: abs(kv[1]),
            reverse=True,
        )[:5]
        lines.append("preferred_personas:")
        for name, score in top_5:
            sign = "+" if score >= 0 else ""
            lines.append(f"  - {name}: {sign}{score:.2f}")

    # recent_accepted (最新 5 件、domain + persona_names のみ)
    if pref.accepted_patterns:
        lines.append("recent_accepted:")
        for p in pref.accepted_patterns[-5:]:
            domain = p.get("domain", "?")
            names = p.get("persona_names", [])
            lines.append(f'  - {{domain: {domain}, persona_names: {names}}}')

    # rejected はカウントのみ (プロンプト肥大化防止、FD §5.2 サンプル準拠)
    if pref.rejected_patterns:
        lines.append(f"recent_rejected_count: {len(pref.rejected_patterns)}")

    return "\n".join(lines)
```

**注 (ultrathink Imp1 反映)**: `recent_accepted` の `persona_names` 出力は `json.dumps(names, ensure_ascii=False)` で **double-quote 表現** に統一 (YAML parser の flow style 誤読防止)。サンプル:
```yaml
recent_accepted:
  - {domain: daily, persona_names: ["慎重派", "効率派"]}
```
実装側で `persona_names_str = json.dumps(p.get("persona_names", []), ensure_ascii=False)` を使う。

### 3.3 設計判断
- **PyYAML 不採用** (= 依存ツリーを増やさない、ハッカソンスコープでは手書きで十分)
- 出力 size は unit test で < 2KB を assertion (TEST-U5-03)

---

## 4. SQS Consumer (asyncio.to_thread)

`apps/api/src/yesman_api/infrastructure/learning/consumer.py`

### 4.1 構造

```python
import asyncio
import json
from typing import Awaitable, Callable

import boto3

from yesman_api.application.persistence.protocols import (
    DecisionRepository,
    PreferenceProfileRepository,
)
from yesman_api.domain.learning.builder import apply_no, apply_yes
from yesman_api.domain.learning.consumer_payload import DecisionConfirmedPayload
from yesman_api.domain.persistence.models import PreferenceProfile
from yesman_api.shared.logging import get_logger


class DecisionConfirmedConsumer:
    def __init__(
        self,
        *,
        queue_url: str,
        region: str,
        decision_repo: DecisionRepository,
        preference_repo: PreferenceProfileRepository,
        wait_time_seconds: int = 5,
        retry_sleep_seconds: float = 30.0,
    ) -> None:
        self._queue_url = queue_url
        self._session = boto3.session.Session(region_name=region)
        self._client = self._session.client("sqs")
        self._decision_repo = decision_repo
        self._preference_repo = preference_repo
        self._wait_time = wait_time_seconds
        self._retry_sleep = retry_sleep_seconds
        self._stop_event = asyncio.Event()
        self._logger = get_logger("learning.consumer")

    async def run(self) -> None:
        self._logger.info("consumer.start", queue_url=self._queue_url)
        while not self._stop_event.is_set():
            try:
                response = await asyncio.to_thread(
                    self._client.receive_message,
                    QueueUrl=self._queue_url,
                    MaxNumberOfMessages=10,
                    WaitTimeSeconds=self._wait_time,
                )
                messages = response.get("Messages", [])
                for msg in messages:
                    await self._process_message(msg)
            except Exception as exc:
                self._logger.error("consumer.receive_failed", error=str(exc))
                await asyncio.sleep(self._retry_sleep)
        self._logger.info("consumer.stop")

    async def stop(self) -> None:
        self._stop_event.set()

    async def _process_message(self, msg: dict) -> None:
        body_raw = msg.get("Body", "")
        receipt_handle = msg.get("ReceiptHandle")
        try:
            body = json.loads(body_raw)
            payload = DecisionConfirmedPayload.from_sqs_body(body)
        except Exception as exc:
            # ultrathink NFR Req I3: delete しない、redrive policy で DLQ
            self._logger.warning("consumer.parse_failed", error=str(exc), body=body_raw[:200])
            return  # delete しないことで maxReceiveCount 経由で DLQ 移動
        try:
            decision = await self._decision_repo.get(payload.decision_id)
            if decision is None:
                self._logger.warning(
                    "consumer.decision_not_found", decision_id=str(payload.decision_id)
                )
                await self._delete_message(receipt_handle)
                return
            profile = await self._preference_repo.get(payload.user_id)
            if profile is None:
                profile = PreferenceProfile(user_id=payload.user_id)
            if payload.choice == "yes":
                updated = apply_yes(profile, decision)
            else:
                updated = apply_no(profile, decision)
            await self._preference_repo.upsert(updated)
            await self._delete_message(receipt_handle)
        except Exception as exc:
            # DB エラー等: delete しない、visibility timeout で再配送
            self._logger.error(
                "consumer.process_failed",
                decision_id=str(payload.decision_id),
                error=str(exc),
            )

    async def _delete_message(self, receipt_handle: str | None) -> None:
        if receipt_handle is None:
            return
        try:
            await asyncio.to_thread(
                self._client.delete_message,
                QueueUrl=self._queue_url,
                ReceiptHandle=receipt_handle,
            )
        except Exception as exc:
            self._logger.warning("consumer.delete_failed", error=str(exc))
```

### 4.2 設計判断
- `boto3.session.Session(region_name=...)` で独立 Session (U4 EventBridgePublisher と同パターン、thread safety)
- `asyncio.to_thread` で同期 boto3 を非同期化
- parse 失敗時の **delete しない** 挙動 (NFR Req I3): visibility timeout 後に redrive policy で DLQ 移動

### 4.3 N+1 SELECT 問題 (ultrathink NFR Design I2 反映)

`_process_message` 内で 1 メッセージごとに `decision_repo.get(decision_id)` を呼ぶ → 1 receive_messages で最大 10 件取得時、**10 回の SELECT が逐次実行** される。

- **MVP 方針**: **1-by-1 で進める** (ハッカソン規模、PERF-U5-01 < 100ms にも余裕で収まる)
- **将来最適化**: `DecisionRepository.get_many(decision_ids: list[UUID])` を U2 に追加 (1 SQL で取得)、50% レイテンシ削減見込み
- NFR Design § リスク表に「U5 Consumer N+1 → 将来 get_many 化」を注記推奨

---

## 5. Supervisor (exponential backoff cap 300s)

`apps/api/src/yesman_api/infrastructure/learning/supervisor.py`

NFR Req I1 反映: max 回数なし、exponential backoff で永続継続。

```python
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
        """exponential backoff で永続継続 (ultrathink I3 反映: Python 3.11+ asyncio.timeout パターン).

        Python 3.11+ では `asyncio.timeout()` context manager が `asyncio.wait_for` より
        cancel 挙動が明確で、CancelledError 伝搬が予測可能.
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
                self._logger.error("consumer.crashed", error=str(exc), backoff=backoff)
                # exponential backoff cap (60 → 120 → 240 → 300 cap)
                try:
                    async with asyncio.timeout(backoff):  # Python 3.11+ 推奨パターン
                        await self._stop_supervisor.wait()
                    # stop_supervisor 立ったら抜ける
                    break
                except TimeoutError:  # 3.11+ では asyncio.TimeoutError = builtins.TimeoutError
                    pass
                backoff = min(backoff * 2, self._backoff_max)
```

### 5.1 設計判断
- backoff 中も `stop_supervisor` を待ち続ける (`asyncio.wait_for` で sleep + 即時 cancel を両立)
- crash 検知用に CloudWatch metric `learning.consumer.restart_count` を追加 (NFR Req AVAIL-U5-09)、ここではログのみ

---

## 6. YAML format (PyYAML 不採用、手書き)

§3.2 で実装済。**PyYAML を pyproject に追加しない** (依存ツリー軽量化)。

---

## 7. AppConfig 拡張 + validate_runtime

`apps/api/src/yesman_api/infrastructure/config.py` に追加:

```python
# U5 / learning (NFR Design §7) — ultrathink Imp2 反映: queue_url コメント補足
learning_consumer_enabled: bool = True
learning_long_poll_seconds: int = 5
learning_retry_sleep_seconds: float = 30.0
learning_supervisor_backoff_max_seconds: float = 300.0
# U1 ApiStack で `DECISION_EVENTS_QUEUE_URL` を ECS Task environment に注入済。
# AppConfig 側は受け取り側で default は空文字 → eventbridge + consumer_enabled で validate_runtime が必須化.
decision_events_queue_url: str = ""


def validate_runtime(self) -> None:
    # 既存 ...

    # U5: eventbridge + consumer_enabled なら QUEUE_URL 必須
    if (
        self.event_backend == "eventbridge"
        and self.learning_consumer_enabled
        and not self.decision_events_queue_url
    ):
        raise RuntimeError(
            "LEARNING_CONSUMER_ENABLED=true with EVENT_BACKEND=eventbridge requires DECISION_EVENTS_QUEUE_URL"
        )
```

---

## 8. U4 への遡及修正パターン

NFR Req FD I4 で確定済の 5 ファイル変更。Code Gen Phase で Phase A.0 (U5 patch) として実施:

### 8.1 `domain/decision/engine.py` (変更) — ultrathink Imp3 反映: keyword-only signature
```python
class DecisionEngine:
    def __init__(
        self,
        *,
        # 既存引数 ...
        preference_loader: "PreferenceProfileLoader",  # U5 追加
    ) -> None:
        # 既存 ...
        self._preference_loader = preference_loader

    async def _format_profile_with_preferences(
        self,
        *,
        user_id: UUID,
        profile,
    ) -> str:
        """U5 追加: profile_yaml に preference_yaml を append.

        引数は **keyword-only** (引数順による事故防止、ultrathink Imp3).
        """
        profile_yaml = self._format_profile(profile)
        preference_yaml = await self._preference_loader.load_for_prompt(user_id)
        if preference_yaml:
            return f"{profile_yaml}\n\n# 嗜好プロファイル\n{preference_yaml}"
        return profile_yaml
```
- `run` / `run_stream` 内の `profile_yaml = self._format_profile(profile)` を `profile_yaml = await self._format_profile_with_preferences(user_id=..., profile=profile)` に置換 (2 箇所)

### 8.2 `interface/deps.py` (変更)
- `get_decision_engine` Depends に preference_loader 引数追加

### 8.3 `main.py` (変更)
- lifespan で `PreferenceProfileLoader(...)` を初期化、`app.state.preference_loader` に格納

### 8.4 `tests/unit/decision/test_engine.py` (変更)
- `_make_engine` ヘルパーに `preference_loader` 引数追加 (Mock を渡す)

### 8.5 `tests/fixtures/decision.py` (変更)
- `mock_preference_loader_factory()` 追加 (空 YAML を返す)

---

## 9. 依存ライブラリ

U2-U4 既存を流用、**新規追加なし**:
- `boto3` (U1 既存) — SQS / EventBridge
- `structlog` (U3 既存) — Logger
- `pydantic` (U2 既存) — DTO
- `fastapi` (U2 既存) — endpoint
- PyYAML は採用しない (§6)

---

## 10. 承認チェックリスト

- [x] PreferenceProfileBuilder (純粋関数 + 定数 + clip + 50/100/50 上限 + **persona_names を _build_pattern 経由で統一**)
- [x] ColdStartEstimator (3 定数マッピング + 重複排除)
- [x] PreferenceProfileLoader (ColdStart 一元発火 + load / load_for_prompt + **YAML format 手書き + json.dumps で names safe**)
- [x] SQS Consumer (asyncio.to_thread + boto3 + parse 失敗 delete しない + **N+1 SELECT は MVP 1-by-1**)
- [x] Supervisor (**Python 3.11+ asyncio.timeout** + exponential backoff 60→120→240→300 cap、永続継続)
- [x] AppConfig 拡張 (5 環境変数 + validate_runtime 拡張 + queue_url コメント補足)
- [x] U4 遡及修正 5 ファイル (**`_format_profile_with_preferences` keyword-only signature**)
- [x] 依存ライブラリ追加なし (PyYAML 不採用)
- [x] Infrastructure Design への引き継ぎ (ディレクトリ + U1 SQS redrive policy 確認 + IAM + **N+1 注記**)

### ultrathink レビュー (2026-05-16) 反映済 6 件
- **Important 3**:
  - I1 (§1.1): `apply_yes/apply_no` で persona_names を `_build_pattern` 経由で取得し統一 (persona_id UUID と persona_name の混在防止)
  - I2 (§4.3): N+1 SELECT 問題を「MVP 1-by-1」明示 + 将来 `get_many` 化を Risk 表に注記
  - I3 (§5): Supervisor を Python 3.11+ `asyncio.timeout` context manager に変更 (cancel 挙動明確化)
- **Improvements 3**:
  - Imp1 (§3.2): `recent_accepted` の persona_names を `json.dumps(names, ensure_ascii=False)` で YAML-safe な double-quote 表現に
  - Imp2 (§7): `decision_events_queue_url` コメント補足 (U1 ApiStack 由来の説明)
  - Imp3 (§8.1): `_format_profile_with_preferences` を **keyword-only signature** で引数順事故防止

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 6 fixes 適用済) を保持。

**Important 3 / Improvements 3 の合計 6 件の NFR Design 修正点は全て継続有効**。`persona_names 統一`、`N+1 注記`、`asyncio.timeout`、`json.dumps names`、`queue_url コメント`、`keyword-only signature` 等の Design pattern は不変。

### 軽微な波及
- **U4 が U5 学習結果を読む新依存** (`07c1c78`): `PreferenceProfileRepository.get_by_user` への read access が追加、既存の SQLModel ORM パターン (cold-start fallback 含む) で対応可能

→ U5 NFR Design は CONSTRUCTION 完了状態のまま継続有効。
