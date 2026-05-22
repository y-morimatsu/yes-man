import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearRecentYes,
  getRecentYesIds,
  recordYes,
} from "../../../src/features/decision/quickStartHistory";

describe("quickStartHistory", () => {
  beforeEach(() => clearRecentYes());
  afterEach(() => clearRecentYes());

  it("recordYes + getRecentYesIds の往復", () => {
    const now = new Date("2026-05-22T12:00:00Z");
    recordYes("lunch-weekday", now);
    recordYes("dinner", now);
    const ids = getRecentYesIds(now);
    expect(ids.has("lunch-weekday")).toBe(true);
    expect(ids.has("dinner")).toBe(true);
    expect(ids.size).toBe(2);
  });

  it("24h を超えた entry は prune される", () => {
    const past = new Date("2026-05-22T00:00:00Z");
    const now = new Date("2026-05-23T01:00:00Z"); // 25h later
    recordYes("stale-id", past);
    recordYes("fresh-id", now);
    const ids = getRecentYesIds(now);
    expect(ids.has("stale-id")).toBe(false);
    expect(ids.has("fresh-id")).toBe(true);
  });

  it("同一 id を再 record すると at が更新される", () => {
    const t1 = new Date("2026-05-22T00:00:00Z");
    const t2 = new Date("2026-05-23T00:00:00Z"); // exactly 24h later — still inside window
    recordYes("same-id", t1);
    recordYes("same-id", t2);
    const ids = getRecentYesIds(t2);
    expect(ids.size).toBe(1);
    expect(ids.has("same-id")).toBe(true);
  });

  it("localStorage が空の状態で getRecentYesIds は空 Set", () => {
    expect(getRecentYesIds(new Date()).size).toBe(0);
  });

  it("壊れた JSON が localStorage にあっても落ちない", () => {
    window.localStorage.setItem("yesman:quickstart:recent-yes", "not json");
    expect(getRecentYesIds(new Date()).size).toBe(0);
  });
});
