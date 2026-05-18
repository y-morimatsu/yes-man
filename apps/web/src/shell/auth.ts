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

export class CognitoTokenProvider implements TokenProvider {
  async getToken(): Promise<string | null> {
    if (env.authBypass) return null;
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  }

  async refresh(): Promise<string | null> {
    if (env.authBypass) return null;
    const session = await fetchAuthSession({ forceRefresh: true });
    return session.tokens?.idToken?.toString() ?? null;
  }
}

export async function signIn(): Promise<void> {
  if (env.authBypass) return;
  await signInWithRedirect();
}

export async function signOutUser(): Promise<void> {
  if (env.authBypass) return;
  await signOut({ global: false });
}
