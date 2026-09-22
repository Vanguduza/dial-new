# DIAL Brand Portal — Rev 1
## Product specification for the human and machine-facing surface of the DIAL Brand Pack

**Status:** PROPOSED CANONICAL  
**Brand authority:** `docs/dial/identity/DIAL_BRAND_PACK_REV1.md`  
**Machine manifest:** `docs/dial/identity/brand-pack/DIAL_BRAND_PACK_MANIFEST.v1.json`  
**Stage policy:** `docs/dial/identity/brand-pack/DIAL_BRAND_STAGE_PROJECTION_POLICY.v1.json`

---

## 1. Product purpose

The DIAL Brand Portal is the first-class product surface for DIAL Identity.

It is not a design playground disconnected from product truth and it is not a replacement for the frontend development system.

The portal exists to make the Brand Pack usable by:

- product designers;
- frontend engineers;
- marketing/communications;
- product owners;
- AI/design providers through machine projections;
- DDE and frontend tooling through versioned exports;
- reviewers who need to understand why a DIAL screen does or does not feel coherent.

Its two equal responsibilities are:

1. **human understanding** — clear, interactive, example-led brand guidance;
2. **machine distribution** — deterministic, versioned, content-addressed brand projections.

---

## 2. Authority boundary

The portal may display and distribute Brand Pack authority.

It may not:

- edit Project Truth;
- edit the Screen Registry or Feature Graph;
- invent features/screens;
- mutate FRCs;
- bypass VEKL qualification;
- promote Visual Authority;
- promote Experience Authority;
- change provider policy;
- mutate domain truth;
- become a runtime product SoR.

Any future edit workflow must route an approved change into the normal repository/authority process.

---

## 3. Primary portal navigation

Recommended information architecture:

1. **Overview**
2. **Identity**
3. **Logo**
4. **Colour**
5. **Typography**
6. **Layout & Geometry**
7. **Iconography**
8. **Interaction & Motion**
9. **Imagery / Photography / CGI / 3D**
10. **Product Profiles**
11. **Application Contexts**
12. **Screen Families**
13. **Components & Patterns**
14. **Accessibility**
15. **AI / Generative Design**
16. **Assets**
17. **Do / Don't**
18. **Brand Application Lab**
19. **Brand Inspector**
20. **Releases**
21. **Governance**

The navigation should remain compact and searchable; this is not a documentation tree that requires users to read every section sequentially.

---

## 4. Overview

The landing view should immediately communicate:

> **White creates space. Black creates structure. Orange creates attention.**

It should show:

- the current canonical release;
- global DIAL identity;
- current colour law;
- featured product profiles;
- latest approved assets;
- current product/application coverage;
- recent brand changes;
- quick access to machine exports.

The overview should visually demonstrate the brand itself.

---

## 5. Colour experience

The Colour page should be interactive rather than a swatch list.

It should include:

- canonical/seed palette;
- semantic status palette separation;
- light/dark examples;
- ordinary UI colour-budget guidance;
- accessible text/background pairings;
- orange-use examples;
- orange misuse examples;
- full-screen composition examples;
- product-profile examples.

### Orange Budget Inspector

A sample screen or uploaded screenshot can be inspected for:

- approximate orange share;
- number of strong orange focal clusters;
- orange CTA count;
- inactive orange controls;
- adjacent orange panels;
- orange used as semantic status;
- visual competition between hero, CTA and navigation.

The result must be contextual:

```text
Screen class: CHECKOUT
Design zone: C
Orange share: 5.4%
Strong focal clusters: 1
Inactive orange controls: 0
Semantic misuse: 0
Assessment: PASS
```

The tool must not fail a screen merely because the pixel percentage lies outside a target band.

---

## 6. Product Profiles

Product Profiles should be generated from Brand Pack source data and reconciled with `FRONTEND_PRODUCT_PROFILE_REGISTRY.json`.

Each page should show:

- inheritance from `dial.global`;
- product character;
- application contexts;
- imagery/art direction;
- preferred visual tendencies;
- interaction/motion opportunities;
- density expectations from the frontend profile;
- applicable pattern policy;
- anti-patterns;
- example compositions;
- asset collections;
- machine projection preview.

Products:

- Global
- Spare
- Tech
- Groceries
- Laundry
- Vehicle Hub
- Care
- Assist
- Projects
- Fleet
- Health
- Corporate
- Platform
- GMPC
- DKRF
- Logistics overlay
- Control profile
- Van profile

The portal must clearly label Logistics as a cross-module overlay and Control/Van as adjacent profiles where they do not correspond to canonical feature modules.

---

## 7. Application Contexts

The portal should explain how the same DIAL identity adapts across the 20 canonical applications.

Application context pages should be generated from the canonical application graph rather than manually maintained.

Grouping:

### Public/customer
- DIAL public web
- DIAL Consumer Android
- DIAL Consumer iOS
- DIAL Consumer web
- DIAL Consumer WhatsApp

### Health
- Dial Health Android
- Dial Health iOS
- Dial Health web
- Dial Health WhatsApp
- Dial Health provider surfaces

### Business
- DIAL Business web
- DIAL Business mobile companion

### Provider/operations
- Technician Android
- Courier Android
- Supplier/Merchant Web
- Grocery Shopper
- Laundry Facility
- Warehouse Android
- Staff Web
- Command Centre

Each context should show what changes in density, motion ceiling, imagery, navigation expression and brand intensity without redefining screen responsibilities.

---

## 8. Screen Families

The portal should never maintain a competing list of 428 screens.

Instead, it should query/projection-bind to canonical screen roles and present reusable brand guidance for screen families such as:

- home / entry / discovery;
- search / browse / catalogue;
- product/detail;
- tracking/map;
- checkout/payment/approval;
- job/operational queue;
- support/issue/claim;
- timeline/history;
- action sheet/contextual action;
- form/onboarding;
- dashboard/control;
- conversational companion.

A viewer may search a canonical `screen_id` and see its computed Brand Context Projection.

---

## 9. Interaction & Motion page

This page should explicitly avoid becoming an effect catalogue.

It should show:

- DIAL temporal character;
- cause/effect principles;
- continuity principles;
- product-specific motion opportunities;
- design-zone intensity ceilings;
- reduced-motion equivalence;
- good/bad examples;
- motion anti-character.

### Motion Intelligence Lab

Inputs:

```text
Product profile
Application
Screen role
Capability envelope
Design zone
Visual Authority status
```

Outputs:

- relevant temporal characteristics;
- contextual opportunity hints;
- anti-character warnings;
- motion ceiling;
- reduced-motion obligations.

It should **not** output a mandatory final animation recipe.

The actual MotionSpec remains authored downstream by the interaction/motion enrichment stage.

---

## 10. Imagery / CGI / 3D page

Should include:

- photography direction;
- capture examples;
- professional product-image preparation;
- background-removal standards;
- crop/aspect-ratio guidance;
- CGI guidance;
- technical illustration;
- exploded-diagram guidance;
- hotspot/inspection examples;
- generated-media QA;
- provenance requirements.

A future image-processing tool may be surfaced here, but it remains a tooling capability, not Brand Pack authority.

---

## 11. Components & Patterns page

This page is explanatory and links to the canonical frontend component/pattern registries.

It should show:

- how DIAL brand is expressed through registered components;
- how product profiles change treatment without changing identity;
- allowed pattern examples;
- conditional pattern use;
- forbidden patterns;
- design-zone context.

It must never publish a second component registry.

---

## 12. AI / Generative Design page

The portal should provide machine/human views of:

- applicable Brand Context Projection;
- identity anchors;
- product-expression profile;
- screen-role context;
- colour behaviour;
- art direction;
- motion intelligence;
- brand anti-patterns;
- critic dimensions;
- authority boundaries.

The important instruction is:

> Brand context is not a free-form “make it look DIAL” prompt. It is a structured projection selected after canonical product/application/screen resolution.

Provider-specific prompt templates may render from this structured projection but must remain downstream artifacts.

---

## 13. Brand Application Lab

The Lab lets a user select:

```text
Brand release
Product profile
Application
Screen family or canonical screen_id
Theme
Design zone
Density
```

It then displays:

- computed global + product identity;
- colour guidance;
- typography character;
- imagery direction;
- motion intelligence;
- critic expectations;
- applicable examples.

The Lab is a **projection viewer**.

It does not modify the canonical screen graph.

---

## 14. Brand Inspector

Inputs may include:

- screenshot;
- rendered preview;
- design candidate metadata;
- declared token IDs;
- product profile;
- application;
- screen ID;
- Brand Context Projection;
- interaction evidence.

Outputs should be structured evidence:

```yaml
BrandInspection:
  release_match: PASS
  product_profile_match: PASS
  colour_discipline: PASS
  orange_selectivity: REVIEW
  typography_character: PASS
  imagery_direction: PASS
  subbrand_drift: PASS
  motion_character: NOT_EVALUATED
  findings:
    - severity: MINOR
      code: ORANGE_FOCAL_COMPETITION
      detail: "Hero and bottom-nav primary action compete for the same emphasis."
```

The inspector does not decide Visual Authority.

---

## 15. Releases

The Releases page should expose:

- release ID;
- status;
- publication date;
- source commit;
- content hash;
- supersedes;
- compatibility;
- changed brand domains;
- migration notes;
- product-profile changes;
- token changes;
- asset changes.

Development tasks should be able to cite an exact release.

---

## 16. Governance

The Governance page should make authority explicit:

```text
DRAFT
  ↓
REVIEWED
  ↓
OWNER / AUTHORIZED BRAND AUTHORITY
  ↓
CANONICAL_RELEASE
  ↓
SUPERSEDED / DEPRECATED
```

It should also show pending `BrandEvolutionCandidate` proposals produced from accepted, evidenced product work.

No agent can promote its own proposal.

---

## 17. Search

Portal search should support:

- brand principle;
- token;
- product profile;
- asset;
- application;
- canonical screen ID;
- screen family;
- component ID;
- pattern ID;
- release ID.

Where canonical information comes from another registry, the portal should display the source authority and current hash rather than silently copying it.

---

## 18. Machine endpoints / exports

Future implementation should expose stable read-only exports such as:

- Brand Pack manifest;
- current canonical release;
- product profile projection;
- application-context projection;
- screen Brand Context Projection;
- token source projection;
- asset manifest;
- brand critic contract;
- stage projection policy.

Writes must not be accepted through a generic runtime API without explicit governance.

---

## 19. Visual design of the portal itself

The portal should be an exemplar of the DIAL brand.

Recommended characteristics:

- warm-white primary canvas;
- near-black structural rail/header;
- sparse orange selected/action indicators;
- large editorial examples;
- high-quality imagery;
- generous whitespace in identity/marketing sections;
- denser technical views for tokens, provenance and releases;
- bounded glass/refraction only where it clarifies hierarchy;
- purposeful motion;
- excellent responsive behavior.

It should demonstrate that DIAL can be premium without being orange-heavy.

---

## 20. Acceptance criteria

The portal succeeds when:

- a new designer can understand DIAL identity without reading repository internals;
- a developer can identify the exact source token/profile/release used by a screen;
- an AI provider can consume a structured Brand Context Projection;
- no portal page duplicates canonical screen/feature ownership;
- motion guidance adds intelligence rather than prescribing a closed effect list;
- product profiles feel related but not identical;
- Health/operations remain appropriately restrained;
- machine exports are versioned and content-addressed;
- brand changes are reviewable and traceable;
- accepted product-design learning can propose, but not silently mutate, DIAL identity.
