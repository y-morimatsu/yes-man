/** Score feature strings (INCEPTION ui-mockups screen-04 完全準拠).
 *
 * INCEPTION 用語:
 * - 「主体性スコア」 → 「委任度 スコア」 (= No 比率、低いほど委任できている)
 * - 大きな % 値 + 説明ラベル「委任度 (No 比率)」
 * - 文末 footnote 「スコアが ひくいほど AI を信頼できています」
 */
export const STRINGS = {
  pageTitle: "委任度 スコア",
  metricLabel: "委任度 (No 比率)",
  warningNoStreak: "⚠ No 連発を検知しました。ご自身の判断軸を見直してみましょう。",
  warningHighNoRatio: "最近 No の比率が高めです。",
  labelNoCount: "No 回数",
  labelTotal: "総決定",
  labelRatio: "No 比率",
  footnote: "スコアが ひくいほど AI を信頼できています",
  paradoxNote:
    "【逆説的設計】 これは「主体性スコア」と呼ばれ、スコアが「低い」ほど AI が褒めてくる反転 UX です。",
  empty: "まだ採択履歴がありません。",
} as const;

export type ScoreStringKey = keyof typeof STRINGS;
export function t(key: ScoreStringKey): string {
  return STRINGS[key];
}
