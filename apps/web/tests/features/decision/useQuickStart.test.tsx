import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuickStart } from "../../../src/features/decision/useQuickStart";
import { clearRecentYes, getRecentYesIds } from "../../../src/features/decision/quickStartHistory";

describe("useQuickStart", () => {
  beforeEach(() => clearRecentYes());
  afterEach(() => clearRecentYes());

  const fri12 = () => new Date(2026, 4, 22, 12, 0, 0); // Fri 12:00

  it("初期 mount で mode=quick + current が non-null", () => {
    const { result } = renderHook(() => useQuickStart({ now: fri12 }));
    expect(result.current.mode).toBe("quick");
    expect(result.current.current).not.toBeNull();
    expect(result.current.noCount).toBe(0);
  });

  it("accept で title 返却 + recordYes (localStorage に保存)", () => {
    const { result } = renderHook(() => useQuickStart({ now: fri12 }));
    const initialId = result.current.current?.id;
    expect(initialId).toBeDefined();

    let returned = "";
    act(() => {
      returned = result.current.accept();
    });
    expect(returned).toBeTruthy();
    expect(getRecentYesIds(fri12()).has(initialId!)).toBe(true);
    // queue advances
    expect(result.current.current?.id).not.toBe(initialId);
  });

  it("reject で noCount++ + queue advance、5 連続で mode=text", () => {
    const { result } = renderHook(() => useQuickStart({ now: fri12 }));
    for (let i = 0; i < 4; i++) {
      act(() => result.current.reject());
    }
    expect(result.current.noCount).toBe(4);
    expect(result.current.mode).toBe("quick");

    act(() => result.current.reject());
    expect(result.current.noCount).toBe(5);
    expect(result.current.mode).toBe("text");
    expect(result.current.current).toBeNull();
  });

  it("switchToText でいつでも mode=text に遷移", () => {
    const { result } = renderHook(() => useQuickStart({ now: fri12 }));
    expect(result.current.mode).toBe("quick");
    act(() => result.current.switchToText());
    expect(result.current.mode).toBe("text");
    expect(result.current.current).toBeNull();
  });
});
