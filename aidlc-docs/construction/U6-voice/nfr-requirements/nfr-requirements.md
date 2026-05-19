# U6 / voice — NFR Requirements

**Unit**: U6 — Voice (Polly TTS + Transcribe STT + Web Speech API + Mock)
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 6 fixes applied: Important 3 + Improvements 3)
**Upstream**: FD 8 + NFR Req 6 = 累計 14 fixes

---

## 0. 位置付け

FD §1-10 で確定した「3 backend Strategy + Polly/Transcribe + 直接 S3 presigned」設計に対し、Performance / Security / Availability / Maintainability / Extensibility / Testability の 6 観点で NFR を確定する。U4 や U-Persona と同パターン。

---

## 1. Performance

| ID | 要件 | 計測 | 目標値 |
|---|---|---|---|
| **PERF-U6-01** | TTS API 応答時間 (Polly 同期 + S3 PutObject + presigned URL 生成) | p95 | < 1.5 秒 |
| **PERF-U6-02** | TTS テキスト長上限 | 静的 | 3000 chars (Polly 1 req 上限) |
| **PERF-U6-03** | STT API 応答時間 (Transcribe batch + polling + result fetch、3秒以下入力) | p95 | < 15 秒 |
| **PERF-U6-04** | STT API 応答時間 (15-30秒入力) | p95 | < 20 秒 |
| **PERF-U6-05** | STT 入力サイズ上限 | 静的 | 5 MB (30秒前後の音声) |
| **PERF-U6-06** | `/v1/voice/config` 応答時間 | p95 | < 50 ms (in-memory、env 由来) |
| **PERF-U6-07** | TTS audio S3 PutObject + presigned URL 生成オーバーヘッド | p95 | < 200 ms |
| **PERF-U6-08** | Transcribe job startup overhead | 平均 | 5-10 秒 (AWS 既知特性、最適化対象外、MVP 受容) |

---

## 2. Security

| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U6-01** | `/v1/voice/*` は AuthMiddleware 経由必須 (`get_current_user`) | 認証なしで Polly/Transcribe 呼び出され課金被害を防ぐ |
| **SEC-U6-02** | `/v1/voice/tts` 入力テキストは **常に U3 SilenceGuard で事前検査必須** (ultrathink I2 補正) | user 自由入力経路で SilenceGuard bypass 防止、`is_silenced=True` で 422 reject。proposal_text 経由でも検査 idempotent で問題なし (二重検査許容) |
| **SEC-U6-03** | STT 入力 audio は **転写完了直後 (or 失敗時) に application 層 DeleteObject**、S3 Lifecycle 1day は fail-safe (ultrathink I1 補正) | 音声データ秘匿、NFR-PRIV-09。詳細削除タイミング表は §2.1 |
| **SEC-U6-04** | S3 bucket は **`yesman-${env}-voice` 単一**、prefix で 3 区分 (`tts/` / `stt-input/` / `stt-output/`) (ultrathink Imp3 補正) | IAM 簡素化、誤読込防止 (prefix-scoped policy)、運用 1 bucket で管理コスト削減 |
| **SEC-U6-05** | S3 presigned URL TTL ≤ 3600s (1h) | 漏洩時の被害最小化 |
| **SEC-U6-06** | Polly / Transcribe / S3 への IAM 権限は **最小権限** (`polly:SynthesizeSpeech` / `transcribe:StartTranscriptionJob` + `GetTranscriptionJob` / `s3:PutObject` `s3:GetObject` on specified bucket only) | least privilege |
| **SEC-U6-07** | content_type allowlist 違反 audio は 415 で reject (任意形式アップロード防止) | 攻撃面削減 |
| **SEC-U6-08** | STT audio S3 PUT は **server-side encryption (SSE-S3)** で保存 | At-rest 暗号化、NFR-PRIV-10 |
| **SEC-U6-09** | TTS 結果 mp3 も同 SSE-S3 で保存 | 同上 |
| **SEC-U6-10** | `audit.voice.tts_requested` / `audit.voice.stt_requested` 構造化ログ (sub のみ、本文 hash) | 監査追跡 |

### 2.1 S3 オブジェクト削除タイミング表 (ultrathink I1 反映、defense in depth)

| prefix | アプリ層削除契機 | S3 Lifecycle (fail-safe) |
|---|---|---|
| `stt-input/` | 転写完了直後 `try/finally` で DeleteObject (成功/失敗いずれも) | 1 day で expire |
| `stt-output/` | result JSON 読込完了直後 DeleteObject | 1 day で expire |
| `tts/` | アプリ層削除なし (presigned URL TTL 1h 中に user が DL する必要があるため) | **1 day で expire** (presigned 1h + 安全マージン) |

**根拠**: アプリ crash や handler 例外で DeleteObject が skip された場合、Lifecycle が必ず後始末する **二段 fail-safe**。Lifecycle 単独だと最長 1day 残留、アプリ層単独だと crash 時に無限残留 → 両方必須。

---

## 3. Availability

| ID | 要件 | 根拠 |
|---|---|---|
| **AVAIL-U6-01** | Polly / Transcribe 個別失敗時は 502 で返却、合議や他 endpoint に影響しない | 局所障害切り分け |
| **AVAIL-U6-02** | Polly throttling (Rate Limit) 時は 429 + **`Retry-After: 2`** ヘッダ (ultrathink Imp1) | client 側 backoff 誘導、Polly throttle 推奨 backoff = 2s |
| **AVAIL-U6-03** | Transcribe job timeout 30s で 504、client は再試行 or 諦め選択 | 過剰滞留防止 |
| **AVAIL-U6-04** | Voice 機能停止時も他 endpoint (decisions / personas / profile) は正常動作 | 機能分離、SRE 観点 |
| **AVAIL-U6-05** | S3 PutObject 失敗時は 502、TTS audio は失われる前提 (再生成許容) | 永続化必須でないため |

---

## 4. Maintainability

| ID | 要件 | 根拠 |
|---|---|---|
| **MAINT-U6-01** | VoiceProviderAdapter Protocol 経由、3 backend (aws/web-speech-api/mock) はファイル分離 | テスト容易性 + future backend 追加 |
| **MAINT-U6-02** | Polly / Transcribe / S3 client は `boto3.client` でない **aioboto3** session、`aclose()` lifecycle 管理 | 非同期一貫性 |
| **MAINT-U6-03** | content_type → MediaFormat マッピング表は **モジュール定数** (`_CONTENT_TYPE_TO_MEDIA_FORMAT`)、変更時 1 箇所 | 単一情報源 |
| **MAINT-U6-04** | エラー reason 文字列は **定数 module** (`errors.py`) に集約、HTTP マッピングは router 単一箇所 | 一元化 |
| **MAINT-U6-05** | 音声 voice_id / sample_rate / TTS bucket 名は env var → AppConfig | hard-code 禁止 |

---

## 5. Extensibility

| ID | 要件 | 根拠 |
|---|---|---|
| **EXT-U6-01** | 新規 backend (例: Azure Speech / OpenAI Whisper) は VoiceProviderAdapter 実装 + Factory 1 行追加で対応可 | Open-Closed |
| **EXT-U6-02** | Transcribe Streaming への移行は STT adapter 内部の transcribe 実装のみで対応可、Protocol 変更不要 | 将来切替容易性 |
| **EXT-U6-03** | MVP は `language_code=ja-JP` only **enforced** (他言語は 415)、将来 `_LANG_TO_VOICE` mapping 拡張で対応 (ultrathink I3 補正) | Polly voice_id と Transcribe language_code の整合性確保、不整合(例: en-US + Mizuki)で実行時エラー回避 |

### 5.1 MVP 言語マッピング (ultrathink I3 反映)

```python
# MVP 段階 (NFR Design §4.1.1 で Polly Neural × Takumi 確定)
_LANG_TO_VOICE: dict[str, str] = {
    "ja-JP": "Takumi",  # Polly Neural 対応 ja-JP voice、FR-VOICE-03 中性的・断定的
}

# 将来 Phase 2 で追加候補
# _LANG_TO_VOICE["en-US"] = "Joanna"  # Polly Neural en-US 中性的
# _LANG_TO_VOICE["en-GB"] = "Amy"
```

> **注**: Mizuki は Polly Standard engine 専用、Neural engine では InvalidVoiceId。NFR Design 段階で Neural 採用が確定したため Takumi に統一。

**enforce 方式**: `STTRequest.language_code not in _LANG_TO_VOICE` → 415 + `{"reason": "unsupported_language"}`。`TTSRequest.voice_id` は env override 可能だが未指定時は `_LANG_TO_VOICE[language_code]` を使う。

---

## 6. Testability

| ID | 要件 | 根拠 |
|---|---|---|
| **TEST-U6-01** | MockVoiceAdapter は実 AWS 呼び出しなしで CI 動作 | dev/ci 環境で常時 mock |
| **TEST-U6-02** | PollyTranscribeAdapter は **botocore Stubber** で外部呼び出し不要に test 可能 (ultrathink Imp2: moto より優先) | moto は Transcribe Streaming 未対応 + Polly Neural の挙動差異あり、botocore Stubber は全 boto3 API 対応で安定 |
| **TEST-U6-03** | 各 adapter の Protocol 適合は contract test で確認 (`isinstance` ではなく構造的) | Strategy 一貫性 |
| **TEST-U6-04** | fixture `silence_1s.mp3` は git 管理 (LFS 不要、~5 KB) | 環境差異なし |

---

## 7. 環境変数 (3 個追加)

| 変数 | 型 | 必須 | default | 説明 |
|---|---|---|---|---|
| `VOICE_BACKEND` | str | ✅ (default あり) | `mock` | `aws` / `web-speech-api` / `mock` (既存) |
| `POLLY_VOICE_ID` | str | aws 時のみ | `Takumi` | Polly Neural Japanese voice (Takumi 推奨、Tomoko 等で override 可) |
| `POLLY_REGION` | str | aws 時のみ | `ap-northeast-1` | Polly endpoint region |
| `TRANSCRIBE_REGION` | str | aws 時のみ | `ap-northeast-1` | Transcribe endpoint region |
| `VOICE_S3_BUCKET` | str | aws 時のみ | (空) | **単一 bucket** `yesman-${env}-voice` (ultrathink Imp3)、3 prefix (tts/ / stt-input/ / stt-output/) で隔離 |
| `VOICE_TTS_PRESIGNED_TTL_SECONDS` | int | aws 時のみ | `3600` | presigned URL TTL (max 3600) |

`validate_runtime` で `VOICE_BACKEND=aws` 時は **`VOICE_S3_BUCKET` 必須**化。

**bucket 設計** (ultrathink Imp3 反映):

```
yesman-${env}-voice/
├── tts/             # Polly 合成結果 mp3、1day Lifecycle expire (presigned 1h TTL を内包)
├── stt-input/       # client upload audio、転写完了直後 DeleteObject + 1day Lifecycle fail-safe
└── stt-output/      # Transcribe result JSON、読込直後 DeleteObject + 1day Lifecycle fail-safe
```

IAM Resource は `arn:aws:s3:::yesman-${env}-voice/{tts,stt-input,stt-output}/*` の 3 件で記述、bucket 全体への過剰権限を防ぐ。

---

## 8. 受入基準

- [x] 6 観点で 33 NFR ID 定義 (Perf 8 + Sec 10 + Avail 5 + Maint 5 + Ext 3 + Test 4)
- [x] FD 設計 (3 backend + S3 prefix 隔離 + Lifecycle) と整合
- [x] AWS コスト試算 (Imp3 引継ぎ) + presigned URL TTL 制約
- [x] 環境変数 6 個 (新規 5 + 既存 1、ultrathink Imp3 で bucket 統合により VOICE_STT_INPUT_BUCKET 廃止)
- [x] ultrathink 全 6 件適用 (Important 3 + Improvements 3)

## 9. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (SEC-U6-03 + §2.1): STT S3 削除を二段 fail-safe 化 (アプリ層 try/finally + Lifecycle 1day)、prefix 別削除タイミング表を追加
- **I2** (SEC-U6-02): `/v1/voice/tts` に SilenceGuard 検査必須化、user 自由入力経路の bypass 防止、idempotent 性で二重検査許容明示
- **I3** (EXT-U6-03 + §5.1): MVP は ja-JP only enforced、`_LANG_TO_VOICE` mapping 表 + 415 unsupported_language reject

### Improvements 3
- **Imp1** (AVAIL-U6-02): Retry-After 値を 2 秒明示 (Polly throttle backoff 推奨)
- **Imp2** (TEST-U6-02): moto より botocore Stubber 採用 (Transcribe Streaming + Polly Neural 安定性根拠)
- **Imp3** (§7): bucket を `yesman-${env}-voice` 単一に統合、3 prefix で隔離、IAM Resource 3 件記述

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 6 fixes 適用済) を保持。

**Important 3 / Improvements 3 の合計 6 件の NFR 修正点は全て継続有効**。Polly Neural × Takumi、Transcribe OutputKey prefix、asyncio.timeout、二段 fail-safe 削除、SilenceGuard regex-only fast-path 等の NFR は不変。

### Post-CONSTRUCTION 段階で追加された frontend 側 NFR
- **Web Speech API backend** (`775f6a5`、`useWebSpeechRecognition`): ブラウザ内蔵 STT、レイテンシ < 100ms (interim) を実測。Backend NFR 目標 (Server STT < 2s p95) との比較で UX 向上。
- **Backend selector の永続化** (`useVoiceBackend`): localStorage I/O は無視できる、NFR 影響なし。

### Server STT (apps/api 側) の NFR は不変
- `/v1/voice/{config,tts,stt}` の latency / throughput 目標値は CONSTRUCTION 時のまま。
- 3 backend Strategy (Mock / WebSpeechApi / AWS Transcribe) の選択も backend 側不変。

→ U6 NFR Req は Backend SLI を維持しつつ、Frontend が Web Speech API による低レイテンシ option を新規に提供。
