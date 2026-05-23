# U7c / api-client — Functional Design

**Unit**: U7c — `packages/api-client` (TypeScript OpenAPI 自動生成型 + typed fetch wrapper)
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 7 fixes applied: Critical 1 + Important 3 + Improvements 3)

---

## 0. 位置付け

`packages/api-client/` は FastAPI が `/openapi.json` で公開する OpenAPI Schema から **TypeScript 型 + 型安全な fetch wrapper** を自動生成し、`apps/web` (U7a/U7d) と `packages/ui` (U7b、indirect) から共通利用される。

### 関連要件
- 全 U2-U6 API endpoint への型安全アクセス
- 認証ヘッダ (`Authorization: Bearer <token>`) 自動付与
- API error response (例: `{detail: {reason: "..."}}`) を型化
- SSE (`/v1/decisions/request/stream`) サポート

### 上流前提
| 出典 | 内容 |
|---|---|
| U2-U6 endpoint | profile / decision / score / preference / persona / persona_selection / voice |
| FastAPI `/openapi.json` | Pydantic 由来の OpenAPI 3.0 spec、起動中 endpoint で取得可能 |
| `apps/web` ビルド | pnpm workspace monorepo、`packages/api-client` を internal package として参照 |

### MVP スコープ (U7c 内)
- ✅ OpenAPI schema 取得 + 型生成パイプライン (`openapi-typescript` ベース)
- ✅ Typed fetch wrapper (`yesmanApi.profiles.getMe()` 形式)
- ✅ 認証 token 注入 (interceptor、Cognito ID Token 自動付与)
- ✅ SSE wrapper (`EventSource` 化 + custom event handler)
- ✅ Error 型化 (`ApiError<TReason>` discriminated union)
- ✅ Vitest + msw でテスト
- ⏭ React Query / SWR との統合は U7d (features) で実装
- ⏭ retry / circuit breaker → MVP は client 側で実装せず、FE 側で個別対応

---

## 1. ディレクトリ構成

```
packages/api-client/
├── package.json           # name: "@yesman/api-client", exports
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts           # 全 export entry point
│   ├── generated/         # openapi-typescript 出力 (gitignore する、ビルド時生成)
│   │   └── schema.ts      # 自動生成型 (`paths` / `components` / `operations`)
│   ├── client.ts          # YesmanApiClient class (fetch wrapper)
│   ├── auth.ts            # TokenProvider Protocol (interface for auth integration)
│   ├── errors.ts          # ApiError 型 + 既知 reason discriminated union
│   ├── sse.ts             # SSE EventSource wrapper (DecisionStreamEvent 型)
│   └── modules/           # endpoint 別 module (薄い wrapper)
│       ├── profiles.ts    # U3 profile endpoints
│       ├── decisions.ts   # U4 decisions (run + stream + choice + nudge)
│       ├── scores.ts      # U4 score
│       ├── preferences.ts # U5 preference profile
│       ├── personas.ts    # U-Persona personas + persona_selections
│       ├── voice.ts       # U6 voice (TTS + STT + config)
│       └── index.ts
└── tests/
    ├── client.test.ts
    ├── auth.test.ts
    ├── errors.test.ts
    ├── sse.test.ts
    └── modules/*.test.ts
```

---

## 2. 型生成パイプライン

### 2.1 `openapi-typescript` 採用根拠

| ライブラリ | 採用 | 理由 |
|---|---|---|
| **`openapi-typescript`** | ✅ MVP | 軽量、build-time 型生成、ランタイム依存ゼロ、starlette 系 OpenAPI 完全対応 |
| `openapi-fetch` (補完) | ✅ オプション | typed fetch wrapper、`paths` 型を引数に取る薄いランタイム |
| `swagger-codegen` / `openapi-generator` | ❌ | Java 依存、過剰生成、Tree-shake 困難 |
| `orval` | △ | React Query 統合に強いが U7d でカバー、MVP では over-engineering |

### 2.2 生成フロー (ultrathink C1: server 起動不要の静的 dump 採用)

**MVP 採用方式**: `FastAPI.openapi()` を直接呼んで file dump、commit して git で配布。

```bash
# 1. OpenAPI schema 静的 dump (server 起動不要、FastAPI instance.openapi() 直接呼び)
cd apps/api
python scripts/dump_openapi.py
# → apps/api/openapi.json に書き出し、commit

# 2. api-client 型生成 (file 参照)
cd packages/api-client
pnpm run generate
# 内部: openapi-typescript ../../apps/api/openapi.json -o src/generated/schema.ts
```

### 2.3 dump_openapi.py スクリプト設計

```python
# apps/api/scripts/dump_openapi.py
"""FastAPI OpenAPI schema を file に dump (server 起動不要、CI / dev 共通)."""
import json
from pathlib import Path
from yesman_api.main import app

OUT = Path(__file__).parent.parent / "openapi.json"
OUT.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2))
print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
```

### 2.4 CI での drift 検知

```yaml
# .github/workflows (or similar)
- run: cd apps/api && python scripts/dump_openapi.py
- run: cd packages/api-client && pnpm run generate
- run: git diff --exit-code apps/api/openapi.json packages/api-client/src/generated/schema.ts
  # ↑ 差分があれば API spec 変更が api-client に反映されていない → CI fail
```

**根拠 (ultrathink C1)**: server 起動不要で CI / 開発者 onboarding コスト最小化、静的 file で git で版数管理可能、PR レビューで API 変更が可視化。

---

## 3. YesmanApiClient (client.ts)

### 3.1 Constructor

```typescript
export interface YesmanApiClientOptions {
  baseUrl: string;                            // CloudFront origin or http://localhost:8000
  tokenProvider?: TokenProvider;              // optional, undefined で auth header 付与なし
  fetchImpl?: typeof fetch;                   // SSR / test mock 用
  defaultHeaders?: Record<string, string>;
  onError?: (error: ApiError) => void;        // global error hook (toast 表示等)
}

export class YesmanApiClient {
  constructor(options: YesmanApiClientOptions) { ... }

  readonly profiles: ProfilesModule;
  readonly decisions: DecisionsModule;
  readonly scores: ScoresModule;
  readonly preferences: PreferencesModule;
  readonly personas: PersonasModule;
  readonly personaSelections: PersonaSelectionsModule;
  readonly voice: VoiceModule;
}
```

### 3.2 内部 request 関数 (ultrathink I3 + Imp1 + Imp2 反映)

```typescript
async function request<T>(
  client: YesmanApiClient,
  path: string,
  init: RequestInit & { auth?: boolean } = {},
  retryOn401: boolean = true,  // Imp2: 401 で refresh + retry を 1 回のみ
): Promise<T> {
  // Imp1: header merge 順序明示: defaultHeaders → init.headers → specific (Auth, Content-Type)
  const headers = new Headers(client.defaultHeaders);
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }
  headers.set("Content-Type", "application/json");

  // I3: auth は default true、`/health` 等の anonymous 経路だけ明示 false
  if (init.auth !== false && client.tokenProvider) {
    const token = await client.tokenProvider.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const resp = await client.fetchImpl(`${client.baseUrl}${path}`, { ...init, headers });

  // Imp2: 401 で TokenProvider.refresh があれば 1 回 retry (infinite loop 防止: retryOn401 で制御)
  if (resp.status === 401 && retryOn401 && client.tokenProvider?.refresh) {
    const refreshed = await client.tokenProvider.refresh();
    if (refreshed) {
      return request(client, path, init, false);  // 2 回目は retry なし
    }
  }
  if (!resp.ok) {
    throw await ApiError.from(resp);
  }
  if (resp.status === 204) return undefined as T;
  return await resp.json() as T;
}
```

#### 3.2.1 auth 制御の使い分け (ultrathink I3)

| endpoint | `auth` | 備考 |
|---|---|---|
| `/v1/*` (profiles / decisions / personas / voice 等) | default `true` (省略可) | 全 endpoint 認証必須 |
| `/health` | `auth: false` 明示 | anonymous で online 状態確認用 (FE が起動時に呼ぶ想定) |

`auth: false` は **opt-out で稀に使う** 設計、明示的に書くことで漏れに気づきやすい。

### 3.3 endpoint module 例 (decisions)

```typescript
export class DecisionsModule {
  constructor(private client: YesmanApiClient) {}

  async request(payload: DecisionRequest): Promise<DecisionResponse> {
    return request(this.client, "/v1/decisions/request", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async choose(decisionId: string, choice: "yes" | "no"): Promise<ChoiceResponse> {
    return request(this.client, `/v1/decisions/${decisionId}/choice`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
  }

  // SSE 経路は別 wrapper (sse.ts)
  streamRequest(payload: DecisionRequest): DecisionStream {
    return new DecisionStream(this.client, payload);
  }
}
```

---

## 4. TokenProvider (auth.ts) (ultrathink Imp2 反映)

`apps/web` (U7a) で Cognito 認証統合を行うため、api-client は **Token を取得する関数を受け取る**:

```typescript
export interface TokenProvider {
  /** 現在の token を取得、cached でも OK. */
  getToken(): Promise<string | null>;

  /** 強制リフレッシュ. optional、未実装時は 401 で諦め (= UI が再ログイン誘導).
   * 実装例: aws-amplify の fetchAuthSession({ forceRefresh: true })
   * 401 受け取り時に api-client が 1 回だけ呼ぶ (infinite loop 防止).
   */
  refresh?(): Promise<string | null>;
}
```

実装は `apps/web/src/shell/auth.ts` で `aws-amplify` 経由で:

```typescript
class CognitoTokenProvider implements TokenProvider {
  async getToken(): Promise<string | null> {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  }

  async refresh(): Promise<string | null> {
    const session = await fetchAuthSession({ forceRefresh: true });
    return session.tokens?.idToken?.toString() ?? null;
  }
}
```

api-client 側は **aws-amplify を import しない** (= 純粋 fetch ライブラリ)。Cognito ID Token 1h 有効期限切れで 401 受領時、api-client が `refresh()` を呼んで 1 回 retry (上 §3.2 ロジック)。

---

## 5. ApiError (errors.ts)

```typescript
/** API error response の構造化型 (FastAPI HTTPException.detail と整合).
 *
 * ultrathink I1 反映: TypeScript の `(string & {})` パターンで autocomplete を維持しつつ
 * 任意 reason 文字列を受容、U2-U7 で新 reason 追加時の drift 耐性を確保.
 *
 * `error.is("known-reason")` での比較は string 比較で動作、`error.reason` の autocomplete は
 * 下記の既知 reason リストから候補表示される.
 */
export type KnownApiErrorReason =
  // U-Persona
  | "rejected_by_moderator"
  | "invalid_selection_size"
  | "duplicate_personas"
  | "persona_not_accessible"
  | "builtin_immutable"
  | "blocked_immutable"
  | "not_found"
  // U6 voice
  | "client_only_backend"
  | "tts_throttled"
  | "tts_failed"
  | "tts_silenced_domain"
  | "stt_timeout"
  | "stt_failed"
  | "unsupported_audio_format"
  | "unsupported_language"
  | "audio_too_large"
  // U4 decision
  | "no_personas"
  | "no_personas_available"
  | "decision_not_found"
  | "llm_unavailable"
  | "silenced_domain"
  // generic
  | "validation_error"  // Pydantic 422
  | "unauthorized"      // 401
  | "forbidden"         // 403
  | "internal_error";   // 500

// (string & {}) パターン: 既知 reason の autocomplete を維持しつつ未知 reason も受容
export type ApiErrorReason = KnownApiErrorReason | (string & {});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: ApiErrorReason | string,
    public readonly detail: unknown,
    public readonly response: Response,
  ) {
    super(`API ${status}: ${reason}`);
  }

  static async from(resp: Response): Promise<ApiError> {
    const status = resp.status;
    let detail: unknown = null;
    let reason: string = "internal_error";
    try {
      const body = await resp.json();
      detail = body.detail ?? body;
      // FastAPI Pydantic 422 は detail: list、custom は detail: {reason}
      if (Array.isArray(body.detail)) {
        reason = "validation_error";
      } else if (typeof body.detail === "object" && body.detail !== null && "reason" in body.detail) {
        reason = body.detail.reason as string;
      } else if (status === 401) {
        reason = "unauthorized";
      } else if (status === 403) {
        reason = "forbidden";
      }
    } catch {
      // body JSON parse 失敗時は generic
    }
    return new ApiError(status, reason, detail, resp);
  }

  is(reason: ApiErrorReason): boolean {
    return this.reason === reason;
  }
}
```

---

## 6. SSE wrapper (sse.ts)

### 6.1 設計判断

| アプローチ | 採用 |
|---|---|
| `EventSource` (W3C) | ❌ Authorization header 不可 (URL クエリ経由になる、漏洩リスク) |
| **`fetch + ReadableStream`** | ✅ Authorization header OK、parse 自前、TS 型可 |
| websocket | ❌ 既存 API は SSE 仕様 |

### 6.2 実装

```typescript
export type DecisionStreamEvent =
  | { type: "start"; data: { decision_id: string } }
  | { type: "utterance"; data: { persona_id: string; persona_name: string; text: string } }
  | { type: "proposal"; data: { proposal_text: string } }
  | { type: "complete"; data: { decision_id: string } }
  | { type: "error"; data: { reason: string; detail?: string } };

export class DecisionStream {
  constructor(
    private client: YesmanApiClient,
    private payload: DecisionRequest,
  ) {}

  async *events(signal?: AbortSignal): AsyncGenerator<DecisionStreamEvent> {
    const token = await this.client.tokenProvider?.getToken();
    const resp = await this.client.fetchImpl(`${this.client.baseUrl}/v1/decisions/request/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(this.payload),
      signal,
    });
    if (!resp.ok) throw await ApiError.from(resp);
    if (!resp.body) throw new Error("SSE body missing");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      // SSE は \n\n 区切り
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseSseChunk(chunk);
        if (event) yield event;
      }
    }
  }
}

function parseSseChunk(chunk: string): DecisionStreamEvent | null {
  // ultrathink I2: SSE spec で `data:` 複数行は newline で join される (W3C SSE).
  // 例: "data: line1\ndata: line2\n\n" → data="line1\nline2"
  const lines = chunk.split("\n");
  let event = "";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event: ")) event = line.slice(7).trim();
    else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
  }
  if (!event || dataLines.length === 0) return null;
  const dataRaw = dataLines.join("\n");
  try {
    return { type: event, data: JSON.parse(dataRaw) } as DecisionStreamEvent;
  } catch {
    return null;
  }
}
```

---

## 7. テスト戦略 (ultrathink Imp3 反映: msw v2 採用)

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/client.test.ts` | Unit + msw v2 | YesmanApiClient request 経路 (auth header、status code 分岐、401 refresh + retry) |
| `tests/auth.test.ts` | Unit | TokenProvider stub、getToken/refresh 動作、undefined token 動作 |
| `tests/errors.test.ts` | Unit | ApiError.from で各 reason 抽出 (Pydantic 422 list / custom 422 dict / 401 / 403、KnownApiErrorReason autocomplete) |
| `tests/sse.test.ts` | Unit | parseSseChunk multi-line data + DecisionStream msw SSE response 解析 |
| `tests/modules/*.test.ts` | Unit | 各 module の path / method / body 整合 (smoke test) |

合計 ~30 ケース。**msw v2** (`http.get(url, () => HttpResponse.json({...}))`) で fetch interceptor、外部 server 不要。

```typescript
// 例: msw v2 syntax (tests/client.test.ts)
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(
  http.get("https://api.example.com/v1/personas/me", () =>
    HttpResponse.json([{ id: "...", name: "..." }]),
  ),
);
```

---

## 8. 受入基準 (Stage 1 完了)

- [x] OpenAPI 自動型生成パイプライン定義 (`openapi-typescript`) + **静的 dump (ultrathink C1)** で server 起動不要化
- [x] YesmanApiClient (7 module) 構成確定
- [x] TokenProvider Protocol 定義 (aws-amplify 非依存) + **refresh() optional (Imp2)** で 401 retry
- [x] ApiError discriminated union (既知 reason 25+) + **`(string & {})` パターン (I1)** で drift 耐性
- [x] SSE wrapper (`fetch + ReadableStream`、Authorization 対応、**multi-line data join (I2)**)
- [x] request 関数 (header merge 順序明示 Imp1、auth opt-out I3)
- [x] テスト戦略 5 ファイル × ~30 ケース (**msw v2 syntax Imp3**)
- [x] monorepo (pnpm workspace) 連携方針
- [x] ultrathink 全 7 件適用 (Critical 1 + Important 3 + Improvements 3)

## 9. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§2.2-2.4): `apps/api/scripts/dump_openapi.py` で `FastAPI.openapi()` を直接呼んで静的 file 出力、CI で git diff 検知。server 起動不要化で onboarding コスト最小

### Important 3
- **I1** (§5): `type ApiErrorReason = KnownApiErrorReason | (string & {})` パターンで autocomplete 維持 + drift 耐性
- **I2** (§6.2): SSE `data:` 複数行を `\n` join (W3C SSE spec 準拠)、dataLines 配列で蓄積後 join
- **I3** (§3.2.1): `auth: false` は opt-out で明示的に書く、default true、endpoint 別使い分け表

### Improvements 3
- **Imp1** (§3.2): header merge 順序明示 `defaultHeaders → init.headers → specific (Auth, Content-Type)`
- **Imp2** (§4 + §3.2): `TokenProvider.refresh?()` optional + 401 で 1 回 retry (`retryOn401` flag で infinite loop 防止)
- **Imp3** (§7): msw v2 syntax (`http.get + HttpResponse.json`)、v1 `rest.get` deprecated 明記

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに加わった:

### 1. ScoreResponse schema 拡張 (`2400f45`、2026-05-17)
- **`packages/api-client/src/generated/schema.ts`** を `apps/api/scripts/dump_openapi.py` 経由で再生成
- 差分: `ScoreResponse` に `history: ScoreHistoryPoint[]` フィールド追加 (`ScoreHistoryPoint = { date: string, ratio: number }`)
- `src/modules/scores.ts` の return type は automatic propagation (本 unit が `paths['/v1/scores/me']['get']['responses']['200']` を再 export しているため)

### 2. FormData Content-Type strip (`775f6a5`、2026-05-19)
- **`packages/api-client/src/client.ts`**:
  - request builder で `body instanceof FormData` のときは `Content-Type` header を明示的に削除
  - 動機: 手動指定すると browser が boundary を付与できず、Backend が `422 Unprocessable Entity` を返していた (multipart boundary 不在)
- **`packages/api-client/src/modules/voice.ts`**:
  - `stt(audio: Blob)` で手動指定していた `Content-Type: 'multipart/form-data'` header を削除
  - 結果として browser が `Content-Type: multipart/form-data; boundary=----WebKitFormBoundary...` を自動付与

### Module / 構成は不変
- 7 module (`decisions, persona-selections, personas, preferences, profiles, scores, voice`) の組み合わせ不変
- TokenProvider / ApiError discriminated union / DecisionStream SSE wrapper は変更なし
- msw v2 setupFiles + 8 test ファイルの構成も不変

→ U7c / api-client は module 構成を維持したまま、schema 自動再生成と STT 422 fix の 2 点を反映。

---

## Post-CONSTRUCTION 改修注記 v2 (2026-05-22) — Decision History

本ドキュメント本体および v1 改修注記は変更なし。以下の改修が 2026-05-22 に本 unit のスコープに加わった:

### 1. DecisionsModule.history() (`404c90e`、2026-05-22)

**変更ファイル**: `packages/api-client/src/modules/decisions.ts`

- `DecisionsModule` クラスに `history({ limit?, choice? }): Promise<DecisionHistoryResponse>` メソッドを追加
- 型定義を手動で追加 (openapi-gen 自動化は別 issue 扱い):
  ```typescript
  export interface DecisionHistoryItem {
    decision_id: string;
    user_input: string;
    proposal_text: string;
    choice: "yes" | "no";
    created_at: string;   // ISO 8601
    attempt_count: number; // 1-indexed
  }

  export interface DecisionHistoryResponse {
    items: DecisionHistoryItem[];
    total: number;
  }
  ```
- query string は `URLSearchParams` で構築 (`limit` / `choice` を条件付きで append):
  ```typescript
  async history({ limit = 20, choice }: { limit?: number; choice?: "yes" | "no" | "all" } = {})
      : Promise<DecisionHistoryResponse> {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (choice) params.set("choice", choice);
    return request(this.client, `/v1/decisions?${params.toString()}`);
  }
  ```

**影響範囲**:
- `DecisionsModule` の public interface 追加のみ (既存メソッドは不変)
- `tests/modules/decisions.test.ts` に `history()` の path / query param 整合テストを追加
- `openapi.json` + `src/generated/schema.ts` は `GET /v1/decisions` endpoint 追加に伴い再生成 (CI drift 検知が通ることを確認)

---

## Post-CONSTRUCTION 改修注記 v3 (2026-05-23)

### SSE event 型拡張 (PR #86、`e791650`)
- `packages/api-client/src/sse.ts` の `DecisionStreamEvent` discriminated union に 2 種類追加:
  - `personas`: `{ personas: { id: string; name: string }[] }` (delta 到着前の persona 通知)
  - `utterance_delta`: `{ persona_id: string; persona_name: string; text: string }` (token chunk)
- 既存 `utterance` / `proposal` / `complete` / `silence` / `error` / `start` は不変
- backward compat: 旧 client が新 event を ignore しても最終 `utterance` event で同等動作

### generateYesNudge メソッド追加 (PR #94、`5261d9d`、Closes #93)
- `DecisionsModule.generateYesNudge(decisionId, { stage })` を追加
  - `POST /v1/decisions/{id}/yes-nudge` 同期返却 (No 採択 → 別案到着後の Yes nudge microcopy)
  - 戻り値 `{ message: string }`、≤60 字、stage 別 fallback は backend 側で適用
- 型は inline (`openapi.json` 経由ではなく手書き、Hackathon Pragmatism)
- `tests/modules/decisions.test.ts` への追加は将来課題 (本 PR では skip)
