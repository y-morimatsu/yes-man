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
import { personaBackgroundFor, personaIconFor } from "./DecisionUtteranceBubble";

/**
 * avatar_url の "yesman-avatar:<base64(JSON{mode,color,emoji})>" 形式を decode.
 * apps/web の PersonaCreateModal.encodeAvatarForUrl / backend demo_mode.encode_avatar と互換。
 * decode 失敗・非該当は null。
 */
const AVATAR_GRADIENTS: Record<string, string> = {
  green: "linear-gradient(135deg, #2BB89E, #15806E)",
  orange: "linear-gradient(135deg, #FF9F75, #EF7A62)",
  blue: "linear-gradient(135deg, #A4C5E8, #6E94C7)",
  purple: "linear-gradient(135deg, #C4A1F0, #9B6FE0)",
  pink: "linear-gradient(135deg, #F7B1C4, #E58AA3)",
  yellow: "linear-gradient(135deg, #FFD976, #F2B847)",
  teal: "linear-gradient(135deg, #7CD3CC, #3FA09A)",
  umber: "linear-gradient(135deg, #7A6B57, #4F4435)",
};

export interface DecodedAvatar {
  emoji: string | null;
  gradient: string;
}

export function decodeAvatarConfig(avatarUrl: string): DecodedAvatar | null {
  const PREFIX = "yesman-avatar:";
  if (!avatarUrl.startsWith(PREFIX)) return null;
  try {
    const json = decodeURIComponent(escape(atob(avatarUrl.slice(PREFIX.length))));
    const cfg = JSON.parse(json) as {
      mode?: string;
      color?: string | null;
      emoji?: string | null;
    };
    const gradient: string =
      (cfg.color ? AVATAR_GRADIENTS[cfg.color] : undefined) ??
      "linear-gradient(135deg, #2BB89E, #15806E)";
    return { emoji: cfg.emoji ?? null, gradient };
  } catch {
    return null;
  }
}

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
  const iconBg = personaBackgroundFor(persona.name);

  // avatar_url を decode: yesman-avatar: 形式 → emoji+色、URL → img、なければ icon
  const decoded = persona.avatar_url
    ? decodeAvatarConfig(persona.avatar_url)
    : null;
  const isImageUrl =
    !!persona.avatar_url && !persona.avatar_url.startsWith("yesman-avatar:");

  return (
    <Card className={className} onClick={onClick}>
      <div className="flex items-start gap-3">
        {decoded && decoded.emoji ? (
          <div
            className="h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0"
            style={{ background: decoded.gradient }}
            aria-hidden
          >
            {decoded.emoji}
          </div>
        ) : isImageUrl ? (
          <img
            src={persona.avatar_url ?? undefined}
            alt={persona.name}
            className="h-12 w-12 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className={`h-12 w-12 rounded-full ${iconBg} flex items-center justify-center text-2xl shrink-0`}
            aria-hidden
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-sans font-semibold text-persona truncate">
            <span aria-hidden className="mr-1">{decoded?.emoji ?? icon}</span>
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
