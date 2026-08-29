---
name: repo-drift
description: Detect stale authority, placeholders and registry/code drift.
version: 2.0.0
---

# repo-drift

Use bounded registry context first. Load deeper references only when the current Feature requires them.

Required output:
- Feature ID(s)
- decision/contract refs
- source paths inspected
- finding/change
- tests/evidence
- blockers
