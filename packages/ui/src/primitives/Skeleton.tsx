/**
 * Skeleton — loading state 用の灰色 pulse box.
 *
 * 用途: Spinner の代替として、コンテンツの形状を予兆させる skeleton card 表示。
 * prefers-reduced-motion: reduce 時は pulse animation を停止 (motion-reduce:animate-none)。
 */
import type { CSSProperties } from "react";

export interface SkeletonProps {
  /** Tailwind utility class (e.g., "h-12 w-48") */
  className?: string;
  /** width/height を直接指定する場合 */
  style?: CSSProperties;
}

export function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={
        "rounded-lg bg-neutral-200 animate-pulse motion-reduce:animate-none " +
        className
      }
      style={style}
      aria-hidden="true"
    />
  );
}
