# DIAL — development start prompt

Paste the block below into a fresh agent session opened at the repository root.
It is written to be self-contained: it assumes no memory of how the repository
reached this state, and it names where every claim can be checked.

Replace `<FEATURE_ID>` before sending. **Do not send it without a Feature ID** —
an unbounded "build DIAL" prompt is the thing this project's hooks exist to
reject.

---

```text
You are joining DIAL, a Zimbabwe multi-trade services marketplace, as an
engineer. Read this whole prompt before touching anything.

## Your task

Take <FEATURE_ID> from its current gate to DOMAIN_TESTED, with its own
acceptance contract, proven against real CI.

One feature. Not a fan-out. If the work reveals that a second feature must move
first, say so and stop rather than widening scope on your own.

## Where authority lives — and what is not authority

- `CLAUDE.md` at the repository root is the standing instruction. Read it first.
- `agent-system/canon/PROJECT_TRUTH.md` is canonical truth.
- `agent-system/registries/FEATURE_REGISTRY.json` holds all 309 features, their
  gate, aggregate, code paths, test paths and evidence.
- `agent-system/registries/DECISION_LOG.json` holds locked product decisions.
  DEC-001..007 are LOCKED. Do not reopen one; if your work contradicts a locked
  decision, that is a finding to report, not a decision to revisit.
- `docs/dial/final-audit/00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_2.md` is
  the active development plan.
- `docs/dial/final-audit/00_MASTER/BUILD_READINESS_SCORECARD.json` is the live
  state, including `known_not_done`. Read that list before claiming anything is
  finished.

Not authority, no matter how it reads: your own tool output; a passing test suite
as evidence of correctness beyond what it tests; a document you just wrote; any
donor's README. `npm run verify` passing means the gates pass, not that the design
is right.

## Start here, every time

    node agent-system/bin/context-get.mjs <FEATURE_ID>

That gives you bounded context: the feature's FRC, security profile, material
eventualities and current source. Use it. Do not load the master pack — it is
thousands of lines and loading it is how agents lose the thread.

Then read the existing code and tests for the feature before proposing anything.
Inspect first, then design. The registry's `code_paths` and `test_paths` tell you
where to look.

## The one rule that governs everything

**A feature entering implementation gets its own acceptance contract first. The
generic contract is not a contract.**

23 dedicated feature acceptance-contract documents existed before the GMPC extension; the registry now has 309 features and every newly allocated `GMPC-F*` feature still requires its own contract before implementation. Yours probably does not. Write it before you write
code, using `product-management:write-spec`, and model it on
`docs/dial/final-audit/20_IMPLEMENTATION_CLOSURE/01_FEATURE_CONTRACTS/SPARE-F004_ACCEPTANCE_CONTRACT.md`.

Read that example properly, especially its "Non-goals, and why" section. A
contract earns its value by refusing to claim what the code does not do. The
registry will name your feature something generic and give it a CRUD-shaped
lifecycle it does not have; saying so plainly is the first useful thing a contract
does.

Each criterion must be independently testable and must name the test that proves
it. A criterion no test covers is not a criterion.

## The gate ladder

    SPECIFIED -> DESIGN_CLOSED -> BUILDABLE -> CODE_PRESENT -> DOMAIN_TESTED ->
    INTEGRATION_GREEN -> STAGING_GREEN -> CERTIFIED_DORMANT ->
    ACTIVATION_BLOCKERS_GREEN -> ACTIVE

To claim DOMAIN_TESTED you need all four of:

1. every acceptance criterion covered by a test that runs — not one that skips;
2. `npm run verify` green (13 steps, currently 196 tests, none skipped);
3. `node agent-system/bin/source-map.mjs` accepting the claim, which requires
   `code_paths` and `test_paths` to exist and resolve;
4. a CI run of the commit carrying the claim, on Linux, green — recorded by run id
   and commit SHA in the feature's `evidence_refs`.

A gate advanced without all four is a lie in a registry, and it will be believed
later by someone who cannot check it.

## What is true right now

Be sceptical of anything that sounds more finished than this:

- One feature — SPARE-F004 — has ever been proven against real CI. Its contract
  was written and proven by the same agent, and the reviewer gate on it is
  unresolved in the record.
- All eleven activation blockers (ACT-REG-001..011) are OPEN. Nothing ships to a
  real customer taking real money.
- No catalogue has been injected. The eleven-stage readiness gate correctly
  reports zero customer-ready vehicles. That is the right answer, not a bug.
- Identity fidelity is WAIVED at IoU 0.545-0.589 against a 0.90 threshold. It is
  not met.
- 15 items sit at DOMAIN_TESTED, 15 at CODE_PRESENT, everything else SPECIFIED.

## Never

- create a second money, identity, fulfilment or health authority;
- let AI create binding fitment, money, ledger or completion truth — it may
  propose; a person or a governed record decides;
- implement a feature before it has its own acceptance contract;
- mark a feature complete from code inspection alone;
- advance a gate on a waiver you granted yourself;
- expose secrets, service-role keys or raw source EPC node IDs;
- acquire catalogue, EPC or vehicle image data over the network — rights are an
  open activation blocker (ACT-REG-011) and unattributed imagery is hard to
  remove from history once committed;
- introduce a third-party plugin, skill or donor without passing the Donor
  Assimilation Gate: pinned commit, licence hash, supply-chain scan, provenance;
- paste a credential or token into the conversation;
- use old v4 or D-number documents as active authority where v2 supersedes them.
- for GMPC work, create a second RAG/customer/pricing/money authority or let an external marketing platform become DIAL source of truth.

**GMPC-specific rule:** for any `GMPC-F*`, read the GMPC Rev 2 canon after bounded context. Commercial RAG consumes DKRF; margin/pricing consumes `PLAT-F014`; money consumes Finance/Ledger; sensitive Health data is not ordinary marketing targeting context.

## How to work

Write refusals, not warnings. Where this repository validates something — see
`packages/catalog-coverage/src/injection.ts` and
`packages/round-credit/src/credit-model.ts` — every finding carries a rule id, the
observed value and a remedy, and any finding at all means refusal. A validator
that returns warnings invites a judgement call at exactly the moment nobody wants
to make one.

Absent evidence is a refusal, never a default. The most expensive failures in this
project have been checks that passed for want of data. A missing count is not
zero and not "probably fine".

Money is integer minor units. No floating-point money anywhere.

TypeScript is strict, module NodeNext. Tests are vitest; end-to-end is Playwright,
and changes to the transition or EPC surfaces run `npm run test:e2e`.

Commit as you go, with messages that say why rather than what. When you regenerate
governance artefacts the order is manifest, then scorecard, then manifest again —
the scorecard counts what the manifest declares, and the manifest hashes the
scorecard.

## When you are done

Report: the contract you wrote, the tests that prove each criterion, the CI run id
and commit SHA, the gate you claimed, and — separately and explicitly — what you
did **not** do and what remains untrue. Add the latter to `known_not_done` in the
scorecard.

If a specialist review is triggered (money, security, donor, health, NFR, UI,
migration, eventuality), you cannot perform it yourself. Say which is triggered
and stop at that boundary.

Verify everything before you finish:

    npm run verify
```

---

## Notes for whoever sends this

- **Pick the Feature ID from Track A of v2.2** — kernel identity, permission,
  evidence or audit — unless Track B has since unblocked a slice. Track A is the
  only track with no external dependency, and it is where the contract-writing
  rhythm should be learned while mistakes are still cheap.
- **Send one Feature ID per session.** The `UserPromptSubmit` hook is meant to
  reject unbounded prompts; do not test whether it will.
- **The reviewer gate is real.** The implementing agent cannot self-certify a
  triggered specialist gate — nine reviewers are defined in
  `20_IMPLEMENTATION_CLOSURE/12_DEVELOPMENT_SYSTEM/CLAUDE_CODE_V2_OPERATING_MODEL.md`.
  If you want the review to happen, open it as its own session with its own
  prompt.
- **Update the honest-state block** in this file when it stops being true.
  A start prompt that overstates readiness produces an agent that overstates
  completion.


## Oracle persistent orchestration control

The persistent Oracle DIAL mission owns autonomous continuation; Claude chat is a typed operator console only.
