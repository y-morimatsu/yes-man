/**
 * useYesCombo — Yes 連続採択カウンター + 日次 reset (Hackathon ゲーミフィケーション).
 *
 * 連続 Yes をストリーク (combo) として localStorage に保持。
 * No で combo break → 0 にリセット。日付が変わると自動 reset。
 *
 * design:
 * - storage key: "yesman:yes-combo"
 * - stored value: { count: number, lastDate: string (YYYY-MM-DD) }
 * - 古い日付なら mount 時に reset
 * - SSR/privacy mode で localStorage 不可なら memory-only fallback
 */
import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "yesman:yes-combo";

interface StoredCombo {
  count: number;
  lastDate: string;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read(): StoredCombo {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, lastDate: todayStr() };
    const parsed = JSON.parse(raw) as Partial<StoredCombo>;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.lastDate !== "string"
    ) {
      return { count: 0, lastDate: todayStr() };
    }
    // 日付が変わったら reset
    if (parsed.lastDate !== todayStr()) {
      return { count: 0, lastDate: todayStr() };
    }
    return parsed as StoredCombo;
  } catch {
    return { count: 0, lastDate: todayStr() };
  }
}

function write(combo: StoredCombo): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(combo));
  } catch {
    // privacy mode 等は silent fail
  }
}

export interface UseYesComboResult {
  /** 現在の連続 Yes 数. */
  count: number;
  /** 直前のアクションが combo break (No) だったかどうか. UI 演出表示用。 */
  brokeCombo: boolean;
  /** Yes 採択時に呼ぶ. 戻り値は incremented count (即時利用可). */
  recordYes: () => number;
  /** No 採択時に呼ぶ. brokeCombo を一時的に true にして fade out させる. */
  recordNo: () => void;
  /** combo break 演出が終わったら呼ぶ (UI 側から fade out 完了で). */
  clearBrokeCombo: () => void;
}

export function useYesCombo(): UseYesComboResult {
  const initialRef = useRef<StoredCombo | null>(null);
  if (initialRef.current === null) {
    initialRef.current = read();
  }
  // ref で latest value を保持 (連続 recordYes() を同 act 内で正しく増分するため)
  const comboRef = useRef<StoredCombo>(initialRef.current);
  const [combo, setCombo] = useState<StoredCombo>(comboRef.current);
  const [brokeCombo, setBrokeCombo] = useState(false);

  // mount 後の date crossing 検出 (タブ放置で日付変わった場合)
  useEffect(() => {
    const stored = read();
    if (
      stored.count !== comboRef.current.count ||
      stored.lastDate !== comboRef.current.lastDate
    ) {
      comboRef.current = stored;
      setCombo(stored);
    }
    // 初回 mount のみ
  }, []);

  const recordYes = useCallback((): number => {
    const prev = comboRef.current;
    const next: StoredCombo = {
      count: prev.lastDate === todayStr() ? prev.count + 1 : 1,
      lastDate: todayStr(),
    };
    comboRef.current = next;
    write(next);
    setCombo(next);
    setBrokeCombo(false);
    return next.count;
  }, []);

  const recordNo = useCallback((): void => {
    const prev = comboRef.current;
    const hadCombo = prev.count > 0;
    const next: StoredCombo = { count: 0, lastDate: todayStr() };
    comboRef.current = next;
    write(next);
    setCombo(next);
    if (hadCombo) setBrokeCombo(true);
  }, []);

  const clearBrokeCombo = useCallback(() => setBrokeCombo(false), []);

  return {
    count: combo.count,
    brokeCombo,
    recordYes,
    recordNo,
    clearBrokeCombo,
  };
}
