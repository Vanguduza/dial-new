# Dial Visual Transformation Generator
## Technical & Implementation Specification + Coding-Agent Build Prompt

---

# Part I — Technical & Implementation Specification

## 1. Purpose

The Dial Visual Transformation Generator, abbreviated **DVTG**, is the production system responsible for creating the cinematic vehicle navigation assets used by Dial a Spare.

Its job is to transform an approved vehicle reference set into the complete visual journey:

**Real vehicle hero → 2.5D depth activation → CGI transformation → technical render → line-art vehicle → pre-explosion state → exploded spare-category navigator → category focus states**

The generator does **not** determine which exact parts fit the selected vehicle.

That responsibility belongs to Dial's vehicle fitment and EPC systems.

The system therefore maintains a strict separation between:

### `VISUAL_FAMILY_ID`
Controls what the vehicle looks like.

### `FITMENT_ID`
Controls what parts, diagrams, engines, transmissions and EPC records actually belong to the user's exact vehicle.

---

## 2. Locked Architectural Principles

### 2.1 Visual-family reuse

Reuse the same visual pack whenever a customer would reasonably say:

> “That is my car.”

Do not create separate visual packs merely because vehicles have different:

- engines;
- gearboxes;
- drivetrains;
- emissions systems;
- minor trims;
- alternators;
- ECUs;
- invisible production revisions.

Split a visual family when there is a materially different:

- body generation;
- body style;
- cab type;
- wheelbase where visible;
- major facelift;
- front/rear body treatment;
- vehicle silhouette.

### 2.2 Exact fitment remains authoritative

Runtime flow:

```text
USER VEHICLE SELECTION
        ↓
FITMENT_ID
        ↓
VISUAL_FAMILY_ID
        ↓
Visual animation
        ↓
User selects Engine
        ↓
FITMENT_ID + VC-ENG
        ↓
Exact EPC Engine category
        ↓
Exact EPC diagrams
        ↓
Hotspots
        ↓
Part numbers
        ↓
Commercial listings
```

---

## 3. Visual State Model

Each production asset pack must support:

```text
HERO_PHOTO
    ↓
DEPTH_2_5D
    ↓
CGI_PHOTOREAL
    ↓
TECHNICAL_SHADED
    ↓
LINE_ART
    ↓
PRE_EXPLOSION
    ↓
EXPLODED_NAVIGATION
    ↓
CATEGORY_FOCUS
```

These states should appear as one continuous transformation.

---

## 4. Runtime State Machine

```text
IDLE
VEHICLE_SELECTED
ASSET_LOADING
HERO_READY
DEPTH_ACTIVE
CGI_ACTIVE
TECHNICAL_ACTIVE
LINE_ART_ACTIVE
PRE_EXPLOSION
EXPLOSION_ACTIVE
EXPLODED_READY
CATEGORY_FOCUSED
CATEGORY_SELECTED
EPC_TRANSITION
EPC_LANDING
EPC_DIAGRAM
```

A deliberate **Skip animation / Browse EPC** bypass is permitted.

---

## 5. Input Contract

Example `VisualGenerationJob`:

```json
{
  "visualFamilyId": "VF-TOYOTA-HILUX-AN130-DOUBLECAB-FL",
  "make": "Toyota",
  "model": "Hilux",
  "generation": "AN120/AN130",
  "bodyStyle": "Double Cab",
  "visualPhase": "2020 Facelift",
  "yearFrom": 2020,
  "yearTo": null,
  "references": {
    "frontThreeQuarter": "source/front-3q.jpg",
    "front": "source/front.jpg",
    "side": "source/side.jpg",
    "rearThreeQuarter": "source/rear-3q.jpg",
    "rear": "source/rear.jpg"
  },
  "enabledCategories": [
    "VC-ENG",
    "VC-TRN",
    "VC-DRV",
    "VC-COOL",
    "VC-FUEL",
    "VC-EXH",
    "VC-FSUS",
    "VC-RSUS",
    "VC-STR",
    "VC-FBRK",
    "VC-RBRK",
    "VC-WHL",
    "VC-ELEC",
    "VC-LGT",
    "VC-HVAC",
    "VC-INT",
    "VC-BODY",
    "VC-GLS",
    "VC-DRS",
    "VC-SVC"
  ]
}
```

---

## 6. Source Asset Requirements

### Required
- front three-quarter hero reference;
- source provenance record;
- confirmed commercial-use-compatible licence.

### Strongly recommended
- front view;
- side view;
- rear three-quarter;
- rear view.

---

## 7. Source Asset Provenance

Each source file must store:

```json
{
  "assetId": "SOURCE-FRONT-3Q",
  "sourceUrl": "...",
  "author": "...",
  "licence": "CC BY-SA 4.0",
  "licenceUrl": "...",
  "attribution": "...",
  "downloadedAt": "...",
  "sha256": "...",
  "commercialUseApproved": true
}
```

The job must fail before processing if `commercialUseApproved != true`, unless an authorized reviewer explicitly overrides it.

---

## 8. Stage 1 — Source Normalisation

The generator should:

1. validate image resolution;
2. reject corrupt assets;
3. normalize colour space;
4. detect vehicle bounds;
5. identify orientation;
6. remove/mask unrelated objects;
7. establish canonical canvas;
8. normalize vehicle scale;
9. align wheel-ground plane;
10. create a clean reference bundle.

The original source photograph must remain preserved unchanged.

---

## 9. Stage 2 — Identity Lock

Create an immutable `IdentityLockManifest` containing:

- silhouette;
- roofline;
- bonnet length;
- wheelbase ratio;
- front/rear overhang;
- windscreen angle;
- side-window geometry;
- door count;
- grille geometry;
- lamp boundaries;
- wheel-arch positions;
- body-panel landmarks;
- cab/bed geometry for pickups;
- roof/body height.

All downstream states are checked against this identity lock.

---

## 10. Stage 3 — Segmentation

Generate masks for:

- body;
- windows/glass;
- tyres;
- wheels;
- lights;
- grille;
- bumpers;
- mirrors;
- cabin;
- pickup bed;
- background.

Optional:
- bonnet;
- doors;
- roof;
- front fascia;
- rear fascia.

---

## 11. Stage 4 — Depth Reconstruction

Create:

- monocular depth map;
- foreground/background separation;
- optional layered depth planes;
- optional surface normals.

Purpose: convincing dimensional motion, not engineering-accurate geometry.

---

## 12. Stage 5 — 2.5D Depth Activation

Allowed effects:

- subtle background separation;
- slight virtual dolly;
- slight perspective shift;
- reflection movement;
- wheel/body parallax;
- controlled depth offset.

Recommended virtual camera limits:

```text
Yaw: ±5°
Pitch: ±2°
Dolly: subtle only
```

---

## 13. Stage 6 — CGI Transformation

The CGI stage is mandatory.

Objective:

**Real photograph → polished CGI-style vehicle**

The CGI stage should:

- simplify reflections;
- normalize paint;
- clean surface lighting;
- improve panel-edge clarity;
- maintain glazing;
- maintain lamps;
- preserve wheelbase;
- preserve exact body silhouette;
- remove photographic imperfections;
- establish studio-render quality.

It must not:

- change generation;
- redesign grille;
- replace headlamps;
- create different wheelbase;
- change door count;
- invent a different body kit;
- modify major visible geometry.

Required output:

```text
cgi/cgi-master.avif
cgi/cgi-transparent.webp
```

---

## 14. Stage 7 — Technical Shaded State

Transform CGI into a clean technical vehicle illustration using:

- neutral materials;
- reduced paint realism;
- controlled reflections;
- emphasized panel structure;
- semi-transparent glazing;
- restrained mechanical hints;
- unchanged camera.

Output:

```text
technical/technical-shaded.avif
```

---

## 15. Stage 8 — Line-Art State

Requirements:

- preserve outline;
- preserve lamps;
- preserve windows;
- preserve doors;
- preserve visible panel boundaries;
- remove unnecessary texture;
- avoid fake engineering details;
- avoid fake OEM numbering.

Preferred output:

```text
technical/line-art.svg
```

with PNG/AVIF fallback.

---

## 16. Stage 9 — Pre-Explosion State

Retain:

- assembled vehicle geometry;
- line-art or technical style;
- category grouping masks;
- explosion origin points.

Output:

```text
exploded/pre-explosion.avif
```

---

## 17. Visual Category Taxonomy

Initial categories:

```text
VC-ENG   Engine
VC-TRN   Transmission
VC-CLT   Clutch / Torque Converter
VC-DRV   Driveline / Axles
VC-COOL  Cooling
VC-FUEL  Fuel & Intake
VC-EXH   Exhaust
VC-FSUS  Front Suspension
VC-RSUS  Rear Suspension
VC-STR   Steering
VC-FBRK  Front Brakes
VC-RBRK  Rear Brakes
VC-WHL   Wheels & Hubs
VC-ELEC  Electrical / Electronics
VC-LGT   Lighting
VC-HVAC  HVAC
VC-INT   Interior
VC-BODY  Body & Exterior
VC-GLS   Glass
VC-DRS   Doors / Mirrors / Locks
VC-SVC   Service / Maintenance
```

---

## 18. Stage 10 — Exploded Navigation Generation

The exploded illustration is a **visual navigation device**, not an EPC diagram.

Each category gets:

- approximate spatial representation;
- explosion vector;
- bounding region;
- label anchor;
- z-depth;
- interaction priority.

---

## 19. Standard Explosion Grammar

```text
Body shell       → upward/back
Engine           → forward/up
Transmission     → rear/down
Driveline        → lower longitudinal axis
Cooling          → forward
Fuel/intake      → upper-front
Exhaust          → downward/rear
Front suspension → outward/front
Rear suspension  → outward/rear
Front brakes     → radial outward
Rear brakes      → radial outward
Steering         → forward-left
Interior         → upward
HVAC             → upper-centre
Doors/mirrors    → lateral outward
Glass            → upward/outward
Lighting         → front/rear outward
Electrical       → upper technical layer
```

Vehicle-specific overrides are allowed.

---

## 20. Stage 11 — Category Highlight States

Generate one highlight state per enabled category:

```text
exploded/highlights/VC-ENG.avif
exploded/highlights/VC-TRN.avif
...
```

Focused category behavior:

- selected group becomes dominant;
- other systems dim;
- label activates;
- CTA becomes available.

---

## 21. Stage 12 — Animation Generation

Default normalized timeline:

```text
0.00–0.12  HERO
0.12–0.24  DEPTH ACTIVATION
0.24–0.40  CGI TRANSFORMATION
0.40–0.54  TECHNICAL CONVERSION
0.54–0.64  LINE-ART STABILISATION
0.64–0.80  EXPLOSION
0.80–0.92  SETTLING
0.92–1.00  NAVIGATION ACTIVATION
```

These values must be configurable and versioned.

---

## 22. Motion Quality Rules

Avoid:

- body morphing;
- grille mutation;
- lamp mutation;
- spontaneous object creation;
- camera reset;
- incorrect wheel locations;
- text/logo mutation;
- frame flicker;
- background instability.

Use:

- controlled easing;
- slight stagger;
- mechanical inertia;
- depth-aware motion;
- deterministic end positions.

---

## 23. Stage 13 — Frame Extraction

Desktop output example:

```text
animation/desktop/frames/0001.avif
animation/desktop/frames/0002.avif
...
```

Manifest should track:

- fps;
- frame count;
- dimensions;
- segment ranges;
- poster;
- codecs/format.

---

## 24. Desktop Runtime Strategy

Recommended:

```text
Scroll progress
      ↓
normalized 0–1
      ↓
frame index
      ↓
canvas rendering
```

Interactive exploded state:

```text
canvas visual
+
DOM/SVG hotspot overlay
```

---

## 25. Mobile Runtime Strategy

Mobile should use:

- fewer frames;
- lower resolution;
- reduced memory footprint;
- shorter animation;
- touch navigation;
- category carousel/chips;
- static fallback.

---

## 26. Reduced Motion

Respect reduced-motion settings.

Fallback:

```text
Hero → short fade → Exploded navigation
```

or:

```text
Static hero + category grid
```

---

## 27. Stage 14 — Hotspot Generation

Hotspots use normalized coordinates 0–1.

Each hotspot maps to a `VisualCategory`, not directly to guessed part data.

---

## 28. Runtime EPC Mapping

The generator outputs stable visual category and visual component-family IDs. The
catalog is the sole authority for fitment, section, group, diagram and part truth.

The versioned EPC integration layer maps:

```text
FITMENT_ID + VISUAL_CATEGORY_ID [+ VISUAL_COMPONENT_FAMILY_ID]
```

to the exact:

- catalog section;
- assembly group;
- optional default diagram;
- fallback search query and minimum readiness level.

Routes are derived by the web application from structured IDs and slugs. Never
store an authored URL as catalog data. Internal diagram IDs must be globally
unique; source `node_id` values are provenance scoped by source, maker and
release, never primary keys.

The animation must never determine fitment truth.

---

## 29. Output Folder

```text
VF-<ID>/

  meta.json

  source/
    front-3q.*
    front.*
    side.*
    rear-3q.*
    rear.*

  analysis/
    identity-lock.json
    depth-map.*
    segmentation/
    landmarks.json

  hero/
    hero-clean.avif
    hero-transparent.webp

  cgi/
    cgi-master.avif
    cgi-transparent.webp

  technical/
    technical-shaded.avif
    line-art.svg

  exploded/
    pre-explosion.avif
    exploded-master.avif
    highlights/

  animation/
    desktop/
    mobile/

  navigation/
    hotspots.json
    category-labels.json

  legal/
    provenance.json
    licences.json

  qa/
    qa.json
    comparison-contact-sheet.jpg
```

---

## 30. Generator Components

Recommended modules:

```text
ingest
license_guard
image_normalizer
vehicle_segmenter
identity_lock
depth_estimator
cgi_generator
technical_generator
lineart_generator
explosion_planner
explosion_renderer
motion_interpolator
frame_encoder
hotspot_builder
qa_engine
packager
```

---

## 31. Orchestration

Stages must be resumable and track:

```text
PENDING
RUNNING
PASS
FAIL
SKIPPED
```

Each stage records:

- stage version;
- input hash;
- output hash;
- start/end time;
- logs;
- failure reason.

---

## 32. Idempotency

The same:

```text
source inputs
+
configuration
+
model versions
+
prompt versions
```

should yield the same deterministic job identity.

---

## 33. CLI

```bash
dial-visual validate <job>
dial-visual generate <job>
dial-visual generate <job> --from cgi
dial-visual qa <visual-family-id>
dial-visual package <visual-family-id>
dial-visual preview <visual-family-id>
```

---

## 34. API

Suggested API:

```text
POST /visual-jobs
GET  /visual-jobs/:id
POST /visual-jobs/:id/run
POST /visual-jobs/:id/retry
POST /visual-jobs/:id/approve
POST /visual-jobs/:id/reject
GET  /visual-families/:id
GET  /visual-families/:id/manifest
```

---

## 35. Human Approval Gates

Mandatory approvals:

1. source licensing;
2. vehicle identity;
3. CGI transformation;
4. technical/line-art output;
5. exploded navigation;
6. final animation;
7. runtime EPC mapping.

---

## 36. Automated QA

Automated checks include:

- image dimensions;
- alpha integrity;
- missing frames;
- bad hashes;
- inconsistent frame count;
- optical-flow discontinuity;
- silhouette drift;
- axle-position drift;
- hotspot validity;
- hotspot overlap;
- invalid licence metadata;
- missing required files.

---

## 37. Identity Drift Metrics

Measure:

```text
silhouette IoU
wheel centre displacement
roofline displacement
lamp landmark displacement
window landmark displacement
body bounding-box change
```

Fail QA if configured thresholds are exceeded.

---

## 38. Manual QA Contact Sheet

Generate:

```text
SOURCE | HERO | CGI | TECHNICAL | LINE | EXPLODED
```

in one reviewer contact sheet.

---

## 39. Web Asset Optimization

Generate at least:

### Desktop
- 1920-class master;
- AVIF/WebP sequence;
- poster.

### Tablet
- intermediate profile.

### Mobile
- approximately 720–1080 px class;
- lower frame count;
- optimized compression.

Profiles must be configurable.

---

## 40. CDN Behaviour

Use immutable hashed filenames.

Example:

```text
hero-clean.84c77d.avif
frame-0042.0a8e11.avif
```

---

## 41. Analytics

Track:

```text
vehicle_visual_loaded
animation_started
animation_completed
animation_skipped
category_focused
category_selected
epc_landing_opened
epc_diagram_opened
visual_load_failure
reduced_motion_used
```

---

## 42. Failure Strategy

```text
Full cinematic
↓ failure
Static exploded navigator
↓ failure
Hero + category grid
↓ failure
Text vehicle identity + normal EPC browsing
```

The EPC must always remain usable.

---

## 43. Security Requirements

- reject executable uploads;
- isolate workers;
- validate MIME types;
- enforce file-size limits;
- scan archives;
- never execute user-supplied scripts;
- use signed storage URLs;
- separate internal source assets from public derivatives;
- log approvals and overrides.

---

## 44. Versioning

Version:

```text
Visual family
Motion profile
Prompt profile
Generation model
Explosion grammar
Category taxonomy
Asset manifest
```

---

## 45. Generator MVP

Initial vertical slice:

**Toyota Hilux AN120/AN130 Double Cab facelift**

Must produce:

1. cleaned hero;
2. depth map;
3. CGI state;
4. technical state;
5. line-art state;
6. exploded master;
7. at least five clickable category highlights;
8. desktop frame sequence;
9. mobile frame sequence;
10. hotspot map;
11. sample EPC mapping;
12. QA contact sheet.

---

## 46. Pilot Categories

```text
Engine
Transmission
Brakes
Suspension
Body
```

---

## 47. Acceptance Criteria

### Visual
- vehicle remains recognisably the same generation/body;
- CGI transformation feels continuous;
- technical transition does not morph the car;
- exploded sequence feels dimensional;
- categories are understandable.

### Functional
- reverse scrolling works;
- mobile touch works;
- category hotspots work;
- FITMENT_ID controls EPC routing;
- skip animation works.

### Performance
- hero displays before the complete animation downloads;
- progressive preload works;
- static fallback works.

### Legal
- every source asset has provenance;
- every derivative is traceable.

---

## 48. Long-Term Premium Mode

For high-volume vehicles:

```text
Hero/reference set
       +
GLB/3D model
       ↓
camera matching
       ↓
photoreal render
       ↓
CGI state
       ↓
technical materials
       ↓
mesh-based explosion
       ↓
pre-rendered sequence
```

Runtime interface remains identical.

---

## 49. Final System Principle

Dial's visual navigation should behave as though:

> The customer's real vehicle comes alive, becomes a CGI object, reveals its technical structure, separates into understandable vehicle systems, and lets the customer enter the correct parts catalogue by touching the part of the car they recognise.

The visual system provides **recognition and navigation**.

The fitment/EPC system provides **technical truth**.

---

# Part II — Coding-Agent Build Prompt

## Role

You are the Principal Computer Vision Engineer, Generative Media Engineer, 3D/Graphics Engineer, Full-Stack Engineer and QA Architect responsible for implementing the **Dial Visual Transformation Generator (DVTG)**.

You are working on Dial a Spare.

Your task is to build a functioning production system that transforms an approved real-life vehicle hero/reference set into a cinematic vehicle-navigation asset pack.

Do not produce another architecture essay.

**Build the system.**

---

## Product Goal

After a customer completes Dial a Spare's vehicle cascade:

**Make → Model → Generation → Engine / Variant**

the selected vehicle must appear as a realistic vehicle image and transition through:

```text
REAL HERO
→ 2.5D DEPTH ACTIVATION
→ CGI VEHICLE
→ TECHNICAL SHADED VEHICLE
→ LINE-ART VEHICLE
→ PRE-EXPLOSION
→ EXPLODED CATEGORY NAVIGATOR
```

The final exploded car contains clickable visual spare-parts categories.

Selecting a category must route using the customer's exact `FITMENT_ID` into the correct EPC category landing page, after which normal EPC diagram/hotspot browsing resumes.

---

## Non-Negotiable Architecture

Implement two independent identities.

### `VISUAL_FAMILY_ID`

Determines:

- hero image;
- CGI transformation;
- technical state;
- line-art state;
- explosion choreography;
- hotspot geometry;
- visual animation assets.

### `FITMENT_ID`

Determines:

- exact engine;
- gearbox;
- drivetrain;
- production period;
- market;
- EPC categories;
- EPC diagrams;
- part numbers;
- compatibility.

Many `FITMENT_ID`s must be capable of sharing one `VISUAL_FAMILY_ID`.

Do not encode engine/transmission assumptions inside the generated art.

---

## Visual Reuse Rule

Use:

> Reuse the visual pack whenever the customer would reasonably say “that is my car.”

Split only for materially different:

- generation;
- body shell;
- body style;
- pickup cab type;
- visible wheelbase;
- major facelift;
- front/rear treatment.

Do not split only because of:

- engine;
- transmission;
- drivetrain;
- trim;
- emissions system;
- invisible production revision.

---

## Critical Visual Requirement

The CGI stage is mandatory.

Do not implement:

```text
photo → simple line-art fade
```

Implement:

```text
photo
→ photograph becomes spatial
→ vehicle begins to feel genuinely 3D
→ surfaces become polished CGI
→ CGI becomes technical render
→ technical render becomes line-art
→ assembled car mechanically separates
→ groups settle into interactive category positions
```

This should resemble premium automotive product storytelling rather than a slideshow.

---

## First Deliverable

Implement a working vertical slice for:

**Toyota Hilux AN120/AN130 Double Cab facelift**

Use only approved/licensed vehicle references supplied to the job.

Do not download random copyrighted vehicle images automatically.

If approved references do not exist, stop at source validation and request them.

---

## MVP Categories

Implement:

- `VC-ENG` — Engine
- `VC-TRN` — Transmission
- `VC-FBRK` / `VC-RBRK` — Brakes
- `VC-FSUS` / `VC-RSUS` — Suspension
- `VC-BODY` — Body & Exterior

Keep the category architecture extensible.

---

## Repository Structure

Create or adapt to a clean modular structure:

```text
/apps
  /api
  /review-ui
  /preview-player

/packages
  /contracts
  /pipeline-core
  /image-processing
  /identity-lock
  /depth
  /cgi
  /technical-render
  /line-art
  /explosion
  /animation
  /hotspots
  /qa
  /packaging

/workers
  /visual-generation-worker

/schemas
/examples
/tests
/docs
```

Reuse existing project infrastructure where appropriate.

---

## Required Processing Pipeline

Implement individually resumable stages:

```text
01_SOURCE_VALIDATE
02_NORMALIZE
03_IDENTITY_LOCK
04_SEGMENT
05_DEPTH_ESTIMATE
06_DEPTH_ACTIVATE
07_CGI_GENERATE
08_TECHNICAL_GENERATE
09_LINEART_GENERATE
10_EXPLOSION_PLAN
11_EXPLOSION_RENDER
12_ANIMATE
13_FRAME_ENCODE
14_HOTSPOTS
15_QA
16_PACKAGE
```

Each stage persists:

```text
PENDING
RUNNING
PASS
FAIL
SKIPPED
```

and records:

- stage version;
- input hash;
- config hash;
- output hash;
- start/end times;
- logs;
- failure reason.

---

## Job Contract

Implement a strongly typed `VisualGenerationJob`.

Minimum fields:

```json
{
  "visualFamilyId": "",
  "make": "",
  "model": "",
  "generation": "",
  "bodyStyle": "",
  "visualPhase": "",
  "yearFrom": null,
  "yearTo": null,
  "references": {
    "frontThreeQuarter": "",
    "front": "",
    "side": "",
    "rearThreeQuarter": "",
    "rear": ""
  },
  "enabledCategories": []
}
```

Validate using JSON Schema or equivalent.

---

## Source Licence Guard

Every source image must carry:

```text
source URL
author
licence
licence URL
attribution text
commercial-use approval flag
SHA-256
```

No processing may continue when:

```text
commercialUseApproved = false
```

unless an authorized override is logged.

---

## Identity Lock

Track at minimum:

- vehicle bounding box;
- silhouette;
- wheel centres;
- wheelbase ratio;
- roofline;
- lamp landmarks;
- glazing boundaries;
- major panel lines;
- door count;
- cab/bed boundaries.

Persist normalized landmarks.

All downstream keyframes must be compared against them.

---

## 2.5D Stage

Create:

- depth map;
- foreground mask;
- background mask;
- optional surface normals.

Allow controlled:

- parallax;
- very small yaw;
- small dolly;
- reflection/light shift.

Do not aggressively reveal surfaces that are not represented in the source imagery.

---

## CGI Stage

Create a pluggable CGI-generation interface.

Example:

```ts
interface CgiGenerator {
  generate(input: CgiGenerationInput): Promise<CgiGenerationResult>
}
```

Do not couple the system to one AI vendor or model.

The CGI result must maintain:

- silhouette;
- lights;
- grille;
- glazing;
- door count;
- wheelbase;
- body shape.

Persist:

```text
provider
model
model version
seed where available
prompt profile
request metadata
output hash
```

---

## Technical Render Stage

Create an abstraction like:

```ts
interface TechnicalRenderer {
  generate(...): Promise<...>
}
```

Output a visually simplified technical vehicle with the same camera.

---

## Line-Art Stage

Generate line-art suitable for:

- animation;
- scalable SVG where feasible.

Do not fabricate:

- OEM numbering;
- engineering measurements;
- exact hidden parts.

---

## Explosion Planner

Do not allow a generative model to randomly decide category destinations.

Represent each category with:

```ts
{
  visualCategoryId,
  origin,
  destination,
  explosionVector,
  depth,
  labelAnchor,
  order,
  easingProfile
}
```

Implement a deterministic global explosion grammar with per-vehicle overrides.

---

## Animation Timeline

Use a versioned motion profile:

```text
0.00–0.12 HERO
0.12–0.24 DEPTH
0.24–0.40 CGI
0.40–0.54 TECHNICAL
0.54–0.64 LINE ART
0.64–0.80 EXPLOSION
0.80–0.92 SETTLE
0.92–1.00 NAVIGATION ACTIVE
```

Do not hardcode these values throughout the application.

---

## Frame Delivery

Generate:

### Desktop
- master video;
- image sequence;
- manifest;
- poster.

### Mobile
- lower resolution;
- fewer frames;
- manifest;
- poster.

Use modern compressed formats where supported.

---

## Preview Player

Build a browser preview application that loads a generated visual pack.

It must support:

- scroll forward;
- scroll reverse;
- timeline slider;
- play/pause;
- category selection;
- hotspot visualization;
- reduced-motion mode;
- mobile viewport preview.

Render frame sequence to canvas.

Overlay hotspots with SVG or DOM.

---

## Category Focus

When a category is selected:

```text
Selected group increases emphasis
Other groups dim
Label activates
CTA appears
```

Selection must be usable without hover.

Support touch.

---

## EPC Mapping

Implement the versioned runtime contract defined by
`schemas/visual-epc-mapping.schema.json`:

```json
{
  "schemaVersion": "2.0.0",
  "mappingId": "VEM-TOYOTA-HILUX-AN130-ZA-2GD-6MT",
  "catalogReleaseId": "CAT-DEVELOPMENT-HILUX-V2",
  "fitmentId": "FIT-TOYOTA-HILUX-GUN125-ZA-2GD-6MT",
  "visualFamilyId": "VF-TOYOTA-HILUX-AN130-DC-FL",
  "vehicleContext": {
    "makerSlug": "toyota",
    "catalogFamilyId": "CF-TOYOTA-HILUX-AN120-AN130",
    "familySlug": "hilux-an120-an130",
    "variantId": "CV-TOYOTA-HILUX-GUN125-2GD-6MT-ZA",
    "variantSlug": "gun125-2gd-6mt-za",
    "chassisCodes": ["GUN125"],
    "engineCodes": ["2GD-FTV"],
    "market": "ZA",
    "attributes": { "body": "double-cab", "drive": "4x4" }
  },
  "categories": [
    {
      "visualCategoryId": "VC-ENG",
      "componentFamilyId": "VCF-ENGINE",
      "label": "Engine",
      "target": {
        "sectionSlug": "engine",
        "groupId": "GRP-HILUX-ENGINE-MECHANICAL",
        "groupSlug": "engine-mechanical",
        "defaultDiagramId": "DGM-HILUX-ENG-001",
        "fallbackQuery": "engine",
        "selectionMode": "GROUP",
        "minimumReadiness": "BROWSE_READY"
      }
    }
  ],
  "componentFamilies": [
    {
      "componentFamilyId": "VCF-BODY-FRONT-BUMPER",
      "visualCategoryId": "VC-BODY",
      "label": "Front bumper",
      "aliases": ["front bumper", "bumper cover", "bumper reinforcement"],
      "target": {
        "sectionSlug": "body-exterior",
        "groupId": "GRP-HILUX-BODY-BUMPERS",
        "groupSlug": "bumpers-exterior-trim",
        "defaultDiagramId": "DGM-HILUX-BODY-001",
        "fallbackQuery": "front bumper",
        "selectionMode": "GROUP",
        "minimumReadiness": "BROWSE_READY"
      }
    }
  ],
  "provenance": {
    "authority": "CATALOG",
    "source": "catalog-mapping-service",
    "sourceVersion": "2.0.0",
    "confidence": 1,
    "reviewedAt": null
  }
}
```

Do not derive EPC IDs from the image. The visual engine may identify a visual
component family; only the catalog mapping service may resolve it to a browse
target. If the requested readiness level is unavailable, preserve vehicle
context and fall back honestly to the nearest ready group or search result.

---

## Hotspot Schema

Use normalized coordinates.

Validate:

- polygon bounds;
- closure;
- self-intersection;
- excessive overlap.

---

## Output Structure

Generate:

```text
VF-ID/

meta.json
source/
analysis/
hero/
cgi/
technical/
exploded/
animation/
navigation/
legal/
qa/
```

with the detailed file structure defined in Part I.

---

## Automated QA

Calculate at minimum:

- silhouette IoU;
- wheel-centre movement;
- body bounding-box change;
- roofline movement;
- lamp landmark movement;
- glazing landmark movement.

Use configurable thresholds.

Do not silently accept failures.

---

## QA Contact Sheet

Generate:

```text
SOURCE
HERO
CGI
TECHNICAL
LINE ART
EXPLODED
```

in one contact sheet.

Mandatory.

---

## Human Approval Workflow

Support review status for:

1. licensing;
2. source identity;
3. CGI;
4. technical;
5. line-art;
6. exploded view;
7. final motion;
8. EPC mapping.

Store:

```text
reviewer
timestamp
status
notes
```

---

## Idempotency

Build a deterministic job hash from:

```text
input hashes
configuration
prompt profile
motion profile
generation provider/model versions
pipeline version
```

Do not rerun successful unchanged stages.

---

## CLI

Implement:

```bash
dial-visual validate path/to/job.json
dial-visual generate path/to/job.json
dial-visual generate path/to/job.json --from cgi
dial-visual qa VF-ID
dial-visual package VF-ID
dial-visual preview VF-ID
```

Include usable `--help`.

---

## API

Implement at minimum:

```text
POST /visual-jobs
GET /visual-jobs/:id
POST /visual-jobs/:id/run
POST /visual-jobs/:id/retry
POST /visual-jobs/:id/approve
POST /visual-jobs/:id/reject
GET /visual-families/:id
GET /visual-families/:id/manifest
```

Follow existing Dial backend conventions where equivalent infrastructure exists.

---

## Storage

Use deterministic object paths:

```text
visual-families/
  VF-TOYOTA-HILUX-AN130-DC-FL/
    v1/
```

Keep:

```text
working assets
approved assets
published assets
```

logically separate.

---

## Runtime Performance

Do not require the full animation to download before displaying the hero.

Implement:

1. lightweight poster/hero first;
2. progressive preload;
3. near-frame prefetch;
4. delayed highlight preload;
5. static fallback.

---

## Reduced Motion

Provide:

```text
Hero → Exploded static
```

or:

```text
Hero + category list
```

Navigation must remain complete.

---

## Failure Degradation

```text
Full cinematic
↓
Static exploded navigator
↓
Hero + category grid
↓
Text vehicle identity + standard EPC
```

Never block parts discovery because the visual system failed.

---

## Observability

Generation events:

```text
generation_job_created
stage_started
stage_passed
stage_failed
qa_failed
human_approved
visual_pack_published
```

Runtime analytics:

```text
vehicle_visual_loaded
animation_started
animation_completed
animation_skipped
category_focused
category_selected
epc_landing_opened
visual_load_failure
```

---

## Security

Implement:

- MIME validation;
- file-size limits;
- source hash validation;
- no executable uploaded content;
- isolated workers;
- signed storage access;
- immutable approval audit logs;
- strict request validation.

---

## Tests

Write:

### Unit tests
- contracts;
- hashing;
- manifests;
- hotspot geometry;
- motion profiles.

### Integration tests
- pipeline orchestration;
- resume/retry.

### Golden tests
- known visual-family manifests.

### UI tests
- scroll;
- reverse;
- touch;
- reduced motion;
- hotspot selection.

### Failure tests
- missing assets;
- invalid licence;
- invalid category map;
- malformed images;
- interrupted generation.

---

## First Vertical Slice

Complete:

**Toyota Hilux AN120/AN130 Double Cab facelift**

Produce:

- source validation;
- clean hero;
- depth map;
- CGI image;
- technical image;
- line-art;
- exploded master;
- Engine highlight;
- Transmission highlight;
- Brakes highlight;
- Suspension highlight;
- Body highlight;
- ≤120-frame desktop demo;
- optimized mobile demo;
- working canvas scrubber;
- clickable hotspots;
- sample FITMENT_ID routing;
- QA contact sheet.

---

## Visual Acceptance Test

A reviewer must be able to say:

> “That starts as a real Hilux, turns into the same Hilux as a CGI vehicle, becomes a technical illustration, then convincingly separates into vehicle systems.”

If the reviewer instead says:

> “The car changes shape halfway through.”

the generation fails.

---

## Implementation Behaviour

While building:

- inspect the existing Dial architecture first;
- reuse existing infrastructure where appropriate;
- do not duplicate auth/storage/logging unnecessarily;
- preserve existing product decisions;
- do not rewrite unrelated Dial systems;
- keep generation providers swappable;
- version prompts and motion profiles;
- write migrations carefully;
- include tests;
- document actual decisions in-repo.

Do not fake completed generation.

If external generative-provider credentials are absent, implement the adapter and a deterministic mock/test provider, and mark live generation as requiring credentials.

---

## Definition of Done

The work is complete only when a developer can run:

```bash
dial-visual generate examples/hilux-an130/job.json
```

inspect the resulting visual-family folder, then run:

```bash
dial-visual preview VF-TOYOTA-HILUX-AN130-DC-FL
```

and interactively scrub from the real hero through the CGI transformation into the exploded category navigator.

Selecting an exploded category must demonstrate routing through:

```text
FITMENT_ID + VisualCategory
```

rather than through assumptions embedded in the animation.

The result must be a functioning vertical slice, not merely generated documentation.
