# VEKL Interaction, Motion & Product Design Acuity — Rev 1

## Status

Canonical development-system architecture for first-class interaction, motion, responsive behavior and professional product polish.

Authority: `DEC-040`.

## Governing principle

Interaction is not a decorative post-processing step. It is part of product design and must influence visual composition before visual freeze, then receive a dedicated expert interaction/motion pass after visual freeze.

VEKL must reason like a principal product design engineer: it identifies the screen's task, platform, information density, states, actor, capabilities and user journey; retrieves applicable interaction knowledge; evaluates modern patterns; rejects fashionable but inappropriate effects; and compiles a bounded expert packet for Stitch.

## Canonical lifecycle

```text
Product Truth + Screen Registry × Feature Graph
        ↓
FrontendGenerationContext
        ↓
VEKL Interaction Design Preflight
        ↓
Stitch Visual Generation
        ↓
Visual Critique / Convergence
        ↓
VisualAuthorityArtifact
        ↓
VEKL InteractionMotionIntelligence
        ↓
Stitch Expert Interaction/Motion/Product-Polish Pass
        ↓
Interaction Acceptance
        ↓
ExperienceAuthorityArtifact
        ↓
DDE Production Binding
        ↓
Visual + Interaction + Functional Parity
```

## Why there are two interaction stages

`InteractionDesignPreflight` occurs before Stitch visual generation. It prevents an attractive static composition from being structurally hostile to good interaction later. It can require room for rails, sheets, adaptive panes, sticky/docked actions, state/recovery affordances and responsive recomposition without prescribing a fixed layout.

`InteractionMotionIntelligence` occurs after visual freeze. It evaluates the actual accepted composition and determines how to make it behave like a polished production product while preserving visual identity.

## Expert design-acuity model

Every interaction pass considers:

- task clarity;
- information hierarchy;
- interaction discoverability;
- feedback and causality;
- spatial continuity;
- motion purpose;
- platform fluency;
- responsive recomposition;
- state completeness;
- accessibility;
- performance;
- interruptibility;
- density and ergonomics;
- optical polish;
- product/domain specificity;
- recovery and trust.

These dimensions are mandatory review dimensions, not a scoring gimmick. The goal is to force explicit reasoning about why an interaction exists and whether it improves the product.

## Pattern knowledge

`INTERACTION_MOTION_PATTERN_REGISTRY.json` is the admitted seed corpus. It contains context-tagged patterns across:

- information architecture and progressive disclosure;
- professional SaaS workspaces, panels, multi-zone shells, list/detail and command surfaces;
- adaptive navigation and responsive recomposition;
- mobile/touch gestures and haptics;
- commerce/product inspection and feedback;
- loading, empty, offline, degraded, recovery and transaction states;
- motion continuity and hierarchy;
- sticky/docked actions;
- Android-native behavior such as predictive back, edge-to-edge and IME continuity;
- accessibility and reduced-motion equivalents;
- verification, motion tokens and optical-polish review.

The registry is not a checklist. Applicability requires screen/platform/domain tags. Professional desktop patterns must not leak into a consumer mobile screen merely because they are fashionable, and mobile gestures must not be imposed on desktop workflows.

## Pattern decision contract

Every required or strongly applicable pattern must receive one of:

- `ADOPT`;
- `ADAPT`;
- `REJECT`;
- `NO_EFFECT_NEEDED`.

Every decision requires a rationale. `NO_EFFECT_NEEDED` is valid for an individual pattern; skipping expert review is not.

## Bounded structural delta

Visual freeze protects the approved identity, not bad interaction structure.

The interaction pass may make bounded changes required to support behavior, including:

- adding/refining interaction affordances;
- turning static groups into tabs/accordions when justified;
- moving secondary workflows into sheets/drawers;
- adding sticky/docked action regions;
- adding state-feedback locations;
- adding rail/gallery behavior;
- platform/breakpoint navigation adaptation;
- minimum spacing/geometry changes required by interaction.

If interaction quality requires a primary hierarchy change, major section reorder, hero identity change, brand-language change, new major workflow surface or material information-architecture change, the pass must return `RETURN_TO_VISUAL_RECONVERGENCE`. Silent redesign is forbidden.

## Motion hierarchy

Motion intensity follows semantic importance:

1. micro-feedback;
2. component transitions;
3. layout transitions;
4. navigation transitions;
5. hero/brand motion;
6. continuous ambient motion.

Motion must serve feedback, continuity, orientation, causality, hierarchy, accessibility or bounded brand expression. Animation-for-animation's-sake is an anti-pattern.

## Open-world discovery

VEKL's open-world candidate plane is a first-class feeder for interaction/motion knowledge.

Discovery triggers include pattern-coverage gaps, stale platform guidance, a novel interaction class, low-confidence pattern selection and owner requests.

Candidate sources can include official platform documentation, shipped-product UX databases, motion references, component ecosystems and public repositories. Discovery never directly becomes provider guidance. Candidate material follows:

`DISCOVERED → TRIAGED → INVESTIGATING → QUALIFIED → ADMITTED`.

Only admitted knowledge is eligible for routine guidance. External repositories remain `REFERENCE_AND_INSPIRATION_ONLY` under `DEC-039`; raw code/screens/components/assets are not Stitch authority and are not imported into DIAL production by this path.

## Source classes

`INTERACTION_MOTION_SOURCE_REGISTRY.json` distinguishes:

- owner-curated design references;
- official platform guidance;
- motion references;
- accessibility/component behavior references;
- shipped-product UX databases;
- visual inspiration references;
- design-system verification references.

Source authority is explicit. A source may inform VEKL without becoming Product Truth, DesignAuthority, VisualAuthority or implementation authority.

## Stitch contract

The second Stitch pass receives:

- frozen visual authority;
- Screen Registry × Feature Graph context;
- capability envelope;
- design-acuity dimensions;
- selected interaction/motion pattern candidates;
- motion hierarchy;
- bounded structural-delta policy;
- open-world discovery provenance/constraints;
- required structured outputs.

Stitch must emit a machine-readable `dial-interaction-contract` in the generated HTML. DIAL parses and validates this contract before interaction acceptance.

Required structured outputs include:

- `DesignAcuityAssessment`;
- `InteractionOpportunityMap`;
- `PatternDecisionSet`;
- `InteractionIntentMap`;
- `GestureMap`;
- `MotionHierarchyPlan`;
- `MotionSpec`;
- `AdvancedComponentDecisionSet`;
- `ResponsiveInteractionPlan`;
- `StateBehaviorMatrix`;
- `StructuralDeltaDecision`;
- `InteractionRiskRegister`;
- `InteractionAcceptanceMatrix`.

## Acceptance

Experience authority cannot freeze until the interaction pass is proven against, at minimum:

- expert acuity review complete;
- required pattern decisions complete;
- no dead controls;
- capability-backed behavior;
- purposeful/coherent motion hierarchy;
- touch-target validity;
- keyboard/focus behavior where relevant;
- accessibility semantics;
- reduced-motion equivalents;
- performance budget;
- state restoration;
- gesture conflict safety;
- interruptibility;
- responsive recomposition;
- edge-state behavior;
- platform-native behavior;
- optical-polish review;
- structural-delta budget;
- external-reference non-authority.

## Product-development consequence

An interactive frontend is no longer complete when it only looks good and its buttons technically work. It must have a deliberate behavior model, state model, motion grammar, responsive interaction plan, recovery behavior and platform-appropriate ergonomics.

VEKL is responsible for supplying the expert knowledge and context needed to make those decisions; Stitch authors the approved interaction experience inside DIAL authority; DDE binds it to production code without silently redesigning it.
