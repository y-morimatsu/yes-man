/** Preference feature strings (ultrathink U7d NFR Req Imp3). */
export const STRINGS = {
  pageTitle: "嗜好プロファイル",
  resetButton: "リセット",
  resetConfirm: "嗜好プロファイルをリセットします。よろしいですか？",
  resetSuccess: "リセットしました",
  empty: "まだ嗜好データがありません",
  labelAccepted: "採択された傾向",
  labelRejected: "棄却された傾向",
  labelPersonaStyle: "ペルソナ嗜好",
  labelInferredTags: "推定タグ",
} as const;

export type PreferenceStringKey = keyof typeof STRINGS;
export function t(key: PreferenceStringKey): string {
  return STRINGS[key];
}
