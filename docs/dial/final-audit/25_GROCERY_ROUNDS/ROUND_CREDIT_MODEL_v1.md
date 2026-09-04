# NON-AUTHORITATIVE COMPATIBILITY POINTER

The old Round Credit Model doctrine is superseded and its content has been removed from the active source-of-truth system.

Current authority: Section 7 of `docs/dial/canon/DIAL_SOURCE_OF_TRUTH_MASTER_PLAN_v1.2.md`.

`credit` may survive temporarily in implementation identifiers only as a migration alias. It must not imply a wallet, cash balance, contribution-weighted governance or a second money authority. Existing code that still enforces weighted voting or old exit semantics is an `IMPLEMENTATION_CONFLICT` and cannot inherit higher readiness until migrated and retested.
