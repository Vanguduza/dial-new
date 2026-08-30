# DIAL security classes — S1 to S4

**Status:** Canon. Adopted from
`DIAL_Module_Expansion_and_Operational_Realisation_Architecture_v1.md` §3.7,
superseding the three-class scheme in `DIAL_MASTER_DEVELOPMENT_PLAN_AND_PROMPT_v1_6.md` §47.

## Why this needed settling

v1_6 §47 locked three classes, with **S3** meaning
"identity/money/health/privileged/high assurance". The expansion proposed four,
with **S3** meaning "sensitive finance, HR, precise location, claim/evidence,
private provider data" and **S4** meaning "privileged/admin/security/legal/
high-impact authority or health-specialist data".

The same token meant different things in the two schemes, and the expansion
labelled its own version "suggested planning classes" — a parallel vocabulary
reusing live tokens, which is how two schemes drift while both look adopted.
`FEATURE_SECURITY_PROFILE_REGISTRY.json` had 150 features at S2 and 36 at S3.

## The classes

| Class | Covers |
|---|---|
| **S1** | ordinary public/catalogue information |
| **S2** | authenticated customer/provider operational data |
| **S3** | sensitive finance, HR, precise location, claim/evidence, private provider data |
| **S4** | privileged/admin/security/legal/high-impact authority, or health-specialist data |

## What the re-triage did

The 36 features at the old S3 were split by the new definitions:

- **11 stay S3** — `money-affecting`. Sensitive finance is S3 under the new
  scheme.
- **25 move to S4** — 18 health-specialist (`health/safety/sensitive data`),
  5 corporate privilege (`sensitive corporate/money/privilege`) and 2 vehicle
  identity/authorization (`identity/authorization-sensitive`). All are
  high-impact authority or health-specialist data.

**No feature was downgraded.** The scheme now has an S1 that nothing occupies,
and some of the 150 features at S2 are plausibly public catalogue reads. Moving
any of them down removes controls, so it is not a mechanical re-triage — it
needs a security reviewer per feature. Splitting upward is safe and was done;
downgrading is deliberately left open.

## What S4 requires beyond S3

S4 adds the `PRIVILEGED_ACCESS` control category and one mandatory test:

```text
step-up authentication for privileged high-impact actions
```

per expansion §29.2, which requires step-up MFA for privileged high-impact
actions on this data class.

## Enforcement

`agent-system/bin/security-coverage.mjs` reads the class list from this canon's
`SECURITY_CLASSES` constant, fails on any tier outside it, and fails an S4
profile that does not carry the step-up test. It previously hard-coded
`["S1","S2","S3"]`, which would have rejected every S4 profile the moment the
four-class scheme was adopted.
