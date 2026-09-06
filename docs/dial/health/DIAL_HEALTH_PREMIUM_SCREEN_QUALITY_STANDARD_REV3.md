# Dial Health Premium Screen Quality Standard — Rev 3

Status: **canonical Screen Factory visual-quality doctrine**  
Benchmark basis: the user-approved My Health reference screens supplied on 2026-09-05.  
Applies to: Dial Health Screen Factory generated implementation packets and rendered evidence across mobile, web, tablet and related platform surfaces.

## 1. Decision

All previously generated Screen Factory visual evidence is rejected and reset. The canonical queue and functional contracts remain authoritative, but generation completion returns to zero.

The attached reference screens define the required **quality bar**, not product truth. Their legacy labels, names, dates, values and screen numbering must never override the current canonical registry.

The benchmark is a premium consumer-health product: calm, clear, visually authored, brand-consistent, task-focused and credible enough to resemble a carefully designed App Store product rather than an AI-generated wireframe.

## 2. What the benchmark demonstrates

The reference set succeeds because it combines strong hierarchy, disciplined information density, coherent brand colour, soft surfaces, deliberate card rhythm, native mobile navigation, high-quality icon language, concise copy and obvious primary actions.

The second reference establishes the strongest target: a visually memorable top third, a warm health-oriented hero, four clear primary destinations, one highlighted upcoming item, one recent item, compact secondary actions and a quiet five-item navigation bar.

The first reference demonstrates family consistency across search, appointment, record, medication, messaging and profile screens without making every page use the same composition.

This is the target standard for every future Screen Factory render.
## 3. Visual language

### 3.1 Colour
- Trust colour: deep navy / ink blue.
- Brand action colour: Dial teal, with aqua/mint as restrained support.
- Surfaces: white, soft cool grey and very pale blue/teal.
- Semantic colours are low-saturation and limited to status meaning.
- Gradients are reserved for hero or priority cards. They must never become decorative noise.
- Normal screens should have one dominant accent family plus semantic status colours.

Canonical starting tokens:
- Ink/navy `#082C5C`
- Deep navy `#052548`
- Dial teal `#0FA7A0`
- Teal deep `#087F79`
- Aqua `#31C7C0`
- Mint `#DFF7F4`
- Background `#F5F9FC`
- Surface `#FFFFFF`
- Soft surface `#EEF5F8`
- Border `#DCE6EC`
- Muted text `#647789`

### 3.2 Typography
- Hero/page title: 28–36 px mobile, 700–850 weight, compact line height.
- Section title: 17–22 px, strong but clearly secondary.
- Card/title text: 14–16 px, usually 700–800 weight.
- Body: 14–16 px with comfortable line-height.
- Metadata: 11–13 px, never used for important clinical meaning.
- Sentence case is preferred. Avoid long paragraphs and excessive all-caps.
### 3.3 Shape, spacing and depth
- Use an 8 px spacing grid.
- Mobile outer gutter: 16–20 px.
- Intra-card spacing: 12–16 px.
- Section spacing: 20–28 px.
- Cards: 14–20 px radius with either a very soft cool border or subtle shadow.
- Primary buttons: 48–52 px high, 12–14 px radius.
- Search/input controls: 46–52 px high.
- Icon containers: 36–44 px, usually circular or softly rounded.
- Avoid stacking many elevated cards. The benchmark uses depth selectively to establish hierarchy.

### 3.4 Iconography and imagery
- Use a coherent line-icon family with approximately 2 px stroke weight.
- Icons should use navy/teal and may sit on soft mint/aqua containers.
- Emoji, mixed icon styles and arbitrary filled glyphs are prohibited.
- Friendly healthcare imagery may be used where it improves warmth and orientation, especially hero/provider contexts.
- If a real asset is unavailable, use a clearly non-authoritative art/portrait slot or restrained vector/gradient treatment; never fabricate a real patient/provider identity.
- Production UI evidence must not draw a fake phone bezel merely to appear polished. Device framing belongs in presentation previews, not implementation evidence.

## 4. Composition grammar

A user should understand a consumer screen's purpose, status and next useful action within roughly two seconds.

For a normal mobile screen:
1. Establish context/identity in the top 20–30%.
2. Present one principal task or focal card.
3. Show 1–3 supporting modules.
4. Route secondary material through tabs, “view all”, disclosure, sheet or focused detail route.
5. Keep navigation visually quiet.

A top-level My Health screen should normally expose no more than five major content regions and roughly 10–12 visible interactive targets.
## 5. Viewport discipline

The previous generation failure mode was to treat “full page” as permission to create very long consumer documents. That is explicitly rejected.

- Design mobile screens for the real target viewport first.
- Top-level consumer screens should normally fit within about `1.20×` the viewport height.
- Focused detail and form screens should normally fit within about `1.60×` the viewport height.
- Any My Health screen above `1.75×` viewport height fails deterministic quality QA unless a canonical exception is explicitly documented.
- Long data belongs behind progressive disclosure, pagination, tabs, accordions, sheets or dedicated detail routes.
- A complete screen means a complete **experience**, not every possible record or state rendered at once.

The renderer may still capture the full scrollable page so evidence is not cropped, but the design itself must avoid unnecessary scroll depth.

## 6. Screen-family patterns

### Home / Today
- Warm contextual header or greeting.
- One visual focal/hero region.
- Three or four clear primary destinations maximum.
- One highlighted upcoming appointment/task.
- One recent result/record/status item.
- Compact secondary quick actions.
- Five-item navigation only if justified by the platform shell contract.

### Provider discovery
- Compact app bar.
- Search and filter controls near the top.
- Tabs only if they separate meaningful modes such as providers/facilities.
- Three to five rich results visible before scrolling.
- Each result: identity/photo slot, specialty, location/context, concise trust metadata and one obvious action.
- Do not turn provider discovery into a dense directory table.
### Appointments
- Use upcoming/past or equivalent modes only where contractually useful.
- Make the next appointment visually dominant.
- Show only the next few secondary items.
- Reschedule/cancel actions appear only when allowed and remain visually subordinate to the appointment identity.

### Records, results and documents
- Lead with a concise summary rather than a dump of all records.
- Show two to four recent or relevant items.
- Use status and result chips sparingly.
- Selecting an item opens the complete detail experience.
- Export/download/share belongs on the focused screen where the contract requires it, not on every teaser row.

### Medications
- Medication name, strength, schedule, status and next relevant action should be scannable in one card.
- Safety copy must be calm and visually secondary.
- Avoid pharmacy-inventory density on the consumer medication view.

### Messages
- Use conversation rows with sender/context, concise preview, time and unread state.
- Avoid email-client density and unnecessary toolbars.

### Profile / settings
- Strong identity header followed by logically grouped settings rows.
- Use compact sections and clear disclosure chevrons.
- Destructive/sign-out actions are visually separated from ordinary navigation.

### Forms and confirmation flows
- Prefer 3–5 fields or decisions per step.
- Use progressive multi-step flows rather than one giant form.
- Confirmation screens should feel resolved and calm, with one clear next action.
## 7. Model coaching and in-context training

The OpenRouter models are not fine-tuned by Dial. “Training” in the Screen Factory means persistent in-context calibration: every generation request receives the same canonical visual doctrine, composition rules, component grammar, anti-patterns and quality rubric before the current screen contract.

Hermes remains the functional-requirements courier and does not invent screen-specific styling. The Screen Factory prompt assembler combines:
1. Hermes function-only screen brief.
2. Current canonical screen contract.
3. This Rev 3 visual-quality doctrine.
4. Canonical component/token grammar.
5. Platform-specific viewport constraints.
6. Deterministic composition-schema, component, viewport and interaction QA on every screen; peer art-direction is exception-only when a composition fails or is explicitly classified high-risk.

The preferred generation pool remains:
- `z-ai/glm-5.2:free`
- `minimax/minimax-m3:free`
- `nvidia/nemotron-3-ultra-550b-a55b:free`

A temporarily unavailable or retired preferred model is replaced by the best currently viable curated free model. Replacement must preserve the same coaching prompt and quality gates; model replacement is never permission to lower the design standard.

## 8. Request-efficient quality ladder

The production quality ladder no longer spends multiple model requests on every ordinary screen.

### Pass A — Platform-family composition
MiniMax M3 is the preferred high-volume composer. One request plans a coherent business-unit/platform family using compact composition DSL only. The initial target is 27 screens and the adaptive governor may move between 10 and 40. GLM 5.2 is the preferred batch fallback.

### Pass B — Deterministic Dial compiler and QA
Each returned composition is separated and compiled locally into the locked Dial Health component system, contract-derived actions/bindings/states/evidence, and Playwright/Chromium pixels. Overflow, touch targets, density, first-load actions, contract coverage, archetype fit, variant validity and family clone limits are machine gates and consume no model request.

### Pass C — Exception repair
Only a failed composition receives a small targeted repair request, normally on GLM 5.2 or the next healthy independent model. The repair changes composition DSL only; it never rewrites complete HTML/CSS. Successful sibling compositions stay cached.

### Pass D — High-risk qualitative escalation
Nemotron 3 Ultra or another healthy independent model may apply the art-director rubric to unusually complex, novel or repeatedly failing screens. This is an escalation gate, not a mandatory request on ordinary screens.

## 9. Art-director scoring rubric

A draft is scored on:
- Visual hierarchy — 12
- Brand coherence — 10
- Composition and spacing — 10
- Consumer density control — 10
- Component polish — 10
- Task clarity — 10
- Progressive disclosure — 8
- Platform-native feel — 8
- Accessibility — 7
- Functional truthfulness — 7
- Visual variety without drift — 4
- Implementation cleanliness — 4

When qualitative escalation is invoked, the passing threshold is **90/100**, with no critical defect. Routine screens are governed by the deterministic gates and locked component system without spending a separate critic request.

Critical defects include excessive scroll depth, fake patient/provider/clinical data, wrong screen identity, dashboard/table density on a consumer screen, browser-default styling, malformed navigation, unmapped controls, horizontal overflow, unreadable typography, inconsistent brand colour, or a page that visibly resembles a wireframe/template rather than a finished product.

## 10. Deterministic quality gates

Basic render QA must continue to enforce:
- zero horizontal overflow;
- minimum 44 px touch targets;
- labels for visible actionable controls;
- every control mapped to a documented interaction;
- required export action on the correct focused screen;
- declared progressive disclosure and consumer-safe density.

Rev 3 adds:
- My Health page height must remain <= `1.75×` the platform viewport unless the canonical task explicitly grants a long-form exception;
- visible actionable controls should normally remain <= 14 on a My Health first-load state;
- excessively dense semantic regions fail rather than being accepted because the screenshot is technically valid.

Deterministic QA is still not formal visual approval. It prevents known structural failures and enforces the locked visual baseline; the peer art-director rubric remains available for exception/high-risk escalation without becoming a mandatory request tax on every screen.
## 11. Explicit anti-patterns

Reject and regenerate when a screen shows any of the following:
- three or more mobile viewports of ordinary consumer content;
- a wall of equal-weight cards;
- admin/dashboard/table density for a patient-facing view;
- generic Bootstrap/browser-default form controls;
- tiny type used to fit too much information;
- emoji or mixed icon families;
- excessive teal blocks, borders or gradients;
- giant headers followed by little useful content;
- repeated decorative status tiles with no clear task hierarchy;
- multiple competing primary buttons;
- fake charts or metrics unsupported by the contract;
- invented names, dates, prices, diagnoses, claims, results or entitlements;
- duplicated functions that belong on focused detail screens;
- excessive explanatory copy instead of progressive disclosure;
- phone hardware frames embedded into implementation evidence;
- visual sameness across unrelated screen archetypes.

## 12. Model-specific coaching

### GLM 5.2
- Use as the preferred targeted composition-repair and batch-fallback model.
- Require exact compact DSL, contract indices and bounded variants.
- Guard against over-explaining or expanding every contract feature into first-load content; no markup/CSS output is permitted.

### MiniMax M3
- Use as the preferred high-volume platform-family composition model.
- Plan the family holistically, then return concise hierarchy/region/variant DSL only.
- Guard against dense card repetition, cloned compositions and overlong first-load hierarchy; the deterministic compiler owns CSS.

### Nemotron 3 Ultra
- Use its reasoning strength for complex information hierarchy, repeated-failure diagnosis and high-risk qualitative escalation.
- Because strict structured-output support may be weaker, enforce exact JSON and deterministic DSL validation.
- Guard against verbose UI; reasoning must not surface as explanatory interface copy.

Replacement models inherit the closest coaching profile based on their capabilities and are never allowed to relax the canonical rubric.

## 13. Acceptance rule

No regenerated screen counts as visually acceptable merely because the PNG exists or basic QA passes. The Screen Factory may mark `COMPLETE` for generation/basic QA, but formal visual approval remains separate until the user or an approved visual-review gate accepts the quality.

The immediate regeneration objective is to make first-pass screens visually comparable to the supplied premium reference set while remaining faithful to the current Dial Health functional contracts.

## 14. Machine-enforced Rev 3 component discipline

For Rev 3 My Health tasks, the deterministic compiler emits the canonical `dh-screen` root and locked premium surface, spacing and brand tokens. Models cannot override those tokens with custom CSS.

Consumer My Health renders fail structural QA when they use HTML table layouts or emoji as interface iconography. Inline SVG line icons and semantic list/card patterns are the expected implementation path.

These rules are intentionally deterministic so a weaker or replacement free model cannot silently regress the visual baseline: the model only selects approved hierarchy/regions/variants, while Dial owns the implementation.

## Free-provider privacy boundary

The Screen Factory may use OpenRouter free endpoints that permit provider training only because the generation credential is isolated to `SYNTHETIC_PRODUCT_CONTRACT_ONLY` prompts. Those prompts may contain canonical screen contracts, design-system rules, generic labels and synthetic placeholders only.

Real patient/member/provider records, PHI, credentials, tenant secrets, real claims/results/eligibility/financial data and other regulated or identifying records are prohibited from this generation path. The broader OpenRouter auxiliary layer keeps its stricter non-sensitive/deny policy; this exception is scoped only to Screen Factory synthetic composition generation.

A model/provider that cannot satisfy this synthetic-only boundary must be removed from the active pool. Model availability never overrides the data-classification gate.
