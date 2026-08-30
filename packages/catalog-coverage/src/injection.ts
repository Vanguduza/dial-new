/**
 * Injection conformance — what an injected catalogue or flow pack must satisfy.
 *
 * The catalogue and the transition flows are produced by separate pipelines and
 * injected into this repository when they are finished. That makes injection an
 * event with a contract, not a merge. This module is that contract, executable:
 * the producing agent runs it, and a bundle that fails does not enter.
 *
 * Two rules shape everything here.
 *
 * **Findings are refusals, not advice.** A validator that returns warnings
 * invites a judgement call at exactly the moment nobody wants to make one.
 * Every finding names the rule, the observed value and what to do, and any
 * finding at all means the bundle is not conformant.
 *
 * **Evidence is supplied, never inferred.** A missing count is not zero and not
 * "probably fine" — it is a refusal, because the most expensive failure mode in
 * this project has been a check that passed for want of data.
 */

import { isProductionDgmId } from './diagram-identity.js';

export interface ConformanceFinding {
  /** Stable identifier, so a producer can suppress nothing and track everything. */
  rule: string;
  severity: 'REFUSE';
  statement: string;
  observed?: string;
  remedy: string;
}

export interface ConformanceResult {
  conformant: boolean;
  findings: ConformanceFinding[];
  checked: number;
}

/**
 * What the catalogue pipeline publishes alongside its data.
 *
 * These are counts the producer already has; requiring them as a manifest means
 * conformance can be judged without this repository reading, or depending on,
 * the catalogue database itself.
 */
export interface CatalogueInjectionManifest {
  bundleId: string;
  sourceSystem: string;
  /** ISO-8601. Establishes which catalogue release a saved vehicle was resolved against. */
  producedAt: string;
  catalogReleaseId: string;
  counts: {
    makers: number;
    models: number;
    variants: number;
    sections: number;
    diagrams: number;
    diagramParts: number;
    placements: number;
  };
  diagramIdentity: {
    totalDiagrams: number;
    withProductionDgmId: number;
    /** Distinct source node_ids appearing under more than one maker. */
    crossMakerNodeCollisions: number;
    /** A sample the validator can check rather than take on trust. */
    sampleDgmIds: string[];
  };
  fitment: {
    totalVariants: number;
    withResolvedFitment: number;
  };
  hotspots: {
    totalDiagrams: number;
    withPositionHotspots: number;
  };
  images: {
    totalDiagrams: number;
    withVerifiedImage: number;
  };
  provenance: {
    /** Every source the bundle draws on, with the rights position recorded. */
    sources: Array<{ name: string; licence: string; rightsCleared: boolean }>;
  };
}

const refuse = (
  rule: string,
  statement: string,
  remedy: string,
  observed?: string,
): ConformanceFinding => ({ rule, severity: 'REFUSE', statement, observed, remedy });

/**
 * Validate a catalogue bundle against the injection standard.
 *
 * Deliberately does not open a database. The producer owns the data; this owns
 * the contract.
 */
export function validateCatalogueInjection(
  manifest: CatalogueInjectionManifest,
): ConformanceResult {
  const findings: ConformanceFinding[] = [];
  let checked = 0;

  const required = (value: unknown, rule: string, field: string) => {
    checked += 1;
    if (value === undefined || value === null || value === '') {
      findings.push(
        refuse(
          rule,
          `${field} is absent`,
          `Populate ${field}. An absent value is a refusal, not a default: a check that passes for want of data is the failure mode this standard exists to prevent.`,
        ),
      );
      return false;
    }
    return true;
  };

  required(manifest.bundleId, 'CAT-INJ-001', 'bundleId');
  required(manifest.sourceSystem, 'CAT-INJ-002', 'sourceSystem');
  required(manifest.catalogReleaseId, 'CAT-INJ-003', 'catalogReleaseId');

  checked += 1;
  if (!manifest.producedAt || Number.isNaN(Date.parse(manifest.producedAt))) {
    findings.push(
      refuse(
        'CAT-INJ-004',
        'producedAt is not a valid ISO-8601 timestamp',
        'Emit an ISO-8601 timestamp. A saved vehicle is revalidated against the catalogue release it was resolved on, so a release with no time has no before and after.',
        String(manifest.producedAt),
      ),
    );
  }

  // ── diagram identity ────────────────────────────────────────────────────
  const identity = manifest.diagramIdentity;
  checked += 1;
  if (!identity) {
    findings.push(
      refuse(
        'CAT-INJ-010',
        'diagramIdentity evidence is absent',
        'Publish diagram identity counts. Without them the readiness gate withholds DIAGRAM_READY rather than assuming a pass.',
      ),
    );
  } else {
    checked += 1;
    if (identity.crossMakerNodeCollisions !== 0) {
      findings.push(
        refuse(
          'CAT-INJ-011',
          'Source node_id is not globally unique',
          'Apply planDiagramIdentityMigration and key diagrams on the derived DGM id. A hotspot joins its diagram through this id, so a collision attaches one vehicle’s part positions to another vehicle’s picture.',
          `${identity.crossMakerNodeCollisions} colliding node_id(s)`,
        ),
      );
    }

    checked += 1;
    if (identity.withProductionDgmId !== identity.totalDiagrams) {
      findings.push(
        refuse(
          'CAT-INJ-012',
          'Not every diagram carries a stable DGM id',
          'Mint an id for every diagram with dgmIdFor. The absence of collisions is not proof that ids were minted — a single-maker catalogue collides with nothing.',
          `${identity.withProductionDgmId} of ${identity.totalDiagrams}`,
        ),
      );
    }

    checked += 1;
    if (!Array.isArray(identity.sampleDgmIds) || identity.sampleDgmIds.length === 0) {
      findings.push(
        refuse(
          'CAT-INJ-013',
          'No sample DGM ids supplied',
          'Include a sample so the format is checked rather than asserted.',
        ),
      );
    } else {
      const malformed = identity.sampleDgmIds.filter((id) => !isProductionDgmId(id));
      checked += 1;
      if (malformed.length) {
        findings.push(
          refuse(
            'CAT-INJ-014',
            'Sample contains ids that are not production DGM ids',
            'Ids must be DGM- followed by 26 Crockford base32 characters, derived by dgmIdFor. Hand-authored ids such as DGM-HILUX-ENG-001 are development placeholders.',
            malformed.slice(0, 3).join(', '),
          ),
        );
      }
    }
  }

  // ── the counts the readiness gate consumes ──────────────────────────────
  const ratios: Array<[string, string, { total: number; have: number } | undefined, string]> = [
    [
      'CAT-INJ-020',
      'fitment identity',
      manifest.fitment && {
        total: manifest.fitment.totalVariants,
        have: manifest.fitment.withResolvedFitment,
      },
      'Resolve chassis, engine and market for every variant, or exclude the variant from the bundle. A partially resolved variant is not selectable.',
    ],
    [
      'CAT-INJ-021',
      'position hotspots',
      manifest.hotspots && {
        total: manifest.hotspots.totalDiagrams,
        have: manifest.hotspots.withPositionHotspots,
      },
      'Every diagram needs position hotspots, joined through the DGM id.',
    ],
    [
      'CAT-INJ-022',
      'verified diagram images',
      manifest.images && {
        total: manifest.images.totalDiagrams,
        have: manifest.images.withVerifiedImage,
      },
      'Every diagram needs a verified image. A diagram with no picture cannot carry a hit region.',
    ],
  ];

  for (const [rule, label, pair, remedy] of ratios) {
    checked += 1;
    if (!pair) {
      findings.push(refuse(rule, `${label} evidence is absent`, remedy));
      continue;
    }
    if (pair.have !== pair.total) {
      findings.push(
        refuse(rule, `Not every record carries ${label}`, remedy, `${pair.have} of ${pair.total}`),
      );
    }
  }

  // ── rights ──────────────────────────────────────────────────────────────
  checked += 1;
  const sources = manifest.provenance?.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    findings.push(
      refuse(
        'CAT-INJ-030',
        'No source provenance recorded',
        'Record every source with its licence and rights position. ACT-REG-011 (EPC/catalogue/image rights and provenance) is an open activation blocker, and content whose rights are unknown cannot be published.',
      ),
    );
  } else {
    const uncleared = sources.filter((s) => !s.rightsCleared);
    checked += 1;
    if (uncleared.length) {
      findings.push(
        refuse(
          'CAT-INJ-031',
          'A source has no cleared rights position',
          'Clear the rights or remove the source. This does not block build — it blocks publication, and it is far cheaper to find here than after the data is in.',
          uncleared.map((s) => s.name).join(', '),
        ),
      );
    }
    const unlicensed = sources.filter((s) => !s.licence);
    checked += 1;
    if (unlicensed.length) {
      findings.push(
        refuse(
          'CAT-INJ-032',
          'A source records no licence',
          'Name the licence for every source, as examples/hilux-an130/source/licensed/ does in each filename.',
          unlicensed.map((s) => s.name).join(', '),
        ),
      );
    }
  }

  return { conformant: findings.length === 0, findings, checked };
}
