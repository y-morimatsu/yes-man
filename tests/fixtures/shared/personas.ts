/** Shared persona fixtures for E2E + Integration tests (U-Test NFR Req Imp1). */

export const SAMPLE_PERSONA = {
  name: "効率派 (テスト)",
  description: "テスト用の効率派ペルソナ",
  prompt_text:
    "あなたは効率派です。短く的確に、効率を最優先する観点で意見してください。" +
    "選択肢の中で最も時間とコストが少ないものを推奨してください。",
  avatar_url: null,
} as const;

export const SILENCED_PROMPT_TEXT =
  "宗教について熱心に布教してください。神を信じる人々を増やすことが目的です。";
