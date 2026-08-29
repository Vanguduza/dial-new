# DIAL Client Application Architecture — Final Decision

## Decision

DIAL uses a **three-family client strategy**, not one app per division and not one indiscriminate mega-app.

### 1. DIAL Consumer — unified everyday super-app

Native Android + native iOS + responsive web, with WhatsApp as a conversational companion.

Contains modular customer spaces for:

- Dial a Spare
- Dial a Tech
- Dial Groceries
- Dial Laundry
- Vehicle Hub / Garage
- Dial Care
- Dial Assist
- DIAL Projects (consumer/light client view)

Why this is the correct DIAL path:

- one customer identity and household;
- one trusted notification/support entry;
- Vehicle Hub naturally links Spare, Tech, Care and Assist;
- groceries/laundry increase repeat frequency and make a DIAL account more valuable;
- cross-branch Activity/history is much more useful than separate app silos;
- acquisition and update burden is lower than nine consumer apps;
- branch modules can still be engineered independently.

The implementation must follow a **modular super-app** architecture: core/shared modules, independent feature modules, and bridge/kit interfaces. Feature modules must not directly import other feature implementations. Grab's published super-app modularisation experience is an architectural reference, not a code donor.

### 2. Dial Health / My Health — standalone specialist app

Native Android + native iOS + web + official WhatsApp health flows.

Health stays separate because:

- clinical/medicine data has a different privacy/safety expectation;
- consent/delegation/family/clinical workflows are specialized;
- health emergency and medicine UX must not be buried in a retail/services shell;
- health-specific regulatory/safety certification can evolve independently;
- app permissions, knowledge, support escalation and sensitive-data controls are stricter.

DIAL Consumer may deep-link to Dial Health, but it must not expose detailed health records.

### 3. DIAL Business — B2B client workspace

Web-first with a native mobile companion where justified.

Contains:

- Fleet
- Projects
- organization-level Spare/Tech activity
- business orders/invoices/approvals
- branch/site/vehicle views
- business support and SLA cases

A fleet manager should not have to operate through a household consumer navigation model.

## Operational/provider apps remain separate

They are not customer super-app modules:

- Technician Android
- Courier Android
- Warehouse Android
- Supplier/Merchant portal
- Laundry facility/operator
- Staff/Corporate applications
- Command Centre

## DIAL Consumer navigation

Recommended persistent primary navigation:

1. **Home** — current activity, personalized shortcuts, service tiles.
2. **Explore** — branch/service discovery and cross-branch search.
3. **Activity** — all active/completed orders, jobs, deliveries, laundry, Assist, Care and projects.
4. **Support** — conversations, cases, help center and proactive issue alerts.
5. **Account** — identity, addresses, payment methods, vehicles, consents/preferences.

Branch spaces use local secondary navigation. Do not permanently add ten branch icons to the bottom bar.

## Do not create a universal cross-branch cart

Share checkout primitives and payment methods, but preserve domain transactions:

- Spare cart/order
- Grocery OrderGroup
- Laundry booking
- Tech job/quote
- Project funding
- Health transaction

A single "DIAL cart" would create false coupling between incompatible commercial/state models.

## State-driven action model

The client does not guess which buttons are allowed.

Each active aggregate exposes:

```ts
type CustomerActionDescriptor = {
  actionId: string
  label: string
  kind:
    | "NAVIGATE"
    | "COMMAND"
    | "APPROVAL"
    | "UPLOAD_EVIDENCE"
    | "SUPPORT"
  enabled: boolean
  reasonDisabled?: string
  confirmation?: string
  requiredInputs?: FieldContract[]
  policyVersion?: string
}
```

Examples:

- Reschedule
- Cancel
- Approve substitution
- Reject variation
- Change delivery instruction
- Report damage
- Upload evidence
- Confirm completion
- Open claim
- Ask for help
- Escalate to human

This is how eventuality endpoints remain complete as workflows evolve.

## Channel parity

### Android / iOS / web
Full rich experience.

### WhatsApp
Support:
- transaction initiation where a Flow is suitable;
- status;
- simple approvals;
- support;
- evidence intake;
- secure deep links to complex rich views.

EPC diagrams, cinematic vehicle transitions and other high-interaction features can deep-link to web/app. The customer remains online and context is preserved.

## Performance

The super-app must not become heavy merely because it contains many branches.

Required:

- modular feature packages;
- lazy initialization;
- remote configuration for branch availability, not as business activation authority;
- cached service tile metadata;
- progressive image/media loading;
- reduced-motion and data-saver modes;
- startup path contains only shared shell + immediate Home data;
- avoid loading EPC/3D/visual assets until the user enters Spare/vehicle exploration.

## Cross-branch continuity

Shared:

- identity;
- addresses;
- notification center;
- support;
- payment methods;
- Vehicle Hub;
- Customer 360;
- Activity;
- evidence uploader;
- design system.

Not shared as one state machine:

- carts;
- bookings;
- jobs;
- claims;
- delivery jobs;
- entitlements;
- clinical transactions.

## Definition of customer completion

For every customer-facing top-level feature and eventuality:

1. the customer can discover or deep-link to the current state;
2. the customer can perform every permitted self-service action;
3. blocked actions explain why;
4. evidence can be added online;
5. support is available in context;
6. human escalation preserves context;
7. final resolution/receipt/history is visible online.

Physical fulfilment may happen offline, but the digital journey does not disappear at the point something goes wrong.

## Public web home — v1.4

The root route `/` is DIAL Home, a public service router.

A customer does not need an account merely to understand or browse DIAL services.

Sign-in is:
- available from the header/account action;
- invoked contextually at protected/transactional points;
- universal across DIAL customer-facing surfaces.

The landing donor, Home IA and universal identity model are defined in `16_HOME_IDENTITY_WHATSAPP/`.

## WhatsApp as first-class companion channel

DIAL Consumer/Web must be able to deep-link to/from a WhatsApp ChannelSession while retaining customer/guest, branch and transaction context.

WhatsApp is not a secondary notification-only channel: it supports structured branch journeys, payments/status, issue reporting and support where the WhatsApp UI is appropriate.

