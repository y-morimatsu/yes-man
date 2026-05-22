import { describe, expect, it } from "vitest";
import { truncate } from "../../../src/features/score/truncate";

describe("truncate", () => {
  it("returns string unchanged when length <= n", () => {
    expect(truncate("hello", 10)).toBe("hello");
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when length > n", () => {
    expect(truncate("abcdefghij", 5)).toBe("abcde…");
  });

  it("handles Japanese (single code unit chars)", () => {
    expect(truncate("今日のランチを決めて", 5)).toBe("今日のラン…");
  });

  it("handles emoji surrogate pairs as single chars", () => {
    // 🎉 is 2 code units but 1 char via [...]
    expect(truncate("🎉🎉🎉🎉🎉🎉🎉", 3)).toBe("🎉🎉🎉…");
  });

  it("returns empty string unchanged", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("handles n=0 (edge case)", () => {
    expect(truncate("abc", 0)).toBe("…");
  });
});
