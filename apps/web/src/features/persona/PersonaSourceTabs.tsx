/**
 * PersonaSourceTabs — Persona Selection の 3-source tab UI.
 *
 * "builtin"   — 既存 3 種 (v0.4.0 完全互換、default)
 * "anonymous" — 「世界の誰か」匿名 pool (mockup §8 + 漫画ステージ)
 * "my" (2026-05-24) — 自作 (カスタム) persona、user が作成したもの.
 */
import type { PersonaSource } from "./personaSourceStorage";

const TABS: { id: PersonaSource; label: string; emoji: string; hint: string }[] = [
  {
    id: "builtin",
    label: "ビルトイン",
    emoji: "🎭",
    hint: "慎重派 / 楽観派 / 効率派",
  },
  {
    id: "anonymous",
    label: "知り合い",
    emoji: "🤝",
    hint: "opt-in 中から 呼ぶ",
  },
  {
    id: "my",
    label: "カスタム",
    emoji: "✨",
    hint: "自作のペルソナ",
  },
];

export function PersonaSourceTabs({
  value,
  onChange,
}: {
  value: PersonaSource;
  onChange: (next: PersonaSource) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="合議メンバーの source 切替"
      className="flex gap-1 border-b border-neutral-200 mb-3"
    >
      {TABS.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`persona-panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            data-testid={`persona-source-tab-${tab.id}`}
            className={[
              "flex-1 px-3 py-2 text-sm font-medium transition-colors",
              "border-b-2 -mb-px",
            ].join(" ")}
            style={
              active
                ? { borderBottomColor: "#EF7A62", color: "#2E2418" }
                : { borderBottomColor: "transparent", color: "rgba(46, 36, 24, 0.55)" }
            }
          >
            <span aria-hidden className="mr-1">
              {tab.emoji}
            </span>
            {tab.label}
            <span className="block text-[12px] font-normal text-neutral-400 mt-0.5">
              {tab.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
