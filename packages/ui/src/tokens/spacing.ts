/**
 * Spacing tokens (FD §2.2、Tailwind 互換 + YesMan 特殊).
 */
export const spacing = {
  "0": "0",
  "1": "0.25rem",
  "2": "0.5rem",
  "3": "0.75rem",
  "4": "1rem",
  "6": "1.5rem",
  "8": "2rem",
  "12": "3rem",
  "16": "4rem",
  "24": "6rem",
  swipe: "20rem",
  utterance: "min(28rem, 100% - 2rem)",
} as const;

export type Spacing = typeof spacing;
