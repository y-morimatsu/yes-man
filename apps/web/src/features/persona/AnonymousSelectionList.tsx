/**
 * AnonymousSelectionList — 2026-05-24 v4. anonymous pool の selection UI.
 *
 * 旧 AnonymousRandomCard (random sample 2 件) を置き換え、user が個別 selection できる UI.
 * - GET /v1/persona-pool/list で caller exclude された pool 一覧を取得
 * - 各 persona に BlobAvatar + value_tags + primary_language hint を表示
 * - checkbox 風選択、unified selection (max 3 across all sources)
 */
import { BlobAvatar, Spinner } from "@yesman/ui";
import { useToast } from "@yesman/ui";
import type { AnonymousPersona } from "@yesman/api-client";
import { useAnonymousList } from "./usePersonaPool";
import { useUnifiedSelection } from "./useUnifiedSelection";
import { MAX_SELECTION } from "./unifiedSelectionStorage";

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
const BLOB_COLORS = ["orange", "blue", "pink", "green"] as const;

/** persona_id hash から blob color を deterministic に選ぶ */
function colorFor(id: string): "orange" | "blue" | "pink" | "green" {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return BLOB_COLORS[h % BLOB_COLORS.length]!;
}

export function AnonymousSelectionList() {
  const list = useAnonymousList(20);
  const { isSelected, toggle, selection } = useUnifiedSelection();
  const { push } = useToast();

  const personas = list.data?.personas ?? [];

  const handleToggle = (p: AnonymousPersona) => {
    const result = toggle({ source: "anonymous", id: p.persona_id });
    if (result === "limit") {
      push({
        message: `選択は最大 ${MAX_SELECTION} 件まで (現在 ${selection.length})`,
        variant: "info",
      });
    }
  };

  if (list.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (list.isError) {
    return (
      <p className="text-xs text-error italic" role="alert">
        知り合い一覧を取得できませんでした
      </p>
    );
  }

  if (personas.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-neutral-300 p-4 text-center"
        data-testid="anonymous-selection-empty"
      >
        <p className="text-sm italic text-neutral-500">
          まだ「知り合い」 はいません
        </p>
        <p className="text-xs text-neutral-400 mt-1">
          誰かが opt-in するとここに表示されます
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="anonymous-selection-list">
      {personas.map((p) => {
        const selected = isSelected({ source: "anonymous", id: p.persona_id });
        return (
          <button
            key={p.persona_id}
            type="button"
            onClick={() => handleToggle(p)}
            data-testid={`anonymous-selection-item-${p.persona_id}`}
            data-selected={selected}
            className={`
              w-full text-left rounded-xl border-2 px-3 py-2 flex items-start gap-3
              transition-colors hover:border-orange-400
              ${selected ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white"}
            `}
          >
            <BlobAvatar
              size={36}
              color={colorFor(p.persona_id)}
              gaze="center"
              name="知り合い"
            />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-1 mb-1">
                {p.value_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      background: "rgba(239, 122, 98, 0.12)",
                      color: "#2E2418",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-neutral-500">
                {LANGUAGE_LABEL[p.primary_language] ?? p.primary_language} ・{" "}
                {FORMALITY_LABEL[p.formality] ?? p.formality}
              </p>
            </div>
            <span
              aria-hidden
              className={`shrink-0 inline-flex items-center justify-center rounded-full text-xs ${
                selected
                  ? "bg-orange-500 text-white"
                  : "bg-neutral-100 text-neutral-400"
              }`}
              style={{ width: 20, height: 20 }}
            >
              {selected ? "✓" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
