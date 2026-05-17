# tests/load — k6 Load tests (手動 trigger)

## 実行

```bash
# Local (Mock LLM、API 層 throughput)
k6 run tests/load/scenarios/decision-throughput.js

# Staging 環境 (実 Bedrock LLM、別 schedule)
API_URL=https://api-staging.yesman.example.com k6 run tests/load/scenarios/decision-throughput.js
```

## CI

`.github/workflows/load-test.yml` で `workflow_dispatch` 手動 trigger、scenario 名を input で指定。

## scenarios

| ファイル | VU | duration | 目標 |
|---|---|---|---|
| `decision-throughput.js` | 10 | 1 min | p95 < 5 sec、error < 1% |
| `sse-concurrent.js` | 100 | iterations | iteration p95 < 30 sec |
| `persona-list.js` | 50 | 30 sec | p95 < 200 ms、error < 0.5% |
