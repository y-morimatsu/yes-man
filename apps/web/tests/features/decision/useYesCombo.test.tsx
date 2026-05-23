/**
 * useYesCombo unit test — increment / break / 日次 reset.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useYesCombo } from "../../../src/features/decision/useYesCombo";

const STORAGE_KEY = "yesman:yes-combo";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("useYesCombo", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("初期 mount は count=0 / brokeCombo=false", () => {
    const { result } = renderHook(() => useYesCombo());
    expect(result.current.count).toBe(0);
    expect(result.current.brokeCombo).toBe(false);
  });

  it("recordYes で count が増分される (戻り値も即時利用可)", () => {
    const { result } = renderHook(() => useYesCombo());
    let returned = 0;
    act(() => {
      returned = result.current.recordYes();
    });
    expect(returned).toBe(1);
    expect(result.current.count).toBe(1);
    act(() => {
      returned = result.current.recordYes();
    });
    expect(returned).toBe(2);
    expect(result.current.count).toBe(2);
  });

  it("recordNo で count=0 + brokeCombo=true (直前に combo がある場合)", () => {
    const { result } = renderHook(() => useYesCombo());
    act(() => {
      result.current.recordYes();
      result.current.recordYes();
    });
    expect(result.current.count).toBe(2);
    act(() => result.current.recordNo());
    expect(result.current.count).toBe(0);
    expect(result.current.brokeCombo).toBe(true);
  });

  it("combo=0 で No しても brokeCombo は立たない", () => {
    const { result } = renderHook(() => useYesCombo());
    act(() => result.current.recordNo());
    expect(result.current.count).toBe(0);
    expect(result.current.brokeCombo).toBe(false);
  });

  it("clearBrokeCombo で brokeCombo を false に戻せる", () => {
    const { result } = renderHook(() => useYesCombo());
    act(() => {
      result.current.recordYes();
      result.current.recordNo();
    });
    expect(result.current.brokeCombo).toBe(true);
    act(() => result.current.clearBrokeCombo());
    expect(result.current.brokeCombo).toBe(false);
  });

  it("localStorage に保存され、再 mount で復元される", () => {
    const { result: r1, unmount } = renderHook(() => useYesCombo());
    act(() => {
      r1.current.recordYes();
      r1.current.recordYes();
      r1.current.recordYes();
    });
    unmount();
    const { result: r2 } = renderHook(() => useYesCombo());
    expect(r2.current.count).toBe(3);
  });

  it("日付が古い localStorage は mount 時に 0 に reset", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ count: 7, lastDate: "2020-01-01" }),
    );
    const { result } = renderHook(() => useYesCombo());
    expect(result.current.count).toBe(0);
  });

  it("壊れた localStorage は安全に 0 から開始", () => {
    window.localStorage.setItem(STORAGE_KEY, "not-json");
    const { result } = renderHook(() => useYesCombo());
    expect(result.current.count).toBe(0);
  });

  it("today の localStorage は復元される", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ count: 4, lastDate: todayStr() }),
    );
    const { result } = renderHook(() => useYesCombo());
    expect(result.current.count).toBe(4);
  });
});
