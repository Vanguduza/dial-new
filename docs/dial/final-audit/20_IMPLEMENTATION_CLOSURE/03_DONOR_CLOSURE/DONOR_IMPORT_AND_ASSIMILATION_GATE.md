# Donor Import & Assimilation Gate

v2 closes the donor-design question by separating **adoption-mode closure** from the **time-of-import commit pin**.

Pinning every repository months before its implementation would create stale pins. Instead:

> adoption mode is frozen in canon; the exact upstream commit is pinned immediately before the first import and becomes part of the Feature evidence.

## Gate DI-1 — identity

Required:
- donor ID;
- canonical upstream URL;
- exact repo owner/name;
- exact commit/tag;
- upstream release/date if relevant.

## DI-2 — licence

For imported code:
- licence;
- exact licence file;
- licence hash;
- notices/attribution;
- dependency licence scan;
- legal exception if required.

No import while licence is ambiguous.

## DI-3 — scope

List exact:
- upstream modules;
- source paths;
- schemas;
- algorithms;
- assets/UX structures;
- tests;
- dependencies.

"No wholesale repo copy unless the donor's locked mode explicitly allows wholesale."

## DI-4 — boundary replacement

Document replacements for:
- auth/identity;
- persistence;
- ledger/payments;
- workflow;
- file/evidence;
- events;
- audit;
- notifications;
- search;
- provider authority.

## DI-5 — quarantine

Imported source first lands under an isolated donor-import/quarantine tree or import branch.

No donor package is allowed to silently become a production runtime dependency because an agent found it convenient.

## DI-6 — security and supply chain

Run:
- secrets scan;
- SAST;
- SCA;
- install/postinstall review;
- SBOM;
- build/test;
- malicious/unsafe config review.

## DI-7 — behavior parity

Where DIAL is porting proven behavior:
- preserve upstream fixture/tests where legally/technically useful;
- add DIAL parity fixtures;
- prove expected behavior before replacing donor boundaries;
- then add DIAL integration/security/eventuality tests.

## DI-8 — visual assimilation

For UX/UI donors:
- preserve interaction/workflow value;
- retokenize;
- replace brand/navigation/auth;
- use DIAL design system;
- test responsive/accessibility;
- reject isolated "foreign product" appearance.

## DI-9 — provenance

Every assimilated feature records a provenance object in its FRC/evidence.

## DI-10 — upgrade policy

Choose:
- upstream watch + selective rebase;
- frozen fork + security-only watch;
- one-time extraction;
- normal package update;
- external-service API version watch.

No automatic upstream merge into authoritative DIAL code.
