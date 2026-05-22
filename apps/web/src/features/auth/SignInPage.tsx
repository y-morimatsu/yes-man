/**
 * SignInPage — bypass mode で email 入力 / 既存ユーザ row click でサインイン.
 *
 * spec: docs/superpowers/specs/2026-05-20-mock-auth-design.md
 * - bypass mode: form / row click → mockAuthStorage 経由でサインイン → navigate
 * - real Cognito mode: Cognito Hosted UI へ redirect (既存挙動)
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Card, Input, useToast } from "@yesman/ui";
import { signIn } from "../../shell/auth";
import { useAuth } from "../../shell/AuthProvider";
import { env } from "../../shell/env";
import { listUsers, updateDisplayName, type MockUser } from "../../shell/mockAuthStorage";

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
      await proceedAfterSignIn();
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
      await proceedAfterSignIn();
    } catch (err) {
      push({ message: `サインインに失敗しました: ${String(err)}`, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-4 py-4 splash-fade-in"
      style={{ animationDelay: "0ms" }}
    >
      <div className="text-center mb-8">
        <p className="font-serif text-2xl text-neutral-700/70" aria-hidden="true">
          🪞 YesMan
        </p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-neutral-800">
          サインイン
        </h1>
        {env.authBypass && (
          <p className="mt-2 text-sm text-neutral-600">
            メールアドレスでサインインしてください。
            <br />
            未登録のメールは自動で登録されます。
          </p>
        )}
      </div>

      <Card className="border-[#E0D5BC] shadow-[0_4px_16px_rgba(212,165,93,0.08)]">
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Email</span>
            <Input
              type="email"
              aria-label="Email"
              placeholder="you@example.com"
              className="h-12 rounded-xl border-[#E0D5BC] focus:ring-2 focus:ring-[#E8775A]/40 focus:border-[#E8775A]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {env.authBypass && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">表示名 (新規登録時のみ・任意)</span>
              <Input
                type="text"
                aria-label="表示名"
                className="h-12 rounded-xl border-[#E0D5BC] focus:ring-2 focus:ring-[#E8775A]/40 focus:border-[#E8775A]"
                maxLength={DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="h-12 rounded-xl bg-[#E8775A] hover:bg-[#D66547] shadow-[0_4px_12px_rgba(232,119,90,0.25)] hover:shadow-[0_6px_16px_rgba(232,119,90,0.35)] transition-all duration-150"
            disabled={!emailValid || submitting}
            loading={submitting}
          >
            サインイン
          </Button>
        </form>
      </Card>

      {env.authBypass && (
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-3">
            <hr className="flex-1 border-[#E0D5BC]" />
            <p className="text-xs text-neutral-500">前回サインインしたユーザ</p>
            <hr className="flex-1 border-[#E0D5BC]" />
          </div>
          {users.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
              <p className="italic text-neutral-500 text-sm">まだ登録ユーザはいません</p>
              <p className="text-xs text-neutral-400 mt-1">
                上のフォームから新規登録できます
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {users.map((u) => (
                <li key={u.email}>
                  <button
                    type="button"
                    className="
                      w-full text-left rounded-xl border border-neutral-200
                      px-4 py-3 flex justify-between items-center
                      hover:border-[#E8775A] hover:bg-neutral-50
                      transition-colors disabled:opacity-50
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8775A]/40
                    "
                    onClick={() => handleRowClick(u)}
                    disabled={submitting}
                  >
                    <span>
                      <span className="block text-sm font-medium text-neutral-700">
                        {u.email}
                      </span>
                      <span className="block text-xs text-neutral-500 mt-0.5">
                        {u.display_name ?? (
                          <span className="italic text-neutral-400">(表示名なし)</span>
                        )}
                      </span>
                    </span>
                    <span className="text-neutral-300" aria-hidden="true">→</span>
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
