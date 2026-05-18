/**
 * scoreLevel — pure function、test 容易 (U7d NFR Design §8 + FD §5).
 *
 * Yes 比率モデル: ratio = Yes 比率 (高いほど委任度高)。
 * Story C3 整合: no_count >= 5 で danger、ratio < 0.5 で warning (Yes が少ない).
 */
export type ScoreLevel = "ok" | "warning" | "danger";

export function getScoreLevel(no_count: number, ratio: number | null): ScoreLevel {
  if (no_count >= 5) return "danger";
  if (ratio !== null && ratio < 0.5) return "warning";
  return "ok";
}
