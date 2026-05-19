# U2 / storage — Functional Design

**ユニット**: U2 / storage
**フェーズ**: CONSTRUCTION - Per-Unit Loop
**ステージ**: Functional Design (1/5 stages for U2)
**作成日**: 2026-05-10

---

## 0. ユニットスコープ

U2 は **Aurora PostgreSQL / MOCK / Docker PostgreSQL** の 3 種の永続化バックエンドを **Strategy + DI + Repository パターン** で抽象化し、データモデル + マイグレーション + ヘルスチェックを提供する。

### U2 が提供するもの
1. **SQLModel データモデル** (7 テーブル): `profiles`, `decisions`, `preference_profiles`, `silence_logs`, `personas`, `persona_reports`, `user_persona_selections`
2. **Repository Protocol** (Python typing.Protocol): 6 リポジトリインターフェース
3. **3 種の実装**:
   - Aurora 実装 (asyncpg / SQLAlchemy)
   - MOCK 実装 (in-memory dict、CI 用)
   - Docker PostgreSQL 実装 (Aurora 実装と共有、接続先のみ異なる)
4. **Alembic マイグレーション**: 初期スキーマ + 拡張用 versioning
5. **`/health` エンドポイント**: ALB Target Group health check 用 (DB 接続性確認)
6. **DI コンテナ統合**: 起動時に `STORAGE_BACKEND` 環境変数で実装を選択

### U2 のスコープ外
- 認証連携 (U3 / auth で `Profile` 作成時に Cognito userId を取得)
- 業務ロジック (合議オーケストレーション、嗜好計算、ペルソナフィルタ等は U4-U7)
- API エンドポイント (Repository は Service 層が呼ぶ、API は U4 等で定義)

---

## 1. データモデル

### 1.1 SQLModel 定義 (Python)

#### 1.1.1 `profiles` テーブル
```python
class Profile(SQLModel, table=True):
    __tablename__ = "profiles"
    
    user_id: UUID = Field(primary_key=True)  # = Cognito sub
    email: str = Field(unique=True, max_length=255)
    age_group: str | None = Field(default=None, max_length=20)  # "20s" / "30s" 等
    occupation: str | None = Field(default=None, max_length=100)
    value_tags: list[str] = Field(default_factory=list, sa_column=Column(JSONB))
    life_stage: str | None = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```
- インデックス: PK `user_id`, UNIQUE `email`
- JSONB: `value_tags` (検索なし、シリアライズのみ)
- 関連要件: FR-AUTH-02, FR-AUTH-03

#### 1.1.2 `decisions` テーブル
```python
class Decision(SQLModel, table=True):
    __tablename__ = "decisions"
    
    id: UUID = Field(primary_key=True, default_factory=uuid4)
    user_id: UUID = Field(foreign_key="profiles.user_id", index=True)
    domain_classification: str = Field(max_length=50)
    # 許容値 (アプリ層で検証、enum 化推奨):
    #   daily / work / school / major (FR-DM の本番品質 4 カテゴリ)
    #   silenced (FR-DM-SILENT 4 ドメイン該当時、details は silence_logs に)
    user_input: str  # PII フィルタ後のテキスト
    user_input_hash: str = Field(max_length=64, index=True)  # SHA-256、沈黙時の本文非保存対策
    proposal_text: str
    persona_outputs: dict = Field(default_factory=dict, sa_column=Column(JSONB))  # {"慎重派": "...", "楽観派": "...", ...}
    rationale: str | None = None
    user_choice: str = Field(max_length=10)  # yes / no / pending
    no_attempt_count: int = Field(default=0)
    llm_provider: str = Field(max_length=50)
    selected_persona_ids: list[UUID] = Field(default_factory=list, sa_column=Column(JSONB))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
```
- インデックス: PK `id`, `user_id` (FK), `user_input_hash`, `created_at` (時系列クエリ用)
- JSONB: `persona_outputs` (議論履歴復元、FR-CV-06)、`selected_persona_ids` (合議で使った人格)
- 関連要件: FR-HIST-01, FR-CV-06

#### 1.1.3 `preference_profiles` テーブル
```python
class PreferenceProfile(SQLModel, table=True):
    __tablename__ = "preference_profiles"
    
    user_id: UUID = Field(primary_key=True, foreign_key="profiles.user_id")
    accepted_patterns: list[dict] = Field(default_factory=list, sa_column=Column(JSONB))  # [{"domain": "...", "pattern": "...", "count": N}, ...]
    rejected_patterns: list[dict] = Field(default_factory=list, sa_column=Column(JSONB))
    persona_style_preference: dict = Field(default_factory=dict, sa_column=Column(JSONB))  # {"慎重派": 0.7, "楽観派": 0.5, ...}
    inferred_tags: list[str] = Field(default_factory=list, sa_column=Column(JSONB))
    last_updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```
- インデックス: PK `user_id` (FK)
- JSONB すべて (FR-LEARN-01, FR-LEARN-02)
- 関連要件: FR-LEARN-06

#### 1.1.4 `silence_logs` テーブル
```python
class SilenceLog(SQLModel, table=True):
    __tablename__ = "silence_logs"
    
    id: UUID = Field(primary_key=True, default_factory=uuid4)
    user_id: UUID = Field(foreign_key="profiles.user_id", index=True)
    detected_domain: str = Field(max_length=20)  # religion / election / violence / obscene
    triggered_by: str = Field(max_length=30)  # prompt-self-check / guardrails
    user_input_hash: str = Field(max_length=64)  # 本文ハッシュのみ (NFR-PRIV-04)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), index=True)
```
- **本文は永続化しない** (NFR-PRIV: ハッシュのみ)
- インデックス: `user_id`, `created_at`, `detected_domain`
- 関連要件: FR-DM-SILENT, NFR-PRIV-04

#### 1.1.5 `personas` テーブル (FR-PERSONA)
```python
class Persona(SQLModel, table=True):
    __tablename__ = "personas"
    
    id: UUID = Field(primary_key=True, default_factory=uuid4)
    owner_user_id: UUID = Field(foreign_key="profiles.user_id", index=True)
    name: str = Field(max_length=100)
    description: str = Field(max_length=500)
    prompt_text: str  # 人格指示文
    avatar_url: str | None = Field(default=None, max_length=500)
    is_shared: bool = Field(default=False, index=True)  # FR-PERSONA-04
    is_blocked: bool = Field(default=False)  # FR-PERSONA-08
    is_builtin: bool = Field(default=False)
    is_deleted: bool = Field(default=False)  # 論理削除 (FR-PERSONA-07)
    usage_count: int = Field(default=0)
    yes_count: int = Field(default=0)  # Yes 採択数 (atomic update のため独立カラム化)
    # yes_acceptance_rate は計算プロパティ (= yes_count / max(usage_count, 1))、DB には持たない
    @property
    def yes_acceptance_rate(self) -> float:
        return self.yes_count / max(self.usage_count, 1)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```
- インデックス: PK `id`, `owner_user_id`, `is_shared` (共有プール検索用)、複合 `(is_shared, is_blocked, is_deleted)` (共有プール表示の主要絞り込み)
- 関連要件: FR-PERSONA-01〜10

#### 1.1.6 `persona_reports` テーブル
```python
class PersonaReport(SQLModel, table=True):
    __tablename__ = "persona_reports"
    
    id: UUID = Field(primary_key=True, default_factory=uuid4)
    persona_id: UUID = Field(foreign_key="personas.id", index=True)
    reporter_user_id: UUID = Field(foreign_key="profiles.user_id")
    reason: str = Field(max_length=30)  # silence-domain / malicious / copyright / other
    detail: str | None = None
    status: str = Field(max_length=30)  # pending / reviewed-blocked / reviewed-dismissed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reviewed_at: datetime | None = None
    
    # UNIQUE 制約 (persona_id, reporter_user_id): 同一ユーザーの重複報告防止
    # Alembic で UniqueConstraint('persona_id', 'reporter_user_id') を追加
```
- インデックス: `persona_id`, `status` (pending 検索)
- **UNIQUE 制約**: `(persona_id, reporter_user_id)` — 同一ユーザーの重複報告防止 (アプリ層では IntegrityError 検出 → 「既に報告済」レスポンス)
- 関連要件: FR-PERSONA-08

#### 1.1.7 `user_persona_selections` テーブル
```python
class UserPersonaSelection(SQLModel, table=True):
    __tablename__ = "user_persona_selections"
    
    user_id: UUID = Field(primary_key=True, foreign_key="profiles.user_id")
    persona_ids: list[UUID] = Field(default_factory=list, sa_column=Column(JSONB))  # max 3
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```
- インデックス: PK `user_id`
- 制約: アプリ層で `persona_ids` の長さを 3 以下に検証 (FR-PERSONA-10)
- 関連要件: FR-PERSONA-03

### 1.2 ER 図 (Mermaid 確認用)

```mermaid
erDiagram
    profiles ||--o{ decisions : "1:N"
    profiles ||--o| preference_profiles : "1:0..1"
    profiles ||--o{ silence_logs : "1:N"
    profiles ||--o{ personas : "owns 1:N"
    profiles ||--o{ persona_reports : "reports 1:N"
    profiles ||--o| user_persona_selections : "1:0..1"
    personas ||--o{ persona_reports : "1:N"
    
    profiles {
        UUID user_id PK
        string email "UNIQUE"
        string age_group "nullable"
        string occupation "nullable"
        JSONB value_tags
        datetime created_at
    }
    decisions {
        UUID id PK
        UUID user_id FK
        string domain_classification
        string user_input
        string user_input_hash "SHA-256"
        JSONB persona_outputs "合議の中間出力"
        string user_choice "yes/no/pending"
        datetime created_at
    }
    preference_profiles {
        UUID user_id PK
        JSONB accepted_patterns "Yes 採択傾向"
        JSONB rejected_patterns
        JSONB persona_style_preference
        datetime last_updated_at
    }
    silence_logs {
        UUID id PK
        UUID user_id FK
        string detected_domain "religion/election/violence/obscene"
        string triggered_by "prompt-self-check/guardrails"
        string user_input_hash "本文は保存せずハッシュのみ"
    }
    personas {
        UUID id PK
        UUID owner_user_id FK
        string name
        string prompt_text "人格指示文"
        bool is_shared "DEFAULT 0"
        bool is_blocked
        int usage_count
    }
    persona_reports {
        UUID id PK
        UUID persona_id FK
        string reason "silence-domain/malicious/copyright/other"
        string status "pending/reviewed-blocked/reviewed-dismissed"
    }
    user_persona_selections {
        UUID user_id PK
        JSONB persona_ids "max 3"
    }
```

---

## 2. Repository Protocols (Python typing.Protocol)

すべて `apps/api/src/application/persistence/` 配下に定義 (純粋なインターフェース、実装非依存)。

### 2.1 `ProfileRepository`
```python
class ProfileRepository(Protocol):
    async def get(self, user_id: UUID) -> Profile | None: ...
    async def upsert(self, profile: Profile) -> Profile: ...
    async def delete(self, user_id: UUID) -> None: ...  # GDPR 準拠
```

### 2.2 `DecisionRepository`
```python
class DecisionRepository(Protocol):
    async def insert(self, decision: Decision) -> Decision: ...
    async def update_choice(self, decision_id: UUID, choice: Literal["yes", "no"], no_count: int) -> Decision: ...
    async def get(self, decision_id: UUID) -> Decision | None: ...
    async def list_by_user(
        self,
        user_id: UUID,
        limit: int = 100,
        offset: int = 0,
        order_by: Literal["created_at_desc", "created_at_asc"] = "created_at_desc",
    ) -> list[Decision]: ...
    async def count_no_by_user(self, user_id: UUID) -> DecisionCountSummary: ...
    # DecisionCountSummary は TypedDict: { "no_count": int, "total": int }
    async def search_by_input_hash(self, user_id: UUID, hash: str) -> list[Decision]: ...
```

### 2.3 `PreferenceProfileRepository`
```python
class PreferenceProfileRepository(Protocol):
    async def get(self, user_id: UUID) -> PreferenceProfile | None: ...
    async def upsert(self, profile: PreferenceProfile) -> PreferenceProfile: ...
    async def delete(self, user_id: UUID) -> None: ...  # FR-LEARN-04 リセット用
```

### 2.4 `SilenceLogRepository`
```python
class SilenceLogRepository(Protocol):
    async def insert(self, log: SilenceLog) -> SilenceLog: ...
    async def list_by_user(self, user_id: UUID, limit: int = 100) -> list[SilenceLog]: ...
    async def count_by_domain(self, user_id: UUID) -> dict[str, int]: ...  # {"religion": 3, "election": 1, ...}
```

### 2.5 `PersonaRepository`
```python
class PersonaRepository(Protocol):
    async def insert(self, persona: Persona) -> Persona: ...
    async def update(self, persona: Persona) -> Persona: ...
    async def soft_delete(self, persona_id: UUID) -> None: ...
    async def get(self, persona_id: UUID) -> Persona | None: ...
    async def list_by_owner(self, owner_id: UUID, include_deleted: bool = False) -> list[Persona]: ...
    async def list_shared(
        self,
        page: int = 0,
        page_size: int = 20,
        sort: Literal["popularity", "newest", "acceptance"] = "popularity",
    ) -> list[Persona]: ...
    async def record_usage(self, persona_id: UUID, was_yes: bool) -> None: ...
    # Atomic update: usage_count += 1, yes_count += (1 if was_yes else 0)
    # 単一 SQL UPDATE で実装、並行リクエストでも lost update なし
    # yes_acceptance_rate は計算プロパティで自動算出
    async def block(self, persona_id: UUID) -> None: ...  # FR-PERSONA-08
```

### 2.6 `PersonaReportRepository`
```python
class PersonaReportRepository(Protocol):
    async def insert(self, report: PersonaReport) -> PersonaReport: ...
    async def list_pending(self) -> list[PersonaReport]: ...
    async def count_by_persona(self, persona_id: UUID, status: str = "pending") -> int: ...
    async def mark_reviewed(self, report_id: UUID, decision: Literal["block", "dismiss"]) -> None: ...
```

### 2.7 `UserPersonaSelectionRepository`
```python
class UserPersonaSelectionRepository(Protocol):
    async def get(self, user_id: UUID) -> UserPersonaSelection | None: ...
    async def upsert(self, selection: UserPersonaSelection) -> UserPersonaSelection: ...
```

---

## 3. ヘルスチェック (`/health` エンドポイント) と認証パターン

NFR Req §AVL-U1-04 で U2 担当として明示。U1 ALB Target Group が呼び出す。

### 3.0 全体の API 認証パターン (重要)

U1 NFR Req §SEC-U1-11 は「ALB → ECS Listener Rule: Cognito 認証必須」だったが、**実装方針として案 B を採用**:

- ❌ 案 A (ALB Listener `authenticate-cognito`) — U1 ApiStack に未実装 (遡及修正なし)
- ✅ **案 B (FastAPI middleware で JWT 検証) — U3 / auth で実装**
  - `apps/api/src/interface/middleware/auth.py` で Bearer Token を検証 (Cognito jwks エンドポイント経由で公開鍵取得 + JWT 検証)
  - 全ての `/v1/*` エンドポイントに認証必須 (FastAPI Depends で強制)
  - `/health` は middleware bypass パスとして特別扱い (認証不要、ALB ヘルスチェック専用)
  - `/internal/events/*` は EventBridge → SQS → ECS Poller パターンのため不要 (内部経路のみ)
- 採用理由: より柔軟 (token 検証ロジックをアプリ側で制御可)、コスト面で同等、ALB Listener Rule の複雑度回避

→ **U3 / auth の Functional Design でこの middleware を詳細化する**

### 3.1 シグネチャ
```python
# apps/api/src/interface/http/health.py
@router.get("/health")
async def health(db: DatabaseHealth = Depends(get_db_health)) -> dict:
    ok = await db.ping()
    return {
        "status": "ok" if ok else "degraded",
        "db": "ok" if ok else "fail",
        "version": APP_VERSION,
    }
```

### 3.2 動作仕様
- DB プール経由で `SELECT 1` を発行、< 100ms で完了
- DB 接続 OK = HTTP 200 + `{"status": "ok"}`
- DB 接続 NG = HTTP 503 + `{"status": "degraded", "db": "fail"}`
- 認証不要 (ALB / ECS health check 用、`/health` は CloudFront → ALB SG をバイパスする必要あり、設計上 ALB Listener で公開)

### 3.3 各バックエンドの ping 実装

| Backend | 実装 |
|---|---|
| **Aurora / Docker PostgreSQL** | `await session.execute(text("SELECT 1"))` で接続性確認 |
| **MOCK** | 常に True を返す (アプリ起動後のみ ping 可能) |

---

## 4. ビジネス・ルール (Repository メソッドの semantics)

### 4.1 `decisions.upsert` / `update_choice` セマンティクス
- 新規依頼 → `insert` でレコード作成、`user_choice = "pending"` で開始
- スワイプ確定時 → `update_choice` で yes/no と `no_attempt_count` を更新
- No 連打時は `no_attempt_count` をインクリメント、`user_choice` は引き続き pending
- 最終的に Yes 確定で `user_choice = "yes"`、ヒストリに残る (no_attempt_count はその時点での累計)

### 4.2 `personas` 論理削除
- `soft_delete(persona_id)` は `is_deleted = True` に更新
- `decisions.persona_outputs` で参照されている (歴史的記録) ため物理削除はしない (FR-PERSONA-07)
- `list_shared` は `is_deleted = False AND is_blocked = False AND is_shared = True` でフィルタ
- `list_by_owner(include_deleted=False)` がデフォルト

### 4.3 `persona_reports` フロー
- ユーザー報告で `insert` (status = pending)
- 同一 persona の pending 件数が 3 以上 → 管理者 (CLI / バッチ) が `mark_reviewed("block")` で `personas.is_blocked = True` に
- 重複報告 (同一 reporter × persona) は `insert` の中で重複チェックして UniqueViolation 等で skip (もしくは UNIQUE 制約)

### 4.4 `preference_profiles` 更新
- `EventBridge → SQS → ECS Poller` 経由で `update_from_decision()` 業務ロジック (U5) が呼ばれ、Repository の `upsert` で書き込み
- FR-LEARN-04 リセット: `delete` で完全リセット (Profile は残す)

### 4.5 `silence_logs` 本文ハッシュ
- 本文は永続化せず、SHA-256 ハッシュのみ保存 (NFR-PRIV-04)
- **hash 計算は U4 / decision の責務** (FastAPI ルーティング層で SilenceGuard が判定 → `hashlib.sha256(text.encode()).hexdigest()` で計算 → U2 SilenceLogRepository.insert に渡す)
- U2 は受け取った hash 値を素通しで永続化 (本文は受け取らない)

---

## 5. Strategy + DI: 3 種のバックエンド切替

### 5.1 アダプタ実装一覧

| Backend | 実装ファイル | 用途 |
|---|---|---|
| **Aurora / PostgreSQL** | `apps/api/src/infrastructure/persistence/sqlmodel_*.py` | 本番 + 開発 (Docker PostgreSQL) |
| **MOCK** | `apps/api/src/infrastructure/persistence/mock_*.py` | CI + 単体テスト |

> Aurora と Docker PostgreSQL は SQLModel 実装を共有 (`DATABASE_URL` 環境変数で接続先を切替)。MOCK のみ別実装。

### 5.2 RepositoryFactory (DI コンテナ)
6 リポジトリ + DatabaseHealth を 1 つの factory クラスにまとめる (DRY 化):

```python
# apps/api/src/infrastructure/persistence/factory.py
class RepositoryFactory:
    def __init__(self, env: AppConfig):
        self.env = env
        # backend に応じて engine / session_factory を構築 (Aurora/Docker は SQLModel 共有)
        if env.storage_backend in ("aurora", "docker-postgres"):
            self.engine = create_async_engine(env.database_url)
            self.session_factory = async_sessionmaker(self.engine)
            self._mock = None
        elif env.storage_backend == "mock":
            self._mock = MockStore()  # in-memory dict 群
        else:
            raise ValueError(f"Unknown STORAGE_BACKEND: {env.storage_backend}")
    
    @property
    def profile_repo(self) -> ProfileRepository:
        return MockProfileRepository(self._mock) if self._mock else SqlModelProfileRepository(self.session_factory)
    
    @property
    def decision_repo(self) -> DecisionRepository: ...
    # (同様に preference / silence / persona / persona_report / user_persona_selection)
    
    @property
    def db_health(self) -> DatabaseHealth:
        return MockDatabaseHealth() if self._mock else SqlModelDatabaseHealth(self.engine)
```

### 5.3 FastAPI Depends 統合
```python
# apps/api/src/interface/http/decisions.py
@router.post("/v1/decisions/request")
async def request_decision(
    body: RequestDecisionDto,
    decisions: DecisionRepository = Depends(get_decision_repository),
    ...
):
    ...
```

`get_decision_repository` は `make_decision_repository(get_app_config())` を返す Depends。

---

## 6. Alembic マイグレーション戦略

### 6.1 ディレクトリ構造
```
apps/api/
├── alembic.ini
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 0001_initial.py            # 7 テーブル + index 全作成
│       └── (将来) 0002_*.py
```

### 6.2 マイグレーションファイル

#### `0001_initial.py`
- 7 テーブル作成 + 各 PK / FK / index
- `persona_reports` の UNIQUE 制約 `(persona_id, reporter_user_id)` を含む
- `Profile` 作成時に Cognito sub を `user_id` に代入する CHECK 制約不要 (アプリ層で検証)
- JSONB カラムのデフォルト値: `'[]'` or `'{}'`

#### `0002_builtin_personas.py`
- 組み込みペルソナ 3 個を seed:
  - **慎重派** (UUID: `00000000-0000-0000-0000-000000000001`)
  - **楽観派** (UUID: `00000000-0000-0000-0000-000000000002`)
  - **効率派** (UUID: `00000000-0000-0000-0000-000000000003`)
- `owner_user_id` = `'00000000-0000-0000-0000-000000000000'` (system user、profiles テーブルに同 UUID を seed)
- `is_builtin = True`, `is_shared = True` (全ユーザーから選択可能), `is_blocked = False`
- 冪等性: migration は INSERT...ON CONFLICT DO NOTHING で重複実行に耐える

### 6.3 マイグレーション実行
```bash
# 開発: Docker PostgreSQL 起動後
cd apps/api
DATABASE_URL=postgresql://yesman:dev@localhost:5432/yesman alembic upgrade head

# 本番: deploy 後 (ECS task 内で一回手動実行 or CDK lambda で自動)
ECS_TASK_ID=$(...) aws ecs execute-command --task $ECS_TASK_ID \
  --container api --command "alembic upgrade head" --interactive
```

---

## 7. インデックスと JSONB 利用方針

### 7.1 インデックス一覧 (NFR Design で確定)

| Table | Index | 用途 |
|---|---|---|
| `profiles` | PK `user_id`, UNIQUE `email` | 標準 |
| `decisions` | PK `id`, FK `user_id`, `created_at DESC`, `user_input_hash` | 時系列クエリ + 重複検出 |
| `preference_profiles` | PK `user_id` | 標準 |
| `silence_logs` | PK `id`, FK `user_id`, `created_at DESC`, `detected_domain` | 集計クエリ |
| `personas` | PK `id`, FK `owner_user_id`, 複合 `(is_shared, is_blocked, is_deleted)` | 共有プール検索 |
| `persona_reports` | PK `id`, FK `persona_id`, `status` | pending 集計 |
| `user_persona_selections` | PK `user_id` | 標準 |

### 7.2 JSONB の利用
- `decisions.persona_outputs`, `preference_profiles.accepted_patterns` 等は **検索しない** (ユーザー専用、user_id で絞り込んだ後にアプリで JSON parse)
- JSONB GIN インデックスは作らない (検索不要、書き込みコスト削減)
- スキーマ進化は JSONB 内で柔軟に対応 (例: persona_outputs に新フィールド追加時 SQL DDL 不要)

---

## 8. PII フィルタリング (NFR-SEC-05)

LLM 送信前の PII フィルタは **U2 のスコープ外** (U4 / decision で LLM 呼び出し前に処理)。U2 は受け取った `user_input` をそのまま保存する。

**ただし**: `silence_logs.user_input_hash` は U2 で計算する (本文は受け取らないため、呼出元 = U4 が `text + hash` を渡す)。

---

## 9. テスト戦略 (NFR-TEST-02 PBT 適用)

| テスト対象 | 種類 |
|---|---|
| Repository protocol の MOCK / Aurora 実装が同一インターフェースに準拠 | コントラクトテスト |
| Decision insert → list → get の roundtrip | Integration |
| PreferenceProfile JSONB シリアライズ・デシリアライズ roundtrip | **PBT** (Hypothesis、NFR-TEST-02) |
| Persona soft_delete → list_by_owner で消える、list_by_owner(include_deleted=True) で残る | Unit |
| persona_reports 3 件で is_blocked auto-update | Integration |
| `/health` エンドポイント: DB 落ち時 503 / 復活で 200 | Integration |

---

## 10. Construction フェーズ次ステージへの引き継ぎ

### → NFR Requirements (次ステージ)
- Aurora p95 < 50ms (NFR Req §PERF-U1-05 と整合)
- 100 同時ユーザー (NFR Req §CAP-U1-01) 想定の接続プール設定
- KMS / Secrets Manager (U1 で構築済) を使用
- PBT 適用ロジック (シリアライズ roundtrip 等)

### → Code Generation
- `apps/api/` ディレクトリ構造
- SQLModel / Pydantic / asyncpg / Alembic / pytest 依存関係
- 6 Repository × 3 種類 (Protocol / Aurora / MOCK) = 18 ファイル + 7 SQLModel + Alembic + Health + DI

---

## 11. 承認チェックリスト

- [x] 7 テーブルすべて SQLModel 定義 (`profiles` / `decisions` / `preference_profiles` / `silence_logs` / `personas` / `persona_reports` / `user_persona_selections`)
- [x] 6 Repository Protocol 定義 (Profile / Decision / PreferenceProfile / SilenceLog / Persona + PersonaReport / UserPersonaSelection)
- [x] Strategy + DI で Aurora / MOCK / Docker PostgreSQL 切替の道筋を明示
- [x] Alembic マイグレーション方針 (0001_initial で 7 テーブル)
- [x] `/health` エンドポイント仕様 (U1 ALB との接続性確認 + DB ping)
- [x] FR-HIST / FR-LEARN / FR-PERSONA / FR-DM-SILENT / FR-CV-06 / NFR-PRIV-04 / NFR-TEST-02 をカバー
- [x] インデックス + JSONB 利用方針確定
- [x] テスト戦略 (PBT 含む) 明示
- [x] 次ステージ (NFR Requirements) への引き継ぎ事項
- [x] 認証統合パターン (案 B: U3 FastAPI middleware で JWT 検証) 明示
- [x] Built-in personas seed migration (`0002_builtin_personas`) 計画
- [x] yes_count カラム + record_usage atomic update 設計
- [x] persona_reports UNIQUE 制約 (重複報告防止)
- [x] RepositoryFactory パターン採用

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-10 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに加わった:

### Mock seed 機能拡張 (`2b08a75`)
- **`infrastructure/persistence/mock_repositories.py`** に `MOCK_SEED_DEMO_DECISIONS=true` 環境変数で demo decision seed を注入する機能を追加
- seed 内容: 30 日 × 平均 3.5 decision/day = 105 件、Yes-ratio が 30% → 95% に持上りするトレンド
- `PreferenceProfile` は `builder.apply_yes/no` で同期的に再構築 (U5 sync path 経由)
- 結果として `persona_style_preference` は demo 用に {慎重派 0.72 / 楽観派 0.91 / 効率派 0.45} に収束
- 影響範囲: ローカル起動 / E2E のみ、prod path には影響なし

### CORS allow_methods 拡張 (`2b08a75`)
- **`infrastructure/config.py`** の CORSMiddleware 設定で `allow_methods` に `PUT` を追加
- 動機: `PersonaSelectionPage` の `PUT /v1/persona-selections/me` preflight が CORS で reject されていた
- 既存の `GET / POST / PATCH / DELETE / OPTIONS` に `PUT` 追加で 6 method 許可

### Repository Protocol への影響
- 上記いずれも Protocol レイヤ (`application/persistence/protocols.py`) を変更しない
- 既存の `DecisionRepository / PreferenceProfileRepository` の signature 不変
- contract test (`apps/api/tests/contract/test_repository_protocol.py`) は再実行で全件 PASS

→ U2 / storage は API surface を維持したまま demo 体験 + CORS 整合の 2 点のみ調整。
