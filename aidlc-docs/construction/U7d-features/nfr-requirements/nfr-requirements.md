# U7d / features — NFR Requirements

**Unit**: U7d — `apps/web/src/features/`
**Phase**: CONSTRUCTION — NFR Requirements
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 7 fixes applied: Critical 1 + Important 3 + Improvements 3)
**Upstream**: FD 7 + NFR Req 7 = 累計 14 fixes

---

## 0. 位置付け

FD §1-12 で確定した「5 feature page + React Query + SSE state machine + threshold UI + 二段階削除」設計に対し、6 観点で NFR を確定する。

---

## 1. Performance

| ID | 要件 | 計測 | 目標値 |
|---|---|---|---|
| **PERF-U7d-01** | feature chunk (lazy import 後) | gzip | < 60 KB / chunk (ultrathink C1: React Query は **vite manualChunks で shared chunk 強制**、per-feature chunk から除外) |
| **PERF-U7d-02** | DecisionPage 初回 render | per-mount | < 200 ms (cached query なし) |
| **PERF-U7d-03** | SSE event 表示遅延 (received → DOM update) | per-event | < 50 ms |
| **PERF-U7d-04** | Persona list rendering (10 items) | render | < 100 ms |
| **PERF-U7d-05** | Score page initial query | API + render | < 500 ms (server response 含む) |
| **PERF-U7d-06** | React Query cache hit rate (ultrathink Imp1: 目標値は session 内、実測 metric として devtools で観察) | session | > 70% 目安 (refetch 抑止) |
| **PERF-U7d-07** | Voice STT total UX (recording stop → text) | end-to-end | **< 15 sec (3秒以下入力)** / < 20 sec (3-15秒入力) (ultrathink I1: U6 PERF-U6-03/04 と整合) |

### 1.1 Vite bundle splitting 戦略 (ultrathink C1)

```typescript
// apps/web/vite.config.ts に追加
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        // shared chunk: 全 feature で共通の重い deps を分離
        "react-vendor": ["react", "react-dom", "react-router-dom"],
        "tanstack-query": ["@tanstack/react-query"],  // ← per-feature chunk から除外
        "aws-amplify": ["aws-amplify", "aws-amplify/auth"],
      },
    },
  },
},
```

**根拠** (ultrathink C1): 各 feature chunk が `@tanstack/react-query` を含むと、5 feature × 12 KB = 60 KB 重複。manualChunks で 1 shared chunk に集約、各 feature chunk は ~10-30 KB に。NFR Req PERF-U7d-01 (< 60 KB / chunk) 達成。

---

## 2. Security

| ID | 要件 | 根拠 |
|---|---|---|
| **SEC-U7d-01** | 全 feature page は **RequireAuth wrapper 必須** (U7a routes で適用済) | 認証ガード |
| **SEC-U7d-02** | ApiError 表示時、`detail` フィールドの **`message` だけを表示**、内部 stack trace 等は出さない | 情報漏洩防止 |
| **SEC-U7d-03** | DOM 注入 (`dangerouslySetInnerHTML`) 禁止、user/server content は React JSX 経由 | XSS 防止 |
| **SEC-U7d-04** | Persona prompt_text 表示は **plain text + `whitespace-pre-wrap` で改行のみ保持** (ultrathink I2)、Markdown / HTML render しない | XSS + injection 防止 + UX (改行が見える) |
| **SEC-U7d-05** | Profile 削除は二段階確認、CSRF token は Cognito ID Token で代替 | 誤操作 + CSRF 防止 |
| **SEC-U7d-06** | Voice recording 時、`getUserMedia` の permission denied は明示 error UI | UX + 透明性 |

---

## 3. Availability

| ID | 要件 | 根拠 |
|---|---|---|
| **AVAIL-U7d-01** | DecisionStream 中断時に **AbortController で cleanup** (network leak 防止) | resource leak |
| **AVAIL-U7d-02** | API 障害時に **Toast でユーザー通知** + retry button 提供 | UX |
| **AVAIL-U7d-03** | 401 受信時に sign-in redirect (U7a ApiProvider 経由、間接フロー) | session expire |
| **AVAIL-U7d-04** | Persona create 失敗 (rejected_by_moderator) で **form state 維持** | UX (再入力なし) |
| **AVAIL-U7d-05** | Voice backend 不可 (web-speech-api では client_only) で **fallback テキスト入力** が常時可能 | accessibility |

---

## 4. Maintainability

| ID | 要件 | 根拠 |
|---|---|---|
| **MAINT-U7d-01** | feature 別 directory 厳格分離 (`features/decision/` 等)、cross-feature import 禁止 | layered |
| **MAINT-U7d-02** | React Query hooks は `useXxx` 命名、各 feature の `use*.ts` で集約 | locality |
| **MAINT-U7d-03** | DecisionPage の state machine は `reducer.ts` 単独 file で test 容易性 | unit test |
| **MAINT-U7d-04** | api-client の type を再 export せず、`import type` で直接参照 | DRY |
| **MAINT-U7d-05** | feature page は shell の Layout 配下で routing、独自 layout 持たない | consistency |

---

## 5. Extensibility

| ID | 要件 | 根拠 |
|---|---|---|
| **EXT-U7d-01** | 新 feature 追加は `features/<name>/<Name>Page.tsx` + `use<Name>.ts` + routes.tsx 1 行 | Open-Closed |
| **EXT-U7d-02** | React Query queryKey は階層的 (`["persona", "list", "my"]`) で invalidation 容易 | cache 管理 |
| **EXT-U7d-03** | DecisionStream の event type 追加 (e.g., "metadata") は `useDecisionStream` switch に 1 case 追加で対応 | streaming 拡張 |
| **EXT-U7d-04** | i18n は将来 react-i18next で features 内 string を抽出可能 | future i18n |

---

## 6. Testability

| ID | 要件 | 根拠 |
|---|---|---|
| **TEST-U7d-01** | 各 hook (`useDecision` / `usePersona` / `useScore` 等) は msw v2 で API mock test | unit test |
| **TEST-U7d-02** | DecisionPage reducer は **pure function、別 unit test** で全 transition カバー | state machine test |
| **TEST-U7d-03** | `useVoiceInput` は `vi.mock("aws-amplify/auth")` 等と同様に `getUserMedia` mock | DOM API mock |
| **TEST-U7d-04** | カバレッジ目標: lines > 70% / branches > 60% (UI 多分岐の現実的目標、ultrathink I3 緩和根拠) | coverage |

#### 6.1 coverage 目標緩和根拠 (ultrathink I3)

U7a は 75/65、U7d は 70/60 と緩和。理由:
- features 層は **UI 多分岐** (loading / error / empty / success 状態 × 多 feature) で test 困難 path 多い
- React Query の `isPending` / `isError` / `data` 分岐は test stub で全網羅困難
- MVP では主要 happy path + 1-2 error path で coverage 達成可能
- 安定後、Phase 2 で U7a 同等 (75/65) に引き上げ検討
| **TEST-U7d-05** | SSE stream test は msw v2 SSE response 模擬で event 流れ確認 | streaming test |

---

## 7. 依存追加 (apps/web package.json)

| 依存 | 種別 | バージョン | 用途 |
|---|---|---|---|
| `@tanstack/react-query` | dep | ^5.0.0 | server state cache |
| `@tanstack/react-query-devtools` | devDep | ^5.0.0 | dev debug、prod bundle 除外 (ultrathink Imp2) |
| (注: i18n 想定の string format) | - | - | 日本語 hardcode、`t("key")` 関数経由可能な書き方を意識 (ultrathink Imp3) |

### 7.1 React Query DevTools 条件付き import (ultrathink Imp2)

```typescript
// shell/QueryProvider.tsx に追加
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export function QueryProvider({ children }) {
  const [queryClient] = useState(createClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

`import.meta.env.DEV` は Vite が prod build 時に `false` に置換、`<ReactQueryDevtools>` を含む branch は **tree-shake で完全除去**、prod bundle に含まれない。

### 7.2 i18n future-proofing (ultrathink Imp3)

現在の MVP は日本語 hardcode、将来 `react-i18next` 導入時の容易性のため:
- error message / button label / placeholder text は **`const STRINGS = { errorXxx: "...", buttonYyy: "..." } as const` で 1 箇所集約** (各 feature の `strings.ts`)
- 将来 `t("errorXxx")` に sed 一括置換可能
- MVP では翻訳不要、Phase 2 で i18n 導入時のコスト最小化
| `@yesman/ui` | dep | workspace:* | 既存 (U7a で追加済) |
| `@yesman/api-client` | dep | workspace:* | 既存 |

---

## 8. 受入基準

- [x] 6 観点で 27 NFR ID 定義 (Perf 7 + Sec 6 + Avail 5 + Maint 5 + Ext 4 + Test 5)
- [x] FD 設計 (React Query + SSE state machine + threshold UI + 二段階削除) と整合
- [x] feature 別 directory layered architecture
- [x] Vite manualChunks で react-query を shared chunk 化 (ultrathink C1)
- [x] Voice STT target 値を U6 と整合 < 15 sec (ultrathink I1)
- [x] Persona prompt_text は whitespace-pre-wrap + plain text (ultrathink I2)
- [x] coverage 現実的目標 (lines 70% / branches 60%) + 緩和根拠 (ultrathink I3)
- [x] React Query cache hit rate は実測 metric として devtools 観察 (ultrathink Imp1)
- [x] React Query DevTools は `import.meta.env.DEV` で prod 除外 (ultrathink Imp2)
- [x] i18n future-proofing で strings.ts 集約 (ultrathink Imp3)
- [x] 依存追加 (TanStack Query) のみ、他は workspace 既存
- [x] ultrathink 全 7 件適用 (Critical 1 + Important 3 + Improvements 3)

## 9. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (PERF-U7d-01 + §1.1): Vite manualChunks で `@tanstack/react-query` を shared chunk 化、per-feature chunk から除外

### Important 3
- **I1** (PERF-U7d-07): Voice STT target を U6 PERF-U6-03/04 と整合 < 15 sec (3秒以下) / < 20 sec (3-15秒)
- **I2** (SEC-U7d-04): Persona prompt_text は `whitespace-pre-wrap` で改行保持 + plain text only
- **I3** (TEST-U7d-04 + §6.1): coverage 70/60 緩和根拠、UI 多分岐 + Phase 2 で 75/65 引き上げ検討

### Improvements 3
- **Imp1** (PERF-U7d-06): cache hit rate は devtools 観察、目安値
- **Imp2** (§7.1): React Query DevTools は `import.meta.env.DEV` で prod tree-shake
- **Imp3** (§7.2): i18n future-proofing、`strings.ts` 集約で `t("key")` 置換容易
