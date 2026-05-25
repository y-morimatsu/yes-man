# Workflow Plan — anonymous-strangers

> Adaptive AI-DLC workflow (Hackathon Pragmatism mode, single developer).

## Inception Phase

| Stage | 実行 | Depth | 理由 |
|---|---|---|---|
| Workspace Detection | ✅ 実施済 | Minimal | brownfield、aidlc-state.md 既存 |
| Reverse Engineering | ⏭ Skip | — | v0.4.0 + drill-down + onboarding は既知、再分析不要 |
| Requirements Analysis | ✅ 実施済 | Standard | [requirements.md](requirements.md) 参照 |
| User Stories | ✅ 実施済 | Standard | [user-stories.md](user-stories.md) 参照 |
| Workflow Planning | ✅ 本文書 | Standard | — |
| Application Design | ✅ 次 stage | Standard | [application-design.md](application-design.md) |
| Units Generation | ✅ 次 stage | Minimal (1 unit) | scope が小さいので単一 unit |

## Construction Phase (per-unit loop, unit 数 = 1)

| Stage | 実行 | Depth | 理由 |
|---|---|---|---|
| Functional Design | ⚠️ 軽量 | Minimal | application-design.md 内に統合 |
| NFR Requirements | ⏭ Skip | — | requirements.md NFR セクションで充足 |
| NFR Design | ⏭ Skip | — | 既存 keyframe / accessibility 方針踏襲 |
| Infrastructure Design | ⏭ Skip | — | mock backend、infrastructure 変更なし |
| Code Generation | ✅ | — | [units-decomposition.md](units-decomposition.md) の plan に従う |

## Build and Test Stage

| 項目 | 実行 |
|---|---|
| Build instructions | 既存 `pnpm build` / `cd apps/api && pnpm start:dev` を踏襲 |
| Unit test instructions | 新規 component / hook / signal 関数の vitest を追加 |
| Integration test | SSE + persona pool API の handshake を pytest で確認 |
| Performance test | ⏭ Skip (既存と同等の SSE 性能) |
| E2E test | Playwright mobile-chrome に新規 spec 追加 (anonymous-strangers flow) |

## Operations Phase

⏭ Placeholder (ハッカソンスコープ外)

## Decision: 進め方

- **ハッカソン Pragmatism**: 単独開発、PR review は省略可。e2e + unit tests は必須 green
- **アイデア検証期**: develop / main へは絶対 merge しない (user 明示許可待ち)
- **branch**: `feature/next-spec-ideas-anonymous-strangers` 内で完結
- **commit**: Conventional Commits、`feat(web)` / `feat(api)` / `feat(ui)` scope を使う
- **Co-Authored-By trailer**: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` を付与
