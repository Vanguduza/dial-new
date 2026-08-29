# DIAL Home — Premium Solutions Environment Design Lock

**Decision ID:** HOME-DESIGN-002  
**Status:** LOCKED  
**Supersedes:** any interpretation of the landing donor as the final visual design.

## 1. Product intent

DIAL Home must immediately communicate:

> **DIAL is an environment full of trusted solutions.**

The customer should understand within seconds that DIAL can solve a broad range of everyday, vehicle, technical, business and specialist needs while operating with discipline, professionalism and support.

The home is not:
- a sign-in page;
- a generic SaaS landing page;
- an ERP dashboard;
- a marketplace homepage with dozens of products;
- a collage of unrelated branch brands;
- an "AI" neon-gradient experience.

## 2. Engineering donor vs final design

The selected donor remains:

`nobruf/shadcn-landing-page`  
MIT  
`PORT-SELECTED-MODULE + PORT-UX-UI`

Its role is engineering acceleration:
- responsive navbar;
- mobile menu;
- hero composition primitives;
- service section structure;
- FAQ/footer primitives;
- clean Next.js/Tailwind/shadcn composition.

It is **not** the DIAL art direction.

Every imported component must be retokenized/recomposed into the DIAL design system.

## 3. Visual direction

**Design language:** `Premium Solutions Environment`

Characteristics:
- clean modern composition;
- generous visual breathing room;
- professional, restrained typography;
- sophisticated neutral surfaces with one disciplined DIAL accent system;
- excellent real-world photography, CGI and generated product visuals;
- subtle depth;
- restrained cinematic motion;
- high information confidence;
- clear operational/trust cues;
- human, not sterile;
- premium, not extravagant.

The emotional mix should feel closer to:
- a premium automotive product site;
- a trusted modern financial/service platform;
- a high-end engineering/services company;

while remaining unmistakably DIAL.

## 4. Above-the-fold hierarchy

```text
DIAL                                       Services  Business  Health  Help  Sign in

                   EVERYTHING YOU NEED. ONE DIAL.

                     What do you need solved today?

              [ Describe, search or choose a DIAL service... ]

         Spare     Tech     Groceries     Laundry
         Garage    Care     Assist        Projects

                     Continue on WhatsApp
```

Exact marketing copy can evolve through design/content review. The hierarchy is locked.

Authentication is secondary.

## 5. Solutions environment

Service entries should behave like **portals into solution environments**, not generic card-grid widgets.

Examples:
- Spare → polished vehicle/part context;
- Tech → professional technician/work environment;
- Groceries → fresh local-shopping context;
- Laundry → clean custody/service context;
- Assist → road/vehicle rescue context;
- Projects → managed skilled-work context.

Branch visual identity may change imagery, iconography and specialist components, but:
- typography;
- geometry;
- interaction feedback;
- accessibility;
- status language;
- support patterns;
remain DIAL.

## 6. Ambient visual layer

The hero may contain a restrained animated/composited solutions environment showing subtle glimpses of DIAL capabilities.

Rules:
- movement supports meaning;
- no auto-playing visual noise;
- no giant looping video required for page comprehension;
- reduced-motion users receive a first-class static composition;
- data-saver/slow connections receive lightweight imagery;
- no initial EPC/3D/CGI payload;
- visuals must not reduce text contrast.

## 7. Trust atmosphere

Trust is communicated visually and structurally, not through inflated claims.

High-value proof areas:
- verified/qualified providers where applicable;
- protected/controlled transaction processes;
- traceable fulfilment;
- real support and escalation;
- clear current state;
- customer evidence/history.

Do not publish numerical trust claims unless backed by real metrics.

## 8. Signed-in behavior

Authenticated customers see a small `Continue` strip sourced from universal Activity.

Examples:
- `JOB-02481 — Technician arriving`
- `ORD-18452 — Groceries being picked`
- `DEL-... — Delivery nearby`

Privacy:
- do not expose sensitive Health/HR/payment detail in general Home previews;
- use redacted generic labels where necessary;
- device/session security still applies.

## 9. Interaction quality

Required:
- polished hover/focus/tap transitions;
- responsive service portals;
- keyboard navigation;
- screen-reader semantics;
- dynamic text sizing;
- obvious focus states;
- no hidden critical action behind hover only;
- motion budget;
- visual regression tests.

## 10. Anti-patterns

Reject:
- generic gradient spheres;
- excessive glassmorphism;
- endless rounded cards;
- fake dashboard metrics;
- meaningless "AI" imagery;
- stock-photo collage;
- giant sign-up CTA;
- pricing-table SaaS layout;
- unrelated donor styling between divisions.

## 11. Acceptance test

A fresh evaluator seeing the Home without prior DIAL context should be able to answer:

1. What kind of platform is this?
2. What can I get done here?
3. Where do I start?
4. Does it feel trustworthy/professional?
5. Can I get human help?
6. Can I continue without creating an account immediately?

If those answers are not obvious, the design fails.
