# Component Dependency - YesMan アプリケーション設計

**プロジェクト**: YesMan
**作成日**: 2026-05-09

依存マトリクス、通信パターン、データフロー図を示す。コンポーネントは [components.md](components.md)、サービスオーケストレーションは [services.md](services.md) を参照。

---

## 1. 依存マトリクス

行 = 呼び出し元、列 = 呼び出し先。`→` は同期呼び出し、`⇢` は非同期、`⊨` は DI 依存。

|  | WebApp | Cognito | ALB | API Service | DecisionEngine | LearningSvc | ScoreSvc | VoiceAdapter | LLMAdapter | LiteLLM | Bedrock | Polly/Trans | Aurora | EventBridge | SecretsMgr | CloudWatch |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **WebApp** | — | → | → | (via ALB) | | | | (FE: Web Speech) | | | | | | | | |
| **ALB** | | | — | → | | | | | | | | | | | | |
| **API Service** | | (verify token) | | — | ⊨ | ⊨ | ⊨ | ⊨ | ⊨ | | | | (via Repo) | → (publish) | → (read) | ⇢ (logs/metrics/traces) |
| **DecisionEngine** | | | | | — | (read profile) | | | → | | | | (via Repo) | | | |
| **LearningService** | | | | | | — | | | | | | | (via Repo) | | | |
| **ScoreService** | | | | | | | — | | | | | | (via Repo) | | | |
| **VoiceAdapter (BE)** | | | | | | | | — | | | | → | | | | |
| **LLMAdapter** | | | | | | | | | — | → | | | | | (read API key) | |
| **LiteLLM** | | | | | | | | | | — | → | | | | | |
| **EventBridge** | | | → (API Destinations) | | | | | | | | | | | — | | |
| **API Destinations** | | | → (POST /internal/events/*) | | | | | | | | | | | | | |

---

## 2. データフロー図 (Mermaid)

### 2.1 起動 → 認証 → ホーム到達 (Journey A)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as WebApp (PWA)
    participant CF as CloudFront/S3
    participant CG as Cognito (Hosted UI)
    participant API as API Service (FastAPI)
    participant Aur as Aurora

    U->>W: 起動 (PWA インストール済み)
    W->>CF: 静的アセット取得
    CF-->>W: HTML/JS/CSS
    W->>U: 趣旨説明・免責表示 (FR-NUDGE-04)
    U->>W: 「同意」スワイプ
    W->>CG: ログイン (Hosted UI リダイレクト)
    CG-->>W: ID Token / Access Token
    W->>API: POST /v1/profiles (初回時)
    API->>Aur: INSERT profiles
    Aur-->>API: profile
    API-->>W: ProfileResponse
    W->>U: ホーム画面表示
```

### 2.2 コア決定ループ + Yes 確定 (Journey B + Journey E 非同期)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as WebApp
    participant API as API Service
    participant DE as DecisionEngine
    participant LS as LearningService
    participant LLM as LLMAdapter / LiteLLM
    participant SG as SilenceGuard
    participant Aur as Aurora
    participant EB as EventBridge
    participant APIDest as API Destinations

    U->>W: テキスト入力 (例: 「ランチを決めて」)
    W->>API: POST /v1/decisions/request
    API->>LS: get_profile(user_id) (嗜好プロファイル)
    LS->>Aur: SELECT preference_profiles
    Aur-->>LS: PreferenceProfile
    API->>DE: request_decision(input, context)
    DE->>LLM: complete(consensus_prompt) (single-prompt 合議)
    LLM-->>DE: ConsensusResult (final + persona_outputs)
    DE->>SG: is_silent_domain_via_prompt(raw)
    Note over SG: 沈黙ドメイン判定<br/>本番では Bedrock Guardrails も
    SG-->>DE: (false → 通常応答)
    DE-->>API: DecisionProposal
    API->>Aur: INSERT decisions (status=pending)
    API-->>W: DecisionProposal
    W->>U: 提案表示 + スワイプ Yes/No

    U->>W: 右スワイプ (Yes)
    W->>API: POST /v1/decisions/{id}/yes
    API->>Aur: UPDATE decisions SET user_choice='yes'
    API->>EB: publish_event(DecisionConfirmed)
    EB-->>API: ack
    API-->>W: DecisionResult
    W->>U: 肯定演出 + スコア更新

    %% 非同期
    EB->>APIDest: forward DecisionConfirmed
    APIDest->>API: POST /internal/events/decision-confirmed
    API->>LS: update_profile_from_decision
    LS->>Aur: UPSERT preference_profiles
```

### 2.3 No 連打体験 (Journey C)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as WebApp
    participant API as API Service
    participant DE as DecisionEngine
    participant NMG as NudgeMessageGenerator
    participant LLM as LLMAdapter
    participant Aur as Aurora

    U->>W: 左スワイプ (No)
    W->>API: POST /v1/decisions/{id}/no
    API->>Aur: UPDATE decisions SET no_attempt_count++
    Aur-->>API: no_count = N

    par 別案再生成
        API->>DE: regenerate_alternative(id, no_count=N)
        DE->>LLM: complete(consensus_prompt + previous outputs)
        LLM-->>DE: 別案 ConsensusResult
        DE-->>API: 新 DecisionProposal
    and 可変ナッジメッセージ生成
        API->>NMG: generate_reconsideration_message(no_count)
        NMG->>LLM: complete(prompt for reconsideration)
        LLM-->>NMG: variable msg
        API->>NMG: generate_microcopy(no_count, history)
        NMG->>LLM: complete(prompt for reconsideration microcopy)
        LLM-->>NMG: variable copy
    end

    API-->>W: DecisionProposal + NudgeMessages
    W->>U: 別案 + 「本当に？」+ 再考マイクロコピー
```

### 2.4 沈黙演出 (Journey D)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as WebApp
    participant API as API Service
    participant DE as DecisionEngine
    participant LLM as LLMAdapter
    participant SG as SilenceGuard
    participant BG as Bedrock Guardrails
    participant Aur as Aurora

    U->>W: 「来週の選挙で誰に投票すべき?」と入力
    W->>API: POST /v1/decisions/request
    API->>DE: request_decision
    DE->>LLM: complete(consensus_prompt with silent-domain self-check instruction)
    LLM-->>DE: response (silence: true)
    DE->>SG: is_silent_domain_via_prompt → True
    Note over SG: 本番のみ
    SG->>BG: apply_guardrails_check
    BG-->>SG: blocked
    SG-->>DE: SilenceResponse
    DE-->>API: SilenceResponse
    API->>Aur: INSERT silence_logs
    API-->>W: SilenceResponse
    W->>U: 「…」演出 + ホームへ静かに戻る
```

### 2.5 設定切替 (Journey F / DI 起動時)

```mermaid
flowchart LR
    subgraph EnvVars["環境変数 / Secrets Manager"]
        AUTH_BACKEND["AUTH_BACKEND<br>cognito | mock | cognito-local"]
        STORAGE_BACKEND["STORAGE_BACKEND<br>aurora | mock | docker-postgres"]
        LLM_PROVIDER["LLM_PROVIDER<br>bedrock | openai | local-llm | claude-code-cli ..."]
        VOICE_BACKEND["VOICE_BACKEND<br>aws | web-speech-api"]
    end

    subgraph DIContainer["FastAPI 起動時 DI"]
        AuthFactory["make_auth_adapter(env)"]
        ProfileFactory["make_profile_repository(env)"]
        DecisionFactory["make_decision_repository(env)"]
        PrefFactory["make_preference_repository(env)"]
        LLMFactory["make_llm_adapter(env)"]
        VoiceFactory["make_voice_adapter(env)"]
    end

    subgraph Adapters["Adapter 実装 (Strategy)"]
        Cog["CognitoAuthAdapter"]
        MockAuth["MockAuthAdapter"]
        CogLocal["CognitoLocalAuthAdapter"]
        AurRepo["AuroraXxxRepository"]
        MockRepo["MockXxxRepository"]
        DockerRepo["DockerPostgresXxxRepository"]
        LiteLLMAdp["LiteLLMProviderAdapter"]
        Polly["PollyTranscribeAdapter"]
        WebSpeech["WebSpeechApiAdapter"]
    end

    AUTH_BACKEND --> AuthFactory
    STORAGE_BACKEND --> ProfileFactory
    STORAGE_BACKEND --> DecisionFactory
    STORAGE_BACKEND --> PrefFactory
    LLM_PROVIDER --> LLMFactory
    VOICE_BACKEND --> VoiceFactory

    AuthFactory --> Cog
    AuthFactory --> MockAuth
    AuthFactory --> CogLocal
    ProfileFactory --> AurRepo
    ProfileFactory --> MockRepo
    ProfileFactory --> DockerRepo
    LLMFactory --> LiteLLMAdp
    VoiceFactory --> Polly
    VoiceFactory --> WebSpeech
```

---

## 3. 通信パターン一覧

| 経路 | プロトコル | 認証 |
|---|---|---|
| WebApp ↔ Cognito | HTTPS (OAuth2 PKCE) | — |
| WebApp ↔ ALB ↔ API Service | HTTPS (REST + OpenAPI) | Cognito Bearer Token |
| API Service ↔ Aurora | TCP/TLS (libpq) | IAM 認証 or Secrets Manager DB credentials |
| API Service ↔ LiteLLM ↔ Bedrock | HTTPS (AWS SigV4) | IAM Role for Task |
| API Service ↔ LiteLLM ↔ OpenAI/Anthropic/Google | HTTPS | API Key (Secrets Manager) |
| API Service ↔ LiteLLM ↔ Codex CLI / Claude Code CLI / Gemini CLI | サブプロセス起動 | (CLI 内部認証) |
| API Service ↔ LiteLLM ↔ ローカル LLM | HTTP (Ollama 等) | (ローカル) |
| API Service ↔ Polly / Transcribe | HTTPS (AWS SigV4) | IAM Role for Task |
| API Service → EventBridge | HTTPS (AWS SigV4) | IAM Role for Task |
| EventBridge → API Destinations → ALB → API Service | HTTPS (Event 配信) | API Destination 認証 (Secrets Manager) |

---

## 4. ネットワーク・セキュリティ境界

```mermaid
flowchart TB
    Internet((Internet))
    User((User Browser))

    subgraph AWS["AWS Account"]
        subgraph EdgeNet["Edge"]
            CF["CloudFront"]
            S3["S3 (Static)"]
            CGUI["Cognito Hosted UI"]
        end

        subgraph VPC["VPC (新規作成)"]
            subgraph Pub["Public Subnet"]
                ALB["ALB + ACM"]
                NAT["NAT Gateway"]
            end

            subgraph Priv["Private Subnet"]
                ECS["ECS Fargate Tasks<br>(API Service)"]
                Aurora["Aurora Serverless v2"]
            end
        end

        subgraph Async["EventBridge / Other"]
            EB["EventBridge Bus"]
            APIDest["API Destinations"]
        end

        subgraph Mgmt["Managed Services"]
            Bedrock["Bedrock + Guardrails"]
            Polly["Polly"]
            Transcribe["Transcribe"]
            SM["Secrets Manager"]
            CW["CloudWatch / X-Ray"]
        end
    end

    User --> CF
    User --> CGUI
    User --> ALB
    CF --> S3
    ALB --> ECS
    ECS --> Aurora
    ECS --> NAT
    NAT --> Bedrock
    NAT --> Polly
    NAT --> Transcribe
    NAT --> EB
    NAT --> SM
    EB --> APIDest
    APIDest --> ALB
    ECS -.logs/metrics.-> CW

    style EdgeNet fill:#FFE0B2
    style VPC fill:#BBDEFB
    style Pub fill:#C8E6C9
    style Priv fill:#E1BEE7
    style Async fill:#D7CCC8
    style Mgmt fill:#FFF59D
```

セキュリティ要点:
- **Aurora は Private Subnet 内**、外部から直接アクセス不可
- **ECS Tasks は Private Subnet**、外部 (Bedrock/Polly等) アクセスは NAT Gateway 経由
- **ALB のみ Public Subnet** で HTTPS 受け
- **API Destinations** は Public な HTTPS エンドポイント (ALB) 経由で API Service の `/internal/events/*` にイベント配送（Secrets Manager で発行する Bearer Token で認証）
- **Cognito Hosted UI** は別ドメインで運用 (CloudFront 経由でカスタムドメインに統合可能)

---

## 5. 起動順序の依存

| 順 | コンポーネント | 依存 |
|---|---|---|
| 1 | VPC + サブネット + NAT | — |
| 2 | Aurora Cluster | VPC |
| 3 | ECS Cluster + Task Definition | VPC + ECR |
| 4 | ALB + ACM 証明書 | VPC |
| 5 | ECS Service (API Service コンテナ起動) | Aurora migrate 完了 + Secrets Manager + Cognito User Pool |
| 6 | EventBridge + API Destinations | API Service が起動済み |
| 7 | CloudFront + S3 (フロント配信) | (独立、並列可能) |
| 8 | Cognito User Pool | (独立、並列可能) |

CDK は依存順を自動解決するため、上記は手動オペレーションではなく `cdk deploy` 内の依存ツリーが反映する。
