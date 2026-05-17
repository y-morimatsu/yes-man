# U6 / voice — Functional Design

**Unit**: U6 — VoiceProvider Strategy + Polly TTS + Transcribe STT + Web Speech API + Mock
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 8 fixes applied: Important 4 + Improvements 4)

---

## 0. 位置付け

FR-VOICE-01〜04 で要求された 「音声バックエンドを設定で切替可能 (a) Amazon Polly + Transcribe / (b) Web Speech API」を実装する。

### 関連要件
- **FR-VOICE-01**: バックエンドを設定で切替 (`VOICE_BACKEND` env var)
- **FR-VOICE-02**: デフォルトは設定値で決定、MVP は両方スイッチ可能
- **FR-VOICE-03**: TTS の声質は中性的・断定的トーン
- **FR-VOICE-04**: 音声入力は決定指示 + Yes/No 採択に対応
- 上流: U3 SilenceGuard (入力検査) / U4 DecisionEngine (TTS で読み上げ)

### 上流前提
| 出典 | 内容 |
|---|---|
| AppConfig.voice_backend | `Literal["aws", "web-speech-api", "mock"]` 既存 (default `mock`) |
| U1 IAM | Polly / Transcribe 権限は ApiStack で追加可能 (`bedrock:*` パターン踏襲) |
| U3 認証 | `/v1/voice/*` は `get_current_user` Depends 必須 |
| U4 DecisionEngine | 合議完了後の `proposal_text` を TTS する経路、FE で URL ベース再生 |
| U7 Frontend | Web Speech API モードでは FE 完結 (本ユニットは no-op adapter のみ) |

### MVP スコープ (U6 内)
- ✅ VoiceProvider Strategy + Factory + DI パターン
- ✅ PollyTTSAdapter (TTS、`POST /v1/voice/tts` で `audio_url`(S3 presigned) or 直接 stream)
- ✅ TranscribeSTTAdapter (STT、`POST /v1/voice/stt` で multipart audio upload → text)
- ✅ WebSpeechApiAdapter (no-op、FE 完結を返す signal、`backend_name="web-speech-api"`)
- ✅ MockVoiceAdapter (テスト + dev 用、固定テキスト/合成済 mp3 を返す)
- ✅ `/v1/voice/config` (FE が backend 判別、`{"backend": "...", "tts_supported": true/false, "stt_supported": true/false}`)
- ⏭ ストリーミング STT (Transcribe Streaming は MVP では batch を採用、レイテンシは 5s 以内目標)
- ⏭ 多言語対応 (MVP は ja-JP 固定)
- ⏭ 音声プロファイル選択 UI → FR-VOICE-03 は固定声 1 種で MVP 達成

---

## 1. ドメインモデル

### 1.1 入出力 dataclass

```python
@dataclass(frozen=True, slots=True)
class TTSRequest:
    text: str                  # max 3000 chars (Polly 1 req 上限 3000、長文は事前分割)
    voice_id: str = "Mizuki"   # Polly Japanese (FR-VOICE-03 中性的・断定的)
    sample_rate: int = 22050   # 16kHz / 22050 / 24000

@dataclass(frozen=True, slots=True)
class TTSResult:
    audio_url: str             # S3 presigned URL (aws backend) or empty (web-speech-api/mock)
    audio_bytes: bytes | None  # mock の場合のみ直接返す (テスト用)
    backend_name: str          # "aws-polly" | "web-speech-api" | "mock"
    duration_seconds: float | None = None

@dataclass(frozen=True, slots=True)
class STTRequest:
    audio_bytes: bytes         # multipart upload payload
    content_type: str          # "audio/webm" | "audio/wav" | "audio/mp4"
    language_code: str = "ja-JP"

@dataclass(frozen=True, slots=True)
class STTResult:
    text: str                  # 転写されたテキスト
    confidence: float          # 0.0-1.0 (Transcribe 結果)
    backend_name: str          # "aws-transcribe" | "web-speech-api" | "mock"
```

### 1.2 Protocol (application/voice/protocols.py)

```python
class VoiceProviderAdapter(Protocol):
    backend_name: str            # "aws" | "web-speech-api" | "mock"
    tts_supported: bool          # FE 判別用
    stt_supported: bool

    async def synthesize(self, request: TTSRequest) -> TTSResult: ...
    async def transcribe(self, request: STTRequest) -> STTResult: ...
```

### 1.3 不サポート時の例外

- `WebSpeechApiAdapter` は backend 側で TTS/STT を実行しない → `VoiceError("client_only_backend")` を raise
- API endpoint は `tts_supported=False` の場合 425 (Too Early) ではなく **409 Conflict** で「backend client-only」を返す (FE が自分で web speech API を呼ぶべき signal)

---

## 2. VoiceProviderFactory

`apps/api/src/yesman_api/infrastructure/voice/factory.py`

### 2.1 責務

```python
class VoiceProviderFactory:
    def __init__(self, config: AppConfig) -> None:
        self._config = config

    async def create(self) -> VoiceProviderAdapter:
        backend = self._config.voice_backend
        if backend == "aws":
            return PollyTranscribeAdapter(
                polly_region=self._config.polly_region,
                transcribe_region=self._config.transcribe_region,
                voice_id=self._config.polly_voice_id,
                tts_bucket=self._config.voice_tts_bucket,
                tts_presigned_ttl=self._config.voice_tts_presigned_ttl_seconds,
            )
        if backend == "web-speech-api":
            return WebSpeechApiAdapter()  # no-op
        if backend == "mock":
            return MockVoiceAdapter()
        raise ValueError(f"unknown voice_backend={backend!r}")

    async def dispose(self) -> None:
        # boto3 client は close 不要、asyncio session のみ管理対象
        pass
```

### 2.2 DI 注入

- main.py lifespan で `app.state.voice_provider = await voice_factory.create()`
- handler は `Depends(get_voice_provider)` で取得 (app-wide singleton で OK、stateless)

---

## 3. PollyTranscribeAdapter (aws backend)

`apps/api/src/yesman_api/infrastructure/voice/aws_adapter.py`

### 3.1 TTS (Polly)

```python
async def synthesize(self, request: TTSRequest) -> TTSResult:
    # 1. Polly SynthesizeSpeech
    response = await self._polly_client.synthesize_speech(
        Engine="neural",
        LanguageCode="ja-JP",
        OutputFormat="mp3",
        SampleRate=str(request.sample_rate),
        Text=request.text,
        VoiceId=request.voice_id,  # Mizuki / Takumi etc.
    )
    audio_bytes = await response["AudioStream"].read()

    # 2. S3 PutObject (presigned URL 用)
    key = f"tts/{uuid4()}.mp3"
    await self._s3_client.put_object(
        Bucket=self._tts_bucket,
        Key=key,
        Body=audio_bytes,
        ContentType="audio/mpeg",
        # S3 Lifecycle で 1day 後自動削除 (Infra Design で定義)
    )
    # 3. presigned URL 生成 (TTL = config から、default 3600s)
    url = await self._s3_client.generate_presigned_url(
        "get_object",
        Params={"Bucket": self._tts_bucket, "Key": key},
        ExpiresIn=self._tts_presigned_ttl,
    )
    return TTSResult(audio_url=url, audio_bytes=None, backend_name="aws-polly")
```

#### 3.1.1 配信経路の決定 (ultrathink I3 反映)

TTS audio は **CloudFront 経由しない、S3 直接 presigned URL** を採用:

| 観点 | 直接 S3 presigned (採用) | CloudFront signed (見送り) |
|---|---|---|
| 寿命 | 1h TTL (S3 Lifecycle で 1day 削除) | 同 |
| キャッシュ汚染 | なし (一意 UUID key、再利用想定なし) | エッジに 1 回再生分が残る (= 不要) |
| コスト | S3 GET ¥0.0004/1K req | + CloudFront ¥0.114/GB |
| 配信品質 | 直接 S3 で十分 (1 回 100KB 程度の小ファイル) | 過剰 |

決定根拠: 各 TTS audio は **1 user が 1 回消費して即破棄** される一過性データ。CloudFront cache は無意味で、cache invalidation コストや edge cache pollution の方が大きい。直接 S3 presigned URL (S3 origin、署名期限 1h) で必要十分。

### 3.2 STT (Transcribe)

MVP は **batch (StartTranscriptionJob + 完了待ち)** を採用。
レイテンシ要件が厳しくなったら Transcribe **Streaming (WebSocket/HTTP/2)** へ切替。

#### 3.2.1 MVP 性能予算 (ultrathink I1 反映)

| 入力長 | P50 | P95 | UI 必須メッセージ |
|---|---|---|---|
| 3 秒以下 | 8s | 12s | "聞き取り中..." (job startup 約 5s 固定) |
| 3-15 秒 | 10s | 15s | 同上 + プログレスバー (時間経過視覚化) |
| 15-30 秒 | 12s | 20s | 同上 |
| 30 秒超 | timeout 30s で打ち切り | - | "短く区切ってお話しください" |

**根拠**: Transcribe batch は短文でも job startup overhead が ~5s 必須。MVP 段階では FE が "聞き取り中" loading を表示することで UX を担保。

**polling 改善**: 1s 固定 → **最初の 5s は 500ms 間隔、以降 1s 間隔**。job startup を待ちつつ、完了後即返却。

**将来移行**: Transcribe Streaming は WebSocket 接続で逐次転写、P95 < 2s 達成可能だが、FastAPI 側 WebSocket handler + 接続管理コストが増える。MVP 検証後の Phase 2 で導入予定。

```python
_POLL_INTERVALS = [0.5] * 10 + [1.0] * 25  # 5s + 25s = 30s 上限

async def transcribe(self, request: STTRequest) -> STTResult:
    # 0. content_type allowlist 検証 (ultrathink I2)
    media_format = _CONTENT_TYPE_TO_MEDIA_FORMAT.get(request.content_type)
    if media_format is None:
        raise VoiceError("unsupported_audio_format", detail=request.content_type)

    # 1. 入力 audio を一時 S3 にアップロード
    key = f"stt-input/{uuid4()}.{_ext(media_format)}"
    await self._s3_client.put_object(
        Bucket=self._stt_input_bucket,
        Key=key,
        Body=request.audio_bytes,
        ContentType=request.content_type,
    )
    # 2. StartTranscriptionJob
    job_name = f"stt-{uuid4()}"
    await self._transcribe_client.start_transcription_job(
        TranscriptionJobName=job_name,
        LanguageCode=request.language_code,
        MediaFormat=media_format,
        Media={"MediaFileUri": f"s3://{self._stt_input_bucket}/{key}"},
        OutputBucketName=self._stt_input_bucket,  # 同 bucket prefix "stt-output/"
    )
    # 3. 完了 polling (前 5s は 500ms、以降 1s、合計 30s 上限)
    for interval in _POLL_INTERVALS:
        await asyncio.sleep(interval)
        job = await self._transcribe_client.get_transcription_job(
            TranscriptionJobName=job_name
        )
        status = job["TranscriptionJob"]["TranscriptionJobStatus"]
        if status == "COMPLETED":
            url = job["TranscriptionJob"]["Transcript"]["TranscriptFileUri"]
            result = await self._fetch_json(url)
            text = result["results"]["transcripts"][0]["transcript"]
            confidence = float(
                result["results"]["items"][0].get("alternatives", [{}])[0]
                .get("confidence", 0.0)
            ) if result["results"]["items"] else 0.0
            return STTResult(
                text=text, confidence=confidence, backend_name="aws-transcribe"
            )
        if status == "FAILED":
            raise VoiceError(
                "stt_failed",
                detail=job["TranscriptionJob"].get("FailureReason"),
            )
    raise VoiceError("stt_timeout")
```

### 3.3 エラー処理

| エラー条件 | reason | HTTP |
|---|---|---|
| Polly throttling | `tts_throttled` | 429 |
| Polly 内部 | `tts_failed` | 502 |
| TTS テキスト長超過 (>3000 chars) | `tts_text_too_long` | 422 |
| 入力 audio MIME 未対応 | `unsupported_audio_format` | 415 |
| 入力 audio サイズ超過 (>5MB) | `audio_too_large` | 413 |
| Transcribe timeout (30s) | `stt_timeout` | 504 |
| Transcribe 内部 | `stt_failed` | 502 |
| S3 PutObject 失敗 | `storage_failed` | 502 |
| backend が client-only | `client_only_backend` | 409 |

**ultrathink Imp1 反映**: DTO で `text: Field(max_length=3000)` 検証済だが、adapter 層でも `len(text) > 3000` で `tts_text_too_long` を raise する **defense-in-depth**。adapter を直接呼ぶ test や internal worker 経路で fallback として機能。

### 3.4 Content-Type → Transcribe MediaFormat マッピング (ultrathink I2 反映)

ブラウザ MediaRecorder 既定の webm/opus を含む 5 形式を allowlist 化:

```python
_CONTENT_TYPE_TO_MEDIA_FORMAT: dict[str, str] = {
    "audio/webm": "webm",        # browser MediaRecorder default (since 2023 Transcribe support)
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "mp4",
    "audio/m4a": "mp4",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
}
```

allowlist 外は **415 Unsupported Media Type**。amr / 3gp は MVP 対象外 (ブラウザ用途で不要)。

---

## 4. WebSpeechApiAdapter (web-speech-api backend)

`apps/api/src/yesman_api/infrastructure/voice/web_speech_api_adapter.py`

### 4.1 責務

- TTS / STT 共に `VoiceError("client_only_backend")` を raise → API は 409 で返す
- FE がこのレスポンスを受け取った場合は Web Speech API (browser-native) を直接呼ぶ
- `tts_supported = False` / `stt_supported = False` で FE 側ロジック分岐

### 4.2 設計判断 (ultrathink Imp2 反映)

「2 メソッドとも `client_only_backend` raise するだけなら module-level 関数で十分では?」という疑問への回答:

| 観点 | class 実装 (採用) | module-level 関数 |
|---|---|---|
| `VoiceProviderAdapter` Protocol 適合 | ✅ instance 属性 (`backend_name` / `tts_supported`) が自然 | △ tuple 返却 or 別 module で属性表現が必要 |
| Factory パターン整合 | ✅ `return WebSpeechApiAdapter()` で揃う | × `return _web_speech_module` 等の不揃い |
| 将来拡張 (Web Speech API メタ情報の保持) | ✅ instance 変数で対応可 | × stateless で拡張時に大幅 refactor |

**決定**: Strategy Protocol 適合のため class を採用。U2/U3/U4 の他 Adapter (Mock/AWS/SqlModel) と同パターンで consistency を担保。

---

## 5. MockVoiceAdapter

`apps/api/src/yesman_api/infrastructure/voice/mock_adapter.py`

### 5.1 責務

- 開発・テスト用、AWS 課金不要
- TTS: 固定 mp3 (1秒間の無音 or "test audio" 表記の小さい mp3、tests/fixtures に bundle)
- STT: 固定テキスト (例: 入力 audio_bytes の SHA-256 prefix を text に埋め込んで識別可能に)

```python
# ultrathink I4 反映: 4 bytes 無効 mp3 では browser 再生時にエラー、
# tests/fixtures/voice/silence_1s.mp3 (有効な 1 秒無音 mp3、~5 KB) を bundle 起動時 1 回読み込み.
_FIXTURE_PATH = Path(__file__).parent.parent.parent.parent.parent / "tests" / "fixtures" / "voice" / "silence_1s.mp3"


class MockVoiceAdapter:
    backend_name = "mock"
    tts_supported = True
    stt_supported = True

    def __init__(self) -> None:
        # 起動時 1 回読み込み、以降 in-memory 配布 (test/dev 用途のため許容)
        try:
            self._silent_mp3 = _FIXTURE_PATH.read_bytes()
        except FileNotFoundError:
            # fixture 欠落時は (壊れた状態ではなく) 明示的に空 bytes、
            # test では audio_bytes 長より backend_name で判定すること.
            self._silent_mp3 = b""

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        return TTSResult(
            audio_url="",
            audio_bytes=self._silent_mp3,  # 有効 mp3 で browser 互換
            backend_name="mock",
            duration_seconds=1.0,
        )

    async def transcribe(self, request: STTRequest) -> STTResult:
        h = hashlib.sha256(request.audio_bytes).hexdigest()[:8]
        return STTResult(
            text=f"[mock-stt-{h}]",
            confidence=1.0,
            backend_name="mock",
        )
```

**fixture 配置**: `apps/api/tests/fixtures/voice/silence_1s.mp3` (1 秒無音、44.1kHz/16bit/mono、約 5 KB)。Code Gen Plan で `ffmpeg` 1 行コマンドで生成 or git-lfs で bundle。

---

## 6. API endpoint

### 6.1 endpoint 一覧

| Method | Path | 認証 | キャッシュ可 | 説明 |
|---|---|---|---|---|
| GET | `/v1/voice/config` | 必須 | ✅ `Cache-Control: private, max-age=3600` (ultrathink Imp4) | backend 判別 + tts/stt サポート可否 (FE 分岐用) |
| POST | `/v1/voice/tts` | 必須 | ❌ | テキスト → audio_url (aws) or 409 (web-speech) |
| POST | `/v1/voice/stt` | 必須 | ❌ | multipart audio → 転写テキスト |

**ultrathink Imp4 反映**: `/v1/voice/config` は env var `VOICE_BACKEND` でのみ変わる **deploy-static** なので、client 側 1h キャッシュを許容。`max-age=3600`、`private` (user 共通だが認証必須のため public 不可)。PWA の Service Worker が冪等にキャッシュできる。

### 6.2 DTO

```python
class VoiceConfigResponse(BaseModel):
    backend: Literal["aws", "web-speech-api", "mock"]
    tts_supported: bool
    stt_supported: bool

class TTSRequestDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1, max_length=3000)
    voice_id: str | None = None  # default は env

class TTSResponseDTO(BaseModel):
    audio_url: str
    backend: str
    duration_seconds: float | None

class STTResponseDTO(BaseModel):
    text: str
    confidence: float
    backend: str
```

### 6.3 STT は multipart upload

- FastAPI の `File()` で受け取る、`content_type` を `request.headers["content-type"]` から抽出
- 最大サイズ 5 MB (mid 30 秒前後)、超過は 413

### 6.4 backend client-only の扱い

- `web-speech-api` モードで `/v1/voice/tts` / `/stt` が叩かれた場合は **409 Conflict** + `{"reason": "client_only_backend"}` を返す
- FE はこの 409 を見て自分で Web Speech API を呼ぶ
- `/v1/voice/config` は両モードで動作 (= FE が事前判別すれば 409 を避けられる)

---

## 7. U4 DecisionEngine との統合

### 7.1 合議完了後の TTS 自動生成 (FR-VOICE-04)

- U4 `/v1/decisions/request` のレスポンスに **自動 TTS URL** は含めない (per-request cost 削減)
- FE が必要時に `/v1/voice/tts` を別途呼ぶ (proposal_text を引数)
- 理由: voice 不要な user (テキスト派) で Polly 課金を発生させない

#### 7.1.1 コスト試算 (ultrathink Imp3 反映)

| 項目 | 値 |
|---|---|
| Polly Neural 単価 | $16/1M chars ≈ ¥2,400/1M chars (1 USD = ¥150) |
| 平均 `proposal_text` 長 | 80 chars (例: "ランチは効率派が推す吉野家にしましょう。") |
| 1 request あたり | ¥2,400 × 80 / 1,000,000 = **¥0.192** |
| 月間 30,000 リクエスト想定 | ¥0.192 × 30,000 = **¥5,760/月** |
| Voice 利用率 30% 想定 (FE で opt-in) | 自動生成しない場合: ¥1,728/月 (節約 ¥4,032/月、節約率 70%) |

**結論**: 月 ¥4,000 強のコスト削減 + 不要 user の体験速度向上 (TTS 生成は ~300ms) のため、**自動 TTS は実装しない**。FE で「音声で聞く」ボタン押下時のみ `/v1/voice/tts` を呼ぶ。

### 7.2 STT → DecisionEngine への入力 (FR-VOICE-04)

- FE: `/v1/voice/stt` → 転写テキスト → `/v1/decisions/request` に user_input として渡す
- U6 単独では DecisionEngine を呼ばない、純粋に転写のみ

---

## 8. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/unit/voice/test_mock_adapter.py` | Unit | MockVoiceAdapter (5 ケース) |
| `tests/unit/voice/test_web_speech_api_adapter.py` | Unit | WebSpeechApiAdapter (client_only_backend 確認 2 ケース) |
| `tests/unit/voice/test_aws_adapter.py` | Unit (moto + boto3 stub) | PollyTranscribeAdapter (mock boto3 で 6 ケース) |
| `tests/unit/voice/test_factory.py` | Unit | VoiceProviderFactory 3 backend 判別 (3 ケース) |
| `tests/integration/voice/test_voice_api.py` | Integration (TestClient + Mock backend) | 3 endpoint × 主要ケース (8 ケース) |

合計 24 ケース。Polly/Transcribe は moto / botocore stub で外部呼び出しなし。

---

## 9. 受入基準 (Stage 1 完了)

- [x] FR-VOICE-01〜04 を満たす設計
- [x] 3 backend (aws / web-speech-api / mock) 切替可能
- [x] U4 DecisionEngine との統合方針明示 (FE 側で呼び出し連携) + コスト試算
- [x] エラー処理 9 種マッピング (ultrathink Imp1 反映で 3 件追加)
- [x] テスト戦略 5 ファイル × 24 ケース
- [x] U2-U5 + U-Persona と整合 (Strategy + Factory パターン踏襲)
- [x] ultrathink 全 8 件適用 (Important 4 + Improvements 4)

## 10. ultrathink 適用ログ (2026-05-16)

### Important 4
- **I1** (§3.2.1): Transcribe batch 性能予算 (P50/P95 表) + polling 改善 (500ms→1s 二段階) + Streaming WebSocket 移行注記
- **I2** (§3.4): Content-Type → MediaFormat allowlist 表 (webm/ogg/wav/mp4/mp3/flac 7 種) + 415 reject
- **I3** (§3.1.1): CloudFront vs 直接 S3 presigned 比較表 + 直接 S3 採用根拠
- **I4** (§5): MockVoiceAdapter の 4 bytes silence → tests/fixtures/voice/silence_1s.mp3 (有効 mp3) 読み込みに変更、fixture 欠落時の挙動明示

### Improvements 4
- **Imp1** (§3.3): エラー表に `tts_text_too_long` / `unsupported_audio_format` / `audio_too_large` 追加 (3 件)
- **Imp2** (§4.2): WebSpeechApiAdapter の class 採用理由表 (Protocol 適合 + Factory 整合 + 将来拡張)
- **Imp3** (§7.1.1): Polly コスト試算表 (¥0.192/req、月 ¥5,760 → 30% opt-in で ¥1,728、節約 70%)
- **Imp4** (§6.1): `/v1/voice/config` Cache-Control: private, max-age=3600 + PWA Service Worker 親和性
