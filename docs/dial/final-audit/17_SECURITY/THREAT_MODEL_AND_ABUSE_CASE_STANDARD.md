# DIAL Threat Model & Abuse Case Standard

Threat modeling is feature-driven, not a one-time architecture picture.

Each S2/S3 Feature/FRC records:

## Assets
- identities/credentials;
- money;
- health/HR;
- orders/jobs;
- provider/customer reputation;
- evidence;
- catalogue/fitment;
- location;
- privileged controls.

## Trust boundaries
- browser/native client;
- API;
- database;
- worker/Temporal;
- third-party provider;
- WhatsApp;
- Chatwoot;
- donor/integrated service;
- AI/MCP;
- employee/operator.

## STRIDE-style questions

- Spoofing: can actor/channel/provider identity be forged?
- Tampering: can user change owner/price/status/evidence?
- Repudiation: can consequential action lack attribution?
- Information disclosure: can another user/agent/log see data?
- Denial of service: can resource/slot/support/payment be exhausted?
- Elevation: can role/function/scope be bypassed?

## Business abuse

Also model:
- promo/coupon farming;
- fake provider/customer;
- supplier collusion;
- off-platform circumvention;
- appointment/slot hoarding;
- fake claims/delivery damage;
- sourcing spam;
- review manipulation;
- payment probing;
- support social engineering;
- account recovery takeover;
- health impersonation/delegation abuse.

## Deliverable

Threat model output is not pages of prose.

It produces:
- threat ID;
- affected Feature ID;
- exploit path;
- controls;
- test;
- residual risk;
- owner.

Unmitigated Critical/High threat blocks production unless explicitly accepted.
