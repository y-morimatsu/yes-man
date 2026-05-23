/**
 * onboardingSignals.test.ts — answers → PreferenceProfile patch 変換の検証.
 */
import { describe, expect, it } from "vitest";
import { computeProfilePatch } from "../../../src/features/onboarding/onboardingSignals";
import type { OnboardingAnswer } from "../../../src/features/onboarding/useOnboarding";

// 注: ID は generated JSON の実 ID と一致させる必要あり (fallback 版が svc-* / persona-* 形式)
function answer(
  id: string,
  category: string,
  kind: "service" | "persona",
  choice: "yes" | "no",
): OnboardingAnswer {
  return { id, category, kind, choice, at: 1_700_000_000_000 };
}

describe("computeProfilePatch", () => {
  it("空 answers から空 patch", () => {
    const patch = computeProfilePatch([]);
    expect(patch.accepted_patterns).toEqual([]);
    expect(patch.rejected_patterns).toEqual([]);
    expect(patch.persona_style_preference).toEqual({});
    expect(patch.inferred_tags).toEqual([]);
  });

  it("service YES → accepted_patterns + inferred_tags に追加", () => {
    const patch = computeProfilePatch([
      answer("svc-movie-001", "movie", "service", "yes"),
    ]);
    expect(patch.accepted_patterns).toHaveLength(1);
    expect(patch.accepted_patterns[0]!.domain).toBe("movie");
    expect(patch.accepted_patterns[0]!.source).toBe("onboarding");
    expect(patch.inferred_tags).toContain("movie");
    expect(patch.rejected_patterns).toEqual([]);
  });

  it("service NO → rejected_patterns に追加、inferred_tags に追加しない", () => {
    const patch = computeProfilePatch([
      answer("svc-food_delivery-005", "food_delivery", "service", "no"),
    ]);
    expect(patch.rejected_patterns).toHaveLength(1);
    expect(patch.rejected_patterns[0]!.domain).toBe("food_delivery");
    expect(patch.accepted_patterns).toEqual([]);
    expect(patch.inferred_tags).toEqual([]);
  });

  it("persona YES → persona_style_preference に boost", () => {
    const patch = computeProfilePatch([
      answer("persona-careful-036", "careful", "persona", "yes"),
    ]);
    expect(patch.persona_style_preference["慎重派"]).toBeCloseTo(0.15, 5);
  });

  it("persona NO → persona_style_preference に負の boost", () => {
    const patch = computeProfilePatch([
      answer("persona-optimistic-041", "optimistic", "persona", "no"),
    ]);
    expect(patch.persona_style_preference["楽観派"]).toBeCloseTo(-0.05, 5);
  });

  it("persona_style_preference は累積 + [-1.0, 1.0] clip", () => {
    // 7 回 YES で 7 * 0.15 = 1.05、clip で 1.0 になることを確認
    const answers = Array.from({ length: 7 }, (_, i) =>
      answer(`persona-careful-${36 + i}`, "careful", "persona", "yes"),
    );
    // 注: ID が pool に存在しない 7 件目以降は無視されるので、known IDs だけ使う
    const knownIds = [
      "persona-careful-036",
      "persona-careful-037",
      "persona-careful-038",
      "persona-careful-039",
      "persona-careful-040",
    ];
    const validAnswers = knownIds.map((id) =>
      answer(id, "careful", "persona", "yes"),
    );
    const patch = computeProfilePatch([
      ...validAnswers,
      ...validAnswers,
      ...validAnswers,
    ]); // 15 回 yes → 2.25 → clip 1.0
    void answers; // shadowed but not used
    expect(patch.persona_style_preference["慎重派"]).toBeLessThanOrEqual(1.0);
    expect(patch.persona_style_preference["慎重派"]).toBeGreaterThan(0.5);
  });

  it("inferred_tags は重複排除", () => {
    const patch = computeProfilePatch([
      answer("svc-movie-001", "movie", "service", "yes"),
      answer("svc-movie-002", "movie", "service", "yes"),
      answer("svc-movie-003", "movie", "service", "yes"),
    ]);
    expect(patch.inferred_tags.filter((t) => t === "movie")).toHaveLength(1);
    expect(patch.accepted_patterns).toHaveLength(3);
  });

  it("unknown ID は無視 (壊れた answers でも crash しない)", () => {
    const patch = computeProfilePatch([
      answer("nonexistent-id", "movie", "service", "yes"),
    ]);
    expect(patch.accepted_patterns).toEqual([]);
    expect(patch.inferred_tags).toEqual([]);
  });
});
