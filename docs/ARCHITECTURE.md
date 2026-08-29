# DVTG architecture decisions

## Data authority

The pack manifest carries `visualFamilyId`; the separate EPC mapping carries `fitmentId`. Runtime selection always looks up the exact pair rather than deriving fitment from pixels.

## Resumability and idempotency

Every stage is recorded under `.dvtg/job-state.json` with stage, input and configuration hashes. A stage can be skipped only when those hashes still match. The CLI can invalidate a named stage and all downstream work.

## Provider isolation

CGI and technical generation are interfaces. The deterministic adapter creates reproducible synthetic media for local development. The live CGI adapter refuses to run without explicit provider configuration; no silent placeholder is substituted.

## Security boundary

The local vertical slice validates source type, decoded image integrity, size, hash, schema and licence metadata. Production deployment must add isolated workers, malware/archive scanning, signed storage URLs and network egress policy around these same contracts.

## Degradation ladder

Sequence canvas → static exploded navigator → hero plus category grid → text vehicle identity plus standard EPC links. Visual failure never blocks parts discovery.
