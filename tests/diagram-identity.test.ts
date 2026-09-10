import { describe, expect, it } from 'vitest';
import {
  assertMigrationApplicable,
  canonicalScopeKey,
  dgmIdFor,
  isProductionDgmId,
  planDiagramIdentityMigration,
  type SourceDiagramScope,
} from '../packages/catalog-coverage/src/diagram-identity.js';

/**
 * The DGM migration — SPARE-F004 / CATVIS-S006.
 *
 * 44,532 source `node_id` values appear under more than one maker, so a lookup
 * keyed on node_id can return another maker's diagram. Because a hotspot joins
 * to its diagram through that id, a collision does not merely mis-route a
 * click: it attaches one vehicle's part positions to another vehicle's picture.
 *
 * The catalogue itself is produced by a separate pipeline and injected when
 * ready, so these exercise the transformation rather than a database.
 */

const scope = (over: Partial<SourceDiagramScope> = {}): SourceDiagramScope => ({
  sourceSystem: '7zap',
  makerSlug: 'toyota',
  modelSlug: 'hilux-an110-an120-an130',
  variantSlug: '2gd-6mt-4x4-double-cab',
  sectionSlug: 'engine',
  nodeId: '10401',
  ...over,
});

describe('stable diagram identity', () => {
  it('separates the same source node id under different makers', () => {
    // The actual defect: 7zap hands Toyota and Nissan the same node id.
    const toyota = scope({ makerSlug: 'toyota' });
    const nissan = scope({ makerSlug: 'nissan', modelSlug: 'navara-d40' });

    expect(toyota.nodeId).toBe(nissan.nodeId);
    expect(dgmIdFor(toyota)).not.toBe(dgmIdFor(nissan));
  });

  it('is deterministic across calls, so re-import is idempotent', () => {
    // No allocator and no ordering dependency: the catalogue can be rebuilt
    // from source any number of times and every diagram keeps its id.
    const first = dgmIdFor(scope());
    const second = dgmIdFor({ ...scope() });
    expect(first).toBe(second);
    expect(first).toBe(dgmIdFor(scope()));
  });

  it('changes when any scope component changes', () => {
    const base = dgmIdFor(scope());
    const variations: Array<Partial<SourceDiagramScope>> = [
      { sourceSystem: 'other' },
      { makerSlug: 'nissan' },
      { modelSlug: 'other-model' },
      { variantSlug: 'other-variant' },
      { sectionSlug: 'transmission' },
      { nodeId: '10402' },
    ];
    for (const over of variations) {
      expect(dgmIdFor(scope(over)), JSON.stringify(over)).not.toBe(base);
    }
  });

  it('distinguishes a null variant from an empty one', () => {
    expect(dgmIdFor(scope({ variantSlug: null }))).toBe(dgmIdFor(scope({ variantSlug: '' })));
    expect(dgmIdFor(scope({ variantSlug: null }))).not.toBe(dgmIdFor(scope()));
  });

  it('cannot be forged by a delimiter inside a component', () => {
    // A naive `maker:model:section:node` key would let these two collapse into
    // one id — the same ambiguous-scope defect the migration exists to remove,
    // reintroduced by the encoding. Length prefixing makes it impossible.
    const a = scope({ makerSlug: 'toyota|4:x', modelSlug: 'hilux' });
    const b = scope({ makerSlug: 'toyota', modelSlug: '4:x|hilux' });
    expect(canonicalScopeKey(a)).not.toBe(canonicalScopeKey(b));
    expect(dgmIdFor(a)).not.toBe(dgmIdFor(b));
  });

  it('refuses a scope with an empty required component', () => {
    // An empty component silently widens the scope, which is how two diagrams
    // become one id. Refuse rather than default.
    for (const over of [
      { sourceSystem: '' },
      { makerSlug: '' },
      { modelSlug: '' },
      { sectionSlug: '' },
      { nodeId: '' },
    ] as Array<Partial<SourceDiagramScope>>) {
      expect(() => dgmIdFor(scope(over)), JSON.stringify(over)).toThrow(/may not be empty/);
    }
    // variantSlug is the one component allowed to be blank.
    expect(() => dgmIdFor(scope({ variantSlug: null }))).not.toThrow();
  });

  it('produces an opaque id that leaks no source node id', () => {
    // Blueprint §6.3 and the §5.4 coordinate probes require public URLs to
    // carry no raw source identifier.
    const id = dgmIdFor(scope({ nodeId: '10401' }));
    expect(id).toMatch(/^DGM-/);
    expect(id).not.toContain('10401');
    expect(id).not.toContain('toyota');
    expect(isProductionDgmId(id)).toBe(true);
  });

  it('uses an alphabet with no ambiguous characters', () => {
    // Crockford base32: an id that is read aloud or retyped cannot become a
    // different, valid id through I/1, O/0 or L confusion.
    for (let i = 0; i < 200; i++) {
      const id = dgmIdFor(scope({ nodeId: `node-${i}` }));
      expect(id.slice(4)).not.toMatch(/[ILOU]/);
      expect(isProductionDgmId(id)).toBe(true);
    }
  });

  it('rejects the hand-authored development ids as non-production', () => {
    // The pilot flow pack already records that production is blocked on
    // "corrected catalog identities"; this is what makes that testable.
    for (const legacy of ['DGM-HILUX-ENG-001', 'DGM-HILUX-TRN-001', 'DGM-HILUX-CHS-002']) {
      expect(isProductionDgmId(legacy)).toBe(false);
    }
  });
});

describe('migration plan', () => {
  it('reports the source collisions it repairs and assigns distinct ids', () => {
    const scopes = [
      scope({ makerSlug: 'toyota', modelSlug: 'hilux', nodeId: '10401' }),
      scope({ makerSlug: 'nissan', modelSlug: 'navara', nodeId: '10401' }),
      scope({ makerSlug: 'ford', modelSlug: 'ranger', nodeId: '99999' }),
    ];
    const plan = planDiagramIdentityMigration(scopes);

    expect(plan.sourceNodeCollisions).toBe(1);
    expect(plan.collidingNodeIds).toEqual(['10401']);
    expect(new Set(plan.assignments.map((a) => a.dgmId)).size).toBe(3);
    expect(plan.derivedIdCollisions).toHaveLength(0);
    expect(() => assertMigrationApplicable(plan)).not.toThrow();
  });

  it('treats a repeated identical row as one diagram, not a collision', () => {
    const plan = planDiagramIdentityMigration([scope(), scope(), scope()]);
    expect(plan.derivedIdCollisions).toHaveLength(0);
    expect(new Set(plan.assignments.map((a) => a.dgmId)).size).toBe(1);
    expect(() => assertMigrationApplicable(plan)).not.toThrow();
  });

  it('refuses to apply a plan whose ids are not injective', () => {
    // Derivation will not collide at catalogue scale, but "will not" is not
    // "cannot", and a silent collision would merge two makers' diagrams — the
    // original defect in a new costume. The plan proves injectivity over the
    // real input instead of trusting the arithmetic.
    const plan = planDiagramIdentityMigration([scope({ makerSlug: 'a' }), scope({ makerSlug: 'b' })]);
    const forced = {
      ...plan,
      derivedIdCollisions: [
        { dgmId: 'DGM-0000000000000000000000000', scopes: [scope({ makerSlug: 'a' }), scope({ makerSlug: 'b' })] },
      ],
    };
    expect(() => assertMigrationApplicable(forced)).toThrow(/not injective/);
    expect(() => assertMigrationApplicable(forced)).toThrow(/merge diagrams from different vehicles/);
  });

  it('scales to a catalogue-shaped input without collisions', () => {
    // 20 makers x 30 models x 8 sections x 20 nodes, every maker reusing the
    // same node id space — the shape that produces 44,532 collisions today,
    // at a size the suite can afford to run on every commit.
    const scopes: SourceDiagramScope[] = [];
    for (let maker = 0; maker < 20; maker++) {
      for (let model = 0; model < 30; model++) {
        for (let section = 0; section < 8; section++) {
          for (let node = 0; node < 20; node++) {
            scopes.push({
              sourceSystem: '7zap',
              makerSlug: `maker-${maker}`,
              modelSlug: `model-${model}`,
              variantSlug: null,
              sectionSlug: `section-${section}`,
              nodeId: `${node}`,
            });
          }
        }
      }
    }
    const plan = planDiagramIdentityMigration(scopes);
    expect(plan.assignments).toHaveLength(96_000);
    expect(new Set(plan.assignments.map((a) => a.dgmId)).size).toBe(96_000);
    expect(plan.sourceNodeCollisions).toBe(20);
    expect(() => assertMigrationApplicable(plan)).not.toThrow();
  }, 15_000);
});
