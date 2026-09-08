# GMPC-F081 — Local Discovery Acceptance Contract

**Status:** Canonical planning/acceptance authority. Implementation remains `SPECIFIED` until code, tests and evidence satisfy this contract.

| | |
|---|---|
| Feature | `GMPC-F081` |
| Aggregate | `GoogleBusinessLocalProfileOperations` (historical aggregate name retained for compatibility; provider-neutral behaviour is required) |
| Surface | `GMPC-P082` Local Discovery |
| Governing canon | `27_GROWTH_MARKETING_PROMOTIONS/DIAL_GROWTH_MARKETING_PROMOTIONS_CONTROL_CENTRE_REV2.md` §22 |

## P0 requirements

1. A public location/service-area page exists only when canonical DIAL organisation/provider truth proves real operating coverage. Keyword demand never manufactures a location.
2. Business name, address or service area, approved phone/contact channel, opening/service hours, fulfilment/service capability and external profile IDs reconcile to canonical organisation/location truth.
3. Provider connectors (Google Business Profile or another approved service) are execution/sync surfaces behind the DIAL Tool Gateway, never location truth.
4. Duplicate external profiles, duplicate location entities and duplicate/doorway local landing pages are detected and resolved to one canonical identity.
5. Local structured data and public page facts match the canonical location/provider entity.
6. Review/rating signals are ingested only through authorised evidence sources, retain provenance/freshness and are never fabricated, rewritten as customer testimony or silently merged across businesses/locations.
7. Local posts/content cannot claim inventory, service capability, hours, price, delivery area or emergency availability that canonical operations cannot fulfil.
8. Service-area changes invalidate affected local pages/profile projections and trigger indexability/profile reconciliation.
9. External writes are idempotent, capability-scoped, audited and show stale/degraded/failed connector state.
10. Public Health-adjacent/provider discovery requires compliance approval and never derives from patient/member-specific data or targeting.
11. Local-discovery performance links to qualified demand and downstream booking/order/fulfilment/contribution where applicable.
12. Hermes may recommend local opportunities and content but cannot create a location, synthesize reviews or override location/indexability truth.

## Mandatory acceptance scenarios

1. A real active branch/provider location publishes one canonical page/profile projection with matching name/service area/hours.
2. A proposed location with search demand but no canonical operating coverage is rejected.
3. Duplicate provider/profile/location records are flagged and cannot both remain canonical.
4. Closing or suspending a location updates public availability, indexability and external profile state without pretending service remains active.
5. A stale connector displays stale/degraded state and preserves last-known evidence rather than showing false current values.
6. A review without authorised source/provenance cannot affect public rating/review output.
7. An AI-generated local post containing unsupported hours, price, inventory or service-area claims is blocked.
8. A Health-adjacent public listing cannot access or infer member-specific health information.
9. Local structured data exactly matches visible/canonical location facts.
10. Organic/local discovery sessions can be measured through downstream qualified demand without leaking private data to the search/profile provider.

## Required implementation evidence

- canonical location/provider reconciliation tests;
- duplicate detection tests;
- provider connector idempotency and degraded-mode tests;
- local structured-data validation;
- review provenance/freshness tests;
- service-area invalidation/indexability tests;
- privacy/compliance negative tests;
- end-to-end local discovery -> qualified demand evidence when downstream domains are active.
