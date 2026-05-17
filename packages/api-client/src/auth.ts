/**
 * TokenProvider — auth backend integration interface (NFR Design §4.1 + ultrathink Imp2).
 *
 * api-client は aws-amplify を直接 import しない (純粋 fetch wrapper).
 * Cognito 等の実装は consumer (apps/web) で TokenProvider を実装して inject する.
 */

export interface TokenProvider {
  /** 現在の token を取得、cached でも OK. */
  getToken(): Promise<string | null>;

  /**
   * 強制リフレッシュ. optional、未実装時は 401 で諦め (UI が再ログイン誘導).
   * 実装例: aws-amplify の fetchAuthSession({ forceRefresh: true })
   * 401 受け取り時に api-client が 1 回だけ呼ぶ (infinite loop 防止).
   */
  refresh?(): Promise<string | null>;
}
