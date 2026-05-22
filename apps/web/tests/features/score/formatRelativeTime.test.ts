import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { formatRelativeTime } from "../../../src/features/score/formatRelativeTime";

describe("formatRelativeTime", () => {
  const NOW = new Date("2026-05-22T12:00:00Z").getTime();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'たった今' for < 1 minute", () => {
    expect(formatRelativeTime("2026-05-22T11:59:30Z")).toBe("たった今");
  });

  it("returns 'N 分前' for < 60 minutes", () => {
    expect(formatRelativeTime("2026-05-22T11:55:00Z")).toBe("5 分前");
  });

  it("returns 'N 時間前' for < 24 hours", () => {
    expect(formatRelativeTime("2026-05-22T09:00:00Z")).toBe("3 時間前");
  });

  it("returns '昨日' for 1 day ago", () => {
    expect(formatRelativeTime("2026-05-21T12:00:00Z")).toBe("昨日");
  });

  it("returns 'N 日前' for 2-6 days", () => {
    expect(formatRelativeTime("2026-05-19T12:00:00Z")).toBe("3 日前");
  });

  it("returns YYYY-MM-DD for >= 7 days", () => {
    expect(formatRelativeTime("2026-05-10T12:00:00Z")).toBe("2026-05-10");
  });

  it("returns 'たった今' for future dates (defensive)", () => {
    expect(formatRelativeTime("2026-05-22T12:01:00Z")).toBe("たった今");
  });
});
