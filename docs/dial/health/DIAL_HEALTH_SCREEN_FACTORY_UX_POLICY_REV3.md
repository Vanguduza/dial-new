# Dial Health Screen Factory UX Policy — Rev 3

**Status:** Canonical; supersedes Rev 2 for all new generation after 2026-09-05.  
**Design system:** `DIAL_HEALTH_UI_CANONICAL_3_0`  
**Factory policy:** `DIAL_HEALTH_SCREEN_FACTORY_UX_REV3`

## 1. Scope

Rev 3 preserves all Rev 2 functional, evidence, privacy, progressive-disclosure, implementation-handoff and packaging rules, and adds the premium visual-quality standard defined in `DIAL_HEALTH_PREMIUM_SCREEN_QUALITY_STANDARD_REV3.md`.

The user-supplied premium My Health reference screens are the visual-quality benchmark. They are not a source of product truth and do not override the canonical screen registry or contracts.

## 2. Reset

All Screen Factory render evidence generated before this policy is rejected. Outputs, local platform packs and generation completion state are reset to zero while the 1,539 REQUIRED canonical tasks remain intact.

## 3. Generation architecture

Hermes remains the functional-requirements courier. It does not invent screen-specific visual design.

The Screen Factory prompt assembler combines the Hermes function-only brief with the Rev 3 premium visual doctrine and passes that calibrated prompt to the curated OpenRouter generation pool.

Every screen uses a lead designer/compiler pass plus an independent art-director pass. Drafts below 90/100 or with any critical visual defect must be repaired and re-audited before deterministic rendering is accepted.

## 4. Quality gates

Consumer screens must be viewport-first, compact, premium and progressively disclosed. My Health ordinary screens above 1.75 viewport heights fail structural QA unless a canonical long-form exception applies.

The existence of a PNG remains insufficient for visual approval, UX green, implementation green, clinical safety green or regulatory readiness.
