# Frontend Design Rules

## Overview

These frontend-design rules adapt the intentional aesthetic commitment from Anthropic's [`frontend-design`](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/frontend-design) plugin into AI-DLC native constraints for the Construction phase, anchored to YesMan's INCEPTION drawio canonical (`aidlc-docs/inception/application-design/screens/*.svg` and `ui-mockups.md`).

The intent is to prevent regression to generic AI-generated aesthetics (overused fonts, default color schemes, cookie-cutter layouts) by explicitly inheriting INCEPTION's bold commitment to warm cream + coral + Noto Serif JP and codifying anti-default rules.

**Enforcement**: At the Code Generation stage of any unit that touches frontend code (`apps/web/src/**/*.{ts,tsx}` or `packages/ui/**/*.{ts,tsx}`), the model MUST verify compliance with these rules before presenting the stage completion message to the user.

### Blocking FE-DESIGN Finding Behavior

A **blocking FE-DESIGN finding** means:
1. The finding MUST be listed in the stage completion message under a "Frontend Design Findings" section with the FE-DESIGN rule ID and description
2. The stage MUST NOT present the "Continue to Next Stage" option until all blocking findings are resolved
3. The model MUST present only the "Request Changes" option with a clear explanation of what needs to change
4. The finding MUST be logged in `aidlc-docs/audit.md` with the FE-DESIGN rule ID, description, and stage context

If a FE-DESIGN rule is not applicable to the current unit (e.g., FE-DESIGN-05 mobile-first when the unit is purely an internal admin tool), mark it as **N/A** in the compliance summary — this is not a blocking finding.

### Default Enforcement

All rules in this document are **blocking** by default. If any rule's verification criteria are not met, it is a blocking FE-DESIGN finding — follow the blocking finding behavior defined above.

### Partial Enforcement Mode

If the user selected **Partial** enforcement during opt-in, only rules FE-DESIGN-01, FE-DESIGN-03, and FE-DESIGN-04 are enforced. All other rules are treated as advisory (non-blocking). Log the enforcement mode in `aidlc-docs/aidlc-state.md` under `## Extension Configuration` with the format `Frontend Design | Partial | …`.

### Verification Criteria Format

Verification items in this document are plain bullet points describing compliance checks. They are distinct from the `- [ ]` / `- [x]` progress-tracking checkboxes used in stage plan files. Each item should be evaluated as compliant or non-compliant during review.

### Relationship to Other Extensions

FE-DESIGN rules overlap with yesman-impl UI-NN rules (Issue #3) by design — FE-DESIGN gives the **aesthetic source of truth** (intentional palette, typography, motion), while yesman-impl UI-NN enforces structural canonical (key={decisionId} remount, e2e structural test). When a Construction Flow CONS-FLOW-05 review surfaces a finding that maps to both, prefer the FE-DESIGN ID for aesthetic concerns and UI-NN for structural concerns.

---

## Rule FE-DESIGN-01: Inherit INCEPTION drawio as Aesthetic Source of Truth

**Rule**: New or modified UI components MUST inherit aesthetic decisions from INCEPTION drawio canonical:
- For each new screen or major UI change, identify the corresponding SVG in `aidlc-docs/inception/application-design/screens/*.svg` (01 home-input / 02 discussion-live / 03 proposal-card / 04 score-dashboard / 05 silence-domain / 06 persona-pool)
- Inherit color, typography, spacing, and visual hierarchy from the SVG
- Document any intentional deviation with a written rationale in the plan file (e.g., "FE-DESIGN-01 deviation: extending palette with #ABC123 for new chart type, reason: …")

**Verification**:
- The plan file lists the canonical SVG reference for each new / modified screen
- HEX colors used match SVG values (or document tolerance, e.g., "rounded to nearest Tailwind class")
- Layout structure (header / main / nav) follows SVG positioning
- Any deviation is documented with rationale before implementation

---

## Rule FE-DESIGN-02: Intentional Typography

**Rule**: Typography choices MUST be intentional and follow INCEPTION `ui-mockups.md §1.3` typography tokens:

| Role | Font | Size | Weight | Style |
|---|---|---|---|---|
| Heading (assertive) | **Noto Serif JP** | 28–36px | Bold | — |
| Body | Inter / Noto Sans JP | 14–16px | Regular | — |
| AI proposal text | **Noto Serif JP** | 22–24px | Medium | Italic |
| Reflection microcopy | **Noto Serif JP** | 13–14px | Light | Italic |
| Numbers (score) | Inter Tabular | 48–64px | Bold | — |
| Caption | Inter | 11–12px | Regular | — |

Explicitly prohibited:
- **NEVER** use Inter / Roboto / Arial / system-ui for headings (Noto Serif JP is required)
- **NEVER** use a single font family for all roles (typography diversity is intentional)

**Verification**:
- `font-serif` (Tailwind preset = Noto Serif JP) is applied to heading elements (`h1`–`h3`) and AI proposal text
- Tabular numbers (font-mono or font-variant-numeric: tabular-nums) is used for score / metric displays
- No heading uses `font-sans` (Inter) or system-ui
- New font families introduced require a documented rationale in the plan file

---

## Rule FE-DESIGN-03: Intentional Color Palette

**Rule**: Color choices MUST use INCEPTION palette with **HEX values directly** (not Tailwind default tokens that may drift). The canonical palette:

| Role | HEX | Usage |
|---|---|---|
| Background warm cream | `#FFF7E8` | Body / main background |
| Header beige | `#F5E5C4` | App bar / header bar |
| Primary text | `#4A3D45` | Headings / body text |
| Secondary text | `#715B62` | Captions / labels |
| Whisper / hint | `#9E9E9E` | Reflection microcopy / placeholders |
| CTA coral | `#E8775A` | Primary buttons / brand accent |
| Yes success | `#6FBE8E` | Yes swipe / accept indicators |
| No grey | `#90A4AE` | No swipe / dismiss indicators |
| Score radial | `#9F88C8` | Delegation score number / arc |
| Score trend line | `#E8775A` | Time-series chart |
| AI comment bubble | `#FFD6E0` (bg) / `#FF8FAE` (border) | Pink bubble for AI messages |
| Silence dark | `#1A2329` | Silence theater background |
| Input border | `#E0D5BC` | Form fields |
| Danger | `#C62828` | Error / warning |

Explicitly prohibited:
- **NEVER** use Tailwind `emerald-*` / `sky-*` / `slate-*` defaults (use INCEPTION palette HEX)
- **NEVER** use raw `red-500` / `green-500` (use INCEPTION `#C62828` / `#6FBE8E`)
- **NEVER** introduce gradient backgrounds without documented intentional rationale (INCEPTION is solid-color minimal)

**Verification**:
- New components use HEX colors from the table above (inline `style={{ background: "#…" }}` or via Tailwind preset extension)
- No `bg-emerald-*` / `text-sky-*` / `border-slate-*` Tailwind class is introduced in `apps/web/src` or `packages/ui/src`
- Any new color added requires a documented rationale and a proposal to extend the palette (not silent introduction)

---

## Rule FE-DESIGN-04: Anti-Generic AI Defaults

**Rule**: New UI implementations MUST avoid generic AI-generated aesthetics. Explicitly prohibited patterns:

| Anti-pattern | What to use instead |
|---|---|
| `font-family: Inter` / Roboto / Arial for headings | `font-serif` (Noto Serif JP) per FE-DESIGN-02 |
| Tailwind `bg-emerald-500` / `bg-sky-500` defaults | INCEPTION palette HEX per FE-DESIGN-03 |
| `shadcn/ui` raw copy-paste (`bg-background text-foreground` etc.) | Compose from `packages/ui` composites per FE-DESIGN-07 |
| Generic `rounded-full` gradient buttons | INCEPTION black pill (`bg-neutral-900 text-neutral-0 rounded-full`) for primary CTAs |
| Card grids without intentional rhythm | Follow INCEPTION `ui-mockups.md §1.4` 8px spacing tokens |
| Material icons / Heroicons default set | INCEPTION emoji icons (🪞 logo / 🛡️ 慎重派 / ☀️ 楽観派 / ⚡ 効率派 / ⛪🗳️⚔️🔞 silence) |
| Standard light/dark mode toggle | INCEPTION silence-domain `#1A2329` 専用 dark backdrop (mode toggle なし、文脈依存切替) |

**Verification**:
- No `font-family: Inter` (or equivalents) on heading elements
- No Tailwind default color class outside the INCEPTION palette
- No raw shadcn-ui markup (verified by absence of `bg-background` / `text-foreground` / `bg-popover` patterns)
- Persona icons match the canonical emoji set (🛡️ / ☀️ / ⚡)
- Silence-domain dark backdrop uses `#1A2329` (not Tailwind `slate-900` / `zinc-900`)

---

## Rule FE-DESIGN-05: Mobile-First Viewport Strategy

**Rule**: All new UI components MUST be designed mobile-first with the following viewport targets:
- **Primary viewport**: Pixel 5 (393 × 851) — the Playwright e2e default per `tests/e2e/playwright.config.ts`
- **Aspect ratio**: Match INCEPTION drawio 280 × 520 phone aspect (1:1.86), scaled
- **Layout cap**: `max-width: 480px` on main content (`ui-mockups.md §5` says "Desktop も 480px 制限")
- **Touch target minimum**: 44 × 44 px (WCAG 2.5.5) for all primary CTA, swipe controls, and voice button

Explicitly prohibited:
- **NEVER** introduce horizontal scroll at viewport widths 320–393 px
- **NEVER** stack content in multiple columns at < 640 px breakpoint (single column on mobile)
- **NEVER** rely on hover-only interactions for primary flows (must work on touch)

**Verification**:
- Components render within Pixel 5 viewport without horizontal scroll (verifiable via Playwright `tests/e2e/tests/inception-mobile.spec.ts`)
- Touch targets meet 44 × 44 px minimum
- Layout collapses to 1 column at mobile widths
- No `hover:` only state without an equivalent `focus:` or click fallback

---

## Rule FE-DESIGN-06: Cohesive Motion Vocabulary

**Rule**: Animation and transition durations MUST follow the INCEPTION `ui-mockups.md §1.6` motion vocabulary:

| Pattern | Duration | Easing | Use case |
|---|---|---|---|
| `fast` | 150 ms | `ease-out` | Hover / focus / button state |
| `medium` | 350 ms | `ease-in-out` | Screen transitions / modal open-close |
| `slow` | 600 ms | `ease-out` | Score update / Yes celebration |
| `silence` | 1200 ms | `linear` | Silence theater fade-in / fade-out |
| `swipe` | follows finger | physics-based | Swipe gesture (`react-swipeable`) |

Explicitly prohibited:
- **NEVER** introduce arbitrary durations (200 ms / 400 ms / 800 ms) without documented rationale
- **NEVER** use `ease-in` (without `-out`) for entrance animations (INCEPTION uses `ease-out`)
- **NEVER** chain animations longer than `silence` (1200 ms) for primary UX

**Verification**:
- New `transition-duration` / `animation-duration` values use 150 / 350 / 600 / 1200 ms (or finger-follow for swipe)
- Easing functions are `ease-out` / `ease-in-out` / `linear` (no `ease-in` alone for entrance)
- New animations are documented in the plan file with vocabulary mapping

---

## Rule FE-DESIGN-07: Component Reuse over Recreation

**Rule**: New UI MUST prefer existing composites from `packages/ui/src/composites/` over ad-hoc Tailwind class compositions:

| Use case | Required composite |
|---|---|
| Yes/No swipe interaction | `SwipeChoice` |
| AI persona utterance bubble | `DecisionUtteranceBubble` |
| Persona card display | `PersonaCard` |
| Voice mic button | `VoiceMicButton` |
| Yes/No fallback buttons | `ChoiceButtons` |
| Card container | `Card` (primitive) |
| Modal | `Modal` (primitive) |
| Toast | `useToast` + `ToastProvider` |
| Button | `Button` (primitive) |
| Input | `Input` (primitive) |
| Loading state | `Spinner` (primitive) |

If an existing composite is insufficient, the unit MUST either:
- Extend the composite via props (preferred — propose enhancement to `packages/ui`)
- Document why a new composite or ad-hoc implementation is required

Explicitly prohibited:
- **NEVER** rebuild SwipeChoice / DecisionUtteranceBubble / PersonaCard from scratch in `apps/web/src/features`
- **NEVER** inline a `<button className="bg-coral …">` for a primary CTA — use `Button` with `variant="primary"`

**Verification**:
- New `apps/web/src/features/**/*.tsx` files import composites / primitives from `@yesman/ui`
- No re-implementation of canonical composites (verified by absence of `react-swipeable` import outside `packages/ui`)
- Any ad-hoc UI primitive duplication is documented with rationale and ideally filed as a `packages/ui` enhancement TODO

---

## Appendix: INCEPTION Source Cross-Reference

For convenience, the canonical sources for FE-DESIGN rules:

| FE-DESIGN rule | INCEPTION source |
|---|---|
| FE-DESIGN-01 (SVG inheritance) | `aidlc-docs/inception/application-design/screens/*.svg` |
| FE-DESIGN-02 (typography) | `aidlc-docs/inception/application-design/ui-mockups.md` §1.3 |
| FE-DESIGN-03 (color palette) | `ui-mockups.md` §1.2 + screen SVGs (HEX values) |
| FE-DESIGN-04 (anti-default) | This rule (no INCEPTION source — derived from `frontend-design` philosophy) |
| FE-DESIGN-05 (mobile-first) | `ui-mockups.md` §5 + `tests/e2e/playwright.config.ts` (Pixel 5) |
| FE-DESIGN-06 (motion) | `ui-mockups.md` §1.6 |
| FE-DESIGN-07 (composite reuse) | `packages/ui/src/composites/*.tsx` (canonical implementations) |
