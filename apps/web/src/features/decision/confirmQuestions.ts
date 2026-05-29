/**
 * confirmQuestions.ts — final 決定後の「いきなり外部サービスに飛ばない」確認 step テンプレ.
 *
 * 2026-05-26: 「これで決まり!」 final proposal 直後に SwipeChoice の Yes 一発で
 * popup を開くのは乱暴 (例: 服 = 既に持っているかも, 本 = 既に読んだかも).
 * Yes 採択後に category 別の追加 Yes/No 1〜2 問を挟んで、最終 Yes で window.open.
 *
 * Flow:
 *   final proposal → Yes → confirm-step-1 → … → action: open | stop
 *
 * 「stop」 で終わったら「今回は やめておこう」 banner、 「open」 で外部サービスを popup.
 * 合議は走らせない (純粋 frontend ローカル).
 */

/** confirm step の Yes/No 分岐の遷移先. */
export type ConfirmAction =
  | { kind: "next"; stepId: string }
  /** 外部サービスを window.open する (chosen=yes も同時にセット). */
  | { kind: "open" }
  /** popup は開かず、「今回は やめておこう」 で chain を closing する (chosen=yes は据置). */
  | { kind: "stop" };

export interface ConfirmStep {
  /** SwipeChoice の proposal text として表示. 末尾「?」付きの自然な日本語. */
  question: string;
  onYes: ConfirmAction;
  onNo: ConfirmAction;
}

export interface ConfirmFlow {
  /** entry point step id. */
  start: string;
  steps: Record<string, ConfirmStep>;
}

/**
 * category 別の確認フロー.
 *
 * 設計指針:
 *  - 物品系 (fashion / books / audio_books / shopping): 「持っているか?」 → 「買うか?」
 *  - サブスク常駐系 (movie / music): 確認 1 段のみ (「観ますか? / 聴きますか?」)
 *  - 食事系 (food_delivery / food_restaurant): 「今 注文しますか?」
 *  - 体験系 (travel / games / exercise / study): 「今 始めますか?」
 *
 * 該当 category に entry が無ければ confirm step なしで window.open に直行 (旧挙動互換).
 */
export const CONFIRM_FLOWS: Record<string, ConfirmFlow> = {
  // 2026-05-26 (UX 反転): Yes を選びたくさせる方向に統一. 「もう持っていますか?」 で
  // Yes=stop だと、迷ったユーザーが No を選びがち。「持っていないなら 買いますか?」 に
  // すると Yes 選択で外部サービスに行ける.
  fashion: {
    start: "buy",
    steps: {
      buy: {
        question: "持っていないなら 買いますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  books: {
    start: "buy",
    steps: {
      buy: {
        question: "まだ読んでいないなら 買いますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  audio_books: {
    start: "buy",
    steps: {
      buy: {
        question: "まだ聴いていないなら Audible で 聴きますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  shopping: {
    start: "buy",
    steps: {
      buy: {
        question: "今 購入しますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  movie: {
    start: "watch",
    steps: {
      watch: {
        question: "今 観ますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  music: {
    start: "listen",
    steps: {
      listen: {
        question: "今 聴きますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  food_delivery: {
    start: "order",
    steps: {
      order: {
        question: "今 注文しますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  food_restaurant: {
    start: "go",
    steps: {
      go: {
        question: "予約 / 行きますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  travel: {
    start: "book",
    steps: {
      book: {
        question: "予約 しますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  games: {
    start: "play",
    steps: {
      play: {
        question: "今 始めますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  exercise: {
    start: "start",
    steps: {
      start: {
        question: "今 始めますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
  study: {
    start: "start",
    steps: {
      start: {
        question: "今 始めますか?",
        onYes: { kind: "open" },
        onNo: { kind: "stop" },
      },
    },
  },
};

/**
 * category に対応する確認フローを返す. 未定義なら null (= 旧挙動: Yes で即 open).
 */
export function getConfirmFlow(category: string | undefined | null): ConfirmFlow | null {
  if (!category) return null;
  return CONFIRM_FLOWS[category] ?? null;
}
