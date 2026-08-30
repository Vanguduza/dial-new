/**
 * Stable DIAL diagram identity — the DGM migration.
 *
 * ## The defect
 *
 * `diagram_placements.node_id` is the identifier the source EPC gave a diagram.
 * It is unique inside one maker's catalogue and nowhere else: 44,532 node_id
 * values currently appear under more than one `maker_slug`. Any lookup keyed on
 * node_id alone can therefore return another maker's diagram, which is why
 * DIAGRAM_READY and HOTSPOT_READY are blocked — a hotspot joins to its diagram
 * through that id, so a collision does not merely mis-route a click, it attaches
 * one vehicle's part positions to another vehicle's picture.
 *
 * The canon has always named the fix: "Create a globally unique DIAL diagram ID
 * such as `DGM-...`" (CATALOG_AGENT_BUILD_PROMPT §116) and "Use stable DIAL
 * `DGM-*` diagram IDs" (TRANSITION_EPC_INTEGRATION_LOCK §114). This module is
 * that identity, as a function rather than a description.
 *
 * ## Why derived rather than allocated
 *
 * A sequential registry (`DGM-000000001`) would need a central allocator, and
 * re-importing the catalogue would either renumber every diagram or require the
 * allocator's state to survive alongside the data. The catalogue is produced by
 * a separate pipeline and injected here when ready, so any scheme that depends
 * on allocation order would break on the first re-import.
 *
 * A derived id has none of that. The same source scope always produces the same
 * DGM id, on any machine, in any order, with no state to carry. Re-imports are
 * idempotent by construction.
 *
 * ## Why the key is length-prefixed
 *
 * The obvious canonical form is `maker:model:section:node`. It is also wrong:
 * a maker slug containing a colon would let `{maker: "a:b", model: "c"}` and
 * `{maker: "a", model: "b:c"}` produce one key, and two different diagrams
 * would collapse into one id. That is the same class of defect as the one being
 * fixed — an identifier whose scope is ambiguous — so the encoding is
 * length-prefixed and cannot be forged by a delimiter in the data.
 *
 * ## Why generation is always verified
 *
 * A 130-bit derived id will not collide at catalogue scale, but "will not"
 * is not "cannot", and a silent hash collision would merge two makers'
 * diagrams — today's bug wearing a new costume. `planDiagramIdentityMigration`
 * therefore proves injectivity over the actual input rather than trusting the
 * arithmetic, and refuses the plan if two distinct scopes ever meet.
 */

import { createHash } from 'node:crypto';

/**
 * The scope that makes a source diagram identifier unambiguous. Every field
 * that distinguishes one diagram from another must be present, because the id
 * is only as unique as the scope it is derived from.
 */
export interface SourceDiagramScope {
  /** The catalogue this row came from, e.g. `7zap`. Two sources may reuse ids. */
  sourceSystem: string;
  makerSlug: string;
  modelSlug: string;
  /** Present when the source separates diagrams per variant; null when it does not. */
  variantSlug?: string | null;
  sectionSlug: string;
  /** The source's own identifier — the one that is not globally unique. */
  nodeId: string;
}

export interface DiagramIdentityAssignment {
  dgmId: string;
  scope: SourceDiagramScope;
}

export interface DiagramIdentityMigrationPlan {
  assignments: DiagramIdentityAssignment[];
  /** Distinct scopes that share one source nodeId — the defect being repaired. */
  sourceNodeCollisions: number;
  /** Makers affected by those collisions, for the operator report. */
  collidingNodeIds: string[];
  /** Always empty in a valid plan; a non-empty value fails the migration. */
  derivedIdCollisions: Array<{ dgmId: string; scopes: SourceDiagramScope[] }>;
}

/** Crockford base32: no I, L, O or U, so an id cannot be misread aloud or retyped wrong. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ID_LENGTH = 26;

/** `DGM-` followed by 26 Crockford base32 characters. */
export const PRODUCTION_DGM_ID = /^DGM-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/;

/**
 * True only for a derived production id.
 *
 * Hand-authored development ids such as `DGM-HILUX-ENG-001` deliberately fail
 * this. The pilot flow pack already records that production publication is
 * blocked on "corrected catalog identities"; this is the check that makes that
 * statement testable rather than a note.
 */
export function isProductionDgmId(value: string): boolean {
  return PRODUCTION_DGM_ID.test(value);
}

/**
 * Unambiguous encoding of a scope. Each component is prefixed with its byte
 * length, so no value inside a component can imitate the separator.
 */
export function canonicalScopeKey(scope: SourceDiagramScope): string {
  const components = [
    scope.sourceSystem,
    scope.makerSlug,
    scope.modelSlug,
    scope.variantSlug ?? '',
    scope.sectionSlug,
    scope.nodeId,
  ];
  for (const [index, component] of components.entries()) {
    if (typeof component !== 'string') {
      throw new TypeError(`diagram scope component ${index} is not a string`);
    }
  }
  // An empty required component would silently widen the scope, so it is a
  // refusal rather than a default. variantSlug is the one legitimate blank.
  const required = [0, 1, 2, 4, 5];
  for (const index of required) {
    if (components[index].length === 0) {
      throw new Error(`diagram scope component ${index} may not be empty`);
    }
  }
  return components
    .map((component) => `${Buffer.byteLength(component, 'utf8')}:${component}`)
    .join('|');
}

/** The stable DIAL diagram id for a source scope. Deterministic and stateless. */
export function dgmIdFor(scope: SourceDiagramScope): string {
  const digest = createHash('sha256').update(canonicalScopeKey(scope), 'utf8').digest();

  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      if (out.length === ID_LENGTH) return `DGM-${out}`;
    }
  }
  /* c8 ignore next */
  throw new Error('digest exhausted before the id was complete');
}

/**
 * Build the migration for a set of source rows.
 *
 * Reports the source collisions being repaired, and proves that the derived ids
 * are injective over this input. It does not mutate anything: the catalogue is
 * produced elsewhere and injected here, so this returns a plan for that pipeline
 * to apply.
 */
export function planDiagramIdentityMigration(
  scopes: SourceDiagramScope[],
): DiagramIdentityMigrationPlan {
  const assignments: DiagramIdentityAssignment[] = [];
  const byDerivedId = new Map<string, SourceDiagramScope[]>();
  const makersByNodeId = new Map<string, Set<string>>();

  for (const scope of scopes) {
    const dgmId = dgmIdFor(scope);
    assignments.push({ dgmId, scope });

    const existing = byDerivedId.get(dgmId);
    if (existing) existing.push(scope);
    else byDerivedId.set(dgmId, [scope]);

    const makers = makersByNodeId.get(scope.nodeId) ?? new Set<string>();
    makers.add(scope.makerSlug);
    makersByNodeId.set(scope.nodeId, makers);
  }

  const collidingNodeIds = [...makersByNodeId.entries()]
    .filter(([, makers]) => makers.size > 1)
    .map(([nodeId]) => nodeId)
    .sort();

  // Two identical rows are not a collision — the same scope is the same diagram,
  // and mapping it twice to one id is the point. Only distinct scopes meeting on
  // one id are a failure.
  const derivedIdCollisions = [...byDerivedId.entries()]
    .map(([dgmId, group]) => ({
      dgmId,
      scopes: [...new Map(group.map((s) => [canonicalScopeKey(s), s])).values()],
    }))
    .filter((entry) => entry.scopes.length > 1);

  return {
    assignments,
    sourceNodeCollisions: collidingNodeIds.length,
    collidingNodeIds,
    derivedIdCollisions,
  };
}

/**
 * Whether a plan may be applied.
 *
 * Source collisions are expected — repairing them is the point. Derived
 * collisions are not, and must stop the migration rather than be reported and
 * carried forward.
 */
export function assertMigrationApplicable(plan: DiagramIdentityMigrationPlan): void {
  if (plan.derivedIdCollisions.length === 0) return;
  const [first] = plan.derivedIdCollisions;
  throw new Error(
    `DGM derivation is not injective over this catalogue: ${first.dgmId} is claimed by ` +
      `${first.scopes.length} distinct source scopes ` +
      `(${plan.derivedIdCollisions.length} colliding id(s) in total). ` +
      'Applying this plan would merge diagrams from different vehicles, which is the ' +
      'defect the migration exists to remove.',
  );
}
