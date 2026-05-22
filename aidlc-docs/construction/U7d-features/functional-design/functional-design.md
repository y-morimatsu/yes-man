# U7d / features — Functional Design

**Unit**: U7d — `apps/web/src/features/` (Feature Views — decision / persona / score / preference / voice + auth/profile 完成版)
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 7 fixes applied: Critical 1 + Important 3 + Improvements 3)

---

## 0. 位置付け

U7a で配置した features placeholder (HomePage / SignInPage / CallbackPage / ProfilePage) を本実装に置換 + decision / persona / score / preference / voice の **機能別ビュー**を新規追加。`@yesman/ui` 共通 component + `@yesman/api-client` を活用。

### 関連要件
- Story B1-B6 (合議): `/decision` + SSE streaming
- Story C1-C4 (主体性スコア): `/score`
- Story D1-D2 (preference): `/preferences`
- Story G1-G6 (persona 管理): `/personas` (list + create + selection)
- Story F1-F4 (voice): VoiceMicButton で `/v1/voice/stt` 連携
- Story A1-A4 (auth + profile): `/profile` 完全実装

### 上流前提
| 出典 | 内容 |
|---|---|
| U7a shell | AuthProvider / ApiProvider / useApi / Layout / routes |
| U7b ui | Button / Card / Toast / PersonaCard / ChoiceButtons / DecisionUtteranceBubble / VoiceMicButton / useToast |
| U7c api-client | YesmanApiClient (7 module) + DecisionStream + ApiError |
| Backend API | U2-U6 + U-Persona 全 endpoint 稼働 |

### MVP スコープ (U7d 内)
- ✅ `/decision` page: user_input → SSE streaming で発話表示 → Yes/No 採択 → Nudge polling
- ✅ `/personas` page: list_my + shared listing + create + selection (上限 3 ガード)
- ✅ `/score` page: 主体性スコア表示 (No 連発検知メッセージ含む)
- ✅ `/preferences` page: PreferenceProfile 閲覧 + DELETE (reset)
- ✅ `/profile` page: GET/PATCH/DELETE 完全実装
- ✅ Voice 入力 (decision page の VoiceMicButton、Web Speech API or AWS STT)
- ✅ React Query (TanStack Query) で server state 管理 (cache + refetch)
- ⏭ 詳細 history 画面、persona 詳細 view は MVP 範囲外
- ⏭ オフライン入力キュー、 retry queue は MVP 範囲外

---

## 1. ディレクトリ構成 (U7a の features placeholder を置換 + 追加)

```
apps/web/src/
├── shell/                          # U7a (既存、変更なし)
├── features/
│   ├── home/HomePage.tsx           # U7a placeholder → 本実装 (nav links + score badge)
│   ├── auth/                       # U7a で完成済 (SignIn / Callback)
│   ├── profile/
│   │   ├── ProfilePage.tsx         # U7a placeholder → 完全実装 (form + save + delete)
│   │   └── useProfile.ts           # React Query hook
│   ├── decision/                   # 新規
│   │   ├── DecisionPage.tsx        # main page (textarea + voice mic + result)
│   │   ├── DecisionResult.tsx      # utterances + proposal + ChoiceButtons
│   │   ├── NudgeBanner.tsx         # 採択後 nudge 表示
│   │   ├── useDecisionStream.ts    # DecisionStream hook (SSE)
│   │   └── useDecision.ts          # query/mutation hooks
│   ├── persona/                    # 新規
│   │   ├── PersonaListPage.tsx     # /personas — own + shared tabs
│   │   ├── PersonaCreateModal.tsx  # 新規作成 form (Modal)
│   │   ├── PersonaSelectionPage.tsx # /personas/selection — 上限 3
│   │   └── usePersona.ts           # React Query hooks
│   ├── score/                      # 新規
│   │   ├── ScorePage.tsx           # /score (no_count + ratio + message)
│   │   └── useScore.ts
│   ├── preference/                 # 新規
│   │   ├── PreferencePage.tsx      # /preferences (view + DELETE)
│   │   └── usePreference.ts
│   └── voice/                      # 新規 (utility、composable)
│       ├── useVoiceInput.ts        # MediaRecorder + STT API or Web Speech API
│       └── voiceBackends.ts        # backend 判定 (config + provider 選択)
└── shell/
    └── routes.tsx                  # 変更: 新 route 追加 (/decision / /personas / /score / /preferences)
```

---

## 2. 共通 infrastructure

### 2.1 React Query (TanStack Query v5) setup (ultrathink C1: per-Provider instance)

```typescript
// shell/QueryProvider.tsx
import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ultrathink C1: useState で per-Provider instance、test 間で isolation + HMR safe.
// module-level singleton にすると test reset 不可、test 間 state leak.
function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,        // 30s
        gcTime: 5 * 60_000,       // 5 min
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
  const [queryClient] = useState(createClient);  // ← per-Provider instance
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

App.tsx に追加: `<ApiProvider><QueryProvider><RouterProvider/>...`

### 2.2 共通 hook (例: useProfile)

```typescript
// features/profile/useProfile.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApi } from "../../shell/ApiProvider";
import { useToast } from "@yesman/ui";

export function useProfile() {
  const api = useApi();
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => api.profiles.getMe(),
  });
}

export function useUpdateProfile() {
  const api = useApi();
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: (payload: ProfileUpdate) => api.profiles.updateMe(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      push({ message: "保存しました", variant: "success" });
    },
    onError: (err: ApiError) => {
      push({ message: `エラー: ${err.reason}`, variant: "error" });
    },
  });
}
```

---

## 3. /decision page (FR-AI / FR-CV / FR-NUDGE / FR-VOICE)

### 3.1 DecisionPage.tsx (ultrathink Imp1: useReducer + state machine)

```typescript
// Discriminated union state
type DecisionState =
  | { status: "idle"; input: string }
  | { status: "streaming"; input: string; decisionId: string | null; utterances: Utterance[]; proposal: string | null }
  | { status: "completed"; decisionId: string; input: string; utterances: Utterance[]; proposal: string }
  | { status: "error"; error: string; input: string };

type DecisionAction =
  | { type: "setInput"; input: string }
  | { type: "start" }
  | { type: "onStart"; decisionId: string }
  | { type: "onUtterance"; utterance: Utterance }
  | { type: "onProposal"; proposal: string }
  | { type: "onComplete" }
  | { type: "onError"; error: string }
  | { type: "reset" };

function reducer(state: DecisionState, action: DecisionAction): DecisionState {
  switch (action.type) {
    case "setInput":
      return state.status === "idle" || state.status === "error"
        ? { ...state, status: "idle", input: action.input }
        : state;
    case "start":
      return { status: "streaming", input: state.status !== "completed" ? state.input : "",
               decisionId: null, utterances: [], proposal: null };
    case "onStart":
      if (state.status !== "streaming") return state;
      return { ...state, decisionId: action.decisionId };
    case "onUtterance":
      if (state.status !== "streaming") return state;
      return { ...state, utterances: [...state.utterances, action.utterance] };
    case "onProposal":
      if (state.status !== "streaming") return state;
      return { ...state, proposal: action.proposal };
    case "onComplete":
      if (state.status !== "streaming" || !state.decisionId || !state.proposal) return state;
      return { status: "completed", decisionId: state.decisionId, input: state.input,
               utterances: state.utterances, proposal: state.proposal };
    case "onError":
      return { status: "error", error: action.error, input: state.status !== "error" ? "" : state.input };
    case "reset":
      return { status: "idle", input: "" };
  }
}

export default function DecisionPage() {
  const [state, dispatch] = useReducer(reducer, { status: "idle", input: "" });
  const { startStream } = useDecisionStream({
    onStart: (id) => dispatch({ type: "onStart", decisionId: id }),
    onUtterance: (u) => dispatch({ type: "onUtterance", utterance: u }),
    onProposal: (text) => dispatch({ type: "onProposal", proposal: text }),
    onComplete: () => dispatch({ type: "onComplete" }),
    onError: (err) => dispatch({ type: "onError", error: String(err) }),
  });

  const handleStart = async () => {
    if (state.status !== "idle" && state.status !== "error") return;
    dispatch({ type: "start" });
    await startStream({ user_input: state.input });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">合議で決定</h1>
      <Input
        value={state.status === "idle" || state.status === "error" || state.status === "streaming" ? state.input : ""}
        onChange={(e) => dispatch({ type: "setInput", input: e.target.value })}
        placeholder="決めたいことを入力 (例: ランチ何にする)"
        disabled={state.status === "streaming"}
      />
      <div className="flex gap-2">
        <Button onClick={handleStart} disabled={state.status === "streaming"}
                loading={state.status === "streaming"}>
          合議開始
        </Button>
        <VoiceMicInput onTranscript={(text) => dispatch({ type: "setInput", input: text })} />
      </div>
      {(state.status === "streaming" || state.status === "completed") && (
        <DecisionResult
          utterances={state.utterances}
          proposal={state.proposal}
          decisionId={state.status === "completed" ? state.decisionId : null}
          onComplete={() => dispatch({ type: "reset" })}
        />
      )}
      {state.status === "error" && (
        <p className="text-danger" role="alert">{state.error}</p>
      )}
    </div>
  );
}
```

**state machine 図** (ultrathink Imp1):
```
idle ─(setInput)─▶ idle
idle ─(start)──▶ streaming ─(onStart/onUtterance/onProposal)──▶ streaming
streaming ─(onComplete)──▶ completed ─(reset)──▶ idle
streaming ─(onError)──▶ error ─(setInput)──▶ idle
```

### 3.2 useDecisionStream (ultrathink I1: useRef で stale closure 防止)

```typescript
export function useDecisionStream(callbacks: StreamCallbacks) {
  const api = useApi();
  const abortRef = useRef<AbortController | null>(null);
  // ultrathink I1: callbacks (毎 render 新 ref) を ref で capture、startStream を stable に
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const startStream = useCallback(async (payload: DecisionRequestPayload) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const stream = api.decisions.streamRequest(payload);
    try {
      for await (const event of stream.events(abortRef.current.signal)) {
        const cb = callbacksRef.current;
        switch (event.type) {
          case "start": cb.onStart?.(event.data.decision_id); break;
          case "utterance": cb.onUtterance?.(event.data); break;
          case "proposal": cb.onProposal?.(event.data.proposal_text); break;
          case "complete": cb.onComplete?.(); break;
          case "error": cb.onError?.(event.data); break;
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.is("request_aborted")) return;
      callbacksRef.current.onError?.(err);
    }
  }, [api]);  // ← callbacks 除外、stable

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { startStream, abort };
}
```

### 3.3 DecisionResult + ChoiceButtons → Nudge polling

- `ChoiceButtons` で Yes/No → `api.decisions.choose(decisionId, choice)` mutation
- 採択後、`NudgeBanner` で nudge polling (2s interval、最大 30s)
- Yes 採択時の nudge 受信を Toast 表示

---

## 4. /personas page (FR-PERSONA)

### 4.1 PersonaListPage

- 2 tabs: 「自分の Persona」「共有プール」
- 「自分」tab: `api.personas.listMy()` + create button
- 「共有」tab: `api.personas.listShared({ sort, page })` + sort selector
- 各 PersonaCard クリックで詳細表示 (MVP では Modal で edit/delete/share)
- Selection page へリンク

### 4.2 PersonaCreateModal (ultrathink I2: rejected_by_moderator detail を Toast に)

- form: name / description / prompt_text / avatar_url
- submit → `api.personas.create()` の error handling:

```typescript
onError: (err: ApiError) => {
  if (err.is("rejected_by_moderator")) {
    // ultrathink I2: server 由来の説明文 (detail.message) を Toast で具体的に表示
    const detail = err.detail as { reason: string; message?: string } | null;
    push({
      message: detail?.message ?? "このペルソナは沈黙演出ドメインに該当するため作成できません。",
      variant: "error",
    });
  } else {
    push({ message: `エラー: ${err.reason}`, variant: "error" });
  }
}
```

### 4.3 PersonaSelectionPage

- 自分の persona + 共有 + builtin から **最大 3 個** 選択
- 上限 3 で disabled、保存 → `api.personaSelections.setMe()`
- reset → `api.personaSelections.resetMe()` で builtin に戻す

---

## 5. /score page (FR-SCORE)

### 5.1 ScorePage (ultrathink Imp2: threshold-based UI)

- `api.scores.getMe()` で `{no_count, total, ratio, message}` 取得
- 履歴 chart は MVP 範囲外、数値のみ

```typescript
type ScoreLevel = "ok" | "warning" | "danger";

function getScoreLevel(no_count: number, ratio: number | null): ScoreLevel {
  if (no_count >= 5) return "danger";       // Story C3: 5 連発検知
  if (ratio !== null && ratio > 0.5) return "warning";
  return "ok";
}

export default function ScorePage() {
  const { data } = useScore();
  if (!data) return <Spinner />;
  const level = getScoreLevel(data.no_count, data.ratio);
  const ratioPercent = data.ratio !== null ? Math.round(data.ratio * 100) : null;

  return (
    <Card className={
      level === "danger" ? "border-l-4 border-danger" :
      level === "warning" ? "border-l-4 border-warning" : ""
    }>
      <h1 className="text-2xl font-bold mb-3">主体性スコア</h1>
      {level === "danger" && (
        <p className="text-danger font-bold mb-2" role="alert">
          ⚠ No 連発を検知しました。ご自身の判断軸を見直してみましょう。
        </p>
      )}
      {level === "warning" && (
        <p className="text-warning mb-2">
          最近 No の比率が高めです。
        </p>
      )}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>No 回数:</dt><dd className="font-mono text-xl">{data.no_count}</dd>
        <dt>合計回数:</dt><dd className="font-mono text-xl">{data.total}</dd>
        <dt>No 比率:</dt><dd className="font-mono text-xl">{ratioPercent !== null ? `${ratioPercent}%` : "-"}</dd>
      </dl>
      <p className="mt-3 text-neutral-700">{data.message}</p>
    </Card>
  );
}
```

---

## 6. /preferences page (FR-LEARN)

### 6.1 PreferencePage

- `api.preferences.getMe()` で PreferenceProfile 取得
- accepted_patterns / rejected_patterns / persona_style_preference 等を表示
- 「リセット」button で `api.preferences.resetMe()` (DELETE) → confirmation modal

---

## 7. /profile page (FR-AUTH)

### 7.1 ProfilePage (完全実装、ultrathink Imp3: 二段階削除確認)

- `api.profiles.getMe()` → form pre-fill (email read-only、display name + 設定編集可)
- save → `api.profiles.updateMe(payload)`
- Sub / Email / created_at 表示

#### 7.1.1 アカウント削除の二段階確認 (ultrathink Imp3)

```typescript
function ProfileDeleteSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const { push } = useToast();
  const deleteMe = useDeleteProfile();  // mutation hook

  const handleDelete = async () => {
    try {
      await deleteMe.mutateAsync();
      push({ message: "アカウントを削除しました", variant: "info" });
      await signOutUser();
    } catch (err) {
      push({ message: "削除失敗", variant: "error" });
    }
  };

  return (
    <>
      <Button variant="danger" onClick={() => setModalOpen(true)}>
        アカウント削除
      </Button>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="アカウント削除確認">
        <p className="text-neutral-700 mb-3">
          すべてのデータ (Profile / Decision history / Persona / Selection) が完全に削除されます。
          <strong className="text-danger">取消不可</strong>です。
        </p>
        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>上記を理解し、アカウントを削除することに同意します。</span>
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => { setModalOpen(false); setConfirmed(false); }}>
            キャンセル
          </Button>
          <Button variant="danger" disabled={!confirmed} loading={deleteMe.isPending} onClick={handleDelete}>
            完全に削除する
          </Button>
        </div>
      </Modal>
    </>
  );
}
```

**二段階確認の効果**: button 一発削除より、ユーザーが意識的に "理解して同意" する step を挟むことで誤操作防止。user data 重要性に応じた UX。

---

## 8. Voice 統合 (FR-VOICE)

### 8.1 useVoiceConfig (ultrathink I3: React Query で 1h cache)

```typescript
export function useVoiceConfig() {
  const api = useApi();
  return useQuery({
    queryKey: ["voice", "config"],
    queryFn: () => api.voice.getConfig(),
    staleTime: 60 * 60_000,        // 1 hour、deploy-static で頻繁変化しない
    gcTime: 24 * 60 * 60_000,      // 24 hour
  });
}
```

### 8.2 useVoiceInput

```typescript
export function useVoiceInput() {
  const [state, setState] = useState<VoiceMicState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const api = useApi();
  const { data: voiceConfig } = useVoiceConfig();  // ultrathink I3: cached
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const start = useCallback(async () => {
    if (!voiceConfig) return;  // config 未取得時は no-op
    setState("recording");
    if (voiceConfig.backend === "web-speech-api") {
      // browser-native Web Speech API
      startWebSpeechRecognition({
        onResult: (text) => { setTranscript(text); setState("idle"); },
        onError: () => setState("error"),
      });
    } else {
      // MediaRecorder → audio blob → /v1/voice/stt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      // ... record + stop on user click → setState("processing") → api.voice.stt(blob)
    }
  }, [api, voiceConfig]);

  return { state, transcript, start, stop };
}
```

---

## 9. routes.tsx 変更 (U7a)

```typescript
// U7a routes.tsx に追加
const DecisionPage = lazy(() => import("../features/decision/DecisionPage"));
const PersonaListPage = lazy(() => import("../features/persona/PersonaListPage"));
const PersonaSelectionPage = lazy(() => import("../features/persona/PersonaSelectionPage"));
const ScorePage = lazy(() => import("../features/score/ScorePage"));
const PreferencePage = lazy(() => import("../features/preference/PreferencePage"));

// routes 配列 children に追加:
{ path: "decision", element: <RequireAuth><DecisionPage /></RequireAuth> },
{ path: "personas", element: <RequireAuth><PersonaListPage /></RequireAuth> },
{ path: "personas/selection", element: <RequireAuth><PersonaSelectionPage /></RequireAuth> },
{ path: "score", element: <RequireAuth><ScorePage /></RequireAuth> },
{ path: "preferences", element: <RequireAuth><PreferencePage /></RequireAuth> },
```

---

## 10. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/features/profile/useProfile.test.tsx` | RTL + msw | get/update/delete mutation |
| `tests/features/decision/useDecisionStream.test.tsx` | RTL + msw SSE mock | start / event 受信 / abort |
| `tests/features/persona/usePersona.test.tsx` | RTL + msw | list/create/selection |
| `tests/features/score/ScorePage.test.tsx` | RTL | render + score display |
| `tests/features/voice/useVoiceInput.test.tsx` | RTL + getUserMedia mock | web-speech-api / mediaRecorder 経路 |

合計 ~30 ケース。

---

## 11. 受入基準 (Stage 1 完了)

- [x] 5 機能 page (decision / persona / score / preference + voice utility) + 完全実装 profile + home
- [x] React Query (TanStack v5) で server state cache (per-Provider instance、ultrathink C1)
- [x] DecisionStream SSE 統合 (AbortController + useRef callbacks、ultrathink I1)
- [x] Persona selection 上限 3 ガード + rejected_by_moderator detail Toast (ultrathink I2)
- [x] Voice config を React Query で 1h cache (ultrathink I3)
- [x] DecisionPage state machine (useReducer + discriminated union、ultrathink Imp1)
- [x] ScorePage threshold UI (no_count >= 5 で danger / ratio > 0.5 で warning、ultrathink Imp2)
- [x] Profile 削除を二段階確認 (Modal + checkbox + final button、ultrathink Imp3)
- [x] U7a routes に新 5 path 追加
- [x] テスト戦略 5 ファイル × ~30 ケース
- [x] U7b ui (10+ component) + U7c api-client (7 module) 全活用
- [x] ultrathink 全 7 件適用 (Critical 1 + Important 3 + Improvements 3)

## 12. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§2.1): `QueryClient` を `useState(createClient)` で per-Provider instance、test isolation + HMR safe

### Important 3
- **I1** (§3.2): `useDecisionStream` callbacks を `useRef` で capture、`startStream` を stable に
- **I2** (§4.2): PersonaCreateModal で `rejected_by_moderator` detail.message を Toast に表示
- **I3** (§8.1-8.2): `useVoiceConfig` を React Query で 1h cache、毎 mount fetch 回避

### Improvements 3
- **Imp1** (§3.1): DecisionPage を `useReducer` + discriminated union state machine 化
- **Imp2** (§5.1): ScorePage threshold UI (no_count>=5 danger / ratio>0.5 warning)
- **Imp3** (§7.1.1): Profile 削除を二段階確認 (Modal + checkbox + final button)

---

## Post-CONSTRUCTION 改修注記 (2026-05-17 〜 2026-05-19)

本ドキュメント本体は 2026-05-16 承認時の Snapshot を保持。以下の改修が Post-CONSTRUCTION 段階で本 unit のスコープに加わった (本 unit が最大の改修負荷):

### 1. Score 画面の Yes-ratio 化 + radial / line chart 二段表示 (`317280b` + `2400f45`)

- **`features/score/scoreLevel.ts`**: warning 閾値を `ratio > 0.5` → `ratio < 0.5` に反転 (低 Yes 比率 = 委任不十分 = warning)
- **`features/score/strings.ts`**: copy を「主体性スコア」→「**委任度スコア (Yes 比率)**」「たかいほど信頼できています」に統一
- **`features/score/ScoreRadialChart.tsx`** **新規**: INCEPTION drawio screen-04 準拠の SVG 円グラフ、中央に大% metric
- **`features/score/ScoreLineChart.tsx`** **新規**: 30 日 trend line chart、`ScoreResponse.history` を消費
- **`features/score/ScorePage.tsx`** 全面再設計: 円グラフ + line chart + pink AI bubble (励まし) を縦 stack、scrollable
- **`features/score/useScore.ts`**: `useQuery(['scores', 'me'])` の return 型を `ScoreResponse` (history 含む) に拡張

### 2. Decision 画面の UX 改修 (`2400f45` + `2b08a75` + `775f6a5`)

- **`features/decision/usePrefetchedDecisions.ts`** **新規**: No 連打バーストに備え 2 件の next decision を background prefetch、`SwipeChoice` swap 時に instant 表示
- **`features/decision/reducer.ts`**: `swapFromBuffer` action 追加 + `setInput` idempotency (同じ input を連投しても state 変化なし)
- **`features/decision/DecisionPage.tsx`**: persona pill を utterance bubble 上 inline 化、central voice button、horizontal input+send layout
- **`features/decision/NudgeBanner.tsx`**: pink AI bubble の copy 整理 (Voice toggle 関連も含む)

### 3. Voice 入力 UI の backend toggle 統合 (`775f6a5`)

- **`features/voice/VoiceMicInput.tsx`**: `useVoiceBackend` + `useVoiceInput` (composed) を消費、Server STT / Web Speech API を user 設定に従って自動切替
- **`features/profile/ProfilePage.tsx`**: 「🎤 音声入力 backend」radio セクションを追加、localStorage 永続化

### 4. Persona 画面の Dynamic Routing 反映 (`07c1c78`、Closes #4)

- **`features/persona/PersonaSelectionPage.tsx`**: builtin persona card に「💡 おすすめ」pink pill badge、`usePreference` の `persona_style_preference` で top-3 にのみ表示、cold-start user は badge 非表示
- **`features/persona/usePersona.ts`**: 既存の `useQuery` を維持、新たに `usePreference` を import して読み取り合成

### 5. Preference 画面の全面再設計 (`2b08a75`)

- **`features/preference/PreferencePage.tsx`**: `accepted_patterns dict[]` + domain tags + `persona_style_preference` bar graph + `inferred_tags` pills の 4 セクション構成に再設計
- **`features/preference/usePreference.ts`**: response type を拡張、API surface (GET / PATCH / DELETE `/v1/preferences/me`) は不変

### 6. HomePage Splash の整理 (`28c8adc`)

- **`features/home/HomePage.tsx`**: 「→ スワイプして同意」の italic 灰色案内文字を削除 (実機ではスワイプ操作を要求していないため誤解防止)
- 削除部分: `<p className="mt-4 text-xs italic text-neutral-400">→ スワイプして同意</p>`

### 7. FE-DESIGN style 8 件修正 (`1924411`)

- 各 feature 内の h2 5 箇所に `font-serif` 追加 (FE-DESIGN-02)
- `Layout.tsx` (U7a 担当) の `max-w-md` + header palette 修正は U7a の改修注記参照

### 受入条件 (Post-CONSTRUCTION 実機検証)

- E2E `tests/e2e/tests/score.spec.ts` (2 test): Yes-ratio 警告表示 + radial + line chart 描画
- E2E `tests/e2e/tests/no-burst-regenerate.spec.ts` (5 test): No 連打 → prefetch buffer swap 動作
- E2E `tests/e2e/tests/swipe-and-discussion.spec.ts` (9 test): SwipeChoice state-leak なし
- E2E `tests/e2e/tests/persona.spec.ts` (3 test): 💡おすすめ badge 表示 (cold-start 除く)
- E2E `tests/e2e/tests/voice.spec.ts` (2 test): VoiceMicButton toggle + backend 切替
- E2E `tests/e2e/tests/inception-*` (4 spec / 64 test): INCEPTION drawio 仕様準拠
- すべて 2026-05-19 時点で PASS

→ U7d / features は CONSTRUCTION 完了後の最大改修対象、Score / Decision / Voice / Persona / Preference / Home の全 6 feature に手が入ったが、`@yesman/api-client` schema の自動 propagation により breaking change は最小化された。

---

## Post-CONSTRUCTION 改修注記 v2 (2026-05-22) — Pack A + Decision History

本ドキュメント本体および v1 改修注記は変更なし。以下の改修が 2026-05-22 に本 unit のスコープに加わった:

### 8. Demo UX Polish Pack A (`a731786`、2026-05-22)

4 件の UX 改善を一括実装:

- **`features/score/ScorePage.tsx`** (UI 側無変更): API 側 `_format_message` の変更により pink bubble の `{data.message}` 表示が具体的な %値付きコピーに自動更新される (本ファイルへの変更なし)
- **`features/home/HomePage.tsx`** に `SummaryCard` コンポーネントを追加。`useScore()` hook を流用し、最近の YesMan 件数 / Yes 比率 / progress bar / `data.message` を表示。データあり時は `/score` へ、履歴なし (empty state) 時は `/decision` へ動線を提供
- **`features/decision/PersonaThinkingChips.tsx`** を新規作成し、`DecisionResult.tsx` の LIVE badge 直後に組み込み。3 persona の SSE 発話状態を chip 形式で表示 (未発話: pulse アニメ / 発話済: ✓ + persona 名)、`motion-reduce:animate-none` 対応で `prefers-reduced-motion: reduce` 時は pulse 停止
- **`features/decision/DecisionResult.tsx`** に `canvas-confetti` を import し、Yes 採択確定時に `fireConfetti()` を発火。brand purple / coral / pink の 50 粒を 1.5 秒舞わせる。`window.matchMedia("(prefers-reduced-motion: reduce)")` を確認し、reduce 設定時は confetti をスキップ

### 9. ScorePage Decision History (`bcd9a9b`〜`aa25a2e`、2026-05-22)

5 件のファイルを追加 + ScorePage に 1 行 insert:

- **`features/score/formatRelativeTime.ts`** 新規: ISO 8601 文字列を受け取り 5 段階フォーマットで人間可読な相対時刻を返す (`たった今` / `N 分前` / `N 時間前` / `昨日` / `N 日前` / `YYYY-MM-DD` のフォールバック)
- **`features/score/truncate.ts`** 新規: surrogate pair (絵文字等) を安全に扱う truncate 実装 (`[...s].slice(0, maxLen).join("")` パターン)
- **`features/score/useDecisionHistory.ts`** 新規: React Query hook。`queryKey: ["decisions", "history", "yes", limit]`、`staleTime: 30_000`。`api.decisions.history({ limit, choice: "yes" })` を呼び出し、エラーは silent fail (コンポーネント側で empty state 表示)
- **`features/score/DecisionHistoryList.tsx`** 新規: 各 item を `✓ + 質問「…」→ 提案 + 🕒 相対時刻 ・ 採用回数 (🌟 1 回目 / 🔄 N 回目で採用)` の構成で表示。silent fail (API エラー時は非表示) / loading skeleton / empty state (「まだ Yes 採択の履歴がありません」) を実装
- **`features/score/ScorePage.tsx`** の paradox note セクションの直後に `<DecisionHistoryList />` を 1 行 insert

### 受入条件 (Post-CONSTRUCTION v2 実機検証)

- API integration test 5 件 (`test_decision_flow.py` list endpoint 追加分) PASS
- Mock seed unit test 3 件 (`test_mock_repositories.py` attempt_count バリエーション) PASS
- Web unit test 4 件 (`DecisionHistoryList.test.tsx`: render / loading / empty / item 表示) PASS
- Web unit test 13 件 (`formatRelativeTime.test.ts` 5 段階 × 境界値、`truncate.test.ts` surrogate pair) PASS
- e2e Playwright 全 100/100 PASS (既存 spec の回帰なし)
