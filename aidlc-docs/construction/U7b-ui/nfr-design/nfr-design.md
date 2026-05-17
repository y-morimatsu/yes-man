# U7b / ui — NFR Design

**Unit**: U7b — `packages/ui`
**Phase**: CONSTRUCTION — NFR Design
**Created**: 2026-05-16
**Status**: ✅ APPROVED 2026-05-16 (ultrathink full / 5 fixes applied: Important 3 + Improvements 2)
**Upstream**: FD 7 + NFR Req 5 + NFR Design 5 = 累計 17 fixes

---

## 0. 位置付け

NFR Req §1-9 で確定した「bundle ~6.3 KB / WCAG AA / brand-600 推奨 / devDependencies / コンポーネント別 LOC」要件を、TypeScript ソース構造とクラス設計、Tailwind / cva 統合にマップする。

---

## 1. ソースツリー詳細

```
packages/ui/
├── package.json                  # NFR Req §7 依存分類
├── tsconfig.json                 # strict + verbatimModuleSyntax (U7c と同じ)
├── vitest.config.ts              # jsdom environment + setupFiles
├── .eslintrc.cjs                 # consistent-type-imports
├── .gitignore
├── .storybook/
│   ├── main.ts                   # stories + addons
│   └── preview.ts                # globals + parameters
├── src/
│   ├── index.ts                  # public exports
│   ├── tailwind-preset.ts        # Tailwind config preset
│   ├── tokens/
│   │   ├── colors.ts
│   │   ├── spacing.ts
│   │   ├── typography.ts
│   │   └── index.ts
│   ├── primitives/
│   │   ├── Button.tsx            # cva-based
│   │   ├── Card.tsx              # onClick + as polymorphic
│   │   ├── Input.tsx
│   │   ├── Spinner.tsx
│   │   ├── Toast.tsx             # render
│   │   ├── ToastProvider.tsx     # Context provider
│   │   ├── Modal.tsx             # MVP-optional
│   │   └── index.ts
│   ├── composites/
│   │   ├── PersonaCard.tsx
│   │   ├── DecisionUtteranceBubble.tsx
│   │   ├── ChoiceButtons.tsx     # renamed from SwipeYesNo
│   │   ├── VoiceMicButton.tsx
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useToast.ts
│   │   ├── useMediaQuery.ts
│   │   └── index.ts
│   ├── styles/
│   │   └── globals.css           # Tailwind base + tokens 適用
│   ├── icons/
│   │   ├── MicIcon.tsx           # inline SVG (Lucide 系を inline、依存削減)
│   │   ├── CheckIcon.tsx
│   │   ├── XIcon.tsx
│   │   └── index.ts
│   └── stories/
│       ├── Button.stories.tsx
│       ├── Card.stories.tsx
│       ├── PersonaCard.stories.tsx
│       ├── ChoiceButtons.stories.tsx
│       ├── VoiceMicButton.stories.tsx
│       └── Toast.stories.tsx
└── tests/
    ├── setup.ts                  # jsdom + @testing-library/jest-dom
    ├── primitives/
    │   ├── Button.test.tsx
    │   ├── Card.test.tsx
    │   └── Toast.test.tsx
    ├── composites/
    │   ├── PersonaCard.test.tsx
    │   ├── ChoiceButtons.test.tsx
    │   └── VoiceMicButton.test.tsx
    └── hooks/
        ├── useToast.test.ts
        └── useMediaQuery.test.ts
```

---

## 2. tsconfig.json

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",                       // React 17+ automatic runtime
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "tests", "**/*.stories.tsx"]
}
```

---

## 3. package.json (依存分類確定)

```jsonc
{
  "name": "@yesman/ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./tailwind-preset": { "types": "./dist/tailwind-preset.d.ts", "import": "./dist/tailwind-preset.js" },
    "./styles.css": "./src/styles/globals.css"
  },
  "// styles.css note": "ultrathink Imp1: source-level 直接 export、consumer (Vite/webpack) 処理時に PostCSS + Tailwind + minify される、source map 別途不要",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "size": "size-limit"
  },
  "size-limit": [
    { "name": "main bundle", "path": "dist/index.js", "limit": "7 KB" }
  ],
  "dependencies": {
    "class-variance-authority": "^0.7.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "tailwindcss": "^4.0.0"
  },
  "devDependencies": {
    "@yesman/api-client": "workspace:*",
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "jsdom": "^25.0.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "size-limit": "^11.0.0",
    "@size-limit/preset-small-lib": "^11.0.0",
    "storybook": "^8.0.0",
    "@storybook/react-vite": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

---

## 4. Tailwind preset 実装 (FD §2.4 完成版)

```typescript
// src/tailwind-preset.ts
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
  darkMode: "class",
};

export default preset;
```

consumer 側で:
```typescript
import preset from "@yesman/ui/tailwind-preset";
export default { presets: [preset], content: [...] };
```

---

## 5. Button (cva 完成版)

```typescript
// src/primitives/Button.tsx
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Spinner } from "./Spinner";

const buttonVariants = cva(
  // ultrathink Imp2: transition → transition-colors で intent 明示 (color/background/border 変化のみ animate)
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-500",
  {
    variants: {
      variant: {
        // ultrathink NFR Req I2: brand-600 を default、AA contrast 5.5:1 達成
        primary:   "bg-brand-600 text-neutral-0 hover:bg-brand-700 active:bg-brand-700",
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

export function Button({
  variant,
  size,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  // ultrathink I1: defensive ordering、{...rest} を最初に書き、explicit attr を後置で上書き安全化
  return (
    <button
      {...rest}
      className={buttonVariants({ variant, size, className })}
      disabled={loading || disabled}
    >
      {loading ? <Spinner size="sm" /> : children}
    </button>
  );
}
```

---

## 6. Toast (Context + Provider 実装)

```typescript
// src/primitives/Toast.tsx
import { useEffect } from "react";

export interface ToastItem {
  id: string;
  message: string;
  variant?: "success" | "error" | "info";
  durationMs?: number;
}

export function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), toast.durationMs ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id, toast.durationMs, onDismiss]);
  return (
    <div role="status" aria-live="polite" className={`rounded-xl p-3 shadow ${VARIANTS[toast.variant ?? "info"]}`}>
      {toast.message}
    </div>
  );
}

const VARIANTS = {
  success: "bg-success text-white",
  error: "bg-danger text-white",
  info: "bg-info text-white",
} as const;
```

```typescript
// src/primitives/ToastProvider.tsx
"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Toast, type ToastItem } from "./Toast";

interface ToastContextValue {
  push: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // ultrathink I2: counter ベース ID (crypto.randomUUID は Node 18 SSR で undefined、
  // Toast ID は cryptographically unique 不要、依存最小化)
  const counterRef = useRef(0);
  const push = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = `toast-${++counterRef.current}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2">
        {toasts.map((t) => <Toast key={t.id} toast={t} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
```

---

## 7. useMediaQuery (SSR 互換)

```typescript
// src/hooks/useMediaQuery.ts
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  // ultrathink NFR Req AVAIL-U7b-02: SSR で window 不在、initial false で hydration safe
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
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

## 8. Storybook 構成

```typescript
// .storybook/main.ts
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: { name: "@storybook/react-vite", options: {} },
  typescript: { reactDocgen: "react-docgen-typescript" },
};
export default config;
```

```typescript
// .storybook/preview.ts
import type { Preview } from "@storybook/react";
import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "dark", value: "#171717" },
      ],
    },
  },
};
export default preview;
```

---

## 9. テスト setup

```typescript
// tests/setup.ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());
```

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "jsdom",
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.stories.tsx", "src/icons/**", "src/index.ts"],
      // ultrathink I3: 未達で CI fail、自動更新せず、global 閾値で適用
      thresholds: {
        lines: 80,        // NFR Req TEST-U7b-04
        branches: 70,
        autoUpdate: false,  // 閾値の自動更新を抑止 (PR で意図しない緩和を防ぐ)
        perFile: false,    // global aggregate で評価 (1 file の低 coverage を許容)
      },
    },
  },
});
```

---

## 10. 受入基準

- [x] FD §1-9 + NFR Req §1-9 のすべての要件を TS / cva 実装にマップ
- [x] Button は brand-600 default (NFR Req I2 反映)
- [x] api-client は devDependencies (NFR Req I3 反映)
- [x] Button の attr ordering は defensive (rest 先、explicit 後置) (ultrathink I1)
- [x] ToastProvider は counter ベース ID (crypto.randomUUID SSR 非依存、ultrathink I2)
- [x] coverage threshold lines 80% / branches 70% + autoUpdate false + perFile false (ultrathink I3)
- [x] styles.css source-level export 注記 (ultrathink Imp1)
- [x] Button は transition-colors (intent 明示、ultrathink Imp2)
- [x] useMediaQuery は SSR safe (window 不在 check)
- [x] ToastProvider は "use client" directive (Next.js 互換)
- [x] Storybook + addon-essentials 構成
- [x] ultrathink 全 5 件適用 (Important 3 + Improvements 2)

## 11. ultrathink 適用ログ (2026-05-16)

### Important 3
- **I1** (§5): Button の attr ordering を defensive 化 (`{...rest}` 先、explicit `className` / `disabled` を後置で上書き安全)
- **I2** (§6): ToastProvider の ID 生成を `crypto.randomUUID()` → counter ベース (`useRef`) に変更、SSR Node 18 互換
- **I3** (§9): vitest `coverage.thresholds` に `autoUpdate: false` / `perFile: false` を明示、CI fail 挙動 + 自動緩和防止

### Improvements 2
- **Imp1** (§3): `"./styles.css"` export の source-level 直接配布根拠を package.json コメントで記載
- **Imp2** (§5): Button class を `transition` → `transition-colors` で intent 明示
