# Blueprint-to-Donor Capability Mapping Standard (BDCM)

## Purpose
Prevent DIAL requirements disappearing because donors lack them and donor excess entering merely because it exists.

## IDs
`BDCM-<MODULE>-NNN`

## Required fields
| Field | Required content |
|---|---|
| Dial Main Feature ID | Stable DIAL requirement/feature |
| Blueprint source | Canonical source location |
| Dial Main Requirement | Exact behavior |
| User Goal | Why the feature exists |
| Workflow Position | Upstream/downstream context |
| Required UX | Intended interaction |
| Backend Behavior | Mechanics/state transitions |
| Required Data | Inputs/state/output/provenance |
| Required Integrations | Connected modules/adapters |
| Required Edge Cases | Failures/eventualities |
| Donor Role | Behavioral/UX/Visual/Architecture/etc. |
| Donor Feature | Closest capability |
| Donor Coverage | Full / Partial / None |
| Behavioral Similarity | 0–100% target |
| UX Similarity Desired | Low / Medium / High / Very High |
| Reusable Lessons | Mature knowledge |
| Missing Dial Capability | What donor lacks |
| Donor Excess | What must not enter DIAL |
| Required Customisation | Required divergence |
| Dial Enhancement | Better-than-donor behavior |
| Implementation Strategy | Native / Reconstruct / PORT-WHOLESALE / Integrate-service / Reference |
| Acceptance/Test Mapping | Proof |
| Evidence Confidence | A+ / A / B / C / D / U |

## Bidirectional requirement
For every strategic donor run DIAL → donor mapping and donor → DIAL adopt / modify / reject.

## Completeness gate
No module enters donor-driven implementation while an applicable important blueprint feature lacks BDCM record, implementation strategy and acceptance proof.

Donor limitations are never DIAL scope limitations.
