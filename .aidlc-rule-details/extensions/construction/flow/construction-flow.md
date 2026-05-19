# Construction Flow Rules

## Overview

These construction-flow rules adapt the orchestrated multi-agent workflow from Anthropic's [`feature-dev`](https://github.com/anthropics/claude-code/tree/main/plugins/feature-dev) plugin into AI-DLC native constraints for the Construction phase. They augment (not replace) `construction/code-generation.md` by mandating codebase exploration, multi-approach design, clarifying questions, and high-precision review with parallel sub-agent execution via Claude Code's Agent tool.

The intent is to translate feature-dev's procedural 7-phase workflow into rule-based constraints that AI-DLC's stage-completion compliance check can verify.

**Enforcement**: At the Code Generation stage of each unit (`construction/code-generation.md` Part 1 Planning and Part 2 Generation), the model MUST verify compliance with these rules before presenting the stage completion message to the user.

### Blocking CONS-FLOW Finding Behavior

A **blocking CONS-FLOW finding** means:
1. The finding MUST be listed in the stage completion message under a "Construction Flow Findings" section with the CONS-FLOW rule ID and description
2. The stage MUST NOT present the "Continue to Next Stage" option until all blocking findings are resolved
3. The model MUST present only the "Request Changes" option with a clear explanation of what needs to change
4. The finding MUST be logged in `aidlc-docs/audit.md` with the CONS-FLOW rule ID, description, and stage context

If a CONS-FLOW rule is not applicable to the current unit (e.g., CONS-FLOW-02 when the change is a trivial typo fix), mark it as **N/A** in the compliance summary — this is not a blocking finding. The rationale for N/A MUST be brief and specific (not "Not applicable").

### Default Enforcement

All rules in this document are **blocking** by default. If any rule's verification criteria are not met, it is a blocking CONS-FLOW finding — follow the blocking finding behavior defined above.

### Partial Enforcement Mode

If the user selected **Partial** enforcement during opt-in, only rules CONS-FLOW-01, CONS-FLOW-03, and CONS-FLOW-05 are enforced. All other rules are treated as advisory (non-blocking). Log the enforcement mode in `aidlc-docs/aidlc-state.md` under `## Extension Configuration` with the format `Construction Flow | Partial | …`.

### Verification Criteria Format

Verification items in this document are plain bullet points describing compliance checks. They are distinct from the `- [ ]` / `- [x]` progress-tracking checkboxes used in stage plan files. Each item should be evaluated as compliant or non-compliant during review.

### Relationship to Other Extensions

CONS-FLOW rules cross-reference yesman-impl rules (see related Issue #3) where applicable. When a CONS-FLOW-05 review finding maps to a yesman-impl rule, prefer the yesman-impl `rule_id` (e.g., `UI-04`, `BS-02`) over an ad-hoc description.

---

## Rule CONS-FLOW-01: Codebase Exploration as Prerequisite to Plan

**Rule**: Before producing the Code Generation Plan (`construction/code-generation.md` Part 1), the model MUST conduct codebase exploration that identifies:
- **Existing patterns to reuse** — cite by `path:line` (e.g., `apps/api/src/yesman_api/infrastructure/persistence/factory.py:78`)
- **Adjacent components likely to be affected** — list with brief reason
- **INCEPTION canonical references** — links to `aidlc-docs/inception/application-design/screens/*.svg` or `aidlc-docs/inception/application-design/ui-mockups.md` sections when the unit is UI-related
- **Pre-existing rule violations in adjacent code** — adjacent yesman-impl or other extension findings that may be in-scope

The exploration MUST result in a written "Exploration Findings" section that is appended to the unit's stage plan file before any architectural proposal.

**Verification**:
- Plan file includes an explicit "Exploration Findings" section
- Findings reference at least 3 distinct existing files with `path:line`
- For UI units, at least one INCEPTION SVG reference is listed
- The plan rationale explicitly shows how findings shaped the design (not just a dumped list)
- Pre-existing rule violations are surfaced (or explicitly marked "no adjacent violations detected")

---

## Rule CONS-FLOW-02: Parallel Sub-Agent Execution via Agent Tool

**Rule**: Codebase exploration, architecture design, and quality review MUST use Claude Code's Agent tool with appropriate `subagent_type`. The following mapping is canonical:

| Phase | Recommended `subagent_type` | Fallback when plugin not installed |
|---|---|---|
| Exploration | `Explore` (read-only, fast) | `general-purpose` with read-only prompt |
| Architecture design | `feature-dev:code-architect` or `Plan` | `Plan` |
| Quality review | `feature-dev:code-reviewer` | `general-purpose` with confidence-filter prompt |

Multiple independent areas MUST be explored in parallel: a single message containing multiple `Agent` tool calls (one per area) — NOT a sequence of separate messages.

**Verification**:
- Agent tool invocations are present in Plan and Review stages of the unit's audit trail
- Independent exploration tasks are bundled in a single message (parallel execution)
- `subagent_type` is specified for each Agent call (no default to `general-purpose` without justification)
- For trivial units where parallel execution adds no value (e.g., 1-file typo), the model documents this and marks the rule N/A

---

## Rule CONS-FLOW-03: Multi-Approach Architecture Proposal

**Rule**: The Code Generation Plan MUST present **at least 2 alternative approaches** labelled by intent:
- **Minimal-change** — smallest diff, preserves existing patterns; recommended for hotfixes / hackathon speed
- **Clean** — best long-term design, may refactor adjacent code; recommended when the unit anchors a broader area
- **Pragmatic** — middle ground (optional, when distinct from the above)

Each approach MUST state:
- **Pros** and **Cons** (3+ bullets each)
- **Files to modify** — `path:line` for existing files, `path` for new files
- **Compliance impact** — which yesman-impl / extension rules are triggered

The plan MUST recommend one approach with explicit justification referencing project priorities (hackathon vs. long-term, FR-* requirements, etc.).

**Verification**:
- Plan includes a "Proposal Approaches" section with at least 2 alternatives
- Each alternative has Pros, Cons, and Files (existing with `path:line`, new with `path`)
- The recommended approach is explicitly marked (e.g., "✓ Recommended: Clean")
- Justification cites at least one project-specific factor (FR-ID, INCEPTION reference, deadline, etc.)

---

## Rule CONS-FLOW-04: Approval Gating with Audit Trail

**Rule**: The model MUST present an approval gate at three points in the Construction flow:
1. **After Exploration** (post CONS-FLOW-01) — "Findings look correct? Anything missing?"
2. **After Architecture Design** (post CONS-FLOW-03) — "Which approach to implement?"
3. **After Quality Review** (post CONS-FLOW-05) — "Review findings resolved or accepted as advisory?"

Each gate MUST use either `AskUserQuestion` or the standardized 2-option completion message ("Request Changes" / "Continue to Next Stage"). Each gate decision (including the user's complete raw input) MUST be appended to `aidlc-docs/audit.md` with timestamp and the CONS-FLOW rule ID that triggered the gate.

**Verification**:
- 3 approval gate points are present in the unit's audit trail
- `audit.md` contains 3 corresponding entries per unit, each with: ISO 8601 timestamp, complete raw user input, CONS-FLOW rule ID (CONS-FLOW-04), gate decision
- User raw input is captured verbatim (not summarized or paraphrased)
- If the user explicitly waives a gate (e.g., "skip review approval, just proceed"), the waiver is logged with rationale

---

## Rule CONS-FLOW-05: Review Finding Confidence Threshold and Format

**Rule**: Quality review findings produced by the reviewer sub-agent MUST be filtered by confidence ≥ 80%. Findings with lower confidence MUST NOT block the stage but MAY be listed in an "Advisory" section.

Each blocking finding MUST include:
- **Rule ID** — prefer yesman-impl ID (Issue #3) when applicable: BS-NN / UI-NN / DI-NN / PV-NN. Fallback to ad-hoc description with a free-form ID like `ADHOC-001` when no yesman-impl rule fits.
- **Location** — `path:line` traceability (single line or range)
- **Severity** — Critical / Important / Minor
- **Suggested fix** — concrete pattern (1-3 lines of code or a clear directive)
- **Confidence** — numeric (0-100) with brief rationale

**Verification**:
- The review output table has columns: Rule ID, Location, Severity, Confidence, Suggested Fix
- All blocking findings have Confidence ≥ 80
- Findings < 80% are listed under "Advisory (non-blocking)" and not in the blocking set
- yesman-impl rule IDs are preferentially referenced when the finding maps to an existing rule
- Each finding includes a suggested fix (not just "needs to be fixed")

---

## Rule CONS-FLOW-06: Clarifying Questions Before Architecture

**Rule**: Before producing the Architecture Design (CONS-FLOW-03 multi-approach proposal), the model MUST identify ambiguities and ask **specific clarifying questions** via `AskUserQuestion`. The model MUST NOT make silent assumptions on the following categories:
- **Scope boundaries** — what is explicitly in / out of this unit
- **Edge cases** — error handling, empty state, race conditions, concurrent access
- **INCEPTION SVG ambiguities** — color tolerance (exact HEX vs. nearest Tailwind), text rendering (line breaks, ellipsis), motion timing
- **Backend Strategy choices** — Mock-only vs. full SqlModel implementation, env-only switching vs. hardcoded paths

If no ambiguities exist, the model MUST explicitly document that fact (one sentence) in the plan file.

**Verification**:
- `AskUserQuestion` is invoked at least once between CONS-FLOW-01 (Exploration) and CONS-FLOW-03 (Architecture) — OR a "No ambiguities detected" statement is recorded in the plan file
- Questions are concrete and offer 2-4 options (not yes/no "Is this OK?" patterns)
- Documented assumptions (when no question is asked) are explicit and listed in the plan file
- Questions reference specific paths, line numbers, or INCEPTION SVG sections when relevant

---

## Rule CONS-FLOW-07: Phase Summary with Compliance Matrix and TODO Carryover

**Rule**: At Construction Code Generation completion, the model MUST produce a Summary section appended to the unit's stage plan file that includes:
- **Files created / modified** — count + path list (with brief change description per path)
- **Tests added / updated** — count + path list, marked by type (unit / integration / e2e / PBT)
- **Extension compliance matrix** — a table of: yesman-impl rules (BS-NN, UI-NN, DI-NN, PV-NN, when Issue #3 is implemented), CONS-FLOW rules, FE-DESIGN rules, with status: Compliant / Non-compliant (blocked) / N/A (with reason)
- **Unresolved TODOs** — carried forward to next unit or filed as new GitHub Issues, each TODO must reference an issue / unit / commit

**Verification**:
- The unit's stage plan file ends with a "Summary" section after Code Generation completion
- Files / tests counts match the actual diff (verify by comparing to `git diff --stat`)
- Compliance matrix lists each applicable extension rule with status
- N/A entries include a brief rationale (not just "N/A")
- Carryover TODOs include actionable references (Issue #, file path, or commit SHA)

---

## Appendix: Mapping to feature-dev 7-Phase Workflow

For reference, here is how CONS-FLOW rules map to feature-dev's procedural phases:

| feature-dev phase | CONS-FLOW rules |
|---|---|
| Phase 1: Discovery | CONS-FLOW-01 (exploration) + CONS-FLOW-06 (clarifying questions) |
| Phase 2: Codebase Exploration | CONS-FLOW-01 + CONS-FLOW-02 (parallel agents) |
| Phase 3: Clarifying Questions | CONS-FLOW-06 + CONS-FLOW-04 (gate 1) |
| Phase 4: Architecture Design | CONS-FLOW-03 (multi-approach) + CONS-FLOW-04 (gate 2) |
| Phase 5: Implementation | (handled by existing `construction/code-generation.md` Part 2) |
| Phase 6: Quality Review | CONS-FLOW-05 (confidence + format) + CONS-FLOW-04 (gate 3) |
| Phase 7: Summary | CONS-FLOW-07 (summary + compliance matrix) |
