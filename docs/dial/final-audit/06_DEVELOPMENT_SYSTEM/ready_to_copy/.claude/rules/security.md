---
paths:
  - "packages/identity/**"
  - "packages/payments/**"
  - "packages/ledger/**"
  - "packages/**/auth/**"
  - "apps/**/api/**"
  - "apps/**/*android*/**"
  - "apps/**/*ios*/**"
  - "supabase/**"
  - "workers/**"
  - "packages/whatsapp-*/**"
  - "packages/support/**"
---
For material work, load the Feature Security Profile and applicable controls from `docs/dial/final-audit/17_SECURITY/`.

Non-negotiable:
- derive actor server-side;
- never trust caller user/role/owner/price/status;
- RLS on exposed tables plus negative IDOR/BOLA tests;
- client gets only Supabase publishable key; secret/service-role stays server-side;
- validate/allowlist mutable fields;
- parameterized DB access;
- secure sessions/CSRF;
- explicit response DTOs;
- hostile-file upload pipeline;
- webhook signature + replay/idempotency;
- sensitive logs/data minimized;
- security findings/evidence required before gate advancement.

S3 features require stronger step-up, money/health/privilege review and independent verification.
