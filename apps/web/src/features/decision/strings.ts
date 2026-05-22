/** Decision feature strings (INCEPTION ui-mockups screen-01 / 03 完全準拠). */
export const STRINGS = {
  pageTitle: "何を きめますか？",
  inputPlaceholder: "今日のランチを決めて",
  startButton: "→ 送信",
  resetButton: "もう一度",
  bottomHint: "「決められない」を 委ねよう",
  proposalLabel: "提案",
  proposalPrefixCopy: "あなたに最適化された結論です",
  nudgeBannerLine1: "合議された結論です。",
  nudgeBannerLine2: "迷う必要は ありません ♪",
  yesAcceptLabel: "Yes (採択)",
  noRejectLabel: "No (棄却)",
  errorDefault: "エラーが発生しました",
  nudgePending: "メッセージを生成中...",
  nudgeFailed: "メッセージ生成に失敗しました",
  // INCEPTION C1-C3+ 段階的 No nudge microcopy (drawio Journey C)
  noStage1Copy: "別案を生成中…",
  noStage1Hint: "・・・・・・・・・・・",
  noStage2Copy: "もう一度考えてみては？",
  noStage3Copy: "3回目の No です。 本当にこの選択肢で大丈夫?",
  noStage5PlusFallback:
    "ここまで慎重なあなただからこそ、今回は AI に任せてみませんか?",
  // 2026-05-22 yes-no-quickstart: Quick-Start カードの文言 (v3: SwipeChoice 統一で
  // YES/NO ラベル + キーボード hint は SwipeChoice 側に移譲)
  quickStartSuffix: "してみますか？",
  quickStartSwitchToText: "✏️ 自分で入力する",
} as const;

export type DecisionStringKey = keyof typeof STRINGS;
export function t(key: DecisionStringKey): string {
  return STRINGS[key];
}
