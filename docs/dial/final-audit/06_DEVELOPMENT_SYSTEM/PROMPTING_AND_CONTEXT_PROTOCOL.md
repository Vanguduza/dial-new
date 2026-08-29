# In-Project Prompting & Context Protocol

## Feature-ID first

Do not prompt:
> Read every DIAL plan and build X.

Use:
```text
/dial-feature TECH-F012
Outcome: implement the job safety gate.
Scope: packages/job-safety + technician integration.
Target gate: DOMAIN_TESTED.
```

## JIT context bundle

`context-get <FEATURE_ID>` returns:
1. feature record;
2. applicable hard locks;
3. owning audit/FRC;
4. direct dependencies;
5. relevant donor record;
6. unresolved eventualities;
7. mapped current source/test paths;
8. current evidence/gate;
9. directly related recent decisions.

Target ordinary context bundle: **≤12k tokens**. Beyond that, return pointers.

## Development loop

```text
RESOLVE FEATURE ID
→ GET JIT CONTEXT
→ INSPECT REPO CURRENT STATE
→ PLAN AGAINST FRC
→ IMPLEMENT ONE COHERENT CHANGESET
→ FAST VERIFY
→ FRESH EVALUATOR
→ FIX
→ DOMAIN/CROSS-DOMAIN TEST
→ EVIDENCE RECORD
→ PROJECT TRUTH DELTA CHECK
→ COMMIT/HANDOFF
```

## Evidence before completion

No passing/complete claim without fresh verification. Evidence includes exact commands, results, code paths, runtime/visual proof where applicable and security/migration evidence.

## Checkpoints

Checkpoint after material architecture changes, 3–5 related feature completions, before compaction, before agent/worktree transfer, and before long research.

Checkpoint: active Feature IDs, branch, changes, tests, failures, unresolved decisions and next action.

Local checkpoints are not canonical until reviewed into Project Truth.

## Token controls

- subagents for noisy exploration;
- Feature IDs instead of broad corpus search;
- index before full document;
- narrow retrieval;
- reuse fresh research;
- deterministic scripts for transformations;
- small MCP/tool set;
- fresh evaluator receives FRC + diff + runnable evidence, not entire conversation;
- compact/handoff when stale implementation history dominates context.
