/**
 * auth.ts — Cognito integration (FD §3 + ultrathink I1 + Imp1).
 *
 * - configureAuth() を main.tsx で明示的に呼ぶ (副作用フリー、test 環境で skip 可能)
 * - aws-amplify v6 subpath imports で tree-shake
 */
import { Amplify } from "aws-amplify";
import { fetchAuthSession, signInWithRedirect, signOut } from "aws-amplify/auth";
import type { TokenProvider } from "@yesman/api-client";
import { env } from "./env";
import * as mockAuthStorage from "./mockAuthStorage";
import { clearUnifiedSelection } from "../features/persona/unifiedSelectionStorage";

export function configureAuth(): void {
  // bypass mode (e2e / dev) では Amplify を初期化しない (fake Cognito domain で接続試行を回避)
  if (env.authBypass) return;
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: env.cognitoUserPoolId,
        userPoolClientId: env.cognitoAppClientId,
        loginWith: {
          oauth: {
            domain: env.cognitoHostedUiUrl.replace(/^https?:\/\//, ""),
            scopes: ["openid", "email", "profile"],
            redirectSignIn: [`${window.location.origin}/auth/callback`],
            redirectSignOut: [window.location.origin],
            responseType: "code",
          },
        },
      },
    },
  });
}

/** bypass mode で API に送る Bearer を構築する.
 *  `mock-user:<base64url(JSON{sub, email})>` 形式。API MockAuthAdapter が token を解釈し
 *  含まれる sub/email をそのまま AuthenticatedUser として返す → multi-user 化が成立.
 *  未サインインなら null (middleware が MOCK_AUTO_USER で env 固定 user に fallback).
 */
function buildBypassToken(): string | null {
  const user = mockAuthStorage.getCurrentUser();
  if (!user) return null;
  const json = JSON.stringify({ sub: user.sub, email: user.email });
  // base64url (no padding) — API 側 `base64.urlsafe_b64decode` と整合
  const b64 = btoa(json).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `mock-user:${b64}`;
}

export class CognitoTokenProvider implements TokenProvider {
  async getToken(): Promise<string | null> {
    if (env.authBypass) return buildBypassToken();
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  }

  async refresh(): Promise<string | null> {
    if (env.authBypass) return buildBypassToken();
    const session = await fetchAuthSession({ forceRefresh: true });
    return session.tokens?.idToken?.toString() ?? null;
  }
}

export async function signIn(email?: string): Promise<void> {
  if (env.authBypass) {
    if (!email) return; // SignInPage は email 必須で呼ぶ
    mockAuthStorage.registerUser(email);
    mockAuthStorage.setCurrentEmail(email);
    return;
  }
  await signInWithRedirect();
}

export async function signOutUser(): Promise<void> {
  // ペルソナ選択 (localStorage) を消して、同一ブラウザで次に登録/ログインした
  // user が前 user の選択を引き継がず、builtin 3 のデフォルト選択から始まるようにする。
  clearUnifiedSelection();
  if (env.authBypass) {
    mockAuthStorage.clearCurrent();
    return;
  }
  await signOut({ global: false });
}
