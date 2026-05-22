import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCurrent,
  getCurrentEmail,
  getCurrentUser,
  listUsers,
  registerUser,
  setCurrentEmail,
  resetForTesting,
} from "../../src/shell/mockAuthStorage";

describe("mockAuthStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    resetForTesting();
  });
  afterEach(() => localStorage.clear());

  it("listUsers — 初期状態は空配列", () => {
    expect(listUsers()).toEqual([]);
  });

  it("registerUser — 新規 email を追加し MockUser を返す", () => {
    const u = registerUser("taro@example.com", "Taro");
    expect(u.email).toBe("taro@example.com");
    expect(u.display_name).toBe("Taro");
    expect(typeof u.created_at).toBe("string");
    expect(listUsers()).toHaveLength(1);
  });

  it("registerUser — sub が UUID v4 形式で採番される", () => {
    const u = registerUser("taro@example.com");
    expect(u.sub).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("registerUser — 別 email は別 sub を持つ (multi-user)", () => {
    const a = registerUser("taro@example.com");
    const b = registerUser("hanako@example.com");
    expect(a.sub).not.toBe(b.sub);
  });

  it("registerUser — 同 email 2 度目は sub も保持される (idempotent)", () => {
    const a = registerUser("taro@example.com");
    const b = registerUser("taro@example.com");
    expect(b.sub).toBe(a.sub);
  });

  it("registerUser — 大文字/前後空白は normalize される", () => {
    const u = registerUser("  Taro@Example.COM  ", "Taro");
    expect(u.email).toBe("taro@example.com");
  });

  it("registerUser — 同 email 2 度目は既存を返し list を増やさない", () => {
    const a = registerUser("taro@example.com");
    const b = registerUser("taro@example.com", "Taro2");
    expect(b.email).toBe("taro@example.com");
    expect(listUsers()).toHaveLength(1);
    // display_name は最初の登録時のものを保持 (上書きしない)
    expect(b.display_name).toBe(a.display_name);
  });

  it("setCurrentEmail — 登録済み email をセット可能", () => {
    registerUser("taro@example.com");
    setCurrentEmail("taro@example.com");
    expect(getCurrentEmail()).toBe("taro@example.com");
  });

  it("setCurrentEmail — 未登録 email は throw", () => {
    expect(() => setCurrentEmail("unknown@example.com")).toThrow(
      /not registered/i,
    );
  });

  it("setCurrentEmail — 入力は normalize される", () => {
    registerUser("taro@example.com");
    setCurrentEmail("  Taro@EXAMPLE.com  ");
    expect(getCurrentEmail()).toBe("taro@example.com");
  });

  it("clearCurrent — current-email を null にする", () => {
    registerUser("taro@example.com");
    setCurrentEmail("taro@example.com");
    clearCurrent();
    expect(getCurrentEmail()).toBeNull();
    // users list は保持される
    expect(listUsers()).toHaveLength(1);
  });

  it("getCurrentUser — current から MockUser を返す", () => {
    registerUser("taro@example.com", "Taro");
    setCurrentEmail("taro@example.com");
    const u = getCurrentUser();
    expect(u?.email).toBe("taro@example.com");
    expect(u?.display_name).toBe("Taro");
  });

  it("getCurrentUser — current が null なら null", () => {
    expect(getCurrentUser()).toBeNull();
  });

  it("localStorage 破損時に空状態へ自動 reset", () => {
    localStorage.setItem("yesman:mock-auth:users", "{not json");
    expect(listUsers()).toEqual([]);
  });

  it("localStorage 永続化: 別の module instance でも保持される (sim reload)", () => {
    registerUser("taro@example.com");
    setCurrentEmail("taro@example.com");
    // sim reload: in-memory cache reset、ただし localStorage は残る
    resetForTesting();
    expect(getCurrentEmail()).toBe("taro@example.com");
    expect(listUsers()).toHaveLength(1);
  });
});
