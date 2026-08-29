# DIAL Security Release Gates & Test Matrix

Security gate state is attached to Feature ID, deployable and release.

## SG-0 — Threat understood

Required:
- Feature Security Profile;
- assets/data classes;
- trust boundaries;
- abuse cases;
- external dependencies;
- high-risk eventualities.

## SG-1 — Secrets / supply chain

- Gitleaks green;
- donor provenance;
- SCA;
- SBOM for release;
- IaC/container scan;
- no unreviewed Critical dependency.

## SG-2 — Authentication / authorization

- server actor derivation;
- RLS;
- object/function authorization;
- field/property controls;
- IDOR/BOLA negative tests;
- org/tenant scope;
- revoked relationship.

## SG-3 — Input / output / browser

- request schema;
- business validation;
- XSS/sanitization;
- response minimization;
- CSP/headers;
- CORS/CSRF;
- HTTPS.

## SG-4 — Abuse / resource protection

- login/OTP limits;
- business-flow limits;
- bot/risk challenge if applicable;
- upload/search/query limits;
- load/resource tests.

## SG-5 — Sensitive data / files

- classification;
- encryption;
- storage policies;
- upload quarantine/scanning;
- redacted logs;
- retention.

## SG-6 — Integrations / money

- callback signature/auth;
- replay/idempotency;
- SSRF controls;
- provider timeouts;
- payment authoritative confirmation;
- reconciliation;
- no client-authoritative provider state.

## SG-7 — Mobile / channel

Where applicable:
- MASVS/MASTG;
- secure storage;
- deep links;
- WebViews;
- backups/logging;
- WhatsApp Flow token/crypto/signature;
- Chatwoot minimization.

## SG-8 — AI / privileged

Where applicable:
- prompt/tool injection tests;
- tool permission scope;
- no forbidden money/health/admin authority;
- MFA/step-up/SoD/four-eyes.

## SG-9 — Dynamic / independent verification

- DAST;
- API fuzzing;
- staging negative tests;
- security observability;
- S3 penetration test.

## Security gate inheritance

Security evidence does not automatically survive:
- major auth redesign;
- schema/RLS change;
- new donor/import;
- new payment provider;
- new client surface;
- changed trust boundary;
- migration to new repository/tree.

Re-run affected gates.

## Minimum launch test matrix

| Surface | SAST/SCA | RLS/IDOR | DAST/API | abuse | mobile | payment | support/channel | pentest |
|---|---|---|---|---|---|---|---|---|
| Home/public | ✓ | where data | ✓ | ✓ | n/a | n/a | support entry | risk-based |
| Consumer | ✓ | ✓ | ✓ | ✓ | ✓ | where used | ✓ | S2 sample |
| Business | ✓ | ✓ | ✓ | ✓ | where used | ✓ | ✓ | S2/S3 |
| Health | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | specialist | **required S3** |
| Command Centre | ✓ | ✓ | ✓ | ✓ | Android wrapper | money controls | internal | **required S3** |
| Corporate | ✓ | ✓ | ✓ | ✓ | staff mobile where used | payroll/treasury | internal | S3 modules |
| WhatsApp gateway | ✓ | domain-dependent | API tests | ✓ | n/a | ✓ | ✓ | S2/S3 |
