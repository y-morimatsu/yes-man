# YesMan API — Runbook

このドキュメントは **apps/api/ (Python FastAPI) の運用手順** を記述する。インフラ (AWS リソース) 側の手順は `infra/RUNBOOK.md` (U1 / infra) を参照のこと。

---

## 1. ローカル開発環境

### 1.1 セットアップ

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

### 1.2 環境変数 (`.env` ファイルを `apps/api/` 直下に置く)

```env
APP_ENV=dev
STORAGE_BACKEND=docker-postgres         # or mock
AUTH_BACKEND=mock
LLM_PROVIDER=mock
VOICE_BACKEND=mock
EVENT_BACKEND=sync
DATABASE_URL=postgresql+asyncpg://yesman:dev@localhost:5432/yesman
```

`STORAGE_BACKEND=mock` の場合は in-memory 動作で PostgreSQL 不要。

### 1.3 アプリ起動

```bash
uvicorn yesman_api.main:app --host 0.0.0.0 --port 8000 --reload
```

`GET http://localhost:8000/health` で確認。

---

## 2. テスト実行

### 2.1 単体テスト (PostgreSQL 不要)

```bash
pytest tests/unit tests/contract
```

### 2.2 Property-Based Test (Hypothesis、JSONB roundtrip)

```bash
pytest tests/property
```

### 2.3 Integration テスト (Docker PostgreSQL)

```bash
# 1. PostgreSQL 起動 (リポジトリ root の docker-compose で)
docker compose up -d postgres

# 2. テスト用 URL を環境変数で渡す
export YESMAN_TEST_DATABASE_URL="postgresql+asyncpg://yesman:dev@localhost:5432/yesman_test"

# 3. 実行
pytest tests/integration -m integration
```

---

## 3. Alembic Migration (ローカル / Docker PostgreSQL)

```bash
# DATABASE_URL を設定したうえで
alembic upgrade head             # 最新まで適用
alembic downgrade -1             # 1 つ戻す
alembic current                  # 現在の revision を確認
alembic history                  # 履歴
```

### 3.1 新しい migration を追加

```bash
alembic revision -m "add foo column"
# alembic/versions/ 下に新ファイル生成 → 編集 → upgrade
```

---

## 4. Alembic Migration on Production (Aurora)

本番 Aurora は ECS Task の中から ECS Exec で migration を実行する。

### 4.1 手順

```bash
# 1. ECS Task ID を取得
TASK_ID=$(aws ecs list-tasks --cluster yesman-prod-cluster --service-name yesman-prod-api \
  --query 'taskArns[0]' --output text)

# 2. ECS Exec で migration を 1 回手動実行
aws ecs execute-command \
  --cluster yesman-prod-cluster \
  --task $TASK_ID \
  --container api \
  --interactive \
  --command "alembic upgrade head"
```

### 4.2 完了確認

- ログに `INFO [alembic.runtime.migration] Running upgrade -> 0001_initial` が出ること
- `0002_builtin_personas` も適用されること
- `personas` テーブルに 3 件 (慎重派/楽観派/効率派) が seed されていること:

```bash
aws ecs execute-command \
  --cluster yesman-prod-cluster \
  --task $TASK_ID \
  --container api \
  --interactive \
  --command "psql -c \"SELECT name FROM personas WHERE is_builtin = true;\""
```

### 4.3 ロールバック

問題が発生した場合は `alembic downgrade -1` で 1 段戻せるが、本番では **新しい up migration を書いて修正する** 方が安全 (down migration の冪等性を 100% 保証できない場合があるため)。

---

## 5. Backend Swap (Strategy + DI Pattern)

`STORAGE_BACKEND` 環境変数で 3 種類のバックエンドを切替:

| 値 | 用途 | データ永続 |
|---|---|---|
| `aurora` | 本番 (ECS + Aurora Serverless v2) | ◯ |
| `docker-postgres` | ローカル開発 + integration test | ◯ (Docker volume) |
| `mock` | unit test + CI (PostgreSQL なしで動く) | ✕ (in-memory) |

実装は `apps/api/src/yesman_api/infrastructure/persistence/factory.py::RepositoryFactory` を参照。

---

## 6. アーキテクチャ

```
src/yesman_api/
├── domain/persistence/          # SQLModel テーブル (純粋ドメイン)
├── application/persistence/     # Repository Protocol (interface)
├── infrastructure/              # 実装層
│   ├── config.py                # AppConfig (pydantic-settings)
│   └── persistence/
│       ├── engine.py            # AsyncEngine factory
│       ├── factory.py           # RepositoryFactory (DI entry)
│       ├── sqlmodel_repositories.py  # Aurora / Docker 実装
│       └── mock_repositories.py # in-memory 実装
├── interface/                   # HTTP 層
│   ├── deps.py                  # FastAPI Depends
│   └── http/health.py           # GET /health
└── main.py                      # FastAPI app + lifespan
```

---

## 7. U3 / auth — 認証 & プロフィール API (2026-05-16 追加)

### 7.1 認証バックエンド切替 (FR-AUTH-05 / NFR-EXT-04)

`AUTH_BACKEND` 環境変数で 3 種から選択:

| 値 | 用途 | 必須環境変数 |
|---|---|---|
| `mock` | CI / 自動テスト / オフライン開発 (dev/ci 限定) | `MOCK_USER_SUB`, `MOCK_USER_EMAIL` |
| `cognito-local` | ローカル開発 ([jagregory/cognito-local](https://github.com/jagregory/cognito-local) Docker) | `COGNITO_LOCAL_ISSUER_URL`, `COGNITO_APP_CLIENT_ID` |
| `cognito` | 本番 (AWS Cognito User Pool) | `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `COGNITO_HOSTED_UI_URL` |

`stg` / `prod` で `mock` を指定すると起動拒否 (SEC-U3-11)。

### 7.2 ローカル動作確認

```bash
# 1. Mock backend (DB 不要、最速確認)
cp .env.example .env  # AUTH_BACKEND=mock, STORAGE_BACKEND=mock
uvicorn yesman_api.main:app --port 8000

# 2. 3 パターン curl
curl -i http://localhost:8000/health                                                # 200
curl -i http://localhost:8000/v1/profiles/me                                        # 401 reason=missing
curl -i -H "Authorization: Bearer mock-expired" http://localhost:8000/v1/profiles/me # 401 reason=expired
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/profiles/me    # 200 + Profile

# 3. MOCK_AUTO_USER=true (Authorization header 省略可)
echo 'MOCK_AUTO_USER=true' >> .env
# uvicorn 再起動後
curl http://localhost:8000/v1/profiles/me                                           # 200

# 4. PATCH (部分更新)
curl -i -X PATCH -H "Authorization: Bearer anything" -H "Content-Type: application/json" \
  -d '{"age_group": "30s", "gender": ["female"], "occupation": "engineer"}' \
  http://localhost:8000/v1/profiles/me

# 5. DELETE
curl -i -X DELETE -H "Authorization: Bearer anything" http://localhost:8000/v1/profiles/me  # 204
```

### 7.3 cognito-local (Docker)

```bash
docker run -d -p 9229:9229 -v $(pwd)/.cognito-local:/app/.cognito jagregory/cognito-local
# Cognito-local の REST API でユーザー作成 (https://github.com/jagregory/cognito-local#readme)
# .env で AUTH_BACKEND=cognito-local + COGNITO_LOCAL_ISSUER_URL を設定
uvicorn yesman_api.main:app --port 8000
```

### 7.4 Alembic 0003 (gender + preferences 追加)

```bash
# Docker Postgres 起動
docker run -d --name yesman-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

# 0003 まで適用
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost/postgres \
  STORAGE_BACKEND=docker-postgres \
  alembic upgrade head
# (PG 13+ で JSONB DEFAULT 定数式は fast-path、Aurora 15+ 想定で本番でも瞬時)
```

### 7.5 CDK スナップショット更新手順 (U1 修正後)

```bash
cd infra
pnpm test -- --updateSnapshot  # snapshot 更新
git diff -- test/__snapshots__/  # diff レビュー (環境変数 6 個増えていること確認)
```

### 7.6 SSM Parameter ブートストラップ (初回デプロイ前のみ)

```bash
for env in dev stg prod; do
  aws ssm put-parameter --name /yesman/${env}/cloudfront-url --type String \
    --value 'https://placeholder.cloudfront.net' \
    --description 'CORS bootstrap, overwritten by EdgeStack deploy'
done
```

### 7.7 認証エラー reason (401 レスポンス `reason` フィールド)

| reason | 意味 | クライアント対応 |
|---|---|---|
| `missing` | Authorization header 無し or Bearer prefix 無し | ログイン誘導 |
| `malformed` | JWT 形式不正 | 同上 |
| `expired` | `exp` 過ぎ | refresh token で再取得 |
| `invalid_signature` | 署名検証失敗 | ログイン誘導 |
| `issuer_mismatch` | `iss` 不一致 | (運用エラー、token 取得先確認) |
| `audience_mismatch` | `aud` / `client_id` 不一致 | 同上 |
| `unknown_kid` | JWKS に kid なし | 一時的、しばらく後 retry |
| `algorithm_mismatch` | RS256 以外 | ログイン誘導 |
| `token_use_unsupported` | `id` / `access` 以外 | (運用エラー) |
| `jwks_unavailable` | Cognito JWKS 障害 | 503 同等、しばらく後 retry |
| `userinfo_unavailable` | Cognito userInfo 障害 (Access Token モード) | 同上 |

---

## 8. U4 / decision — 合議 & SSE & 主体性スコア (2026-05-16 追加)

### 8.1 LLM backend 切替

| 値 | 用途 | 必須環境変数 |
|---|---|---|
| `mock` | CI / オフライン (dev/ci 限定) | なし |
| `bedrock` | 本番 (AWS Bedrock + Claude 3 Haiku) | `BEDROCK_REGION` / `BEDROCK_MODEL_ID` / IAM Role |

`stg` / `prod` で `mock` を指定すると起動拒否 (SEC-U4-11)。

### 8.2 ローカル動作確認 (7 curl パターン)

```bash
cp .env.example .env  # LLM_PROVIDER=mock, EVENT_BACKEND=sync, AUTH_BACKEND=mock
uvicorn yesman_api.main:app --port 8000

HEADERS=(-H "Authorization: Bearer anything" -H "Content-Type: application/json")

# 1. ヘルスチェック
curl -i http://localhost:8000/health

# 2. 非ストリーミング合議
curl -i -X POST "${HEADERS[@]}" -d '{"user_input": "今日のランチを決めて"}' \
  http://localhost:8000/v1/decisions/request

# 3. SSE 合議
curl -N -X POST "${HEADERS[@]}" -d '{"user_input": "今日のランチを決めて"}' \
  http://localhost:8000/v1/decisions/request/stream
# → event: start / domain / utterance × 3 / proposal / complete

# 4. Yes/No 採択
DECISION_ID=...  # 上の response から
curl -i -X POST "${HEADERS[@]}" -d '{"choice": "yes"}' \
  http://localhost:8000/v1/decisions/$DECISION_ID/choice

# 5. Nudge polling (BackgroundTasks 完了まで 1-3 秒 retry 推奨)
for i in 1 2 3; do
  curl -s -H "Authorization: Bearer anything" \
    http://localhost:8000/v1/decisions/$DECISION_ID/nudge | jq .
  sleep 1
done
# TTL (600s) 切れは 410 Gone を返す

# 6. 主体性スコア
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/scores/me

# 7. 沈黙ガード (regex 直撃)
curl -i -X POST "${HEADERS[@]}" -d '{"user_input": "宗教について教えて"}' \
  http://localhost:8000/v1/decisions/request
# → event: silence or 通常パスでドメイン silenced 判定
```

### 8.3 Bedrock 接続 (本番想定)

```bash
export AWS_REGION=ap-northeast-1
export AWS_PROFILE=...  # Bedrock + Guardrails 権限を持つ IAM Role
echo 'LLM_PROVIDER=bedrock' >> .env
echo 'BEDROCK_REGION=ap-northeast-1' >> .env
echo 'BEDROCK_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0' >> .env
uvicorn yesman_api.main:app --port 8000
```

**注**: Claude 3 Haiku は `ap-northeast-1` で 2024 後半から利用可。それ以前のモデル / リージョンは `us-east-1` / `us-west-2` を要検討 (ultrathink NFR Req I5)。

### 8.4 沈黙ガード (FR-DM-SILENT)

- 4 ドメイン: religion / election / violence / obscene
- 2 段判定: 正規表現 fast path + LLM 自己判定 (fail-closed、ultrathink NFR Design I1)
- prod では Bedrock Guardrails で更に二重化 (NFR-PRIV-04)

### 8.5 CDK スナップショット更新 (U3 §7.5 と同パターン)

```bash
cd infra
pnpm test -- --updateSnapshot
git diff -- test/__snapshots__/
# 確認項目: environment +12 / secrets +1 (SILENCE_HASH_SALT) / IAM events:PutEvents 既存 / Secret resource +1
```

### 8.6 SLO 計測項目

CloudWatch metric:
- `decision.latency_ms` (合議 p95<5s 目標、p99<10s ハード上限)
- `sse.first_chunk_latency_ms` (p95<1.5s)
- `sse.total_latency_ms` (p95<120s)
- `decision.background_persist_success` (SSE 切断時の永続化成功率、95%+ 目標、ultrathink Code Gen Plan I5)
- `nudge.generation_ms` (p95<5s)

### 8.7 認証 + LLM + Event の組合せ表

| 用途 | AUTH_BACKEND | LLM_PROVIDER | EVENT_BACKEND |
|---|---|---|---|
| CI / Unit test | mock | mock | sync |
| ローカル開発 (LLM 実呼び出しなし) | mock | mock | sync |
| ローカル開発 (LLM 実呼び出し) | mock | bedrock | sync |
| stg / prod | cognito | bedrock | eventbridge |

---

## 9. U5 / learning — 嗜好プロファイル + SQS Consumer (2026-05-16 追加)

### 9.1 機能概要
- **PreferenceProfileBuilder** が U4 DecisionConfirmed イベント (Yes/No 両方) を消費 → preference_profile を incremental update
- **ColdStartEstimator** が履歴なしユーザーの初期 profile を Profile (年齢層 / 職業 / 価値観タグ / life_stage) から推定
- **PreferenceProfileLoader** が U4 ConsensusOrchestrator のプロンプトに preference YAML を inject

### 9.2 Consumer 起動条件 (AND 論理)
```
LEARNING_CONSUMER_ENABLED=true  AND  EVENT_BACKEND=eventbridge
```
両方満たした時のみ ECS Task 内 background consumer が起動 (Mock backend では起動しない)。

### 9.3 ローカル動作確認 (Mock backend で Consumer 起動なし)

```bash
cp .env.example .env  # EVENT_BACKEND=sync → consumer 起動しない
uvicorn yesman_api.main:app --port 8000

HEADERS=(-H "Authorization: Bearer anything" -H "Content-Type: application/json")

# 1. GET 初回 (ColdStart 経由の初期 profile)
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me

# 2. PATCH (通常値)
curl -i -X PATCH "${HEADERS[@]}" \
  -d '{"persona_style_preference": {"効率派": 0.5}}' \
  http://localhost:8000/v1/preferences/me

# 3. PATCH (clip 動作確認 — ultrathink I4 反映)
curl -i -X PATCH "${HEADERS[@]}" \
  -d '{"persona_style_preference": {"効率派": 100.0, "慎重派": -50.0}}' \
  http://localhost:8000/v1/preferences/me
# → 200 + 効率派: 1.0, 慎重派: -1.0 (clip [-1.0, 1.0])

# 4. DELETE → ColdStart 再推定
curl -i -X DELETE -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me

# 5. GET 後 (ColdStart 再推定で空でない profile)
curl -i -H "Authorization: Bearer anything" http://localhost:8000/v1/preferences/me
```

### 9.4 EventBridge backend ローカル起動 (LocalStack 利用)

```bash
docker run -d -p 4566:4566 localstack/localstack:latest
# SQS Queue 作成
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name yesman-dev-decision-events

# .env 設定
echo 'EVENT_BACKEND=eventbridge' >> .env
echo 'LEARNING_CONSUMER_ENABLED=true' >> .env
echo 'DECISION_EVENTS_QUEUE_URL=http://localhost:4566/000000000000/yesman-dev-decision-events' >> .env

uvicorn yesman_api.main:app --port 8000
# サーバログで "consumer.start" 確認
```

### 9.5 U4 連携の動作確認 (preference_yaml がプロンプトに含まれる)

```bash
LOG_LEVEL=DEBUG uvicorn yesman_api.main:app --port 8000 2>&1 | tee server.log &

# 履歴を作る (Yes 採択)
curl -X POST "${HEADERS[@]}" -d '{"user_input": "ランチ"}' http://localhost:8000/v1/decisions/request
# response から decision_id を取得 (例: $DECISION_ID)
curl -X POST "${HEADERS[@]}" -d '{"choice": "yes"}' http://localhost:8000/v1/decisions/$DECISION_ID/choice

# 次の合議で preference_yaml が system prompt に含まれることを確認
curl -X POST "${HEADERS[@]}" -d '{"user_input": "おやつ"}' http://localhost:8000/v1/decisions/request
grep -A 5 "嗜好プロファイル" server.log
# → preferred_personas: / recent_accepted: 等が見える (Mock backend では LLM 呼び出しなしのため Profile 経由)
```

### 9.6 SLO 計測項目 (CloudWatch metric)
- `learning.consumer.process_ms` (1 メッセージ処理) < 100ms
- `loader.load_ms` (Loader.load_for_prompt) < 50ms (通常) / < 100ms (ColdStart)
- `learning.consumer.restart_count` (Supervisor 再起動カウント、10 分窓で alarm)

### 9.7 SQS redrive policy 注記 (Infra Design §3.3 ultrathink I1)
- 初回 U5 deploy で `decisionEventsQueue` に `maxReceiveCount=3` + DLQ が追加される
- **本番運用中の追加は in-flight メッセージゼロのタイミングで** (CFN は in-place update 可だが、`cdk diff` で `UpdateRequiresReplacement` を含めば運用注意)

---

## 10. U-Persona — Custom Persona CRUD + 共有プール + Moderator (2026-05-16 追加)

### 10.1 機能概要
- **Custom Persona CRUD** (`/v1/personas/me`): ユーザーが自分専用ペルソナを作成 / 編集 / 削除
- **共有プール** (`/v1/personas/shared`): opt-in 公開、匿名化済 summary を listing (NFR-PRIV-06)
- **PersonaModerator**: U3 SilenceGuard 流用、沈黙演出 4 ドメイン (religion / election / violence / obscene) を作成・編集・共有公開時に拒否
- **悪用報告 + AUTO_BLOCK** (`POST /v1/personas/{id}/report`): 同一 reporter 二重報告は 409、pending 件数が `PERSONA_REPORT_AUTO_BLOCK_THRESHOLD` 以上で自動 `is_blocked=True`
- **UserPersonaSelection** (`/v1/persona-selections/me`): 上限 3 (FR-PERSONA-10)、未設定なら builtin 3 種 fallback

### 10.2 Mock backend ローカル動作確認 (Infra Design §8 の 8 curl)
```bash
# 1. builtin 3 種取得
curl http://localhost:8000/v1/personas/builtin

# 2. Custom Persona 作成
curl -X POST "${HEADERS[@]}" -d '{
  "name": "効率派A",
  "description": "私の効率派",
  "prompt_text": "あなたは効率を最優先に短く回答してください。" 
}' http://localhost:8000/v1/personas/me

# 3. 自分一覧
curl http://localhost:8000/v1/personas/me

# 4. 共有公開
curl -X PATCH "${HEADERS[@]}" -d '{"shared": true}' http://localhost:8000/v1/personas/$PERSONA_ID/share

# 5. 共有プール閲覧 (creator_anonymous_id 確認)
curl "http://localhost:8000/v1/personas/shared?page=0&page_size=20&sort=popularity"

# 6. 沈黙ドメイン reject (Moderator 動作確認)
curl -X POST "${HEADERS[@]}" -d '{
  "name": "宗教派",
  "description": "信仰について",
  "prompt_text": "宗教について熱心に布教してください信仰深く"
}' http://localhost:8000/v1/personas/me
# → 422 rejected_by_moderator

# 7. Selection 更新
curl -X PUT "${HEADERS[@]}" -d '{"persona_ids": ["...","..."]}' http://localhost:8000/v1/persona-selections/me

# 8. Report
curl -X POST "${HEADERS[@]}" -d '{"reason": "malicious", "detail": "不快"}' http://localhost:8000/v1/personas/$PERSONA_ID/report
```

### 10.3 PersonaReport 閾値到達時の管理者対応 (NFR Req I1)
PersonaReport の pending 件数が `PERSONA_REPORT_AUTO_BLOCK_THRESHOLD` (default 5) を超えると自動で `is_blocked=True` になり、audit log に `audit.persona.auto_blocked` が出力される。管理者は以下を判断:

```bash
# 1. pending report 一覧確認 (DB 直接 or 将来管理 API)
SELECT persona_id, COUNT(*) FROM persona_reports WHERE status='pending' GROUP BY persona_id ORDER BY 2 DESC;

# 2. 該当 persona の prompt_text を確認 (admin 権限で SELECT)
SELECT prompt_text, owner_user_id FROM personas WHERE id='<persona_id>';

# 3a. 妥当な report → 既に is_blocked=True、共有降格は ON DELETE で不要
UPDATE personas SET is_shared=false WHERE id='<persona_id>';
UPDATE persona_reports SET status='reviewed-blocked', reviewed_at=NOW() WHERE persona_id='<persona_id>' AND status='pending';

# 3b. 誤報 → block 解除 + report dismiss
UPDATE personas SET is_blocked=false WHERE id='<persona_id>';
UPDATE persona_reports SET status='reviewed-dismissed', reviewed_at=NOW() WHERE persona_id='<persona_id>' AND status='pending';
```

### 10.4 SLO 計測項目 (CloudWatch metric)
- `persona.moderate_ms` (PersonaModerator.moderate、LLM 含む) < 2.5s (公開時の 2 回呼び累積、NFR Req PERF-UP-02)
- `persona.catalog.create_ms` < 3.0s (Moderator 含む)
- `persona.catalog.list_shared_ms` < 200ms (DB query + 匿名化 hash 計算)
- `persona.report.auto_block_count` (日次、不審 persona 検知に使用)

### 10.5 SecretsManager 連携 (NFR Req SEC-UP-04)
prod では `PERSONA_ANONYMIZER_SALT` は ApiStack の `PersonaAnonymizerSaltSecret` (Secrets Manager) から ECS Task に注入される。CDK 経由でローテーションする場合は新規 Secret 生成 → ECS Task 再起動の手順を踏むこと (既存 `creator_anonymous_id` は変わる点に注意)。

---

## 11. U6 / voice — Polly TTS + Transcribe STT + Web Speech API (2026-05-16 追加)

> developer-facing 章 (機能概要 + ローカル mock 動作確認 + SLO)。prod 運用 (stack 削除時 cleanup 等) は **`aidlc-docs/construction/U6-voice/infrastructure-design/infrastructure-design.md` §11** を参照。

### 11.1 機能概要
- **3 backend Strategy + Factory + DI** (FR-VOICE-01): `aws` (Polly + Transcribe) / `web-speech-api` (no-op、FE 完結) / `mock`
- **TTS** (`POST /v1/voice/tts`): テキスト → audio_url (aws の場合 S3 presigned URL 1h TTL) or 409 (web-speech-api)
- **STT** (`POST /v1/voice/stt`): multipart audio → 転写テキスト + confidence
- **Config** (`GET /v1/voice/config`): backend 判別 + tts/stt サポート可否 (FE 分岐用、`Cache-Control: private, max-age=3600`)
- **SilenceGuard regex-only** (U3 流用): `/v1/voice/tts` 入力を regex fast-path で検査、LLM stage skip でレイテンシ予算 < 1.5s 維持

### 11.2 ローカル動作確認 (Mock backend)

```bash
cd apps/api && uvicorn yesman_api.main:app --port 8000

# 1. config 取得
curl http://localhost:8000/v1/voice/config
# → {"backend":"mock","tts_supported":true,"stt_supported":true}

# 2. TTS
curl -X POST "${HEADERS[@]}" -d '{"text":"テスト発話です"}' http://localhost:8000/v1/voice/tts

# 3. STT (multipart)
echo "fake audio" > /tmp/audio.webm
curl -X POST "${HEADERS[@]}" -F "audio=@/tmp/audio.webm;type=audio/webm" http://localhost:8000/v1/voice/stt
# → {"text":"[mock-stt-<hash>]","confidence":1.0,"backend":"mock"}

# 4. SilenceGuard reject
curl -X POST "${HEADERS[@]}" -d '{"text":"選挙の投票先を案内します"}' http://localhost:8000/v1/voice/tts
# → 422 {"detail":{"reason":"tts_silenced_domain","domain":"election"}}
```

### 11.3 Polly Neural × Takumi 採用根拠 (NFR Design §4.1.1)

| Engine | VoiceId | ja-JP 対応 | 採用 |
|---|---|---|---|
| `standard` | Mizuki | ✅ | ❌ |
| `neural` | **Takumi** | ✅ | ✅ MVP |
| `neural` | Mizuki | ❌ InvalidVoiceId | - |
| `neural` | Tomoko | ✅ | 将来候補 |

`POLLY_VOICE_ID` env で override 可能。

### 11.4 SLO 計測項目 (CloudWatch metric)

詳細は Infra Design §8.2 参照、namespace `YesMan/Voice`:
- `TTSDurationMs` p95 < 1500 ms
- `STTDurationMs` p95 < 15,000 ms (3 秒以下入力)
- `TTSErrorRate` < 5% / `STTErrorRate` < 10% (Transcribe 不安定許容)
- `S3DeleteFailedCount` < 10 件/h (Lifecycle 委任で許容)

### 11.5 prod 運用 (cross-link)

prod stack 削除時の手動 cleanup 手順、運用 alarm 対応、コスト管理は **Infrastructure Design §11** (`aidlc-docs/construction/U6-voice/infrastructure-design/infrastructure-design.md`) を参照。
