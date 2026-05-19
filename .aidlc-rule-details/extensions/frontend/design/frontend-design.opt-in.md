# Frontend Design — Opt-In

**Extension**: Frontend Design (intentional aesthetic commitment inspired by Anthropic `frontend-design`)

## Opt-In Prompt

The following question is automatically included in the Requirements Analysis clarifying questions when this extension is loaded:

```markdown
## Question: Frontend Design Extension
Should frontend-design rules (intentional aesthetic commitment with INCEPTION
drawio inheritance, inspired by Anthropic frontend-design plugin) be enforced
for this project?

A) Yes — enforce all FE-DESIGN rules as blocking constraints (recommended
   when INCEPTION drawio / SVG canonical exists; mandates intentional typography,
   color palette, motion vocabulary, mobile-first viewport, component reuse,
   and explicit prohibition of generic AI defaults like Inter/Roboto headings,
   Tailwind emerald-* defaults, and shadcn-ui copy-paste)
B) Partial — enforce only FE-DESIGN-01, 03, 04 (SVG inheritance + color palette +
   anti-default) without typography / motion / component-reuse / mobile-first
   mandates (suitable when frontend exists but UI conformance is not the focus)
C) No — skip all FE-DESIGN rules (free-form UI design without intentional
   aesthetic constraints)
X) Other (please describe after [Answer]: tag below)

[Answer]:
```
