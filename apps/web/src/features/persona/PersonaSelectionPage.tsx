/**
 * PersonaSelectionPage — 最大 3 個選択 + builtin reset (U7d FD §4.3).
 */
import { useEffect, useState } from "react";
import { Button, PersonaCard, Spinner, useToast } from "@yesman/ui";
import {
  useBuiltinPersonas,
  useMyPersonas,
  useResetSelection,
  useSelection,
  useSetSelection,
} from "./usePersona";
import { t } from "./strings";

const MAX_SELECTION = 3;

export default function PersonaSelectionPage() {
  const { data: my } = useMyPersonas();
  const { data: builtin } = useBuiltinPersonas();
  const { data: current, isPending } = useSelection();
  const setSelection = useSetSelection();
  const resetSelection = useResetSelection();
  const { push } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // current selection を state 初期化
  useEffect(() => {
    if (current?.persona_ids) {
      setSelected(new Set(current.persona_ids));
    }
  }, [current?.persona_ids]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTION) {
        next.add(id);
      } else {
        push({ message: t("selectionOverLimit"), variant: "info" });
        return prev;
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await setSelection.mutateAsync({ persona_ids: Array.from(selected) });
      push({ message: t("selectionSaved"), variant: "success" });
    } catch (err) {
      push({ message: String(err), variant: "error" });
    }
  };

  const handleReset = async () => {
    try {
      await resetSelection.mutateAsync();
      setSelected(new Set());
      push({ message: t("selectionReset"), variant: "info" });
    } catch (err) {
      push({ message: String(err), variant: "error" });
    }
  };

  if (isPending) return <Spinner />;

  const all = [...(builtin ?? []), ...(my ?? [])];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-bold">{t("selectionPageTitle")}</h1>
      <p className="text-sm text-neutral-600">
        選択中: {selected.size} / {MAX_SELECTION}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {all.map((p) => (
          <PersonaCard
            key={p.id}
            persona={p}
            selected={selected.has(p.id)}
            onClick={() => toggle(p.id)}
          />
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          variant="secondary"
          onClick={handleReset}
          loading={resetSelection.isPending}
        >
          {t("selectionResetButton")}
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={selected.size === 0}
          loading={setSelection.isPending}
        >
          {t("selectionSaveButton")}
        </Button>
      </div>
    </div>
  );
}
