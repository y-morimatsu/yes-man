/**
 * DecisionUtteranceBubble — composite (FD §4.2 + INCEPTION B7 drawio).
 *
 * 合議の発話バブル、persona name + text を表示.
 * INCEPTION drawio B7 仕様: persona に対応する emoji icon を表示
 *   - 慎重派 → 🛡️、楽観派 → ☀️、効率派 → ⚡、その他 → 🎭
 * highlighted variant は最終提案などで使用.
 */

export type UtteranceBubbleVariant = "default" | "highlighted";

export interface UtteranceBubbleProps {
  personaName: string;
  text: string;
  variant?: UtteranceBubbleVariant;
  /** Post-CONSTRUCTION v3 (2026-05-23): token streaming 中フラグ. true で「発言中…」を header に併記. */
  streaming?: boolean;
}

/** INCEPTION drawio B7 / G2 仕様の persona icon マッピング. */
export function personaIconFor(name: string): string {
  if (name.includes("慎重")) return "🛡️";
  if (name.includes("楽観")) return "☀️";
  if (name.includes("効率")) return "⚡";
  return "🎭";
}

export function DecisionUtteranceBubble({
  personaName,
  text,
  variant = "default",
  streaming = false,
}: UtteranceBubbleProps) {
  const bg =
    variant === "highlighted"
      ? "bg-brand-100 dark:bg-brand-900"
      : "bg-neutral-100 dark:bg-neutral-700";
  const icon = personaIconFor(personaName);

  return (
    <div
      className={`p-3 rounded-2xl max-w-utterance ${bg} min-h-16`}
      role="article"
      aria-label={`発話 by ${personaName}${streaming ? " (発言中)" : ""}`}
      data-ym-anim
      style={{ animation: "ym-bubble-slide-in 240ms ease-out both" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
          <span aria-hidden className="mr-1">{icon}</span>
          {personaName}
        </span>
        {streaming && (
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse motion-reduce:animate-none"
            aria-hidden
          >
            発言中…
          </span>
        )}
      </div>
      <p className="text-base mt-1 leading-relaxed">
        {text}
        {streaming && (
          <span
            className="inline-flex items-baseline gap-0.5 ml-1 align-baseline"
            aria-hidden
            data-ym-anim
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
              style={{ animation: "ym-typing-dot 1.2s infinite", animationDelay: "0s" }}
            />
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
              style={{ animation: "ym-typing-dot 1.2s infinite", animationDelay: "0.18s" }}
            />
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"
              style={{ animation: "ym-typing-dot 1.2s infinite", animationDelay: "0.36s" }}
            />
          </span>
        )}
      </p>
    </div>
  );
}
