# External Agentic Development Best Practices — 2026

## Anthropic long-running harness
Adopt explicit feature inventories, initializer/bootstrap artifacts, incremental coherent changes, structured handoffs, evaluator feedback and durable state outside conversation. Simplify harness components as model capability improves.

## Context engineering
Treat context as scarce. Retrieve the smallest high-signal set JIT. Use subagents for noisy exploration and structured notes/registries for durable context.

## GitHub Spec Kit
Adopt the pattern, not a second product authority:
`constitution → specify → clarify → plan → checklist → tasks → analyze → implement → converge`.

DIAL mapping:
- constitution = DIAL canon/locks
- specify = FRC
- clarify = Eventuality Audit
- plan = implementation design
- checklist = Definition of Ready
- tasks = dependency work
- analyze = drift/coherence audit
- converge = certification/evidence

## obra/superpowers
Adopt evidence-before-completion, TDD for deterministic behavior, and separate spec-compliance then code-quality review. Do not wholesale install every skill.

## Everything Claude Code
Adopt selectively: hook profiles, script-based hooks, session summaries, skill hot-load, harness self-tests and context optimization. Do not install the entire external harness into DIAL.

## Agent teams
Use for independent research/hypotheses/modules with clean file ownership. Default to subagents/worktrees because teams consume more tokens/coordination.

## Rejected patterns
- unbounded “loop until done”;
- giant always-loaded CLAUDE.md;
- all MCP servers enabled globally;
- auto-learning writing canonical decisions without review;
- completion claims without tests;
- automatic donor upstream sync;
- unrestricted production tools.
