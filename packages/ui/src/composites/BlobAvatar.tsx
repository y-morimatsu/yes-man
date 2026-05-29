/**
 * BlobAvatar — 匿名 persona 用 blob アバター (v3-γ anonymous-strangers Task 5).
 *
 * 派生元: docs/superpowers/idea/mockup-anonymous-strangers.html `.blob` 仕様.
 *
 * 仕様:
 * - 円形 blob (4 colors: green / orange / blue / pink) — anonymous persona の signature
 * - 2 eyes pseudo-element 風に inline span × 2 で表現 (CSS pseudo は内部使用)
 * - gaze direction で 視線を 5 方向に振る (upright / downleft / upleft / downright / up)
 * - size variant: s-22 / s-28 / s-36 / s-44 / s-60 / s-80 (mockup の class 直対応)
 *
 * Tailwind の制約上、`::after` の `box-shadow` で双眼を作る pure CSS は inline style に
 * 移植が難しいため、`<span aria-hidden>` 2 個で eyes を実装 (semantically equivalent).
 */
import type { CSSProperties } from "react";

export type BlobSize = 22 | 28 | 36 | 44 | 60 | 80;
export type BlobColor = "green" | "orange" | "blue" | "pink";
export type BlobGaze =
  | "upright"
  | "downleft"
  | "upleft"
  | "downright"
  | "up"
  | "center";

const COLOR_HEX: Record<BlobColor, string> = {
  green: "#21A48F",
  orange: "#EF7A62",
  blue: "#8AB2DF",
  pink: "#F9CED0",
};

const EYE_COLOR = "#2E2418"; // mockup `--umber`

const GAZE_OFFSET: Record<BlobGaze, [number, number]> = {
  upright: [2, -2],
  downleft: [-2, 2],
  upleft: [-2, -2],
  downright: [2, 2],
  up: [0, -2],
  center: [0, 0],
};

// mockup の eye geometry: ratio of size (top, left, eye-diameter, eye-gap).
// 例) s-44: top=18 / left=14 / d=4 / gap=12 → top/size=0.41, left/size=0.32, d/size=0.091, gap/size=0.27
function eyeGeometry(size: BlobSize) {
  const topRatio = 0.41;
  const leftRatio = 0.32;
  const diameterRatio = 0.091;
  const gapRatio = 0.27;
  return {
    top: Math.round(size * topRatio),
    left: Math.round(size * leftRatio),
    diameter: Math.max(2, Math.round(size * diameterRatio)),
    gap: Math.round(size * gapRatio),
  };
}

export interface BlobAvatarProps {
  size?: BlobSize;
  color?: BlobColor;
  gaze?: BlobGaze;
  /** opacity (dim 用、mockup の .dim と同等 = 0.32) */
  dim?: boolean;
  /** persona の display name (aria-label 用) */
  name?: string;
  className?: string;
}

/**
 * 匿名 blob アバター.
 *
 * @example
 * <BlobAvatar size={44} color="orange" gaze="upright" name="世界の誰か #1" />
 */
export function BlobAvatar({
  size = 44,
  color = "orange",
  gaze = "center",
  dim = false,
  name = "anonymous persona",
  className,
}: BlobAvatarProps) {
  const { top, left, diameter, gap } = eyeGeometry(size);
  const [gazeX, gazeY] = GAZE_OFFSET[gaze];

  const blobStyle: CSSProperties = {
    width: size,
    height: size,
    background: COLOR_HEX[color],
    borderRadius: "50%",
    opacity: dim ? 0.32 : 1,
    position: "relative",
    display: "inline-block",
    flexShrink: 0,
  };

  const eyeStyle: CSSProperties = {
    position: "absolute",
    top,
    width: diameter,
    height: diameter,
    background: EYE_COLOR,
    borderRadius: "50%",
    transform: `translate(${gazeX}px, ${gazeY}px)`,
  };

  return (
    <span
      role="img"
      aria-label={name}
      data-testid="blob-avatar"
      data-blob-color={color}
      data-blob-size={size}
      data-blob-gaze={gaze}
      className={className}
      style={blobStyle}
    >
      <span aria-hidden style={{ ...eyeStyle, left }} />
      <span aria-hidden style={{ ...eyeStyle, left: left + gap }} />
    </span>
  );
}
