# Dial Health Screen Factory UX Policy — Rev 2

**Status:** CANONICAL / REQUIRED  
**Design system:** `DIAL_HEALTH_UI_CANONICAL_2_0`  
**Factory policy:** `DIAL_HEALTH_SCREEN_FACTORY_UX_REV2`  
**Applies to:** every REQUIRED Dial Health screen and platform.

## 1. Design intent

Dial Health must remain clinically credible and operationally professional without presenting consumer-facing products like staff dashboards. My Health is a warm, reassuring customer experience. It uses progressive disclosure, clear choices, plain language, generous whitespace, calm hierarchy and focused tasks.

Professionalism is preserved through navy hierarchy, Dial teal/green anchors, restrained semantic colours, clean neutral surfaces, predictable typography, strong accessibility and traceable data provenance. Warmth comes from wording, spacing, visual pacing, supportive microcopy and reducing simultaneous decisions.

## 2. Non-negotiable customer-facing density rules

For `My Health`, one viewport must not behave like an operations cockpit. A page should present one principal decision or task, one primary CTA, and only the minimum supporting information required to make that decision.

Dense secondary information must use one of these patterns: collapsible section, focused modal/sheet, dedicated detail route, or an explicit “View all / View details” action. Long tables, multi-panel analytics walls and simultaneous unrelated metrics are prohibited on My Health unless a contract explicitly requires them.

Home surfaces are summaries and launchpads, not data warehouses. Critical health or financial information may be surfaced as a concise status card, but supporting detail belongs behind a focused interaction.

## 3. Records and transactions

Every visible record or transaction row/card must be actionable and open a complete detail experience as either a full page or a focused modal/sheet. The detail experience must preserve context, show provenance/status where relevant, expose the complete safe-to-display record, and provide an export action when the record is exportable.

Export is a functional contract, not a decorative icon. The implementation packet must identify export format(s), the backend/report service that owns generation, permission checks, audit event, offline behaviour and failure state. Frontend code may request an export but may not fabricate authoritative clinical or financial content.

Lists must support empty, loading, partial, stale/source-unavailable and permission states. Where pagination or filtering is required, the contract must specify it; the visual may not invent fake filters merely for appearance.

## 4. Functional-design rule

Every visible control must map to a real software behaviour: route, modal/sheet, query/filter, mutation, export, consent/step-up, download, retry or other documented action. Cosmetic-only buttons, fake charts, decorative toggles and impossible controls are forbidden.

## 5. Evidence-backed screen compilation

A REQUIRED screen is not generation-ready until its screen contract contains, at minimum: purpose, visible features, interactions, next routes, required states/variants, archetype and evidence basis. The factory must fail closed at the contract gate rather than infer a page from its title.

Evidence basis must point to durable Dial Health source-of-truth material or to a newly ratified design decision in this policy set. Temporary files and conversational assumptions are not sufficient canonical evidence.

The implementation packet must include `evidence_map`, linking every rendered capability to a documented feature or to a formally documented additional feature. A feature absent from both is not allowed to appear in the render.

## 6. Necessary but previously undocumented features

A designer may identify a necessary feature that is missing from the current contract. It may only be added if the implementation packet declares it in `additional_features` with: stable feature ID, rationale, source gap, domain owner, data model impact, API/service contract, events, security/privacy controls, audit requirements, QA plan and rollout/migration notes.

The Screen Factory accumulates these additions into `ADDITIONAL_FEATURES_INTEGRATION.md` for the affected business-unit/platform pack. This Markdown file is part of the platform deliverable and is included in the final platform ZIP.

Additional features remain `PROPOSED_BY_DESIGN` until incorporated into the canonical Dial Health product architecture. Image existence does not make them implemented, approved or clinically green.

## 7. Frontend-development awareness

Every generated screen must ship with implementation artefacts, not pixels alone: semantic HTML, CSS, component contracts, interaction map, data bindings, state map, feature coverage, evidence map and additional-feature declarations. Components must have stable `data-ui`, `data-feature-id` and `data-action` hooks.

Every actionable element must have a matching interaction-map entry. Every displayed authoritative value must have a data-binding owner. Every documented feature must be either represented or explicitly declared not visible on that state. Frontend-owned clinical, eligibility, pricing, claim or ledger truth is prohibited.

Reusable patterns should map cleanly to software components: summary card, disclosure panel, focused detail sheet, record row, status chip, filter control, export action, confirmation dialog and empty/error state.

## 8. My Health interaction pattern

My Health uses progressive disclosure by default. A top-level page may show concise status, the next useful action and a small number of recent items. “View all” opens the relevant collection. Selecting an item opens its complete detail page/sheet. Related actions remain inside that focused context.

The visual language may use friendly illustrations or supportive imagery only when they do not replace functional information and can be implemented as optional presentation assets. No visual element may imply a service, clinical result, benefit, price or entitlement that is not backed by a contract/data source.

Emergency and safety messaging is exceptional: it may interrupt the calm hierarchy where clinically appropriate, but must distinguish Dial Health assistance from statutory emergency services and must be driven by documented routes and availability state.

## 9. Packaging and delivery

Generation groups may remain limited to ten tasks for orchestration and retry control, but **batch ZIP files are prohibited**. Packaging is by business-unit/platform only. A platform ZIP is produced only after every REQUIRED screen for that business-unit/platform is complete at the generation/basic-QA gate.

Each platform pack contains all standalone screen images, implementation artefacts, screen contracts, QA evidence, `IMPLEMENTATION_HANDOFF.md` and `ADDITIONAL_FEATURES_INTEGRATION.md`. Conditional surfaces are excluded unless explicitly activated in the canonical registry.

Formal visual approval, UX green, implementation green, clinical safety green and regulatory readiness remain separate states. Packaging does not imply any of them.

## 10. Factory reset decision — 2026-09-05

All previously produced Dial Health Screen Factory image/render artefacts are superseded by this Rev 2 policy and must be deleted from active factory outputs. The canonical screen identities and product-family order remain, but completion evidence is reset to zero so screens are regenerated under this policy.

The reset does not delete historical audit events or the prior canonical import; those remain as traceability evidence. A new Rev 4 queue is created with runtime/generation state removed and design version upgraded to `DH-UI-CANONICAL-2.0`.

The worker must remain STOPPED after the reset. No new screen generation may begin until the contract-readiness gate is satisfied for the next canonical task and the user explicitly resumes generation in a later run.

## 11. Source decisions incorporated

This policy extends the locked Dial Health division architecture in `docs/dial/final-audit/04_DIVISIONS/HEALTH_AUDIT.md`, particularly HEALTH-F001 (My Health), HEALTH-F010 (identity/consent), HEALTH-F012 (prescriptions), HEALTH-F014 (claims), HEALTH-F015 (appointments/referrals/queueing), HEALTH-F016 (medicine delivery) and HEALTH-F017 (safety/compliance).

It also incorporates the 2026-09-05 design decision that consumer-facing My Health pages must be warm, progressively disclosed, record/transaction-detail capable, export-aware, evidence-backed and implementation-convertible.
