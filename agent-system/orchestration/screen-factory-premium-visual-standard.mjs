export const PREMIUM_VISUAL_STANDARD_VERSION = 'DIAL_HEALTH_PREMIUM_SCREEN_QUALITY_REV3';

export const PREMIUM_VISUAL_PROMPT = `
DIAL HEALTH PREMIUM SCREEN BENCHMARK — REV 3
Target quality: a polished, App-Store-ready consumer healthcare product, not a wireframe, admin dashboard, generated template, or long document.

VISUAL CHARACTER
- Deep navy establishes trust and hierarchy; Dial teal/aqua creates energy and action; white and soft cool neutrals create breathing room.
- The screen must feel calm, warm, modern, clinical without feeling institutional, and deliberate rather than crowded.
- Prefer one strong visual focal point per screen. Use supporting hierarchy, not a wall of equal-weight cards.
- Use restrained gradients only for hero or priority cards. Avoid random gradients, neon effects, glassmorphism, excessive borders, or generic AI-dashboard styling.

COMPOSITION
- Design for the actual target viewport first. A normal mobile screen should feel complete in one viewport or require only modest scrolling.
- Top-level consumer screens should aim for <= 1.20 viewport heights; focused detail/forms should normally stay <= 1.60. Never solve density by creating a 3–5 viewport page.
- Use 16–20 px outer gutters, an 8 px spacing grid, 12–16 px intra-card spacing, 20–28 px section spacing, and consistent alignment.
- In the first third of the screen establish identity/context and the principal task. In the middle show the 1–3 most useful modules. Keep secondary content collapsed, linked, or in a focused detail route.
- Bottom navigation, when appropriate to the platform contract, is compact, stable and visually quieter than the content.
`;
export const PREMIUM_VISUAL_PROMPT_CONTINUED = `
TYPOGRAPHY
- Hero/title: 28–36 px mobile, 700–850 weight, tight line-height, deep navy. Section headings: 17–22 px. Body: 14–16 px. Metadata: 11–13 px.
- Use sentence case, short labels and concise copy. Avoid dense paragraphs, tiny captions, all-caps body copy or multiple competing headline sizes.
- Strong hierarchy is mandatory: the user should understand the page purpose and next action within two seconds.

COMPONENT FINISH
- Cards: 14–20 px radius, subtle cool border or very soft shadow, never heavy floating tiles everywhere.
- Primary buttons: 48–52 px height, 12–14 px radius, strong teal or navy/teal treatment, concise verb-led label.
- Inputs/search: 46–52 px height, soft neutral surface, clear focus/error states, no browser-default appearance.
- Iconography: coherent 1.8–2.2 px line icons, navy/teal, usually on 36–44 px soft-mint circles or simple containers. Never use emoji as UI icons.
- Status chips: compact, rounded, semantic, low-saturation; they support content rather than dominate it.
- Lists: use clear row grouping, human-readable spacing and one obvious row action. Avoid spreadsheet/table density on consumer screens.

REFERENCE-DERIVED SCREEN GRAMMAR
- Home/Today: warm greeting/context, strong hero or health-focused visual area, 3–4 quick actions maximum, one highlighted upcoming item, one recent item, then secondary actions.
- Search/provider lists: compact top bar, search/filter, tabs if justified, 3–5 rich result rows visible, avatar/photo slot, specialty/location metadata, one clear action per result.
- Appointment/list screens: status tabs, one highlighted next appointment, concise next items, reschedule/cancel only where contract allows.
- Records/results: summary first, 2–4 meaningful metrics or recent items, “view all”/detail routing instead of dumping the complete record.
- Medications: medication identity, dose/schedule, status and next-dose/reminder in compact cards; safety copy is supportive and visually secondary.
- Messages/profile/settings: strong information grouping, calm rows, clear hierarchy, no empty administrative chrome.
`;
export const PREMIUM_VISUAL_PROMPT_FINAL = `
BRAND TOKENS
- Ink/navy #082C5C; deep navy #052548; Dial teal #0FA7A0; teal-deep #087F79; aqua #31C7C0; mint #DFF7F4.
- Background #F5F9FC; surface #FFFFFF; soft surface #EEF5F8; border #DCE6EC; muted text #647789; positive #15966A; warning #C88925; critical #C94A4A.
- Use no more than one dominant accent plus restrained semantic status colours in a normal view.

CONTENT DISCIPLINE
- Never invent real-looking patient/provider names, dates, diagnoses, prices, claim states, lab values or entitlements. Use generic data-bound labels and neutral placeholders.
- Do not expose every documented feature simultaneously. Preserve full functionality through routes, disclosure, tabs, sheets and focused detail screens.
- Top-level My Health views should normally expose no more than 10–12 visible interactive targets and no more than 5 major content regions.
- Prefer 3–5 high-quality items over 8–12 repetitive cards. “View all” is better than a long first-load page.

PLATFORM POLISH
- Respect iOS/Android safe areas, status-bar spacing and native-feeling navigation rhythm without drawing fake hardware bezels into production UI evidence.
- iOS may use slightly lighter surfaces and compact tab bars; Android may use Material-like motion/shape rhythm, but both must remain recognisably Dial Health.
- Touch targets >=44 px, accessible contrast, obvious selected states, and readable text are non-negotiable.

ANTI-PATTERNS — FAIL THE DRAFT IF PRESENT
- 3+ viewport consumer pages, dashboard/table density, dozens of equal cards, giant empty headers, browser-default controls, emoji icons, random colour palettes, generic bootstrap/admin templates, excessive borders, fake charts, invented health values, duplicate actions, cramped 10–12 px body text, or decorative controls without software behaviour.
- Do not make every screen visually identical. Preserve the same design language while choosing the composition that best suits the task.
- Do not reproduce reference labels or legacy screen IDs when they conflict with the current canonical contract. Reference imagery defines quality and visual grammar, not product truth.
`;

export const PREMIUM_VISUAL_TRAINING_PROMPT = `${PREMIUM_VISUAL_PROMPT}\n${PREMIUM_VISUAL_PROMPT_CONTINUED}\n${PREMIUM_VISUAL_PROMPT_FINAL}`;
export const PREMIUM_ART_DIRECTOR_RUBRIC = Object.freeze({
  visual_hierarchy: 12,
  brand_coherence: 10,
  composition_and_spacing: 10,
  consumer_density_control: 10,
  component_polish: 10,
  task_clarity: 10,
  progressive_disclosure: 8,
  platform_native_feel: 8,
  accessibility: 7,
  functional_truthfulness: 7,
  visual_variety_without_drift: 4,
  implementation_cleanliness: 4,
});

export const PREMIUM_ART_DIRECTOR_PASS_SCORE = 90;

export const PREMIUM_COMPONENT_CSS = `
:root{--dh-ink:#082c5c;--dh-navy:#052548;--dh-teal:#0fa7a0;--dh-teal-deep:#087f79;--dh-aqua:#31c7c0;--dh-mint:#dff7f4;--dh-bg:#f5f9fc;--dh-surface:#fff;--dh-soft:#eef5f8;--dh-border:#dce6ec;--dh-muted:#647789;--dh-positive:#15966a;--dh-warning:#c88925;--dh-critical:#c94a4a}
.dh-screen{min-height:100vh;background:linear-gradient(180deg,#fff 0%,var(--dh-bg) 100%);color:var(--dh-ink);padding:0 18px 18px}
.dh-safe-top{height:18px}.dh-appbar{min-height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px}.dh-appbar h1{font-size:20px;line-height:1.2;margin:0;font-weight:800;color:var(--dh-ink)}
.dh-hero{border-radius:20px;padding:20px;background:linear-gradient(135deg,var(--dh-navy),#0d5f7c 64%,var(--dh-teal));color:#fff;overflow:hidden;box-shadow:0 14px 32px rgba(5,37,72,.14)}
.dh-hero h1,.dh-hero h2{margin:0;color:#fff;letter-spacing:-.025em}.dh-hero p{margin:8px 0 0;color:rgba(255,255,255,.82);line-height:1.45}
.dh-section{margin-top:22px}.dh-section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.dh-section-title{font-size:18px;font-weight:800;letter-spacing:-.015em}
.dh-card{background:var(--dh-surface);border:1px solid rgba(220,230,236,.92);border-radius:18px;box-shadow:0 7px 24px rgba(8,44,92,.065)}
.dh-card-soft{background:linear-gradient(135deg,#f4fbfb,#eef7fa);border:1px solid #d9eceb;border-radius:18px}
`;
export const PREMIUM_COMPONENT_CSS_CONTINUED = `
.dh-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.dh-action-card{min-height:112px;padding:14px;border-radius:16px;background:#fff;border:1px solid var(--dh-border);box-shadow:0 5px 18px rgba(8,44,92,.055);display:flex;flex-direction:column;gap:7px;align-items:flex-start;justify-content:center;text-align:left}
.dh-icon{width:42px;height:42px;display:inline-grid;place-items:center;border-radius:50%;background:var(--dh-mint);color:var(--dh-ink);flex:0 0 auto}.dh-icon svg{width:22px;height:22px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.dh-primary{min-height:50px;border:0;border-radius:13px;background:linear-gradient(135deg,var(--dh-teal),var(--dh-teal-deep));color:#fff;font-weight:800;padding:0 18px;box-shadow:0 8px 18px rgba(15,167,160,.18)}
.dh-secondary{min-height:48px;border:1px solid #b9d6d8;border-radius:13px;background:#fff;color:var(--dh-ink);font-weight:750;padding:0 16px}.dh-danger{color:var(--dh-critical);border-color:#efc7c7;background:#fff}
.dh-search{height:48px;border:1px solid var(--dh-border);background:#f8fbfc;border-radius:14px;padding:0 14px;color:var(--dh-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.75)}
.dh-segmented{display:flex;padding:4px;border-radius:12px;background:#edf3f6;gap:4px}.dh-segmented [role=tab]{flex:1;border:0;border-radius:9px;background:transparent;color:var(--dh-muted);font-weight:750}.dh-segmented [aria-selected=true]{background:#fff;color:var(--dh-ink);box-shadow:0 2px 8px rgba(8,44,92,.08)}
.dh-list{display:grid;gap:10px}.dh-list-row{min-height:78px;padding:12px 13px;border-radius:16px;background:#fff;border:1px solid var(--dh-border);box-shadow:0 4px 15px rgba(8,44,92,.045);display:flex;align-items:center;gap:12px}.dh-list-main{min-width:0;flex:1}.dh-list-title{font-size:15px;font-weight:800;color:var(--dh-ink)}.dh-list-meta{font-size:12px;color:var(--dh-muted);margin-top:3px;line-height:1.35}
.dh-chip{display:inline-flex;align-items:center;min-height:26px;padding:4px 9px;border-radius:999px;background:#e5f6f1;color:#13735d;font-size:11px;font-weight:800}.dh-chip.warn{background:#fff4df;color:#946417}.dh-chip.critical{background:#fdecec;color:#a53535}
.dh-bottom-nav{margin:22px -18px -18px;padding:10px 12px 12px;background:rgba(255,255,255,.96);border-top:1px solid var(--dh-border);display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.dh-bottom-nav a,.dh-bottom-nav button{border:0;background:transparent;color:#738291;display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center;font-size:11px;font-weight:700;padding:4px}.dh-bottom-nav .active{color:var(--dh-teal-deep)}
`;
export const PREMIUM_COMPONENT_CSS_ALL = `${PREMIUM_COMPONENT_CSS}\n${PREMIUM_COMPONENT_CSS_CONTINUED}`;
