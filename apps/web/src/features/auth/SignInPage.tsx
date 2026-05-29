/**
 * SignInPage — bypass mode で email 入力 / 既存ユーザ row click でサインイン.
 *
 * spec: docs/superpowers/specs/2026-05-20-mock-auth-design.md
 * - bypass mode: form / row click → mockAuthStorage 経由でサインイン → navigate
 * - real Cognito mode: Cognito Hosted UI へ redirect (既存挙動)
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useToast } from "@yesman/ui";
import { signIn } from "../../shell/auth";
import { useAuth } from "../../shell/AuthProvider";
import { env } from "../../shell/env";
import { listUsers, updateDisplayName, type MockUser } from "../../shell/mockAuthStorage";
import { hasOnboarded } from "../onboarding/onboardingStorage";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_MAX = 50;

export default function SignInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { push } = useToast();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [users, setUsers] = useState<MockUser[]>(() => listUsers());
  const [submitting, setSubmitting] = useState(false);

  const rawFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
  // 「ログイン後の着地は Home ではなく 合議で決定」が default 体験。
  // 未認証で /score など特定 page にアクセスして redirect されたケースは元 path を尊重する。
  const from = rawFrom === "/" ? "/decision" : rawFrom;
  const emailValid = EMAIL_REGEX.test(email.trim());

  const proceedAfterSignIn = async () => {
    await refresh();
    setUsers(listUsers());
    navigate(from, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid || submitting) return;
    setSubmitting(true);
    try {
      if (!env.authBypass) {
        sessionStorage.setItem("yesman:redirect-to", from);
        await signIn(); // Cognito redirect
        return;
      }
      // bypass: email を渡して自動登録 + サインイン (display_name は新規時のみ後追いセット)
      const normalizedEmail = email.trim().toLowerCase();
      await signIn(email);
      if (displayName.trim()) {
        // registerUser は idempotent で display_name を上書きしない設計のため、
        // 別 API (updateDisplayName) で「未設定のときだけ埋める」
        updateDisplayName(normalizedEmail, displayName);
      }
      // v3-β rev3: per-user で onboarding 完了済かを判定 (browser-wide flag を撤廃、
      // 同ブラウザで複数 user が新規登録 / 再登録 でも各自 onboarding に通す).
      // hasOnboarded(sub) が false かつ default flow (rawFrom = "/") の場合のみ /onboarding。
      const currentUser = listUsers().find((u) => u.email === normalizedEmail);
      const needsOnboarding =
        !!currentUser && !hasOnboarded(currentUser.sub);
      if (needsOnboarding && rawFrom === "/") {
        await refresh();
        setUsers(listUsers());
        navigate("/onboarding", { replace: true });
      } else {
        await proceedAfterSignIn();
      }
    } catch (err) {
      push({ message: `サインインに失敗しました: ${String(err)}`, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRowClick = async (user: MockUser) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await signIn(user.email);
      // v3-β rev3: 既存 user でも onboarding 未完了なら /onboarding に飛ばす
      // (前回 skip で中断したケースをすくう)
      if (!hasOnboarded(user.sub) && rawFrom === "/") {
        await refresh();
        setUsers(listUsers());
        navigate("/onboarding", { replace: true });
      } else {
        await proceedAfterSignIn();
      }
    } catch (err) {
      push({ message: `サインインに失敗しました: ${String(err)}`, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // 2026-05-24 v2: iPhone SE (375×667) / 12 Pro (390×844) で notch safe-area 込みで scroll なし fit.
    // - users list は max-h を viewport-based に動的 cap + 内部 scroll
    // - 説明文・margin を最小化
    <div
      className="flex flex-col gap-2 py-1 splash-fade-in h-full"
      style={{ animationDelay: "0ms" }}
    >
      {/* auth-bar — mockup-anonymous-strangers §2 準拠 (22px umber + opacity 0.7).
          heading と同サイズだが opacity で視覚的に弱める設計. */}
      <div className="flex items-center -mt-1">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="戻る"
          className="text-[22px] leading-none active:opacity-50 px-2 py-1"
          style={{ color: "#2E2418", opacity: 0.7 }}
        >
          ‹
        </button>
      </div>

      <h1
        className="font-sans text-[22px] font-bold tracking-[0.02em] px-3.5"
        style={{ color: "#2E2418" }}
      >
        はじめましょう。
      </h1>

      {/* mockup-anonymous-strangers §2 auth-field 構造: cream-lt カード + tracking 0.18em label + umber input.
          px-3.5 で auth-body の 26px に近い 30px インセット (Layout px-4 + 14px). */}
      <form className="flex flex-col gap-3.5 px-3.5" onSubmit={handleSubmit}>
        <label
          className="block rounded-xl px-3.5 py-2.5"
          style={{
            background: "#FFFCF4",
            border: "0.5px solid rgba(46, 36, 24, 0.15)",
          }}
        >
          <span
            className="block text-[9px] tracking-[0.18em] mb-0.5"
            style={{ color: "rgba(46, 36, 24, 0.55)" }}
          >
            メールアドレス
          </span>
          <input
            type="email"
            aria-label="メールアドレス"
            placeholder="you@example.com"
            className="w-full bg-transparent outline-none text-[13px]"
            style={{ color: "#2E2418" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        {env.authBypass && (
          <label
            className="block rounded-xl px-3.5 py-2.5"
            style={{
              background: "#FFFCF4",
              border: "0.5px solid rgba(46, 36, 24, 0.15)",
            }}
          >
            <span
              className="block text-[9px] tracking-[0.18em] mb-0.5"
              style={{ color: "rgba(46, 36, 24, 0.55)" }}
            >
              表示名 (任意)
            </span>
            <input
              type="text"
              aria-label="表示名"
              className="w-full bg-transparent outline-none text-[13px]"
              style={{ color: "#2E2418" }}
              maxLength={DISPLAY_NAME_MAX}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
        )}

        {/* enabled = umber + cream / disabled = umber を低 alpha で warm beige 合成.
            opacity-50 だと泥色になるため、状態別に明示的な色を当てる. */}
        <button
          type="submit"
          disabled={!emailValid || submitting}
          className="w-full rounded-full py-3 text-[13px] font-medium tracking-[0.05em] transition-colors hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:hover:opacity-100 mt-1"
          style={{
            background:
              emailValid && !submitting ? "#2E2418" : "rgba(46, 36, 24, 0.15)",
            color:
              emailValid && !submitting ? "#F2EEE2" : "rgba(46, 36, 24, 0.55)",
            letterSpacing: "0.05em",
          }}
        >
          {submitting ? "..." : "続ける"}
        </button>
      </form>

      {env.authBypass && (
        <div className="flex flex-col min-h-0 flex-1 mt-4 px-3.5">
          <div className="flex items-center gap-2 mb-4">
            <hr className="flex-1" style={{ borderColor: "rgba(46, 36, 24, 0.15)" }} />
            <p className="text-[10px]" style={{ color: "rgba(46, 36, 24, 0.55)" }}>前回ログインしたユーザ</p>
            <hr className="flex-1" style={{ borderColor: "rgba(46, 36, 24, 0.15)" }} />
          </div>
          {users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-2 text-center">
              <p className="text-neutral-500 text-[11px]">
                まだ登録ユーザはいません
              </p>
            </div>
          ) : (
            // flex-1 + min-h-0 で残り垂直空間に fit、内部 scroll.
            <ul className="flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto pr-1">
              {users.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className="
                      w-full text-left rounded-lg border border-neutral-200
                      px-2.5 py-1.5 flex justify-between items-center
                      hover:border-[#E8775A] hover:bg-neutral-50
                      transition-colors disabled:opacity-50
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8775A]/40
                    "
                    onClick={() => handleRowClick(u)}
                    disabled={submitting}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium text-neutral-700 truncate">
                        {u.email}
                      </span>
                      {u.display_name && (
                        <span className="block text-[10px] text-neutral-500 truncate">
                          {u.display_name}
                        </span>
                      )}
                    </span>
                    <span className="text-neutral-300 ml-2 shrink-0 text-xs" aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
