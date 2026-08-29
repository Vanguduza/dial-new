# DVTG implementation plan

## Outcome

Deliver a production-shaped vertical slice that proves the generator, review, delivery and navigation contracts without pretending that an unlicensed vehicle reference is production-ready.

## Product truth

- `VISUAL_FAMILY_ID` owns recognition assets, motion and hotspot geometry.
- `FITMENT_ID + VISUAL_CATEGORY_ID` exclusively owns EPC routing.
- The visual pack never infers parts, engines, transmissions or diagram IDs.
- Approved source provenance is a hard gate. Development fixtures are permanently marked non-publishable.

## Incremental delivery

1. **Contracts and guards** — typed job/EPC/hotspot/motion contracts, licence and hash validation, deterministic job identity.
2. **Resumable generation spine** — sixteen persisted stages with input/config/output hashes, restart boundaries, failure reasons and events.
3. **Pluggable media adapters** — deterministic development providers first; credential-gated live interfaces for CGI and future technical/depth providers.
4. **Deterministic spatial grammar** — immutable identity landmarks, fixed explosion destinations, normalized invisible hit regions and configurable continuous motion profile.
5. **Reviewable delivery** — desktop/mobile AVIF sequences, focus states, QA metrics, mandatory contact sheet, approval gates, complete manifest.
6. **Runtime proof** — automatic Search-triggered Hero → CGI → Line art → continuous explosion, progressive preloading, invisible category-family hit map and exact sample EPC route.
7. **Production hardening** — replace the development source with approved references; configure live providers and object storage; add worker isolation, archive scanning and signed URLs at the deployment boundary; complete human approvals.

## Catalog v2 integration

- Generated navigation packs use `VisualEpcMapping` schema `2.0.0`.
- Mappings carry catalog release, family, optional true variant, chassis/engine context, structured section/group targets and readiness requirements.
- Public routes are derived from the mapping; authored `landingSlug` URLs are no longer catalog data.
- Visible body components resolve to DIAL-owned component families before entering the exact selected vehicle's Body & Exterior section.
- Diagram IDs are global DIAL identifiers. Upstream source node IDs remain scoped provenance only.
- The preview EPC follows the existing Nissan GT-R Megazip-inspired interaction structure: breadcrumb hierarchy, dense assembly grids, desktop 60/40 diagram/parts split, mobile stacking and bidirectional hotspot/row focus.

## Acceptance proof

- Valid source creates a deterministic job ID; a changed source/config creates a new identity.
- Successful unchanged stages are skipped; `--from` reruns the named stage and everything after it.
- Unapproved, corrupt, oversized, unsupported or hash-mismatched sources fail before image processing.
- All enabled categories have a deterministic explosion plan, a valid invisible hit region and an explicit EPC category-family mapping.
- Desktop and mobile sequence manifests stay within their frame budgets and begin from a lightweight poster.
- Touch, reduced motion, direct-EPC and static fallbacks preserve EPC navigation without exposing progress or playback controls in the transition window.
- QA failure is blocking; human approval gates remain explicit and auditable.

## Deliberate boundary

The repository does not claim to have generated a production Hilux pack because no approved Hilux photographs or live generation credentials were supplied. The bundled fixture validates system behavior while keeping this limitation impossible to overlook.
