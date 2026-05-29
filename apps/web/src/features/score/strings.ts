/** Score feature strings (INCEPTION ui-mockups screen-04 準拠 / Yes 比率モデル).
 *
 * 用語:
 * - 「委任度 スコア」 = Yes 比率 (Yes 採択 / 総決定)、高いほど AI に委任できている
 * - 大きな % 値 + 説明ラベル「委任度 (Yes 比率)」
 * - 文末 footnote 「スコアが たかいほど AI を信頼できています」
 */
export const STRINGS = {
  pageTitle: "YesMan スコア",
  metricLabel: "委任度 (Yes 比率)",
  warningNoStreak: "⚠ No 連発を検知しました。ご自身の判断軸を見直してみましょう。",
  warningLowYesRatio: "最近 Yes の比率が低めです。",
  labelNoCount: "No 回数",
  labelTotal: "総決定",
  labelRatio: "Yes 比率",
  footnote: "スコアが たかいほど AI を信頼できています",
  paradoxNote:
    "Yes/No の採択履歴から、あなたが AI にどれだけ委ねているかを可視化します。",
  empty: "まだ採択履歴がありません。",
} as const;

export type ScoreStringKey = keyof typeof STRINGS;
export function t(key: ScoreStringKey): string {
  return STRINGS[key];
}
