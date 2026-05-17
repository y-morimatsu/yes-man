# U-Persona — NFR Design

**Unit**: U-Persona
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Upstream**: FD (10) + NFR Req (6)

---

## 0. 位置付け

NFR Req §7 引き継ぎを実装パターンとして具体化。U3 SilenceGuard 流用 + U5 で確立した純粋関数パターン + U2 PersonaRepository 既存利用。

| 確定対象 | 担当セクション |
|---|---|
| anonymize_owner (module-level) | §1 |
| _can_access (module-level) | §2 |
| PersonaCatalogService 実装 | §3 |
| PersonaModerator (U3 SilenceGuard 注入) | §4 |
| validate_selection (純粋関数) | §5 |
| 共有プール listing + 匿名化 | §6 |
| U4 への遡及修正パターン | §7 |
| AppConfig 拡張 + validate_runtime | §8 |
| 依存ライブラリ | §9 |

---

## 1. anonymize_owner (module-level)

`apps/api/src/yesman_api/domain/persona/anonymizer.py`

```python
import hashlib
from uuid import UUID


def anonymize_owner(owner_user_id: UUID, salt: str) -> str:
    """NFR-PRIV-06: owner_user_id を salt 付きで hash 化、頭 16 文字 (FD Imp1 + Imp3 反映).

    Args:
        owner_user_id: Persona.owner_user_id (Cognito sub)
        salt: PERSONA_ANONYMIZER_SALT 環境変数値 (prod は Secrets Manager 経由)

    Returns:
        "yesman-<16-char-hex>" 形式の匿名 ID
    """
    h = hashlib.sha256((salt + str(owner_user_id)).encode("utf-8")).hexdigest()
    return f"yesman-{h[:16]}"
```

### 1.1 設計判断
- module-level 関数として独立、PersonaCatalogService 内部実装ではない
- テストは公開 API で容易 (`test_anonymizer.py`)

---

## 2. _can_access (module-level)

`apps/api/src/yesman_api/domain/persona/access.py`

```python
from uuid import UUID

from yesman_api.domain.persistence.models import Persona


def can_access(persona: Persona, user_id: UUID) -> bool:
    """Persona へのアクセス検証 (NFR Req SEC-UP-03 / FD I2).

    Record 内フラグのみで判定可能 (DB 追加クエリ不要、AVAIL-UP-05).
    """
    if persona.is_blocked:
        return False
    return (
        persona.is_builtin
        or persona.owner_user_id == user_id
        or persona.is_shared
    )
```

---

## 3. PersonaCatalogService

`apps/api/src/yesman_api/domain/persona/catalog.py`

### 3.1 シグネチャ

```python
from uuid import UUID

from yesman_api.application.persistence.protocols import (
    PersonaRepository,
    UserPersonaSelectionRepository,
)
from yesman_api.domain.persistence.constants import SYSTEM_USER_ID
from yesman_api.domain.persistence.models import Persona, UserPersonaSelection
from yesman_api.domain.persona.access import can_access
from yesman_api.domain.persona.anonymizer import anonymize_owner
from yesman_api.domain.persona.errors import PersonaError
from yesman_api.domain.persona.models import PersonaSummary
from yesman_api.domain.persona.moderator import PersonaModerator


_MAX_SELECTION = 3  # FR-PERSONA-10


class PersonaCatalogService:
    def __init__(
        self,
        *,
        persona_repo: PersonaRepository,
        selection_repo: UserPersonaSelectionRepository,
        moderator: PersonaModerator,
        anonymizer_salt: str,
    ) -> None:
        self._persona_repo = persona_repo
        self._selection_repo = selection_repo
        self._moderator = moderator
        self._salt = anonymizer_salt

    # === CRUD ===
    async def create(
        self,
        *,
        owner_user_id: UUID,
        name: str,
        description: str | None,
        prompt_text: str,
        avatar_url: str | None,
    ) -> Persona:
        verdict = await self._moderator.moderate(
            name=name, description=description, prompt_text=prompt_text
        )
        if not verdict.is_allowed:
            raise PersonaError("rejected_by_moderator", detail=verdict.rejected_reason)
        persona = Persona(
            owner_user_id=owner_user_id,
            name=name,
            description=description,
            prompt_text=prompt_text,
            avatar_url=avatar_url,
            is_shared=False,
            is_builtin=False,
        )
        return await self._persona_repo.insert(persona)

    async def update(
        self,
        *,
        persona_id: UUID,
        owner_user_id: UUID,
        name: str | None = None,
        description: str | None = None,
        prompt_text: str | None = None,
        avatar_url: str | None = None,
    ) -> Persona:
        existing = await self._persona_repo.get(persona_id)
        if existing is None or existing.owner_user_id != owner_user_id:
            raise PersonaError("not_found")  # SEC-UP-01 leak 防止
        if existing.is_builtin:
            raise PersonaError("builtin_immutable")
        if existing.is_blocked:
            # ultrathink I1 反映: blocked persona は所有者でも編集禁止 (再 Moderator 通過の保証なし)
            # delete は許可 (所有者の権利、§3 delete メソッドで block チェックなし)
            raise PersonaError("blocked_immutable")
        # 変更後の値で再 Moderation
        new_name = name if name is not None else existing.name
        new_description = description if description is not None else existing.description
        new_prompt = prompt_text if prompt_text is not None else existing.prompt_text
        verdict = await self._moderator.moderate(
            name=new_name, description=new_description, prompt_text=new_prompt
        )
        if not verdict.is_allowed:
            raise PersonaError("rejected_by_moderator", detail=verdict.rejected_reason)
        existing.name = new_name
        existing.description = new_description
        existing.prompt_text = new_prompt
        if avatar_url is not None:
            existing.avatar_url = avatar_url
        return await self._persona_repo.update(existing)

    async def delete(self, *, persona_id: UUID, owner_user_id: UUID) -> None:
        existing = await self._persona_repo.get(persona_id)
        if existing is None or existing.owner_user_id != owner_user_id:
            raise PersonaError("not_found")
        if existing.is_builtin:
            raise PersonaError("builtin_immutable")
        await self._persona_repo.soft_delete(persona_id)

    async def set_shared(
        self, *, persona_id: UUID, owner_user_id: UUID, shared: bool
    ) -> Persona:
        existing = await self._persona_repo.get(persona_id)
        if existing is None or existing.owner_user_id != owner_user_id:
            raise PersonaError("not_found")
        if existing.is_builtin:
            raise PersonaError("builtin_immutable")
        if shared:
            # 共有公開時は再 Moderation (NFR Req PERF-UP-02 反映: LLM 2 回呼び累積)
            verdict = await self._moderator.moderate(
                name=existing.name,
                description=existing.description,
                prompt_text=existing.prompt_text,
            )
            if not verdict.is_allowed:
                raise PersonaError("rejected_by_moderator", detail=verdict.rejected_reason)
        existing.is_shared = shared
        return await self._persona_repo.update(existing)

    # === Listings ===
    async def list_my_personas(self, owner_user_id: UUID) -> list[Persona]:
        """自分の作成 Persona のみ (builtin 除外、FD C1)."""
        owned = await self._persona_repo.list_by_owner(owner_user_id)
        return [p for p in owned if not p.is_builtin]

    async def list_builtin_personas(self) -> list[Persona]:
        return await self._persona_repo.list_by_owner(SYSTEM_USER_ID)

    async def list_shared(
        self,
        *,
        page: int,
        page_size: int,
        sort: str = "popularity",
    ) -> list[PersonaSummary]:
        """共有プール listing + 匿名化.

        ultrathink Imp1: sort の Literal validate は API DTO 側で行うため
        Service 層は str 受け取り (cast 不要、型は U2 PersonaRepository の SortOrder TypedAlias で受ける).
        """
        personas = await self._persona_repo.list_shared(
            page=page,
            page_size=page_size,
            sort=sort,  # type: ignore[arg-type]  # API DTO で validate 済
        )
        summaries = []
        for p in personas:
            yes_rate = (p.yes_count / p.usage_count) if p.usage_count > 0 else 0.0
            summaries.append(
                PersonaSummary(
                    id=p.id,
                    name=p.name,
                    description=p.description,
                    avatar_url=p.avatar_url,
                    usage_count=p.usage_count,
                    yes_acceptance_rate=round(yes_rate, 3),
                    creator_anonymous_id=anonymize_owner(p.owner_user_id, self._salt),
                )
            )
        return summaries

    # === Selection ===
    async def get_selection(self, user_id: UUID) -> list[UUID]:
        selection = await self._selection_repo.get(user_id)
        if selection is None or not selection.persona_ids:
            # builtin fallback
            builtin = await self.list_builtin_personas()
            return [p.id for p in builtin][:_MAX_SELECTION]
        return [UUID(pid) for pid in selection.persona_ids]

    async def set_selection(
        self, *, user_id: UUID, persona_ids: list[UUID]
    ) -> None:
        """1〜3 個、重複なし、全て _can_access 成立."""
        if not 1 <= len(persona_ids) <= _MAX_SELECTION:
            raise PersonaError("invalid_selection_size")
        if len(set(persona_ids)) != len(persona_ids):
            raise PersonaError("duplicate_personas")
        # アクセス検証 (個別 SELECT、N+1 だが N<=3 で許容)
        # ultrathink I2: PERF-UP-04 < 100ms 達成可、将来 `get_many` 導入の余地
        for pid in persona_ids:
            p = await self._persona_repo.get(pid)
            if p is None or not can_access(p, user_id):
                raise PersonaError("persona_not_accessible", detail=str(pid))
        sel = UserPersonaSelection(
            user_id=user_id,
            persona_ids=[str(pid) for pid in persona_ids],
        )
        await self._selection_repo.upsert(sel)

    async def reset_selection(self, user_id: UUID) -> None:
        """ultrathink FD I5: DELETE /v1/persona-selections/me で builtin 3 種に戻す.

        UserPersonaSelectionRepository に delete メソッドがないため、空 list で upsert.
        get_selection は空 list → builtin fallback で動作.
        """
        sel = UserPersonaSelection(user_id=user_id, persona_ids=[])
        await self._selection_repo.upsert(sel)
```

---

## 4. PersonaModerator (U3 SilenceGuard 注入)

`apps/api/src/yesman_api/domain/persona/moderator.py`

```python
from yesman_api.domain.decision.silence_guard import SilenceGuard
from yesman_api.domain.persona.models import ModerationVerdict


class PersonaModerator:
    """ペルソナのプロンプト検査 (FR-PERSONA-11 / NFR-PRIV-08).

    U3 SilenceGuard を注入 (重複実装回避、ultrathink NFR Design 引き継ぎ).
    LLM 失敗時は SilenceGuard 内で fail-closed (= rejected) 扱い (U3 既存挙動踏襲).
    """

    def __init__(self, *, silence_guard: SilenceGuard) -> None:
        self._guard = silence_guard

    async def moderate(
        self,
        *,
        name: str,
        description: str | None,
        prompt_text: str,
    ) -> ModerationVerdict:
        combined = "\n".join(filter(None, [name, description or "", prompt_text]))
        verdict = await self._guard.evaluate(user_input=combined)
        if verdict.is_silenced:
            return ModerationVerdict(
                is_allowed=False,
                rejected_domain=verdict.domain,
                rejected_reason="このペルソナは沈黙演出ドメインに該当するため作成できません。",
            )
        return ModerationVerdict(is_allowed=True)
```

### 4.1 設計判断
- U3 `SilenceGuard.evaluate()` をそのまま再利用 (regex fast path + LLM 自己判定)
- LLM 不明 domain (4 ドメイン以外) は SilenceGuard 内で allowed 扱い → `is_silenced=False` → Moderator も allowed (NFR Req SEC-UP-08 ultrathink I3 反映)
- 共有公開時の再 Moderation も同じ Moderator を再呼び出し (PERF-UP-02 累積 2.5s 想定)

---

## 5. validate_selection (将来 PBT 切り出し候補) — ultrathink Imp2 反映: MVP では inline

MVP では `set_selection` 内に **inline で size + duplicate + accessibility 検証を実装** (純粋関数化のコスト > メリット)。PBT は `set_selection` を Mock Repo 経由で直接呼ぶ。

将来切り出し時の関数 signature (Code Gen Phase では実装しない):

```python
def _validate_selection_invariants(
    persona_ids: list[UUID], user_id: UUID, all_personas: dict[UUID, Persona]
) -> None:
    """将来 PBT 用に切り出し候補. MVP では set_selection 内 inline."""
    ...
```

---

---

## 6. 共有プール listing + 匿名化 (実装上の注意)

### 6.1 PERF-UP-03 達成方法
- U2 `PersonaRepository.list_shared(page, page_size, sort)` は SQL ORDER BY + LIMIT で 1 SELECT
- Service 層は memory 内で `anonymize_owner` を全件適用 (PERSONA_ANONYMIZER_SALT を `__init__` で受け取る)
- 20 件 listing で hash 計算 20 回 = 約 1ms 程度、SQL の方がボトルネック

### 6.2 NFR-PRIV-07 (個別履歴非公開)
- DTO `SharedPersonaSummaryResponse` に **`owner_user_id` raw を含めない** (`creator_anonymous_id` のみ)
- 個別利用履歴 (誰がいつ使ったか) は API レスポンスに含めない

---

## 7. U4 への遡及修正 (FD §4 + NFR Req I1 確定)

5 ファイル変更:

### 7.1 `domain/decision/engine.py` — ultrathink C1 + I3 反映

- コンストラクタに `selection_repo: UserPersonaSelectionRepository` 追加
- `_resolve_personas(*, selected_ids, user_id)` keyword-only に変更
- **selection.persona_ids (`list[str]`) を `UUID` に変換** (ultrathink C1 反映):
  ```python
  if not selected_ids:
      selection = await self._selection_repo.get(user_id)
      if selection is not None and selection.persona_ids:
          # selection.persona_ids は list[str] (UUID 文字列、JSONB list)、UUID に変換
          selected_ids = [UUID(pid) for pid in selection.persona_ids]
  ```
- `can_access` を import + 利用 (`from yesman_api.domain.persona.access import can_access`)
- `apply_choice(yes/no)` 末尾で `PersonaRepository.record_usage(persona_id, was_yes)` を選択 persona 全てに呼ぶ:
  ```python
  for pid in decision.selected_persona_ids:
      try:
          await self._persona_repo.record_usage(UUID(pid), was_yes=(choice == "yes"))
      except Exception:
          # ultrathink I3 反映: best-effort、record_usage 失敗は採択 API 自体を壊さない
          # 本来は U2 RepositoryError / DB 例外を分離捕捉が望ましいが MVP では包括 catch + log
          self._logger.warning("record_usage_failed", persona_id=pid)
  ```

### 7.2 `interface/deps.py`
- `get_decision_engine` で `selection_repo=bundle.user_persona_selection` を inject

### 7.3 `main.py`
- 変更なし (U4 既存 lifespan で全 factory 初期化、selection_repo は bundle 経由)

### 7.4 `tests/unit/decision/test_engine.py`
- `_make_engine` ヘルパーに `selection_repo` 引数追加 (default で stub)

### 7.5 `tests/fixtures/decision.py`
- `mock_selection_repo_factory()` 追加 (空 selection を返す stub)

---

## 8. AppConfig 拡張 + validate_runtime

```python
# U-Persona (NFR Design §8)
persona_anonymizer_salt: str = ""
persona_report_auto_block_threshold: int = 5
persona_moderator_llm_timeout_seconds: float = 5.0


def validate_runtime(self) -> None:
    # 既存 ...

    # U-Persona: prod では PERSONA_ANONYMIZER_SALT 必須
    if self.app_env == "prod" and not self.persona_anonymizer_salt:
        raise RuntimeError(
            "PERSONA_ANONYMIZER_SALT must be set in production (NFR Req SEC-UP-06)"
        )
```

---

## 9. 依存ライブラリ

**新規追加なし** (boto3 / structlog / pydantic / fastapi 既存)。

---

## 10. 承認チェックリスト

- [x] anonymize_owner (module-level + 16 文字)
- [x] can_access (module-level + DB 不要)
- [x] PersonaCatalogService 全メソッド + **update で blocked_immutable 拒否** + N+1 コメント + sort cast 削除
- [x] PersonaModerator (U3 SilenceGuard 注入、LLM 不明 domain allowed)
- [x] **validate_selection MVP inline 方針** + 将来 PBT 切り出し候補として残す
- [x] 共有プール listing + 匿名化 (NFR-PRIV-07 個別履歴非公開)
- [x] U4 遡及 5 ファイル + **selection.persona_ids list[str] → UUID 変換 1 行明示** + record_usage best-effort コメント
- [x] AppConfig 拡張 3 環境変数 + validate_runtime
- [x] 依存追加なし
- [x] Infrastructure Design への引き継ぎ

### ultrathink レビュー (2026-05-16) 反映済 6 件
- **Critical 1**: C1 (§7.1) U4 engine の `selection.persona_ids` (list[str]) → UUID 変換 1 行明示
- **Important 3**:
  - I1 (§3 update): `is_blocked == True` なら `PersonaError("blocked_immutable")` (所有者でも update 禁止、delete は許可)
  - I2 (§3 set_selection): N+1 SELECT を「N<=3 で許容、将来 get_many」コメント追加
  - I3 (§7.1 record_usage): broad Exception catch を best-effort コメントで明示 (本来は RepositoryError 分離が望ましいが MVP)
- **Improvements 2**:
  - Imp1 (§3 list_shared): `cast(Literal[...], sort)` 削除、API DTO で Literal validate
  - Imp2 (§5): MVP は set_selection inline、将来 PBT 切り出し候補として残す
