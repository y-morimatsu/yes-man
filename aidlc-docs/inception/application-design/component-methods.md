# Component Methods - YesMan アプリケーション設計

**プロジェクト**: YesMan
**作成日**: 2026-05-09

各コンポーネントの主要メソッドのシグネチャと入出力型を定義する。**詳細なビジネスロジックは Construction フェーズの Functional Design (per-unit) で扱う**。

シグネチャ表記:
- Python は型ヒント付き擬似コード（FastAPI / SQLModel / Pydantic 前提）
- TypeScript は WebApp 側のみ（型のみ表示）

---

## 1. WebApp (PWA / React)

```ts
// 主要 React Hook / 関数（抜粋）
useStartupConsent(): { displayed: boolean, accept: () => void }
useDecisionInput(): { sendText: (text: string) => Promise<DecisionProposal>, sendVoice: (audio: Blob) => Promise<DecisionProposal> }
useSwipe(onYes: () => void, onNo: () => void): SwipeBindings
useAutonomyScore(): { score: number, comment: string, history: ScorePoint[] }
usePreferenceProfile(): { profile: PreferenceProfile, reset: () => void, updateTag: (tag: Tag) => Promise<void> }
useAuth(): { user: User | null, signIn: () => void, signOut: () => void }
```

---

## 2. YesMan API Service - Routes (FastAPI)

OpenAPI で自動生成。主要エンドポイント:

```python
# Auth / Profile
POST   /v1/profiles                  -> ProfileResponse        # 初期プロフィール作成
GET    /v1/profiles/me               -> ProfileResponse
PATCH  /v1/profiles/me               -> ProfileResponse

# Decisions
POST   /v1/decisions/request         -> DecisionProposal       # 入力 → 合議 → 提案 (非ストリーミング、後方互換)
POST   /v1/decisions/request/stream  -> text/event-stream      # FR-CV-01/02/08: SSE で人格発言を逐次配信
POST   /v1/decisions/{id}/yes        -> DecisionResult         # Yes 確定
POST   /v1/decisions/{id}/no         -> DecisionProposal       # No → 別案再生成
POST   /v1/decisions/{id}/no/stream  -> text/event-stream      # FR-CV: No 時の別案合議も SSE
GET    /v1/decisions                 -> list[DecisionRecord]   # 履歴
GET    /v1/decisions/{id}/discussion -> DiscussionTranscript   # FR-CV-05/06: 議論履歴復元 (本人のみ、FR-CV-11)
GET    /v1/decisions/{id}/export     -> JSON | CSV             # FR-CV-10 + FR-HIST-02 連動エクスポート

# Score
GET    /v1/scores/me                 -> AutonomyScore

# Preference
GET    /v1/preferences/me            -> PreferenceProfile
PATCH  /v1/preferences/me            -> PreferenceProfile
DELETE /v1/preferences/me            -> {ok: True}             # 全リセット

# Voice
POST   /v1/voice/transcribe          -> TranscribeResult       # STT
POST   /v1/voice/synthesize          -> SynthesizeResult       # TTS

# Personas (FR-PERSONA-01〜12)
GET    /v1/personas                          -> list[PersonaSummary]   # 自分のペルソナ一覧
POST   /v1/personas                          -> Persona                # 新規作成 (PersonaModerator 経由で検査)
GET    /v1/personas/{id}                     -> Persona
PATCH  /v1/personas/{id}                     -> Persona                # 自作 + 共有未公開のみ編集可
DELETE /v1/personas/{id}                     -> {ok: True}             # 論理削除、履歴は保持
POST   /v1/personas/{id}/share               -> Persona                # 共有許可ON (NFR-PRIV-05 確認ダイアログはフロント側)
POST   /v1/personas/{id}/unshare             -> Persona                # 共有解除
GET    /v1/personas/shared                   -> list[SharedPersonaCard] # 共有プール一覧 (匿名化、人気度順)
GET    /v1/personas/shared/{id}              -> SharedPersonaPreview   # プレビュー (プロンプト全文 + 統計)
POST   /v1/personas/{id}/select              -> {ok: True}             # 合議で使うペルソナとして選択
GET    /v1/personas/selection                -> list[Persona]          # 現在の選択 (最大 3 個)
POST   /v1/personas/{id}/report              -> {ok: True}             # 悪用報告

# Internal (EventBridge API Destinations から呼ばれる)
POST   /internal/events/decision-confirmed  -> {ok: True}      # 嗜好プロファイル非同期更新
POST   /internal/jobs/persona-moderation    -> {ok: True}      # ペルソナ報告のバッチ処理 (FR-PERSONA-08)
```

---

## 3. ドメインサービス（API Service 内モジュール）

### 3.1 DecisionEngine

```python
class DecisionEngine:
    def __init__(self, llm_provider: LLMProviderAdapter,
                 silence_guard: SilenceGuard,
                 nudge_generator: NudgeMessageGenerator,
                 preference_loader: PreferenceProfileBuilder): ...

    def request_decision(self,
                         user_id: UserId,
                         user_input: str,
                         context: DecisionContext) -> DecisionProposal: ...

    def regenerate_alternative(self,
                               user_id: UserId,
                               original_id: DecisionId,
                               no_count: int) -> DecisionProposal: ...
```

### 3.2 ConsensusOrchestrator

```python
class ConsensusOrchestrator:
    """合議プロンプトの構築と LLM 結果の構造化。Lambda オーケストレーションは行わない。"""

    def build_consensus_prompt(self,
                               user_input: str,
                               profile: Profile,
                               preference: PreferenceProfile,
                               personas: list[PersonaPrompt]) -> str: ...

    def parse_consensus_response(self, raw_response: str) -> ConsensusResult: ...
    # ConsensusResult = { final_proposal: str, persona_outputs: list[PersonaOutput], rationale: str }

    def parse_streaming_chunk(self, chunk: str, buffer: StreamBuffer) -> list[StreamEvent]:
        """LLM の chunk を人格別タグ ([@慎重派] など) で切り出して StreamEvent 列に変換 (FR-CV-03)。"""
        ...
```

### 3.2b DiscussionStreamer (FR-CV-01, 02, 06, 08, 09, 12)

```python
class DiscussionStreamer:
    """SSE エンドポイントで合議の発言を逐次配信し、完了時に永続化する。"""

    def __init__(self,
                 decision_engine: DecisionEngine,
                 orchestrator: ConsensusOrchestrator,
                 llm_provider: LLMProviderAdapter,
                 decision_repo: DecisionRepository): ...

    async def stream_decision(self,
                              user_id: UserId,
                              user_input: str,
                              context: DecisionContext) -> AsyncIterator[StreamEvent]:
        """LiteLLM stream=True で chunk 受信 → 人格別タグで切り分けて SSE event を yield。
        ストリーミング中も非同期タスクで完全な合議結果を組立て、最終的に decisions.persona_outputs へ INSERT。
        ネットワーク切断時もバックエンドの永続化は完了する (FR-CV-09)。
        """
        ...

    def stream_decision_fallback(self,
                                  user_id: UserId,
                                  user_input: str,
                                  context: DecisionContext) -> AsyncIterator[StreamEvent]:
        """ストリーミング非対応プロバイダー (CLI 系) は完了後に一括 yield (FR-CV-12)。"""
        ...

    def get_discussion_transcript(self,
                                   decision_id: DecisionId,
                                   viewer_id: UserId) -> DiscussionTranscript:
        """過去の決定の議論を persona_outputs から復元 (FR-CV-05/06)。
        viewer_id != decisions.user_id の場合は AuthorizationError (FR-CV-11)。
        """
        ...

# StreamEvent (SSE event 形式)
# event: persona-utterance
# data: {"persona": "慎重派", "color": "#5C6BC0", "text": "...", "seq": 12}
#
# event: persona-conclusion
# data: {"persona": "慎重派", "stance": "agree" | "disagree" | "supplement"}
#
# event: final-proposal
# data: {"decision_id": "...", "proposal_text": "...", "rationale": "..."}
#
# event: completed
# data: {"decision_id": "..."}
#
# event: error
# data: {"code": "...", "message": "..."}
```

### 3.3 SilenceGuard

```python
class SilenceGuard:
    """沈黙演出ドメイン (宗教 / 選挙 / 暴力 / 卑猥) の判定 + Bedrock Guardrails 連携。"""

    SILENT_DOMAINS = ("religion", "election", "violence", "obscene")

    def is_silent_domain_via_prompt(self, raw_response: str) -> bool: ...
    def apply_guardrails_check(self, raw_response: str) -> GuardrailsResult: ...  # Bedrock のみ
    def silence_response(self) -> SilenceResponse: ...
```

### 3.4 PreferenceProfileBuilder

```python
class PreferenceProfileBuilder:
    def build_initial_profile(self, profile: Profile) -> PreferenceProfile: ...   # cold start
    def update_from_decision(self,
                              user_id: UserId,
                              decision: DecisionRecord) -> PreferenceProfile: ...  # async
    def get_profile(self, user_id: UserId) -> PreferenceProfile: ...
    def reset(self, user_id: UserId) -> PreferenceProfile: ...
    def patch(self, user_id: UserId, updates: PreferencePatch) -> PreferenceProfile: ...
```

### 3.5 AutonomyScorer

```python
class AutonomyScorer:
    def calculate(self, history: list[DecisionRecord]) -> AutonomyScore: ...
    # AutonomyScore = { score_pct: float, no_count: int, total: int,
    #                   ai_comment: str, history_points: list[ScorePoint] }

    def generate_paradoxical_comment(self, score_pct: float) -> str: ...
    # AI 生成の可変コメント
```

### 3.5b PersonaCatalogService (FR-PERSONA-01〜07, 09, 10)

```python
class PersonaCatalogService:
    def __init__(self, persona_repo: PersonaRepository,
                 moderator: PersonaModerator,
                 user_id_provider: UserIdProvider): ...

    # CRUD
    def create(self, owner_id: UserId, definition: PersonaDefinition) -> Persona: ...  # moderator.validate() 経由
    def update(self, persona_id: PersonaId, owner_id: UserId, patch: PersonaPatch) -> Persona: ...
    def delete(self, persona_id: PersonaId, owner_id: UserId) -> None: ...   # 論理削除
    def get(self, persona_id: PersonaId) -> Persona | None: ...
    def list_by_owner(self, owner_id: UserId) -> list[Persona]: ...

    # 共有プール
    def share(self, persona_id: PersonaId, owner_id: UserId) -> Persona: ...    # is_shared = True
    def unshare(self, persona_id: PersonaId, owner_id: UserId) -> Persona: ...  # is_shared = False
    def list_shared(self, page: int = 0, sort: SortOrder = "popularity") -> list[SharedPersonaCard]: ...
    def preview_shared(self, persona_id: PersonaId, viewer_id: UserId) -> SharedPersonaPreview: ...
    # SharedPersonaPreview = { prompt_full, anonymous_creator_id, usage_count, yes_acceptance_rate }

    # 合議用選択
    def select_for_consensus(self, user_id: UserId, persona_ids: list[PersonaId]) -> None: ...   # max 3
    def get_selected(self, user_id: UserId) -> list[Persona]: ...      # 未選択時は組み込み推奨セット
    def get_default_builtin_personas(self) -> list[Persona]: ...        # 慎重派 / 楽観派 / 効率派

    # 統計 (匿名集計)
    def increment_usage(self, persona_id: PersonaId) -> None: ...
    def update_acceptance_rate(self, persona_id: PersonaId, was_yes: bool) -> None: ...
```

### 3.5c PersonaModerator (FR-PERSONA-08, 11, NFR-PRIV-08)

```python
class PersonaModerator:
    """プロンプト検査と悪用報告の処理を担う。"""

    def validate_prompt(self, prompt_text: str) -> ValidationResult: ...
    # ValidationResult = { ok: bool, reason: str | None }
    # 沈黙ドメイン誘発、既存キャラクター名、実在人物名等を検出して拒否

    def filter_at_consensus(self,
                            personas: list[Persona]) -> tuple[list[Persona], list[Persona]]:
        """合議実行時に再検査 (作成時すり抜け対策)。
        Returns (allowed_personas, excluded_personas)
        """
        ...

    def report(self, persona_id: PersonaId, reporter_id: UserId,
               reason: ReportReason) -> PersonaReport: ...
    # ReportReason = "silence-domain" | "malicious" | "copyright" | "other"

    def review_pending_reports(self) -> list[PersonaReport]: ...        # 管理者バッチ
    def block_persona(self, persona_id: PersonaId, admin_id: UserId) -> None: ...   # is_blocked=True
```

### 3.6 NudgeMessageGenerator

```python
class NudgeMessageGenerator:
    """FR-NUDGE-01〜03: 固定文ではなく毎回 AI 生成。"""

    def generate_yes_assertion(self, proposal: DecisionProposal) -> str: ...
    def generate_reconsideration_message(self,
                                          no_count: int,
                                          context: DecisionContext) -> str: ...
    def generate_guilt_microcopy(self,
                                  no_count: int,
                                  user_history: list[DecisionRecord]) -> str: ...
```

### 3.7 AuthAdapter (Strategy + DI)

```python
class AuthAdapter(Protocol):
    def verify_token(self, token: str) -> AuthenticatedUser: ...
    def get_user(self, user_id: UserId) -> AuthenticatedUser: ...

class CognitoAuthAdapter(AuthAdapter): ...
class MockAuthAdapter(AuthAdapter): ...
class CognitoLocalAuthAdapter(AuthAdapter): ...

# 起動時 DI で 1 つ選択
def make_auth_adapter(env: Env) -> AuthAdapter: ...
```

### 3.8 PersistenceAdapter (Strategy + DI / Repository)

```python
class ProfileRepository(Protocol):
    def get(self, user_id: UserId) -> Profile | None: ...
    def upsert(self, profile: Profile) -> Profile: ...

class DecisionRepository(Protocol):
    def insert(self, decision: DecisionRecord) -> DecisionId: ...
    def list_by_user(self, user_id: UserId, limit: int = 100) -> list[DecisionRecord]: ...
    def get(self, decision_id: DecisionId) -> DecisionRecord | None: ...

class PreferenceProfileRepository(Protocol):
    def get(self, user_id: UserId) -> PreferenceProfile | None: ...
    def upsert(self, preference: PreferenceProfile) -> PreferenceProfile: ...
    def delete(self, user_id: UserId) -> None: ...

class PersonaRepository(Protocol):
    def insert(self, persona: Persona) -> PersonaId: ...
    def get(self, persona_id: PersonaId) -> Persona | None: ...
    def list_by_owner(self, owner_id: UserId) -> list[Persona]: ...
    def list_shared(self, page: int, sort: SortOrder) -> list[Persona]: ...
    def update(self, persona: Persona) -> Persona: ...
    def soft_delete(self, persona_id: PersonaId) -> None: ...
    def increment_usage(self, persona_id: PersonaId) -> None: ...

class PersonaReportRepository(Protocol):
    def insert(self, report: PersonaReport) -> ReportId: ...
    def list_pending(self) -> list[PersonaReport]: ...
    def count_by_persona(self, persona_id: PersonaId) -> int: ...
    def mark_reviewed(self, report_id: ReportId, decision: Literal["block", "dismiss"]) -> None: ...

# 実装: Aurora / MOCK / DockerPostgres は同じインターフェース
class AuroraProfileRepository(ProfileRepository): ...
class MockProfileRepository(ProfileRepository): ...
# (同様に他リポジトリも)
```

### 3.9 VoiceAdapter (BE)

```python
class VoiceAdapter(Protocol):
    def transcribe(self, audio: bytes, lang: str = "ja-JP") -> TranscribeResult: ...
    def synthesize(self, text: str, voice: str = "default") -> bytes: ...

class PollyTranscribeAdapter(VoiceAdapter): ...
class WebSpeechApiAdapter(VoiceAdapter): ...   # FE側で完結する場合は no-op
```

### 3.10 LLMProviderAdapter

```python
class LLMProviderAdapter:
    """LiteLLM 経由でプロバイダーを切替。"""

    def complete(self,
                 prompt: str,
                 model: str | None = None,
                 max_tokens: int = 1024,
                 temperature: float = 0.7,
                 stream: bool = False) -> LLMResponse: ...

    async def complete_stream(self,
                               prompt: str,
                               model: str | None = None,
                               max_tokens: int = 1024,
                               temperature: float = 0.7) -> AsyncIterator[LLMChunk]:
        """LiteLLM stream=True を活用 (FR-CV-08)。chunk 単位で yield。"""
        ...

    def supports_streaming(self, provider: str) -> bool: ...
    # CLI 系は False を返し、DiscussionStreamer がフォールバックパスを選択 (FR-CV-12)

    def supported_providers(self) -> list[ProviderInfo]: ...
    # bedrock / openai / anthropic / google / codex-cli / claude-code-cli / gemini-cli / local-llm
```

---

## 4. データモデル (Pydantic / SQLModel ベース)

詳細スキーマは Functional Design 段階で確定。ここでは概要。

```python
class Profile(SQLModel, table=True):
    user_id: UUID  # PK
    age_group: str | None
    occupation: str | None
    value_tags: list[str]  # JSONB
    created_at: datetime
    updated_at: datetime

class DecisionRecord(SQLModel, table=True):
    id: UUID  # PK
    user_id: UUID  # FK
    domain_classification: str
    user_input: str
    proposal_text: str
    persona_outputs: dict  # JSONB ({慎重派: ..., 楽観派: ..., 効率派: ...})
    rationale: str
    user_choice: Literal["yes", "no", "pending"]
    no_attempt_count: int
    llm_provider: str
    created_at: datetime

class PreferenceProfile(SQLModel, table=True):
    user_id: UUID  # PK
    accepted_patterns: list[dict]  # JSONB
    rejected_patterns: list[dict]  # JSONB
    persona_style_preference: dict  # JSONB
    inferred_tags: list[str]
    last_updated_at: datetime

class SilenceLog(SQLModel, table=True):
    id: UUID
    user_id: UUID
    detected_domain: str  # religion/election/violence/obscene
    triggered_by: Literal["prompt-self-check", "guardrails"]
    created_at: datetime

class Persona(SQLModel, table=True):
    id: UUID  # PK
    owner_user_id: UUID  # FK -> profiles.user_id
    name: str
    description: str
    prompt_text: str            # 人格指示文
    avatar_url: str | None
    is_shared: bool = False     # FR-PERSONA-04 (default OFF)
    is_blocked: bool = False    # FR-PERSONA-08 (管理者ブロック)
    is_builtin: bool = False    # 組み込みペルソナ識別
    is_deleted: bool = False    # 論理削除
    usage_count: int = 0
    yes_acceptance_rate: float = 0.0
    created_at: datetime
    updated_at: datetime

class PersonaReport(SQLModel, table=True):
    id: UUID  # PK
    persona_id: UUID  # FK
    reporter_user_id: UUID  # FK
    reason: Literal["silence-domain", "malicious", "copyright", "other"]
    detail: str | None
    status: Literal["pending", "reviewed-blocked", "reviewed-dismissed"]
    created_at: datetime
    reviewed_at: datetime | None

class UserPersonaSelection(SQLModel, table=True):
    """ユーザーが合議で使うペルソナ選択 (最大 3 個)。FR-PERSONA-03"""
    user_id: UUID  # PK
    persona_ids: list[UUID]  # JSONB array, max 3
    updated_at: datetime
```

---

## 5. 契約・エラー応答

```python
# 共通エラー応答 (RFC 7807 ベース)
class ErrorResponse(BaseModel):
    type: str           # URI
    title: str
    status: int
    detail: str
    instance: str
    trace_id: str
```

すべてのエンドポイントは ErrorResponse を 4xx/5xx で返す。

---

## 6. 設計上の注意

- **詳細なビジネスロジック・分岐**は Construction Phase の **Functional Design (per-unit)** で扱う
- 本書は **インターフェース契約** のみを定義
- DI 用設定の具体名・環境変数キーは Infrastructure Design で定める
- スキーマ正規化・インデックス設計は Functional Design / Infrastructure Design で扱う

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-09 承認時の Snapshot を保持。

### AutonomyScorer の method 追加 / 変更
- `_build_history(now: datetime) -> list[ScoreHistoryPoint]` 追加 (`2400f45`、30日 trend)
- `compute()` の `ratio` 計算式: `no_count / total` → `yes_count / total` (`317280b`、意味反転)

### DecisionEngine の signature 拡張
- `__init__(self, ..., preference_repo: PreferenceProfileRepository)` keyword-only 追加 (`07c1c78`)
- `_resolve_personas` 内で `preference_repo.get_by_user(user_id)` を読み、`persona_style_preference` 降順 top-3 を返却
