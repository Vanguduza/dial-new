# DIAL Web & API Security Implementation Standard

## Request pipeline

```text
TLS / edge
→ request size/rate/bot controls
→ session/token verification
→ input schema validation
→ permission/scope check
→ aggregate state/version check
→ DoA/SoD/step-up if required
→ idempotency
→ domain command
→ database/RLS/constraints
→ audit/evidence
→ explicit response DTO
```

No endpoint should bypass this model simply because it is "internal".

## Authorization

Each endpoint/command documents:
- authentication required?
- permitted Party relationship/role;
- tenant/organization/site scope;
- object access rule;
- function/action permission;
- sensitive property restrictions;
- state prerequisites.

Tests attempt:
- another customer's reference;
- guessed/enumerated reference;
- same role in another organization;
- revoked relationship;
- lower role invoking higher function;
- immutable/hidden field mutation.

## Next.js

Server Actions and route handlers are still server endpoints.

Treat arguments as untrusted. A hidden/disabled React button is not authorization.

## CSP

Deploy a strict Content Security Policy.

Prefer:
- narrow script/style/image/connect/frame sources;
- nonce/hash for necessary scripts;
- `object-src 'none'`;
- controlled `base-uri`, `frame-ancestors`, `form-action`.

A report-only phase can help rollout, but enforcement is the target.

## CSRF

For cookie-authenticated state changes:
- SameSite is one control;
- verify Origin/Host where appropriate;
- use a CSRF strategy for requests that can be cross-site;
- never use state-changing GET requests.

## Search/filter APIs

- bounded query length;
- supported filter/sort allowlist;
- no arbitrary SQL/order expressions;
- pagination/result limits;
- expensive-query abuse limits.

## Caching

Explicitly classify responses as:
- public immutable;
- public dynamic;
- private user;
- private organization;
- no-store/high sensitivity.

Never leak personalized cache across principals.

## Errors

Customer receives:
- safe explanation;
- stable error code;
- correlation reference.

Server gets detailed diagnostics with redaction.
