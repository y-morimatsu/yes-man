import { describe, expect, it } from "vitest";
import { getScoreLevel } from "../../../src/features/score/scoreLevel";

describe("getScoreLevel", () => {
  it("returns danger when no_count >= 5", () => {
    expect(getScoreLevel(5, 0.7)).toBe("danger");
    expect(getScoreLevel(10, null)).toBe("danger");
  });

  it("returns warning when yes_ratio < 0.5", () => {
    expect(getScoreLevel(3, 0.4)).toBe("warning");
    expect(getScoreLevel(3, 0.0)).toBe("warning");
  });

  it("returns ok when no_count < 5 and yes_ratio >= 0.5", () => {
    expect(getScoreLevel(0, null)).toBe("ok");
    expect(getScoreLevel(2, 0.7)).toBe("ok");
    expect(getScoreLevel(2, 0.5)).toBe("ok");
  });

  it("danger has priority over warning", () => {
    // no_count 5 + low yes_ratio → danger (not warning)
    expect(getScoreLevel(5, 0.1)).toBe("danger");
  });

  it("handles null ratio gracefully", () => {
    expect(getScoreLevel(0, null)).toBe("ok");
    expect(getScoreLevel(4, null)).toBe("ok");
  });
});
