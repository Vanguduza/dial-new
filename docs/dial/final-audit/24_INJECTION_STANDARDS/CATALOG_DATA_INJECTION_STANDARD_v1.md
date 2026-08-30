# Catalogue Data Injection Standard — v1

**Audience:** the agent producing the DIAL catalogue.
**Status:** binding on injection. The catalogue is produced outside this repository and injected when complete; this is the contract it is accepted against.
**Executable form:** `validateCatalogueInjection` in `packages/catalog-coverage/src/injection.ts`, proven by `tests/injection-conformance.test.ts`. **Run it before you hand the bundle over.** The rules below and the rule IDs it emits are the same thing.

---

## 0. The shape of the agreement

This repository does not audit your catalogue. It states what it will accept and checks a bundle at the moment of injection. That means two things for you.

You do not need this repository to make progress — nothing here gates your pipeline day to day. And a bundle that fails conformance does not enter, however finished it looks, because the failures this standard covers are the ones that are expensive or impossible to unwind afterwards.

Two principles run through every rule:

**Absent evidence is a refusal, never a default.** A missing count is not zero and not "probably fine". The most expensive failures in this project have been checks that passed for want of data — a QA gate structurally incapable of failing, a metric that was distinct by construction, a contrast test that could not measure contrast. If you cannot measure something, say so; do not omit it.

**A negative check is not proof of a positive.** "No collisions were found" does not mean "identity was established". A single-maker catalogue collides with nothing. This distinction has its own rule below because it is the one most likely to be missed.

---

## 1. Diagram identity — the rule that blocks everything else

### 1.1 What is wrong today

`diagram_placements.node_id` is the identifier the source EPC gave a diagram. It is unique inside one maker's catalogue and nowhere else: **44,532** node_id values currently appear under more than one `maker_slug`.

This is not a routing inconvenience. A position hotspot joins to its diagram through that id, so a collision attaches one vehicle's part positions to another vehicle's picture. A customer clicks the alternator on a Hilux and gets a Navara's part. That is why `DIAGRAM_READY` and `HOTSPOT_READY` are blocked, and why nothing downstream can be trusted until it is fixed.

### 1.2 The identity

Every diagram carries a stable DIAL id, derived — not allocated — from its source scope:

```ts
import { dgmIdFor } from '@dial/catalog-coverage';

const dgmId = dgmIdFor({
  sourceSystem: '7zap',
  makerSlug:    'toyota',
  modelSlug:    'hilux-an110-an120-an130',
  variantSlug:  '2gd-6mt-4x4-double-cab',  // null where the source has no variant split
  sectionSlug:  'engine',
  nodeId:       '10401',                    // the source id that is not globally unique
});
// DGM-<26 Crockford base32 characters>
```

**Derived, not allocated**, for a specific reason: a sequential registry would need an allocator whose state survives alongside the data, and re-importing would either renumber every diagram or depend on insertion order. Yours is a pipeline that will re-run. Derivation makes re-import idempotent — same scope, same id, on any machine, in any order, with nothing to carry.

**Every scope component is load-bearing.** Omit `sectionSlug` and two diagrams in different sections collapse into one id. The encoding is length-prefixed, so a delimiter inside a value cannot forge a different scope, and an empty required component is refused rather than defaulted — an empty component silently widens the scope, which is how two diagrams become one id.

**Verify, never assume.** `planDiagramIdentityMigration` proves the ids are injective over your actual input and refuses the plan if two distinct scopes ever meet. 130 bits will not collide at catalogue scale, but "will not" is not "cannot", and a silent collision would merge two makers' diagrams — the original defect in a new costume.

```ts
const plan = planDiagramIdentityMigration(scopes);
assertMigrationApplicable(plan);   // throws rather than merging
```

### 1.3 What the id may not be

- **Not the source node_id, and it may not contain it.** Public diagram URLs use the DGM id; §6.3 of the Blueprint and the §5.4 coordinate probes require that no raw source identifier is exposed.
- **Not hand-authored.** `DGM-HILUX-ENG-001` and its siblings in the development fixture are placeholders and fail `isProductionDgmId`. The pilot flow pack already records that production is blocked on "corrected catalog identities"; this is what makes that statement testable.

### 1.4 The rules

| Rule | Refuses |
|---|---|
| `CAT-INJ-011` | any cross-maker `node_id` collision remaining |
| `CAT-INJ-012` | any diagram without a stable DGM id — **including when collisions are zero** |
| `CAT-INJ-013` | no sample ids supplied to check the format against |
| `CAT-INJ-014` | a sample id that is not a derived production id |

`CAT-INJ-012` is the one to read twice. Zero collisions and zero minted ids is a refusal, not a pass.

---

## 2. Release identity

| Rule | Requires |
|---|---|
| `CAT-INJ-001` | `bundleId` |
| `CAT-INJ-002` | `sourceSystem` |
| `CAT-INJ-003` | `catalogReleaseId` |
| `CAT-INJ-004` | `producedAt`, valid ISO-8601 |

A saved vehicle is revalidated against the catalogue release it was resolved on: on supersession an unambiguous match is retained and an ambiguous one requires customer confirmation, and no saved vehicle is ever silently reattached to a different maker, family or chassis. That machinery needs a release identity and a time. A release with no time has no before and after.

---

## 3. The counts the readiness gate consumes

Supply these as counts. The eleven-stage gate derives readiness from them and will not infer any of them.

| Rule | Field | Requires |
|---|---|---|
| `CAT-INJ-020` | `fitment` | every variant carries a resolved chassis, engine and market identity |
| `CAT-INJ-021` | `hotspots` | every diagram carries position hotspots |
| `CAT-INJ-022` | `images` | every diagram carries a verified image |

Partial is a refusal, not a proportion. A partially resolved variant is not selectable, so shipping it half-resolved gains nothing — exclude it from the bundle instead and the rest of the catalogue proceeds.

A diagram with no image cannot carry a hit region, which makes it unreachable in the visual journey however complete its part data.

---

## 4. Rights and provenance

| Rule | Requires |
|---|---|
| `CAT-INJ-030` | at least one recorded source |
| `CAT-INJ-031` | every source with a cleared rights position |
| `CAT-INJ-032` | every source naming its licence |

**ACT-REG-011 — EPC/catalogue/image rights and provenance — is an open activation blocker.** Content whose rights are unknown cannot be published, and rights are the constraint that outranks quality.

This does not block your build. It blocks publication, and it is far cheaper to discover at injection than after the data is in — imagery in particular is close to irreversible once it enters version history. The precedent to follow is `examples/hilux-an130/source/licensed/`, which names the licence in every filename (`toyota-hilux-2021-cc-by-2.0.jpg`, `candidate-public-domain.jpg`) and carries a `provenance.json`.

---

## 5. Schema the application reads

The coverage builder queries these. Names and relationships are the interface:

```text
catalog_meta(key, value)
makers(slug, name, source)
models(maker_slug, slug, display_name, source)
variants(maker_slug, model_slug, slug, chassis_code, name)
sections(maker_slug, model_slug)
diagrams(maker_slug, model_slug, image_path, thumbnail_url, dgm_id)
diagram_parts(maker_slug, model_slug)
diagram_placements(node_id, maker_slug)
```

`diagrams.dgm_id` is the addition this standard requires. Keep `node_id` — it is the provenance link back to the source, and dropping it would make the migration unauditable. It simply stops being a key.

---

## 6. What is explicitly not asked of you

- No readiness judgement. You publish counts; the gate decides.
- No customer-visibility decision. `customerVisible` is derived here, and no model may be visible while its evaluation is not customer-ready.
- No transition or flow-pack content. That is the Transition Flow Pack Standard.
- No conformance to the development fixture. `examples/hilux-an130` and the Hilux flow pack are development material used to tune the process; they are not a template your data must match.

---

## 7. Handover

```bash
node -e "import('@dial/catalog-coverage').then(m => {
  const result = m.validateCatalogueInjection(require('./bundle-manifest.json'));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.conformant ? 0 : 1);
})"
```

Every finding names the rule, what was observed and what to do. A refusal that does not say what to do next is a wall rather than a gate, and the tests assert that every finding carries a remedy.
