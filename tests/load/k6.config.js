/**
 * k6 global config (U-Test NFR Design §5).
 *
 * 各 scenario file が独自 options を持つが、共通閾値は thresholds で.
 */
export const COMMON_THRESHOLDS = {
  http_req_duration: ["p(95)<5000"],
  http_req_failed: ["rate<0.01"],
};
