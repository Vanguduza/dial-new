# The 20 Security Points in the Attached Images — DIAL Interpretation

The screenshot list is directionally good. DIAL adopts all twenty, but several need stronger or more precise implementation.

| # | Screenshot point | DIAL implementation |
|---:|---|---|
| 1 | Hide API keys | Client receives only intentionally public identifiers/keys. Secrets live in secret manager/server env. No provider, Supabase secret/service-role, AI, payment or Meta secret in browser/mobile bundles. |
| 2 | Purge Git secrets | Gitleaks/pre-commit/CI + repository-history response procedure. If a real secret was committed, remove exposure **and rotate/revoke it**; rewriting history alone is not enough. |
| 3 | Use public DB key | Use Supabase publishable key on client; it is intentionally retrievable. Security must come from RLS/grants/JWT. Server secret keys remain server-only. |
| 4 | Enable row-level security | Mandatory on every exposed table, plus explicit policies and negative IDOR/tenant tests. |
| 5 | Encrypt sensitive data | TLS + encrypted storage + selected field-level envelope encryption for high-risk data. Keys managed separately. |
| 6 | Enforce server-side auth | Server derives actor/session; client-submitted user/role/owner values never establish authority. |
| 7 | Lock record access | Object-level authorization + RLS + tenant/relationship checks + negative BOLA/IDOR testing. |
| 8 | Block field tampering | Explicit command DTO allowlists; never mass-assign request objects to models. Price/owner/status/role/ledger fields cannot be client-chosen. |
| 9 | Secure session cookies | Secure/HttpOnly/SameSite, CSRF strategy, rotation, revocation, short access tokens; avoid token leakage in URLs/logs. |
| 10 | Hash passwords | Supabase Auth owns password hashing. DIAL never stores raw passwords or implements a custom password database. |
| 11 | Rate-limit login | Expand to login, OTP, recovery, registration, APIs, expensive search, booking, promotions, WhatsApp, support, uploads and payments. |
| 12 | Add bot protection | Risk-based challenge + velocity/abuse detection for sensitive flows. Do not punish every legitimate user with friction. |
| 13 | Parameterize queries | Prepared/parameterized database access only. No user-data string concatenation into SQL. |
| 14 | Validate all input | Boundary schemas for type/length/range/enum plus business-state validation. Validate provider/webhook payloads too. |
| 15 | Escape user content | React escaped output by default; sanitize rich HTML/Markdown; strict CSP and contextual output encoding. |
| 16 | Restrict file uploads | Allowlist types, limits, magic-byte validation, quarantine, malware scan, safe filenames, private storage, signed downloads and image/document sanitation. |
| 17 | Trim API responses | Explicit response schemas/DTOs, field minimization, pagination and no persistence-model dumping. |
| 18 | Add security headers | Strict CSP, HSTS, nosniff, frame protections, Referrer-Policy, Permissions-Policy and strict CORS. |
| 19 | Force HTTPS | HTTPS-only production, secure callbacks, HSTS after readiness, no mixed content. |
| 20 | Scan dependencies | SCA + SBOM + lockfile review + automated patch PRs + vulnerability SLA; also scan containers/IaC/donor code. |

## Important additions beyond the screenshot

The screenshot does not fully cover several critical DIAL risks:

- BOLA/IDOR and function-level authorization;
- business-flow abuse/fraud;
- webhook replay/signature verification;
- CSRF;
- SSRF;
- supply-chain/donor provenance;
- mobile security;
- AI/MCP prompt/tool injection;
- payment reconciliation;
- Health/HR data access;
- backup/restore;
- incident response;
- privileged admin step-up/four-eyes;
- security regression testing;
- secrets rotation;
- observability redaction;
- secure build/release provenance.

Those are included in the DIAL Security Master Architecture.
