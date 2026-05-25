/**
 * EarthHorizon — 漫画ステージ背景の地平線 (v3-γ anonymous-strangers Task 5).
 *
 * 派生元: docs/superpowers/idea/mockup-anonymous-strangers.html `.stage` 内
 *   `.earth-back` (green 半円) + `.earth-front` (blue 半円).
 *
 * 3 色 (緑 / オレンジ / 青) の半円を画面下部に重ねて「地平線」を表現.
 * CSS のみ、SVG / 画像 不要、prefers-reduced-motion でも static.
 */
import type { CSSProperties } from "react";

export interface EarthHorizonProps {
  /** 各半円の透明度を抑える (proposal カード上では薄く). default: 1.0 */
  intensity?: number;
  className?: string;
}

const COLORS = {
  green: "#21A48F",
  orange: "#EF7A62",
  blue: "#8AB2DF",
};

export function EarthHorizon({ intensity = 1.0, className }: EarthHorizonProps) {
  const baseGreen: CSSProperties = {
    position: "absolute",
    bottom: -160,
    left: -60,
    right: -60,
    height: 280,
    background: COLORS.green,
    opacity: 0.3 * intensity,
    borderRadius: "50%",
    pointerEvents: "none",
  };
  const orange: CSSProperties = {
    position: "absolute",
    bottom: -120,
    left: -80,
    right: "38%",
    height: 210,
    background: COLORS.orange,
    opacity: 0.34 * intensity,
    borderRadius: "50%",
    pointerEvents: "none",
  };
  const blue: CSSProperties = {
    position: "absolute",
    bottom: -150,
    left: "30%",
    right: -90,
    height: 200,
    background: COLORS.blue,
    opacity: 0.32 * intensity,
    borderRadius: "50% 65% 50% 55%",
    pointerEvents: "none",
  };
  return (
    <div
      aria-hidden
      data-testid="earth-horizon"
      className={className}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <div style={baseGreen} />
      <div style={orange} />
      <div style={blue} />
    </div>
  );
}
