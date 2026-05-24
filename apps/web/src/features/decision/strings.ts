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
  // issue #93: stage 1 は LLM 動的生成失敗時の fallback。生成完了後も自然な文言にする
  // (旧 "別案を生成中…" は proposal 表示済の状態と矛盾していたため変更)
  noStage1Copy: "もう一案 どうぞ",
  noStage1Hint: "・・・・・・・・・・・",
  noStage2Copy: "もう一度考えてみては？",
  noStage3Copy: "3回目の No です。 本当にこの選択肢で大丈夫?",
  noStage5PlusFallback:
    "ここまで慎重なあなただからこそ、今回は AI に任せてみませんか?",
  // 2026-05-22 yes-no-quickstart: Quick-Start カードの文言 (v3: SwipeChoice 統一で
  // YES/NO ラベル + キーボード hint は SwipeChoice 側に移譲)
  quickStartSuffix: "してみますか？",
  quickStartSwitchToText: "✏️ 自分で入力する",
  // 2026-05-24 mockup §5 整合: 合議進行中の専用 header.
  streamingTitle: "決め中",
  // {count} で「3 人 / 5 人」等を動的差し込み、suffix で「で 考え中」を追加.
  streamingSubtitlePrefix: "人で 考え中",
  // 2026-05-24: 合議完了後の subtitle. 「考え中」を残さず「まとまりました」に切替.
  completedTitle: "結論",
  completedSubtitlePrefix: "人の意見が まとまりました",
  topicLabel: "お題",
} as const;

export type DecisionStringKey = keyof typeof STRINGS;
export function t(key: DecisionStringKey): string {
  return STRINGS[key];
}
