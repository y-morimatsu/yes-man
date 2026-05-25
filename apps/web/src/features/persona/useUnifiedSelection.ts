/**
 * useUnifiedSelection — 2026-05-24 v4 統合 selection state hook.
 *
 * 3 source mix の SelectedPersona[] を localStorage と sync して provide.
 */
import { useCallback, useEffect, useState } from "react";
import {
  MAX_SELECTION,
  type SelectedPersona,
  clearUnifiedSelection,
  isSameEntry,
  readUnifiedSelection,
  writeUnifiedSelection,
} from "./unifiedSelectionStorage";

export interface UseUnifiedSelectionResult {
  selection: SelectedPersona[];
  /** 指定 entry が選択済か */
  isSelected: (entry: SelectedPersona) => boolean;
  /** toggle: 選択済なら外す、未選択なら追加 (max 3 を超えるなら null 返り = 拒否) */
  toggle: (entry: SelectedPersona) => "added" | "removed" | "limit";
  reset: () => void;
  /** source 別 count: { builtin, anonymous, my } */
  countBySource: Record<SelectedPersona["source"], number>;
}

export function useUnifiedSelection(): UseUnifiedSelectionResult {
  const [selection, setSelection] = useState<SelectedPersona[]>(() =>
    readUnifiedSelection(),
  );

  // 他 tab で localStorage が変更された場合に同期 (StorageEvent)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === null || e.key === "yesman:unified-selection-v1") {
        setSelection(readUnifiedSelection());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const isSelected = useCallback(
    (entry: SelectedPersona) =>
      selection.some((s) => isSameEntry(s, entry)),
    [selection],
  );

  const toggle = useCallback(
    (entry: SelectedPersona): "added" | "removed" | "limit" => {
      const existing = selection.find((s) => isSameEntry(s, entry));
      if (existing) {
        const next = selection.filter((s) => !isSameEntry(s, entry));
        setSelection(next);
        writeUnifiedSelection(next);
        return "removed";
      }
      if (selection.length >= MAX_SELECTION) {
        return "limit";
      }
      const next = [...selection, entry];
      setSelection(next);
      writeUnifiedSelection(next);
      return "added";
    },
    [selection],
  );

  const reset = useCallback(() => {
    setSelection([]);
    clearUnifiedSelection();
  }, []);

  const countBySource = selection.reduce(
    (acc, s) => {
      acc[s.source] += 1;
      return acc;
    },
    { builtin: 0, anonymous: 0, my: 0 } as Record<
      SelectedPersona["source"],
      number
    >,
  );

  return { selection, isSelected, toggle, reset, countBySource };
}
