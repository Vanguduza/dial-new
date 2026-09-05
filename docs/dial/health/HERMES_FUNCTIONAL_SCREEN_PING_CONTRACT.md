# Hermes Functional Screen Ping Contract

**Status:** Canonical Screen Factory control-plane contract  
**Scope:** Dial Health Screen Factory batch-generation pings  
**Authority boundary:** Hermes communicates product functions; Hermes does not design the UI.

## Purpose

Whenever Hermes prepares the next required Screen Factory group, the ping sent to the design/generation model must explain what each screen must **do**. It must not prescribe what the screen should **look like**.

Hermes therefore carries the authoritative functional screen contract: screen identity, user purpose, intended roles, required functions, required user actions, routes/handoffs, states, record/detail obligations, export obligations, evidence and software acceptance rules.

## Hermes must include

For every screen in the ping, Hermes must provide:
- exact `screen_id`, title, business unit and platform;
- intended user roles;
- documented purpose / user outcome;
- required functions/capabilities;
- required user actions;
- next routes and handoffs;
- required states and failure/eventuality states;
- record/transaction detail behaviour where applicable;
- export/download/share behaviour where permitted;
- evidence basis and durable contract source;
- functional acceptance rules and contract-readiness state.
## Hermes must not include

Hermes must not prescribe:
- page layout or composition;
- visual style, colours, typography or decorative language;
- component placement;
- visual density;
- framing/device composition beyond the required platform identity;
- invented UX behaviour not present in the functional contract.

The design/generation authority applies the separate canonical Dial Health visual/UX policy. Hermes may state that this policy exists, but it may not translate that policy into screen-specific visual instructions.

## Ping schema

The prepared request uses `ping_type = FUNCTION_ONLY_SCREEN_GENERATION_PING` and includes a human-readable `functional_message` plus structured `tasks[]` functional briefs.

Each task exposes `required_functions`, `required_user_actions`, `routes_and_handoffs`, `required_states`, `record_detail_requirement`, `export_requirement`, `evidence_basis`, and `software_acceptance_rules`.

A ping is invalid if a required screen is not contract-ready. In that case the factory fails closed at `CONTRACT_BLOCKED`; Hermes must not fill the missing product truth itself.

## Functional acceptance boundary

Every visible control in the resulting screen must map to real software behaviour. Frontends may not manufacture clinical, financial, claims, eligibility, inventory or operational truth. Any necessary function not already documented must be declared as an additional feature with a full Dial Health integration plan before it can be treated as implemented.
