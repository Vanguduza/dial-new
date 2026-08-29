# DIAL Master Data Governance

DIAL cannot be coherent if each division creates its own version of the same person, vehicle, provider, product, address, currency or position.

## Rules

1. Every master entity has exactly one canonical owner.
2. Other domains store typed references plus their own relationship facts.
3. Display names are never identity keys.
4. Merge is a domain command, not a SQL delete/update.
5. Merge preserves lineage, aliases and references.
6. Historical facts remain historically true after a master record changes.
7. Conflicting evidence may remain as competing claims until resolved.
8. Search projections may duplicate data for performance; they never become authority.
9. Imports go through landing/normalize/dedupe/review before canonical write.
10. Sensitive merges require stronger verification and audit.

## Delete vs retire

Prefer:
- deactivate;
- retire;
- supersede;
- end-date;
over deletion when the record participates in historical transactions.

## Cross-division examples

- the same person can be Customer, Employee, Technician and Organization Member without four person records;
- the same vehicle serves Spare, Fleet, Assist, Care and Vehicle Hub;
- the same supplier can sell Spare and provide B2B services through separate relationships;
- Finance dimensions reference canonical BU/legal entity/cost centre versions.

## Master data stewardship

Command Centre exposes:
- duplicate candidates;
- unresolved conflicts;
- stale verification;
- failed imports;
- merge activity;
- provenance gaps;
- data-quality score by master family.
