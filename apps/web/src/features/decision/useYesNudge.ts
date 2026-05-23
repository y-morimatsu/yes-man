/**
 * useYesNudge — issue #93: No 採択 → 別案到着後の YES nudge microcopy を fetch.
 *
 * POST /v1/decisions/{id}/yes-nudge を呼び、LLM 生成 or fallback の microcopy 文字列を返す。
 * 同期 endpoint (~ 2s)、失敗時は backend が stage 別 fallback を返すので throw しない想定。
 * 万一例外時は message=null (banner 側で stage-based fallback)。
 */
import { useCallback, useRef, useState } from "react";
import { useApi } from "../../shell/ApiProvider";

export function useYesNudge() {
  const api = useApi();
  const [message, setMessage] = useState<string | null>(null);
  // 連続 No 中に重複 fetch が走った場合、最新だけを反映するため request id を管理
  const seqRef = useRef(0);

  const fetchOne = useCallback(
    async (decisionId: string, stage: number) => {
      const mySeq = ++seqRef.current;
      setMessage(null);
      try {
        const resp = await api.decisions.generateYesNudge(decisionId, {
          stage,
        });
        if (mySeq === seqRef.current) {
          setMessage(resp.message);
        }
      } catch {
        if (mySeq === seqRef.current) {
          setMessage(null);
        }
      }
    },
    [api],
  );

  const clear = useCallback(() => {
    seqRef.current++;
    setMessage(null);
  }, []);

  return { message, fetchOne, clear };
}
