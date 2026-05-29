/**
 * onboardingSignals.test.ts — answers → PreferenceProfile patch 変換の検証.
 */
import { describe, expect, it } from "vitest";
import { computeProfilePatch } from "../../../src/features/onboarding/onboardingSignals";
import type { OnboardingAnswer } from "../../../src/features/onboarding/useOnboarding";

// 注: ID は generated JSON の実 ID と一致させる必要あり (fallback 版が svc-* / persona-* 形式)
type AnswerKind = OnboardingAnswer["kind"];

function answer(
  id: string,
  category: string,
  kind: AnswerKind,
  choice: "yes" | "no",
): OnboardingAnswer {
  return { id, category, kind, choice, at: 1_700_000_000_000 };
}

describe("computeProfilePatch (v3-β rev2: 性格 + 生活)", () => {
  it("空 answers から空 patch", () => {
    const patch = computeProfilePatch([]);
    expect(patch.accepted_patterns).toEqual([]);
    expect(patch.rejected_patterns).toEqual([]);
    expect(patch.persona_style_preference).toEqual({});
    expect(patch.inferred_tags).toEqual([]);
  });

  it("personality YES → persona_style_preference + inferred_tag", () => {
    const patch = computeProfilePatch([
      answer("persona-careful-001", "careful", "personality", "yes"),
    ]);
    expect(patch.persona_style_preference["慎重派"]).toBeCloseTo(0.15, 5);
    expect(patch.inferred_tags).toContain("careful");
  });

  it("personality NO → 負の boost、tag は無し", () => {
    const patch = computeProfilePatch([
      answer("persona-optimistic-006", "optimistic", "personality", "no"),
    ]);
    expect(patch.persona_style_preference["楽観派"]).toBeCloseTo(-0.05, 5);
    expect(patch.inferred_tags).toEqual([]);
  });

  it("lifestyle YES → yes 側 tag (+ 弱い persona signal)", () => {
    const patch = computeProfilePatch([
      answer("life-morning_night-026", "morning_night", "lifestyle", "yes"),
    ]);
    expect(patch.inferred_tags).toContain("morning-person");
    expect(patch.persona_style_preference["楽観派"]).toBeCloseTo(0.03, 5);
  });

  it("lifestyle NO → no 側 tag (反対ラベル)", () => {
    const patch = computeProfilePatch([
      answer("life-morning_night-026", "morning_night", "lifestyle", "no"),
    ]);
    expect(patch.inferred_tags).toContain("night-owl");
    expect(patch.persona_style_preference).toEqual({});
  });

  it("interest YES → tag のみ", () => {
    const patch = computeProfilePatch([
      answer("int-music-047", "music", "interest", "yes"),
    ]);
    expect(patch.inferred_tags).toContain("music");
    expect(patch.persona_style_preference).toEqual({});
    expect(patch.accepted_patterns).toEqual([]);
  });

  it("persona_style_preference は累積 + [-1.0, 1.0] clip", () => {
    // careful 5 問の YES で 5 * 0.15 = 0.75
    const validAnswers = [
      "persona-careful-001",
      "persona-careful-002",
      "persona-careful-003",
      "persona-careful-004",
      "persona-careful-005",
    ].map((id) => answer(id, "careful", "personality", "yes"));
    // 3 回繰り返して累積 (clip 確認)
    const patch = computeProfilePatch([
      ...validAnswers,
      ...validAnswers,
      ...validAnswers,
    ]);
    expect(patch.persona_style_preference["慎重派"]).toBeLessThanOrEqual(1.0);
    expect(patch.persona_style_preference["慎重派"]).toBeGreaterThan(0.5);
  });

  it("inferred_tags は重複排除", () => {
    const patch = computeProfilePatch([
      answer("persona-careful-001", "careful", "personality", "yes"),
      answer("persona-careful-002", "careful", "personality", "yes"),
      answer("persona-careful-003", "careful", "personality", "yes"),
    ]);
    expect(patch.inferred_tags.filter((t) => t === "careful")).toHaveLength(1);
  });

  it("unknown ID は無視 (壊れた answers でも crash しない)", () => {
    const patch = computeProfilePatch([
      answer("nonexistent-id", "movie", "personality", "yes"),
    ]);
    expect(patch.persona_style_preference).toEqual({});
    expect(patch.inferred_tags).toEqual([]);
  });
});
