/**
 * unifiedSelectionStorage — localStorage 永続化 + 新規ユーザーデフォルト選択の unit tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BUILTIN_SELECTION,
  MAX_SELECTION,
  clearUnifiedSelection,
  readUnifiedSelection,
  writeUnifiedSelection,
} from "../../../src/features/persona/unifiedSelectionStorage";

const STORAGE_KEY = "yesman:unified-selection-v1";

describe("unifiedSelectionStorage", () => {
  beforeEach(() => clearUnifiedSelection());
  afterEach(() => clearUnifiedSelection());

  it("新規ユーザー (key 未作成) は builtin 3 をデフォルト選択する", () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    const selection = readUnifiedSelection();
    expect(selection).toHaveLength(3);
    expect(selection).toEqual(DEFAULT_BUILTIN_SELECTION);
    expect(selection.every((s) => s.source === "builtin")).toBe(true);
  });

  it("DEFAULT_BUILTIN_SELECTION は builtin 3 種の固定 UUID", () => {
    expect(DEFAULT_BUILTIN_SELECTION).toEqual([
      { source: "builtin", id: "00000000-0000-0000-0000-0000000000a1" },
      { source: "builtin", id: "00000000-0000-0000-0000-0000000000a2" },
      { source: "builtin", id: "00000000-0000-0000-0000-0000000000a3" },
    ]);
  });

  it("明示的な空配列 (reset) はデフォルトを復活させず空のまま尊重する", () => {
    writeUnifiedSelection([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("[]");
    expect(readUnifiedSelection()).toEqual([]);
  });

  it("user が選択した内容は永続化され、デフォルトより優先される", () => {
    const custom = [{ source: "my" as const, id: "my-persona-1" }];
    writeUnifiedSelection(custom);
    expect(readUnifiedSelection()).toEqual(custom);
  });

  it("clearUnifiedSelection 後は再びデフォルト (builtin 3) に戻る", () => {
    writeUnifiedSelection([{ source: "my", id: "x" }]);
    clearUnifiedSelection();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readUnifiedSelection()).toEqual(DEFAULT_BUILTIN_SELECTION);
  });

  it("MAX_SELECTION を超える保存は 3 件に trim される", () => {
    writeUnifiedSelection([
      { source: "builtin", id: "a" },
      { source: "builtin", id: "b" },
      { source: "my", id: "c" },
      { source: "my", id: "d" },
    ]);
    expect(readUnifiedSelection()).toHaveLength(MAX_SELECTION);
  });
});
