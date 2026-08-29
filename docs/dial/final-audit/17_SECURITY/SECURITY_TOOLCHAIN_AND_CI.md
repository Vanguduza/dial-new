# DIAL Security Toolchain & CI

The goal is layered evidence, not installing every security tool available.

## Core toolchain

| Purpose | Preferred tool / mechanism | Stage |
|---|---|---|
| threat modeling | OWASP Threat Dragon + DIAL FRC/eventualities | design |
| secret detection | Gitleaks | pre-commit + PR + scheduled |
| SAST | Semgrep + GitHub CodeQL where useful | PR |
| dependency/SCA | OSV-Scanner and/or Trivy | PR + scheduled |
| dependency updates | Renovate | continuous |
| SBOM | Syft/CycloneDX or Trivy SBOM | build/release |
| IaC | Checkov | PR |
| container/image | Trivy | build/release |
| API schema fuzz/negative | Schemathesis or equivalent OpenAPI property testing | CI/staging |
| web DAST | OWASP ZAP automation | staging |
| DB/RLS | pgTAP + custom IDOR/RLS fixtures | CI |
| upload malware | ClamAV or qualified malware scanning service | runtime |
| mobile | OWASP MASTG tests + MobSF as supporting scanner | CI/staging |
| performance/abuse | k6/custom distributed rate-limit tests | staging |
| browser/E2E | Playwright | CI/staging |
| artifact attestation | GitHub attestation / Sigstore Cosign where deployment fits | release |
| penetration test | independent manual test | S3 activation |

Avoid overlapping scanners that produce the same signal unless they demonstrably improve coverage.

## PR gate

Required where applicable:

```text
lint
typecheck
unit
schema/migration
secret scan
SAST
SCA
IaC
architecture fitness
RLS/authorization negative tests
feature security-profile tests
```

## Merge/default-branch gate

- all PR gates;
- SBOM generation for affected deployables;
- no Critical unresolved vulnerability;
- High findings require remediation or authorized temporary exception with expiry.

## Staging gate

- ZAP/API DAST;
- authentication/IDOR suite;
- CSP/headers;
- TLS/callback verification;
- upload malicious fixtures;
- webhook replay/signature tests;
- rate-limit/bot/abuse tests;
- provider sandbox negative paths;
- mobile MASTG subset;
- AI prompt/tool injection tests where applicable.

## Production activation gate

For S1:
- automated gates green;
- threat/security review completed.

For S2:
- S1 + abuse/integration/resilience security;
- runbook/alert coverage.

For S3:
- S2 + privileged/access review;
- independent penetration test or justified equivalent after material change;
- restore/rotation exercises where applicable;
- four-eyes/step-up tests;
- security sign-off evidence.

## Scheduled

Daily/weekly:
- SCA/vulnerability refresh;
- secret scanning;
- dependency update proposals;
- external surface scan;
- expiring certificates/domains/secrets.

Monthly/quarterly:
- access certification;
- restore exercise rotation;
- tabletop scenario;
- dependency/donor review;
- unused credential removal.

## Security exception

A failing security control is not silently ignored.

Exception requires:
- control/finding ID;
- affected feature/system;
- exploitation/impact analysis;
- compensating controls;
- owner;
- approving authority;
- expiration;
- remediation task.

Expired exceptions become blocking findings.
