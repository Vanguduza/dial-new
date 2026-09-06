# My Health — Additional Features & Integration Plan Rev 2

**Status:** CANONICAL DESIGN INTEGRATION PLAN  
**Applies to:** My Health Android, iOS and responsive web platform packs  
**Policy:** `DIAL_HEALTH_SCREEN_FACTORY_UX_REV2`

This file documents UX capabilities that are now required because the prior screen evidence was too dense and operational for a customer-facing product. These additions are product requirements, not decorative design suggestions.

## AF-MH-001 — Progressive disclosure framework

**Need:** prevent consumer pages from presenting too much information or too many simultaneous decisions.  
**Owner:** `health/my-health` frontend + relevant domain read-model owners.  
**Data impact:** none by itself; disclosure state is view state and must not mutate authoritative records.  
**API/service impact:** existing summary endpoints should expose concise list/summary projections; detail endpoints remain authoritative for complete records.  
**Events:** optional local analytics such as `my_health.section_expanded` must contain no PHI payload.  
**Security/privacy:** hidden/collapsed content is not an access-control mechanism; the server still enforces entitlement and consent.  
**Audit:** no clinical audit event for simple disclosure; opening sensitive records follows normal record-access audit policy.  
**QA:** enforce consumer density limits, keyboard/screen-reader disclosure semantics and state restoration.  
**Rollout:** introduce reusable DisclosureSection / FocusedDetailSheet components, then migrate My Health screens sequentially.

## AF-MH-002 — Universal record/transaction detail contract

**Need:** every record or transaction teaser/list item must open a complete focused detail experience.  
**Owner:** owning health domain service plus My Health presentation layer.  
**Data impact:** no frontend duplication of record truth; use canonical record identifiers and version/provenance metadata.  
**API/service impact:** each collection must have a stable detail read contract or resolver capable of returning the complete permitted record.  
**Events:** `record_detail_opened`, domain-specific query/dispute/payment events where appropriate.  
**Security/privacy:** enforce patient/delegate scope, purpose-of-use, step-up for sensitive content and revocation propagation.  
**Audit:** opening clinical, claim, financial or identity records must use the domain audit/evidence contract.  
**QA:** collection → detail navigation, deep links, stale/version conflicts, permission denied, offline read and return-context preservation.  
**Rollout:** map each My Health collection to an existing detail screen where one exists; otherwise use a focused detail sheet until a dedicated route is warranted.

## AF-MH-003 — Functional export framework

**Need:** records, transactions, statements and reports must be exportable when permitted.  
**Owner:** Document/Report service + owning clinical/claims/finance domain; My Health only requests and presents the result.  
**Data impact:** export jobs reference canonical record IDs and version snapshots; the browser/app does not reconstruct authoritative PDFs/CSVs from visible text.  
**API/service impact:** standard export request/status/download contract supporting permitted formats such as PDF, CSV or structured clinical document where applicable.  
**Events:** `export.requested`, `export.ready`, `export.downloaded`, `export.failed`, including actor, purpose and record reference but no unnecessary payload.  
**Security/privacy:** step-up where needed; expiring signed download; consent/delegation check; anti-enumeration; no public URLs.  
**Audit:** every sensitive export is auditable with record/version, actor, scope and outcome.  
**QA:** permission failures, revoked consent, expired links, offline queueing, retry/idempotency, redaction and locale/date correctness.  
**Rollout:** create a reusable ExportAction contract and attach it first to Claim Detail, Result/Report Detail, Prescription Detail, Documents, Health Timeline, Payments/Shortfalls and Support case detail.

## AF-MH-004 — Consumer summary/read-model split

**Need:** warm low-density pages require concise summaries without moving business truth into the frontend.  
**Owner:** health domain APIs/read-model layer.  
**Data impact:** add purpose-built summary projections with source timestamp/version and link to canonical detail identifiers.  
**API/service impact:** summary responses must be bounded and paginated; avoid returning full claim/result/payment payloads to home screens.  
**Events:** normal read telemetry only, privacy-minimised.  
**Security/privacy:** same entitlement rules as detail data; summaries must not leak restricted fields.  
**Audit:** according to the sensitivity of the underlying domain.  
**QA:** summary/detail consistency, freshness, partial-source degradation and no frontend-calculated authoritative values.  
**Rollout:** Home / Today, Medical Aid Overview and Appointment Journey are the first consumers.

## AF-MH-005 — Implementation-evidence bundle

**Need:** every design must be straightforward to convert into working software and must prove why each visible feature exists.  
**Owner:** Screen Factory / frontend architecture.  
**Data impact:** none.  
**API/service impact:** none directly; packet bindings name the expected service/read model.  
**Events:** factory audit events only.  
**Security/privacy:** generated examples use fictional/synthetic Zimbabwe context only; no production PHI.  
**Audit:** every screen bundle contains contract, evidence map, interaction map, state map, data bindings, component contracts and QA record.  
**QA:** every actionable control must have an interaction mapping; every authoritative value a data binding; every feature an evidence source.  
**Rollout:** mandatory for every regenerated screen under design system 2.0.

## Platform-pack inclusion

The Screen Factory copies this canonical plan into each My Health platform pack and appends any screen-specific `PROPOSED_BY_DESIGN` additions discovered later. A final platform ZIP is not produced until all REQUIRED screens on that platform are generated and the integration document is present.
