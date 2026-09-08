# GMPC-F080 — SEO & Programmatic Discovery Acceptance Contract

**Status:** Canonical planning/acceptance authority. Implementation remains `SPECIFIED` until code, tests and evidence satisfy this contract.

| | |
|---|---|
| Feature | `GMPC-F080` |
| Aggregate | `SearchIndexingLandingPageIntelligence` |
| Surfaces | `GMPC-P080`, `GMPC-P081`, plus governed outputs on eligible public DIAL routes |
| Security tier | S2 for public-management/control surfaces; public outputs expose only approved public truth |
| Governing canon | `27_GROWTH_MARKETING_PROMOTIONS/DIAL_GROWTH_MARKETING_PROMOTIONS_CONTROL_CENTRE_REV2.md` §22 |
| Target quality | Production SEO architecture >= 8/10 only when every mandatory gate below is evidenced |

## Mission

Turn real DIAL vehicle, fitment, EPC, product, offer, service, provider, grocery, Care, B2B/logistics, location and governed content truth into useful search discovery without creating doorway pages, duplicate index inventory, stale commercial claims or privacy leakage.

## P0 requirements

1. **Deterministic indexability.** Every eligible public route resolves a versioned `IndexabilityDecision` with index state, canonical target, crawl directive, reason codes, policy version, freshness/value inputs and evaluation time. AI cannot mutate this decision directly.
2. **Index inventory allowlist.** Route templates are deny-by-default for indexing. Internal search, arbitrary facets, sort/tracking/session/experiment URLs and private/account/transactional/Health-sensitive routes are excluded unless a deliberate canonical landing-page contract says otherwise.
3. **Search Landing Page Factory.** Programmatic candidates are materialised only from canonical DIAL entities and pass `SeoQualityAssessment` for unique authoritative user value, freshness, duplication and factual coverage. Keyword substitution alone is a hard fail.
4. **Crawler-readable experience.** Primary content, H1/semantic structure and navigation are server/static rendered and crawlable without completing a cinematic transition or client event.
5. **Canonical lifecycle.** Equivalent URLs collapse to one stable canonical. Redirect only to a true equivalent. Permanent removal without an equivalent returns 410 after policy evaluation. Temporary unavailability preserves an accurate useful entity page when the entity remains valid.
6. **Facet governance.** High-value make/model/component/location combinations may be explicitly promoted; all other combinatorial facets remain non-index inventory. Pagination has stable URLs and self-canonical behaviour unless genuinely equivalent.
7. **Structured data.** Applicable `Product`, `Offer`/`AggregateOffer`, `BreadcrumbList`, `ItemList`, `Organization`, `LocalBusiness`, `Service` and eligible review semantics are generated from the same visible canonical facts. No fake ratings or hidden/stale claims.
8. **Sitemap index.** Sitemap shards are generated from `INDEX` decisions, partitioned by entity/route family, stay within protocol limits, carry evidence-backed modification times and automatically remove redirect/NOINDEX/GONE/private routes.
9. **Merchant/search-shopping feeds.** Where supported, feeds are generated from canonical catalogue, pricing, inventory, seller, shipping and returns truth; feed item and landing page must reconcile before publish. Rejections/disapprovals are observable in P080.
10. **Performance.** Every indexable template has a route-level mobile performance budget and passes realistic-network Core Web Vitals verification. Rich visuals remain progressive enhancement.
11. **Content authority.** Technical/fitment claims trace to canonical EPC/fitment evidence; commercial claims trace to price/inventory/provider/fulfilment truth; material editorial expertise retains provenance/review metadata.
12. **Anti-doorway/AI safety.** AI may detect demand, recommend candidates and draft bounded content. It may not invent inventory, fitment, price, location, coverage, reviews, expertise or automatically bypass quality/indexability gates.
13. **Observability.** Query, index, canonical, robots, sitemap, structured-data, feed, crawl and performance failures are surfaced with freshness and provider state. Stale data never appears as current/zero-success.
14. **Business-loop measurement.** Search performance joins to conversion/fitment-confirmation/booking/order, fulfilment, revenue and contribution where legally/technically possible. Ranking and traffic alone are not success.
15. **Privacy boundary.** No private customer, employee, technician-private, supplier-private, account/payment/order/case or sensitive Health data enters public pages, feeds, structured data, sitemaps or search tooling.

## Mandatory acceptance scenarios

1. An allowlisted canonical product/vehicle/service page is `INDEX`, appears in the correct sitemap shard and exposes matching structured data.
2. A sort/tracking variant resolves to the canonical entity and does not become separate sitemap/index inventory.
3. An arbitrary multi-facet URL cannot self-promote to `INDEX`.
4. A high-demand candidate with insufficient unique authoritative data is rejected despite positive keyword volume.
5. Two equivalent entity URLs cannot both remain canonical.
6. An internal search-result URL is excluded until deliberately promoted into a curated landing page with a new stable canonical identity.
7. A price/availability mismatch blocks or degrades structured data/feed publication rather than publishing conflicting truth.
8. A permanently removed entity without equivalent returns the governed gone state and disappears from sitemaps.
9. A temporarily unavailable valid product remains truthful and can expose alternatives without pretending stock exists.
10. A crawler can reach make/model -> category/system -> product/service/EPC child links without executing client-only transitions.
11. Structured-data validation catches invalid/mismatched price, currency, availability, seller, review or canonical values.
12. Sitemap generation excludes NOINDEX/private/redirect/GONE URLs under automated tests.
13. Merchant-feed reconciliation catches product identity, price, availability, URL and seller mismatches.
14. Core Web Vitals gate runs against representative mid-tier mobile/network profiles for every indexable template family.
15. A generated page differing only by keyword/location token and lacking real local/entity value is rejected as doorway/duplicate.
16. An AI/agent attempt to directly set `INDEX`, fabricate a review or invent coverage is denied and audited.
17. Search telemetry can attribute an organic session through qualified conversion and fulfilment/contribution without exposing private data back to public search connectors.
18. Search-provider outage/stale connector state is visible and does not erase last-known evidence or manufacture zero values.

## Required implementation evidence

- indexability-policy unit/property tests including facet explosion and canonical collision cases;
- public-route integration tests for status, canonical, robots/meta and crawlable links;
- structured-data validation fixtures per eligible entity template;
- sitemap generation and removal tests;
- merchant-feed reconciliation tests where enabled;
- mobile Core Web Vitals/performance evidence;
- privacy/authorization negative tests proving private routes/data cannot leak;
- Hermes/AI policy test proving recommendation is advisory to deterministic publish/indexability gates;
- observability screenshots/records for index/schema/sitemap/feed failures;
- end-to-end organic attribution evidence through at least conversion and fulfilment/contribution when the downstream domain is active.

No feature gate may claim `DOMAIN_TESTED`, `INTEGRATION_PROVEN` or higher using only metadata tags, a sitemap file or Search Console connectivity.
