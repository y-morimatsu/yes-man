/**
 * Decision throughput load test (U-Test FD §5.1.1).
 *
 * VU 10 × 1 min、Mock LLM 経由で API 層 throughput 計測.
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 10,
  duration: "1m",
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    http_req_failed: ["rate<0.01"],
  },
};

const API = __ENV.API_URL || "http://localhost:8000";

export default function () {
  const res = http.post(
    `${API}/v1/decisions/request`,
    JSON.stringify({ user_input: "load test" }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Mock-User": "load-test-user",
      },
    },
  );
  check(res, {
    "status 200": (r) => r.status === 200,
    "has decision_id": (r) => {
      try {
        return JSON.parse(r.body).decision_id != null;
      } catch {
        return false;
      }
    },
  });
}
