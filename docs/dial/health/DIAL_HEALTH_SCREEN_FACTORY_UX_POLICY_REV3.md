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

The Screen Factory prompt assembler combines canonical function-only contracts with the Rev 3 premium visual doctrine and passes **compact platform-family composition requests** to the curated OpenRouter generation pool. The model is allowed to decide hierarchy, approved region type, prominence and bounded component variant only. It does not write HTML, CSS, state maps, bindings, evidence maps or arbitrary design tokens.

Reference-locked My Health screens use the locally compiled 27-screen premium composition family and consume zero provider requests. Other ordinary screens use one family-level composition request, beginning at 27 screens per request and adaptively ranging from 10 to 40 based on measured QA. Dial compiles each composition independently through the locked premium component system and Playwright. Deterministic QA is the normal acceptance gate. AI criticism/repair is **exception-only** for a failed composition; successful sibling compositions are cached and never regenerated merely because another screen failed.

The previous mandatory lead-designer → art-director → repair → final-auditor committee is retired for production because it multiplied shared API requests and repeatedly re-read/re-wrote full implementations. The Rev 3 visual benchmark remains authoritative through the locked component system, composition constraints, family-diversity checks and fail-closed deterministic QA.

## 4. Quality gates

Consumer screens must be viewport-first, compact, premium and progressively disclosed. My Health ordinary screens above 1.75 viewport heights fail structural QA unless a canonical long-form exception applies.

The existence of a PNG remains insufficient for visual approval, UX green, implementation green, clinical safety green or regulatory readiness.
