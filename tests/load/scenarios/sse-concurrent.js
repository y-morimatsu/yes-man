/**
 * SSE concurrent connections load test (U-Test FD §5.1.2).
 *
 * VU 100 同時 SSE 接続、event 受信完了まで.
 * Note: k6 native SSE support 限定的、http.post で streaming body 受信を行う.
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 100,
  iterations: 100,
  thresholds: {
    iteration_duration: ["p(95)<30000"],
  },
};

const API = __ENV.API_URL || "http://localhost:8000";

export default function () {
  // SSE streaming response、body 全体取得まで block
  const res = http.post(
    `${API}/v1/decisions/request/stream`,
    JSON.stringify({ user_input: "concurrent test" }),
    {
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      timeout: "30s",
    },
  );
  check(res, {
    "stream succeeded": (r) => r.status === 200,
    "received events": (r) => (r.body || "").includes("event: "),
  });
}
