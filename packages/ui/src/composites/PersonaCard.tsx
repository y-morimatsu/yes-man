/**
 * PersonaCard — composite (FD §4.1 + INCEPTION G2 drawio).
 *
 * 共有プール / 自分の persona 表示。selected 状態で ring 装飾.
 * U7c api-client の Persona 型 (type-only) を参照.
 *
 * INCEPTION drawio G2 仕様:
 *   - persona 名から icon を導出 (🛡️ 慎重派 / ☀️ 楽観派 / ⚡ 効率派 / 🎭 default)
 *   - is_builtin → 「(組み込み)」 ラベル
 *   - is_shared → 🔓 / not shared → 🔒 共有 ON/OFF アイコン
 */
import { Card } from "../primitives/Card";
import { personaIconFor } from "./DecisionUtteranceBubble";

export interface PersonaCardData {
  id: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  usage_count?: number;
  yes_acceptance_rate?: number;
  creator_anonymous_id?: string;
  is_blocked?: boolean;
  is_builtin?: boolean;
  is_shared?: boolean;
}

export interface PersonaCardProps {
  persona: PersonaCardData;
  selected?: boolean;
  onClick?: () => void;
  variant?: "compact" | "full";
}

export function PersonaCard({
  persona,
  selected,
  onClick,
  variant = "full",
}: PersonaCardProps) {
  const className = [
    selected ? "ring-2 ring-brand-600" : "",
    persona.is_blocked ? "opacity-50" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const icon = personaIconFor(persona.name);

  return (
    <Card className={className} onClick={onClick}>
      <div className="flex items-start gap-3">
        {persona.avatar_url ? (
          <img
            src={persona.avatar_url}
            alt={persona.name}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <div
            className="h-12 w-12 rounded-full bg-brand-100 flex items-center justify-center text-2xl"
            aria-hidden
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-semibold text-persona truncate">
            <span aria-hidden className="mr-1">{icon}</span>
            {persona.name}
            {persona.is_builtin && (
              <span className="ml-1 text-xs text-neutral-500 font-normal">
                (組み込み)
              </span>
            )}
            {persona.is_shared !== undefined && (
              <span
                className="ml-2 text-xs text-neutral-500 font-normal"
                aria-label={persona.is_shared ? "共有 ON" : "共有 OFF"}
              >
                {persona.is_shared ? "🔓 共有 ON" : "🔒 共有 OFF"}
              </span>
            )}
          </h3>
          {variant === "full" && (
            <>
              {persona.description && (
                <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">
                  {persona.description}
                </p>
              )}
              {persona.creator_anonymous_id && (
                <span className="block text-xs text-neutral-500 mt-1">
                  by {persona.creator_anonymous_id}
                </span>
              )}
              {persona.usage_count !== undefined && (
                <span className="block text-xs text-neutral-500 mt-1">
                  ⭐ {persona.yes_acceptance_rate !== undefined
                    ? `${Math.round(persona.yes_acceptance_rate * 100)}%`
                    : "-"}{" "}
                  / 利用 {persona.usage_count} 回
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
