# Construction Flow — Opt-In

**Extension**: Construction Flow (orchestrated multi-agent workflow inspired by Anthropic `feature-dev`)

## Opt-In Prompt

The following question is automatically included in the Requirements Analysis clarifying questions when this extension is loaded:

```markdown
## Question: Construction Flow Extension
Should construction-flow rules (orchestrated multi-agent workflow inspired by
Anthropic feature-dev plugin) be enforced for this project?

A) Yes — enforce all CONS-FLOW rules as blocking constraints (recommended for
   non-trivial Construction stages; integrates codebase exploration / multi-approach
   design / clarifying questions / high-precision review with parallel sub-agents
   via Claude Code Agent tool)
B) Partial — enforce only CONS-FLOW-01, 03, 05 (exploration + multi-approach
   proposal + confidence-filtered review) without parallel sub-agent execution,
   approval gating, or audit logging requirements (suitable for hackathon-speed
   prioritization while keeping minimum design rigor)
C) No — skip all CONS-FLOW rules (fall back to default
   `construction/code-generation.md` Plan → Generate 2-part flow)
X) Other (please describe after [Answer]: tag below)

[Answer]:
```
