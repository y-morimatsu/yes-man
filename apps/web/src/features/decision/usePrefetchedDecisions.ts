/**
 * usePrefetchedDecisions — No 採択時の待ち時間を消すため、合議結果を裏で先取得して buffer に貯める.
 *
 * 用途:
 *   - 初回 proposal 表示後、同じ user_input で N 個の代替案を裏で先 stream
 *   - No 採択時、buffer から先頭を pop して即座に画面 swap (loading 演出なし)
 *   - pop 後、補充のため次の prefetch を起動 (上限 bufferSize まで)
 *
 * 設計上の判断:
 *   - useDecisionStream は callback ref ベースで per-instance 1 stream しか持てない
 *     ため、ここでは api.decisions.streamRequest を直接呼ぶ
 *   - prefetch 中の AbortController を array で保持し、clear() で全 abort
 *   - 並列度は inflight + buffer.length で制限 (bufferSize 上限超過しない)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@yesman/api-client";
import { useApi } from "../../shell/ApiProvider";
import type { Utterance } from "./reducer";

export interface BufferedDecision {
  decisionId: string;
  utterances: Utterance[];
  proposal: string;
}

export interface UsePrefetchedDecisionsOptions {
  /** buffer に貯める合議結果の最大数 (default 2) */
  bufferSize?: number;
}

export interface UsePrefetchedDecisionsResult {
  buffer: BufferedDecision[];
  /** 現在 in-flight な prefetch 数 (buffer 未到達分) */
  inflight: number;
  /** 同じ user_input で 1 件追加 prefetch を起動 (上限超過なら no-op) */
  prefetchOne: (userInput: string) => void;
  /** buffer 先頭を取り出して返す (なければ null) */
  pop: () => BufferedDecision | null;
  /** buffer と in-flight prefetch を全クリア */
  clear: () => void;
}

export function usePrefetchedDecisions(
  options: UsePrefetchedDecisionsOptions = {},
): UsePrefetchedDecisionsResult {
  const { bufferSize = 2 } = options;
  const api = useApi();

  const [buffer, setBuffer] = useState<BufferedDecision[]>([]);
  const bufferRef = useRef<BufferedDecision[]>([]);
  bufferRef.current = buffer;

  const inflightRef = useRef<Set<AbortController>>(new Set());
  const [inflightSize, setInflightSize] = useState(0);

  const refreshInflightCount = () => {
    setInflightSize(inflightRef.current.size);
  };

  const prefetchOne = useCallback(
    (userInput: string) => {
      const occupied = bufferRef.current.length + inflightRef.current.size;
      if (occupied >= bufferSize) return;

      const abort = new AbortController();
      inflightRef.current.add(abort);
      refreshInflightCount();

      const run = async () => {
        let decisionId: string | null = null;
        let proposal: string | null = null;
        const utterances: Utterance[] = [];

        try {
          const stream = api.decisions.streamRequest({ user_input: userInput });
          for await (const event of stream.events(abort.signal)) {
            switch (event.type) {
              case "start":
                decisionId = event.data.decision_id;
                break;
              case "utterance":
                utterances.push({ ...event.data, done: true });
                break;
              case "proposal":
                proposal = event.data.proposal_text;
                break;
              case "complete":
                if (decisionId !== null && proposal !== null) {
                  const completed: BufferedDecision = {
                    decisionId,
                    utterances,
                    proposal,
                  };
                  setBuffer((prev) => {
                    // 並列 completion 時の上限超過を防ぐ
                    if (prev.length >= bufferSize) return prev;
                    return [...prev, completed];
                  });
                }
                break;
              case "silence":
                // 沈黙ドメインは buffer に入れない (silenced state は main flow で表示)
                break;
              case "error":
                // prefetch エラーは silent fail (UX 影響なし)
                break;
            }
          }
        } catch (err) {
          if (err instanceof ApiError && err.is("request_aborted")) {
            // 正常な abort、無視
          }
          // それ以外も silent: 表に出すと UX 悪化
        } finally {
          inflightRef.current.delete(abort);
          refreshInflightCount();
        }
      };

      void run();
    },
    [api, bufferSize],
  );

  const pop = useCallback((): BufferedDecision | null => {
    const head = bufferRef.current[0];
    if (head === undefined) return null;
    setBuffer((prev) => prev.slice(1));
    return head;
  }, []);

  const clear = useCallback(() => {
    inflightRef.current.forEach((a) => a.abort());
    inflightRef.current.clear();
    refreshInflightCount();
    setBuffer([]);
  }, []);

  // unmount 時に in-flight prefetch を全 abort
  useEffect(() => {
    return () => {
      inflightRef.current.forEach((a) => a.abort());
      inflightRef.current.clear();
    };
  }, []);

  return { buffer, inflight: inflightSize, prefetchOne, pop, clear };
}
