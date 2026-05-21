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

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
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
    <div className="flex flex-col gap-4 py-4">
      <h1 className="font-serif text-2xl font-bold text-center">
        YesMan にサインイン
      </h1>
      {env.authBypass && (
        <p className="text-sm text-neutral-600 text-center">
          メールアドレスを入力してサインインしてください。未登録のメールは自動で登録されます。
        </p>
      )}

      <Card>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Email</span>
            <Input
              type="email"
              aria-label="Email"
              placeholder="you@example.com"
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
            disabled={!emailValid || submitting}
            loading={submitting}
          >
            サインイン
          </Button>
        </form>
      </Card>

      {env.authBypass && (
        <>
          <div className="text-center text-xs text-neutral-500">
            ─────  または  ─────
          </div>
          <Card>
            <h2 className="font-serif font-semibold mb-3 text-sm">
              既存ユーザから選択
            </h2>
            {users.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
                <p className="italic text-neutral-500">まだ登録ユーザはいません</p>
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
                      className="w-full text-left rounded-xl border border-neutral-200 hover:border-brand-500 bg-neutral-0 px-3 py-2 flex justify-between items-center transition-colors disabled:opacity-50"
                      onClick={() => handleRowClick(u)}
                      disabled={submitting}
                    >
                      <span>
                        <span className="font-semibold text-sm block">{u.email}</span>
                        <span className="text-xs text-neutral-600">
                          {u.display_name ?? <span className="italic text-neutral-400">(表示名なし)</span>}
                        </span>
                      </span>
                      <span className="text-neutral-400">→</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
