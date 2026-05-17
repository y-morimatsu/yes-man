/**
 * Color palette tokens (FD §2.1 + ultrathink I2: brand MVP 暫定).
 *
 * brand color は Designer レビュー前の MVP 暫定値、コンセプト絵本との整合確認後に調整可能.
 * 値変更時は本ファイル 1 箇所のみで全 component に反映.
 */
export const colors = {
  brand: {
    50: "#fff7ed",
    100: "#ffedd5",
    200: "#fed7aa",
    300: "#fdba74",
    400: "#fb923c",
    500: "#f97316", // ベース、large text のみ AA pass
    600: "#ea580c", // ★ default 推奨 (NFR Req I2 解析、normal text AA pass 5.5:1)
    700: "#c2410c",
    800: "#9a3412",
    900: "#7c2d12",
  },
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
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
  silence: "#94a3b8",
  yes: "#22c55e",
  no: "#ef4444",
} as const;

export type Colors = typeof colors;
