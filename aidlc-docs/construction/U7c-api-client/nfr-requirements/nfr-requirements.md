# U7c / api-client — NFR Requirements

**Unit**: U7c — `packages/api-client`
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 = 累計 12 fixes

---

## 0. 位置付け

FD §1-9 で確定した「静的 OpenAPI dump + openapi-typescript + YesmanApiClient + TokenProvider + SSE wrapper + ApiError」設計に対し、Performance / Security / Availability / Maintainability / Extensibility / Testability の 6 観点で NFR を確定。FE 配下のため AWS インフラ NFR は限定的、bundle size と CSP が中心。

---

## 1. Performance

| ID | 要件 | 計測 | 目標値 |
|---|---|---|---|
| **PERF-U7c-01** | **runtime JS** bundle size (gzip 後、ultrathink I1: types erased) | minified+gzip | < 10 KB (runtime JS のみ、`import type` 使用で schema.ts は erased) |
| **PERF-U7c-02** | YesmanApiClient instantiate コスト | per-call | < 1 ms (in-memory、token 取得は遅延) |
| **PERF-U7c-03** | request 関数オーバーヘッド (fetch 呼び出し前) | per-call | < 5 ms (header merge + token 取得待ち除く) |
| **PERF-U7c-04** | SSE parseSseChunk 1 event | per-call | < 1 ms (string ops + JSON.parse) |
| **PERF-U7c-05** | openapi-typescript 生成時間 (CI) | full | **< 5 秒** (ultrathink Imp1: api spec ~100 KB で実測 1-3s) |
| **PERF-U7c-06** | tree-shake 可能性 | 静的 | 単一 module だけ import で他 module が削除される (`profiles` だけ使用なら `voice` は bundle 外) |

### 1.1 Bundle size 内訳 (ultrathink I1 詳細)

| ファイル | 用途 | runtime 影響 |
|---|---|---|
| `generated/schema.ts` | `export type paths = {...}; export type components = {...}` | ❌ 0 KB (`import type` で erased) |
| `client.ts` | YesmanApiClient class + request 関数 | ~2 KB minified |
| `sse.ts` | DecisionStream + parseSseChunk | ~1.5 KB |
| `errors.ts` | ApiError class | ~1 KB |
| `auth.ts` | TokenProvider interface (interface は erased、型のみ) | ~0.2 KB |
| 7 × `modules/*.ts` | endpoint 別 wrapper (薄い) | ~7 KB |
| **合計** | runtime JS | ~12 KB minified ≒ **~3-5 KB gzip** |

**前提**: `import type { ... } from "./generated/schema"` を一貫使用 (= 値 import 不可、`import { components }` 等は禁止)。lint rule で強制 (`@typescript-eslint/consistent-type-imports`)。

---

## 2. Security

| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U7c-01** | `Authorization: Bearer <token>` は HTTPS 経路でのみ送信、dev hostname (localhost / 127.0.0.1 / *.local / *.localhost) は http 許容、それ以外の http は **warning** (refusal でなく) (ultrathink I2 補正) | token 漏洩防止、production 想定 |
| **SEC-U7c-02** | TokenProvider 内部で token を memoize する場合、**`SecureContext` (window.isSecureContext)** を要求 | localStorage 等の安全な保管前提 |
| **SEC-U7c-03** | `defaultHeaders` に `Authorization` を含められない (interceptor 経由のみ) | 静的設定での token 漏洩防止 |
| **SEC-U7c-04** | 401 受領で `TokenProvider.refresh()` 呼び出し、無限ループ防止 (`retryOn401` flag) | session hijack 後の DoS 回避 |
| **SEC-U7c-05** | ApiError は **response body の任意 field を expose しない**、`reason` / `detail` / `status` のみ | サーバ内部情報の漏洩防止 |
| **SEC-U7c-06** | SSE wrapper は server 側の `event:` / `data:` 以外を無視 (任意 metadata の信頼回避) | server-side injection 経路を絞る |
| **SEC-U7c-07** | CSP `connect-src` で baseUrl を明示 (apps/web 側で設定) | 不正な fetch destination 防止 |
| **SEC-U7c-08** | aws-amplify / amazon-cognito-identity-js への直接依存禁止 | client 単体で純粋 fetch ライブラリ、依存外部化 |

### 2.1 baseUrl 検証ロジック (ultrathink I2)

```typescript
function validateBaseUrl(baseUrl: string): void {
  const url = new URL(baseUrl);
  if (url.protocol === "https:") return;
  if (url.protocol === "http:") {
    const devHosts = /^(localhost|127\.0\.0\.1|::1|.*\.local|.*\.localhost)$/;
    if (devHosts.test(url.hostname)) return;
    // warning: 不明な host で http、prod 環境の誤設定の可能性
    console.warn(
      `[YesmanApiClient] Non-HTTPS baseUrl: ${baseUrl}. ` +
      `This is only safe for dev hosts (localhost/127.0.0.1/*.local).`
    );
    return;
  }
  throw new Error(`Invalid baseUrl protocol: ${url.protocol}`);
}
```

constructor 内で呼び出し、初期化時 1 回検証。

---

## 3. Availability

| ID | 要件 | 根拠 |
|---|---|---|
| **AVAIL-U7c-01** | network error は `ApiError(status=0, reason="network_error")` の uniform 型で expose、native `TypeError` を leak しない (ultrathink I3 詳細) | UI 側 error handling 一元化 |
| **AVAIL-U7c-02** | SSE 接続中の network 断は AsyncGenerator から `error` event で再現、上流 catch 可能 | UI 側で再接続誘導可能 |
| **AVAIL-U7c-03** | TokenProvider.refresh() 失敗時は元の 401 を ApiError で raise、UI に再ログイン誘導 | session 失効の UX 統一 |
| **AVAIL-U7c-04** | api-client 単体で SSR 環境 (Next.js) でも動作 (window 依存なし) | future SSR 移行可能性 |

### 3.1 network_error / request_aborted マッピング (ultrathink I3)

```typescript
// request<T> 内で実装
try {
  const resp = await client.fetchImpl(url, init);
  // ... 通常 path
} catch (err) {
  if (err instanceof ApiError) throw err;  // own error は re-throw
  if (err instanceof DOMException && err.name === "AbortError") {
    throw new ApiError(0, "request_aborted", { message: err.message }, null);
  }
  // fetch の TypeError 等 (DNS 失敗、TLS 失敗、CORS 拒否等)
  throw new ApiError(0, "network_error", { message: String(err) }, null);
}
```

`ApiError.response: Response | null` に修正 (network 失敗時は response 存在しない)。
`KnownApiErrorReason` に `network_error` / `request_aborted` を追加 (FD §5 への反映が後続)。

---

## 4. Maintainability

| ID | 要件 | 根拠 |
|---|---|---|
| **MAINT-U7c-01** | 各 module ファイルは < 200 行 (薄い wrapper、ロジック最小) | レビュー容易性 |
| **MAINT-U7c-02** | `generated/schema.ts` は手書き変更禁止、コメントで明記 | drift 防止 |
| **MAINT-U7c-03** | 新 endpoint 追加時は (a) `dump_openapi.py` 実行 → (b) `pnpm run generate` → (c) 対応 module に method 追加、の 3 step で完了 | 拡張容易性 |
| **MAINT-U7c-04** | ApiError reason は `KnownApiErrorReason` literal type に列挙、新 reason 追加時の review checkpoint | drift 早期検知 |
| **MAINT-U7c-05** | tsconfig は `strict: true`、`noUncheckedIndexedAccess: true` | 型安全強制 |

---

## 5. Extensibility

| ID | 要件 | 根拠 |
|---|---|---|
| **EXT-U7c-01** | 新 endpoint は OpenAPI schema 拡張で自動的に型が出る、手書き不要 (module method 追加のみ) | Open-Closed |
| **EXT-U7c-02** | 認証 backend が Cognito → Auth0 等に変更されても TokenProvider 実装差替えのみで対応 | strategy pattern |
| **EXT-U7c-03** | SSE 以外の streaming (WebSocket / gRPC-web) 追加時、`sse.ts` と同パターンで別 wrapper を追加可能 | 既存 API 互換性 |
| **EXT-U7c-04** | カスタム header は `defaultHeaders` で一般化注入 (ultrathink Imp2: i18n / 計測 / 実験 flag 等) | interceptor 不要、12-factor 適合 |

### 5.1 defaultHeaders 拡張用途例 (ultrathink Imp2)

| header | 用途 |
|---|---|
| `Accept-Language: ja,en;q=0.9` | i18n、user 設定言語 |
| `X-Client-Version: 1.2.3` | observability、release 別エラー追跡 |
| `X-Experiment-Bucket: A` | A/B testing 識別 |
| `X-Trace-Id: <uuid>` | distributed tracing、X-Ray 連携 |

これらは `Authorization` と異なり static で OK のため `defaultHeaders` で一括設定可能。

---

## 6. Testability

| ID | 要件 | 根拠 |
|---|---|---|
| **TEST-U7c-01** | msw v2 で全 endpoint テスト可能、実 API 起動不要 | CI 高速 |
| **TEST-U7c-02** | TokenProvider mock は inline で容易 (`{ getToken: async () => "fake" }`) | DI で test 簡素化 |
| **TEST-U7c-03** | SSE parser test は **生 SSE string** を `parseSseChunk` に渡せる (ReadableStream 不要) | unit test 独立性 |
| **TEST-U7c-04** | カバレッジ目標 > 85% (lines、branches) | 重要 path 全網羅 |

---

## 7. 環境変数 / Build 設定

### 7.1 ビルド時 (CI)

| 設定 | 値 | 説明 |
|---|---|---|
| `pnpm` workspace | `apps/web` から `@yesman/api-client` 参照 | monorepo internal package |
| `apps/api/openapi.json` | commit 必須 | dump_openapi.py 出力 |
| `packages/api-client/src/generated/schema.ts` | commit 必須 | openapi-typescript 出力 |

### 7.2 ランタイム (apps/web 側)

| 環境変数 (Vite / build) | 説明 |
|---|---|
| `VITE_API_BASE_URL` | `https://...cloudfront.net` (prod) or `http://localhost:8000` (dev) |
| `VITE_COGNITO_*` | U7a Web Shell で設定 (api-client は読まない) |

api-client 自身は環境変数を読まず、すべて `YesmanApiClientOptions` で受け取る (12-factor app 準拠)。

---

## 8. 受入基準

- [x] 6 観点で 27 NFR ID 定義 (Perf 6 + Sec 8 + Avail 4 + Maint 5 + Ext 4 + Test 4)
- [x] FD 設計 (静的 dump + 7 module + TokenProvider + SSE) と整合
- [x] **runtime JS** bundle size 制約 < 10 KB gzip + 内訳表 (types erased) (ultrathink I1)
- [x] HTTPS 強制 + dev hostname 許容 + baseUrl 検証ロジック (ultrathink I2)
- [x] network_error / request_aborted の uniform ApiError マッピング (ultrathink I3)
- [x] aws-amplify 直接依存禁止 (純粋 fetch ライブラリ)
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 9. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (PERF-U7c-01 + §1.1): bundle size 内訳表、types erasure 明示、`import type` 一貫使用 + lint rule
- **I2** (SEC-U7c-01 + §2.1): HTTPS 強制 + dev hostname allowlist 正規表現 + baseUrl 検証ロジック
- **I3** (AVAIL-U7c-01 + §3.1): network_error / request_aborted マッピング、`ApiError.response: Response | null` 修正、KnownApiErrorReason 拡張

### Improvements 2
- **Imp1** (PERF-U7c-05): openapi-typescript 生成時間 10s → 5s に下方修正 (実測 1-3s)
- **Imp2** (EXT-U7c-04 + §5.1): defaultHeaders 一般化用途例 (Accept-Language / X-Client-Version / X-Experiment / X-Trace-Id)
