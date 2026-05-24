/**
 * avatarColors — 2026-05-24: avatar gradient preset (8 色).
 *
 * 各 color key で linear-gradient(135deg, start → end) を返す.
 * default = green (旧 ProfileSummaryCard と互換).
 */
export type AvatarColorKey =
  | "green"
  | "orange"
  | "blue"
  | "purple"
  | "pink"
  | "yellow"
  | "teal"
  | "umber";

interface ColorSpec {
  /** picker swatch + actual gradient start */
  start: string;
  end: string;
  /** picker label (a11y) */
  label: string;
}

export const AVATAR_COLORS: Record<AvatarColorKey, ColorSpec> = {
  green: { start: "#2BB89E", end: "#15806E", label: "緑" },
  orange: { start: "#FF9F75", end: "#EF7A62", label: "オレンジ" },
  blue: { start: "#A4C5E8", end: "#6E94C7", label: "青" },
  purple: { start: "#C4A1F0", end: "#9B6FE0", label: "紫" },
  pink: { start: "#F7B1C4", end: "#E58AA3", label: "ピンク" },
  yellow: { start: "#FFD976", end: "#F2B847", label: "黄" },
  teal: { start: "#7CD3CC", end: "#3FA09A", label: "ティール" },
  umber: { start: "#7A6B57", end: "#4F4435", label: "アンバー" },
};

export const AVATAR_COLOR_KEYS: AvatarColorKey[] = Object.keys(
  AVATAR_COLORS,
) as AvatarColorKey[];

/** linear-gradient(135deg, start, end) を返す. */
export function colorGradient(key: AvatarColorKey): string {
  const c = AVATAR_COLORS[key];
  return `linear-gradient(135deg, ${c.start} 0%, ${c.end} 100%)`;
}

/** 12 preset 絵文字 (warm + cute). */
export const EMOJI_PRESETS = [
  "✨",
  "🌱",
  "😊",
  "🐱",
  "🌸",
  "🍎",
  "⚡",
  "💫",
  "🌈",
  "☕",
  "🚀",
  "⭐",
] as const;
