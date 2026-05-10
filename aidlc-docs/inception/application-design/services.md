# Services - YesMan アプリケーション設計

**プロジェクト**: YesMan
**作成日**: 2026-05-09

サービス層の定義とオーケストレーションパターンを示す。サービスは API Service コンテナ (FastAPI) 内のサブモジュールとして実装し、内部 DI で連携する。コンポーネント分割は [components.md](components.md)、依存関係は [component-dependency.md](component-dependency.md) を参照。

---

## 1. サービス一覧

| Service | 責務 | 主要コンポーネント |
|---|---|---|
| **AuthService** | 認証検証、プロフィール管理 | AuthAdapter, ProfileRepository |
| **DecisionService** | 入力受領 → 合議 → 提案生成 → No時別案再生成 | DecisionEngine, ConsensusOrchestrator, SilenceGuard, NudgeMessageGenerator, LLMProviderAdapter, DecisionRepository |
| **LearningService** | 嗜好プロファイル蓄積・閲覧・修正 | PreferenceProfileBuilder, PreferenceProfileRepository |
| **ScoreService** | 主体性スコアの算出と AI 生成可変コメント | AutonomyScorer, NudgeMessageGenerator, DecisionRepository |
| **VoiceService** | TTS / STT、バックエンド切替 | VoiceAdapter (BE), Polly, Transcribe |
| **EventService** | EventBridge への発火、API Destinations 受信 | EventBridge SDK, FastAPI internal endpoint |
| **PersonaService** | ペルソナ CRUD / 共有プール / 合議用選択 / 悪用報告 (FR-PERSONA) | PersonaCatalogService, PersonaModerator, PersonaRepository, PersonaReportRepository |
| **DiscussionService** | 合議のリアルタイム配信 (SSE) / 議論履歴復元・エクスポート (FR-CV) | DiscussionStreamer, DecisionEngine, ConsensusOrchestrator, LLMProviderAdapter, DecisionRepository |

---

## 2. サービス間オーケストレーション

### 2.1 コア決定ループ (Journey B)

> 📌 **FR-PERSONA 連動 (2026-05-09 追加)**: 本フローの DecisionEngine.request_decision 直前に **PersonaCatalogService.get_selected(user_id)** が呼ばれ、ユーザー選択の合議用ペルソナ最大 3 個が ConsensusOrchestrator に渡される。詳細は **2.5b ペルソナ・カタログ・共有 (Journey G)** セクションを参照。


```
Client (WebApp)
  └──[POST /v1/decisions/request]──► AuthService.verify_token
                                     │
                                     ▼
                                     DecisionService.request_decision
                                     ├─► LearningService.get_profile (preference inject)
                                     ├─► AuthService.get_profile (user context inject)
                                     ├─► DecisionEngine.request_decision
                                     │      ├─► ConsensusOrchestrator.build_consensus_prompt
                                     │      ├─► LLMProviderAdapter.complete (single-prompt 合議)
                                     │      ├─► ConsensusOrchestrator.parse_consensus_response
                                     │      └─► SilenceGuard.is_silent_domain_via_prompt
                                     │            └─► (本番のみ) Bedrock Guardrails
                                     └─► DecisionRepository.insert (status=pending)
                                     │
                                     ▼
                                  DecisionProposal を返却
```

### 2.2 Yes 確定（FR-LEARN 連動）

```
Client
  └──[POST /v1/decisions/{id}/yes]──► DecisionService.confirm_yes
                                       ├─► DecisionRepository.update (user_choice=yes)
                                       ├─► EventService.publish_decision_confirmed (EventBridge)
                                       └─► ScoreService.recalc_score (同期 / cached)
                                       │
                                       ▼
                                       DecisionResult 返却

[非同期]
EventBridge → API Destinations
  └──[POST /internal/events/decision-confirmed]──► LearningService.update_profile_from_decision
                                                    └─► PreferenceProfileBuilder.update_from_decision
                                                          └─► PreferenceProfileRepository.upsert
```

### 2.3 No 連打体験 (Journey C)

```
Client
  └──[POST /v1/decisions/{id}/no]──► DecisionService.handle_no
                                       ├─► DecisionRepository.update (no_attempt_count++)
                                       ├─► DecisionEngine.regenerate_alternative
                                       │      ├─► ConsensusOrchestrator.build_consensus_prompt
                                       │      │     (前回の persona_outputs を文脈に含めて別案要求)
                                       │      ├─► LLMProviderAdapter.complete
                                       │      └─► ConsensusOrchestrator.parse_consensus_response
                                       └─► NudgeMessageGenerator.generate_reconsideration_message
                                            +  generate_guilt_microcopy (no_count に応じ段階強化)
                                       │
                                       ▼
                                       DecisionProposal + NudgeMessages 返却
```

### 2.4 沈黙演出 (Journey D)

```
Client
  └──[POST /v1/decisions/request (沈黙ドメイン入力)]──►
        DecisionService.request_decision
        ├─► DecisionEngine.request_decision
        │     ├─► ConsensusOrchestrator.build_consensus_prompt
        │     │     ※ プロンプト内に「沈黙ドメインの判定 + 該当時は silence: true を出力」指示
        │     ├─► LLMProviderAdapter.complete
        │     └─► ConsensusOrchestrator.parse_consensus_response
        │           └─► SilenceGuard.is_silent_domain_via_prompt → True
        │           [本番のみ] Bedrock Guardrails でも遮断確認
        ├─► SilenceGuard.silence_response
        └─► DecisionRepository.insert (silence_log として記録)
        │
        ▼
        SilenceResponse 返却 (proposal は空、視覚演出フラグのみ)
```

### 2.5 学習効果体験 (Journey E)

- 同期的にはコア決定ループ内で **LearningService.get_profile** が常時呼ばれる
- 非同期では **EventBridge → /internal/events/decision-confirmed → LearningService.update_profile_from_decision** が嗜好プロファイルを更新
- **コールドスタート (E5)**: `request_decision` 内で履歴 0 件を検知 → AuthService.get_profile から推定初期嗜好を生成 (PreferenceProfileBuilder.build_initial_profile)

### 2.5b ペルソナ・カタログ・共有 (Journey G)

```
作成・編集 (G1, G2):
Client
  └──[POST /v1/personas]──► PersonaService.create
                              ├─► PersonaModerator.validate_prompt
                              │     └─► (沈黙ドメイン誘発検知 → 拒否 / OK → 続行)
                              └─► PersonaRepository.insert (is_shared=False)
                              │
                              ▼
                              Persona 返却

共有公開 (G3):
Client
  └──[POST /v1/personas/{id}/share]──► PersonaService.share
                                          ├─► PersonaRepository.update (is_shared=True)
                                          └─► (将来: Search Index 更新など)

共有プール閲覧・選択 (G4, G5):
Client
  ├──[GET /v1/personas/shared]──► PersonaService.list_shared
  │                                 └─► PersonaRepository.list_shared (匿名化済)
  ├──[GET /v1/personas/shared/{id}]──► PersonaService.preview_shared
  │                                       └─► プロンプト全文 + 集計統計を返却
  └──[POST /v1/personas/{id}/select]──► PersonaService.select_for_consensus
                                          └─► UserPersonaSelection 更新 (max 3)

合議実行時の連動 (G7、Journey B との接続):
DecisionEngine.request_decision
  ├─► PersonaCatalogService.get_selected(user_id)
  ├─► PersonaModerator.filter_at_consensus(personas)
  │     └─► (沈黙ドメイン誘発を再検知 → 除外、残り 0 個なら組み込みフォールバック)
  ├─► ConsensusOrchestrator.build_consensus_prompt(input, profile, preference, allowed_personas)
  ├─► LLMProviderAdapter.complete(...)
  └─► PersonaCatalogService.increment_usage / update_acceptance_rate (Yes 時)

悪用報告 (G6):
Client
  └──[POST /v1/personas/{id}/report]──► PersonaService.report
                                          └─► PersonaReportRepository.insert (status=pending)
                                          │
                                          ▼ (後日バッチ)
                                          管理者バッチ
                                            └─► count >= 3 → PersonaService.block
                                                   └─► PersonaRepository.update (is_blocked=True)
```

### 2.5c 合議リアルタイム表示・議論履歴 (Journey B7/B8、FR-CV)

> **追加日**: 2026-05-10 (FR-CV: 合議の透明性・リアルタイム表示)

```
リアルタイム合議ストリーミング (B7、FR-CV-01〜04, 08, 09, 12):
Client (LiveDiscussionView)
  └──[POST /v1/decisions/request/stream (SSE)]──► AuthService.verify_token
                                                    │
                                                    ▼
                                                    DiscussionService.stream_decision
                                                    ├─► PersonaCatalogService.get_selected
                                                    ├─► PersonaModerator.filter_at_consensus
                                                    ├─► LearningService.get_profile
                                                    ├─► AuthService.get_profile
                                                    ├─► ConsensusOrchestrator.build_consensus_prompt
                                                    │
                                                    ├─► [provider.supports_streaming?]
                                                    │     ├─ Yes → LLMProviderAdapter.complete_stream (FR-CV-08)
                                                    │     │       │
                                                    │     │       ▼ (chunk 受信ごと)
                                                    │     │       ConsensusOrchestrator.parse_streaming_chunk
                                                    │     │         └─► yield event: persona-utterance (FR-CV-01/03)
                                                    │     │
                                                    │     └─ No (CLI 系) → stream_decision_fallback (FR-CV-12)
                                                    │             └─► complete (一括) → 受信後に逐次 yield
                                                    │
                                                    ├─► [非同期で並行] 完全な合議結果を組立 → DecisionRepository.insert (FR-CV-06/09)
                                                    │
                                                    └─► yield event: final-proposal → completed
                                                           │
                                                           ▼
                                                           Client は最終提案カードへ切替 (FR-CV-04)

ネットワーク切断時 (FR-CV-09):
- バックエンド側の DecisionRepository.insert は SSE 切断と独立に完了する
- Client 再接続時:
    └──[GET /v1/decisions/{id}/discussion]──► DiscussionService.get_discussion_transcript
                                                  └─► persona_outputs から復元 (FR-CV-05/06)

議論履歴ビュー (B8、FR-CV-05〜07, 10, 11):
Client (DiscussionHistoryView)
  ├──[GET /v1/decisions/{id}/discussion]──► DiscussionService.get_discussion_transcript
  │                                            ├─► AuthService.verify_token
  │                                            ├─► DecisionRepository.get(decision_id)
  │                                            ├─► [decision.user_id == viewer_id?] (FR-CV-11)
  │                                            │     └─ No → 403 Forbidden
  │                                            └─► persona_outputs を時系列に再構築して返却
  │
  └──[GET /v1/decisions/{id}/export?format=json|csv]──► DiscussionService.export_decision
                                                          └─► ユーザー入力 + 各人格発言 + 最終結論をフラット出力 (FR-CV-10)
```

**SSE エンドポイント実装上の留意**:
- ALB のアイドルタイムアウトを SSE が成立する長さ (例: 60 秒以上) に拡張 (FR-CV / 要件 5 章 AWS 構成)
- FastAPI 側は `StreamingResponse(media_type="text/event-stream")` を返却
- LLM への送信前 PII フィルタは chunk 配信前にも適用 (NFR-SEC-05)
- 議論履歴は本人のみ閲覧 (FR-CV-11、NFR-PRIV)

---

### 2.6 設定切替 (Journey F)

設定切替はサービスのオーケストレーションではなく **DI コンテナの起動時組み立て** で実現:

```python
# main.py (FastAPI 起動時)
auth_adapter = make_auth_adapter(env)               # cognito / mock / cognito-local
profile_repo = make_profile_repository(env)         # aurora / mock / docker-postgres
llm_adapter = make_llm_adapter(env)                 # litellm-bedrock / openai / claude-code-cli ...
voice_adapter = make_voice_adapter(env)             # polly-transcribe / web-speech-api

app = FastAPI(...)
app.dependency_overrides[AuthAdapter] = lambda: auth_adapter
# ...
```

各サービスはコンストラクタで Adapter を受け取り、DI 経由で本番/MOCK/エミュレータが切り替わる。

---

## 3. オーケストレーションの原則

| 原則 | 説明 |
|---|---|
| **Fat Service / Thin Route** | FastAPI ルートは入力検証と Service 呼び出しのみ。ビジネスロジックは Service 層 |
| **同期処理は最短経路** | 提案生成は同期、嗜好プロファイル更新は非同期 (FR-LEARN-07) |
| **Single Prompt 合議** | LLM 呼び出しは 1 プロンプトで完結 (FR-AI-08)、Lambda オーケストレーションなし |
| **Strategy + DI** | バックエンド切替（認証 / DB / LLM / 音声）はすべて Strategy パターン + 起動時 DI |
| **Repository パターン** | DB アクセスは Repository 経由のみ。SQL は Repository 内に閉じる |
| **イベント駆動の非同期** | 決定確定は EventBridge にイベント発火、購読側 (`/internal/events/...`) で処理 |
| **可変メッセージは AI 生成** | NudgeMessageGenerator は固定文を保持しない (FR-NUDGE-01〜03) |
| **沈黙ガードは多層** | プロンプト判定 + Bedrock Guardrails の二重化 (FR-AI-06) |
| **ストリーミング配信 + バックエンド完了保証** | SSE は LiteLLM stream=True 活用 (FR-CV-08)。クライアント切断と独立にバックエンドは合議を完了し永続化する (FR-CV-09)。CLI 系プロバイダーは完了後一括にフォールバック (FR-CV-12) |

---

## 4. トランザクション境界

| 操作 | TX 境界 |
|---|---|
| Yes 確定 | DecisionRepository.update + EventService.publish の両方を **同一 DB TX に含めない**（EventBridge 発火失敗は記録した上で再送）|
| 嗜好プロファイル更新 (非同期) | PreferenceProfileRepository.upsert のみ単独 TX |
| プロフィール作成 | ProfileRepository.upsert 単独 TX |
| 決定リクエスト | DecisionRepository.insert のみ単独 TX（LLM 呼び出しは TX 外） |

EventBridge 発火失敗時はリトライ可能なメッセージとして outbox テーブルに保存し、定期再送する Outbox パターンを将来適用可能（ハッカソン MVP では best-effort で OK）。

---

## 5. エラーハンドリング戦略

| 種別 | 戦略 |
|---|---|
| LLM API 呼び出し失敗 | LiteLLM フォールバックで代替プロバイダーへ自動切替 (NFR-AVAIL-03) |
| Bedrock Guardrails 違反 | SilenceGuard.silence_response を返す（ユーザーには沈黙演出として表示）|
| DB 接続失敗 | 5xx を返す + ALB ヘルスチェック失敗 → ECS が新コンテナ起動 |
| Cognito 検証失敗 | 401 Unauthorized |
| 入力バリデーション失敗 | 400 Bad Request (RFC 7807 形式) |
| EventBridge 発火失敗 | ログ記録 + 同期 fallback（DecisionRepository に sync 更新フラグ）|

---

## 6. 観測性の埋め込み

各サービスメソッドに以下を埋め込む:

- **構造化ログ**: 入出力の要約 + correlation_id (FastAPI ミドルウェアで自動付与)
- **メトリクス**: `decision.requested`, `decision.yes`, `decision.no`, `silence.triggered`, `score.calculated` 等のカウンタとレイテンシ
- **トレース**: X-Ray セグメント (FastAPI → Service → Repository → 外部 API)
