# Tooling Use Policy

Which installed plugin, skill or connector to reach for, and when. The intent is
that these fire on the work they were installed for without being asked, and stay
out of the way otherwise.

Nothing here changes the authority hierarchy. Tool output is **evidence or
draft**, never canon. The closure canon §2 order still governs.

---

## Engineering

| Trigger | Use |
|---|---|
| A change touches price, payment, ledger, tax, payout or refund | `engineering:code-review` before commit, then the **money-reviewer** agent. The skill does not replace the gate. |
| A change touches auth, permissions, secrets, uploads, webhooks or external input | `engineering:code-review`, then **security-reviewer** against the feature's Security Profile |
| Triaging findings or deciding what to refactor | `engineering:tech-debt` |
| Before writing tests for a Feature entering implementation | `engineering:testing-strategy` — the acceptance contract supplies the criteria, the skill supplies the shape |
| A decision is deferred, or implementation hits a genuine contradiction | `engineering:architecture` → ADR in `docs/decisions/`. The canon requires a targeted decision record rather than reopening architecture. |
| Preparing a release | `engineering:deploy-checklist` — must produce every field the release model requires: SHA, artifact, migrations, changed Feature IDs, donor changes, SCA/SBOM, contract versions, flags, approver, rollback |
| A customer-visible failure occurs | `engineering:incident-response`, joined to the matching `EV-*` eventuality contract |

## Operations

| Trigger | Use |
|---|---|
| A material eventuality has no runbook | `operations:runbook`. **233 material contracts, 8 test definitions between them** — this is the largest single gap in the canon and the reason the plugin is installed. Runbooks for critical and high cases are a precondition for any branch reaching ACTIVE. |
| Documenting an owner queue's procedure | `operations:process-doc` — must end in the Human OS shape: state → queue → Position → SLA → procedure → evidence → escalation → terminal result |
| Assessing an `ACT-*` activation blocker | `operations:risk-assessment` |
| A schema, migration or long-running workflow change | `operations:change-request` — must carry the expand/contract plan and a rollback or forward-repair path |
| Fiscalisation, data protection, health licensing, insurance characterisation, catalogue IP | `operations:compliance-tracking` against ACT-REG-004/005/006/007/011 |
| Capacity or SLO planning | `operations:capacity-plan` against the 17 NFR profiles |

## Product

| Trigger | Use |
|---|---|
| A Feature is about to enter implementation | `product-management:write-spec` → its **per-feature acceptance contract and permission set**. This is the CT-1 remedy. `SPARE-F001_ACCEPTANCE_CONTRACT.md` is the worked template. Do not start a feature that still shares the generic contract. |
| Sequencing work across the 16 phases | `product-management:sprint-planning`, respecting dependency order — it never reduces scope |
| Reporting outward | `product-management:stakeholder-update` |

## Design

| Trigger | Use |
|---|---|
| Any change to the transition window, EPC surfaces or the cascade | `design:accessibility-review`. Blueprint §3.4 requires AA contrast on committed values and §5.4 requires keyboard and screen-reader equivalents for the hit map. Pairs with `npm run test:e2e`. |
| Copy inside the transition window | `design:ux-copy` — the window permits exactly one headline, so copy is contract, not decoration |
| Porting or retokenising donor components | `design:design-system`, then the **ui-reviewer** agent |
| Specifying a surface for engineering | `design:design-handoff` |

## Connectors

| Trigger | Use |
|---|---|
| Pinning, upgrading or first-importing any dependency or donor | **Context7** (`resolve-library-id`, `query-docs`). CT-3 requires exact version and API facts at import; recalled versions are not evidence. |
| External research the canon does not answer | **Exa**. Record what was found in the decision or donor record — a search result is provenance, not authority. |

## Browser and E2E

`npm run test:e2e` runs the Playwright suite in `tests/e2e/`, mapped clause by
clause to the frozen Blueprint. Run it on any change to `apps/preview-player`.
First run needs `npm run test:e2e:install`.

The vitest suite keeps a structural fallback so CI does not lose the check when
a browser is unavailable, but the Playwright assertions are the real gate: the
vitest one reads source text and cannot see the screen.

## Gated agent tooling

Five donors passed the CT-3 gate with conditions. Dossier:
`../20_IMPLEMENTATION_CLOSURE/03_DONOR_CLOSURE/DONOR_DOSSIER_AGENT_TOOLING.md`

| Donor | When it fires | Condition that binds |
|---|---|---|
| `claude-plugins-official` | Installing any further plugin | Each plugin from it is its own donor and takes its own gate |
| `awesome-design-md` | Authoring `DIAL_DESIGN.md` | Reference for structure only. Never drop in a brand-derived DESIGN.md |
| `taste-skill` | Zone A/B surfaces — brand, homepage, discovery | Bound to the design zone. Barred from Zone C, Zone D and the transition window |
| `impeccable` | Design and accessibility passes | Skills only until the SBOM/dependency scan is green; hooks stay disabled |
| `ponytail` | Deciding whether code needs writing at all | **May not be applied to eventuality/recovery contracts, FRC completeness, evidence requirements or acceptance contracts** |

The ponytail carve-out matters most. Its ladder excludes security, data loss and
accessibility from being cut, but not recovery paths — and a recovery path is by
definition the code that usually does not run, so "does this need to exist?"
reliably answers no. That is already this project's weakest area.

---

## Guardrails

These bind regardless of which tool produced the output.

1. **No tool output is authority.** Canon, then registries, then implementation
   evidence. A skill's draft is a draft.
2. **AI never creates binding truth.** Not fitment, not a payable amount, not a
   ledger entry, not a completion claim. Unchanged by any tool being installed.
3. **A specialist gate cannot be self-certified.** Running `engineering:code-review`
   does not satisfy the money or security reviewer; those are independent agents.
4. **Network tools must not be used to acquire catalogue, EPC or vehicle image
   data.** ACT-REG-011 makes rights and provenance an open activation blocker.
   Scraping around it would create exactly the liability the blocker names.
5. **Third-party plugins and skills enter through the Donor Assimilation Gate.**
   Pinned commit, verified licence and hash, selected paths, supply-chain scan,
   provenance recorded. A plugin is code running in the development environment;
   CT-3 does not exempt it for being convenient.
6. **One memory authority.** Project memory and the DIAL evidence registry are
   the record. Do not install a second memory system alongside them.

---

## Versioned Engineering Knowledge Layer (VEKL)

`DEC-020` makes VEKL v2 DIAL's federated engineering knowledge/capability path. Agent Skills remain governed by the Rev 1 qualification foundation, but skills are now one resource class among official docs/repos/releases/issues/advisories/package registries, qualified tools/plugins/MCPs, DIAL rules/hooks/loops and bounded community corroboration. Active canon:
`DIAL_VERSIONED_ENGINEERING_KNOWLEDGE_LAYER_FEDERATED_RESOURCES_HERMES_v2.md`.

**Every material Oracle packet is evaluated by VEKL after Feature/JIT context resolution.** This is not permission to load a skill or resource catalogue. The resolver emits one persisted Engineering Knowledge Activation Manifest containing the minimal relevant approved resource set. Separately, project-aware Sol→Sonnet ahead-of-work research may pre-cache likely-needed references for the next 3–5 dependency-safe packets; it is read-only, advisory and cannot change programme priority.

External skills remain subject to Guardrail 5. In particular:

- a research-reference commit is not a production pin;
- `DISCOVERED`, `QUARANTINED` or `EVAL_PASSED` is not `APPROVED`;
- an approved vendor record requires exact production commit/path/hash, licence/provenance, scan, DIAL conflict review, deterministic eval and immutable Oracle snapshot;
- vendor skill content is `ENGINEERING_GUIDANCE_ONLY` and cannot satisfy a specialist gate or create product/architecture truth;
- an executing model may not install or update a vendor skill ad hoc to get around the resolver;
- Hermes receives only the packet-scoped approved activation directory; Sonnet fallback receives the exact same skill-version bodies from the persisted manifest;
- a materially refined task may trigger an audited re-resolution before relying on newly relevant specialist knowledge, but silent version drift is prohibited; and
- learned procedural wrappers are staged separately, secret-checked and promoted only through scan/eval/review. They never mutate upstream vendor snapshots.

### Initial external-skill policy

| Task family | VEKL posture |
|---|---|
| Native Android screen/device/navigation/security/performance/camera work | Highest-priority qualification family; activate only approved relevant subset |
| Google WAF review | Cross-cloud principles only; no implicit GCP migration |
| Google Analytics adapter/admin | Adapter guidance only; DIAL customer/order/money/privacy truth remains authoritative |
| Delivery/Courier/Fleet maps | Google Maps replacement auto-blocked by `SKC-MAPS-001` |
| Firebase backend/auth replacement | Auto-blocked unless an explicit architecture-evaluation decision authorises research |
| Dial Health sensitive context | Vendor knowledge may receive code/synthetic fixtures, not identifiable production Health records; marketing/analytics guidance is purpose-gated |

VEKL selection/outcome telemetry is process evidence, not Feature completion evidence. `SKILL_USED`, `SKILL_HELPFUL` and `GATE_PASSED` are separate states and must never be collapsed.

Community/forum evidence is `CORROBORATION_ONLY` or `DISCOVERY_ONLY`; it can generate a hypothesis but cannot establish architecture/security/money/Health/provider truth. Public presearch must use registered allowlisted sources and may not carry secrets, customer/payment records or identifiable Health data. Executable resources such as third-party plugins, tools, MCPs, hooks and workflow loops remain subject to their donor/security/tooling qualification before use.
