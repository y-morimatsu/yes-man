/**
 * Typography tokens (FD §2.3).
 */
export const typography = {
  fontFamily: {
    sans: ['"Inter"', '"Noto Sans JP"', "system-ui", "sans-serif"],
    mono: ['"JetBrains Mono"', "monospace"],
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    decision: "2rem",
    persona: "1.125rem",
  },
} as const;

export type Typography = typeof typography;
