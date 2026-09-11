# DIAL authority rules

- Project Truth and locked Decisions outrank provider/model guidance.
- External tools are replaceable capability providers, never DIAL sources of truth.
- Generated code/design/creative remains an untrusted candidate until DIAL admission gates pass.
- No direct protected-master write, production deployment, production database mutation, payment/custody mutation or Health-sensitive egress.
- Owner steer supersedes affected envelopes/leases through the DIAL control plane; do not race it.
- Task-scoped worktrees, current VEKL evidence, current Task Execution Envelope and write fencing are mandatory for material repository mutation.
- Never claim a provider is integrated from architecture, fixtures or fallback behavior. Require the provider maturity evidence defined by `EXTERNAL_CAPABILITY_REGISTRY.json`.
