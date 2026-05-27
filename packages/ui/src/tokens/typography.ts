/**
 * Typography tokens (FD §2.3).
 */
export const typography = {
  fontFamily: {
    sans: ['"Inter"', '"Noto Sans JP"', "system-ui", "sans-serif"],
    mono: ['"JetBrains Mono"', "monospace"],
  },
  fontSize: {
    // 2026-05-27 typography-redesign: iPhone 13 実機 ergonomics 改善 (Scale C 小サイズ重点).
    //   xs 12→14 (Apple HIG 推奨 minimum 14px 整合, 71 箇所一斉拡大),
    //   sm 14→15 (44 箇所微増). base 以上は不変 (header brand text-lg の現状維持).
    xs: "0.875rem", // 14px (was 0.75rem / 12px)
    sm: "0.9375rem", // 15px (was 0.875rem / 14px)
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
    decision: "2rem", // 32px
    persona: "1.125rem", // 18px
  },
} as const;

export type Typography = typeof typography;
