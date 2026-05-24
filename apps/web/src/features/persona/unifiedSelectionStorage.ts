/**
 * unifiedSelectionStorage — 2026-05-24 v4 統合 selection (3 source mix).
 *
 * 旧 backend `persona_ids` (builtin/my のみ) を置き換える localStorage ベースの選択 store.
 * - source: "builtin" | "anonymous" | "my"
 * - max 3 (source 混在可)
 * - 端末 / browser ごとに保持 (簡素化のため backend 同期しない、hackathon scope).
 */
import type { SelectedPersonaSource } from "@yesman/api-client";

const STORAGE_KEY = "yesman:unified-selection-v1";
export const MAX_SELECTION = 3;

export interface SelectedPersona {
  source: SelectedPersonaSource;
  id: string;
}

function isValidEntry(v: unknown): v is SelectedPersona {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    (e.source === "builtin" || e.source === "anonymous" || e.source === "my")
  );
}

export function readUnifiedSelection(): SelectedPersona[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).slice(0, MAX_SELECTION);
  } catch {
    return [];
  }
}

export function writeUnifiedSelection(entries: SelectedPersona[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = entries.slice(0, MAX_SELECTION);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    /* quota / private mode は ignore (state はメモリで維持される) */
  }
}

export function clearUnifiedSelection(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** entry の同一性 (source+id 一致). */
export function isSameEntry(a: SelectedPersona, b: SelectedPersona): boolean {
  return a.source === b.source && a.id === b.id;
}
