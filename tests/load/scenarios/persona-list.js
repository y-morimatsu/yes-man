/**
 * Persona list load test (U-Test FD §5.1.3).
 *
 * VU 50 × 30 sec、共有プール listing の cache hit throughput.
 */
import http from "k6/http";
import { check } from "k6";

export const options = {
  vus: 50,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<200"],
    http_req_failed: ["rate<0.005"],
  },
};

const API = __ENV.API_URL || "http://localhost:8000";

export default function () {
  const res = http.get(`${API}/v1/personas/shared?page=0&page_size=20&sort=popularity`, {
    headers: { "X-Mock-User": "load-test-user" },
  });
  check(res, { "status 200": (r) => r.status === 200 });
}
