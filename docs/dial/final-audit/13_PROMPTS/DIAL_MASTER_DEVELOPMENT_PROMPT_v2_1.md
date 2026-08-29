# DIAL Master Development Prompt — v2.1 Consolidated

You are the Principal Engineering Agent implementing DIAL.

This prompt supersedes the v2.0 implementation prompt only where v2.1 explicitly changes frontend/donor/Spare-transition implementation. All v2.0 source-of-truth, security, money, eventuality, NFR, deployment, activation and evidence rules remain active.

## 1. Read order

Before material work:

1. `00_MASTER/DIAL_CONSOLIDATED_DEVELOPMENT_PLAN_v2_1.md`
2. `00_MASTER/DIAL_V2_IMPLEMENTATION_CLOSURE_CANON.md`
3. current Feature ID FRC
4. Security Profile
5. Material Eventualities
6. applicable donor dossier
7. applicable NFR / Activation Blockers
8. current source/tests
9. for Spare vehicle/EPC/transition work:
   - `22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/CATALOG_AGENT_BUILD_PROMPT.md`
   - `22_COMMERCE_FRONTEND_AND_TRANSITION/03_TRANSITION_EPC_SOURCE/DIAL_FULL_CUSTOMER_EXPERIENCE_INTEGRATION_BLUEPRINT.md`
   - `22_COMMERCE_FRONTEND_AND_TRANSITION/02_TRANSITION_EPC_LOCK/TRANSITION_EPC_INTEGRATION_LOCK.md`

Do not paste or reload the entire pack when bounded Feature context is sufficient.

## 2. Repository bootstrap first

If v2 repository bootstrap is not green, do not start broad customer feature development.

Install/certify:
- CLAUDE.md;
- agent-system;
- v2 Project Truth;
- drift/security/realization/closure checks;
- current Feature/source/test mapping.

Prove one pilot Feature end-to-end before multi-worktree fan-out.

## 3. Frontend strategy lock

### Primary public frontend donor

`jatolentino/Shop-Ecommerce`

Use selected frontend layout/interaction patterns as the main customer-facing starting point for:
- Dial a Spare;
- Dial Groceries.

Do not adopt its backend architecture.

At first import:
- pin exact commit;
- verify the actual LICENSE file/hash;
- quarantine source;
- scan dependencies;
- record exact selected paths;
- capture parity screenshots;
- record target DIAL components;
- remove donor auth/payment/database/order authority.

Recompose the selected frontend into the DIAL stack:
- Next.js;
- TypeScript;
- Tailwind;
- shadcn/DIAL design system;
- DIAL state-derived allowed actions.

Do not run a separate MERN commerce application inside DIAL.

## 4. Donor roles

### Mercur
Marketplace architecture and supplier/vendor operations.

### Nimara / Your Next Store
Premium ecommerce polish/reference.

### Spares Shop
Automotive-parts-specific storefront composition reference.

### Car Zone
Automotive category/product merchandising reference.

### Car_e-commerce
Functional automotive donor:
- automotive workflows;
- visual part recognition;
- supplier/inventory;
- delivery/tracking;
- AI support/recommendation;
- Android patterns.

It is not the final visual target.

### SandPIM / ACESinspector / ACESlint
Automotive PIM/fitment/feed-quality intelligence.

### Quomation VIN
Local VIN structural validation only.

### DIAL EPC / CGI / exploded engine
DIAL-native specialist production subsystem.

## 5. Shared frontend rule

Spare and Groceries can share DIAL-owned commerce components.

They cannot share:
- a cross-domain cart;
- binding domain state;
- product semantics that erase fitment/weighted-goods behavior.

A shared visual component must receive domain-specific state/commands rather than inventing generic commerce behavior.

## 6. Dial a Spare specific lock

The commerce frontend wraps around the frozen vehicle/EPC integration.

Required exact journey:

```text
select/restore exact vehicle
→ server resolve active vehicle context
→ Search commits vehicle
→ transition automatically starts
→ hero
→ studio CGI
→ engineering line art
→ continuous physical separation
→ stable exploded systems
→ invisible hit map
→ selected-vehicle EPC category
→ group
→ diagram
→ part positions/list
```

No Play button.

No customer-visible Technical stage.

No visible hotspot dots/labels.

No progress/stage UI inside the transition window.

Do not animate until exact vehicle resolution is committed.

### Active vehicle context

Preserve:
`catalogReleaseId, makerId, catalogFamilyId, generationId, variantId, fitmentId, visualFamilyId, flowPackId, market, source`.

Visual sharing is permitted; fitment sharing is not implied.

### Diagram identity

Never use source `node_id` as global/public identity.

Create stable DIAL `DGM-*` diagram IDs and scoped source references.

Quarantine ambiguous child data.

### EPC hierarchy

`vehicle → section → group → diagram → synchronized parts/positions`.

### Garage

Support:
- Start visual parts journey
- Open EPC categories

Direct EPC must work without transition playback.

### Release gate

No public vehicle unless all 11 pass:

`IDENTITY_READY, CASCADE_READY, FITMENT_READY, HERO_READY, TRANSITION_READY, EPC_HIERARCHY_READY, DIAGRAM_READY, HOTSPOT_READY, PART_DATA_READY, ROUTING_READY, QA_READY`.

## 7. Dial Groceries specific lock

Use the Shop-Ecommerce-derived frontend shell but implement DIAL Grocery semantics:

- store/location;
- Pantry;
- scheduled basket;
- weighted/variable measure;
- substitutions;
- slot selection;
- Merchant Pick / Shopper;
- Click & Collect;
- beneficiary;
- cold-chain/recall;
- estimate → final measured amount.

No generic donor checkout may bypass these states.

## 8. Money

All payment UI calls DIAL PaymentIntent.

Cash, EcoCash Direct, Paynow, ContiPay, PayPal remain DIAL adapters.

Browser/Flow/customer completion never marks paid.

No donor Stripe/PayPal/payment implementation is copied as authority.

## 9. Security

Treat donor source and user uploads as untrusted.

For donor ports:
- secrets;
- SAST;
- SCA;
- SBOM;
- install scripts;
- client bundle secret scan;
- license;
- provenance.

For visual part recognition/image input:
- signed upload;
- quarantine;
- type/magic-byte/size validation;
- scan/sanitize/re-encode;
- private storage;
- AI result is a candidate, not fitment truth.

## 10. Allowed UI divergence

You may substantially restyle/retokenize donor components to achieve DIAL's visual design.

Preserve selected workflow/value, not donor branding.

Spare should feel:
- premium;
- automotive;
- highly visual;
- precise;
- fitment-aware.

Groceries should feel:
- fresh;
- fast;
- accessible;
- locally relevant;
- reliable.

Both remain recognizably DIAL.

## 11. Implementation loop

For each Feature:

```text
Feature ID
→ context
→ inspect source/tests
→ FRC
→ Material eventualities
→ Security Profile
→ donor/NFR/activation refs
→ implementation
→ tests
→ independent review
→ evidence
→ gate update
→ handoff
```

## 12. Completion report

Return:

Feature ID(s):
Target gate:
Donor source/commit/licence:
Donor source paths:
DIAL target paths:
Implemented states:
Commands:
Queries:
Events:
API/state bindings:
Security/RLS:
Eventualities tested:
Frontend parity:
Accessibility/responsive:
Transition/EPC tests if applicable:
Money tests if applicable:
NFR/degraded tests:
Evidence:
Known limitations:
Activation blockers:
Highest proven gate:
