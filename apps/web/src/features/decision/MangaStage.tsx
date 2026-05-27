/**
 * MangaStage — 漫画ステージ renderer (v3-γ anonymous-strangers Task 5).
 *
 * 仕様 (mockup-anonymous-strangers.html §5):
 * - 3 actor を底辺に配置: 左=世界の誰か#1 (orange blob)、中央=あなた (green T)、右=世界の誰か#2 (blue blob)
 * - actor margin-bottom: 左 32 / 中央 0 / 右 18 で stereoscopic depth
 * - 「現在話している」persona の bubble は large + opaque、既出は small + faded
 * - 発話前 persona は typing dots (●●●) を actor 直上に表示
 *
 * 2026-05-24 v10 (ultrathink): mobile (iPhone SE 667 / 12 Pro 844) で要素重なりを完全に解消するため、
 * 絶対配置の単一層から flex column 内部 layout に再構築:
 *   1. Overlay slot (上、flex-shrink:0) — proposal/SwipeChoice の caller-render
 *   2. Spacer (flex:1) — 残り垂直空間を吸収 (small viewport では 0、large では大きく)
 *   3. Bubble-Actor Cluster (下、固定 220px、position:relative) — bubble + actor を内部絶対配置
 *
 * これにより overlay と cluster は flex flow で物理的に分離、絶対 overlap しない.
 * EarthHorizon は stage 全体に absolute で配置 (cluster の背景として visible).
 */
import { useState } from "react";
import { BlobAvatar, EarthHorizon, MangaBubble } from "@yesman/ui";
import type { Utterance } from "./reducer";

// === Persona theme (PersonaCard / SelectedPersonaAvatars と統一) ===
// 慎重 = sky、楽観 = amber、効率 = violet、anonymous (placeholder 含む) = blob.
interface PersonaTheme {
  /** builtin: emoji icon + gradient bg。anonymous: null → BlobAvatar fallback. */
  builtin: null | {
    emoji: string;
    iconGradient: string;
    /** 吹き出し背景 (pastel). */
    bubbleBg: string;
  };
}

const BUILTIN_THEMES: Array<{
  keyword: string;
  emoji: string;
  iconGradient: string;
  bubbleBg: string;
}> = [
  {
    keyword: "慎重",
    emoji: "🛡️",
    iconGradient: "linear-gradient(135deg, #93C5FD 0%, #3B82F6 100%)",
    bubbleBg: "#DBEAFE", // sky-100
  },
  {
    keyword: "楽観",
    emoji: "☀️",
    iconGradient: "linear-gradient(135deg, #FCD34D 0%, #F59E0B 100%)",
    bubbleBg: "#FEF3C7", // amber-100
  },
  {
    keyword: "効率",
    emoji: "⚡",
    iconGradient: "linear-gradient(135deg, #C4B5FD 0%, #8B5CF6 100%)",
    bubbleBg: "#EDE9FE", // violet-100
  },
];

function personaTheme(name: string): PersonaTheme {
  for (const t of BUILTIN_THEMES) {
    if (name.includes(t.keyword)) {
      return {
        builtin: {
          emoji: t.emoji,
          iconGradient: t.iconGradient,
          bubbleBg: t.bubbleBg,
        },
      };
    }
  }
  return { builtin: null };
}

// === Cluster (bubble + actor) の内部レイアウト ===
// Cluster は固定 220px。内部の bottom 座標は cluster bottom が基準。
const CLUSTER_HEIGHT = 220;
const ACTOR_ROW_BOTTOM = 20; // cluster bottom から actor row までの距離

const ACTOR_POSITIONS = [
  // self (center): T icon、mb=0
  // bubbleBottom = ACTOR_ROW_BOTTOM(20) + mb(0) + actor(44) + gap(4) = 68
  { actorMb: 0, bubbleBottom: 68, tail: "center" as const, side: "center" as const },
  // anon1 (left): orange blob、mb=32
  { actorMb: 32, bubbleBottom: 100, tail: "left" as const, side: "left" as const },
  // anon2 (right): blue blob、mb=18
  { actorMb: 18, bubbleBottom: 86, tail: "right" as const, side: "right" as const },
];

// 視覚順 (左→中央→右): mockup-anonymous-strangers.html §5 の actor 並び.
const VISUAL_ORDER = [1, 0, 2] as const;

// utterances index 別 BlobAvatar 設定 (visual position に紐付く色).
const BLOB_COLORS = ["green", "orange", "blue"] as const;
const BLOB_GAZES = ["center", "upright", "downleft"] as const;

interface MangaStageProps {
  utterances: Utterance[];
  /** 現在話している persona の persona_id (= bubble large + tail + animation 対象). */
  currentSpeakerId?: string;
  /** 2026-05-24 v4: T icon (self) 廃止. 全 slot を blob で表示.
   *  prop は backward-compat のため残置するが内部で使用しない. */
  personaSource?: "anonymous" | "builtin";
  /** stage 上部の overlay slot (例: 完了時の proposal + YES/NO). */
  children?: React.ReactNode;
}

// personas event 到着前 (合議直後の待機中) でも 3 actor を可視化するための placeholder.
// 2026-05-24 v4: T icon (self) 廃止に伴い、placeholder name も中立に.
const PLACEHOLDER_UTTERANCES: Utterance[] = [
  { persona_id: "__placeholder-1", persona_name: "考え中 #1", text: "", done: false },
  { persona_id: "__placeholder-2", persona_name: "考え中 #2", text: "", done: false },
  { persona_id: "__placeholder-3", persona_name: "考え中 #3", text: "", done: false },
];

export function MangaStage({
  utterances,
  currentSpeakerId,
  personaSource = "anonymous",
  children,
}: MangaStageProps) {
  // personas event 到着前でも 3 actor を表示するため、不足分は placeholder で埋める.
  const slots: Utterance[] = [0, 1, 2].map(
    (idx) => utterances[idx] ?? PLACEHOLDER_UTTERANCES[idx]!,
  );

  // 2026-05-24: user が past bubble をクリックして前面化した persona_id.
  //   null の場合は自動 (現在話している) 判定. 同じ bubble を再 click で解除.
  const [focusedPersonaId, setFocusedPersonaId] = useState<string | null>(null);

  // current speaker: focus 優先 → 明示指定 → 未確定の最新 → 末尾.
  const autoSpeakerId =
    currentSpeakerId ??
    [...utterances].reverse().find((u) => !u.done)?.persona_id ??
    utterances[utterances.length - 1]?.persona_id;
  const speakerId = focusedPersonaId ?? autoSpeakerId;

  return (
    <div
      data-testid="manga-stage"
      // v10: flex column。Overlay (top) / Spacer (1fr) / Cluster (220px) で分離.
      // parent (DecisionPage) が h-full + flex-col のため、stage は flex-1 で main 残空間を吸収.
      style={{
        position: "relative",
        width: "100%",
        flex: "1 1 0%",
        // minHeight = overlay 最小 (140) + cluster (220) + 余白 (20) ≈ 380
        minHeight: 380,
        maxHeight: 720,
        overflow: "hidden",
        background: "#FFFCF4",
        borderRadius: 12,
        border: "0.5px solid rgba(46, 36, 24, 0.18)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* EarthHorizon — stage 全体に absolute、cluster の背景として描画 (z-index 0) */}
      <EarthHorizon intensity={0.7} />

      {/* Overlay slot (top、flex-shrink:0 で自然 height). caller の proposal/SwipeChoice が render される. */}
      {children && (
        <div
          data-testid="manga-stage-overlay"
          style={{
            flexShrink: 0,
            padding: "12px 12px 0 12px",
            zIndex: 20,
            position: "relative",
          }}
        >
          {children}
        </div>
      )}

      {/* Spacer — 残り垂直空間を吸収 (small viewport で 0、large で大きく) */}
      <div style={{ flex: "1 1 0%", minHeight: 0 }} />

      {/* Bubble-Actor Cluster — 固定 220px、position:relative で内部 absolute child の anchor */}
      <div
        data-testid="manga-cluster"
        style={{
          position: "relative",
          flexShrink: 0,
          height: CLUSTER_HEIGHT,
          zIndex: 5,
        }}
      >
        {/* Actor row (cluster 底辺、3 アクター横並び — VISUAL_ORDER で左→中央→右) */}
        <div
          style={{
            position: "absolute",
            bottom: ACTOR_ROW_BOTTOM,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            padding: "0 30px",
            zIndex: 2,
          }}
        >
          {VISUAL_ORDER.map((idx) => {
            const u = slots[idx]!;
            const pos = ACTOR_POSITIONS[idx]!;
            const isSpeaking = u.persona_id === speakerId;
            const actorScale = isSpeaking ? 1.12 : 0.92;
            const actorZ = isSpeaking ? 5 : 1;
            // 2026-05-24: persona name から theme を導出 (builtin → emoji icon、anonymous → blob).
            const theme = personaTheme(u.persona_name);
            // placeholder (utterance 未到着) は click 不可.
            const isPlaceholder = u.persona_id.startsWith("__placeholder");
            const handleActorClick = () => {
              if (isPlaceholder) return;
              setFocusedPersonaId((prev) =>
                prev === u.persona_id ? null : u.persona_id,
              );
            };
            return (
              <button
                type="button"
                key={u.persona_id}
                onClick={handleActorClick}
                disabled={isPlaceholder}
                aria-label={
                  isSpeaking
                    ? `${u.persona_name} の発言 (現在前面)`
                    : `${u.persona_name} の発言を前面化`
                }
                style={{
                  marginBottom: pos.actorMb,
                  transform: `scale(${actorScale})`,
                  transformOrigin: "center bottom",
                  transition: "transform 280ms ease-out",
                  zIndex: actorZ,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: isPlaceholder ? "default" : "pointer",
                }}
                data-testid={`manga-actor-${idx}`}
                data-actor-speaking={isSpeaking}
                data-actor-state={isSpeaking ? "speaking" : u.done ? "past" : "future"}
              >
                {theme.builtin ? (
                  <span
                    role="img"
                    aria-label={
                      isSpeaking
                        ? `${u.persona_name} (発話中)`
                        : u.persona_name
                    }
                    data-testid={`manga-actor-icon-${idx}`}
                    data-actor-speaking={isSpeaking}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: theme.builtin.iconGradient,
                      border: "1.5px solid #FFFCF4",
                      fontSize: 22,
                      opacity: isSpeaking ? 1 : 0.32,
                      boxShadow: isSpeaking
                        ? "0 4px 12px rgba(46,36,24,0.18)"
                        : "none",
                    }}
                  >
                    {theme.builtin.emoji}
                  </span>
                ) : (
                  <BlobAvatar
                    size={44}
                    color={BLOB_COLORS[idx]!}
                    gaze={BLOB_GAZES[idx]!}
                    dim={!isSpeaking}
                    name={
                      isSpeaking
                        ? `${u.persona_name} (発話中)`
                        : u.persona_name
                    }
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Bubbles (cluster 内部 absolute、bubbleBottom は cluster 底辺基準). */}
        {VISUAL_ORDER.map((idx) => {
          const u = slots[idx]!;
          const pos = ACTOR_POSITIONS[idx]!;
          const isSpeaking = u.persona_id === speakerId;
          // 2026-05-24 v4: T icon (self) 廃止に伴い、全 bubble pink. cream (self) variant 廃止.
          const isSelf = false;
          const showTyping = !u.done && !u.text;
          const showBubble = !!u.text;
          const variant: "pink" | "cream" = isSelf ? "cream" : "pink";
          // 2026-05-24: builtin persona は theme 色 (sky/amber/violet) で bubble bg を上書き.
          const theme = personaTheme(u.persona_name);
          const bubbleBg = theme.builtin?.bubbleBg;

          const bubbleLeftRight: {
            left?: number | string;
            right?: number | string;
            transform?: string;
          } =
            pos.side === "left"
              ? { left: 12 }
              : pos.side === "right"
                ? { right: 12 }
                : { left: "50%", transform: "translateX(-50%)" };

          return (
            <div key={u.persona_id}>
              {showBubble && (
                <MangaBubble
                  size={isSpeaking ? "large" : "small"}
                  tail={pos.tail}
                  bottom={pos.bubbleBottom}
                  {...bubbleLeftRight}
                  variant={variant}
                  bgColorOverride={bubbleBg}
                  language={u.primary_language}
                  rtl={u.primary_language === "ar"}
                  testId={`manga-bubble-${idx}`}
                  onClick={() => {
                    // 既に focus 中 → 解除 (auto に戻す). 他 → focus 切替.
                    setFocusedPersonaId((prev) =>
                      prev === u.persona_id ? null : u.persona_id,
                    );
                  }}
                  clickLabel={
                    isSpeaking
                      ? `${u.persona_name} の発言 (現在前面)`
                      : `${u.persona_name} の発言を前面化`
                  }
                >
                  <span
                    data-testid="manga-bubble-text"
                    style={{
                      // line-clamp 4 で max height ≈ 110px、cluster 220 内に収まる.
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {u.text}
                  </span>
                </MangaBubble>
              )}
              {showTyping && (
                <TypingBubble
                  // typing dots は actor 直上 (cluster bottom + actor row + actor mb + 余白)
                  bottom={ACTOR_ROW_BOTTOM + pos.actorMb + 50}
                  side={pos.side}
                  testId={`manga-typing-${idx}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** typing 中 (utterance 未到着) の「考え中」吹き出し. */
function TypingBubble({
  bottom,
  side,
  testId,
}: {
  bottom: number;
  side: "left" | "right" | "center";
  testId: string;
}) {
  const leftRight =
    side === "left"
      ? { left: 50 }
      : side === "right"
        ? { right: 50 }
        : { left: "50%", transform: "translateX(-50%)" };
  return (
    <div
      role="status"
      aria-label="考え中"
      data-testid={testId}
      style={{
        position: "absolute",
        bottom,
        ...leftRight,
        zIndex: 2,
        padding: "6px 10px",
        background: "#FFFCF4",
        border: "0.5px solid rgba(46, 36, 24, 0.30)",
        borderRadius: 14,
        display: "flex",
        gap: 4,
        alignItems: "center",
        opacity: 0.7,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          data-ym-anim
          style={{
            width: 5,
            height: 5,
            background: "rgba(46, 36, 24, 0.55)",
            borderRadius: "50%",
            opacity: 0.7,
            animation: `ym-typing-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
