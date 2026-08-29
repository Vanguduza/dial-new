# Universal DIAL Identity, Credentials & SSO

## Lock

There is one DIAL Identity.

Credentials created in any DIAL customer-facing division work across all DIAL customer-facing divisions and platforms.

There is no separate Spare, Tech, Grocery, Laundry or Health credential database.

## Canonical model

- one Supabase Auth identity realm/project;
- one DIAL Identity;
- one Party graph;
- branch-specific profiles remain branch/domain state;
- authorization remains scoped.

## Universal credentials ≠ universal permissions

The same identity may have relationships as:
consumer customer, health patient/delegate, business member, supplier user, technician or employee.

Permissions derive from relationships/scopes. A customer credential does not confer staff/Command Centre access.

## Account creation points

Any account created via:
DIAL Home, Spare, Tech, Groceries, Laundry, Care, Assist, Projects, DIAL Business, Dial Health or WhatsApp account linking
must create/link the same canonical DIAL identity.

## Central account UX

Recommended public identity surface:
`accounts.<dial-domain>`

Responsibilities:
- sign in;
- create account;
- verification;
- password/passkey/OTP;
- recovery;
- identity linking;
- security/device/session settings.

Division flows return the customer to the original state after auth.

## Web SSO

All DIAL web surfaces trust the same identity issuer.

Use secure PKCE/session exchange and app-specific callbacks. Do not rely on JavaScript-accessible root-domain cookies as the security model.

## Native apps

DIAL Consumer, Dial Health and DIAL Business use the same credentials but keep app-specific secure sessions. Universal login never requires unsafe cross-app token sharing.

## Health

Same identity, separate:
- consent;
- patient/delegate relationship;
- health scopes;
- step-up assurance where needed;
- health records.

## Business

Same identity, then Organization membership/role determines access.

## WhatsApp identity

A `wa_id` is a channel identifier, not proof of ownership of an existing DIAL account.

States:
`UNLINKED → VERIFICATION_PENDING → LINKED → REVOKED`

Use OTP, authenticated deep link or another approved verification method.

## Duplicate identity handling

Candidate detection → step-up verification → controlled merge → immutable lineage.

Never silently merge high-risk identities.

## Guest conversion

`GuestContext → auth → verification → attach safe drafts → continue original journey`

Do not attach payments, clinical records or formal claims solely because they came from the same browser.

## Deletion / retention

One identity request fans out to domain-specific privacy/retention workflows. Health, accounting, tax, claims and statutory records may have lawful retention duties.
