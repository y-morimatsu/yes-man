/**
 * PersonaThinkingChips — SSE streaming 中に 3 人格の「考え中 / ✓」を可視化.
 * Pack A #3: 派手な瞬間 (SSE 合議) を増幅.
 *
 * utterances は persona_name で部分マッチ (「慎重」「楽観」「効率」) して
 * 固定 3 ロール (🛡️ 慎重派 / ☀️ 楽観派 / ⚡ 効率派) と突合.
 * - 発話済 → bg-brand-100 + ✓ {role.name}
 * - 未発話 → bg-neutral-100 + 考え中… (pulse animate, motion-reduce で停止)
 */
import type { Utterance } from "./reducer";

interface FixedRole {
  emoji: string;
  name: string;
  matchKey: string; // utterance.persona_name に含まれていれば spoken と判定
}

const FIXED_ROLES: FixedRole[] = [
  { emoji: "🛡️", name: "慎重派", matchKey: "慎重" },
  { emoji: "☀️", name: "楽観派", matchKey: "楽観" },
  { emoji: "⚡", name: "効率派", matchKey: "効率" },
];

export interface PersonaThinkingChipsProps {
  utterances: Utterance[];
}

export function PersonaThinkingChips({ utterances }: PersonaThinkingChipsProps) {
  const spokenNames = new Set(utterances.map((u) => u.persona_name));

  return (
    <div className="flex flex-wrap gap-2" role="region" aria-label="人格の発話状態">
      {FIXED_ROLES.map((role) => {
        const spoken = Array.from(spokenNames).some((name) =>
          name.includes(role.matchKey),
        );
        return (
          <span
            key={role.name}
            className={
              spoken
                ? "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-brand-100 text-brand-700 border border-brand-300"
                : "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-neutral-100 text-neutral-500 border border-neutral-300 animate-pulse motion-reduce:animate-none"
            }
          >
            <span aria-hidden>{role.emoji}</span>
            {spoken ? `✓ ${role.name}` : "考え中…"}
          </span>
        );
      })}
    </div>
  );
}
