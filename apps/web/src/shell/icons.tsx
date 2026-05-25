/**
 * icons.tsx — 2026-05-24: shared SVG icons (BottomNav + HomePage + 他).
 *
 * すべて `currentColor` で着色、24×24 viewBox。size prop で size 変更可能。
 * 雰囲気: mockup §4-§11 整合 (warm/organic/blob-style、stroke 1.6-1.7).
 */
import type { CSSProperties } from "react";

interface IconProps {
  /** px (default 22). */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function HomeIcon({ size = 22, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={style}
    >
      <path d="M3.5 11.3 L12 4.2 L20.5 11.3 V19.5 a1 1 0 0 1-1 1H4.5 a1 1 0 0 1-1-1 Z" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ScoreIcon({ size = 22, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={style}
    >
      <circle cx="12" cy="12" r="8.5" />
      <path
        d="M12 3.5 A8.5 8.5 0 0 1 19.5 16 L12 12 Z"
        fill="currentColor"
        stroke="none"
        opacity="0.85"
      />
    </svg>
  );
}

export function PersonaIcon({ size = 22, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
      className={className}
      style={style}
    >
      <circle cx="6.5" cy="13.5" r="4" fill="currentColor" opacity="0.18" />
      <circle cx="6.5" cy="13.5" r="4" />
      <circle cx="17.5" cy="13.5" r="4" fill="currentColor" opacity="0.18" />
      <circle cx="17.5" cy="13.5" r="4" />
      <circle cx="12" cy="9" r="4.5" fill="currentColor" opacity="0.18" />
      <circle cx="12" cy="9" r="4.5" />
    </svg>
  );
}

export function ProfileIcon({ size = 22, className, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={style}
    >
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5 C 4.5 16 8 13.5 12 13.5 S 19.5 16 19.5 20.5" />
    </svg>
  );
}
