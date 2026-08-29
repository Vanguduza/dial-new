---
name: money-path
description: Audit DIAL money flow from source event through PaymentIntent/AccountingEvent/Ledger/reconciliation.
version: 2.0.0
---

# money-path

Use bounded registry context first. Load deeper references only when the current Feature requires them.

Required output:
- Feature ID(s)
- decision/contract refs
- source paths inspected
- finding/change
- tests/evidence
- blockers
