# DIAL VEKL External Repository Reference & Inspiration Policy — 2026-09-19

## Authority

Owner-locked `DEC-039`.

## Canonical rule

External repositories formerly described as **donors** are non-authoritative research references only.

VEKL may learn from them by extracting abstract architecture patterns, UX/interaction ideas, visual inspiration, anti-patterns, trade-offs, test ideas, provenance/licence context and public implementation lessons.

VEKL, DDE, Stitch and implementation workers must not use an external repository as Product Truth, business/state-machine authority, source of truth, DesignAuthority or VisualAuthority. Normal workflows must not copy, port, fork, vendor, preserve or assimilate its code, components, assets, schemas, business logic or pixel layout into DIAL production.

A literal third-party dependency or code adoption is a different operation. It requires a separate explicit owner authorization plus dependency, licence, security, provenance, version-pin, conflict and verification qualification. Reference research can never silently authorize adoption.

## Frontend consequence

The canonical frontend chain remains:

`Product Truth → Screen Registry × Feature Graph → authoritative domain/catalog/EPC truth → VEKL design knowledge → Stitch visual authorship → VisualAuthority freeze → Stitch interaction/motion enrichment → ExperienceAuthority freeze → DDE production binding`

External repositories may contribute only synthesized abstract inspiration descriptors before Stitch generation. Raw repository code/screens are not design authority and are not provider inputs by default.

## Legacy semantics

`DONOR_ADAPT`, `DONOR_PRESERVE`, `DONOR_ASSIMILATION`, `DONOR_ADAPTATION`, `PORT-WHOLESALE`, donor-parity gates and direct donor port routes are superseded where they imply implementation reuse. Historical documents remain provenance and may be consulted to understand prior decisions, not to reactivate them.

## Verification invariant

A VEKL/reference-aware task is conforming only when all of these are true:

- external references are marked non-authoritative;
- no production import/runtime dependency is implied;
- raw external source is not sent to a design provider as authority;
- generated frontend remains DIAL-native;
- candidate critique blocks external brand/authority/code/asset/schema/pixel copying;
- implementation acceptance does not require donor parity;
- any literal dependency adoption has a separate owner-authorized qualification record.
