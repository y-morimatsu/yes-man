/** SignInPage — Cognito Hosted UI redirect (FD §5.4). */
import { useLocation } from "react-router-dom";
import { Button } from "@yesman/ui";
import { signIn } from "../../shell/auth";

export default function SignInPage() {
  const location = useLocation();
  // location.state.from は RequireAuth で保持された元 page、CallbackPage で復帰に使用
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";

  const handleSignIn = async () => {
    // sign-in redirect 前に session storage で from を保存 (Cognito redirect で state object が失われるため)
    sessionStorage.setItem("yesman:redirect-to", from);
    await signIn();
  };

  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <h1 className="font-serif text-2xl font-bold">YesMan にサインイン</h1>
      <p className="text-neutral-600">続けるには Cognito でサインインしてください。</p>
      <Button variant="primary" size="lg" onClick={handleSignIn}>
        サインイン
      </Button>
    </div>
  );
}
