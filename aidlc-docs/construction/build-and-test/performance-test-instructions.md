# Performance Test Instructions

**Phase**: CONSTRUCTION — Build and Test
**Created**: 2026-05-16
**Status**: 🟡 IN REVIEW
**Scope**: Load test (k6) + NFR Req PERF-* 実測検証

---

## 0. 前提

- 各 unit の NFR Req で目標値定義済
- Load test は **手動 trigger** (CI 常時実行せず、staging 環境向け)
- Mock LLM で API 層 throughput 計測が MVP scope、実 Bedrock は別 schedule

---

## 1. k6 install + 実行

### 1.1 install (local)

```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6

# Docker
docker run --rm -i grafana/k6 run - < tests/load/scenarios/decision-throughput.js
```

### 1.2 scenarios (U-Test FD §5、tests/load/scenarios/)

| ファイル | VU | duration | 目標 (NFR Req) |
|---|---|---|---|
| `decision-throughput.js` | 10 | 1 min | p95 < 5 sec、error < 1% (U4 PERF-U4-01) |
| `sse-concurrent.js` | 100 | iterations | p95 < 30 sec (U4 PERF-U4-04) |
| `persona-list.js` | 50 | 30 sec | p95 < 200 ms (U-Persona PERF-UP-03) |

### 1.3 実行

```bash
# Local Mock backend
k6 run tests/load/scenarios/decision-throughput.js

# Staging 環境
API_URL=https://api-staging.yesman.example.com \
  k6 run tests/load/scenarios/decision-throughput.js
```

---

## 2. CI workflow (manual trigger)

`.github/workflows/load-test.yml` で `workflow_dispatch`:

```yaml
inputs:
  scenario: decision-throughput | sse-concurrent | persona-list
  api_url: target API URL
```

GitHub UI から 「Actions → Load test → Run workflow」で trigger。

---

## 3. NFR PERF 目標値 (各 unit から集約)

### 3.1 Backend API

| ID | endpoint | 目標 | 計測方法 |
|---|---|---|---|
| PERF-U2-01 | DB query (single record) | p95 < 50 ms | API log + CloudWatch |
| PERF-U3-01 | JWT verify | p95 < 10 ms | API log |
| PERF-U4-01 | /decisions/request (Bedrock 経由) | p95 < 5 sec | k6 |
| PERF-U4-04 | SSE complete (合議完了) | p95 < 5 sec | k6 sse-concurrent |
| PERF-U5-01 | PreferenceLoader.load_for_prompt | p95 < 50 ms | API log |
| PERF-UP-03 | /personas/shared (cache hit) | p95 < 200 ms | k6 persona-list |
| PERF-U6-01 | /voice/tts (Polly) | p95 < 1.5 sec | API log |
| PERF-U6-03 | /voice/stt (Transcribe 3sec audio) | p95 < 15 sec | API log |

### 3.2 Frontend

| ID | 計測 | 目標 |
|---|---|---|
| PERF-U7a-03 | First Contentful Paint | < 2 sec | Lighthouse CI |
| PERF-U7a-04 | Largest Contentful Paint | < 3 sec | Lighthouse CI |
| PERF-U7a-05 | Time to Interactive | < 4 sec | Lighthouse CI |
| PERF-U7a-01 | main bundle size gzip | < 250 KB | size-limit (build-instructions §3.3) |
| PERF-U7c-01 | api-client bundle gzip | < 10 KB | size-limit |
| PERF-U7b-01 | ui bundle gzip | < 15 KB | size-limit |

---

## 4. Lighthouse CI (将来導入候補)

```yaml
# .github/workflows/lighthouse.yml (Phase 2)
- run: pnpm --filter @yesman/web preview &
- run: npx @lhci/cli@0.13.x autorun --collect.url=http://localhost:4173
```

`lighthouserc.js` で FCP/LCP/TTI 閾値設定、PR で score regression を検知。MVP では skip、Phase 2 で導入検討。

---

## 5. Backend internal latency 計測

CloudWatch Embedded Metric Format (EMF) / structlog で各 endpoint の `duration_ms` を出力 (U4 / U-Persona / U6 で実装済):

```python
# 例: U6 voice
logger.info(
    "voice.tts.completed",
    sub=user.sub,
    duration_ms=int(duration * 1000),
)
```

CloudWatch Logs Insights で集計、Metric Filter で CW Metric 化、Alarm で閾値超過検知 (U6 Infra Design §8.2)。

---

## 6. 受入基準

- [x] k6 3 scenarios 実行可能 (manual trigger)
- [x] 各 NFR Req PERF-* 目標値が文書化
- [x] size-limit で frontend bundle 自動 enforce
- [x] Backend latency は structlog + CloudWatch で post-deploy 観測可能
- [x] Lighthouse CI は Phase 2 candidate として明記
