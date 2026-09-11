# DIAL Workflow Eventuality Standard

For each material FRC, create `EV-<FEATURE>-NNN` rows.

| Category | Required considerations |
|---|---|
| Input | missing, malformed, contradictory, ambiguous, duplicate |
| Identity/permission | wrong actor, revoked session, scope, self-approval |
| Eligibility | provider/item/vehicle/zone/plan ineligible |
| Concurrency | stale version, replay, double accept |
| Capacity | no stock/provider/courier/slot/facility |
| Partial | short pick, part delivery, partial milestone/refund |
| Timeout | provider/customer/external API/approval |
| Cancellation | before/after commitment and compensation |
| Variation | quantity/weight/price/scope/tax/FX |
| Money | auth/capture/callback/refund/reversal/COD/reconciliation |
| Fulfilment | no-show, damage, wrong item, failed handoff |
| Safety/compliance | holds, licence, food/roadside/workplace risk |
| Trust | fraud, collusion, counterfeit, abuse |
| Evidence | missing/conflicting/corrupt/late |
| External dependency | PSP/WA/maps/search/AI/signing/provider outage |
| Connectivity | offline/stale/reconnect conflict |
| Resolution | complaint/case/appeal/compensation/legal hold |
| Accounting | close/unbalanced/reconciliation/tax |
| Data integrity | duplicate/merge/correction/provenance |
| Operator repair | retry/replay/compensation/manual recovery |
| Privacy | access/retention/deletion/legal hold |
| Continuity | site/branch/service outage and recovery |

Each row records condition, detection, allowed state, command, transition, money/inventory/delivery effects, notification, owner, SLA, evidence, compensation, repair and tests.
