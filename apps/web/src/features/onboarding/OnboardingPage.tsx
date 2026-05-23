/**
 * OnboardingPage — 新規登録時の嗜好把握 (YES/NO スワイプ、合議で決定 と同じ UX).
 *
 * spec: aidlc-docs/audit.md "v3-β" entry。
 *
 * 動作:
 *  - useOnboarding hook で 1 問ずつ出題
 *  - SwipeChoice を再利用 (→ Yes / ← No / 上下 swipe は未使用)
 *  - 嗜好スコア (カテゴリ別 answer 数 >= 3 の category が 6+ に達したら) で
 *    「もう十分把握できました」CTA を強調
 *  - 「もういい」 button で常時 skip 可
 *  - 完了時に POST /v1/profiles/me/onboarding でサーバへ送信 → / にリダイレクト
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, SwipeChoice, useToast } from "@yesman/ui";
import { useApi } from "../../shell/ApiProvider";
import { useOnboarding } from "./useOnboarding";
import { computeProfilePatch } from "./onboardingSignals";
import { markOnboarded } from "./onboardingStorage";
import { getCurrentUser } from "../../shell/mockAuthStorage";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { push } = useToast();
  const onboarding = useOnboarding();
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const patch = computeProfilePatch(onboarding.answers);
      // 既存 PATCH /v1/preferences/me を再利用 (新規 endpoint 追加なし)
      await api.preferences.updateMe(patch);
    } catch (err) {
      // backend が落ちていても localStorage には残す + 通知
      try {
        window.localStorage.setItem(
          "yesman:onboarding:last-answers",
          JSON.stringify(onboarding.answers),
        );
      } catch {
        // ignore
      }
      push({
        message:
          "嗜好データのサーバ送信に失敗しました (ローカル保存のみ): " +
          String(err),
        variant: "info",
      });
    } finally {
      // v3-β rev3: 成否に関わらず per-user の onboarding 完了フラグを立てる
      // (skip でも user は明示的に「もう聞かないで」を選んでいるため、次回 sign-in で
      //  再度 /onboarding にリダイレクトされないようにする)
      const current = getCurrentUser();
      if (current?.sub) markOnboarded(current.sub);
      setSubmitting(false);
      navigate("/", { replace: true });
    }
  }, [api, navigate, onboarding.answers, push, submitting]);

  const handleYes = () => onboarding.recordYes();
  const handleNo = () => onboarding.recordNo();
  const handleSkip = () => {
    onboarding.skip();
    void submit();
  };

  // 信頼度が threshold に達したら「もういい」 CTA を強調
  const filledCategories = Object.values(onboarding.confidenceByCategory).filter(
    (c) => c >= 3,
  ).length;
  const confidenceEnough = filledCategories >= 6 || onboarding.answeredCount >= 25;

  // 完了 (全問 + skip 完了) なら submit を一度だけ自動発火し loading 表示
  if (onboarding.current === null && !submitting) {
    void submit();
  }

  if (submitting || onboarding.current === null) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="font-serif text-2xl text-neutral-700">
          🎉 嗜好を 記憶しました
        </p>
        <p className="text-sm italic text-neutral-500">
          Home へ 移動しています…
        </p>
      </div>
    );
  }

  const q = onboarding.current;
  const progress =
    `${onboarding.answeredCount + 1} / ${onboarding.totalCount}`;

  return (
    <div className="flex flex-col gap-4 py-2" data-testid="onboarding-page">
      <header className="flex flex-col items-center gap-1">
        <h1 className="font-serif text-2xl font-bold text-neutral-800">
          嗜好を 教えてください
        </h1>
        <p className="text-xs italic text-neutral-500">
          YesMan が あなた専用の 合議を つくります
        </p>
        <p
          className="text-xs font-medium text-brand-700"
          data-testid="onboarding-progress"
        >
          {progress}
        </p>
      </header>

      {/* 信頼度 progress bar */}
      <div className="px-4">
        <div className="h-2 rounded-full bg-neutral-100">
          <div
            className="h-2 rounded-full bg-brand-500 transition-all duration-300"
            style={{
              width: `${Math.min(100, (onboarding.answeredCount / 25) * 100)}%`,
            }}
            aria-label={`進捗 ${onboarding.answeredCount}/25 (確信ライン)`}
          />
        </div>
      </div>

      {/* 質問カード — SwipeChoice 再利用 (連続出題で hint は非表示) */}
      <SwipeChoice
        key={q.id} // 質問変わる度に internal state を強制 reset
        proposalText={q.text}
        onYes={handleYes}
        onNo={handleNo}
        showSwipeHint={false}
      >
        <article
          className="rounded-2xl border-2 border-neutral-800 bg-neutral-0 p-6 shadow-md flex flex-col items-center gap-3"
          data-testid={`onboarding-question-${q.id}`}
          aria-label="嗜好 質問"
        >
          <span
            className={
              q.kind === "service"
                ? "text-xs font-medium uppercase tracking-wide text-brand-600"
                : "text-xs font-medium uppercase tracking-wide text-warning"
            }
          >
            {q.kind === "service" ? "🎯 行動 傾向" : "🧠 人格 傾向"} ・{" "}
            {q.category}
          </span>
          <p className="font-serif text-xl font-bold text-neutral-900 text-center leading-relaxed">
            {q.text}
          </p>
        </article>
      </SwipeChoice>

      {/* スキップ + 確信ライン到達 CTA */}
      <div className="flex flex-col items-center gap-2 mt-2">
        {confidenceEnough && (
          <p className="text-xs italic text-success" role="status">
            ✓ ある程度 把握できました。 続けても、 ここで止めても OK
          </p>
        )}
        <Button
          variant={confidenceEnough ? "primary" : "muted"}
          size="md"
          onClick={handleSkip}
          disabled={submitting}
          aria-label="嗜好把握を 中断して Home へ"
          data-testid="onboarding-skip"
        >
          {confidenceEnough ? "もういい、 進む →" : "あとで やる (スキップ)"}
        </Button>
      </div>
    </div>
  );
}
