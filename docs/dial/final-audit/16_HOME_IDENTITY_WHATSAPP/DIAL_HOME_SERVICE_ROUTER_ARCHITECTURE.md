# DIAL Home & Service Router Architecture

## Lock

`/` is public and is no longer Sign In / Sign Up.

Authentication remains available from the header and is requested only when a transaction or protected record actually requires identity.

## Information architecture

```text
/
├── Hero / universal intent
├── Service Router
│   ├── Spare
│   ├── Tech
│   ├── Groceries
│   ├── Laundry
│   ├── Garage / Vehicle Hub
│   ├── Care
│   ├── Assist
│   └── Projects
├── How DIAL works
├── Continue / current activity if signed in
├── Trust / protection
├── DIAL Business
├── Dial Health
├── Support / WhatsApp
├── FAQ
└── Footer
```

Fleet is primarily under DIAL Business rather than the household service grid. Dial Health is a dedicated high-trust destination.

## Header

Desktop:
DIAL logo | Services | How it works | Business | Health | Help | Search | Account/Sign in

Mobile:
logo | search/intent | account | menu

Do not make Sign Up the dominant CTA.

## Hero

Primary interaction:
**What do you need?**

Deterministic/safety-aware routing can map:
- parts/vehicle parts → Spare;
- repairs/trades → Tech;
- food/household shopping → Groceries;
- laundry → Laundry;
- roadside → Assist;
- care plan → Care;
- larger scope → Projects;
- health → Dial Health.

AI may assist free-text understanding, but deterministic safety/category checks own the final route for consequential intents.

## Service cards

Examples:
- Spare — Find the right part for your vehicle
- Tech — Book a trusted technician
- Groceries — Shop local stores
- Laundry — Pickup, clean and return
- Garage — Vehicle history and reminders
- Care — Vehicle care plans and benefits
- Assist — Roadside help
- Projects — Bigger work, managed end to end

## Signed-in Continue strip

Keep it compact, sourced from universal Activity:
- courier approaching;
- technician arriving;
- grocery picking;
- laundry ready;
- Assist incident;
- pending approval;
- vehicle reminder.

The landing must not turn into the Command Centre.

## Guest-to-auth handoff

Preserve safe guest context:
- selected service;
- cart/draft;
- vehicle candidate;
- address draft;
- search;
- referral.

After authentication, attach it idempotently to the canonical customer.

Do not auto-merge sensitive/health/payment records based only on a device/browser cookie.

## Crawlable service routes

`/spare`, `/tech`, `/groceries`, `/laundry`, `/garage`, `/care`, `/assist`, `/projects`, `/business`, `/health`.

## Performance

- no EPC/CGI/3D payload on initial home load;
- lazy branch bundles;
- optimized images;
- server-rendered SEO content;
- reduced-motion/data-saver;
- Core Web Vitals gate.

## Eventualities

- unavailable area → show availability and valid next action before checkout;
- anonymous user → browse first, auth only when required;
- existing account from another division → same credentials work;
- ambiguous intent → offer clear branch choices and Help;
- signed-in personalization unavailable → public home still works;
- health intent → route to the dedicated Dial Health experience.
