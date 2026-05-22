/**
 * useQuickStart — DecisionPage 初期 (idle) の YES/NO クイック質問ステートマシン.
 * spec: docs/superpowers/specs/2026-05-22-yes-no-quickstart-design.md §4-§6
 *
 * - mode "quick" → QuickStartCard 表示
 * - mode "text" → 従来の textbox + voice 表示 (5 連続 NO or 明示切替で遷移)
 * - reload で reset (in-memory state)
 */
import { useMemo, useState, useCallback } from "react";
import {
  selectQuickStartQueue,
  type QuickStartTemplate,
} from "./quickStartTemplates";
import { getRecentYesIds, recordYes } from "./quickStartHistory";

const NO_LIMIT = 5;

export type QuickStartMode = "quick" | "text";

export interface UseQuickStartOptions {
  /** Test 用 injectable な現在時刻 (Date.now のかわり). */
  now?: () => Date;
}

export interface UseQuickStartResult {
  mode: QuickStartMode;
  current: QuickStartTemplate | null;
  noCount: number;
  /** 残り queue 件数 (current を除く後続候補). UI には基本不要. */
  remaining: number;
  /** YES: 現在質問の title を返し、recordYes + advance. text mode の場合は空文字. */
  accept: () => string;
  /** NO: noCount++, 次候補に advance. 5 連続で mode=text に切替. */
  reject: () => void;
  /** Quick-Start を放棄して textbox にいつでも切替可能. */
  switchToText: () => void;
}

export function useQuickStart({ now = () => new Date() }: UseQuickStartOptions = {}): UseQuickStartResult {
  // init: hook mount 時に 1 回だけ queue を構築. Date / localStorage 依存はここに閉じる.
  const initialQueue = useMemo<QuickStartTemplate[]>(() => {
    const excluded = getRecentYesIds(now());
    return selectQuickStartQueue(now(), excluded);
    // mount 時にのみ評価。`now` が differ する test では別 useQuickStart instance を使う想定.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [queue, setQueue] = useState<QuickStartTemplate[]>(initialQueue);
  const [noCount, setNoCount] = useState(0);
  const [mode, setMode] = useState<QuickStartMode>(
    initialQueue.length > 0 ? "quick" : "text",
  );

  const current = mode === "quick" ? queue[0] ?? null : null;

  const accept = useCallback((): string => {
    if (!current) return "";
    recordYes(current.id, now());
    setQueue((q) => q.slice(1));
    return current.title;
  }, [current, now]);

  const reject = useCallback((): void => {
    setNoCount((c) => {
      const next = c + 1;
      if (next >= NO_LIMIT) {
        setMode("text");
      }
      return next;
    });
    setQueue((q) => q.slice(1));
  }, []);

  const switchToText = useCallback((): void => {
    setMode("text");
  }, []);

  return {
    mode,
    current,
    noCount,
    remaining: Math.max(0, queue.length - 1),
    accept,
    reject,
    switchToText,
  };
}
