/**
 * Avatar — 2026-05-24: 統一 avatar display component.
 *
 * AvatarConfig (mode + color + emoji) + fallback letter から avatar を描画.
 * - mode==="image" の image_url は Phase 2、未実装時は default 扱い
 * - mode==="emoji" + emoji あり: 背景 = color or default green、絵文字を中央
 * - mode==="color": background = color gradient、頭文字を中央
 * - mode==="default" or null: green gradient + fallback letter
 */
import type { CSSProperties } from "react";
import {
  AVATAR_COLORS,
  type AvatarColorKey,
  colorGradient,
} from "./avatarColors";

export type AvatarMode = "default" | "color" | "emoji" | "image";

export interface AvatarConfig {
  mode: AvatarMode;
  color?: AvatarColorKey | null;
  emoji?: string | null;
  image_url?: string | null;
}

export interface AvatarProps {
  /** px (default 44). */
  size?: number;
  /** customization config (null/undefined なら default). */
  config?: AvatarConfig | null;
  /** display_name から派生した頭文字 (default mode 時に使用). */
  fallbackLetter: string;
  /** border (cream stroke). 小サイズ overlap 表示用. */
  ring?: boolean;
  className?: string;
  style?: CSSProperties;
  /** a11y. */
  ariaLabel?: string;
}

const DEFAULT_COLOR: AvatarColorKey = "green";

export function Avatar({
  size = 44,
  config,
  fallbackLetter,
  ring = false,
  className,
  style,
  ariaLabel,
}: AvatarProps) {
  const mode: AvatarMode = config?.mode ?? "default";
  const colorKey: AvatarColorKey =
    (config?.color as AvatarColorKey | undefined) ?? DEFAULT_COLOR;
  const background = colorGradient(colorKey);

  // image mode (Phase 2): image_url があれば <img>、なければ default
  if (mode === "image" && config?.image_url) {
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? "あなたのアバター"}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          ...(ring ? { border: "1.5px solid #FFFCF4" } : {}),
          ...style,
        }}
      >
        <img
          src={config.image_url}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </span>
    );
  }

  // emoji mode: 背景 color + 絵文字 1 字 (絵文字なしなら default fallback)
  if (mode === "emoji" && config?.emoji) {
    const fontSize = Math.round(size * 0.55);
    return (
      <span
        role="img"
        aria-label={ariaLabel ?? `あなたのアバター ${config.emoji}`}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          background,
          fontSize,
          lineHeight: 1,
          ...(ring ? { border: "1.5px solid #FFFCF4" } : {}),
          ...style,
        }}
      >
        {config.emoji}
      </span>
    );
  }

  // default / color mode: gradient + 頭文字
  const initial = fallbackLetter.trim().charAt(0).toUpperCase() || "Y";
  const fontSize = Math.round(size * 0.4);
  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `あなたのアバター ${initial}`}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background,
        color: "#FFFCF4",
        fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
        fontStyle: "italic",
        fontWeight: 600,
        fontSize,
        ...(ring ? { border: "1.5px solid #FFFCF4" } : {}),
        ...style,
      }}
    >
      {initial}
    </span>
  );
}

/** color picker / preview 用の background style 取得 (Editor で再利用). */
export function avatarBackground(color: AvatarColorKey | null | undefined): string {
  if (!color || !(color in AVATAR_COLORS)) return colorGradient(DEFAULT_COLOR);
  return colorGradient(color);
}
