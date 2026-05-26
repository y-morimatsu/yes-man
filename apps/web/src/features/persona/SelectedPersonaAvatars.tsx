/**
 * SelectedPersonaAvatars — 2026-05-24 v4. unified selection の avatar 表示.
 *
 * builtin/my は icon (cream gradient + name 頭文字)、anonymous は BlobAvatar (color hash).
 * 0 件選択時は「人を選ぶ →」 placeholder.
 */
import { Link } from "react-router-dom";
import { BlobAvatar, personaIconFor } from "@yesman/ui";
import { useBuiltinPersonas, useMyPersonas } from "./usePersona";
import { useAnonymousList } from "./usePersonaPool";
import { useUnifiedSelection } from "./useUnifiedSelection";

const BLOB_COLORS = ["orange", "blue", "pink", "green"] as const;

function colorFor(id: string): "orange" | "blue" | "pink" | "green" {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BLOB_COLORS[h % BLOB_COLORS.length]!;
}

interface ResolvedAvatar {
  key: string;
  type: "icon" | "blob";
  // icon (builtin / my)
  initial?: string;
  iconBackground?: string;
  // blob (anonymous)
  blobColor?: "orange" | "blue" | "pink" | "green";
  label: string; // aria-label
}

const ICON_GRADIENTS = {
  builtin: "linear-gradient(135deg, #2BB89E 0%, #15806E 100%)",
  my: "linear-gradient(135deg, #C084FC 0%, #9333EA 100%)",
} as const;

/** 2026-05-24: builtin persona ごとの gradient (PersonaCard の bg-sky-100/amber-100/violet-100
 *  と同じ hue 系統で gradient 化、white text の readability を確保). */
const BUILTIN_GRADIENTS: Array<{ keyword: string; gradient: string }> = [
  { keyword: "慎重", gradient: "linear-gradient(135deg, #93C5FD 0%, #3B82F6 100%)" }, // sky
  { keyword: "楽観", gradient: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)" }, // amber
  { keyword: "効率", gradient: "linear-gradient(135deg, #C4B5FD 0%, #8B5CF6 100%)" }, // violet
];

function builtinGradient(name: string): string {
  for (const { keyword, gradient } of BUILTIN_GRADIENTS) {
    if (name.includes(keyword)) return gradient;
  }
  return ICON_GRADIENTS.builtin;
}

export interface SelectedPersonaAvatarsProps {
  /** size pixel (default 28). */
  size?: number;
  /** 0 件時の placeholder 表示先 (Link). default "/personas/selection". */
  emptyLinkTo?: string;
  /** placeholder text. default 「人を選ぶ →」. */
  emptyText?: string;
}

export function SelectedPersonaAvatars({
  size = 28,
  emptyLinkTo = "/personas/selection",
  emptyText = "人を選ぶ →",
}: SelectedPersonaAvatarsProps) {
  const { selection } = useUnifiedSelection();
  const { data: builtins } = useBuiltinPersonas();
  const { data: my } = useMyPersonas();
  const { data: anonymous } = useAnonymousList();

  const resolved: ResolvedAvatar[] = selection
    .map((s, idx) => {
      const key = `${s.source}-${s.id}-${idx}`;
      if (s.source === "anonymous") {
        const p = anonymous?.personas.find((x) => x.persona_id === s.id);
        if (!p) return null;
        return {
          key,
          type: "blob",
          blobColor: colorFor(p.persona_id),
          label: "知り合い",
        } as ResolvedAvatar;
      }
      const persona = (s.source === "builtin" ? builtins : my)?.find(
        (x) => x.id === s.id,
      );
      if (!persona) return null;
      // builtin は name に応じた gradient (PersonaCard 配色と統一)、my は purple gradient
      const bg =
        s.source === "builtin"
          ? builtinGradient(persona.name)
          : ICON_GRADIENTS.my;
      // 2026-05-24: PersonaCard と同じ「文字 = emoji icon」 を表示.
      //   builtin の慎重派/楽観派/効率派 は personaIconFor で 🛡️/☀️/⚡、他は 🎭.
      //   my (自作) は name 頭文字を使う (emoji がないため).
      const emoji = personaIconFor(persona.name);
      const initial =
        s.source === "builtin" && emoji !== "🎭"
          ? emoji
          : persona.name.charAt(0);
      return {
        key,
        type: "icon",
        initial,
        iconBackground: bg,
        label: persona.name,
      } as ResolvedAvatar;
    })
    .filter((r): r is ResolvedAvatar => r !== null);

  if (resolved.length === 0) {
    return (
      <Link
        to={emptyLinkTo}
        data-testid="home-avatar-empty-placeholder"
        className="text-xs italic hover:underline"
        style={{ color: "rgba(46, 36, 24, 0.55)" }}
      >
        {emptyText}
      </Link>
    );
  }

  return (
    <div
      className="flex items-center"
      data-testid="home-selected-avatars"
      role="group"
      aria-label="選択中の合議メンバー"
    >
      {resolved.map((r, idx) => (
        <span
          key={r.key}
          style={{ marginLeft: idx === 0 ? 0 : -6 }}
          data-testid={`home-selected-avatar-${idx}`}
        >
          {r.type === "blob" ? (
            <BlobAvatar
              size={size as 22 | 28 | 36 | 44 | 60 | 80}
              color={r.blobColor!}
              gaze="center"
              name={r.label}
            />
          ) : (
            <span
              role="img"
              aria-label={r.label}
              className="inline-flex items-center justify-center rounded-full text-white"
              style={{
                width: size,
                height: size,
                background: r.iconBackground!,
                border: "1.5px solid #FFFCF4",
                fontFamily: "'Crimson Pro', 'Noto Serif JP', serif",
                fontStyle: "italic",
                fontWeight: 600,
                // emoji は kanji より少し大きく見えるよう調整 (0.55 倍 vs 0.4)
                fontSize: r.initial && r.initial.length > 1 ? Math.round(size * 0.55) : Math.round(size * 0.4),
              }}
            >
              {r.initial}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
