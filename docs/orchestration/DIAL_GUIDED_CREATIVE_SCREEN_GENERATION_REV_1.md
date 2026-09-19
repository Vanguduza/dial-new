# DIAL Guided Creative Screen Generation — Rev 1

## Status

Implemented in the DIAL frontend execution path. Provider output remains non-authoritative and must pass DIAL admission/certification.

## Execution model

The governed sequence is:

Project Truth / FRC / VEKL Product Experience -> FDEP -> CreativeDirectionProfile -> DesignFreedomBudget -> EXPLORE -> critic evidence -> deterministic selection -> CONVERGE -> design candidate quarantine/admission -> implementation -> V1-V8 certification.

RECONSTRUCT preserves canonical visual authority and uses low freedom / Stitch REFINE. ASSIMILATE uses medium freedom / EXPLORE. New synthesis uses medium-high freedom / REIMAGINE.

## Creative contracts

- CreativeDirectionProfile: immutable anchors, visual/interaction intent, permitted design degrees of freedom, prohibited creativity and anti-generic requirements.
- DesignFreedomBudget: numeric freedom by design dimension with zero freedom for product semantics, business rules, data truth and security constraints.
- CreativeExplorationPlan: distinct candidate lenses and real Stitch variant settings.
- CreativeScreenGenerationStrategy: binds the above to each governed FDEP surface.
- Deterministic critic selection: hard gates first, weighted qualitative dimensions second, quality floor, lexical tie-break.

## Stitch execution

The Google Stitch adapter now uses provider-native operations rather than prompt simulation:

1. generate_screen_from_text creates the governed seed.
2. generate_variants performs bounded EXPLORE/REIMAGINE/REFINE candidate generation.
3. Each result is downloaded, sanitized, quarantined and hash-bound.
4. Critic evidence is required before selection.
5. edit_screens refines the selected candidate during CONVERGE.
6. The converged result re-enters the existing DIAL candidate admission and V1-V8 certification path.

Provider output cannot mutate Project Truth, FRCs, design authority, tokens, patterns or product semantics.

## Dial a Spare Android proof

The proof target is the real SPARE-F001 Development Unit (Vehicle selection & garage) on DIAL_CONSUMER, rendered through JETPACK_COMPOSE.

The Unit already binds PREMIUM_SOLUTIONS_ENVIRONMENT as design authority. Therefore the correct strategy is RECONSTRUCT, not unconstrained synthesis. The design system permits two authority-preserving candidate directions under low freedom and Stitch REFINE.

Automated tests cover:
- real SPARE-F001 FDEP compilation;
- strategy determinism and authority-sensitive freedom budgets;
- fail-closed critic scoring and deterministic selection;
- Stitch variants/refinement adapter authority boundaries;
- governed prompt content;
- full explore -> quarantine -> critic -> select -> refine -> candidate-manifest execution.

## Live Stitch status — 2026-09-18

A live generation attempt was executed against the installed Stitch SDK using the real SPARE-F001-derived Android design packet.

Observed:
- target: DIAL_CONSUMER / Android;
- execution mode: RECONSTRUCT;
- provider creative range: REFINE;
- requested candidates: 2;
- prompt size: 19,766 bytes;
- provider result: STITCH_AUTH_REQUIRED;
- Stitch credential configured in runtime: false.

This is an external authentication blocker, not a successful visual generation. No screen is claimed to have been generated. Once a valid STITCH_API_KEY, or STITCH_ACCESS_TOKEN plus GOOGLE_CLOUD_PROJECT, is made available to the governed runtime, the implemented path can execute without a code change.
