/**
 * PersonaSelectionPage — 2026-05-24 v4 統合 selection.
 *
 * 3 source tab (ビルトイン / 世界の誰か / 自作) を切替、selection は localStorage に
 * 統合保存 (max 3 across all sources)。 anonymous の random sampling は廃止、user 選択式に。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, PersonaCard, Spinner, useToast } from "@yesman/ui";
import { useBuiltinPersonas, useMyPersonas } from "./usePersona";
import { PersonaSourceTabs } from "./PersonaSourceTabs";
import { AnonymousSelectionList } from "./AnonymousSelectionList";
import { PersonaCreateModal } from "./PersonaCreateModal";
import { useUnifiedSelection } from "./useUnifiedSelection";
import { MAX_SELECTION, type SelectedPersona } from "./unifiedSelectionStorage";
import { usePersonaSource } from "./usePersonaSource";
import { usePreference } from "../preference/usePreference";
import { t } from "./strings";
import type { Persona } from "@yesman/api-client";

type MyPersona = Persona;

const RECOMMEND_TOP_N = 3;

export default function PersonaSelectionPage() {
  const navigate = useNavigate();
  const { source, setSource } = usePersonaSource();
  const { data: my } = useMyPersonas();
  const { data: builtin } = useBuiltinPersonas();
  const { data: preference } = usePreference();
  const { selection, isSelected, toggle, reset, countBySource } =
    useUnifiedSelection();
  const { push } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  // 編集対象 persona (null = モーダル閉)。
  const [editing, setEditing] = useState<MyPersona | null>(null);

  // 2026-05-24: builtin 3 種 (慎重派 / 楽観派 / 効率派) は常に推奨。
  //   preference profile が空でも、user が初めて来た時点で 3 種全てに おすすめ badge を表示。
  //   preference 由来の persona は top N で追加 (my persona も推奨可)。
  const recommendedNames = useMemo(() => {
    const result = new Set<string>(builtin?.map((p) => p.name) ?? []);
    const style = (
      preference as { persona_style_preference?: Record<string, number> }
    )?.persona_style_preference;
    if (style) {
      const sorted = Object.entries(style)
        .sort(([, a], [, b]) => b - a)
        .slice(0, RECOMMEND_TOP_N)
        .map(([name]) => name);
      sorted.forEach((n) => result.add(n));
    }
    return result;
  }, [preference, builtin]);

  const handleToggleBuiltin = (id: string) => {
    const entry: SelectedPersona = { source: "builtin", id };
    const result = toggle(entry);
    if (result === "limit") {
      push({
        message: `選択は最大 ${MAX_SELECTION} 件まで (現在 ${selection.length})`,
        variant: "info",
      });
    }
  };

  const handleToggleMy = (id: string) => {
    const entry: SelectedPersona = { source: "my", id };
    const result = toggle(entry);
    if (result === "limit") {
      push({
        message: `選択は最大 ${MAX_SELECTION} 件まで (現在 ${selection.length})`,
        variant: "info",
      });
    }
  };

  if (!builtin && !my) return <Spinner />;

  const builtinList = builtin ?? [];
  const myList = my ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="font-sans text-lg font-bold">{t("selectionPageTitle")}</h1>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setCreateOpen(true)}
          data-testid="selection-create-persona"
        >
          {t("createButton")}
        </Button>
      </div>

      {/* 選択 count + source 別 breakdown */}
      <p
        className="text-xs"
        style={{ color: "#E8775A" }}
        data-testid="selection-count"
      >
        選択中: <span className="font-bold">{selection.length}</span> / {MAX_SELECTION}
        {selection.length > 0 && (
          <span className="ml-2 text-[12px] text-neutral-500">
            (ビルトイン:{countBySource.builtin} ・ 知り合い:{countBySource.anonymous} ・
            自作:{countBySource.my})
          </span>
        )}
      </p>

      <PersonaSourceTabs value={source} onChange={setSource} />

      {source === "anonymous" && (
        <div
          role="tabpanel"
          id="persona-panel-anonymous"
          aria-labelledby="persona-source-tab-anonymous"
          className="flex flex-col gap-3"
        >
          <p className="text-xs text-neutral-500">
            🤝 opt-in 中の 知り合い
          </p>
          <AnonymousSelectionList />
        </div>
      )}

      {source === "builtin" && (
        <div
          role="tabpanel"
          id="persona-panel-builtin"
          aria-labelledby="persona-source-tab-builtin"
          className="flex flex-col gap-4"
        >
          {recommendedNames.size > 0 && (
            <p className="text-xs text-neutral-500">
              💡 嗜好プロファイルから推奨:{" "}
              <span
                className="font-semibold not-italic"
                style={{ color: "#E8775A" }}
              >
                {Array.from(recommendedNames).join(" / ")}
              </span>
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {builtinList.map((p) => (
              <div key={p.id} className="relative">
                {recommendedNames.has(p.name) && (
                  <span
                    className="absolute -top-2 -right-2 z-10 rounded-full px-2 py-0.5 text-[12px] font-bold shadow-sm"
                    style={{ background: "#FFD6E0", color: "#E8775A" }}
                  >
                    💡 おすすめ
                  </span>
                )}
                <PersonaCard
                  persona={p}
                  selected={isSelected({ source: "builtin", id: p.id })}
                  onClick={() => handleToggleBuiltin(p.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {source === "my" && (
        <div
          role="tabpanel"
          id="persona-panel-my"
          aria-labelledby="persona-source-tab-my"
          className="flex flex-col gap-4"
        >
          {myList.length === 0 ? (
            <div
              className="rounded-2xl p-6 text-center flex flex-col items-center gap-3"
              style={{
                background: "#FFFCF4",
                border: "0.5px dashed rgba(46, 36, 24, 0.25)",
              }}
              data-testid="my-personas-empty"
            >
              <span className="text-3xl" aria-hidden>
                ✨
              </span>
              <p className="text-sm text-neutral-600">
                まだ自作ペルソナがありません
              </p>
              <p className="text-xs text-neutral-500">
                右上の「＋ 新規」から、あなただけの相談相手を作れます
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateOpen(true)}
                data-testid="my-personas-empty-create"
              >
                {t("createButton")}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xs text-neutral-500">
                ✨ あなたが作成したペルソナ ({myList.length} 件)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {myList.map((p) => (
                  <div key={p.id} className="relative">
                    {recommendedNames.has(p.name) && (
                      <span
                        className="absolute -top-2 -right-2 z-10 rounded-full px-2 py-0.5 text-[12px] font-bold shadow-sm"
                        style={{ background: "#FFD6E0", color: "#E8775A" }}
                      >
                        💡 おすすめ
                      </span>
                    )}
                    {/* 編集ボタン (カードクリック=選択トグルと分離) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(p);
                      }}
                      className="absolute bottom-2 right-2 z-10 rounded-full bg-neutral-0 px-2.5 py-1 text-[12px] font-semibold shadow-sm border border-neutral-200 hover:bg-neutral-50"
                      style={{ color: "#E8775A", borderColor: "#E0D5BC" }}
                      data-testid={`persona-edit-${p.id}`}
                      aria-label={`${p.name} を編集`}
                    >
                      ✏️ {t("editButton")}
                    </button>
                    <PersonaCard
                      persona={p}
                      selected={isSelected({ source: "my", id: p.id })}
                      onClick={() => handleToggleMy(p.id)}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button
          variant="secondary"
          onClick={() => {
            reset();
            push({ message: "選択を解除しました", variant: "info" });
          }}
        >
          リセット
        </Button>
        <Button
          variant="primary"
          data-testid="selection-confirm"
          disabled={selection.length === 0}
          onClick={() => {
            push({
              message: `${selection.length} 人で 決定する 準備が できました`,
              variant: "success",
            });
            navigate("/");
          }}
        >
          決定 ({selection.length})
        </Button>
      </div>

      {/* 2026-05-24: 新規ペルソナ作成 (PersonaListPage と同じ Modal を再利用).
          成功時 useCreatePersona が my list を invalidate + my タブへ自動切替で作成結果を可視化. */}
      <PersonaCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setSource("my")}
      />

      {/* 編集モーダル (my カードの ✏️ から起動) */}
      <PersonaCreateModal
        open={editing !== null}
        persona={editing}
        onClose={() => setEditing(null)}
        onCreated={() => setEditing(null)}
      />
    </div>
  );
}
