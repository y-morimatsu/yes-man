/**
 * MangaBubble — 漫画的に重なる吹き出し (v3-γ anonymous-strangers Task 5).
 *
 * 派生元: docs/superpowers/idea/mockup-anonymous-strangers.html `.manga-bubble`.
 *
 * 仕様:
 * - size="large" (現在話している) → 大・full opacity・shadow・tail visible
 * - size="small" (既出) → 小・opacity 0.3・shadow なし (2026-05-24 Phase B: mockup §5 整合)
 * - tail position (left / right / center) で actor との接続を表現
 * - position は absolute、parent stage 内で bottom-px 固定 (mockup 直準拠)
 * - i18n: dir prop で rtl (Arabic) 対応、langClass (lang-ar / lang-zh) で font fallback
 *
 * fade-in animation: `ym-bubble-slide-in` (globals.css)、prefers-reduced-motion で disable.
 */
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

export type MangaBubbleSize = "large" | "small";
export type MangaBubbleTail = "left" | "right" | "center";
export type MangaBubbleLanguage = "ja" | "en" | "fr" | "ar" | "zh";

const COLORS = {
  cream: "#FAF6EC",
  creamLight: "#FFFCF4",
  pink: "#F9CED0",
  umber: "#2E2418",
  hairline: "rgba(46, 36, 24, 0.15)",
};

export interface MangaBubbleProps {
  /** どれくらい強調するか. large=話者、small=既出. */
  size: MangaBubbleSize;
  /** 吹き出し tail の位置 (actor との接続). */
  tail?: MangaBubbleTail;
  /** absolute position の bottom (px). mockup の固定値 184/152/170 を直接渡す. */
  bottom?: number;
  /** absolute position の left or right (px or "50%" 等の CSS string). tail に応じて caller が選ぶ. */
  left?: number | string;
  right?: number | string;
  /** caller 側追加 transform (例: translateX(-50%) で水平中央寄せ). 内部 animation transform と merge. */
  transform?: string;
  /** 背景色を pink (anonymous persona) or cream (self) で切り替え. */
  variant?: "pink" | "cream";
  /** persona テーマカラー override (variant を上書き). 例: 慎重派 → sky, 楽観派 → amber. */
  bgColorOverride?: string;
  /** primary_language. lang-ar / lang-zh class を付与して font-family を切替. */
  language?: MangaBubbleLanguage;
  /** Arabic 時は内側 dir=rtl. */
  rtl?: boolean;
  /** persona 識別 (data-testid suffix). */
  testId?: string;
  /** click handler (例: past bubble を前面化). 設定時は cursor:pointer + role=button. */
  onClick?: () => void;
  /** click 時の aria-label (onClick 設定時のみ). */
  clickLabel?: string;
  children: ReactNode;
}

const SIZE_STYLE: Record<MangaBubbleSize, CSSProperties> = {
  large: {
    zIndex: 10,
    opacity: 1,
    boxShadow: "0 10px 26px rgba(46,36,24,0.18)",
  },
  small: {
    zIndex: 1,
    opacity: 0.3,
    boxShadow: "none",
    // mockup §5: 既出 bubble は font も少し小さくして「過去発言」感を強化
    // 2026-05-27 typography-redesign: 12→14px (foreground と相対的に小さい比率は維持)
    fontSize: 14,
    // 過去 bubble は scale down で更に奥にある印象 (mockup §5 で T → 青 へ移った際の orange/T 残像が小さく見える)
    transform: "scale(0.9)",
    transformOrigin: "center bottom",
  },
};

const TAIL_BASE: CSSProperties = {
  position: "absolute",
  bottom: -10,
  width: 0,
  height: 0,
  borderLeft: "9px solid transparent",
  borderRight: "9px solid transparent",
};

function tailStyle(tail: MangaBubbleTail, color: string): CSSProperties {
  const base: CSSProperties = { ...TAIL_BASE, borderTop: `10px solid ${color}` };
  if (tail === "left") return { ...base, left: 42 };
  if (tail === "right") return { ...base, right: 42 };
  return { ...base, left: "50%", transform: "translateX(-50%)" };
}

export function MangaBubble({
  size,
  tail = "center",
  bottom,
  left,
  right,
  transform,
  variant = "pink",
  bgColorOverride,
  language,
  rtl = false,
  testId,
  onClick,
  clickLabel,
  children,
}: MangaBubbleProps) {
  const variantBg = variant === "pink" ? COLORS.pink : COLORS.creamLight;
  const bg = bgColorOverride ?? variantBg;
  const border =
    variant === "cream" || bgColorOverride
      ? `0.5px solid ${COLORS.hairline}`
      : "none";

  // SIZE_STYLE[size].transform は past bubble の scale(0.9). caller 指定の transform
  // (例: translateX(-50%)) と merge して両方を適用する.
  const baseTransform = SIZE_STYLE[size].transform;
  const mergedTransform = [transform, baseTransform].filter(Boolean).join(" ");
  const bubbleStyle: CSSProperties = {
    position: "absolute",
    width: 184,
    padding: "13px 16px",
    fontSize: 15,
    lineHeight: 1.55,
    color: COLORS.umber,
    background: bg,
    border,
    borderRadius: 18,
    fontFamily: "var(--font-sans)",
    ...SIZE_STYLE[size],
    ...(mergedTransform ? { transform: mergedTransform } : {}),
    ...(bottom !== undefined ? { bottom } : {}),
    ...(left !== undefined ? { left } : {}),
    ...(right !== undefined ? { right } : {}),
  };

  // language 別 font fallback class (globals.css の .lang-ar / .lang-zh).
  const langClass =
    language === "ar"
      ? "lang-ar"
      : language === "zh"
        ? "lang-zh"
        : undefined;

  return (
    <div
      data-testid={testId ?? "manga-bubble"}
      data-bubble-size={size}
      data-ym-anim
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": clickLabel ?? "発言を前面化",
            onClick,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      style={{
        ...bubbleStyle,
        animation: size === "large" ? "ym-manga-bubble-pop 0.32s ease-out" : undefined,
        ...(onClick ? { cursor: "pointer" } : {}),
      }}
    >
      <div
        className={langClass}
        {...(rtl ? { dir: "rtl" } : {})}
        data-testid={testId ? `${testId}-content` : "manga-bubble-content"}
      >
        {children}
      </div>
      <span aria-hidden style={tailStyle(tail, bg)} />
    </div>
  );
}
