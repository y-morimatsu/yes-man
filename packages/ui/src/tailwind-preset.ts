/**
 * Tailwind preset (FD §2.4 + Infra Design §4.1).
 *
 * Tailwind v3 では `presets: [preset]` で適用、v4 では `@plugin "@yesman/ui/tailwind-preset"` で適用可能.
 */
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
