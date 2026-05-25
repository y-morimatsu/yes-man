/**
 * onboardingStorage.test.ts — per-user 完了 flag の verify.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearOnboardedAll,
  hasOnboarded,
  markOnboarded,
} from "../../../src/features/onboarding/onboardingStorage";

describe("onboardingStorage (per-user 完了 flag)", () => {
  beforeEach(() => clearOnboardedAll());
  afterEach(() => clearOnboardedAll());

  it("初期は未完了", () => {
    expect(hasOnboarded("sub-a")).toBe(false);
  });

  it("markOnboarded した sub は hasOnboarded=true", () => {
    markOnboarded("sub-a");
    expect(hasOnboarded("sub-a")).toBe(true);
    expect(hasOnboarded("sub-b")).toBe(false);
  });

  it("複数 sub を mark しても干渉なし", () => {
    markOnboarded("sub-a");
    markOnboarded("sub-b");
    expect(hasOnboarded("sub-a")).toBe(true);
    expect(hasOnboarded("sub-b")).toBe(true);
    expect(hasOnboarded("sub-c")).toBe(false);
  });

  it("同一 sub を 2 度 mark しても idempotent", () => {
    markOnboarded("sub-a");
    markOnboarded("sub-a");
    expect(hasOnboarded("sub-a")).toBe(true);
    // localStorage に重複 entry がないことを確認
    const raw = window.localStorage.getItem("yesman:onboarding:completed-subs");
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.completed_subs).toEqual(["sub-a"]);
  });

  it("空 sub は noop (false 返却)", () => {
    expect(hasOnboarded("")).toBe(false);
    markOnboarded("");
    const raw = window.localStorage.getItem("yesman:onboarding:completed-subs");
    expect(raw === null || JSON.parse(raw).completed_subs.length === 0).toBe(
      true,
    );
  });

  it("壊れた localStorage は安全に空とみなす", () => {
    window.localStorage.setItem(
      "yesman:onboarding:completed-subs",
      "not-json",
    );
    expect(hasOnboarded("sub-a")).toBe(false);
  });

  it("clearOnboardedAll で全 sub が false に", () => {
    markOnboarded("sub-a");
    markOnboarded("sub-b");
    clearOnboardedAll();
    expect(hasOnboarded("sub-a")).toBe(false);
    expect(hasOnboarded("sub-b")).toBe(false);
  });
});
