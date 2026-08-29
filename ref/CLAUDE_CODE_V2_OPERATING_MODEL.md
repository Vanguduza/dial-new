# Claude Code v2 Operating Model

## Objective

Claude Code should act as a bounded engineering workforce, not a memory-dependent architect.

## Context hierarchy

`CLAUDE.md` stays short.

It points to:
1. Project Truth;
2. current Feature ID;
3. FRC;
4. applicable security profile;
5. material eventualities;
6. donor dossier if needed;
7. current source/tests.

Do not load the full master pack into every turn.

## Progressive disclosure

Use small Skills with:
- compact `SKILL.md`;
- deeper `references/`;
- runnable scripts;
- examples only when needed.

This follows current Claude Code plugin/skill organization and saves context.

## Subagents

Use narrow subagents:
- `feature-implementer`
- `eventuality-reviewer`
- `security-reviewer`
- `money-reviewer`
- `donor-reviewer`
- `nfr-reviewer`
- `ui-reviewer`
- `migration-reviewer`

The implementing agent cannot self-certify a triggered specialist gate.

## Hooks

Project safety hooks should cover:
- SessionStart: verify Project Truth/ACTIVE_WORK/drift state;
- UserPromptSubmit: resolve Feature IDs or reject unbounded "build everything" prompts;
- PreToolUse: block secret/canon/destructive writes where policy forbids;
- PostToolUse: record changed paths / affected Feature IDs;
- PreCompact: write compact checkpoint;
- Stop: run targeted verification and require evidence/handoff.

### Subagent caveat

Do **not** rely on plugin hook propagation alone for safety. Current Claude Code issue history has shown hook/subagent propagation edge cases. Critical checks therefore also exist:
- in root project settings/harness scripts;
- in each specialist agent's own instructions;
- in CI.

## MCP

Default DIAL MCP is read-only Project Truth.

Tools:
- get_feature
- get_frc
- get_eventualities
- get_security_profile
- get_donor
- get_decision
- get_evidence
- get_nfr
- get_activation_blocker
- search_canon

Never expose production money/database write tools to the general coding agent.

## Token-saving loop

```text
Feature ID
→ context-get bounded JSON
→ source/test inspection
→ implementation plan
→ bounded code change
→ targeted tests
→ triggered independent reviews
→ evidence
→ compact checkpoint
```

Do not repeatedly paste architecture prose.

## In-project prompt

A Feature prompt should be generated from registry facts:

```text
Implement <Feature ID> to <target gate>.
Use the resolved FRC, Security Profile and Material Eventualities.
Do not redesign locked architecture.
Inspect current source/tests first.
Return changed paths, migrations, commands/events, tests, evidence,
known limitations and proposed registry status.
```

## Stop condition

A session ends cleanly only after:
- tests/evidence are recorded, or
- blocker/handoff is explicit.

"Looks good" is not a gate.
