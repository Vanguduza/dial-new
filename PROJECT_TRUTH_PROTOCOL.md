# Vanguduza Project Truth Protocol

This repository must never infer project truth from chat memory, the GitHub default branch, the newest timestamp, the currently checked-out branch, an agent recommendation, CI output, or tool output.

## Authority law

Project Truth write authority originates with the owner. Agents may implement autonomously, but they may not self-authorize a change to Project Truth.

The four authorization classes are:
- `OWNER_EXPLICIT`: the owner directly orders a bounded change. Necessary implementation and truth reconciliation inside that scope are authorized.
- `OWNER_DERIVED`: the owner orders a blocker, gap, failure, or issue fixed using the best/recommended solution. Necessary technical consequences and truth reconciliation are authorized, but material product/business/security/owner-control redefinition is not.
- `OWNER_DELEGATED_AUTONOMY`: the owner explicitly delegates continuation such as “continue autonomously” or “until green”. The agent may execute and reconcile truth within the existing mission without silently changing its intent.
- `NO_AUTHORITY`: read-only requests, research, audits without a fix instruction, agent preference, recommendations, CI, and tools do not grant write authority.

`docs/project-state/OWNER_AUTHORITY_POLICY.json` is the machine-readable form of this law. Authorization records are append-only under `docs/project-state/authorizations/`.

## Mandatory rules

1. Read `PROJECT_CANONICAL_STATE.json` and the owner-authority policy before planning, coding, merging, building, packaging, deploying, or releasing.
2. Inspect divergent branches and source-of-truth/decision documents before declaring any implementation canonical.
3. Preserve every locked feature and later owner-approved change during reconciliation. Silent thinning is forbidden.
4. Every substantive agent commit must be covered by an owner authorization record whose branch/base/path scope includes the change. The local pre-commit guard records ledger evidence only after that authority check succeeds.
5. `OWNER_DERIVED` and `OWNER_DELEGATED_AUTONOMY` may never be used to justify feature removal, business-model changes, security-authority changes, owner-control changes, legal-position changes, money/custody-model changes, locked-provider changes, or another material scope expansion. Obtain explicit owner authority instead.
6. `docs/project-state/CHANGE_LEDGER.jsonl` and `CURRENT_STATE.json` are evidence generated from already-authorized work. Generating evidence is not itself a source of authority.
7. Project Truth generation happens on the authorized PR branch. The required `project-truth` check verifies authority, append-only authorization records, ledger coverage, and repository integrity before merge.
8. The protected default branch is read-only to Project Truth automation. Post-merge automation verifies; it never commits, pushes, bypasses protection, or creates authority.
9. Deterministically reproducible two-parent merge commits are structural integration evidence. A merge wrapper needs no synthetic second “autolog” commit when `git merge-tree --write-tree` reproduces the committed tree from its parents.
10. `CURRENT_STATE.json` records the latest authorized observed repository state. It is evidence, not permission to declare a branch canonical.
11. Releases remain blocked while `canonical_state.release_blocked` is true. Release/build provenance must identify repository, exact commit SHA, branch/ref, target/module, and canonical-state revision.
12. If remembered state conflicts with Git, stop and reconcile the divergence. Git evidence wins over memory; owner authority still governs whether reconciliation may change Project Truth.

## Derived authorization boundary

A directive such as “fix the blockers using your recommended solution”, “close the remaining gaps”, or “continue autonomously until green” is valid authorization for the necessary technical solution and corresponding Project Truth reconciliation. It is not permission to redefine the owner’s product intent.

If the technically preferred solution would cross a material boundary, the agent must preserve the blocker, surface the decision, and obtain `OWNER_EXPLICIT` authority (or an explicit owner gate approval) before changing canon.

## PR-native flow

```text
owner instruction / owner change
        ↓
owner authorization record
        ↓
authorized implementation
        ↓
local Project Truth ledger reconciliation
        ↓
required PR authority + verification checks
        ↓
protected merge
        ↓
read-only post-merge verification
```

CI verifies authority but can never grant it. A model may recommend an authorization class or scope, but only an owner-originated instruction can be the authority source.
