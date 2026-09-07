# DIAL Versioned Engineering Knowledge Layer (VEKL)

VEKL is DIAL's governed procedural-engineering knowledge plane. It is **not** project truth.

Authority order:

1. canonical repository, Feature/FRC/security/eventuality contracts and fresh evidence;
2. DIAL development/tooling policy and project-local engineering rules;
3. approved immutable external skills;
4. learned procedural hints and Feature memory;
5. session/history retrieval and model prior knowledge.

External skills may become executable guidance only after exact pinning, licence/provenance review, static scanning, DIAL conflict review and deterministic evals. Research-reference commits in `vendors/` are deliberately not production pins.

The runtime unit is a **Skill Activation Manifest**. Every material Oracle packet resolves one. A valid manifest can contain zero external skills. Selected skill bodies are exposed JIT from a packet-scoped immutable activation directory; the full vendor catalogue is never injected into the DIAL context packet.

The primary Hermes/Sol path may load selected skills through Hermes' external-skill mechanism. Claude/Sonnet fallback receives the exact same immutable skill bodies rendered from the same activation manifest, preserving knowledge provenance across runtime failover.

Vendor snapshots are immutable. DIAL adaptations become separately versioned DIAL wrappers. Learned wrappers stage under `/var/lib/dial-control/knowledge/learned/staged`; they do not become active without scan/eval/review/promotion.

Runtime state is project-scoped under `/var/lib/dial-control/knowledge`. No DIAL VEKL lookup may search another Hermes project's skill, memory or activation state.
