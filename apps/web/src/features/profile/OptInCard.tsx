/**
 * OptInCard — 「他の人の決め事に参加する」 toggle + preview + guard (v3-γ Task 7).
 *
 * 派生元:
 * - mockup-anonymous-strangers.html §11 `.toggle-card`
 * - US-2.1 / US-2.3 / US-2.4 / FR-9
 *
 * 仕様:
 * - usePoolStatus で opted_in / preview / guard を取得
 * - useMyCitations で today_count を取得 (US-2.2 「今日 N 件」)
 * - toggle ON: useOptInMutation → 422 (FR-9 guard 不足) は isInsufficientSignalsError
 *   で type-safe に判定して inline message
 * - toggle OFF: useOptOutMutation
 * - preview 常時表示 (US-2.3 AC-1: OFF でも「もし ON にすると以下が流通します」)
 * - guard.is_eligible=false の時 toggle disabled + 「嗜好把握が足りないので…」 (US-2.4 AC-1/2)
 */
import { useState } from "react";
import { Card } from "@yesman/ui";
import { isInsufficientSignalsError } from "@yesman/api-client";
import {
  useMyCitations,
  useOptInMutation,
  useOptOutMutation,
  usePoolStatus,
} from "../persona/usePersonaPool";

// mockup §11 palette
const MK_ORANGE = "#EF7A62";

const LANGUAGE_LABEL: Record<string, string> = {
  ja: "日本語",
  en: "英語",
  fr: "フランス語",
  ar: "アラビア語",
  zh: "中国語",
};

const FORMALITY_LABEL: Record<string, string> = {
  polite: "丁寧",
  casual: "フランク",
  blunt: "断定的",
};

export function OptInCard() {
  const status = usePoolStatus();
  const citations = useMyCitations();
  const optIn = useOptInMutation();
  const optOut = useOptOutMutation();
  const [inlineError, setInlineError] = useState<string | null>(null);

  const optedIn = status.data?.opted_in ?? false;
  const preview = status.data?.preview ?? null;
  const guard = status.data?.guard ?? {
    signal_total: 0,
    min_required: 3,
    is_eligible: false,
  };
  const todayCount = citations.data?.today_count ?? 0;

  // I-3 fix (Task 7 ultrathink): status.isFetching を含めて refetch 中も disable
  // (optIn 完了後 invalidation → refetch 中の連打で重複 mutation 防止).
  const isLoading =
    status.isPending ||
    status.isFetching ||
    optIn.isPending ||
    optOut.isPending;
  const toggleDisabled =
    isLoading ||
    // optIn は guard を満たさないと disabled
    (!optedIn && !guard.is_eligible);

  const handleToggle = async () => {
    setInlineError(null);
    try {
      if (optedIn) {
        await optOut.mutateAsync();
      } else {
        await optIn.mutateAsync();
      }
    } catch (err) {
      if (isInsufficientSignalsError(err)) {
        setInlineError(err.detail.hint);
      } else {
        setInlineError("切替に失敗しました。もう一度お試しください。");
      }
    }
  };

  return (
    <Card data-testid="opt-in-card">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {/* I-2 fix: aria-labelledby で switch button と紐付け */}
          <h2
            id="opt-in-card-title"
            className="font-serif font-semibold text-base"
          >
            🌐 他の人の 決め事に 参加する
          </h2>
          <p
            id="opt-in-card-desc"
            className="text-xs text-neutral-600 mt-1 leading-relaxed"
          >
            あなたの 価値観タグが、世界の だれかの 決め事に 使われます。
            <br />
            <span className="text-[10px] italic text-neutral-500">
              email / 表示名 は 絶対に 送信されません。
            </span>
          </p>
        </div>
        <ToggleSwitch
          on={optedIn}
          disabled={toggleDisabled}
          onClick={handleToggle}
          testId="opt-in-toggle"
          labelledById="opt-in-card-title"
          describedById="opt-in-card-desc"
        />
      </div>

      {/* US-2.4 AC-2: guard 不足時の inline message */}
      {!guard.is_eligible && !optedIn && (
        <p
          className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700"
          data-testid="opt-in-guard-message"
          role="status"
        >
          嗜好把握が足りないので公開できません ({guard.signal_total} / {guard.min_required} 件).
          何回か決定を試してみてください
        </p>
      )}

      {/* US-2.4 連動: backend が 422 で hint を返した時の inline error
          (sub-second の追加 feedback、guard-message と重複する可能性あるが
          後勝ちで現在の hint を見せる) */}
      {inlineError && (
        <p
          className="mt-2 text-xs text-error"
          data-testid="opt-in-inline-error"
          role="alert"
        >
          {inlineError}
        </p>
      )}

      {/* US-2.3 AC-1: 流通対象 preview を常時表示 (OFF でも「もし ON にすると以下が流通します」) */}
      {preview && (
        <div
          className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          data-testid="opt-in-preview"
        >
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
            {optedIn
              ? "📤 現在 流通中の あなたのデータ"
              : "👀 もし ON にすると 以下が 流通します"}
          </p>
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-[10px] text-neutral-500 mb-0.5">価値観タグ</p>
              <div className="flex flex-wrap gap-1">
                {preview.value_tags.length === 0 ? (
                  <span className="text-xs italic text-neutral-400">
                    (まだ ありません)
                  </span>
                ) : (
                  preview.value_tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 text-[10px]"
                      style={{
                        background: "rgba(239, 122, 98, 0.12)",
                        color: "#2E2418",
                      }}
                      data-testid="opt-in-preview-tag"
                    >
                      {tag}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="text-[10px] text-neutral-500 mt-1">
              話す言語: {LANGUAGE_LABEL[preview.primary_language] ?? preview.primary_language} ・
              話し方: {FORMALITY_LABEL[preview.formality] ?? preview.formality}
            </div>
          </div>
        </div>
      )}

      {/* US-2.2: 「今日 N 件の決め事に登場しました」 (opt-in 中のみ意味あり) */}
      {optedIn && (
        <p
          className="mt-3 text-xs italic"
          style={{ color: MK_ORANGE }}
          data-testid="opt-in-today-count"
        >
          今日 {todayCount} 件の 決め事に 登場しました
        </p>
      )}

      {/* 2026-05-24: 履歴専用画面廃止に伴い、Profile からの link も削除 */}
    </Card>
  );
}

/** Tailwind ベースの toggle switch (mockup `.toggle-switch` 風).
 *
 *  I-1 fix (Task 7 ultrathink): WCAG 2.5.5 / 2.5.8 — touch target 44×44px 以上.
 *  visual の switch は 24×44 のまま (mockup 視覚整合)、padding で hit area を 44×44 確保.
 *
 *  I-2 fix: aria-labelledby + aria-describedby で title / desc と紐付け
 *  (screen reader で「他の人の決め事に参加する、スイッチ、オフ」と読まれる).
 */
function ToggleSwitch({
  on,
  disabled,
  onClick,
  testId,
  labelledById,
  describedById,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
  labelledById?: string;
  describedById?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledById}
      aria-describedby={describedById}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      // 44×44 hit area + 中央の 24×44 visual switch (padding で hit 領域確保)
      className={[
        "inline-flex items-center justify-center shrink-0",
        "h-11 w-11 -m-1 p-1", // 外側 44×44 (clickable), -m で layout 占有は実 visual 分のみ
        "focus:outline-none focus:ring-2 focus:ring-brand-500 rounded-xl",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      <span
        aria-hidden
        data-testid={testId ? `${testId}-track` : undefined}
        className={[
          "relative inline-flex items-center",
          "h-6 w-11 rounded-full transition-colors",
          on ? "bg-orange-500" : "bg-neutral-300",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "inline-block h-4 w-4 rounded-full bg-white transition-transform",
            on ? "translate-x-6" : "translate-x-1",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
