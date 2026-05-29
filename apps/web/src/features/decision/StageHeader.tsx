/**
 * StageHeader — 合議進行中の専用 header (v3-γ 2026-05-24 mockup §5 整合).
 *
 * 構成 (2026-05-24 update):
 *   - 左上: 戻る arrow (history.back)
 *   - title 行: 「決め中」 + topic (italic 引用符付き) を inline 表示
 *   - subtitle: 「● N 人で 考え中」 (orange dot + 動的人数)
 *   - 旧 お題 box は廃止 (高さ削減のため title 行に統合)
 *
 * builtin / anonymous 両経路で同 layout を採用 (DecisionPage から呼び出し).
 */
import { t } from "./strings";

const MK_UMBER = "#2E2418";
const MK_ORANGE = "#EF7A62";

export interface StageHeaderProps {
  /** 「3 人で 考え中」 の N. 通常 utterances.length と一致. */
  participantCount: number;
  /** お題 (user_input). 空文字は inline 表示なし. */
  topic: string;
  /** 戻る button の onClick. 省略時は window.history.back. */
  onBack?: () => void;
  /** 合議 status. "streaming" → 考え中、"completed" → まとまりました. */
  status?: "streaming" | "completed";
}

export function StageHeader({
  participantCount,
  topic,
  onBack,
  status = "streaming",
}: StageHeaderProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (typeof window !== "undefined") {
      window.history.back();
    }
  };

  return (
    <div
      data-testid="stage-header"
      className="flex flex-col gap-1"
    >
      {/* Header row: back arrow + title + topic inline + subtitle */}
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={handleBack}
          aria-label="戻る"
          data-testid="stage-header-back"
          className="text-lg leading-none p-1 -ml-1 -mt-0.5 hover:opacity-70 shrink-0"
          style={{ color: MK_UMBER }}
        >
          ‹
        </button>
        <div className="flex flex-col flex-1 min-w-0">
          {/* title 行: 「決め中」 + topic を inline (mobile 縦の高さ削減) */}
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <h1
              data-testid="stage-header-title"
              className="text-xl font-bold leading-tight shrink-0"
              style={{ color: MK_UMBER }}
            >
              {status === "completed" ? t("completedTitle") : t("streamingTitle")}
            </h1>
            {topic.trim().length > 0 && (
              <span
                data-testid="stage-header-topic-text"
                className="text-sm leading-tight truncate min-w-0"
                style={{
                  fontFamily: "var(--font-sans)",
                  color: "rgba(46, 36, 24, 0.7)",
                }}
              >
                &ldquo;{topic}&rdquo;
              </span>
            )}
          </div>
          <p
            data-testid="stage-header-subtitle"
            data-status={status}
            className="mt-1 text-xs flex items-center gap-1.5"
            style={{ color: MK_ORANGE }}
          >
            <span
              aria-hidden
              className="inline-block rounded-full"
              style={{ width: 6, height: 6, background: MK_ORANGE }}
            />
            <span>
              {participantCount}{" "}
              {status === "completed"
                ? t("completedSubtitlePrefix")
                : t("streamingSubtitlePrefix")}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
