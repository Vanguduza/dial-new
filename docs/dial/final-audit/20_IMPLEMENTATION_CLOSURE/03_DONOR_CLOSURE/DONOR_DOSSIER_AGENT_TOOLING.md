# Donor Dossier — Agent Tooling (DRR-TOOLING-001..005)

Five agent-tooling donors run through the CT-3 Donor Assimilation Gate.

A plugin is code that runs in the development environment. CT-3 does not exempt
it for being convenient, and "it is only markdown" is not true of four of these
five — they ship shell scripts, Node scripts, lifecycle hooks or compiled
provider builds.

**Commit pins are captured at first import, not here.** The canon requires the
exact commit pinned "immediately before code is copied", so a SHA recorded now
would be stale by the time anyone installs. The capture command is given per
donor. GitHub's commit pages are robots-disallowed to this session, so the pin
must come from the machine doing the install.

---

## DRR-TOOLING-001 — anthropics/claude-plugins-official

| | |
|---|---|
| Licence | Apache-2.0 |
| Kind | Marketplace manifest, not a code import |
| Adoption mode | `SERVICE_REGISTRY` |
| Verdict | **ADOPT** |

Anthropic-managed directory. Adding the marketplace registers a manifest source;
it does not itself import code.

**The marketplace being trustworthy does not make its contents trustworthy.**
The repository states plainly that Anthropic does not control what MCP servers,
files or other software are included in listed plugins. Each plugin installed
*from* it is a separate donor and takes its own gate — the same as anything else.

```bash
/plugin marketplace add anthropics/claude-plugins-official
/plugin install <name>@claude-plugins-official
```

Capture at import: `git ls-remote https://github.com/anthropics/claude-plugins-official HEAD`

---

## DRR-TOOLING-002 — VoltAgent/awesome-design-md

| | |
|---|---|
| Licence | MIT |
| Contents | `DESIGN.md` files plus `preview.html` / `preview-dark.html`. No executable code, scripts or hooks. |
| Adoption mode | `REFERENCE_ONLY` |
| Verdict | **DO NOT DROP IN** — read as reference, author DIAL's own |

Lowest supply-chain risk of the five: pure markdown, nothing executes.

The risk here is not supply chain, it is authority and trade dress. The
collection documents Apple, Nike, Spotify, Tesla and Stripe, reproducing design
tokens extracted from their public CSS. Two problems for DIAL:

1. **Second design authority.** v2 §11 freezes DIAL design-system authority.
   A `DESIGN.md` derived from Stripe's tokens dropped into the repository becomes
   a competing source of truth for exactly the thing v2 closed.
2. **Trade dress.** The repository disclaims ownership of any site's visual
   identity, which is the correct disclaimer and does not transfer any right to
   produce a UI that resembles a named brand. The Premium Cinematic Web Standard
   already requires every substantive claim and depicted capability to trace to
   Project Truth.

**Approved use.** Read it to learn how a good `DESIGN.md` is *structured* — token
taxonomy, section ordering, how motion and density are expressed — then author
`DIAL_DESIGN.md` from the DIAL design system and the Premium Cinematic Web
Standard. Do not copy another brand's token values.

---

## DRR-TOOLING-003 — Leonxlnx/taste-skill

| | |
|---|---|
| Licence | MIT (Copyright 2026 Leonxlnx) |
| Contents | `SKILL.md` files, shell scripts (`skill.sh`), install hooks for `npx skills add`, image assets |
| Adoption mode | `PORT_SELECTED_SKILL` |
| Verdict | **ADOPT, SCOPED BY DESIGN ZONE** |

Directly aligned with an existing DIAL standard. Its three tunable parameters —
DESIGN_VARIANCE, MOTION_INTENSITY, VISUAL_DENSITY — and its GSAP animation
skeletons map onto the Premium Cinematic Web Standard, which already names GSAP
ScrollTrigger as the scroll-sequence mechanism.

**Required scoping.** The DIAL standard is zoned, and this skill is not:

```text
Zone A  brand, homepage, acquisition          intensity HIGH
Zone B  marketplace discovery, browse         intensity MEDIUM
Zone C  booking, quote, checkout, payment     intensity LOW
Zone D  HIRA / PPE / LOTO / SOP / admin       intensity MINIMAL
```

MOTION_INTENSITY and DESIGN_VARIANCE bind to the zone of the surface being
worked on. The skill may not be invoked at all on Zone C or Zone D surfaces:
the standard is explicit that real search, booking, quote, payment and safety
interfaces are never replaced by cinematic treatment.

It also may not touch the transition window. Blueprint §4.2 permits exactly one
headline there; "good taste" is not a licence to add to it.

Pre-use: read `skill.sh` before running it — an install script is the highest-risk
file in a markdown-shaped repository.

Capture at import: `git ls-remote https://github.com/Leonxlnx/taste-skill HEAD`

---

## DRR-TOOLING-004 — pbakaus/impeccable

| | |
|---|---|
| Licence | Apache-2.0 |
| Author | Paul Bakaus (@pbakaus) |
| Contents | CLI, install scripts, lifecycle hooks, **compiled provider builds** for multiple AI tools, `package.json`, `bun.lock`, `skills-lock.json` |
| Adoption mode | `PORT_SELECTED_SKILL` |
| Verdict | **ADOPT AFTER SCAN** |

Largest install footprint of the five, and the only one shipping compiled
artifacts. Compiled provider builds cannot be reviewed by reading them, which is
precisely the case CT-3's supply-chain requirement exists for.

**Required before enabling.**
- Dependency scan and SBOM over `package.json` / `bun.lock`.
- Read the install script and every lifecycle hook before they are allowed to run.
- Confirm no hook writes outside the repository or reaches the network at
  install time.
- Prefer installing only the skill content and leaving the hooks disabled until
  the scan is green — the 59 detector rules are the value here, the hooks are
  the risk.

Its detector rules genuinely serve a gap: the canon has a UI reviewer trigger
for accessibility and responsive behaviour, and the repository currently has no
accessibility test at all. Pair with `design:accessibility-review` and the
Playwright suite rather than treating any of the three as sufficient alone.

Capture at import: `git ls-remote https://github.com/pbakaus/impeccable HEAD`

---

## DRR-TOOLING-005 — DietrichGebert/ponytail

| | |
|---|---|
| Licence | MIT (Copyright 2026 DietrichGebert) |
| Contents | `AGENTS.md`, Node scripts, Python tests, plugin manifests, lifecycle hooks, bundled skills, per-platform rule files, `.env.example` |
| Adoption mode | `PORT_SELECTED_SKILL` |
| Verdict | **ADOPT WITH A NAMED CARVE-OUT** |

Its ladder is sound engineering and mostly agrees with DIAL: does this need to
exist, is it already in the codebase, does the standard library provide it, can
it be one line, and only then write the minimum. Applied to the DVTG tree it
would have caught several things this project already found — the second
explosion geometry hand-written into the player, the duplicated contract types
in `epc-catalog.ts`.

It excludes trust-boundary validation, data-loss handling, security and
accessibility from the chopping block. Good, and necessary.

**It does not exclude eventuality and recovery contracts, and that is the
carve-out DIAL needs.**

The FRC requires named commands, states and events per feature and forbids
happy-path-only implementation. CT-2 requires every material eventuality to
resolve to owner queue, recovery commands, procedure, evidence, terminal states
and tests. This is already the project's weakest area — 8 test definitions across
254 contracts. A "does this need to exist?" heuristic pointed at a recovery path
will reliably answer no, because recovery paths are by definition the code that
usually does not run.

**Carve-out — the ladder may not be applied to:**
- eventuality and recovery contracts, or their tests;
- FRC command, state, query or event completeness;
- evidence, audit or outbox requirements;
- the per-feature acceptance contract.

Record this in the donor record itself so it survives the session that agreed it.

Capture at import: `git ls-remote https://github.com/DietrichGebert/ponytail HEAD`

---

## Summary

| Donor | Licence | Executes? | Verdict |
|---|---|---|---|
| claude-plugins-official | Apache-2.0 | manifest only | Adopt; each listed plugin still takes its own gate |
| awesome-design-md | MIT | no | Reference only — do not drop in a brand-derived DESIGN.md |
| taste-skill | MIT | shell + install hooks | Adopt, bound to design zone, barred from Zones C/D and the transition window |
| impeccable | Apache-2.0 | CLI + hooks + compiled builds | Adopt after SBOM/scan; skills first, hooks after |
| ponytail | MIT | hooks + Node scripts | Adopt with the eventuality/FRC carve-out |

None of these may become a source of truth for fitment, money, catalogue
authority, identity, health consent or audit. That restriction is unchanged and
applies to tooling exactly as it applies to application donors.
