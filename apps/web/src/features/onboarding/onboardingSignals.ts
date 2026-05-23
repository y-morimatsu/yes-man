/**
 * onboardingSignals.ts — answers から PreferenceProfile patch を計算する純粋関数.
 *
 * 2026-05-23 rev2: 性格 + 生活面 中心の question pool に対応.
 *  各 question の yes_signal / no_signal に含まれる field を読み取り、対応する
 *  PreferenceProfile field に反映する。signal field 仕様:
 *    - "persona_boost": Record<string, number>       → persona_style_preference に加算 + [-1,1] clip
 *    - "inferred_tag":  string                       → inferred_tags に追加 (重複排除)
 *    - "accepted_pattern_domain": string (legacy)    → accepted_patterns に追加
 *    - "rejected_pattern_domain": string (legacy)    → rejected_patterns に追加
 *  上記以外の key は無視 (将来拡張用)。
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
    if (!signal || typeof signal !== "object") continue;

    // 1) persona_boost field → persona_style_preference に加算
    const boostMap = (signal as { persona_boost?: Record<string, number> })
      .persona_boost;
    if (boostMap && typeof boostMap === "object") {
      for (const [name, delta] of Object.entries(boostMap)) {
        if (typeof delta === "number") {
          persona[name] = (persona[name] ?? 0) + delta;
        }
      }
    }

    // 2) inferred_tag field → inferred_tags に追加
    const tag = (signal as { inferred_tag?: string }).inferred_tag;
    if (typeof tag === "string" && tag.length > 0) {
      tagSet.add(tag);
    }

    // 3) accepted/rejected_pattern_domain field (legacy + interest 系で利用しうる)
    const acceptedDomain = (signal as { accepted_pattern_domain?: string })
      .accepted_pattern_domain;
    if (typeof acceptedDomain === "string" && acceptedDomain.length > 0) {
      accepted.push({
        domain: acceptedDomain,
        source: "onboarding",
        at: a.at,
      });
    }
    const rejectedDomain = (signal as { rejected_pattern_domain?: string })
      .rejected_pattern_domain;
    if (typeof rejectedDomain === "string" && rejectedDomain.length > 0) {
      rejected.push({
        domain: rejectedDomain,
        source: "onboarding",
        at: a.at,
      });
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
