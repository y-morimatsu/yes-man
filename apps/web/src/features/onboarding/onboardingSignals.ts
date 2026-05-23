/**
 * onboardingSignals.ts — answers から PreferenceProfile patch を計算する純粋関数.
 *
 * - service YES → accepted_patterns に {domain, source:"onboarding", timestamp} を append、
 *   inferred_tags にも category を追加 (重複排除)
 * - service NO → rejected_patterns に同上を append
 * - persona answer → persona_style_preference[persona名] += yes_signal.persona_boost
 *   (NO の場合は no_signal.persona_boost、通常 -0.05 等)
 * - persona_style_preference は [-1.0, 1.0] clip + max 50 key
 */
import type { OnboardingAnswer, OnboardingQuestion } from "./useOnboarding";
import payload from "./onboardingQuestions.generated.json";

interface JsonPayload {
  questions: OnboardingQuestion[];
}

const QUESTIONS: Map<string, OnboardingQuestion> = new Map(
  (payload as unknown as JsonPayload).questions.map((q) => [q.id, q]),
);

export interface PreferenceProfilePatch {
  accepted_patterns: Array<{
    domain: string;
    source: string;
    at: number;
  }>;
  rejected_patterns: Array<{
    domain: string;
    source: string;
    at: number;
  }>;
  persona_style_preference: Record<string, number>;
  inferred_tags: string[];
}

function clip(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeProfilePatch(
  answers: OnboardingAnswer[],
): PreferenceProfilePatch {
  const accepted: PreferenceProfilePatch["accepted_patterns"] = [];
  const rejected: PreferenceProfilePatch["rejected_patterns"] = [];
  const persona: Record<string, number> = {};
  const tagSet = new Set<string>();

  for (const a of answers) {
    const q = QUESTIONS.get(a.id);
    if (!q) continue;
    const signal = a.choice === "yes" ? q.yes_signal : q.no_signal;

    if (q.kind === "service") {
      const entry = {
        domain: q.category,
        source: "onboarding",
        at: a.at,
      };
      if (a.choice === "yes") {
        accepted.push(entry);
        const tag =
          (signal as { inferred_tag?: string }).inferred_tag ?? q.category;
        tagSet.add(tag);
      } else {
        rejected.push(entry);
      }
    } else if (q.kind === "persona") {
      const boostMap = (signal as { persona_boost?: Record<string, number> })
        .persona_boost;
      if (boostMap) {
        for (const [name, delta] of Object.entries(boostMap)) {
          persona[name] = (persona[name] ?? 0) + delta;
        }
      }
    }
  }

  // clip persona [-1, 1]
  for (const k of Object.keys(persona)) {
    persona[k] = clip(persona[k]!, -1, 1);
  }

  return {
    accepted_patterns: accepted.slice(0, 100),
    rejected_patterns: rejected.slice(0, 100),
    persona_style_preference: persona,
    inferred_tags: Array.from(tagSet).slice(0, 50),
  };
}
