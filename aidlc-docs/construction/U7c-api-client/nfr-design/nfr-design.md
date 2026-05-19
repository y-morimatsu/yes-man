# U7c / api-client — NFR Design

**Unit**: U7c — `packages/api-client`
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 5 = 累計 17 fixes

---

## 0. 位置付け

NFR Req §1-9 で確定した「runtime JS < 10 KB / HTTPS + dev allowlist / network_error uniform / defaultHeaders 一般化」要件を、TypeScript ソース構造とクラス設計にマップ。

---

## 1. ソースツリー (FD §1 詳細化)

```
packages/api-client/
├── package.json
├── tsconfig.json                          # strict + noUncheckedIndexedAccess
├── vitest.config.ts
├── .eslintrc.cjs                          # @typescript-eslint/consistent-type-imports
├── src/
│   ├── index.ts                           # public exports
│   ├── generated/schema.ts                # gitignore? → commit 採用 (CI で drift 検知)
│   ├── client.ts                          # YesmanApiClient + request + validateBaseUrl
│   ├── auth.ts                            # TokenProvider interface
│   ├── errors.ts                          # ApiError + KnownApiErrorReason
│   ├── sse.ts                             # DecisionStream + parseSseChunk
│   └── modules/
│       ├── index.ts
│       ├── profiles.ts
│       ├── decisions.ts
│       ├── scores.ts
│       ├── preferences.ts
│       ├── personas.ts
│       ├── persona-selections.ts
│       └── voice.ts
└── tests/
    ├── client.test.ts
    ├── auth.test.ts
    ├── errors.test.ts
    ├── sse.test.ts
    └── modules/                           # 7 ファイル
```

---

## 2. tsconfig.json + ESLint

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,             // import type を強制 (Imp1 で bundle 防止)
    "declaration": true,
    "outDir": "dist",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*"]
}
```

```javascript
// .eslintrc.cjs (関連 rule)
module.exports = {
  rules: {
    "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    "@typescript-eslint/no-import-type-side-effects": "error",
  },
};
```

---

## 3. package.json (exports + scripts)

```jsonc
{
  "name": "@yesman/api-client",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "generate": "openapi-typescript ../../apps/api/openapi.json -o src/generated/schema.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint": "eslint src tests"
  },
  "dependencies": {},
  "peerDependencies": {},
  "devDependencies": {
    "openapi-typescript": "^7.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0",
    "msw": "^2.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "eslint": "^9.0.0"
  }
}
```

**重要**: `dependencies` は空 (純粋 fetch wrapper、runtime 依存なし)。

---

## 4. YesmanApiClient 詳細

### 4.1 constructor + state

```typescript
export interface YesmanApiClientOptions {
  baseUrl: string;
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  onError?: (error: ApiError) => void;
}

export class YesmanApiClient {
  readonly baseUrl: string;
  readonly tokenProvider?: TokenProvider;
  readonly fetchImpl: typeof fetch;
  readonly defaultHeaders: Record<string, string>;
  readonly onError?: (error: ApiError) => void;

  readonly profiles: ProfilesModule;
  readonly decisions: DecisionsModule;
  readonly scores: ScoresModule;
  readonly preferences: PreferencesModule;
  readonly personas: PersonasModule;
  readonly personaSelections: PersonaSelectionsModule;
  readonly voice: VoiceModule;

  constructor(options: YesmanApiClientOptions) {
    validateBaseUrl(options.baseUrl);  // NFR Req §2.1
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};
    if ("Authorization" in this.defaultHeaders || "authorization" in this.defaultHeaders) {
      throw new Error(
        "defaultHeaders must not contain Authorization (use tokenProvider instead). " +
        "[SEC-U7c-03]"
      );
    }
    this.onError = options.onError;
    this.profiles = new ProfilesModule(this);
    this.decisions = new DecisionsModule(this);
    this.scores = new ScoresModule(this);
    this.preferences = new PreferencesModule(this);
    this.personas = new PersonasModule(this);
    this.personaSelections = new PersonaSelectionsModule(this);
    this.voice = new VoiceModule(this);
  }
}
```

### 4.2 request 関数 (network_error マッピング 統合、I3)

```typescript
export async function request<T>(
  client: YesmanApiClient,
  path: string,
  init: RequestInit & { auth?: boolean } = {},
  retryOn401: boolean = true,
): Promise<T> {
  const headers = new Headers(client.defaultHeaders);
  if (init.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (init.auth !== false && client.tokenProvider) {
    const token = await client.tokenProvider.getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  // ultrathink I1: custom field `auth` を fetch に渡さない、destructure で分離
  // (signal は ...fetchInit に含まれて伝播)
  const { auth: _auth, ...fetchInit } = init;
  fetchInit.headers = headers;

  let resp: Response;
  try {
    resp = await client.fetchImpl(`${client.baseUrl}${path}`, fetchInit);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      const apiErr = new ApiError(0, "request_aborted", { message: err.message }, null);
      client.onError?.(apiErr);
      throw apiErr;
    }
    const apiErr = new ApiError(0, "network_error", { message: String(err) }, null);
    client.onError?.(apiErr);
    throw apiErr;
  }

  if (resp.status === 401 && retryOn401 && client.tokenProvider?.refresh) {
    const refreshed = await client.tokenProvider.refresh();
    if (refreshed) {
      return request(client, path, init, false);
    }
  }

  if (!resp.ok) {
    const apiErr = await ApiError.from(resp);
    client.onError?.(apiErr);
    throw apiErr;
  }
  if (resp.status === 204) return undefined as T;
  return await resp.json() as T;
}
```

---

## 5. ApiError 詳細

```typescript
export type KnownApiErrorReason =
  // network / client
  | "network_error"     // NFR Req I3
  | "request_aborted"   // NFR Req I3
  // U-Persona / U6 / U4 / generic (FD §5 から継承)
  | "rejected_by_moderator"
  | "invalid_selection_size"
  | "duplicate_personas"
  | "persona_not_accessible"
  | "builtin_immutable"
  | "blocked_immutable"
  | "not_found"
  | "client_only_backend"
  | "tts_throttled"
  | "tts_failed"
  | "tts_silenced_domain"
  | "stt_timeout"
  | "stt_failed"
  | "unsupported_audio_format"
  | "unsupported_language"
  | "audio_too_large"
  | "no_personas"
  | "no_personas_available"
  | "decision_not_found"
  | "llm_unavailable"
  | "silenced_domain"
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "internal_error";

export type ApiErrorReason = KnownApiErrorReason | (string & {});

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly reason: ApiErrorReason,
    public readonly detail: unknown,
    public readonly response: Response | null,  // NFR Req I3: network error 時 null
  ) {
    super(`API ${status}: ${reason}`);
    this.name = "ApiError";
  }

  /**
   * 非 streaming response の error body を読み取り ApiError 化.
   *
   * ultrathink I2 注: SSE response でも初期 HTTP error (= stream 開始前の error response、
   * 通常短い JSON body) で使用可。streaming 中の error は SSE の `event: error` で別経路.
   * resp.clone() は短い body のみ buffering、メモリ問題なし.
   */
  static async from(resp: Response): Promise<ApiError> {
    const status = resp.status;
    let detail: unknown = null;
    let reason: ApiErrorReason = "internal_error";
    try {
      const body = await resp.clone().json();
      detail = body.detail ?? body;
      if (Array.isArray(body.detail)) {
        reason = "validation_error";
      } else if (
        typeof body.detail === "object" &&
        body.detail !== null &&
        "reason" in body.detail
      ) {
        reason = (body.detail as { reason: string }).reason;
      } else if (status === 401) {
        reason = "unauthorized";
      } else if (status === 403) {
        reason = "forbidden";
      } else if (status >= 500) {
        reason = "internal_error";
      }
    } catch {
      // body JSON parse 失敗時は generic
    }
    return new ApiError(status, reason, detail, resp);
  }

  is(reason: KnownApiErrorReason): boolean {
    return this.reason === reason;
  }
}
```

---

## 6. SSE wrapper (FD §6 + I2 反映)

```typescript
export class DecisionStream {
  constructor(
    private client: YesmanApiClient,
    private payload: DecisionRequest,
  ) {}

  async *events(signal?: AbortSignal): AsyncGenerator<DecisionStreamEvent> {
    const token = await this.client.tokenProvider?.getToken();
    let resp: Response;
    try {
      resp = await this.client.fetchImpl(
        `${this.client.baseUrl}/v1/decisions/request/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(this.payload),
          signal,
        },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(0, "request_aborted", { message: err.message }, null);
      }
      throw new ApiError(0, "network_error", { message: String(err) }, null);
    }
    if (!resp.ok) throw await ApiError.from(resp);
    if (!resp.body) throw new ApiError(500, "internal_error", { message: "SSE body missing" }, resp);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = parseSseChunk(chunk);
          if (event) yield event;
        }
      }
    } finally {
      // ultrathink I3: AsyncGenerator が外側で break された場合、
      // reader.cancel() で server に切断通知 + lock 自動 release.
      // (cancel() が release も含むため releaseLock 不要)
      try {
        await reader.cancel();
      } catch {
        // already cancelled or stream finished、無視
      }
    }
  }
}

export function parseSseChunk(chunk: string): DecisionStreamEvent | null {
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

## 7. module 例 (decisions.ts)

```typescript
import type { components, operations } from "../generated/schema";
import { request } from "../client";
import { DecisionStream } from "../sse";
import type { YesmanApiClient } from "../client";

export type DecisionRequestPayload = components["schemas"]["DecisionRequestDTO"];
export type DecisionResponse = components["schemas"]["DecisionResponse"];
export type ChoiceResponse = components["schemas"]["ChoiceResponse"];
export type NudgeResponse = components["schemas"]["NudgeResponse"];

export class DecisionsModule {
  constructor(private client: YesmanApiClient) {}

  async request(payload: DecisionRequestPayload): Promise<DecisionResponse> {
    return request(this.client, "/v1/decisions/request", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  streamRequest(payload: DecisionRequestPayload): DecisionStream {
    return new DecisionStream(this.client, payload);
  }

  async choose(decisionId: string, choice: "yes" | "no"): Promise<ChoiceResponse> {
    return request(this.client, `/v1/decisions/${decisionId}/choice`, {
      method: "POST",
      body: JSON.stringify({ choice }),
    });
  }

  async getNudge(decisionId: string): Promise<NudgeResponse> {
    return request(this.client, `/v1/decisions/${decisionId}/nudge`);
  }
}
```

他 6 module も同パターン (薄い wrapper、~30 行 max)。

---

## 8. validateBaseUrl 実装

```typescript
export function validateBaseUrl(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(`Invalid baseUrl: ${baseUrl}`);
  }
  if (url.protocol === "https:") return;
  if (url.protocol === "http:") {
    // ultrathink Imp2: resolver 注記
    // - localhost / 127.0.0.1 / ::1: 全 OS / resolver で 127.0.0.1 解決
    // - *.localhost: RFC 6761 で必ず 127.0.0.1 にループバック (準拠 resolver で動作)
    // - *.local: mDNS 要 (macOS Bonjour、Linux nss-mdns / avahi、Windows 一部)。
    //   開発者 PC 環境差異あり、CI 環境では使わない方が無難.
    const devHostsRe = /^(localhost|127\.0\.0\.1|::1|.*\.local|.*\.localhost)$/;
    if (devHostsRe.test(url.hostname)) return;
    console.warn(
      `[YesmanApiClient] Non-HTTPS baseUrl: ${baseUrl}. ` +
      `Authorization headers will be sent in clear text. ` +
      `Only use http for dev hosts (localhost/127.0.0.1/*.local).`
    );
    return;
  }
  throw new Error(`Invalid baseUrl protocol: ${url.protocol}`);
}
```

---

## 9. 受入基準

- [x] FD §1-9 + NFR Req §1-9 のすべての要件を TS クラス設計にマップ
- [x] tsconfig + ESLint で `import type` 強制 (bundle size 制約遵守)
- [x] package.json `dependencies: {}` + `peerDependencies: {}` 明示 (ultrathink Imp1、純粋 fetch wrapper)
- [x] ApiError は network error path もカバー、response: Response | null 採用 + 用途明示 (ultrathink I2)
- [x] SSE wrapper は reader.cancel() を finally で呼び (ultrathink I3)、server 切断通知 + lock 自動 release
- [x] request 関数で `auth` custom field を destructure 分離 (ultrathink I1)、fetch に余分な field を渡さない
- [x] validateBaseUrl の dev hostname resolver 注記 (ultrathink Imp2)
- [x] msw v2 のテスト構成を vitest + setupServer で確立
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 10. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§4.2): `const { auth, ...fetchInit } = init` で custom field 分離、signal は spread で自動継承
- **I2** (§5): `ApiError.from` の `resp.clone()` 用途明示 = 非 streaming response 限定、SSE 初期 error response でも短い JSON で問題なし
- **I3** (§6): SSE wrapper の `finally` で `reader.cancel()` 呼び出し、server 切断通知 + lock 自動 release

### Improvements 2
- **Imp1** (§3): `peerDependencies: {}` 明示、library package convention 整備
- **Imp2** (§8): validateBaseUrl の dev hostname resolver 注記 (`.local` mDNS / `.localhost` RFC 6761 / `localhost` 全環境)

---

## Post-CONSTRUCTION 改修注記 (2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot (ultrathink full 5 fixes 適用済) を保持。

**Important 3 / Improvements 2 の合計 5 件の NFR Design 修正点は全て継続有効**。静的 OpenAPI dump、7 module YesmanApiClient、TokenProvider、ApiError discriminated union、DecisionStream SSE wrapper、msw v2 test 構成等の Design pattern は不変。

### FormData Content-Type 自動委譲 pattern (`775f6a5`)
- `request builder` で `body instanceof FormData` を判定して `Content-Type` header を strip する pattern を追加
- 動機: browser が boundary 付与できず STT が 422 を返していた既存 bug 修正
- 影響: `voice.stt(audio: Blob)` の挙動正常化、他 module への影響なし

### Schema 自動再生成 (`2400f45`)
- `ScoreResponse.history` 追加に伴い `src/generated/schema.ts` を `dump_openapi.py` + `openapi-typescript` chain で再生成
- TypeScript 型は automatic propagation、scores module の return type が `history` 含むよう自動更新

→ U7c NFR Design は CONSTRUCTION 完了状態のまま、FormData fix と schema 自動再生成の 2 点を追加。
