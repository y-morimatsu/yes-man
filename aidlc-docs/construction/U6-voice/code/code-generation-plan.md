# U6 / voice — Code Generation Plan (Part 1)

**Unit**: U6
**Phase**: CONSTRUCTION — Code Generation Part 1 (Planning)
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 8 + NFR Req 6 + NFR Design 6 + Infra Design 6 + Code Gen Plan 5 = 累計 31 fixes

---

## 0. 位置付け

Infra Design §1-11 で確定した「3 backend + 単一 bucket + Polly Neural × Takumi + Transcribe OutputKey prefix + structlog metric」設計を、**Phase A.0a-F (8 段階) の詳細実装計画** に展開する。U5 / U-Persona と同じ Phase 構成パターン継承。

---

## 1. 全体方針

### 1.1 ファイル集計

| カテゴリ | 数 |
|---|---|
| **新規 Python (本体)** | 13 (domain/voice 3 + application/voice 1 + infrastructure/voice 5 + interface 2 + tests fixture 1 + test_helper 1) |
| **変更 Python (本体)** | 4 (config + deps + main + silence_guard) |
| **U3 patch (Phase A.0a)** | 1 (`SilenceGuard.evaluate_regex_only` メソッド追加) |
| **新規テスト + fixture** | 8 (Unit 5 + Integration 2 placeholder + fixture mp3 1) |
| **変更 ドキュメント / 設定** | 2 (`.env.example` + RUNBOOK §11) |
| **変更 CDK** | 1 (api-stack.ts) |
| **合計** | **約 29 ファイル** |

### 1.2 順序 (線形)

Phase A.0a → A.0b → B → C → D → E → F の 7 段階。U-Persona の B.5 先行のような import 順序問題は U6 ではなく、線形でよい。

### 1.3 品質基準

- AST parse OK
- import 解決
- U2-U-Persona 既存テスト回帰なし
- U6 新規テスト pass
- ruff check 通過

---

## 2. Phase A.0a: U3 SilenceGuard 拡張 (ultrathink I1: DRY refactor with private helper)

- [ ] **A.0a.1** `domain/decision/silence_guard.py` に private helper `_match_regex_domain(user_input) -> SilenceVerdict | None` を抽出 (regex fast-path 共通化)
- [ ] **A.0a.2** 既存 `evaluate` を refactor: 冒頭の regex ループを `_match_regex_domain` 呼び出しに置換 (動作不変)
- [ ] **A.0a.3** 新規 `evaluate_regex_only(user_input) -> SilenceVerdict` (同期メソッド) を追加: `_match_regex_domain` を呼び、`None` 時は `is_silenced=False` verdict を返す
- [ ] **A.0a.4** AST parse OK
- [ ] **A.0a.5** U4 既存テスト回帰なし確認 (= `evaluate` の動作は完全に同等、refactor は internal only)

### 2.1 期待コード形 (ultrathink I1 DRY 化)

```python
class SilenceGuard:
    def _match_regex_domain(self, user_input: str) -> SilenceVerdict | None:
        """regex fast-path 共通実装 (evaluate / evaluate_regex_only から呼ぶ)."""
        for domain, pattern in self._regex_map.items():
            if pattern.search(user_input):
                return SilenceVerdict(
                    is_silenced=True,
                    domain=domain,
                    response_text=_FIXED_SILENCE_RESPONSE,
                )
        return None

    async def evaluate(self, *, user_input: str) -> SilenceVerdict:
        # 1 段目: regex (共通 helper)
        verdict = self._match_regex_domain(user_input)
        if verdict is not None:
            return verdict
        # 2 段目: LLM
        return await self._llm_judge(user_input)

    def evaluate_regex_only(self, *, user_input: str) -> SilenceVerdict:
        """regex fast-path のみ (LLM stage skip)、U6 TTS 用、同期."""
        verdict = self._match_regex_domain(user_input)
        if verdict is not None:
            return verdict
        return SilenceVerdict(is_silenced=False, domain=None, response_text=None)
```

---

## 3. Phase A.0b: tests fixture mp3 配置 + tests/fixtures/voice/ ディレクトリ作成

- [ ] **A.0b.1** `apps/api/tests/fixtures/voice/__init__.py` 空
- [ ] **A.0b.2** `apps/api/scripts/generate_silence_mp3.py` 追加 (ultrathink Imp1: shell-free Python 生成)
  - 標準ライブラリ `wave` で 1秒無音 WAV → `pydub` (既存 deps なら) or 最終手段は **valid な minimal MP3 binary を hexdump で生成**
  - スクリプト 1 回実行で `tests/fixtures/voice/silence_1s.mp3` 生成、commit して bundle
  - CI 環境では再生成不要、git 管理で配布
- [ ] **A.0b.3** `apps/api/tests/fixtures/voice/silence_1s.mp3` を git に commit (~5 KB、LFS 不要)
- [ ] **A.0b.4** **代替**: 生成不可環境では 0 byte file を配置、MockVoiceAdapter は空 bytes も safe で動作 (FD §5 で明記済)
- [ ] **A.0b.5** ファイル存在確認 (Phase F のテストで読み込み)

### 3.1 fixture 生成 fallback 戦略 (ultrathink Imp1)

| 環境 | 採用手段 |
|---|---|
| ffmpeg + git 管理者 | A.0b.2 の Python script で 1 回生成 → git commit、CI は git 取得 |
| ffmpeg なし | minimal valid MP3 (silent frame 1個、~417 bytes) を Python script で binary 直書き |
| 完全 fallback | 0 byte file、MockVoiceAdapter は空 bytes でも例外なし動作 (FD §5) |

---

## 4. Phase B: domain/voice 3 ファイル

- [ ] **B.1** `domain/voice/__init__.py` 空
- [ ] **B.2** `domain/voice/models.py` — TTSRequest / TTSResult / STTRequest / STTResult dataclass (NFR Design §2)
- [ ] **B.3** `domain/voice/errors.py` — `VoiceError(reason, detail)` (PersonaError パターン踏襲)
- [ ] **B.4** `domain/voice/constants.py`:
  - `_LANG_TO_VOICE = {"ja-JP": "Takumi"}` (Imp3 整合)
  - `_CONTENT_TYPE_TO_MEDIA_FORMAT = {webm/ogg/wav/mp4/m4a/mp3/flac → MediaFormat}` (FD §3.4)
  - `MAX_TTS_TEXT_LENGTH = 3000` / `MAX_STT_AUDIO_BYTES = 5 * 1024 * 1024`

---

## 5. Phase C: application/voice + infrastructure/voice (5 ファイル)

- [ ] **C.1** `application/voice/protocols.py` — `VoiceProviderAdapter` Protocol (NFR Design §3)
- [ ] **C.2** `infrastructure/voice/__init__.py` 空
- [ ] **C.3** `infrastructure/voice/mock_adapter.py` — MockVoiceAdapter (silence_1s.mp3 読み込み、SHA-256 prefix STT、FD §5)
- [ ] **C.4** `infrastructure/voice/web_speech_api_adapter.py` — WebSpeechApiAdapter (no-op、`VoiceError("client_only_backend")` raise、NFR Design §5)
- [ ] **C.5** `infrastructure/voice/aws_adapter.py` — PollyTranscribeAdapter (aioboto3 ベース、TTS フロー + STT フロー、NFR Design §4.1-4.2)
  - constructor 引数:
    - `polly_region` / `transcribe_region` / `voice_id` / `engine` / `bucket` / `presigned_ttl`
    - **`poll_intervals: Sequence[float] | None = None`** (ultrathink I3: テスト時に短間隔注入可能)
    - default は `[0.5]*10 + [1.0]*25` (合計 30s)
  - `synthesize`: Polly SynthesizeSpeech → S3 PutObject → presigned URL
  - `transcribe`: 全体を `async with asyncio.timeout(stt_total_timeout_seconds)` で wrap (ultrathink I2、U5 パターン整合):
    - S3 PutObject (stt-input/) → StartTranscriptionJob (OutputKey="stt-output/") → poll → fetch result → DeleteObject (try/except wrap)
    - timeout 時 `asyncio.TimeoutError` → `VoiceError("stt_timeout")` に変換
    - client 切断 cancellation 伝播で即終了 (`asyncio.timeout` の標準挙動)
- [ ] **C.6** `infrastructure/voice/factory.py` — VoiceProviderFactory (3 backend 切替、`dispose()` で aioboto3 session close)

---

## 6. Phase D: interface (2 ファイル) + deps 拡張

- [ ] **D.1** `interface/http/dto/voice.py` — DTO 4 種 (NFR Design §8):
  - `TTSRequestDTO` / `TTSResponseDTO` / `STTResponseDTO` / `VoiceConfigResponse`
- [ ] **D.2** `interface/http/voice.py` — 3 endpoint (NFR Design §4.3.2 + §9):
  - `GET /v1/voice/config` (Cache-Control: private, max-age=3600)
  - `POST /v1/voice/tts` (SilenceGuard regex-only + voice.tts_supported チェック + adapter 呼び出し)
  - `POST /v1/voice/stt` (multipart File + content_type allowlist + size 上限 5MB + adapter 呼び出し)
  - `_raise_for_voice_error` 内部関数 (HTTP マッピング 11 種 + `Retry-After: 2` for `tts_throttled`)
- [ ] **D.3** `interface/deps.py` 追加:
  - `get_voice_provider(request)` — app.state.voice_provider
  - `get_silence_guard(request)` — app.state.silence_guard (新規 export、ultrathink NFR Design I3)

---

## 7. Phase E: AppConfig + main.py 拡張

- [ ] **E.1** `infrastructure/config.py` 変更:
  - U6 環境変数 6 個追加 (`polly_voice_id` / `polly_engine` / `polly_region` / `transcribe_region` / `voice_s3_bucket` / `voice_tts_presigned_ttl_seconds`)
  - `voice_backend` は既存
  - `validate_runtime` に「`voice_backend=aws` 時 voice_s3_bucket 必須 + presigned_ttl ≤ 3600」追加
- [ ] **E.2** `main.py` 変更:
  - lifespan で `VoiceProviderFactory(config)` + `await voice_factory.create()` → `app.state.voice_provider`
  - `app.state.voice_factory` (dispose 用)
  - lifespan 終了時 `voice_factory.dispose()` 呼び出し
  - `app.include_router(voice_router)` 追加

---

## 8. Phase F: テスト (8 ファイル: Unit 5 + Integration 2 placeholder + 1 init)

- [ ] **F.1** `tests/unit/voice/__init__.py` 空
- [ ] **F.2** `tests/unit/voice/test_mock_adapter.py` (5 ケース):
  - TTS は silence_1s.mp3 bytes 返却 (audio_bytes 長 > 0 確認、ファイル欠落時は空 bytes)
  - STT は SHA-256 prefix を `[mock-stt-<hash>]` 形式で返却
  - 同 audio で同 text、異なる audio で異なる text
  - backend_name == "mock"
  - duration_seconds == 1.0
- [ ] **F.3** `tests/unit/voice/test_web_speech_api_adapter.py` (2 ケース):
  - `synthesize` で `VoiceError("client_only_backend")` raise
  - `transcribe` で同様
- [ ] **F.4** `tests/unit/voice/test_aws_adapter.py` (6 ケース、**botocore Stubber** で外部呼び出しなし):
  - 共通 fixture: `poll_intervals=[0.001]*5` (ultrathink I3 で短間隔注入、CI 高速化)
  - TTS 正常 (Polly stub → S3 PutObject stub → presigned URL 生成)
  - TTS Polly ThrottlingException → `VoiceError("tts_throttled")`
  - STT 正常 (S3 PutObject → StartTranscriptionJob stub → GetTranscriptionJob stub COMPLETED → fetch JSON → DeleteObject)
  - STT FAILED status → `VoiceError("stt_failed")`
  - STT timeout (poll_intervals 消費後 IN_PROGRESS、`asyncio.TimeoutError` → `VoiceError("stt_timeout")`)
  - STT input DeleteObject 失敗 → logger.warning + 結果は正常返却 (ultrathink NFR Design Imp1)
- [ ] **F.5** `tests/unit/voice/test_factory.py` (3 ケース):
  - `voice_backend=aws` → PollyTranscribeAdapter
  - `voice_backend=web-speech-api` → WebSpeechApiAdapter
  - `voice_backend=mock` → MockVoiceAdapter
- [ ] **F.6** `tests/unit/voice/test_silence_guard_regex_only.py` (3 ケース、A.0a 拡張のテスト):
  - regex match → `is_silenced=True`
  - regex no match → `is_silenced=False` (LLM stage 呼ばれない、純粋同期メソッド)
  - 既存 `evaluate` は無変更回帰 OK (sanity check)
- [ ] **F.7** `tests/integration/voice/__init__.py` 空
- [ ] **F.8** `tests/integration/voice/test_voice_api.py` (placeholder、TestClient + Mock backend 想定):
  - TODO: GET /config, POST /tts (silence reject + 正常), POST /stt (size 超過 + content_type 不正 + 正常)

---

## 9. Phase G: ドキュメント + CDK

- [ ] **G.1** `apps/api/.env.example` に U6 6 環境変数追記
- [ ] **G.2** `apps/api/RUNBOOK.md` に **§11 U6 voice** 章追記 (ultrathink Imp2: Infra Design §11 との関係明示)
  - 章番号整理:
    - **API RUNBOOK §11** (本ファイル): developer-facing、ローカル mock 動作確認 + 機能概要 + SLO 計測項目
    - **Infrastructure Design §11** (別ファイル、aidlc-docs/): ops-facing、prod stack 削除時の手動 cleanup 手順、運用 alarm 対応
  - API RUNBOOK §11 内容:
    - 機能概要 + Mock backend 動作確認 (Infra Design §5 の 7 curl パターン)
    - Polly Neural × Takumi 採用根拠
    - SLO 計測項目 (Infra Design §8.2 を参照、namespace `YesMan/Voice`)
    - Infra Design §11 への cross-link「prod 運用は Infra Design §11 参照」
- [ ] **G.3** `infra/lib/stacks/api-stack.ts` 変更:
  - `voiceBucket: s3.Bucket` 新規 (S3 bucket + 3 prefix Lifecycle + SSE-S3 + tag)
  - IAM policy 3 件 (Polly + Transcribe + S3 prefix-scoped、region condition 付き)
  - environment +6 (`VOICE_BACKEND` / `POLLY_VOICE_ID` / `POLLY_ENGINE` / `POLLY_REGION` / `TRANSCRIBE_REGION` / `VOICE_S3_BUCKET` / `VOICE_TTS_PRESIGNED_TTL_SECONDS`)
- [ ] **G.4** `cd infra && pnpm test -- --updateSnapshot` で snapshot 更新

---

## 10. 動作確認 (Phase F/G 完了後)

```bash
cd apps/api && pip install -e ".[dev]"  # 依存追加: aioboto3 (boto3 既存と整合)
cp .env.example .env
uvicorn yesman_api.main:app --port 8000

# Infra Design §5 の 7 curl パターン (config / TTS mock / STT mock / TTS silence reject / TTS 上限 / STT content_type / STT size)
pytest apps/api/tests/unit/voice -v
cd infra && pnpm test -- --updateSnapshot && cdk synth
```

---

## 11. リスク

| リスク | 影響 | 対応 |
|---|---|---|
| `silence_1s.mp3` fixture 生成不可環境 (ffmpeg なし) で Phase A.0b.2 失敗 | Unit test の audio_bytes 検証失敗 | 0 byte file fallback + MockVoiceAdapter で `try: read_bytes() except: b""` の二段 fail-safe (FD §5 明記済) |
| Polly Neural × Takumi が region で未サポート (ap-northeast-1 は対応済) | aws backend で TTS 全失敗 | Infra Design §1 で region 確認済、ap-northeast-1 は Takumi-Neural 対応 |
| aioboto3 と既存 boto3 (U4 LLM Bedrock) の version 衝突 | dependency 解決失敗 | aioboto3 は内部で aiobotocore 依存、boto3 系列と同じ範囲 (>=11.0)。pyproject.toml で範囲指定 |
| Transcribe StartTranscriptionJob の job_name UNIQUE 衝突 | job 重複エラー (24h 内同名 reject) | `uuid4()` 採用で 24h 衝突確率 < 10^-15 で許容 |
| `OutputKey="stt-output/"` 末尾 `/` を Transcribe が誤解釈 | output が bucket root に書かれる | NFR Design §4.2 で AWS 公式仕様 (末尾 `/` で prefix 化、`{job_name}.json` 自動付与) を確認済 |
| U3 `evaluate_regex_only` 追加が既存 SilenceGuard test を破壊 | U4 test 回帰 | A.0a.3 で確認、既存 `evaluate` は touch せず追加のみ |

---

## 12. 承認チェックリスト

- [x] Phase A.0a → A.0b → B → C → D → E → F → G の順序確定
- [x] 約 29 ファイル (新規 21 + 変更 6 + fixture mp3 1 + CDK 1)
- [x] U3 patch 1 ファイル (silence_guard.py: `_match_regex_domain` 抽出 + `evaluate_regex_only` 追加、ultrathink I1 DRY refactor)
- [x] テスト 8 件 (Unit 5 + Integration 2 placeholder + init 1)、`poll_intervals` 注入で CI 高速化 (ultrathink I3)
- [x] AWS dependency 確認 (Polly Neural × Takumi at ap-northeast-1、aioboto3 + boto3 整合)
- [x] fixture mp3 生成 Python script + 3 段 fail-safe (ultrathink Imp1)
- [x] `asyncio.timeout` で STT 全体 wrap、client 切断 cancellation 対応 (ultrathink I2、U5 パターン整合)
- [x] RUNBOOK §11 vs Infra Design §11 役割分離明示 (ultrathink Imp2)
- [x] 既存 U2-U-Persona 回帰なし保証
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 13. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§2.1): `_match_regex_domain` private helper 抽出で DRY 化、`evaluate` と `evaluate_regex_only` 両方から呼ぶ
- **I2** (§5 C.5): STT 全体を `async with asyncio.timeout(stt_total_timeout_seconds)` で wrap、U5 パターン整合、client 切断 cancellation で即終了
- **I3** (§5 C.5 + §8 F.4): `poll_intervals: Sequence[float] | None = None` を constructor 引数化、test で `[0.001]*5` 注入で CI 高速化

### Improvements 2
- **Imp1** (§3 + §3.1): `scripts/generate_silence_mp3.py` 追加で shell-free 生成 (ffmpeg 依存回避)、3 段 fail-safe (生成 / minimal MP3 binary / 0 byte fallback)
- **Imp2** (§9 G.2): API RUNBOOK §11 (developer-facing) vs Infra Design §11 (ops-facing) の役割分離明示 + cross-link
