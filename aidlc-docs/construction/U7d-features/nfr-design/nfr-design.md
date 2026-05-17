# U7d / features — NFR Design

**Unit**: U7d — `apps/web/src/features/`
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 7 + NFR Design 5 = 累計 19 fixes

---

## 0. 位置付け

FD §1-12 + NFR Req §1-9 で確定した「5 feature page + React Query + state machine + threshold UI + i18n future-proof」要件を、TypeScript ソース構造にマップ。

---

## 1. ソースツリー (U7a 既存 + U7d 追加)

```
apps/web/src/
├── shell/                        # U7a 既存
│   ├── ApiProvider.tsx
│   ├── AuthProvider.tsx
│   ├── ErrorBoundary.tsx
│   ├── Layout.tsx
│   ├── RequireAuth.tsx
│   ├── auth.ts
│   ├── env.ts
│   ├── routes.tsx                # ★ U7d で変更 (新 5 path 追加)
│   └── QueryProvider.tsx         # ★ U7d で新規 (React Query)
├── features/
│   ├── home/
│   │   └── HomePage.tsx          # U7a placeholder → U7d で本実装
│   ├── auth/                     # U7a 既存 (SignIn / Callback)
│   ├── profile/                  # U7a placeholder → 完全実装
│   │   ├── ProfilePage.tsx       # 変更
│   │   ├── useProfile.ts         # 新規
│   │   └── strings.ts            # 新規 (i18n future-proof)
│   ├── decision/                 # 新規 dir
│   │   ├── DecisionPage.tsx
│   │   ├── DecisionResult.tsx
│   │   ├── NudgeBanner.tsx
│   │   ├── reducer.ts            # state machine (pure function)
│   │   ├── useDecisionStream.ts
│   │   ├── useDecision.ts        # query + mutation hooks
│   │   └── strings.ts
│   ├── persona/                  # 新規 dir
│   │   ├── PersonaListPage.tsx
│   │   ├── PersonaCreateModal.tsx
│   │   ├── PersonaSelectionPage.tsx
│   │   ├── usePersona.ts
│   │   └── strings.ts
│   ├── score/                    # 新規 dir
│   │   ├── ScorePage.tsx
│   │   ├── useScore.ts
│   │   ├── scoreLevel.ts         # threshold logic (pure function)
│   │   └── strings.ts
│   ├── preference/               # 新規 dir
│   │   ├── PreferencePage.tsx
│   │   ├── usePreference.ts
│   │   └── strings.ts
│   └── voice/                    # 新規 dir
│       ├── useVoiceConfig.ts     # React Query 1h cache
│       ├── useVoiceInput.ts      # MediaRecorder / Web Speech API
│       ├── VoiceMicInput.tsx     # wrapper component
│       └── strings.ts
└── App.tsx                       # ★ U7d で変更 (QueryProvider 追加)
```

---

## 2. package.json 変更 (apps/web)

```jsonc
{
  "dependencies": {
    // 既存 + 追加
    "@tanstack/react-query": "^5.0.0"
  },
  "devDependencies": {
    "@tanstack/react-query-devtools": "^5.0.0"
  }
}
```

---

## 3. vite.config.ts 変更 (ultrathink C1: manualChunks)

```typescript
// build セクションに追加
build: {
  target: "es2022",
  sourcemap: true,
  rollupOptions: {
    output: {
      manualChunks: {
        "react-vendor": ["react", "react-dom", "react-router-dom"],
        "tanstack-query": ["@tanstack/react-query"],
        "aws-amplify": ["aws-amplify", "aws-amplify/auth"],
      },
    },
  },
},
```

---

## 4. App.tsx 変更 (QueryProvider 追加)

```typescript
// U7a App.tsx を更新
import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "@yesman/ui";
import { AuthProvider } from "./shell/AuthProvider";
import { ApiProvider } from "./shell/ApiProvider";
import { QueryProvider } from "./shell/QueryProvider";  // ← 新規 import
import { ErrorBoundary } from "./shell/ErrorBoundary";
import { router } from "./shell/routes";

export default function App() {
  // ultrathink Imp2: Provider 順序の依存関係
  // - ErrorBoundary: outermost (catch-all)
  // - ToastProvider: AuthProvider より outer (auth 失敗時 toast 表示)
  // - AuthProvider: ApiProvider の前 (useApi が useAuth.refresh を必要)
  // - ApiProvider: AuthProvider 依存
  // - QueryProvider: 順序自由 (どこに置いても可、ここでは ApiProvider の内側で
  //   useQuery 内から useApi() を呼べる構成)
  // - RouterProvider: innermost
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <ApiProvider>
            <QueryProvider>            {/* ← U7d で追加 */}
              <RouterProvider router={router} />
            </QueryProvider>
          </ApiProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
```

---

## 5. shell/QueryProvider.tsx (新規)

```typescript
"use client";
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error: any) => {
          if (error?.status >= 400 && error?.status < 500) return false;
          return failureCount < 2;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  // ultrathink FD C1: per-Provider instance
  const [queryClient] = useState(createClient);
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* ultrathink NFR Req Imp2 + NFR Design I1: prod tree-shake.
          Vite が import.meta.env.DEV を build 時 false 置換、Rollup DCE で完全除去.
          @tanstack/react-query-devtools の package.json は sideEffects:false で
          import 自体も tree-shake、prod bundle に含まれない. */}
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
```

**ultrathink I1 tree-shake 保証** (NFR Design):
- `import.meta.env.DEV` は Vite が **static replacement** で `true`/`false` に置換
- prod build で `false && <ReactQueryDevtools />` → Rollup DCE で完全除去
- `@tanstack/react-query-devtools` の `package.json` に `"sideEffects": false` が定義済 → top-level `import` statement も tree-shake
- bundle 確認方法: `pnpm build && npx vite-bundle-visualizer` で実 prod bundle に devtools が含まれないことを確認

---

## 6. shell/routes.tsx 変更 (新 5 path)

```typescript
// U7a routes.tsx に追加
const DecisionPage = lazy(() => import("../features/decision/DecisionPage"));
const PersonaListPage = lazy(() => import("../features/persona/PersonaListPage"));
const PersonaSelectionPage = lazy(() => import("../features/persona/PersonaSelectionPage"));
const ScorePage = lazy(() => import("../features/score/ScorePage"));
const PreferencePage = lazy(() => import("../features/preference/PreferencePage"));

// children 配列に追加 (Layout の下):
{ path: "decision", element: <RequireAuth><DecisionPage /></RequireAuth> },
{ path: "personas", element: <RequireAuth><PersonaListPage /></RequireAuth> },
{ path: "personas/selection", element: <RequireAuth><PersonaSelectionPage /></RequireAuth> },
{ path: "score", element: <RequireAuth><ScorePage /></RequireAuth> },
{ path: "preferences", element: <RequireAuth><PreferencePage /></RequireAuth> },
```

---

## 7. features/decision/reducer.ts (pure function、test 容易)

```typescript
import type { Utterance } from "@yesman/api-client";

export type DecisionState =
  | { status: "idle"; input: string }
  | { status: "streaming"; input: string; decisionId: string | null;
      utterances: Utterance[]; proposal: string | null }
  | { status: "completed"; decisionId: string; input: string;
      utterances: Utterance[]; proposal: string }
  | { status: "error"; error: string; input: string };

export type DecisionAction =
  | { type: "setInput"; input: string }
  | { type: "start" }
  | { type: "onStart"; decisionId: string }
  | { type: "onUtterance"; utterance: Utterance }
  | { type: "onProposal"; proposal: string }
  | { type: "onComplete" }
  | { type: "onError"; error: string }
  | { type: "reset" };

export const initialState: DecisionState = { status: "idle", input: "" };

export function decisionReducer(state: DecisionState, action: DecisionAction): DecisionState {
  // ultrathink I2: exhaustive check で新 action 追加時に compile error 強制
  switch (action.type) {
    case "setInput": /* ... */ return state;
    case "start": /* ... */ return state;
    case "onStart": /* ... */ return state;
    case "onUtterance": /* ... */ return state;
    case "onProposal": /* ... */ return state;
    case "onComplete": /* ... */ return state;
    case "onError": /* ... */ return state;
    case "reset": /* ... */ return state;
    default: {
      // 新 action type 追加時、ここで TypeScript が compile error を出す
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
```

---

## 8. features/score/scoreLevel.ts (pure function、test 容易)

```typescript
export type ScoreLevel = "ok" | "warning" | "danger";

export function getScoreLevel(no_count: number, ratio: number | null): ScoreLevel {
  if (no_count >= 5) return "danger";
  if (ratio !== null && ratio > 0.5) return "warning";
  return "ok";
}
```

---

## 9. features/*/strings.ts (ultrathink Imp3: i18n future-proof)

```typescript
// 例: features/persona/strings.ts (ultrathink Imp1: keyof 型 + type-safe key 参照)
export const STRINGS = {
  pageTitle: "ペルソナ管理",
  tabMy: "自分の Persona",
  tabShared: "共有プール",
  createButton: "新規作成",
  createSuccess: "ペルソナを作成しました",
  rejectedDefault: "このペルソナは沈黙演出ドメインに該当するため作成できません。",
  promptTextLabel: "プロンプト指示文",
  selectionPageTitle: "ペルソナ選択 (最大 3)",
  selectionOverLimit: "最大 3 つまで選択可能",
} as const;

export type PersonaStringKey = keyof typeof STRINGS;

// usage 例: t("pageTitle") で typo を TS compile error 化
export function t(key: PersonaStringKey): string {
  return STRINGS[key];
}
// t("typo") → ❌ TS compile error: 'typo' is not assignable to PersonaStringKey
```

各 feature の string を集約、将来 `t("pageTitle")` 置換容易 + **typo 検知** (ultrathink Imp1)。

---

## 10. React Query hooks 標準 pattern

```typescript
// features/decision/useDecision.ts
export function useDecisionMutation() {
  const api = useApi();
  return useMutation({
    mutationFn: (payload: DecisionRequestPayload) => api.decisions.request(payload),
  });
}

export function useChooseMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, choice }: { id: string; choice: "yes" | "no" }) =>
      api.decisions.choose(id, choice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["score"] });  // score 更新
    },
  });
}

export function useNudge(decisionId: string | null, enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: ["nudge", decisionId],
    queryFn: () => api.decisions.getNudge(decisionId!),
    enabled: enabled && !!decisionId,
    // ultrathink I3: dataUpdatedAt 経過時間 30s で polling 諦め、無限 polling 防止
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return 2000;  // 初回 fetch 直前は短く poll
      if (data.status !== "pending") return false;  // ready/failed なら停止
      const elapsed = Date.now() - (q.state.dataUpdatedAt ?? Date.now());
      if (elapsed > 30_000) return false;  // 30s で諦め (NFR Req U4 nudge cache TTL と整合)
      return 2000;  // 2s 間隔継続
    },
  });
}
```

---

## 11. テスト構成 (vitest.config.ts 既存 + 拡張)

`tests/features/<feature>/*.test.tsx` で各 hook + page test、msw v2 で API mock。

```typescript
// 例: tests/features/decision/reducer.test.ts (pure function test)
import { describe, expect, it } from "vitest";
import { decisionReducer, initialState } from "../../../src/features/decision/reducer";

describe("decisionReducer", () => {
  it("transitions idle → streaming on start", () => {
    const next = decisionReducer({ status: "idle", input: "lunch" }, { type: "start" });
    expect(next.status).toBe("streaming");
  });
  // ... 全 transition test
});
```

---

## 12. 受入基準

- [x] FD §1-12 + NFR Req §1-9 の全要件を TS / Vite config にマップ
- [x] manualChunks で react-query を shared chunk 化 (ultrathink NFR Req C1)
- [x] QueryProvider per-instance + devtools dev only + Vite DCE tree-shake 注記 (ultrathink I1)
- [x] decisionReducer に exhaustive check (`_exhaustive: never`、ultrathink I2)
- [x] useNudge に 30s 経過 polling 諦め (`dataUpdatedAt`、ultrathink I3)
- [x] strings.ts に `keyof typeof` 型 + `t(key)` typo 検知 (ultrathink Imp1)
- [x] Provider 順序の依存関係注記 (ultrathink Imp2)
- [x] reducer.ts / scoreLevel.ts は pure function、unit test 容易
- [x] strings.ts で i18n future-proof (ultrathink NFR Req Imp3)
- [x] react-query hooks 標準 pattern (useQuery + useMutation + invalidateQueries)
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 13. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§5): ReactQueryDevtools の tree-shake 保証根拠 (Vite `import.meta.env.DEV` static replacement + Rollup DCE + sideEffects:false)
- **I2** (§7): decisionReducer に `default: const _exhaustive: never = action` で exhaustive check 強制
- **I3** (§10): useNudge に `dataUpdatedAt` 経過時間 30s で polling 停止、無限 polling 防止

### Improvements 2
- **Imp1** (§9): STRINGS に `keyof typeof` 型 + `t(key)` 関数で typo を TS compile error
- **Imp2** (§4): Provider 順序の依存関係コメント (QueryProvider 順序自由 / ApiProvider は AuthProvider 依存)
