# Mock モード ログイン/ユーザ登録機能 — Design Spec

- **Date**: 2026-05-20
- **Author**: y-morimatsu (with Claude Opus 4.7)
- **Status**: Approved (brainstorming)
- **Scope**: `apps/web/src/shell/` + `apps/web/src/features/auth/` 配下のみ。API は変更しない。
- **Branch**: `feature/mock-auth-ui`
- **画面モックアップ (drawio, 4 ページ)**: [diagrams/2026-05-20-mock-auth-screens.drawio](diagrams/2026-05-20-mock-auth-screens.drawio)
  1. `01_SignIn_Empty` — 初回訪問 (登録ユーザ 0 件)
  2. `02_SignIn_Populated` — 再訪問 (登録ユーザあり、行クリックで即サインイン)
  3. `03_E2E_Flow` — 4 画面で「初回登録 → ホーム → サインアウト → 再サインイン」フロー
  4. `04_State_Machine` — authenticated ↔ unauthenticated の遷移 + 責務分担

---

## 1. 背景

YesMan の認証機構は Cognito Hosted UI + aws-amplify で実装済みだが、開発時は `VITE_AUTH_BYPASS=true` で起動するため:

- 自動的に Mock User (`VITE_MOCK_USER_EMAIL` = `test@example.com`) として認証済みになる
- [SignInPage](../../../apps/web/src/features/auth/SignInPage.tsx) のボタンは no-op
- Header の Sign out button (Layout.tsx) も `signOutUser()` が即 return するため**何も起きない**

つまり「ログイン画面」「ユーザ登録」「ログアウト」のいずれも dev で見ることができない。

本 spec は Mock mode 下で「本物っぽい」ログイン/登録/ログアウトの UX を提供する。

---

## 2. ユーザストーリー

> dev / demo 環境で /auth/signin に遷移すると、メール入力フォームと既存登録ユーザ list が表示される。メールを入力して [サインイン] をクリックすると、未登録なら自動登録の上でサインイン、登録済みならそのままサインイン。Sign out button で本当にログアウトされ、再び SignInPage に戻る。

### 受入基準 (Gherkin)

```
Given dev (VITE_AUTH_BYPASS=true) で初回訪問
  And localStorage は未設定
When 認証が必要な page (/) にアクセスする
Then /auth/signin に redirect される
  And 既存ユーザ list は空である

When email "taro@example.com" と表示名 "Taro" を入力して [サインイン] をクリック
Then mock user list に新規登録される
  And current-email が "taro@example.com" になる
  And Header に "Sign out" button が表示され、元 page (/) に redirect される

When [Sign out] button をクリック
Then current-email が null になる
  And /auth/signin に redirect される

When /auth/signin で 既存ユーザ row "taro@example.com" をクリック
Then current-email が "taro@example.com" になる
  And ホーム / に redirect される

# ★ セッション永続化 (reload / 再起動でもログイン状態を保持)
Given "taro@example.com" としてサインイン済み
  And localStorage には current-email = "taro@example.com" が保存されている
When ブラウザを reload する (または tab を閉じて再度開く)
Then AuthProvider の initial state は "authenticated" になる
  And Header に Sign out button が表示される
  And /auth/signin への redirect は発生しない
  And email は "taro@example.com" のまま

Given "taro@example.com" としてサインイン済み + reload して認証状態が維持されている
When [Sign out] button をクリック
Then current-email が null になる (localStorage からも削除)
  And 以降の reload では unauthenticated になる
  And /auth/signin に redirect される
```

---

## 3. アーキテクチャ

### 3.1 Data Model

```ts
// apps/web/src/shell/mockAuthStorage.ts
export interface MockUser {
  email: string;            // unique, lowercased
  display_name?: string;    // optional
  created_at: string;       // ISO 8601
}
```

localStorage keys:

| Key | Type | 意味 |
|---|---|---|
| `yesman:mock-auth:users` | `MockUser[]` (JSON) | 登録済みユーザ list |
| `yesman:mock-auth:current-email` | `string` | 現在サインイン中のメール |

### 3.2 Module 構成

```
apps/web/src/
├── shell/
│   ├── mockAuthStorage.ts   ← 新規: MockUser CRUD (pure module、副作用は localStorage のみ)
│   ├── auth.ts              ← 変更: bypass path で mockAuthStorage 経由
│   ├── AuthProvider.tsx     ← 変更: bypass の initial state / refresh を localStorage 連動
│   └── Layout.tsx           ← 変更: Sign out button onClick で refresh() 呼び
└── features/auth/
    ├── SignInPage.tsx       ← 大幅刷新: email form + 既存ユーザ list
    └── CallbackPage.tsx     ← 据え置き (実 Cognito flow 用)
```

### 3.3 mockAuthStorage.ts API

```ts
export function listUsers(): MockUser[];
export function registerUser(email: string, display_name?: string): MockUser;
  // - email を normalize (lowercase + trim)
  // - 既存ならそのまま返す (no-op)
  // - 未登録なら追加 + 返す
export function setCurrentEmail(email: string): void;
  // - email を normalize
  // - 既存 list に無ければ throw (UI 側で先に registerUser 呼ぶ責任)
export function getCurrentEmail(): string | null;
export function clearCurrent(): void;  // = sign out
export function getCurrentUser(): MockUser | null;
  // - getCurrentEmail() → listUsers() から検索
```

### 3.4 auth.ts 変更

```ts
export async function signIn(email?: string): Promise<void> {
  if (env.authBypass) {
    if (!email) return;  // SignInPage が email 必須で呼ぶ責任
    const normalized = email.toLowerCase().trim();
    mockAuthStorage.registerUser(normalized);  // 未登録なら自動登録
    mockAuthStorage.setCurrentEmail(normalized);
    return;
  }
  await signInWithRedirect();
}

export async function signOutUser(): Promise<void> {
  if (env.authBypass) {
    mockAuthStorage.clearCurrent();
    return;
  }
  await signOut({ global: false });
}
```

### 3.5 AuthProvider 変更

```ts
function readBypassState(): { status, sub, email } {
  const current = mockAuthStorage.getCurrentUser();
  if (!current) return { status: "unauthenticated", sub: null, email: null };
  return {
    status: "authenticated",
    sub: env.mockUserSub,  // ← API 側 fixed sub と整合させるため env から (※制約参照)
    email: current.email,
  };
}

// initial state + refresh() で readBypassState() を呼ぶ
```

`sub` は env の固定値を使う。Profile/履歴データは全 user で共有される (※ §6 制約)。

#### セッション永続化の根拠

localStorage は browser に永続保存 (sessionStorage と違い tab 閉じても残る) されるため:

- **AuthProvider mount 時に毎回 localStorage を読む** → reload / 再起動でも前回 `current-email` が残っていれば authenticated として復帰
- **明示的に [Sign out] を押さない限り `current-email` は削除されない** → 「次回起動時もログイン状態を保持」を満たす
- **Sign out は `clearCurrent()` で localStorage を消去** → 以降の起動は unauthenticated

これは Cognito の `aws-amplify` が token を localStorage に持つ挙動 (再起動でも session 復帰) と意図的に揃えた設計。

### 3.6 SignInPage UI

```
┌──────────────────────────────────────┐
│       YesMan にサインイン             │
│                                      │
│  Email                               │
│  [                              ]    │
│  表示名 (新規登録時のみ・任意)         │
│  [                              ]    │
│                                      │
│         [   サインイン   ]            │
│                                      │
│  ──────  または  ──────              │
│                                      │
│  既存ユーザから選択:                  │
│  ┌─────────────────────────────┐    │
│  │ taro@example.com  (Taro)    │ →  │
│  ├─────────────────────────────┤    │
│  │ hanako@example.com           │ →  │
│  └─────────────────────────────┘    │
│  (初回は「まだ登録ユーザはいません」)  │
│                                      │
└──────────────────────────────────────┘
```

**動作**:

| 操作 | 結果 |
|---|---|
| Email 入力 + [サインイン] (既存 email) | そのままサインイン、表示名 input は無視 |
| Email 入力 + [サインイン] (未登録 email) | `registerUser()` で list に追加 + サインイン |
| 既存ユーザ row click | その email でサインイン |

**Validation** (フロント):

- Email: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (簡易 RFC 風)
- Email 未入力 / 不正 → [サインイン] button を `disabled`
- display_name: 最大 50 文字、optional

### 3.7 サインイン後の navigation

既存実装と同様:

- `location.state.from.pathname` を sessionStorage `yesman:redirect-to` に保存
- サインイン成功後、`AuthProvider.refresh()` → status="authenticated" → SignInPage の `useEffect` で sessionStorage から復帰先を読み navigate

(実 Cognito の場合 CallbackPage を経由するが、bypass mode では SignInPage 内で完結)

### 3.8 Layout の Sign out button

```tsx
const { refresh } = useAuth();

const handleSignOut = async () => {
  await signOutUser();
  await refresh();
  // RequireAuth が status=unauthenticated を検知 → /auth/signin redirect
};

<Button variant="ghost" size="sm" onClick={handleSignOut}>Sign out</Button>
```

---

## 4. State machine

```
[unauthenticated]
   │
   │  SignInPage:
   │   - email 入力 + [サインイン] click
   │   - or 既存ユーザ row click
   ▼
signIn(email) → registerUser (if not exists) + setCurrentEmail
   │
   │  refresh()
   ▼
[authenticated] (Layout header に Sign out ボタン)
   │
   │  Layout:
   │   - [Sign out] click
   ▼
signOutUser() → clearCurrent
   │
   │  refresh() → RequireAuth detect → Navigate to /auth/signin
   ▼
[unauthenticated]
```

---

## 5. Error / Edge cases

| ケース | 挙動 |
|---|---|
| localStorage が無効 (private mode etc.) | try/catch で wrap、警告 toast 表示 + signIn 失敗扱い |
| 同 email を 2 度登録 | `registerUser` は冪等 (既存を返す) |
| `setCurrentEmail` で未登録 email | `registerUser` を先に呼ぶ責任は呼出側、それでも throw した場合は SignInPage で error toast |
| Email format 不正 | フロント validation で [サインイン] disabled |
| 既存ユーザ list が壊れた JSON | localStorage を一度 clear して空 list で再起動 |

---

## 6. 制約 / 既知の限界 (Out of Scope)

### 6.1 Multi-user 採番 (2026-05-21 拡張)

**[更新]** ユーザフィードバックを受けて完全 multi-user 化を実装:

- `MockUser` に `sub: string` を追加し、`registerUser` で `crypto.randomUUID()` で採番
- `CognitoTokenProvider.getToken()` の bypass 分岐で Bearer `mock-user:<base64url(JSON{sub, email})>` を構築
- API 側 [MockAuthAdapter](../../../apps/api/src/yesman_api/infrastructure/auth/mock_adapter.py) を拡張: `mock-user:` prefix の token を JSON パースして `sub`/`email` を取り出し、そのまま `AuthenticatedUser` として返す
- 既存 `mock-auto` (= `MOCK_AUTO_USER=true` + Bearer 無し時の middleware fallback) は **不変** で backward compat 維持
- Profile auto-create が新規 sub に対して空 Profile を作るため、**Profile / decisions / preference_profile / persona_selections も user 別に分離**される

結果: Header の Sub も Profile データも user 固有のものになる。

#### Token 検証ルール (API 側)

| Token | 挙動 |
|---|---|
| `""` | `AuthError("missing")` |
| `"mock-expired"` / `"mock-anonymous"` / `"mock-malformed"` | 既存 SPECIAL_TOKENS → AuthError |
| `"mock-user:<base64url(JSON{sub,email})>"` | sub/email を抽出して返す。malformed JSON / 非 UUID sub / 必須フィールド欠落は AuthError("malformed") |
| その他 (例: `"mock-auto"`) | env 固定 sub/email を返す (backward compat) |

### 6.2 パスワード入力なし

Mock であることを明示するため、パスワード input は持たない。

### 6.3 Tab 間 sync なし

`storage` event listener は実装しない。複数 tab で sign out したら、もう片方の tab で操作するまで反映されない。

### 6.4 実 Cognito flow は変更しない

`VITE_AUTH_BYPASS=false` (real Cognito) の挙動は完全に据え置き。SignInPage の bypass 分岐のみ追加、それ以外の path は変更しない。

### 6.5 E2E test への影響

既存の e2e tests は `VITE_AUTH_BYPASS=true` + 自動サインインに依存している可能性がある。本 spec の変更後、初回訪問は**未認証**スタートになるため、e2e setup で:

```ts
await page.addInitScript(() => {
  localStorage.setItem('yesman:mock-auth:users', JSON.stringify([{
    email: 'test@example.com',
    display_name: 'Mock User',
    created_at: new Date().toISOString(),
  }]));
  localStorage.setItem('yesman:mock-auth:current-email', 'test@example.com');
});
```

のような **localStorage seed** を入れる必要がある (= 既存 e2e 修正が follow-up タスクとして発生)。本 spec の Vitest unit tests は自前で MSW + localStorage を制御するため影響しない。

---

## 7. 変更ファイル一覧

| 種別 | パス | 内容 |
|---|---|---|
| 新規 | `apps/web/src/shell/mockAuthStorage.ts` | MockUser CRUD pure module |
| 編集 | `apps/web/src/shell/auth.ts` | bypass の signIn/signOutUser を mockAuthStorage 経由 |
| 編集 | `apps/web/src/shell/AuthProvider.tsx` | bypass の initial state / refresh を localStorage 連動 |
| 編集 | `apps/web/src/shell/Layout.tsx` | Sign out button onClick で refresh() 呼ぶ |
| 編集 | `apps/web/src/features/auth/SignInPage.tsx` | email form + 既存ユーザ list 大幅刷新 |
| 新規 | `apps/web/tests/shell/mockAuthStorage.test.ts` | Vitest unit (list/register/setCurrent/clear/getCurrentUser) |
| 編集 | `apps/web/tests/shell/AuthProvider.test.tsx` | bypass + localStorage 状態の test 追加 |
| 新規 | `apps/web/tests/features/auth/SignInPage.test.tsx` | bypass mode の form 動作 / 既存ユーザ click |

---

## 8. テスト方針

### 8.1 mockAuthStorage (必須)

1. `listUsers()` 初期状態 → `[]`
2. `registerUser("taro@example.com")` → 1 件追加 + 返却
3. `registerUser("Taro@Example.com")` → normalize されて既存と同一扱い
4. `setCurrentEmail("taro@example.com")` → `getCurrentEmail()` で取得可
5. `setCurrentEmail("unknown@example.com")` → throw
6. `clearCurrent()` → `getCurrentEmail()` = null
7. `getCurrentUser()` → MockUser を返す / null
8. localStorage 破損時のリカバリ

### 8.2 AuthProvider (必須)

- bypass + localStorage 未設定 → status="unauthenticated"
- bypass + current-email セット済み → status="authenticated", email=current
- `refresh()` で localStorage 更新が反映される
- **★ セッション永続化**: signIn → mount unmount remount (= reload 相当) → 依然 authenticated
- **★ Sign out 永続化**: signOut → mount unmount remount → unauthenticated

### 8.3 SignInPage (必須)

- 初回訪問 (空 list): email 入力 → [サインイン] → registerUser + setCurrentEmail + navigate
- 既存 user row click → setCurrentEmail + navigate
- 不正 email format → [サインイン] disabled
- display_name optional 入力 → list に保持
- (実 Cognito mode の既存挙動は触らないので test 変更なし)

### 8.4 Sign out flow

- Layout の Sign out button click → `signOutUser()` → `refresh()` → status=unauthenticated → RequireAuth が /auth/signin redirect

---

## 9. Risk / Mitigation

| Risk | 影響 | 緩和策 |
|---|---|---|
| 既存 e2e が壊れる | CI fail | spec §6.5 で明示、follow-up issue を切る |
| 実 Cognito の regression | prod break | bypass 分岐のみ追加、Cognito path は不変。Vitest で bypass=true / false 両方の test |
| localStorage 破損 | 起動不能 | try/catch + 自動 reset |
| API 側固定 sub の混乱 | demo 中の誤解 | README / spec で「demo 用に UI 切替のみ」と注釈 |

---

## 10. Git-Flow

- Branch: `feature/mock-auth-ui` (`develop` から切る)
- Squash merge → `develop`
- Conventional Commits、AI-assisted trailer 必須
- 完了基準:
  - [ ] mockAuthStorage / AuthProvider / SignInPage の Vitest unit 全 pass
  - [ ] `pnpm --filter @yesman/web build` 成功
  - [ ] `pnpm --filter @yesman/web lint` warning 0
  - [ ] ブラウザでマニュアル動作: 初回 /auth/signin → 登録 → サインイン → ホーム → Sign out → 戻る

---
