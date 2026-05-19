# U6 / voice — NFR Design

**Unit**: U6 — Voice
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 6 fixes applied: Important 3 + Improvements 3)
**Upstream**: FD 8 + NFR Req 6 + NFR Design 6 = 累計 20 fixes

---

## 0. 位置付け

NFR Req §1-9 で確定した 33 NFR ID + 二段 fail-safe 削除 + SilenceGuard 統合 + ja-JP only + botocore Stubber 採用方針 を、**コード層 (domain / application / infrastructure / interface) のクラス設計とフロー** にマップする。

---

## 1. 全体クラス構成

```
apps/api/src/yesman_api/
├── domain/voice/
│   ├── __init__.py
│   ├── models.py            # TTSRequest / TTSResult / STTRequest / STTResult / VoiceError
│   ├── errors.py            # VoiceError(reason, detail)
│   └── constants.py         # _LANG_TO_VOICE / _CONTENT_TYPE_TO_MEDIA_FORMAT (NFR Req §5.1, FD §3.4)
├── application/voice/
│   └── protocols.py         # VoiceProviderAdapter Protocol
├── infrastructure/voice/
│   ├── __init__.py
│   ├── factory.py           # VoiceProviderFactory (3 backend 切替)
│   ├── aws_adapter.py       # PollyTranscribeAdapter (aioboto3 ベース)
│   ├── web_speech_api_adapter.py  # no-op (client_only_backend raise)
│   └── mock_adapter.py      # MockVoiceAdapter (silence_1s.mp3 fixture 読み込み)
└── interface/http/
    ├── voice.py             # /v1/voice/{config,tts,stt} router
    └── dto/voice.py         # DTO 4 種 (TTSRequestDTO / TTSResponseDTO / STTResponseDTO / VoiceConfigResponse)
```

---

## 2. ドメインモデル詳細 (domain/voice/models.py)

```python
@dataclass(frozen=True, slots=True)
class TTSRequest:
    text: str
    voice_id: str | None = None         # None → language_code から導出
    language_code: str = "ja-JP"
    sample_rate: int = 22050

@dataclass(frozen=True, slots=True)
class TTSResult:
    audio_url: str
    audio_bytes: bytes | None
    backend_name: str
    duration_seconds: float | None = None

@dataclass(frozen=True, slots=True)
class STTRequest:
    audio_bytes: bytes
    content_type: str
    language_code: str = "ja-JP"

@dataclass(frozen=True, slots=True)
class STTResult:
    text: str
    confidence: float
    backend_name: str
```

---

## 3. Protocol (application/voice/protocols.py)

```python
class VoiceProviderAdapter(Protocol):
    backend_name: str
    tts_supported: bool
    stt_supported: bool

    async def synthesize(self, request: TTSRequest) -> TTSResult: ...
    async def transcribe(self, request: STTRequest) -> STTResult: ...
```

`backend_name` / `tts_supported` / `stt_supported` は **class attribute** (instance attribute ではない、structural typing で OK)。

---

## 4. PollyTranscribeAdapter フロー

### 4.1 TTS フロー (NFR Req SEC-U6-02 + ultrathink Imp3 反映)

```
1. router    : payload.text -> TTSRequest
2. router    : SilenceGuard.evaluate_regex_only(user_input=text)  ← regex-only (ultrathink I2)
                ↓ is_silenced=True → 422 reject ({"reason":"tts_silenced_domain"})
3. adapter   : voice_id = request.voice_id or _LANG_TO_VOICE[request.language_code]
                ↓ language_code 未対応 → VoiceError("unsupported_language")
4. adapter   : Polly.SynthesizeSpeech (Engine="neural", VoiceId="Takumi", mp3, 22050Hz)
                ↓ ThrottlingException → VoiceError("tts_throttled")
                ↓ 他例外 → VoiceError("tts_failed")
5. adapter   : S3.PutObject(Key=f"tts/{uuid4()}.mp3", ServerSideEncryption="AES256")
                ↓ 失敗 → VoiceError("storage_failed")
6. adapter   : S3.generate_presigned_url(ExpiresIn=3600)
7. router    : TTSResponseDTO(audio_url, backend, duration)
8. audit_log : "audit.voice.tts_requested" (sub, text_hash, voice_id, duration_ms)
```

#### 4.1.1 Polly Engine × VoiceId 整合 (ultrathink Imp3)

| Engine | VoiceId | ja-JP 対応 | 採用 |
|---|---|---|---|
| `standard` | Mizuki | ✅ | ❌ (FR-VOICE-03「中性的・断定的」の品質要件で見送り) |
| `standard` | Takumi | ✅ | ❌ |
| `neural` | **Takumi** | ✅ | ✅ **MVP 採用** |
| `neural` | Mizuki | ❌ (`InvalidVoiceId`) | - |
| `neural` | Tomoko | ✅ (女性、2023+) | 将来 env override 用候補 |

**決定**: `Engine="neural"` + `VoiceId="Takumi"`。`_LANG_TO_VOICE["ja-JP"] = "Takumi"` に統一。env `POLLY_VOICE_ID` で override 可能 (Tomoko / Kazuha 等への切替先取り)。

### 4.2 STT フロー (NFR Req SEC-U6-03 + §2.1 二段 fail-safe + ultrathink I1/Imp1)

```
1. router    : multipart -> STTRequest(audio_bytes, content_type)
2. router    : content_type ∈ _CONTENT_TYPE_TO_MEDIA_FORMAT? else 415
3. router    : len(audio_bytes) <= 5MB? else 413
4. router    : language_code ∈ _LANG_TO_VOICE? else 415 (unsupported_language)
5. adapter   : input_key = f"stt-input/{uuid4()}.{ext}"
6. adapter   : try:
                  S3.PutObject(Key=input_key, ServerSideEncryption="AES256")
                  job_name = f"stt-{uuid4()}"
                  Transcribe.StartTranscriptionJob(
                      TranscriptionJobName=job_name,
                      OutputBucketName=bucket,
                      OutputKey="stt-output/",     # ← ultrathink I1: 末尾 "/" で prefix 化、Transcribe が "stt-output/{job_name}.json" を生成
                      ...
                  )
                  poll (500ms x10 + 1s x25 = 30s 上限)
                  if COMPLETED:
                      output_key = f"stt-output/{job_name}.json"
                      fetch s3://bucket/{output_key}
                      try:
                          DeleteObject(output_key)  # 即削除
                      except Exception as e:
                          logger.warning("stt_output_delete_failed", error=str(e))  # ultrathink Imp1: ログのみ継続、Lifecycle 1day fail-safe
                      return STTResult(text, confidence, "aws-transcribe")
                  if FAILED: VoiceError("stt_failed")
                  else timeout -> VoiceError("stt_timeout")
              finally:
                  try:
                      S3.DeleteObject(input_key)  # ← ultrathink I1: 必ず削除、成功失敗無関係
                  except Exception as e:
                      logger.warning("stt_input_delete_failed", error=str(e))  # ultrathink Imp1: ログのみ、Lifecycle 1day fail-safe
7. audit_log : "audit.voice.stt_requested" (sub, audio_hash, confidence, duration_ms)
```

#### 4.2.1 削除 fail-safe 構造 (ultrathink I1 + Imp1 統合)

| 層 | 失敗時挙動 |
|---|---|
| アプリ層 `finally` で DeleteObject | try/except wrap、`logger.warning` のみで継続 (Imp1) |
| S3 Lifecycle 1day expire | アプリ層が skip / 失敗した場合の最終 fallback (I1) |

**重要**: `finally` 内の例外で「StartTranscriptionJob の VoiceError」を上書き隠蔽してはならない。`try/except` 必須。

### 4.3 SilenceGuard 統合 (ultrathink NFR Req I2 + 本 stage I2: regex-only)

#### 4.3.1 U3 SilenceGuard 拡張 (1 メソッド追加、U-Persona の U4 engine patch と同パターン)

```python
# domain/decision/silence_guard.py に追加
class SilenceGuard:
    ...
    def evaluate_regex_only(self, *, user_input: str) -> SilenceVerdict:
        """regex fast-path のみ (LLM stage skip)、同期メソッド.

        U6 TTS path 等、レイテンシ予算 < 1.5s で LLM 呼び出し (300ms-2s) を避けたい場合に使用.
        トレードオフ: paraphrased/obfuscated 入力 (例: 「神 様」スペース埋め) は素通り.
        TTS 音声化での攻撃インパクトは「user 自身が発話するのと同等」のため許容.
        """
        for domain, pattern in self._regex_map.items():
            if pattern.search(user_input):
                return SilenceVerdict(
                    is_silenced=True,
                    domain=domain,
                    response_text=_FIXED_SILENCE_RESPONSE,
                )
        return SilenceVerdict(is_silenced=False, domain=None, response_text=None)
```

#### 4.3.2 voice router での利用

```python
@router.post("/v1/voice/tts")
async def tts(
    payload: TTSRequestDTO,
    user: AuthenticatedUser = Depends(get_current_user),
    voice: VoiceProviderAdapter = Depends(get_voice_provider),
    silence_guard: SilenceGuard = Depends(get_silence_guard),  # 新規 export (ultrathink I3)
) -> TTSResponseDTO:
    # ultrathink I2: regex-only fast-path、LLM stage skip でレイテンシ予算遵守
    verdict = silence_guard.evaluate_regex_only(user_input=payload.text)
    if verdict.is_silenced:
        raise HTTPException(
            status_code=422,
            detail={"reason": "tts_silenced_domain", "domain": verdict.domain},
        )
    if not voice.tts_supported:
        raise HTTPException(status_code=409, detail={"reason": "client_only_backend"})
    request = TTSRequest(text=payload.text, voice_id=payload.voice_id)
    try:
        result = await voice.synthesize(request)
    except VoiceError as exc:
        _raise_for_voice_error(exc)
    return TTSResponseDTO(...)
```

#### 4.3.3 検査強度のトレードオフ (明示)

| 検査路 | 用途 | 検知能力 | レイテンシ |
|---|---|---|---|
| `SilenceGuard.evaluate` (regex + LLM) | `/v1/decisions/request` 等、user free input | 高 (paraphrase / 文脈解釈) | 300ms-2s |
| **`SilenceGuard.evaluate_regex_only`** | **`/v1/voice/tts`** | 中 (直接キーワード) | < 1ms |

**理由 (ultrathink I2 整理)**:
- 主要攻撃語 60 語 4 ドメインは regex で 100% 捕捉
- LLM stage fail-closed で transient Bedrock 障害が全 TTS reject を招く副作用回避
- TTS 出力 = user 入力テキストの音声化、攻撃インパクトは user 自身の発話と同等

---

## 5. WebSpeechApiAdapter (web-speech-api backend)

```python
class WebSpeechApiAdapter:
    backend_name = "web-speech-api"
    tts_supported = False
    stt_supported = False

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        raise VoiceError("client_only_backend")

    async def transcribe(self, request: STTRequest) -> STTResult:
        raise VoiceError("client_only_backend")
```

router は呼ぶ前に `voice.tts_supported` を確認、`False` なら 409 で返却 (adapter まで到達しない、defense in depth)。

---

## 6. MockVoiceAdapter (mock backend)

NFR Req FD §5 で確定の `silence_1s.mp3` fixture 読み込み + SHA-256 prefix で STT 識別子返却 (再掲)。

---

## 7. VoiceProviderFactory + DI

### 7.1 lifespan (main.py)

```python
voice_factory = VoiceProviderFactory(config)
voice_provider = await voice_factory.create()
app.state.voice_provider = voice_provider
app.state.voice_factory = voice_factory  # dispose 用
```

### 7.2 deps.py (ultrathink I3 反映)

```python
def get_voice_provider(request: Request) -> VoiceProviderAdapter:
    provider = getattr(request.app.state, "voice_provider", None)
    if provider is None:
        raise RuntimeError("VoiceProvider not initialized")
    return provider

def get_silence_guard(request: Request) -> SilenceGuard:
    """U6 voice tts router で regex-only 検査用に inject.

    既に U4 lifespan で app.state.silence_guard セット済、新規 export のみ.
    U-Persona の get_persona_catalog 追加パターンと同じ一貫性原則.
    """
    guard = getattr(request.app.state, "silence_guard", None)
    if guard is None:
        raise RuntimeError("SilenceGuard not initialized")
    return guard
```

#### 7.2.1 export 方式の判断根拠

| 選択肢 | 採用 | 理由 |
|---|---|---|
| `request.app.state.silence_guard` router 直接参照 | ❌ | U2-U-Persona パターン (`Depends(get_*)`) と不一致、test での fixture override が困難 |
| **`get_silence_guard` 新規 export** | ✅ | U-Persona の `get_persona_catalog` 追加と同じ一貫性、Depends override で test 容易 |

---

## 8. content_type / language_code バリデーション位置

| 検証項目 | router 層 | adapter 層 |
|---|---|---|
| content_type allowlist | ✅ multipart parse 直後 415 | (重複検査不要、router で弾く) |
| audio size ≤ 5MB | ✅ 413 | - |
| text length ≤ 3000 | ✅ DTO Pydantic Field | adapter defense (`tts_text_too_long`) |
| language_code in mapping | adapter (`unsupported_language` 415) | - |

router 層で fail-fast、adapter は内部 defense として 1 重チェック (ultrathink NFR Req 累計の defense in depth 方針)。

---

## 9. エラー reason → HTTP マッピング (router 内 `_raise_for_voice_error`)

```python
_VOICE_ERROR_HTTP_MAP: dict[str, int] = {
    "client_only_backend": 409,
    "tts_throttled": 429,
    "tts_failed": 502,
    "tts_text_too_long": 422,
    "tts_silenced_domain": 422,
    "stt_timeout": 504,
    "stt_failed": 502,
    "storage_failed": 502,
    "unsupported_audio_format": 415,
    "unsupported_language": 415,
    "audio_too_large": 413,
}
```

`Retry-After: 2` ヘッダは `tts_throttled` のみ付与。

#### 9.1 FastAPI HTTPException で header 設定 (ultrathink Imp2)

```python
def _raise_for_voice_error(exc: VoiceError) -> None:
    status = _VOICE_ERROR_HTTP_MAP.get(exc.reason, 500)
    headers: dict[str, str] | None = None
    if exc.reason == "tts_throttled":
        headers = {"Retry-After": "2"}  # NFR Req AVAIL-U6-02
    raise HTTPException(
        status_code=status,
        detail={"reason": exc.reason, "detail": exc.detail},
        headers=headers,  # FastAPI HTTPException native parameter
    )
```

FastAPI の `HTTPException` は `headers: dict[str, str] | None` を受け取り、レスポンスに自動付与する。

---

## 10. 監査ログ (NFR Req SEC-U6-10)

```python
audit_log(
    "audit.voice.tts_requested",
    sub=user.sub,
    text_hash=hashlib.sha256(payload.text.encode()).hexdigest()[:16],
    voice_id=request.voice_id,
    duration_ms=int((time.monotonic() - t0) * 1000),
)
```

本文 (`text`) や audio バイナリは絶対に出さない。hash の頭 16 文字のみで衝突確率を許容 (debug 補助)。

---

## 11. 受入基準

- [x] 33 NFR ID 全てをコード層にマップ
- [x] SilenceGuard 統合 (NFR Req I2) を router 層に明示、本 stage で **regex-only fast-path** 採用 (NFR Design I2)
- [x] 二段 fail-safe (try/finally + Lifecycle) を STT フローに明示、`finally` 内の try/except wrap も明示 (Imp1)
- [x] エラー reason → HTTP 11 種マッピング + Retry-After header 設定方法 (Imp2)
- [x] DI / lifespan 拡張点 (voice_provider + silence_guard export) 確定、get_silence_guard 新規 export 根拠表 (I3)
- [x] Polly Engine × VoiceId 整合 (Imp3: Neural+Takumi) + Transcribe OutputKey prefix 化 (I1)
- [x] ultrathink 全 6 件適用 (Important 3 + Improvements 3)

## 12. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§4.2): Transcribe `OutputKey="stt-output/"` 末尾 `/` で prefix 化、Transcribe service が `stt-output/{job_name}.json` を生成
- **I2** (§4.3): TTS path は `SilenceGuard.evaluate_regex_only` (新規メソッド、U3 patch) で regex-only fast-path、LLM stage skip でレイテンシ予算 < 1.5s 達成
- **I3** (§7.2): `get_silence_guard` を deps.py に新規 export、U-Persona の `get_persona_catalog` 追加パターン継承

### Improvements 3
- **Imp1** (§4.2.1): `finally` 内 DeleteObject を try/except + `logger.warning` で wrap、Lifecycle 1day fail-safe に委ねる
- **Imp2** (§9.1): FastAPI `HTTPException(headers={"Retry-After": "2"})` で 429 応答 header 設定
- **Imp3** (§4.1.1): Polly Engine × VoiceId 整合表、Neural+Takumi 採用、`_LANG_TO_VOICE["ja-JP"]="Takumi"` (NFR Req §5.1 も整合更新)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 6 fixes 適用済) を保持。

**Important 3 / Improvements 3 の合計 6 件の NFR Design 修正点は全て継続有効**。Backend (apps/api) 側の VoiceProviderFactory 3 Strategy (Mock / WebSpeechApi / AWS Transcribe)、asyncio.timeout、Polly Neural × Takumi、Transcribe OutputKey prefix 等の Design pattern は不変。

### Frontend 側の新規 Design pattern (本 unit scope 拡張)
- **`useVoiceBackend` hook**: state `'webspeech' | 'server'` を localStorage で永続化、非対応ブラウザ判定 + auto-fallback
- **`useWebSpeechRecognition` hook**: `webkitSpeechRecognition` の thin wrapper (lang='ja-JP'、continuous=true、interimResults=true)
- **`useVoiceInput` composed hook**: backend に応じて Server STT path / Web Speech path を切替、共通 interface `{ recording, transcript, start, stop }` を提供
- **VoiceMicButton state machine**: idle → recording → idle (click toggle)、recording 中は赤色 + pulse animation

→ U6 NFR Design は Backend pattern を維持しつつ、Frontend に backend selector pattern を追加。
