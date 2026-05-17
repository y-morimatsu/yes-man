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
}: UtteranceBubbleProps) {
  const bg =
    variant === "highlighted"
      ? "bg-brand-100 dark:bg-brand-900"
      : "bg-neutral-100 dark:bg-neutral-700";
  const icon = personaIconFor(personaName);

  return (
    <div
      className={`p-3 rounded-2xl max-w-utterance ${bg}`}
      role="article"
      aria-label={`発話 by ${personaName}`}
    >
      <span className="text-xs font-medium text-brand-700 dark:text-brand-300">
        <span aria-hidden className="mr-1">{icon}</span>
        {personaName}
      </span>
      <p className="text-base mt-1 leading-relaxed">{text}</p>
    </div>
  );
}
