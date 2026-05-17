# U7b / ui — Functional Design

**Unit**: U7b — `packages/ui` (共有 UI コンポーネント + Tailwind デザイントークン)
**Phase**: CONSTRUCTION — Functional Design
**Author**: AI-DLC workflow
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 7 fixes applied: Critical 1 + Important 3 + Improvements 3)

---

## 0. 位置付け

`packages/ui/` は **React 共有 UI コンポーネント + Tailwind デザイントークン (preset)** を提供する。`apps/web` (U7a Shell / U7d Features) から import される。U7c api-client と同じく、packages 配下の internal package。

### 関連要件
- Story B1-B6 (合議画面 + Yes/No 採択 UI)
- Story C1-C4 (主体性スコア表示)
- Story E1-E3 (ナッジ演出 トースト)
- Story F1-F4 (音声入力 UI: マイクボタン + 状態表示)
- Story G1-G6 (ペルソナ管理 UI: カード + 選択)

### 上流前提
| 出典 | 内容 |
|---|---|
| 既存 AI-DLC ドキュメント | UX 仕様の確定 (バンドエイドラベル / スワイプ Yes/No / トースト) |
| U7c api-client | `Persona` `DecisionResponse` `TTSResponse` 等の型を import (型のみ依存) |
| Tailwind v4 | デザイントークン (色 / サイズ / フォント) を CSS preset で配布 |

### MVP スコープ (U7b 内)
- ✅ **デザイントークン** (Tailwind preset、色 / spacing / typography / animation)
- ✅ **Primitives** (Button / Card / Input / Toast / Spinner / Modal)
- ✅ **Composites** (PersonaCard / DecisionUtteranceBubble / SwipeYesNo / VoiceMicButton)
- ✅ **Hooks** (`useToast`、`useMediaQuery`)
- ✅ **Storybook** 構成 (component カタログ、CI で snapshot)
- ✅ **Vitest + React Testing Library** で test
- ⏭ アクセシビリティ (a11y) は Storybook + axe-core で MVP 範囲 (詳細監査は U-Test)
- ⏭ アニメーション (Framer Motion) は MVP では Tailwind transition のみ、複雑化は後続
- ⏭ Dark mode は MVP では Tailwind `dark:` variant のみ準備、トグル UI は U7a

---

## 1. ディレクトリ構成

```
packages/ui/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.cjs
├── .storybook/
│   ├── main.ts
│   └── preview.ts
├── src/
│   ├── index.ts                # public exports
│   ├── tokens/
│   │   ├── colors.ts           # color palette (primitive)
│   │   ├── spacing.ts          # spacing scale
│   │   ├── typography.ts       # font sizes / weights
│   │   └── index.ts
│   ├── tailwind-preset.ts      # Tailwind preset (consumer の tailwind.config.ts で extend)
│   ├── primitives/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Toast.tsx + ToastProvider.tsx
│   │   ├── Spinner.tsx
│   │   ├── Modal.tsx
│   │   └── index.ts
│   ├── composites/
│   │   ├── PersonaCard.tsx     # 共有プール / 自分の persona 表示
│   │   ├── DecisionUtteranceBubble.tsx
│   │   ├── SwipeYesNo.tsx
│   │   ├── VoiceMicButton.tsx  # 録音中 / 待機 / 失敗の状態表示
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useToast.ts
│   │   ├── useMediaQuery.ts
│   │   └── index.ts
│   ├── styles/
│   │   └── globals.css         # Tailwind v4 base + tokens 適用
│   └── stories/
│       ├── Button.stories.tsx
│       ├── PersonaCard.stories.tsx
│       └── ... (各 component に対応)
└── tests/
    ├── primitives/             # Button / Card / Toast (RTL)
    ├── composites/             # PersonaCard / SwipeYesNo
    └── hooks/                  # useToast / useMediaQuery
```

---

## 2. デザイントークン (tokens/)

### 2.1 colors.ts

```typescript
// ultrathink I2: brand palette は MVP 暫定 (Designer レビュー前)、
// コンセプト絵本との整合確認後に調整可能。値変更時は本ファイル 1 箇所のみ.
export const colors = {
  // primary palette (YesMan brand、MVP 暫定値)
  brand: {
    50:  "#fff7ed",
    100: "#ffedd5",
    200: "#fed7aa",
    300: "#fdba74",
    400: "#fb923c",
    500: "#f97316",  // ベース、断定的・温かい
    600: "#ea580c",
    700: "#c2410c",
    800: "#9a3412",
    900: "#7c2d12",
  },
  // semantic
  success: "#22c55e",
  warning: "#f59e0b",
  danger:  "#ef4444",
  info:    "#3b82f6",
  // neutral (gray scale)
  neutral: {
    0: "#ffffff",
    50: "#fafafa",
    100: "#f5f5f5",
    200: "#e5e5e5",
    300: "#d4d4d4",
    400: "#a3a3a3",
    500: "#737373",
    600: "#525252",
    700: "#404040",
    800: "#262626",
    900: "#171717",
  },
  // domain-specific (decision states)
  silence:   "#94a3b8",  // 沈黙演出 (FR-DM-SILENT)
  yes:       "#22c55e",
  no:        "#ef4444",
} as const;
```

### 2.2 spacing.ts (Tailwind 互換 + 拡張)

```typescript
export const spacing = {
  "0": "0",
  "1": "0.25rem",  // 4px
  "2": "0.5rem",
  "3": "0.75rem",
  "4": "1rem",
  "6": "1.5rem",
  "8": "2rem",
  "12": "3rem",
  "16": "4rem",
  "24": "6rem",
  // YesMan 特殊
  swipe: "20rem",  // SwipeYesNo の最小 width
  utterance: "min(28rem, 100% - 2rem)",  // 発話バブル最大幅
} as const;
```

### 2.3 typography.ts

```typescript
export const typography = {
  fontFamily: {
    sans: ['"Inter"', '"Noto Sans JP"', "system-ui", "sans-serif"],
    mono: ['"JetBrains Mono"', "monospace"],
  },
  fontSize: {
    xs:   "0.75rem",
    sm:   "0.875rem",
    base: "1rem",
    lg:   "1.125rem",
    xl:   "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    // YesMan 特殊
    decision: "2rem",   // 合議結果テキスト
    persona:  "1.125rem",
  },
} as const;
```

### 2.4 tailwind-preset.ts

```typescript
import type { Config } from "tailwindcss";
import { colors, spacing, typography } from "./tokens";

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors,
      spacing,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
    },
  },
  // dark mode は class strategy (consumer の <html> に "dark" class を切替)
  darkMode: "class",
};

export default preset;
```

consumer 側 (apps/web/tailwind.config.ts) で:
```typescript
import preset from "@yesman/ui/tailwind-preset";
export default { presets: [preset], content: [...] };
```

---

## 3. Primitives

### 3.1 Button.tsx (ultrathink C1 反映: cva 採用)

```typescript
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

// ultrathink C1: class-variance-authority (cva) で variant × size × state を型安全に統合.
// 手書き分岐 (BASE + VARIANT[v] + SIZE[s]) は組合せ爆発で scaling 困難、cva は ~1.5 KB の最小依存.
const buttonVariants = cva(
  // BASE: 全 variant 共通
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500",
  {
    variants: {
      variant: {
        primary:   "bg-brand-500 text-neutral-0 hover:bg-brand-600 active:bg-brand-700",
        secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-0",
        ghost:     "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-0 dark:hover:bg-neutral-800",
        danger:    "bg-danger text-neutral-0 hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-base",
        lg: "h-12 px-6 text-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ variant, size, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      disabled={loading || disabled}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}
```

**cva 採用根拠** (ultrathink C1):
- TypeScript variant 型推論 (`VariantProps<typeof buttonVariants>` で `variant` / `size` の型を自動取得)
- 単一情報源 (variant 定義が 1 箇所、保守容易)
- 標準パターン (shadcn/ui / Radix 等の React community で広く採用)
- 依存サイズ ~1.5 KB、NFR Req PERF-U7b-01 (bundle size 制約) で許容

### 3.2 Card.tsx (ultrathink I3 反映: onClick + as 拡張)

```typescript
import type { ReactNode, ComponentPropsWithoutRef } from "react";

export type CardElement = "div" | "button" | "article";

export interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  // ultrathink I3: onClick 指定時は a11y のため <button> を推奨、他用途で as override 可能
  as?: CardElement;
}

export function Card({ children, className, onClick, as }: CardProps) {
  // onClick あり + as 未指定 → <button> (a11y: keyboard focus + Enter activation)
  // onClick なし → <div> (default)
  const Element: CardElement = as ?? (onClick ? "button" : "div");
  const base = "rounded-2xl bg-neutral-0 dark:bg-neutral-800 shadow-sm p-4";
  const interactive = onClick ? "cursor-pointer hover:shadow-md transition text-left w-full" : "";
  const merged = [base, interactive, className].filter(Boolean).join(" ");
  // type 安全のため Element の props を絞る (button は type="button" 明示でフォーム submit 防止)
  if (Element === "button") {
    return (
      <button type="button" className={merged} onClick={onClick}>
        {children}
      </button>
    );
  }
  if (Element === "article") {
    return <article className={merged} onClick={onClick}>{children}</article>;
  }
  return <div className={merged} onClick={onClick}>{children}</div>;
}
```

### 3.3 Toast.tsx + ToastProvider.tsx

```typescript
// ToastProvider は React Context で多 toast 管理
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (toast: Omit<Toast, "id">) => { ... };
  return <ToastContext.Provider value={{ toasts, push }}>{children}<ToastViewport /></ToastContext.Provider>;
}

// useToast hook で push() を呼ぶ
export function useToast(): { push: (toast: Toast) => void } { ... }
```

### 3.4 Spinner / Modal / Input

シンプルな実装、Tailwind ベース、a11y 考慮 (Modal は `role="dialog"` + focus trap)。

**Modal MVP-optional** (ultrathink Imp1): Persona report confirmation / reset selection confirmation 等で使用想定。U7d Features 実装時に必要箇所が確定、不要なら後続 unit で削除可能。最小実装: `<dialog>` 要素 + focus trap (Tailwind の `backdrop:` modifier 採用)。

---

## 4. Composites

### 4.1 PersonaCard.tsx

```typescript
export interface PersonaCardProps {
  persona: {
    id: string;
    name: string;
    description?: string | null;
    avatar_url?: string | null;
    usage_count?: number;
    yes_acceptance_rate?: number;
    creator_anonymous_id?: string;
    is_blocked?: boolean;
  };
  selected?: boolean;
  onClick?: () => void;
  variant?: "compact" | "full";
}

export function PersonaCard({ persona, selected, onClick, variant = "full" }: PersonaCardProps) {
  return (
    <Card className={selected ? "ring-2 ring-brand-500" : ""} onClick={onClick}>
      <PersonaAvatar src={persona.avatar_url} name={persona.name} />
      <h3 className="font-semibold">{persona.name}</h3>
      {variant === "full" && (
        <>
          <p className="text-sm">{persona.description}</p>
          {persona.creator_anonymous_id && (
            <span className="text-xs text-neutral-500">by {persona.creator_anonymous_id}</span>
          )}
        </>
      )}
    </Card>
  );
}
```

### 4.2 DecisionUtteranceBubble.tsx

```typescript
export interface UtteranceBubbleProps {
  personaName: string;
  text: string;
  variant?: "default" | "highlighted";
}

export function DecisionUtteranceBubble({ personaName, text, variant = "default" }: UtteranceBubbleProps) {
  return (
    <div className={`p-3 rounded-2xl max-w-utterance ${variant === "highlighted" ? "bg-brand-100" : "bg-neutral-100 dark:bg-neutral-700"}`}>
      <span className="text-xs font-medium text-brand-600">{personaName}</span>
      <p className="text-base mt-1">{text}</p>
    </div>
  );
}
```

### 4.3 ChoiceButtons.tsx (ultrathink I1: 機能-名前一致リネーム)

`SwipeYesNo` → `ChoiceButtons` にリネーム。MVP は 2 ボタン実装、gesture は将来 `SwipeChoice` を別 component として追加可能。

```typescript
export interface ChoiceButtonsProps {
  onYes: () => void;
  onNo: () => void;
  proposalText: string;
  disabled?: boolean;
}

export function ChoiceButtons({ onYes, onNo, proposalText, disabled }: ChoiceButtonsProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-decision text-center font-medium">{proposalText}</p>
      <div className="flex gap-4">
        <Button variant="danger" size="lg" onClick={onNo} disabled={disabled}>No</Button>
        <Button variant="primary" size="lg" onClick={onYes} disabled={disabled}>Yes</Button>
      </div>
    </div>
  );
}
```

**rename 根拠** (ultrathink I1): MVP の機能と name を一致 (gesture 非実装で `Swipe` 名は誤解を招く)。将来 swipe gesture 追加時は `SwipeChoice` を別 file として追加、`ChoiceButtons` と coexist 可能。

### 4.4 VoiceMicButton.tsx (ultrathink Imp2: state machine 明示)

```typescript
/**
 * VoiceMicButton state machine (U6 voice flow と整合):
 *
 *   idle ──(user click)──▶ recording
 *    ▲                          │
 *    │                          │ (user stop / max duration timeout)
 *    │                          ▼
 *    │                      processing  ──(STT API call)──▶
 *    │                          │
 *    │                          ├──(success)──▶ idle (caller が text を受領)
 *    │                          └──(failure)──▶ error
 *    │                                           │
 *    └──────────(click "再試行")─────────────────┘
 *
 * caller (U7d Features) が API 経由 STT を呼ぶ間、state を制御.
 * U6 voice WebSpeechApi backend では recording → processing が圧縮 (FE 完結).
 */
export type VoiceMicState = "idle" | "recording" | "processing" | "error";

export interface VoiceMicButtonProps {
  state: VoiceMicState;
  onClick: () => void;
  errorMessage?: string;  // error state 時の補助テキスト
}

export function VoiceMicButton({ state, onClick, errorMessage }: VoiceMicButtonProps) {
  const label: Record<VoiceMicState, string> = {
    idle: "話す",
    recording: "録音中...",
    processing: "処理中...",
    error: "再試行",
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant={state === "recording" ? "danger" : state === "error" ? "secondary" : "primary"}
        size="lg"
        onClick={onClick}
        loading={state === "processing"}
        aria-label={label[state]}
        aria-pressed={state === "recording"}
      >
        <MicIcon /> {label[state]}
      </Button>
      {state === "error" && errorMessage && (
        <p className="text-sm text-danger">{errorMessage}</p>
      )}
    </div>
  );
}
```

---

## 5. Hooks

### 5.1 useToast

```typescript
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

### 5.2 useMediaQuery

```typescript
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);
  return matches;
}
```

---

## 6. Storybook

- `.storybook/main.ts` で `stories: ["../src/**/*.stories.tsx"]`
- 各 component 1 stories ファイル
- CI で `storybook build` + snapshot (chromatic は MVP では skip)

**Future option** (ultrathink Imp3): `@storybook/test-runner` + `axe-core` で stories の a11y + interaction test を CI 統合可能。MVP では Vitest + RTL を主体とし、test-runner は Phase 2 (U-Test 横断テスト) で導入検討。

---

## 7. テスト戦略

| ファイル | 種別 | 対象 |
|---|---|---|
| `tests/primitives/Button.test.tsx` | RTL + vitest | variant / size / loading / disabled / onClick |
| `tests/primitives/Toast.test.tsx` | RTL + vitest | ToastProvider + useToast + viewport rendering |
| `tests/composites/PersonaCard.test.tsx` | RTL | selected state + compact/full variant + onClick |
| `tests/composites/SwipeYesNo.test.tsx` | RTL | onYes/onNo handler、proposal text render |
| `tests/composites/VoiceMicButton.test.tsx` | RTL | state 別 label + aria-label |
| `tests/hooks/useToast.test.ts` | RTL renderHook | push + auto dismiss |

合計 ~25 ケース。

---

## 8. 受入基準 (Stage 1 完了)

- [x] デザイントークン (colors / spacing / typography) 定義、brand は MVP 暫定明示 (ultrathink I2)
- [x] Tailwind preset 構造確定
- [x] Primitives 6 + Composites 4 + Hooks 2
- [x] `class-variance-authority` (cva) 採用 (ultrathink C1) で variant 型推論 + scaling
- [x] Card は onClick + as 拡張で a11y 強化 (ultrathink I3)
- [x] `SwipeYesNo` → `ChoiceButtons` リネーム (ultrathink I1) で機能-名前一致
- [x] VoiceMicButton state machine 図 + U6 voice flow 整合 (ultrathink Imp2)
- [x] Modal MVP-optional 注記 (ultrathink Imp1)
- [x] Storybook + Vitest + RTL 構成、test-runner は Phase 2 (ultrathink Imp3)
- [x] U7c api-client の型のみ参照 (runtime 依存なし)
- [x] テスト戦略 6 ファイル × ~25 ケース
- [x] ultrathink 全 7 件適用 (Critical 1 + Important 3 + Improvements 3)

## 9. ultrathink 適用ログ (2026-05-16)

### Critical 1
- **C1** (§3.1): `class-variance-authority` (cva) 採用、variant × size × state を型安全に統合、shadcn/ui community standard

### Important 3
- **I1** (§4.3): `SwipeYesNo` → `ChoiceButtons` リネーム、MVP 2 ボタン実装と name 一致、将来 `SwipeChoice` 別 component で追加可能
- **I2** (§2.1): brand color #f97316 を MVP 暫定明示、Designer レビュー後調整可能と注記
- **I3** (§3.2): Card に onClick + `as: "div"|"button"|"article"` 拡張、a11y 強化 (button 時 keyboard focus + Enter)

### Improvements 3
- **Imp1** (§3.4): Modal MVP-optional 注記、Persona report 等で使用想定、不要なら後続 unit で削除可能
- **Imp2** (§4.4): VoiceMicButton state machine 図 (idle ↔ recording ↔ processing ↔ error) + U6 voice flow 整合
- **Imp3** (§6): `@storybook/test-runner` + axe-core は Phase 2 (U-Test) で導入検討
