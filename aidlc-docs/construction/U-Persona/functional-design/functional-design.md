# U-Persona — Functional Design

**Unit**: U-Persona — PersonaCatalogService + PersonaModerator + Custom Persona CRUD + 共有プール
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW

---

## 0. 位置付け

U4 / decision で builtin 3 種固定だったペルソナを **ユーザー作成 + 共有プール** に拡張する (FR-PERSONA-01〜12)。U2 PersonaRepository / PersonaReportRepository / UserPersonaSelectionRepository が既存で揃っており、U-Persona は **Service 層 + API 層** + **U4 への遡及修正** (UserPersonaSelection → DecisionEngine の persona 解決) を担当する。

### 関連要件
- **FR-PERSONA-01〜10** (builtin + custom + 共有プール + 選択保持 + 統計 + 匿名 + プレビュー)
- **FR-PERSONA-11〜12** (PersonaModerator + 沈黙ドメイン誘発検知)
- **NFR-PRIV-05〜08** (opt-in 共有 + 匿名化 + 沈黙ドメイン二段検知)

### 上流前提
| 出典 | 内容 |
|---|---|
| U2 PersonaRepository | `insert / update / soft_delete / get / list_by_owner / list_shared / record_usage / block` |
| U2 PersonaReportRepository | `insert / list_pending / count_by_persona`、`DuplicateReportError` 例外 |
| U2 UserPersonaSelectionRepository | `get / upsert` (user の選択 persona_ids) |
| U2 Persona モデル | `id / owner_user_id / name / description / prompt_text / is_shared / is_builtin / usage_count / yes_count` + `is_blocked` (PersonaModerator 用) |
| U4 DecisionEngine `_resolve_personas` | 既存実装で `selected_persona_ids` 引き渡し時 PersonaRepository.get を呼ぶ、UserPersonaSelection 未参照 → 拡張必要 |
| U3 SilenceGuard | プロンプト検査用 LLM (regex + LLM 自己判定) を再利用、Moderator から呼べる |

### MVP スコープ (U-Persona 内)
- ✅ Custom Persona CRUD (`/v1/personas/me`)
- ✅ 共有プール閲覧 (`/v1/personas/shared`、ページング + sort)
- ✅ 共有公開 / 解除 (`PATCH /v1/personas/{id}/share`)
- ✅ 悪用報告 (`POST /v1/personas/{id}/report`)
- ✅ ユーザー選択管理 (`GET/PUT /v1/persona-selections/me`)
- ✅ PersonaModerator (作成時プロンプト検査、沈黙ドメイン誘発検知)
- ✅ U4 DecisionEngine 統合 (UserPersonaSelection 経由でデフォルト persona 解決)
- ✅ Persona usage 統計の atomic 更新 (= U2 既存 `record_usage` 呼び出しを Decision Yes/No 採択時に追加)
- ⏭ アバター画像アップロード → URL field のみ、画像 hosting は別ユニット (S3 + presigned URL)
- ⏭ 管理者レビュー UI → CLI ベース or 将来 UI で
- ⏭ Custom Persona の利用統計を作成者に公開 → NFR-PRIV-07 で禁止
- ⏭ ペルソナ Like / Bookmark → MVP スコープ外

---

## 1. ドメインモデル

### 1.1 PersonaModerator 結果

```python
@dataclass(frozen=True, slots=True)
class ModerationVerdict:
    is_allowed: bool
    rejected_domain: Literal["religion", "election", "violence", "obscene"] | None = None
    rejected_reason: str | None = None
```

### 1.2 共有プール listing 用統計

```python
@dataclass(frozen=True, slots=True)
class PersonaSummary:
    """共有プール用の匿名化済 summary (NFR-PRIV-06 + FR-PERSONA-09)."""
    id: UUID
    name: str
    description: str | None
    avatar_url: str | None
    usage_count: int
    yes_acceptance_rate: float  # = yes_count / usage_count (0.0 if usage_count==0)
    creator_anonymous_id: str  # hash(owner_user_id + salt) で匿名化
```

### 1.3 UserPersonaSelection (U2 既存) の利用方針
- `user_id` → `persona_ids: list[UUID]` (max 3 個、FR-PERSONA-10)
- 未設定の user は builtin 3 種を fallback (U4 既存挙動)

---

## 2. PersonaCatalogService

`apps/api/src/yesman_api/domain/persona/catalog.py`

### 2.1 責務
- Custom Persona の CRUD (create / read / update / delete)
- 共有公開 / 解除 (`set_shared(persona_id, shared: bool)`)
- 共有プール listing (page + sort)
- ユーザーの選択 persona 管理 (`get_selection / set_selection(persona_ids: list[UUID])`)

### 2.2 主要メソッド

```python
class PersonaCatalogService:
    def __init__(
        self,
        *,
        persona_repo: PersonaRepository,
        selection_repo: UserPersonaSelectionRepository,
        moderator: PersonaModerator,
        anonymizer_salt: str,
    ) -> None: ...

    async def create(self, *, owner_user_id: UUID, name: str, description: str | None,
                     prompt_text: str, avatar_url: str | None) -> Persona:
        """PersonaModerator で prompt 検査 → 通過なら Repository.insert.

        NFR-PRIV-08 / FR-PERSONA-11: 沈黙ドメイン誘発時は PersonaError("rejected_by_moderator") を raise.
        """

    async def update(self, *, persona_id: UUID, owner_user_id: UUID, ...) -> Persona:
        """所有者確認 + Moderator 再検査 + Repository.update.
        Builtin persona (is_builtin=True) は変更不可、PersonaError("builtin_immutable")."""

    async def delete(self, *, persona_id: UUID, owner_user_id: UUID) -> None:
        """所有者確認 + soft_delete. Builtin 不可."""

    async def set_shared(self, *, persona_id: UUID, owner_user_id: UUID, shared: bool) -> Persona:
        """共有公開 (is_shared フラグ) / 解除. 公開時は再 Moderation 推奨 (FR-PERSONA-04)."""

    async def list_my_personas(self, owner_user_id: UUID) -> list[Persona]:
        """自分のペルソナ一覧 (soft_delete 除外)."""

    async def list_shared(self, *, page: int, page_size: int,
                          sort: Literal["popularity", "newest", "acceptance"]) -> list[PersonaSummary]:
        """共有プール一覧 + 匿名化済 summary 生成."""

    async def get_selection(self, user_id: UUID) -> list[UUID]:
        """ユーザーが選択中の persona_ids. 未設定なら builtin 3 種."""

    async def set_selection(self, *, user_id: UUID, persona_ids: list[UUID]) -> None:
        """選択保存. 上限 3 (FR-PERSONA-10)、全て存在 + (own or is_shared or is_builtin) 確認 + is_blocked 除外."""
```

### 2.3 匿名化

```python
def _anonymize_owner(owner_user_id: UUID, salt: str) -> str:
    """NFR-PRIV-06: owner_user_id を salt 付きで hash 化、頭 12 文字を creator_anonymous_id とする."""
    h = hashlib.sha256((salt + str(owner_user_id)).encode("utf-8")).hexdigest()
    return f"yesman-{h[:12]}"
```

### 2.4 選択制約 (set_selection 内)
- `len(persona_ids) <= 3` (FR-PERSONA-10、上限 3、超過は `PersonaError("too_many_personas")`)
- `len(set(persona_ids)) == len(persona_ids)` (重複禁止)
- 各 persona が存在 + (`owner_user_id == user_id` OR `is_shared == True` OR `is_builtin == True`) + `is_blocked == False`
- 違反時は `PersonaError("persona_not_accessible")`

---

## 3. PersonaModerator

`apps/api/src/yesman_api/domain/persona/moderator.py`

### 3.1 責務 (FR-PERSONA-11 + NFR-PRIV-08)
- 作成 / 編集 / 共有公開時に Persona の `prompt_text` + `name` + `description` を検査
- 沈黙演出ドメイン (宗教 / 選挙 / 暴力 / 卑猥) を誘発・回避するペルソナを **拒否**

### 3.2 2 段検査
1. **正規表現ベース fast path**: U3 SilenceGuard の `SILENCE_KEYWORDS` を流用 (60 語 4 ドメイン)
2. **LLM 自己判定**: U3 SilenceGuard の `_llm_judge` を流用 (= 共通インフラ)

```python
class PersonaModerator:
    def __init__(self, *, silence_guard: SilenceGuard) -> None:
        self._guard = silence_guard

    async def moderate(self, *, name: str, description: str | None,
                        prompt_text: str) -> ModerationVerdict:
        """検査対象テキスト = name + description + prompt_text を連結。

        SilenceGuard の evaluate() に渡し、is_silenced=True なら rejected.
        """
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

### 3.3 悪用報告 (FR-PERSONA-08)
- ユーザーが `POST /v1/personas/{id}/report` で報告
- `PersonaReportRepository.insert` で `(persona_id, reporter_user_id)` UNIQUE 制約 (DuplicateReportError → 409)
- 自動 block 閾値 (例: 5 件以上の pending) は `count_by_persona` で確認、管理者レビュー後に `PersonaRepository.block`

### 3.4 合議実行時のフォールバック (FR-PERSONA-11 後半)
- DecisionEngine.`_resolve_personas` で `is_blocked == True` の persona を除外
- 結果が 0 個になれば `DecisionError("no_personas")`、1 個以上なら継続

---

## 4. U4 DecisionEngine への遡及修正

### 4.1 既存 `_resolve_personas` の現状
```python
async def _resolve_personas(self, selected_ids: list[UUID]) -> list:
    if selected_ids:
        # 個別取得 + is_blocked 除外
    # builtin 3 種をデフォルト
    builtin = await self._persona_repo.list_by_owner(SYSTEM_USER_ID)
    ...
```

### 4.2 U-Persona 統合後
- `selected_ids` が空なら **UserPersonaSelection を見る** → 設定あればその ID 群を解決
- 設定もなければ builtin 3 種 fallback (既存挙動)
- 各 persona について `is_blocked` 除外 + `owner_user_id == user_id` OR `is_shared` OR `is_builtin` のアクセス検証
- アクセス不可は warn log + skip、最終 0 個なら `DecisionError("no_personas")`

### 4.3 ファイル変更
- `domain/decision/engine.py` (1 ファイル)
- コンストラクタに `selection_repo: UserPersonaSelectionRepository` 追加
- `_resolve_personas(selected_ids, *, user_id)` で user_id 経由のアクセス検証
- `interface/deps.py`: get_decision_engine の bundle に `selection_repo` を含める (U2 既存 bundle.user_persona_selection)
- `tests/unit/decision/test_engine.py`: `_make_engine` に `selection_repo` 引数追加 (default で stub)
- `tests/fixtures/decision.py`: stub repo 追加

→ **U4 への遡及 5 ファイル** (U5 と同パターン、Phase A.0b 相当)

### 4.4 Persona usage 統計の atomic 更新 (FR-PERSONA-09)
- `DecisionEngine.apply_choice(yes/no)` 内で `PersonaRepository.record_usage(persona_id, was_yes)` を呼ぶ
- 採択された Decision の `selected_persona_ids` 全てに対し record_usage (atomic で usage_count + yes_count 更新、U2 既存実装)
- これも U4 engine.py 遡及修正範囲

---

## 5. Preference API + Persona API + UserPersonaSelection API

### 5.1 エンドポイント一覧

| Method | Path | 認証 | 説明 |
|---|---|---|---|
| GET | `/v1/personas/me` | 必須 | 自分のペルソナ一覧 (custom + 自分 owner の shared) |
| POST | `/v1/personas/me` | 必須 | Custom Persona 作成 (Moderator 通過必須) |
| PATCH | `/v1/personas/{id}` | 必須 | 編集 (Moderator 再検査) |
| DELETE | `/v1/personas/{id}` | 必須 | soft_delete (builtin 不可) |
| PATCH | `/v1/personas/{id}/share` | 必須 | 共有 ON/OFF (`{"shared": true}`) |
| GET | `/v1/personas/shared` | 必須 | 共有プール一覧 (page + sort) |
| POST | `/v1/personas/{id}/report` | 必須 | 悪用報告 |
| GET | `/v1/persona-selections/me` | 必須 | 現在の選択 persona_ids (未設定なら builtin 3 種) |
| PUT | `/v1/persona-selections/me` | 必須 | 選択更新 (上限 3) |

### 5.2 DTO 例

```python
class PersonaResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    avatar_url: str | None
    prompt_text: str
    is_shared: bool
    is_builtin: bool
    usage_count: int
    yes_count: int
    yes_acceptance_rate: float
    is_owner: bool


class PersonaCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=200)
    prompt_text: str = Field(min_length=10, max_length=2000)
    avatar_url: str | None = None  # URL


class PersonaShareRequest(BaseModel):
    shared: bool


class PersonaReportRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class PersonaSelectionResponse(BaseModel):
    persona_ids: list[UUID]


class PersonaSelectionUpdateRequest(BaseModel):
    persona_ids: list[UUID] = Field(min_length=1, max_length=3)


class SharedPersonaSummaryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    avatar_url: str | None
    usage_count: int
    yes_acceptance_rate: float
    creator_anonymous_id: str
```

---

## 6. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/unit/persona/test_catalog.py` | unit | create/update/delete + builtin_immutable + 所有者検証 + set_shared + set_selection 上限 3 + 重複 |
| `tests/unit/persona/test_moderator.py` | unit | 通常 prompt 通過 + 沈黙ドメイン rejected (4 ドメイン) + LLM 自己判定 fallback |
| `tests/unit/persona/test_anonymizer.py` | unit | _anonymize_owner で同一 user は同一 ID、異なる user は異なる ID、salt 違いで結果変化 |
| `tests/integration/persona/test_personas_api.py` | integration | CRUD + 共有 ON/OFF + 共有プール listing (placeholder + TODO) |
| `tests/integration/persona/test_persona_report.py` | integration | 重複報告 409 + count_by_persona (placeholder + TODO) |
| `tests/integration/persona/test_persona_selection.py` | integration | GET (未設定 builtin) / PUT (上限 3) / アクセス不可 persona reject (placeholder) |
| `tests/property/test_catalog_invariants.py` | PBT | 任意の persona_ids 列 → set_selection 後の保存が常に上限 3 / アクセス可能なものだけ / 重複なし |

---

## 7. 引き継ぎ (NFR Requirements)

NFR Req で確定する事項:
- **PERF**: persona CRUD < 100ms、共有プール page 20 件 < 200ms、Moderator (regex + LLM 自己判定) p95 < 1s
- **SEC**: 所有者検証 (= request.state.user.sub == persona.owner_user_id)、`/v1/personas/{id}` の `id` パスパラメータの leak 防止 (= 他人のは 404)、PersonaReport の `reporter_user_id == request.state.user.sub` 強制、`PERSONA_ANONYMIZER_SALT` 環境変数 (prod は Secrets Manager)
- **EXT**: ColdStart 用 builtin 推奨セットの set 管理を `domain/persona/constants.py` に定数化
- **AVAIL**: PersonaModerator の LLM 失敗時 fail-closed (= rejected 扱い、保守的)
- **TEST**: PBT で `set_selection` invariants (上限 3 / アクセス可能 / 重複なし)
- **環境変数**: `PERSONA_ANONYMIZER_SALT` (secret) / `PERSONA_REPORT_AUTO_BLOCK_THRESHOLD` (default 5)

---

## 8. 承認チェックリスト

- [x] スコープ確定 (7 機能 in / 4 out)
- [x] ドメインモデル (ModerationVerdict + PersonaSummary + UserPersonaSelection 既存)
- [x] PersonaCatalogService (CRUD + 共有 + listing + selection 管理 + 上限 3)
- [x] 匿名化 (hash + salt + 頭 12 文字)
- [x] PersonaModerator (SilenceGuard 流用、2 段検査、fail-closed)
- [x] U4 遡及 (engine + selection_repo 引数 + record_usage in apply_choice、5 ファイル)
- [x] API 9 endpoint + DTO
- [x] テスト 7 ファイル (Unit 3 + Integration 3 + PBT 1)
- [x] NFR Req への引き継ぎ事項 (PERF / SEC / EXT / AVAIL / TEST + 環境変数 2)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに加わった:

### Dynamic Persona Routing UI (`07c1c78`、Closes #4、2026-05-19)

**背景**: U4 `DecisionEngine._resolve_personas` が `PreferenceProfile.persona_style_preference` から builtin persona top-3 を自動推奨するようになったことに合わせ、U-Persona の Selection page にも視覚的な手掛かりを追加。

**Frontend 側変更**:
- **`apps/web/src/features/persona/PersonaSelectionPage.tsx`**:
  - 各 builtin persona card の右上に「💡 おすすめ」**pink pill badge** を追加
  - `usePreference()` hook で `persona_style_preference` を取得、スコア降順 sort で top-3 のみに badge 表示
  - Cold-start user (PreferenceProfile が空) には badge 非表示、従来通りの 4 件 builtin 表示
  - badge 配色: `bg-pink-100 text-pink-700`、`font-serif text-xs px-2 py-0.5 rounded-full`

**Backend / Domain への影響**:
- `PersonaCatalogService` / `PersonaModerator` 本体不変
- `UserPersonaSelection` モデル / 上限 3 / `PUT/DELETE /v1/persona-selections/me` endpoint も不変
- 新規 API 追加なし — frontend が既存の `GET /v1/preferences/me` (U5) + `GET /v1/personas/builtin` (U-Persona) を組み合わせて表示

### 共有プール / Custom Persona への影響
- 共有プール (`GET /v1/personas/shared`) は影響なし、自動推奨はあくまで builtin に限定
- Custom Persona も推奨対象外 (user 自身が作成した persona なので self-promotion を避ける設計判断)
- AUTO_BLOCK (PersonaReport ≥ 3) ロジックも不変

→ U-Persona は API surface を維持したまま、user の意思決定支援 UI を 1 つ追加。Cold-start 動作は保護され、user の選択自由度も損なわない。
