---
name: security-gate
description: Apply Feature Security Profile and negative tests.
version: 2.0.0
---

# security-gate

Use bounded registry context first. Load deeper references only when the current Feature requires them.

Required output:
- Feature ID(s)
- decision/contract refs
- source paths inspected
- finding/change
- tests/evidence
- blockers
