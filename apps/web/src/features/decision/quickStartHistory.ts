/**
 * localStorage で直近 24h 以内に Quick-Start から YES 採択した template.id を記録・取得.
 * spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §11 (client-side dedupe)
 *
 * stored value: array of { id: string, at: number (epoch ms) }
 * key: "yesman:quickstart:recent-yes"
 */

const STORAGE_KEY = "yesman:quickstart:recent-yes";
const WINDOW_MS = 24 * 60 * 60 * 1000;

interface Entry {
  id: string;
  at: number;
}

function readRaw(): Entry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is Entry =>
        typeof e === "object" && e !== null && typeof (e as Entry).id === "string" && typeof (e as Entry).at === "number",
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: Entry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota / privacy mode 等は silent fail (UX への影響なし、次回 fresh start)
  }
}

/** 24h 経過した entry を prune した直近 YES 採択 id 集合を返す. */
export function getRecentYesIds(now: Date = new Date()): Set<string> {
  const cutoff = now.getTime() - WINDOW_MS;
  const fresh = readRaw().filter((e) => e.at >= cutoff);
  // sweep: 古い entry が多い場合に localStorage を縮める
  if (fresh.length !== readRaw().length) {
    writeRaw(fresh);
  }
  return new Set(fresh.map((e) => e.id));
}

/** 指定 id を YES 採択履歴に追加. 同一 id が既存なら at を更新. */
export function recordYes(id: string, at: Date = new Date()): void {
  const cutoff = at.getTime() - WINDOW_MS;
  const fresh = readRaw().filter((e) => e.at >= cutoff && e.id !== id);
  fresh.push({ id, at: at.getTime() });
  writeRaw(fresh);
}

/** Test 用: history を全消去. */
export function clearRecentYes(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
