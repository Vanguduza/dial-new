# DIAL Shared Project Memory & Review Fabric (SPMRF) — Rev 1

**Status:** OWNER-DIRECTED IMPLEMENTATION  
**Authority:** Hermes owns orchestration and memory admission. Project Truth, repository state, machine registries, tests and evidence remain authoritative.  
**Scope:** DIAL control plane plus registered project repositories and the Trading Core review surface.

## 1. Objective

SPMRF makes different ChatGPT accounts, Claude Code sessions, Codex workers and future harnesses behave as engineers sharing one external project brain.

It deliberately does **not** try to synchronize proprietary account-native memories. Native ChatGPT/Claude memory is convenience only.

The normal handover contract is:

```text
Harness A works
   -> immutable clean checkpoint
   -> Repository Understanding Snapshot
   -> changed-file/symbol/impact delta
   -> admitted shared-memory cursor
   -> cached context capsule
   -> Handover Capsule
   -> Harness B resumes from snapshot + delta
   -> targeted verification only
```

Full-repository rediscovery is exceptional and occurs only when no valid snapshot exists, Git history is non-linear/unverifiable, or authority/structural state is explicitly stale enough to require it.

## 2. Canonical topology

```text
                                 OWNER
                                   |
                            Mobile ChatGPT
                                   |
                        owner online Commander
                                   |
                                   v
                         dial-hermes-control
                                   |
                                HERMES
                                   |
                    +--------------+--------------+
                    |              |              |
                    v              v              v
               Project Truth   Shared Memory    VEKL/GraphRAG
                 + Git            Plane        + structural graph
                    |              |              |
                    +--------------+--------------+
                                   |
                            Context Resolver
                                   |
                   Content-addressed Context Cache
                                   |
                              Delta Composer
                                   |
          +------------------------+-------------------------+
          |                        |                         |
          v                        v                         v
   chatgpt-hermes          chatgpt-trading            claude-hermes
   ChatGPT account A       ChatGPT account B           Claude Code
   Hermes Control VM       Trading Core VM             Hermes Control
          |                        |                         |
          +------------------------+-------------------------+
                                   |
                              Review Fabric
                                   |
                     structured immutable receipts
                                   |
                              Shared Memory
```

Trading Core reaches the same memory plane through a purpose-specific **forced-command SSH stdio MCP**. No public SPMRF port is opened.

## 3. Authority and memory classes

Precedence is immutable:

1. Project Truth / owner-authorized canon.
2. Canonical machine registries and contracts.
3. Current repository/worktree state and immutable Git commits.
4. Tests, qualification evidence and runtime evidence.
5. Admitted VEKL/GraphRAG engineering knowledge.
6. Checkpoints, handoff capsules and admitted shared project memory.
7. Harness-native session/account memory and model prose.

Shared memory never becomes a second Project Truth.

### Memory states

A harness first writes a `CANDIDATE`. Admission requires one of:

- `OWNER_EXPLICIT`
- `VERIFIED_SYSTEM`
- `HERMES_RECONCILED`

Even after admission, `project_authority` remains `NON_AUTHORITATIVE_CONTEXT`.

### Tiers

- **HOT** — current task, active checkpoint, owner instruction, open review findings, current SHA.
- **WARM** — recent feature history, reviews, handoffs and related implementation context.
- **COLD** — historical/superseded context retained for targeted retrieval.

Secret-bearing values are rejected before persistence.

## 4. Repository Understanding Snapshot

Every project can hold a content-addressed `RepositoryUnderstandingSnapshot` containing:

- repository SHA and branch;
- dirty state;
- Project Truth fingerprint;
- registry fingerprint;
- VEKL graph generation/revision;
- structural graph snapshot/hash;
- Feature scope.

When HEAD changes, SPMRF computes a delta:

- changed files;
- numstat;
- changed known symbols;
- reverse dependency/impact envelope;
- authority fingerprint changes;
- VEKL/structural graph changes;
- Git ancestry.

Validity states distinguish `VALID`, `DIRTY`, `STALE` and reusable state.

The result mode is one of:

- `REUSE`
- `DELTA`
- `DELTA_WITH_AUTHORITY_REFRESH`
- `FULL_REDISCOVERY_REQUIRED`

This is the mechanism that prevents normal model switching from becoming repository onboarding from zero.

## 5. Context cache and token reduction

Cache identity is bound to:

```text
project
+ feature
+ Project Truth hash
+ repository SHA
+ VEKL graph revision
+ shared-memory cursor
+ context profile
+ skill activation hash
+ Repository Understanding hash
```

Context is stored by content hash and split into stable sections.

If a harness already received context fingerprint `A` and current context is `B`, SPMRF compares section hashes and sends only changed sections.

Example:

```text
Previous capsule:
  canon              unchanged
  architecture       unchanged
  VEKL               unchanged
  repository task    changed
  review findings    changed

Delivery:
  repository task delta
  review findings delta
```

The cache records estimated token savings, cache hits, deduplicated writes, full deliveries and delta deliveries.

Provider prompt caching can additionally exploit the stable prefix, but SPMRF does not depend on a provider-specific cache being available.

## 6. Context profiles

Canonical limits in `SHARED_PROJECT_MEMORY_FABRIC.json`:

- `REVIEW` — compact review capsule.
- `IMPLEMENTATION` — normal development work.
- `ARCHITECTURE` — broader dependency/canon context.
- `DEEP_AUDIT` — expanded context and raw-source verification when required.

A task does not receive the whole memory store simply because it exists.

## 7. Shared-memory MCP

The model-neutral MCP is `dial_shared_project_memory` / `dial-shared-project-memory`.

Core tools:

- `project_memory_resolve`
- `project_memory_search`
- `project_memory_cursor`
- `project_memory_write_candidate`
- `project_handoff`
- `review_publish_checkpoint`
- `review_list_jobs`
- `review_claim`
- `review_submit`
- `review_status`
- `review_open_findings`

On `dial-hermes-control`, Hermes, Codex and Claude Code point to the same local MCP/state root.

On Trading Core, ChatGPT/Codex and Claude use separate purpose-specific SSH identities. Hermes installs corresponding forced commands that execute only the SPMRF stdio MCP. Those keys cannot open a shell.

## 8. Harness identities

Initial harnesses:

| Harness | Account/runtime | Host | Roles |
| --- | --- | --- | --- |
| `chatgpt-hermes` | ChatGPT OAuth / Codex | dial-hermes-control | author, reviewer, architect |
| `chatgpt-trading` | **different ChatGPT account** / Codex | van-trading-core | author, reviewer, trading specialist |
| `claude-hermes` | Claude Code subscription | dial-hermes-control | author, reviewer, architect |
| `claude-trading` | Claude Code on Trading Core | van-trading-core | optional until authentication is live-proven |

Authentication credentials are never placed into shared memory.

## 9. Real-time checkpoint review

“Real time” means **atomic checkpoint time**, not every keystroke.

The Hermes post-turn hook observes clean Git HEAD changes. A new clean commit publishes one immutable review checkpoint.

The checkpoint contains:

- checkpoint ID/hash;
- exact repository SHA;
- base SHA;
- author harness;
- Feature scope;
- completion claims;
- tests claimed;
- Repository Understanding Snapshot reference;
- repository delta reference;
- relevant evidence.

Every enabled independent reviewer except the author gets its own queued review job.

### Local reviewers

`chatgpt-hermes` is run through Codex App Server in a detached worktree at the exact SHA:

- `permissions=:read-only`
- `approvalPolicy=never`
- no provider fallback
- exact model provenance recorded.

`claude-hermes` uses Claude Code:

- plan/read-only permission mode;
- Read/Glob/Grep and read-only Git commands only;
- exact resolved model provenance required.

### Trading reviewer

`chatgpt-trading` is executed through:

```text
Hermes
 -> CROSS_HARNESS_REVIEW automation authority
 -> van_trading_local_commander
 -> start_process
 -> van-spmrf-review-worker
 -> Trading Core's separately authenticated ChatGPT/Codex OAuth
```

The worker:

- accepts only allowlisted repositories;
- maintains local partial-clone mirrors to avoid repeated downloads;
- checks out the exact checkpoint SHA into a disposable detached worktree;
- uses the repository-understanding delta instead of rediscovering the whole repository;
- runs Codex read-only;
- returns a bounded structured receipt.

## 10. Review receipts and quorum

A receipt is bound to:

- immutable checkpoint ID;
- exact reviewed SHA;
- reviewer harness;
- provider/runtime/model provenance;
- verdict;
- structured findings;
- evidence.

The author cannot satisfy its own independent review.

Routine checkpoints require at least one independent review. Material/critical changes require two; critical domains include security, money, trading, authority, recovery and data migration.

HIGH/CRITICAL findings keep the checkpoint in `REVIEWED_CHANGES_REQUIRED` even after numerical quorum.

Review results are admitted into shared HOT memory so the authoring model sees them on the next context resolution without manual copy/paste.

## 11. Failure and retry semantics

Review jobs move atomically:

```text
inbox -> processing -> completed
                   \-> requeued (bounded retry/backoff)
                   \-> failed
```

Provider quota/rate failures receive longer retry delay. A failed reviewer does not erase the checkpoint or other completed review evidence.

Mobile disconnection is irrelevant to review/memory durability because state resides under Hermes control state.

## 12. Handover contract

Handoff Capsule schema v4 carries:

- source harness;
- context fingerprint;
- shared-memory cursor;
- Repository Understanding Snapshot;
- repository delta;
- active review checkpoint;
- open HIGH/CRITICAL review findings;
- current work/gate/session continuity;
- explicit resume contract.

The default resume contract is `SNAPSHOT_PLUS_DELTA`.

An incoming model is instructed to reread source selectively only where the validity map says state is dirty/stale or where independent verification requires it.

## 13. Trading boundaries

Full Trading Core Commander control does not create trading authority.

SPMRF may:

- inspect code;
- run independent review;
- maintain memory;
- launch read-only ChatGPT/Codex review sessions.

SPMRF may not use Commander as a broker/order path. VATI remains the sole trading risk/execution authority.

## 14. Install sequence

### Trading Core

```bash
sudo bash /opt/van-trading/app/deploy/van-trading-core/spmrf/install-spmrf-review-worker.sh
sudo bash /opt/van-trading/app/deploy/van-trading-core/spmrf/install-shared-memory-client.sh
```

If requested, authenticate the secondary ChatGPT account once as `ubuntu`:

```bash
~/.local/share/van/spmrf/codex/node_modules/.bin/codex login
```

Use that account's browser/device authorization.

Seed the trusted `dial-hermes-control` SSH host key from existing Oracle host-key evidence. Do not disable strict host-key checking.

### Hermes Control

```bash
bash deploy/oracle/hermes-codex/install-shared-project-memory-fabric.sh
bash deploy/oracle/hermes-codex/install-trading-memory-peer.sh
```

The second command reads the two Trading Core public keys through the already-authorized admin SSH path and installs forced-command entries locally.

Restart/qualify the review coordinator after both sides are present.

## 15. Qualification

GREEN requires:

1. local memory MCP registered in Hermes, Codex and Claude;
2. secondary Trading ChatGPT/Codex authentication reports `Logged in using ChatGPT`;
3. Trading Core shared-memory SSH wrappers exist with strict host-key checking;
4. Hermes forced-command peer keys exist and cannot open a shell;
5. review coordinator active;
6. memory candidate/admission and secret-refusal tests pass;
7. context cache delta/token-savings tests pass;
8. repository understanding produces DELTA for linear changes and full rediscovery only for invalid lineage;
9. self-review is refused;
10. checkpoint SHA mismatch is refused;
11. local ChatGPT and Claude read-only review probes return structured receipts;
12. Trading ChatGPT returns a structured receipt through full Commander;
13. a review receipt becomes visible to the other harness on its next shared-context resolution;
14. handover from one model to another reuses snapshot+delta without full repository onboarding.

## 16. Data not persisted

SPMRF does not persist:

- API keys;
- OAuth tokens/cookies;
- provider credentials;
- raw hidden chain of thought;
- complete raw prompts/responses merely for memory;
- arbitrary phone/owner secrets.

It stores bounded task facts, evidence, decisions, checkpoint metadata, summaries, review findings and content-addressed context artifacts.

## 17. Future acceleration

The canonical v1 backend intentionally uses the existing transaction-safe DIAL control-state filesystem with JSON/JSONL/content-addressed objects, because that already participates in recovery and preserves current authority semantics.

A later Postgres/pgvector projection may accelerate semantic retrieval and Supabase Realtime/LISTEN-NOTIFY delivery. It remains a reconstructible projection and does not become a second Project Truth.

---

**Canonical result:** account switching and model switching become handoffs between workers sharing one external project brain. The next worker receives verified current state plus the delta since the last valid understanding snapshot, not a requirement to learn the repository again from zero.
