import { describe, expect, it } from "vitest";
import {
  resolveDayKind,
  selectQuickStartQueue,
  pool,
  type QuickStartTemplatePool,
} from "../../../src/features/decision/quickStartTemplates";

/** Helper: Date(year, monthIndex, day, hour). monthIndex=0 → January. */
function at(year: number, month: number, day: number, hour: number): Date {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

describe("resolveDayKind", () => {
  it("Saturday / Sunday → weekend", () => {
    expect(resolveDayKind(at(2026, 5, 23, 12))).toBe("weekend"); // Sat
    expect(resolveDayKind(at(2026, 5, 24, 12))).toBe("weekend"); // Sun
  });
  it("Mon-Fri → weekday", () => {
    expect(resolveDayKind(at(2026, 5, 22, 12))).toBe("weekday"); // Fri
    expect(resolveDayKind(at(2026, 5, 25, 12))).toBe("weekday"); // Mon
  });
});

describe("selectQuickStartQueue", () => {
  it("11-14 時の平日 → lunch-weekday が queue の最前", () => {
    const queue = selectQuickStartQueue(at(2026, 5, 22, 12)); // Fri 12:00
    expect(queue[0]?.id).toBe("lunch-weekday");
  });

  it("11-14 時の週末 → lunch-weekend が含まれる", () => {
    const queue = selectQuickStartQueue(at(2026, 5, 23, 12)); // Sat 12:00
    const ids = queue.map((t) => t.id);
    expect(ids).toContain("lunch-weekend");
    expect(ids).not.toContain("lunch-weekday"); // weekday-only
  });

  it("catchAll は常に queue の末尾に追加される", () => {
    const queue = selectQuickStartQueue(at(2026, 5, 22, 12));
    expect(queue[queue.length - 1]?.id).toBe(pool.catchAll.id);
  });

  it("excludeIds の template はスキップされる (catchAll は spec §6 で除外対象外、常に末尾に残る)", () => {
    const queue1 = selectQuickStartQueue(
      at(2026, 5, 22, 12),
      new Set(["lunch-weekday"]),
    );
    expect(queue1.find((t) => t.id === "lunch-weekday")).toBeUndefined();

    // 2026-05-23 修正: catchAll は recent-yes に含まれていても常に末尾に存在 (queue 空転落バグの修正)
    const queue2 = selectQuickStartQueue(
      at(2026, 5, 22, 12),
      new Set([pool.catchAll.id]),
    );
    expect(queue2[queue2.length - 1]?.id).toBe(pool.catchAll.id);
  });

  it("全 template + catchAll が excludeIds に含まれても queue は catchAll を末尾に持つ (queue 空転落しない)", () => {
    const allIds = new Set([
      ...pool.templates.map((t) => t.id),
      pool.catchAll.id,
    ]);
    const queue = selectQuickStartQueue(at(2026, 5, 22, 12), allIds);
    expect(queue.length).toBe(1);
    expect(queue[0]?.id).toBe(pool.catchAll.id);
  });

  it("hours = [] の template (例: music-mood) はどの時刻でもマッチする", () => {
    const queueDay = selectQuickStartQueue(at(2026, 5, 22, 9));
    const queueNight = selectQuickStartQueue(at(2026, 5, 22, 23));
    const idsDay = queueDay.map((t) => t.id);
    const idsNight = queueNight.map((t) => t.id);
    expect(idsDay).toContain("music-mood");
    expect(idsNight).toContain("music-mood");
  });

  it("同 priority の tie-break は id ASC で安定", () => {
    const customPool: QuickStartTemplatePool = {
      generatedAt: "2026-01-01T00:00:00Z",
      generatedBy: "test",
      schemaVersion: 1,
      templates: [
        { id: "b-item", title: "B", hours: [], dayKind: "any", preferenceTag: null, priority: 50 },
        { id: "a-item", title: "A", hours: [], dayKind: "any", preferenceTag: null, priority: 50 },
        { id: "c-item", title: "C", hours: [], dayKind: "any", preferenceTag: null, priority: 50 },
      ],
      catchAll: {
        id: "z-catch",
        title: "Z",
        hours: [],
        dayKind: "any",
        preferenceTag: null,
        priority: 0,
      },
    };
    const queue = selectQuickStartQueue(at(2026, 5, 22, 12), new Set(), customPool);
    expect(queue.map((t) => t.id)).toEqual(["a-item", "b-item", "c-item", "z-catch"]);
  });
});
