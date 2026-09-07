---
name: dial-android-testing-setup
description: DIAL-safe Android testing analysis and setup procedure that preserves the existing DI/build/test stack by default and derives coverage from Feature/FRC/security contracts.
license: Apache-2.0; see LICENSE.txt and PROVENANCE.json
---
# DIAL Android Testing Setup

Use only after resolving the Feature/FRC, security profile, eventualities and current repository test/build configuration.

## Hard boundaries
- Analyse the existing Android test stack before proposing changes.
- Do not install Hilt, Koin, Mockito, Robolectric, screenshot frameworks, Gradle plugins or any other dependency automatically.
- Do not create or rewrite `AGENTS.md`, project truth, build architecture or DI architecture as part of test setup.
- Exact dependency additions require the normal DIAL donor/tooling gate and an authorised packet.
- Tests must prove the FRC/security/eventuality criteria; this skill does not invent acceptance criteria.
- Passing tests do not self-certify security, UI, NFR, release or Feature gates.
- Use synthetic/test data only; no secrets or identifiable Health/customer data.

## Procedure
1. Inventory existing unit, instrumented, Compose UI, screenshot and journey test infrastructure.
2. Map each required acceptance criterion and applicable security/eventuality rule to an executable test or explicitly record the gap.
3. Prefer the existing repository test libraries and patterns.
4. Add only the smallest test support needed for the authorised criterion. If a new dependency is necessary, stop at the donor/version decision boundary unless the packet explicitly authorises it.
5. Keep production refactors separate from test harness changes unless the FRC requires testability changes and the packet authorises them.
6. Run narrow tests first, then the repository's required Android/full verification gates.
7. Record exact commands, device/emulator state where relevant, pass/fail counts and evidence references.
8. Report untested criteria as blockers; never convert missing evidence into a pass.
