# Build-Ready vs Activation-Ready

v2 deliberately separates software readiness from external commercial/regulatory readiness.

A red `ACT-*` item **does not prevent building the architecture** when `can_build_now=true`.

It prevents switching the affected capability/division to `ACTIVE`.

## Status ladder

```text
DESIGN_CLOSED
→ BUILDABLE
→ CODE_PRESENT
→ DOMAIN_TESTED
→ INTEGRATION_GREEN
→ STAGING_GREEN
→ CERTIFIED_DORMANT
→ ACTIVATION_BLOCKERS_GREEN
→ ACTIVE
```

## Why

DIAL should not wait for every commercial contract before writing code, but it also must not convert an assumed provider/legal arrangement into production behavior.

Every activation blocker contains:
- affected domains;
- what can safely be built now;
- exact evidence needed before live use;
- owner;
- state.

Command Centre must surface activation blockers as first-class portfolio constraints.
