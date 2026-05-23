/**
 * useOnboarding — 新規ユーザ嗜好把握 (YES/NO 49 問) state hook.
 *
 * - 質問を順次出題 (順序固定、JSON 順)
 * - YES/NO 採択を内部 array に蓄積
 * - カテゴリ別に「signal の信頼度」を集計、一定以上で auto-complete
 * - skip ボタンでいつでも中断可能
 *
 * spec: aidlc-docs/audit.md "v3-β" entry。
 */
import { useCallback, useMemo, useState } from "react";
import payload from "./onboardingQuestions.generated.json";

// 2026-05-23 rev2: kind を 性格/生活/興味 に拡張 (旧 service/persona は deprecated だが
// JSON が古い場合に備えて union で両対応)
export type OnboardingKind =
  | "personality"
  | "lifestyle"
  | "interest"
  | "service" // legacy (旧 JSON 互換)
  | "persona"; // legacy

export interface OnboardingQuestion {
  id: string;
  text: string;
  kind: OnboardingKind;
  category: string;
  yes_signal: Record<string, unknown>;
  no_signal: Record<string, unknown>;
}

interface OnboardingPayload {
  generatedAt: string;
  generatedBy: string;
  schemaVersion: number;
  questions: OnboardingQuestion[];
}

const POOL = payload as unknown as OnboardingPayload;

export interface OnboardingAnswer {
  id: string;
  category: string;
  kind: OnboardingKind;
  choice: "yes" | "no";
  /** answered_at timestamp (ms) */
  at: number;
}

export interface OnboardingResult {
  /** これまで答えた answer 数 */
  answeredCount: number;
  /** 全 question pool size */
  totalCount: number;
  /** 現在の質問 (まだあれば。完了済 or skip 済なら null) */
  current: OnboardingQuestion | null;
  /** これまでの answer */
  answers: OnboardingAnswer[];
  /** 「ほぼ嗜好把握できた」と判定された (auto-complete or threshold 達成) */
  completed: boolean;
  /** カテゴリ別の信頼度 ({category: signal count}) */
  confidenceByCategory: Record<string, number>;
  /** YES の選択 (次質問に進む) */
  recordYes: () => void;
  /** NO の選択 (次質問に進む) */
  recordNo: () => void;
  /** いつでも skip (残り質問を放棄、completed=true 扱い) */
  skip: () => void;
  /** すべて reset (デバッグ / Profile 再設定用) */
  reset: () => void;
}

/**
 * 信頼度 threshold:
 *  - 6 カテゴリ以上で answer 数 >= 3、または
 *  - 総回答数 >= 25
 *  ならばユーザ嗜好を把握できたと判定し、UI は「もういい」を提示。
 */
const CATEGORY_CONFIDENCE_THRESHOLD = 3;
const CATEGORIES_NEEDED = 6;
const TOTAL_ANSWERS_THRESHOLD = 25;

export function useOnboarding(): OnboardingResult {
  const [answers, setAnswers] = useState<OnboardingAnswer[]>([]);
  const [skipped, setSkipped] = useState(false);

  const questions = POOL.questions;
  const answeredCount = answers.length;

  const confidenceByCategory = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const a of answers) {
      m[a.category] = (m[a.category] ?? 0) + 1;
    }
    return m;
  }, [answers]);

  const hasReachedConfidence = useMemo(() => {
    const filled = Object.values(confidenceByCategory).filter(
      (c) => c >= CATEGORY_CONFIDENCE_THRESHOLD,
    ).length;
    return filled >= CATEGORIES_NEEDED || answeredCount >= TOTAL_ANSWERS_THRESHOLD;
  }, [confidenceByCategory, answeredCount]);

  const completed = skipped || answeredCount >= questions.length;
  const current = completed
    ? null
    : questions[answeredCount] ?? null;

  const append = useCallback(
    (choice: "yes" | "no") => {
      const q = questions[answeredCount];
      if (!q) return;
      setAnswers((prev) => [
        ...prev,
        {
          id: q.id,
          category: q.category,
          kind: q.kind,
          choice,
          at: Date.now(),
        },
      ]);
    },
    [questions, answeredCount],
  );

  const recordYes = useCallback(() => append("yes"), [append]);
  const recordNo = useCallback(() => append("no"), [append]);
  const skip = useCallback(() => setSkipped(true), []);
  const reset = useCallback(() => {
    setAnswers([]);
    setSkipped(false);
  }, []);

  // hasReachedConfidence かつまだ skip していない場合は、UI で「もういい」を強調する
  // (この hook では情報を返すだけ、UI 側で利用)
  return {
    answeredCount,
    totalCount: questions.length,
    current,
    answers,
    completed: completed || (hasReachedConfidence && skipped),
    confidenceByCategory,
    recordYes,
    recordNo,
    skip,
    reset,
  };
}

export const ONBOARDING_TOTAL = POOL.questions.length;
