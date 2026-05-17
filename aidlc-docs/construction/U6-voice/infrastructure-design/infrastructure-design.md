# U6 / voice — Infrastructure Design

**Unit**: U6 — Voice
**Phase**: CONSTRUCTION — Infrastructure Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 6 fixes applied: Important 3 + Improvements 3)
**Upstream**: FD 8 + NFR Req 6 + NFR Design 6 + Infra Design 6 = 累計 26 fixes

---

## 0. 位置付け

NFR Design §1-12 で確定したコード構造 + Polly Neural × Takumi + Transcribe OutputKey prefix + 二段 fail-safe 削除 + `evaluate_regex_only` 拡張 を、**AWS インフラ (S3 / IAM / Polly / Transcribe) + AppConfig 環境変数 + CDK (api-stack.ts) + ローカル動作確認手順** にマップする。

---

## 1. AppConfig 環境変数

NFR Req §7 + NFR Design §4.1.1 整合の最終形:

| 変数 | 型 | 必須 | default | 説明 |
|---|---|---|---|---|
| `VOICE_BACKEND` | str | ✅ (default あり) | `mock` | `aws` / `web-speech-api` / `mock` (既存) |
| `POLLY_VOICE_ID` | str | aws 時のみ | `Takumi` | Polly Neural Japanese voice (Takumi / Tomoko / Kazuha) |
| `POLLY_REGION` | str | aws 時のみ | `ap-northeast-1` | Polly endpoint region |
| `POLLY_ENGINE` | str | aws 時のみ | `neural` | `neural` / `standard` (MVP は neural 固定) |
| `TRANSCRIBE_REGION` | str | aws 時のみ | `ap-northeast-1` | Transcribe endpoint region |
| `VOICE_S3_BUCKET` | str | aws 時のみ | (空、aws 時 validate_runtime で必須化) | 単一 bucket、3 prefix で隔離 |
| `VOICE_TTS_PRESIGNED_TTL_SECONDS` | int | aws 時のみ | `3600` | presigned URL TTL (max 3600) |

`validate_runtime` 拡張:
```python
if self.voice_backend == "aws":
    if not self.voice_s3_bucket:
        raise RuntimeError("VOICE_BACKEND=aws requires VOICE_S3_BUCKET")
    if self.voice_tts_presigned_ttl_seconds > 3600:
        raise RuntimeError(
            "VOICE_TTS_PRESIGNED_TTL_SECONDS must be <= 3600 (NFR Req SEC-U6-05)"
        )
```

---

## 2. S3 Bucket 設計

### 2.1 命名と prefix

```
yesman-${env}-voice/
├── tts/                  # Polly 合成結果 mp3
├── stt-input/            # client upload audio
└── stt-output/           # Transcribe result JSON
```

### 2.2 SSE 設定

- `Server-side encryption: AES256` (S3-managed key、追加コスト ¥0)
- KMS は voice 用途では不要 (audio は短命、KMS API call コスト回避)

### 2.3 Lifecycle Rules (CDK で定義)

```typescript
voiceBucket.addLifecycleRule({
  id: 'tts-expiration',
  prefix: 'tts/',
  expiration: cdk.Duration.days(1),
});
voiceBucket.addLifecycleRule({
  id: 'stt-input-expiration',
  prefix: 'stt-input/',
  expiration: cdk.Duration.days(1),
});
voiceBucket.addLifecycleRule({
  id: 'stt-output-expiration',
  prefix: 'stt-output/',
  expiration: cdk.Duration.days(1),
});
```

### 2.4 CORS (ultrathink Imp1 反映)

| 用途 | CORS 必要性 | 理由 |
|---|---|---|
| `<audio src={presigned}>` (default、`crossorigin` 属性なし) | ❌ 不要 | HTML media element は CORS check off (no-cors mode) |
| `<audio src={presigned} crossorigin="anonymous">` | ⚠️ 必要 | CORS 強制有効、S3 bucket CORS rule で `Access-Control-Allow-Origin: <frontend-origin>` を返す必要 |
| Web Audio API での fetch + decodeAudioData | ⚠️ 必要 | analyser / visualizer 等で audio バイナリ操作する場合 |
| `/v1/voice/stt` multipart upload | ❌ 不要 | API 経由、S3 への直接アクセスなし |

**MVP 段階**: `<audio>` 単純再生のみ想定 → CORS rule 不要、`blockPublicAccess: BLOCK_ALL` のままで OK。将来 visualizer 等で必要になれば bucket に `addCorsRule({allowedOrigins: [frontend_url], allowedMethods: [GET]})` 追加。

---

## 3. IAM (ECS Task Role 拡張)

NFR Req SEC-U6-06 (最小権限) 厳守。**ultrathink I1 反映**: Polly / Transcribe は AWS 仕様上 resource-level 非対応のため `Resource: "*"` 必須だが、`aws:RequestedRegion` condition で region 制限を補強する:

```typescript
// Polly (AWS limitation: resource-level not supported、region condition で least-privilege 補強)
taskRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['polly:SynthesizeSpeech'],
  resources: ['*'],  // ← AWS 制約、Polly は resource-level 非対応 (Service Authorization Reference 参照)
  conditions: {
    StringEquals: { 'aws:RequestedRegion': ctx.awsRegion },  // region 限定で誤呼び出し防止
  },
}));

// Transcribe (同じく AWS 制約、region condition + tag condition 追加可能)
taskRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    'transcribe:StartTranscriptionJob',
    'transcribe:GetTranscriptionJob',
  ],
  resources: ['*'],  // ← AWS 制約、StartTranscriptionJob は job 作成前のため resource-level 不可
  conditions: {
    StringEquals: { 'aws:RequestedRegion': ctx.awsRegion },
  },
}));

// S3 は prefix-scoped で least-privilege 完全達成
taskRole.addToPolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: [
    's3:PutObject',
    's3:GetObject',
    's3:DeleteObject',
  ],
  resources: [
    `${voiceBucket.bucketArn}/tts/*`,
    `${voiceBucket.bucketArn}/stt-input/*`,
    `${voiceBucket.bucketArn}/stt-output/*`,
  ],
}));
```

### 3.0 least-privilege 達成度 (ultrathink I1)

| サービス | resource-level | 採用代替 |
|---|---|---|
| Polly | ❌ AWS 制約 (`*` 必須) | `aws:RequestedRegion` condition で region 限定 |
| Transcribe | ❌ AWS 制約 (job 作成前は ARN 不在) | 同上 |
| S3 | ✅ prefix-scoped | `bucket/{tts,stt-input,stt-output}/*` 3 件で完全 least-privilege |

### 3.1 Transcribe → S3 書き込みの IAM (補足)

Transcribe service が `OutputBucketName` に書き込むには Transcribe の Service-Linked Role が必要だが、`AWSTranscribeServiceRolePolicy` が AWS 管理で既存。**追加 IAM 不要**。

ただし bucket policy で Transcribe principal の書き込みを明示許可 (default は account principal で OK):
```typescript
voiceBucket.addToResourcePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  principals: [new iam.ServicePrincipal('transcribe.amazonaws.com')],
  actions: ['s3:PutObject'],
  resources: [`${voiceBucket.bucketArn}/stt-output/*`],
  conditions: {
    StringEquals: { 'aws:SourceAccount': cdk.Aws.ACCOUNT_ID },
  },
}));
```

---

## 4. CDK 変更 (api-stack.ts)

### 4.1 追加リソース

```typescript
public readonly voiceBucket: s3.Bucket;  // U6 voice S3 bucket
```

```typescript
this.voiceBucket = new s3.Bucket(this, 'VoiceBucket', {
  bucketName: `yesman-${ctx.envName}-voice`,
  encryption: s3.BucketEncryption.S3_MANAGED,  // SSE-S3
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  removalPolicy: ctx.envName === 'prod'
    ? cdk.RemovalPolicy.RETAIN
    : cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: ctx.envName !== 'prod',
  lifecycleRules: [
    { id: 'tts-1day', prefix: 'tts/', expiration: cdk.Duration.days(1) },
    { id: 'stt-input-1day', prefix: 'stt-input/', expiration: cdk.Duration.days(1) },
    { id: 'stt-output-1day', prefix: 'stt-output/', expiration: cdk.Duration.days(1) },
  ],
});
// ultrathink I2: orphan 監視用 tag (prod stack 削除時に bucket だけ残る場合を運用追跡可能化)
cdk.Tags.of(this.voiceBucket).add('yesman:orphan-on-stack-delete', 'true');
cdk.Tags.of(this.voiceBucket).add('yesman:unit', 'U6-voice');
```

### 4.1.1 prod RETAIN の運用注記 (ultrathink I2)

| 状況 | 挙動 | 運用対応 |
|---|---|---|
| prod stack 通常更新 | bucket 維持、environment 変更のみ反映 | 通常 |
| prod stack 削除 (cdk destroy) | bucket は残留 (RETAIN)、Lifecycle で objects は自然消滅 | **手動で bucket 削除確認**、tag `orphan-on-stack-delete=true` で AWS Config / Cost Explorer 追跡 |
| dev/stg stack 削除 | bucket 自動削除 + objects 強制 purge (autoDeleteObjects=true) | 通常 |

**重要**: prod の voice bucket は 機微 audio data を含むため `RETAIN` で誤削除防止が default。stack 削除時は別途手動 cleanup を必須化、Runbook §11 (後述) に記載。

### 4.2 environment 追加 (4 個)

```typescript
environment: {
  ...
  // U6 voice
  VOICE_BACKEND: ctx.envName === 'prod' ? 'aws' : 'mock',
  POLLY_VOICE_ID: 'Takumi',
  POLLY_ENGINE: 'neural',
  POLLY_REGION: ctx.awsRegion,
  TRANSCRIBE_REGION: ctx.awsRegion,
  VOICE_S3_BUCKET: this.voiceBucket.bucketName,
  VOICE_TTS_PRESIGNED_TTL_SECONDS: '3600',
}
```

### 4.3 SSM Parameter Store 連携不要

voice 関連は secret 機密性が低い (bucket 名 / region / voice_id) → 環境変数直書き OK。
Secrets Manager は U6 で新規不要 (audio data 自体は短命で SSE-S3 で十分)。

---

## 5. ローカル動作確認 (Mock backend)

```bash
cd apps/api
cp .env.example .env
# VOICE_BACKEND=mock のまま
uvicorn yesman_api.main:app --port 8000

# 1. config 取得
curl http://localhost:8000/v1/voice/config
# → {"backend": "mock", "tts_supported": true, "stt_supported": true}

# 2. TTS (mock backend は silence_1s.mp3 fixture bytes 返却)
curl -X POST "${HEADERS[@]}" -d '{"text": "テスト発話です"}' \
  http://localhost:8000/v1/voice/tts
# → {"audio_url": "", "backend": "mock", "duration_seconds": 1.0}

# 3. STT (mock backend は SHA-256 prefix を text に埋め込む)
echo "fake audio bytes" > /tmp/audio.webm
curl -X POST "${HEADERS[@]}" \
  -F "audio=@/tmp/audio.webm;type=audio/webm" \
  http://localhost:8000/v1/voice/stt
# → {"text": "[mock-stt-<hash>]", "confidence": 1.0, "backend": "mock"}

# 4. SilenceGuard regex 検査確認 (TTS reject)
curl -X POST "${HEADERS[@]}" -d '{"text": "選挙の投票先を案内します"}' \
  http://localhost:8000/v1/voice/tts
# → 422 {"reason": "tts_silenced_domain", "domain": "election"}

# 5. 上限超過 (text >3000 chars)
# Pydantic validation 422 (custom 422 とは応答形式が異なる、ultrathink Imp2 反映)
curl -X POST "${HEADERS[@]}" -d "{\"text\": \"$(printf 'あ%.0s' {1..3001})\"}" \
  http://localhost:8000/v1/voice/tts
# → 422 {"detail": [{"loc": ["body", "text"], "msg": "...max_length 3000...", "type": "..."}]}
# (custom 422 は {"detail": {"reason": "tts_silenced_domain", ...}} 形式、FE 側で list/dict 判別)

# 6. content_type 未対応
curl -X POST "${HEADERS[@]}" \
  -F "audio=@/tmp/audio.amr;type=audio/amr" \
  http://localhost:8000/v1/voice/stt
# → 415 {"reason": "unsupported_audio_format"}

# 7. audio size 超過
dd if=/dev/zero of=/tmp/big.webm bs=1M count=6
curl -X POST "${HEADERS[@]}" \
  -F "audio=@/tmp/big.webm;type=audio/webm" \
  http://localhost:8000/v1/voice/stt
# → 413 {"reason": "audio_too_large"}
```

---

## 6. デプロイ手順

1. `cdk synth` → CFN 確認 (VoiceBucket + IAM policy 追加が含まれる)
2. `cdk deploy ApiStack` → bucket 作成、ECS Task Role 更新、environment 再注入
3. ECS Service 再起動 (CDK で自動)
4. CloudWatch Logs で `app.start` イベント確認、`voice_backend=aws` を確認
5. (任意) prod 環境で実 Polly TTS + Transcribe STT を smoke test

### 6.1 ロールバック

- `cdk rollback ApiStack` で前 version へ戻す
- VoiceBucket 内データは Lifecycle 1day で消える、Service 視点で永続化対象なし

---

## 7. コスト試算 (月間、ultrathink I3 反映で Transcribe 最小 15s 課金考慮)

| 項目 | 単価 | 想定量 (peak) | 月額 |
|---|---|---|---|
| Polly Neural | $16/1M chars (¥2,400/1M) | 30,000 req × 100 chars = 3M chars | ¥7,200 |
| Transcribe Standard | $0.024/min (¥3.6/min)、**最小 15 sec 課金** | 30,000 req × **max(実音声長, 15 sec) = 7,500 min** | **¥27,000** |
| S3 Storage (1day Lifecycle) | $0.025/GB/month (¥3.75/GB) | 平均 1GB (1day 滞留) | ¥3.75 |
| S3 Request (PUT/GET/DELETE) | $0.0004/1K req (¥0.06/1K) | 30,000 × 4 op = 120K req | ¥7.2 |
| **合計 (peak)** | - | - | **約 ¥34,200/月** |

### 7.1 Transcribe 最小課金粒度 (ultrathink I3 詳細)

Transcribe Standard pricing: **「15 sec 未満も 15 sec 分課金」** (最小 15 sec)。
voice command 「ランチを決めて」等の典型 3-5 sec 音声でも 15 sec 課金 = 実質単価 **+200%** になる。

| 実音声長 | 課金音声長 | 1 req コスト |
|---|---|---|
| 3 sec | 15 sec (minimum) | $0.006 |
| 10 sec | 15 sec (minimum) | $0.006 |
| 20 sec | 20 sec | $0.008 |
| 30 sec | 30 sec | $0.012 |

### 7.2 MVP 段階の節約

- FD §7.1.1 で確定の「TTS auto 不生成」で Polly コスト 70% 削減 → ¥2,160/月
- STT も user opt-in、デフォルト OFF で開始 → Transcribe ¥27,000 × 0.3 = **¥8,100/月**
- **実質月額 (MVP 控えめ運用): 約 ¥10,000-15,000/月**

---

## 8. CloudWatch Metric / Alarm (ultrathink Imp3 反映、U4/U5 既存パターン統一)

### 8.1 計測パターン

U4 SilenceGuard / U5 Consumer と同じ **structlog 構造化ログ → CW Logs → Metric Filter → CW Metric → Alarm** パターンを採用 (EMF 直書きは MVP 段階で複雑性回避):

```python
logger.info(
    "voice.tts.completed",
    sub=user.sub,
    duration_ms=int(duration * 1000),
    voice_id=voice_id,
    text_chars=len(text),
)
```

CloudWatch Logs Insights でクエリ + Metric Filter で `duration_ms` を抽出 → CW Metric `YesMan/Voice/TTSDurationMs` を生成。

### 8.2 Metric / Alarm 一覧

| Metric | source 構造化ログ | 閾値 | Alarm 条件 |
|---|---|---|---|
| `YesMan/Voice/TTSDurationMs` p95 | `voice.tts.completed` の `duration_ms` | 1500 ms | 5 分連続超過 |
| `YesMan/Voice/STTDurationMs` p95 | `voice.stt.completed` の `duration_ms` | 15,000 ms | 5 分連続超過 |
| `YesMan/Voice/TTSErrorRate` | `voice.tts.failed` カウント / 合計 | 5% | 10 分窓 |
| `YesMan/Voice/STTErrorRate` | `voice.stt.failed` カウント / 合計 | 10% | 10 分窓 (Transcribe 不安定許容) |
| `YesMan/Voice/S3DeleteFailedCount` | `stt_input_delete_failed` / `stt_output_delete_failed` | 10 件/h | アプリ層削除失敗、Lifecycle 委任で許容 |

**U4/U5 との一貫性**: 同じ `logger.info` + 構造化フィールド方式、namespace `YesMan/{Unit}` 命名。

---

## 11. 運用 Runbook (Stack 削除 + 通常運用)

### 11.1 prod stack 削除時の手動 cleanup (ultrathink I2)

1. `cdk destroy ApiStack` 実行
2. AWS Console / CLI で bucket `yesman-prod-voice` 存在確認:
   ```bash
   aws s3 ls s3://yesman-prod-voice/
   ```
3. 中身を確認 (Lifecycle 経由で空のはず)
4. 問題なければ手動削除:
   ```bash
   aws s3 rb s3://yesman-prod-voice --force
   ```
5. Cost Explorer で tag `yesman:orphan-on-stack-delete=true` の bucket がないか週次チェック

### 11.2 通常運用時の monitor 項目

- CloudWatch Alarm 5 種 (§8.2)
- 月次コスト Cost Explorer (Voice 関連で ¥34K 越え時に alert)
- 異常発生時の手動 audio cleanup: `aws s3 rm s3://yesman-prod-voice/stt-input/ --recursive`

---

## 9. 受入基準

- [x] AppConfig 環境変数 7 個確定
- [x] S3 Bucket 設計 (単一 + 3 prefix + Lifecycle + SSE-S3)
- [x] IAM 最小権限 (Polly + Transcribe `Resource:"*"` は AWS 制約、region condition 補強 / S3 prefix-scoped) (ultrathink I1)
- [x] CDK api-stack.ts 変更点明示 + orphan 監視 tag (ultrathink I2)
- [x] ローカル mock 動作確認 7 ケース + Pydantic vs custom 422 応答形式差異明示 (ultrathink Imp2)
- [x] 月間コスト試算 (Transcribe 15s minimum 加味で ¥34,200 peak、MVP 控えめ運用で ¥10-15K) (ultrathink I3)
- [x] CORS 不要根拠 + Web Audio API 使用時の追加対応明記 (ultrathink Imp1)
- [x] CloudWatch Alarm 5 種、U4/U5 既存 structlog → Metric Filter パターン統一 (ultrathink Imp3)
- [x] 運用 Runbook §11 (prod stack 削除時の手動 cleanup 手順)
- [x] ultrathink 全 6 件適用 (Important 3 + Improvements 3)

## 10. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§3): Polly / Transcribe `Resource:"*"` は AWS 仕様制約と明記、`aws:RequestedRegion` condition で region 限定補強、§3.0 達成度表
- **I2** (§4.1.1): prod RETAIN の orphan bucket リスク注記、tag `yesman:orphan-on-stack-delete=true` で監視可能化、運用 Runbook §11 で cleanup 手順明示
- **I3** (§7.1): Transcribe 最小 15s 課金粒度、コスト再計算 (¥27,000 STT、合計 ¥34,200 peak)

### Improvements 3
- **Imp1** (§2.4): CORS 不要 = `<audio>` default、必要 = `crossorigin="anonymous"` / Web Audio API、用途別表
- **Imp2** (§5): Pydantic 422 (`detail: list`) vs custom 422 (`detail: dict`) の応答形式差異を curl コメントで明示
- **Imp3** (§8): U4/U5 既存 structlog + Metric Filter パターン統一、namespace `YesMan/Voice` で 5 metric 設計
