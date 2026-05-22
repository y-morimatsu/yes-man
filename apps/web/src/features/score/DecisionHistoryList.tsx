/**
 * DecisionHistoryList — ScorePage 下部に最近の Yes 採択を 20 件表示.
 * spec 2026-05-22-score-decision-history-design.md §6 準拠.
 *
 * - No (棄却) は表示しない (Score 計算には引き続き利用)
 * - 各 item: ✓ + 質問 + → 提案 + 🕒 相対時刻 ・ 採用回数 (🌟 1 / 🔄 N)
 * - 空状態: ダッシュ枠 + 📭 + 文言
 * - エラー時: silent fail (null 返す、ScorePage は崩さない)
 */
import { useDecisionHistory } from "./useDecisionHistory";
import { formatRelativeTime } from "./formatRelativeTime";
import { truncate } from "./truncate";

const DEFAULT_LIMIT = 20;

function renderAdoptionCount(attemptCount: number): string {
  if (attemptCount <= 1) return `🌟 1 回目で採用`;
  return `🔄 ${attemptCount} 回目で採用`;
}

export function DecisionHistoryList(): JSX.Element | null {
  const { data, isPending, isError } = useDecisionHistory({ limit: DEFAULT_LIMIT });
  const limit = data?.limit ?? DEFAULT_LIMIT;

  if (isPending) {
    // skeleton 3 件
    return (
      <section className="mt-6">
        <h2 className="font-serif font-semibold text-base text-brand-700 px-3 mb-2">
          📜 最近の Yes 採択
          <span className="text-xs text-neutral-500 font-normal ml-2">
            (最大 {limit} 件)
          </span>
        </h2>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 bg-white p-3 mb-2 h-20 animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
        ))}
      </section>
    );
  }

  if (isError || !data) {
    return null; // silent fail
  }

  return (
    <section className="mt-6" aria-label="最近の Yes 採択履歴">
      <h2 className="font-serif font-semibold text-base text-brand-700 px-3 mb-2">
        📜 最近の Yes 採択
        <span className="text-xs text-neutral-500 font-normal ml-2">
          (最大 {data.limit} 件)
        </span>
      </h2>
      {data.items.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center">
          <div className="text-2xl mb-2" aria-hidden="true">📭</div>
          <p className="text-sm italic text-neutral-500">
            まだ Yes 採択の履歴がありません
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <article className="rounded-xl border border-neutral-200 bg-white p-3 flex gap-2">
                <span
                  className="text-success font-bold text-base flex-shrink-0"
                  aria-hidden="true"
                >
                  ✓
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-serif italic text-sm text-neutral-800 truncate">
                    「{truncate(item.user_input, 60)}」
                  </p>
                  <p className="text-sm text-neutral-700 truncate">
                    → {truncate(item.proposal_text, 60)}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    🕒 {formatRelativeTime(item.created_at)}
                    <span className="mx-1">・</span>
                    {renderAdoptionCount(item.attempt_count)}
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
