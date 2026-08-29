# DIAL Security Master Architecture — Secure-by-Design Release Baseline v1.0

**Status:** LOCKED SECURITY BASELINE  
**Applies to:** DIAL Home, Consumer, Business, Health, Command Centre, Corporate OS, provider apps, APIs, workers, WhatsApp, support, payment adapters, donor imports and development tooling.

## 1. Security goal

DIAL should be built so that ordinary users, employees and providers do not need to compensate for insecure defaults.

Security is a product property and release gate, not a final pre-launch checklist.

Framework alignment:
- OWASP ASVS 5.0.0 for web/application verification;
- OWASP API Security Top 10 2023;
- OWASP MASVS/MASTG for Android/iOS;
- NIST SSDF SP 800-218 v1.1 as the production SDLC baseline;
- track SP 800-218 Rev.1 / SSDF 1.2 draft changes without treating draft text as final;
- CISA Secure-by-Design/Default principles.

## 2. Assurance tiers

### DIAL-S1 — standard internet-facing
Home, public browse, ordinary low-risk customer content.

Target:
- ASVS Level 2 baseline controls applicable to the feature;
- API Top 10 coverage;
- secure headers/TLS/input/access controls;
- SAST/SCA/secrets/DAST.

### DIAL-S2 — transactional
Orders, jobs, delivery, support cases, supplier/technician operations, business workspace.

Add:
- stronger object/function authorization tests;
- idempotency/replay;
- abuse/fraud controls;
- evidence/audit;
- dependency failure security;
- explicit threat model.

### DIAL-S3 — high assurance
Identity, Payments, Ledger, Treasury, Payroll, Health, Command Centre high-risk controls, sensitive HR, privileged administration.

Add:
- ASVS Level 3-oriented verification where applicable;
- step-up/MFA;
- four-eyes/SoD;
- stricter cryptographic/key-management controls;
- dedicated penetration testing;
- privileged access review;
- immutable/high-fidelity audit;
- recovery exercises.

## 3. Security architecture principles

1. **Server authority:** clients are untrusted presentations.
2. **Least privilege:** user, service, DB role, MCP, worker and provider credentials.
3. **Defense in depth:** server authorization + database RLS + constraints + audit.
4. **Deny by default:** new sensitive endpoints/tables/commands are not publicly accessible until policies exist.
5. **No implicit trust between DIAL divisions.**
6. **One identity, scoped authorization.**
7. **Secrets never become client configuration.**
8. **Explicit data classification and minimization.**
9. **Provider/webhook responses are untrusted until verified.**
10. **AI is an untrusted reasoning component with scoped tools.**
11. **Donor code is untrusted supply-chain input until qualified.**
12. **Every high-impact action is attributable, idempotent and recoverable.**

## 4. Security zones

```text
INTERNET
  │
  ├── DIAL Home/Web/Consumer/Business/Health clients
  ├── WhatsApp/Provider callbacks
  └── partner APIs
          │
          ▼
   EDGE / API GATEWAY
   TLS · rate limit · bot/abuse · validation · headers
          │
          ▼
   SERVER AUTHORIZATION
   identity · permission · scope · state · DoA/SoD
          │
          ▼
   DOMAIN COMMANDS
   idempotency · concurrency · audit · evidence
          │
          ▼
   DATA
   RLS · DB roles · constraints · encryption · backups
```

Privileged Command Centre and Corporate flows additionally require step-up and stronger approval controls.

## 5. Identity / authentication

- Supabase Auth remains canonical.
- Prefer passkeys and/or phishing-resistant MFA for privileged users.
- Customer MFA can be risk/feature appropriate; high-risk actions can step up.
- central account recovery with anti-enumeration controls;
- verified phone/email linking;
- refresh-token reuse protection retained;
- session/device list and revocation;
- lock/velocity controls without creating easy denial-of-service against accounts;
- no homemade password storage.

### Password rule

The screenshot's "hash passwords" is correct as a principle, but DIAL must **not implement its own password table**.

Passwords are owned by Supabase Auth. DIAL never logs, exports or stores plaintext passwords.

## 6. Supabase client/server key boundary

Client apps may use only the current **publishable key** (or legacy anon key while migration exists).

The publishable key is not a secret.

Security comes from:
- RLS;
- Postgres grants;
- authenticated JWT;
- server-side command authorization.

Secret keys / legacy `service_role`:
- server/worker only;
- never browser/mobile/WhatsApp Flow JSON;
- separate by environment;
- rotated;
- prefer current Supabase secret keys over legacy service-role keys as migration permits.

## 7. Row-level and record-level security

RLS is mandatory on every table exposed through an API schema.

Additionally:
- private/non-client schemas for sensitive server-owned tables;
- explicit `SELECT`, `INSERT`, `UPDATE`, `DELETE` policies;
- negative IDOR tests;
- tenant/org scope tests;
- support/agent scope tests;
- Health/HR specialized policies;
- no policy relying only on user-submitted owner IDs.

RLS is defense in depth, not a substitute for server authorization.

## 8. Field/property tampering

Never deserialize request bodies directly into persistence objects.

Use command schemas that allowlist mutable properties.

Example:
```ts
UpdateAddressCommandSchema = z.object({
  addressRef: z.string(),
  line1: z.string().max(120),
  city: z.string().max(80),
  // no customerId, ownerId, approvalState, price, ledger state
})
```

Protect:
- IDs/ownership;
- roles/permissions;
- prices/discounts;
- tax;
- status;
- payment refs;
- provider scores;
- approval state;
- Health consent state;
- accounting fields.

This is DIAL's explicit defense against mass assignment / OWASP API object-property authorization failures.

## 9. Session security

For web session cookies where cookies are used:
- `Secure`;
- `HttpOnly`;
- appropriate `SameSite`;
- narrow `Path`;
- no sensitive values in URLs;
- short access token lifetime;
- secure refresh handling;
- token rotation/reuse detection;
- CSRF defenses for cookie-authenticated state-changing requests;
- logout/revoke-all support.

Prefer `__Host-` cookie naming where deployment topology allows.

## 10. Login and abuse controls

Rate limits are multi-dimensional:
- IP/network;
- identity/account;
- device/session;
- phone/email verification target;
- endpoint/business action;
- tenant/provider;
- WhatsApp `wa_id`;
- payment intent/provider ref.

Sensitive business-flow abuse controls cover:
- fake accounts;
- promo abuse;
- appointment/slot hoarding;
- proposal spam;
- scraping;
- password/OTP spraying;
- card/payment probing;
- support spam;
- sourcing spam.

Bot protection may use a low-friction challenge such as Turnstile or another approved provider on suspicious/high-abuse entry points, not every normal interaction.

## 11. Input validation and encoding

All untrusted input is schema validated at the boundary.

Rules:
- type;
- length;
- enum;
- format;
- range;
- cross-field business validation.

SQL/database access:
- parameterized queries/prepared statements/query builders only;
- no dynamic string-concatenated SQL from user data.

Output:
- React's normal escaped rendering by default;
- sanitize any intentionally rendered rich HTML/Markdown;
- contextual encoding;
- strict CSP.

## 12. File/media upload security

Uploads are treated as hostile.

Pipeline:

```text
client
→ signed limited upload intent
→ quarantine bucket
→ size/type/extension checks
→ magic-byte/file-signature validation
→ malware scan
→ content transformation/sanitization where applicable
→ metadata stripping where policy requires
→ safe generated filename
→ approved storage
→ domain evidence reference
```

Controls:
- allowlisted types by feature;
- max bytes/pixels/duration/pages;
- randomized object names;
- no executable serving;
- private buckets by default;
- signed short-lived downloads;
- image re-encode;
- PDF/document scanning;
- archive bombs blocked;
- SVG either prohibited or sanitized;
- asynchronous scan status;
- failed/infected upload never becomes trusted Evidence.

## 13. API response minimization

Every endpoint has an explicit response DTO/schema.

Do not return persistence models wholesale.

Remove:
- secret/internal fields;
- provider credentials;
- full PII when unnecessary;
- internal risk scores;
- other tenant/user data;
- raw diagnostic stack traces;
- hidden authorization/state fields not required by the client.

Pagination, field selection and size limits prevent accidental data dumps and resource exhaustion.

## 14. Security headers / browser protections

DIAL web properties must define a reviewed header policy including:
- strict Content-Security-Policy;
- HSTS after HTTPS/subdomain readiness;
- `X-Content-Type-Options: nosniff`;
- frame protection through CSP `frame-ancestors` (and compatible legacy header where useful);
- Referrer-Policy;
- Permissions-Policy;
- secure CORS;
- no unnecessary cross-origin isolation privileges.

Next.js nonce-based CSP may be used for dynamic script requirements.

## 15. HTTPS / transport

- HTTPS only in production;
- TLS 1.2+ with preference for current strong TLS;
- redirect HTTP;
- HSTS after validation;
- secure provider callback URLs;
- no mixed content;
- internal service TLS where threat model requires;
- certificate lifecycle monitoring.

Do not enable HSTS preload until all relevant subdomains are truly HTTPS-ready.

## 16. Encryption and sensitive data

At minimum:
- encrypted infrastructure/storage at rest;
- TLS in transit;
- secret manager for credentials;
- platform keystore/keychain for device secrets.

Use application-level envelope encryption for selected high-risk fields where database/storage compromise would otherwise expose unacceptable data, e.g. sensitive banking/identity/health data as determined by the data classification register.

Encryption is not a substitute for access control.

## 17. Webhooks / callbacks

All external callbacks:
- use provider-specific authentication/signature/hash verification;
- reject unexpected source/event type;
- replay/idempotency protection;
- timestamp/nonce where supported;
- strict schemas;
- correlation to known provider refs;
- never trust client-submitted "paid" state.

Applies to:
- Meta WhatsApp;
- Paynow;
- ContiPay;
- e-sign;
- support bridge;
- partners.

## 18. SSRF / outbound security

DIAL fetchers, webhook testers, document processors and AI tools must not fetch arbitrary URLs unrestricted.

Use:
- destination allowlists where possible;
- scheme controls;
- DNS/IP validation;
- block localhost/private/link-local/cloud metadata ranges;
- redirect re-validation;
- response size/time limits;
- isolated processing for untrusted documents.

## 19. Payments / PCI minimization

Prefer provider-hosted payment collection so DIAL does not receive raw card credentials.

- server-side adapters;
- no card/PIN secrets in logs/WhatsApp/support;
- PaymentIntent idempotency;
- authoritative callbacks/query/reconciliation;
- refund/reversal controls;
- four-eyes for exceptional/manual money actions;
- separate secrets per environment.

## 20. WhatsApp security

- DIAL owns Meta webhook;
- signature validation;
- message/event dedupe;
- flow token is purpose-scoped, expiring and non-authoritative;
- encrypted Flow data exchange;
- no provider/payment secret in Flow JSON;
- `wa_id` must be securely linked before exposing private records;
- template/window policy;
- support bridge minimizes sensitive data;
- media follows upload quarantine pipeline.

## 21. Chatwoot/support security

Chatwoot is not a data lake.

Only necessary context is copied:
- human refs;
- issue category;
- safe summary;
- support deep link.

Avoid full:
- Health record;
- bank details;
- payroll;
- identity document;
- unrestricted ledger.

Human agents receive branch/scope permissions. Attachments are scanned. Formal evidence is frozen into DIAL Evidence/RCE.

## 22. Health security

Health receives the strongest specialist profile:
- purpose/consent aware authorization;
- guardian/delegate scope;
- break-glass access with justification and mandatory review;
- sensitive read auditing;
- stronger session/step-up requirements where appropriate;
- minimal analytics;
- no generic support bot providing clinical judgment;
- health-specific retention and incident response.

## 23. Corporate / Command Centre security

- MFA/passkey mandatory for privileged users;
- device/session controls;
- step-up for high-risk commands;
- DoA/SoD;
- four-eyes for money/privilege/high-impact actions;
- no service secret in browser;
- no direct CRUD around state machines;
- sensitive field masking;
- immutable audit;
- periodic access certification;
- immediate JML/offboarding revocation.

## 24. Mobile security

Use OWASP MASVS/MASTG for Android/iOS.

Required:
- KeyStore/Keychain for secrets;
- no hard-coded secrets;
- encrypted/private local storage;
- no sensitive logs;
- HTTPS/network security config;
- validated deep/app links;
- clipboard/screenshot controls for selected highly sensitive screens;
- Play Integrity/device attestation as risk signal where appropriate;
- secure WebView bridges;
- backup exclusions for sensitive state;
- offline cache expiry and revocation behavior.

## 25. AI / agent / MCP security

AI never receives broad production authority.

- allowlisted tools;
- minimal data context;
- output treated as untrusted;
- prompt injection considered for web/docs/MCP;
- no payment/ledger execution tool;
- no unrestricted DB/service-role key;
- read-only MCP by default;
- production writes require explicit narrow adapters/human policy;
- tool arguments schema validated;
- retrieved external content cannot override Project Truth/system policy.

## 26. Donor / software supply chain

Before imported donor code can ship:
- exact repo + commit;
- licence;
- provenance;
- install/build script review;
- secret scan;
- SAST;
- dependency/SCA;
- SBOM;
- known-vulnerability scan;
- transitive dependency review for critical packages;
- code-sign/build provenance;
- DIAL boundary replacement tests;
- no automatic upstream merge.

## 27. Logs / telemetry

Never log:
- passwords/OTPs;
- refresh/access tokens;
- API secrets;
- full card/bank secrets;
- unrestricted health content;
- identity document bodies.

Use:
- structured logs;
- correlation IDs;
- field redaction;
- access-controlled log stores;
- retention rules;
- tamper-resistant/high-value audit.

## 28. Backups / recovery / ransomware resilience

- encrypted backups;
- PITR where supported;
- separated credentials;
- restore tests;
- recovery objectives by domain;
- immutable/offline protection where appropriate for critical backups;
- key/secret recovery procedures.

## 29. Vulnerability management

Sources:
- SAST;
- SCA;
- DAST;
- IaC scanning;
- container scanning;
- mobile testing;
- penetration tests;
- bug reports;
- runtime detections.

Every finding:
`finding → severity → owner → SLA → fix/mitigate → verification → evidence`.

Critical/high issues block release unless explicitly risk-accepted through authorized governance.

## 30. Security release rule

No feature is production-green only because functional tests pass.

Security evidence appropriate to its assurance tier is part of the Feature gate.
