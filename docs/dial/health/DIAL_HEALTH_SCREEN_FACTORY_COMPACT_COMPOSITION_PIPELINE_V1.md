# Dial Health Screen Factory — Compact Composition Pipeline V1

Status: CANONICAL SCREEN-FACTORY EXECUTION ARCHITECTURE  
Visual authority: `DIAL_HEALTH_PREMIUM_SCREEN_QUALITY_REV3`  
Design system: `DIAL_HEALTH_UI_CANONICAL_3_0`  
Composition DSL: `DIAL_HEALTH_SCREEN_COMPOSITION_DSL_V1`

## Purpose

The Screen Factory must preserve premium visual quality without consuming several LLM requests and tens of thousands of tokens for every screen. Models are therefore no longer asked to rewrite complete HTML, CSS, interaction maps, state maps, bindings, evidence maps and component contracts on every attempt.

The model decides **hierarchy and composition only**. Dial's deterministic compiler owns the pixels-producing implementation structure.

## Production path

`canonical screen contracts -> Hermes functional courier -> platform-family compact composition request -> composition DSL -> deterministic Dial component compiler -> Playwright/Chromium -> deterministic QA -> accepted screen`

An AI repair request is made only when deterministic QA identifies a composition-level defect that cannot be corrected by the locked renderer. There is no mandatory model committee for ordinary screens.

## Request efficiency

- Initial target: **27 screens per composition request**.
- Minimum adaptive batch: **10**.
- Maximum adaptive batch: **40**.
- My Health has exactly 27 REQUIRED screens per platform, so Android, iOS and responsive-web can each be planned as one family request when the provider returns a valid batch.
- The batch governor increases the target only after measured first-pass quality remains high and reduces it when QA pass rate falls.
- A malformed subset is repaired together in one secondary batch request rather than one request per missing screen.
- Mechanical model deviations such as duplicate action placement or more than four quick actions are normalized deterministically from the canonical action catalog, consuming no extra model request.
- If a batch-repair still leaves one composition invalid, only that screen receives a targeted repair request; valid sibling compositions remain cached and the full family is never regenerated.
- A later failed rendered screen receives a small composition patch request; successful sibling compositions remain cached and are never regenerated.

## Quality invariants

The compact DSL contains only approved region types, feature references, action references, prominence and **bounded variant identifiers**. Variants are selected from a per-region catalog (for example hero `summary/split/soft/compact`, list `rich/cards/compact`, highlight `featured/status/soft`) and are compiled to locked Dial CSS. The model cannot specify arbitrary CSS, colours, fonts, shadows, breakpoints or raw application data.

The compiler enforces:

- 2–6 meaningful regions per screen;
- archetype-specific composition recipes;
- first-load feature hierarchy coverage;
- no duplicated canonical actions;
- no more than four actions in a quick-action grid;
- no more than ten explicitly selected first-load actions;
- family diversity control: one identical region/type/prominence/variant signature may not be repeated more than four times in a 10+ screen composition batch;
- progressive disclosure for remaining documented functions;
- contract-derived state, evidence, data-binding and interaction maps;
- no invented patient/provider/clinical/financial values;
- locked Dial Health typography, spacing, colour, iconography and component primitives;
- deterministic viewport, overflow, touch-target, semantic-density and scroll-depth QA.

A model can create a weak first composition, but it cannot make that composition canonical evidence unless the deterministic gates pass.

## Canonical action derivation

The compiler creates the action catalog from documented interactions and documented routes. A feature that explicitly declares named shortcuts may create module actions from those documented shortcut names. If a shortcut has no explicit route, the compiler uses a `module://` handoff rather than inventing a product URL. This preserves the documented behaviour without fabricating router truth.

## Model roles

- **MiniMax M3 Free** — preferred high-volume platform-family composition designer.
- **GLM 5.2 Free** — preferred targeted composition repair model and batch fallback.
- **Nemotron 3 Ultra Free** — curated fallback / complex reasoning option when healthy.
- Retired or unavailable preferred models continue to use the live curated replacement mechanism.

Routine deterministic QA does not call a model. Model heartbeats are not generated because they would consume the same provider request allowance; model health is inferred from real work and provider responses.

## Token and request accounting

Every OpenRouter attempt is now counted separately from successful requests. When the provider returns usage metadata, Screen Factory persists prompt, completion, reasoning, cached and total tokens, with breakdowns by role and model.

The dashboard API exposes both the composition-batch governor and OpenRouter usage state. Operational optimization tracks **requests per accepted screen** and **tokens per accepted screen**, not raw model throughput alone. OpenRouter's free daily allowance is treated as an **account-wide** quota: after the first `free-models-per-day` response the factory records the provider reset timestamp and stops probing the other models until that reset, preventing quota-exhaustion retry storms.

## Packaging and ordering

Strict canonical screen order remains unchanged. Composition can be planned in a family batch, but each screen is still rendered, QA'd, persisted and accepted independently. A failed screen is not skipped. Batch ZIP files remain prohibited; packaging is one ZIP per completed business-unit/platform.
