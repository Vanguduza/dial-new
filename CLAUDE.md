# DIAL Engineering Authority

Build DIAL from the v2 Implementation Closure & Build-Ready Canon.

## Always

1. Identify Feature ID(s).
2. Run bounded context retrieval.
3. Inspect current code/tests before proposing changes.
4. Use the concrete FRC states/commands/queries/events.
5. Apply Security Profile + Material Eventuality contracts.
6. Trigger Money/Security/Donor/Health/NFR/UI/Migration reviewer when applicable.
7. Record fresh tests/evidence before advancing a gate.
8. Preserve DIAL source-of-truth boundaries.

## Never

- invent a hidden product decision;
- use old v4/D-number docs as active authority when v2 supersedes them;
- let AI or donor code create a second money/identity/fulfilment/health authority;
- expose secrets/service-role keys;
- mark a feature complete from code inspection alone;
- start broad research when canon/current code already answers the question;
- load the entire master pack when bounded context is sufficient.


## GMPC integration lock

For any `GMPC-F*` feature, read the bounded context plus the canonical GMPC source at
`docs/dial/final-audit/27_GROWTH_MARKETING_PROMOTIONS/DIAL_GROWTH_MARKETING_PROMOTIONS_CONTROL_CENTRE_REV2.md`.
Commercial retrieval consumes DKRF; pricing/margin consumes `PLAT-F014`; money consumes Finance/Ledger; external marketing services are governed adapters. Do not create a second RAG, CRM/customer authority, pricing engine, promotion money authority or ad-spend ledger. Sensitive Health data is not ordinary marketing context.

## Oracle orchestration / Claude chat operator mode

When the `dial-oracle-control` MCP/chat-control bridge is available, Claude chat is the owner-facing control console, not the process that keeps development alive. Use the typed `dial_*` control tools to read status/progress and to submit, pause, resume, reprioritise or approve DIAL work. Oracle owns the persistent `dial-development-root` mission, worker dispatch and recovery.

- `Status`/progress questions must be answered from Oracle mission/control-plane evidence, not inferred from conversation history.
- `Resume` means resume the persistent Oracle mission; it does not mean start an ad-hoc chat-local coding loop.
- A Claude session ending or reaching its usage limit does not pause the Oracle mission.
- Do not expose or request a generic shell through the chat bridge.
- The bridge is DIAL-only. Never query, control or import state from other Hermes projects.
- Direct repository development remains blocked until the external Hermes production gate is green.

Architecture: `docs/orchestration/DIAL_CLAUDE_CHAT_CONTROL_BRIDGE.md`.

## Tooling

Installed skills and connectors fire on the work they were installed for.
Which, and when: `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/TOOLING_USE_POLICY.md`

The load-bearing ones:
- a Feature entering implementation needs its own acceptance contract first
  (`product-management:write-spec`) — the generic one is not a contract;
- a material eventuality without a runbook gets one (`operations:runbook`);
- pinning or importing any dependency or donor uses Context7 for exact version
  facts — recalled versions are not evidence;
- changes to the transition or EPC surfaces run `npm run test:e2e`.

No tool output is authority, and running a review skill does not satisfy the
independent reviewer gate it resembles.

Entry:
`node agent-system/bin/context-get.mjs <FEATURE_ID>`

Closure:
`node agent-system/bin/v2-closure-check.mjs`

Verify everything:
`npm run verify`
