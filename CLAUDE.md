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
9. After Feature/JIT context, resolve/confirm the VEKL v2 Engineering Knowledge Activation Manifest before material implementation. Skills are one governed resource class among official docs/repos/releases/issues/advisories/tools/rules/hooks/loops and bounded community corroboration; a valid result may contain no external executable skill.

## Never

- invent a hidden product decision;
- use old v4/D-number docs as active authority when v2 supersedes them;
- let AI or donor code create a second money/identity/fulfilment/health authority;
- expose secrets/service-role keys;
- mark a feature complete from code inspection alone;
- start broad research when canon/current code already answers the question;
- load the entire master pack when bounded context is sufficient;
- treat an external/vendor resource, community/forum result, learned wrapper, session-memory hit or model prior as product/architecture/gate authority;
- activate a skill/plugin/tool/hook/MCP from a research reference or mutable upstream branch — executable VEKL resources require the applicable exact-version donor/security/eval provenance;
- let ahead-of-work research reprioritise the Development Plan or send secrets, payment/customer records or identifiable Health data to public research sources.


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

## VEKL engineering-knowledge lock

Canonical VEKL v2: `docs/dial/final-audit/06_DEVELOPMENT_SYSTEM/DIAL_VERSIONED_ENGINEERING_KNOWLEDGE_LAYER_FEDERATED_RESOURCES_HERMES_v2.md` (`DEC-020`). Rev 1 remains provenance for the qualified immutable-skill substrate.

VEKL is not limited to Google/Android Agent Skills. It federates relevant official documentation, repositories, releases, issues/discussions, package/advisory data, qualified tools/plugins/MCPs, DIAL rules/hooks/loops and bounded community evidence. For material Oracle packets, deterministic VEKL resolution follows canonical Feature context and persists one activation ID/hash containing both skills and selected resources. Sol and Sonnet must retain the same activation provenance.

Hermes also runs project-aware **ahead-of-work research**: exact Sol, then exact Sonnet fallback, reads Project Truth + the active Development Plan + mission/checkpoint context and forecasts the engineering knowledge likely needed for the next 3–5 dependency-safe packets. It may pre-cache approved reference sources but may not edit the repo, install anything, change programme priority, disclose sensitive data or treat community evidence as authority. If the concrete task materially changes after inspection, use audited VEKL re-resolution before relying on newly relevant knowledge.

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
