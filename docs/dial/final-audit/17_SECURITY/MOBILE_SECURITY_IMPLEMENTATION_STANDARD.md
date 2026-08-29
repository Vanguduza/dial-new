# DIAL Mobile Security Implementation Standard

Applies to DIAL Consumer, Dial Health, DIAL Business, Technician, Courier, Warehouse and Command Centre mobile surfaces.

Use OWASP MASVS/MASTG as the verification catalog.

## Storage

- tokens/secrets → Android Keystore / iOS Keychain-backed storage;
- sensitive cache → private, minimum, encrypted where required, expiring;
- no service secrets in app bundles;
- exclude high-risk local state from backups where required;
- logout/revocation clears or invalidates cached rights.

## Logging

Release builds must not log:
- access/refresh tokens;
- OTP;
- provider/API secrets;
- raw payment details;
- full health/identity documents;
- sensitive attachment content.

## Network

- HTTPS only;
- cleartext disabled in release;
- validate redirect/deep-link destinations;
- certificate pinning only if an operational rotation/recovery design exists.

## Platform

- minimal permissions;
- exported Android components reviewed;
- secure content/FileProvider URIs;
- restrictive WebView origin/bridge allowlist;
- Play Integrity/device attestation is only a risk signal.

## Sensitive screens

Health/privileged screens can:
- redact app-switcher preview;
- disable screenshots when specialist policy requires;
- avoid clipboard secrets;
- require step-up after risk/inactivity.

## Offline

Offline state is visible.

Never treat a locally queued:
- payment confirmation;
- payout;
- privileged approval;
as final until the server accepts it idempotently.

## Deep links

All links:
- validate origin/association;
- resolve through canonical router;
- re-check authentication and current authorization;
- never trust an action merely because it is encoded in the URL.
