import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Rev 3 section 2.1 asserted the estate fitted inside Always Free using figures that were
 * already wrong when they were written: Oracle halved the Ampere A1 allowance from
 * 4 OCPU / 24 GB to 2 OCPU / 12 GB on 2026-06-15 and began terminating over-limit
 * instances on 2026-08-18, with no announcement.
 *
 * The fix is not a corrected constant — that rots the same way. It is that the allowance
 * is dated data with a staleness bound, that something measures the estate against it,
 * and that a stale or unconfirmed figure can never report as WITHIN.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const PROV = path.join(ROOT, 'deploy/oracle/provisioning');
const CHECK = path.join(PROV, '50-free-tier-check.sh');
const ALLOWANCE_PATH = path.join(ROOT, 'deploy/oracle/free-tier-allowance.json');
const ALLOWANCE = JSON.parse(fs.readFileSync(ALLOWANCE_PATH, 'utf8'));
const HOSTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy/oracle/resource-fabric/hosts.json'), 'utf8'));

const run = (args = [], env = {}) => {
  try {
    return { status: 0, out: execFileSync('bash', [CHECK, ...args], { env: { ...process.env, ...env }, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const withAllowance = (mutate) => {
  const copy = JSON.parse(JSON.stringify(ALLOWANCE));
  mutate(copy);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ft-')), 'allowance.json');
  fs.writeFileSync(f, JSON.stringify(copy, null, 2));
  return f;
};

describe('the allowance is dated data, not a constant', () => {
  it('records when it was confirmed and when it goes stale', () => {
    expect(ALLOWANCE.confirmed_at_utc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Number.isFinite(Date.parse(ALLOWANCE.confirmed_at_utc))).toBe(true);
    expect(ALLOWANCE.stale_after_days).toBeGreaterThan(0);
  });

  it('says whether the canonical Oracle page was actually read, and cites what was', () => {
    expect(ALLOWANCE.canonical_source).toMatch(/^https:\/\/docs\.oracle\.com\//);
    expect(typeof ALLOWANCE.provenance.canonical_source_read).toBe('boolean');
    if (!ALLOWANCE.provenance.canonical_source_read) {
      expect(ALLOWANCE.provenance.why, 'an unread canonical source must say why').toBeTruthy();
      expect(ALLOWANCE.provenance.corroborating_sources.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps the superseded A1 figures, so the change is legible rather than silently overwritten', () => {
    const a1 = ALLOWANCE.compute['VM.Standard.A1.Flex'];
    expect(a1.changed_in_2026).toBe(true);
    expect(a1.previous_max_ocpu_total).toBe(4);
    expect(a1.previous_max_memory_mb_total).toBe(24576);
    expect(a1.max_ocpu_total).toBe(2);
    expect(a1.max_memory_mb_total).toBe(12288);
    expect(a1.over_limit_termination_from_utc).toMatch(/^2026-08-18/);
  });

  it('records that the AMD micros and the 200 GB storage did not change', () => {
    expect(ALLOWANCE.compute['VM.Standard.E2.1.Micro'].max_instances).toBe(2);
    expect(ALLOWANCE.compute['VM.Standard.E2.1.Micro'].changed_in_2026).toBe(false);
    expect(ALLOWANCE.storage.block_and_boot_volume_gb_total).toBe(200);
    expect(ALLOWANCE.storage.changed_in_2026).toBe(false);
  });
});

describe('the estate is measured against it', () => {
  it('reports EXCEEDS for the declared inventory, because it does', () => {
    // dial-hermes-control is declared at 4 OCPU / 24 GB — double the current allowance.
    // This test is not describing a hypothetical: it is the live state of the estate,
    // and it should keep failing until someone resizes the host or accepts the cost.
    const r = run(['--declared']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/STATE: EXCEEDS/);
    expect(r.out).toMatch(/A1\.Flex OCPU \(total\): 4 of 2/);
  });

  it('names which resource is over and by how much, not just that something is', () => {
    const r = run(['--declared', '--json']);
    const report = JSON.parse(r.out);
    const over = report.rows.filter((x) => x.over);
    expect(over.length).toBeGreaterThan(0);
    for (const row of over) {
      expect(row.resource).toBeTruthy();
      expect(row.headroom).toBeLessThan(0);
    }
  });

  it('says which inventory it used, so intent is never mistaken for reality', () => {
    const report = JSON.parse(run(['--declared', '--json']).out);
    expect(report.inventory_source).toMatch(/declared/);
    expect(report.observed.map((h) => h.host).sort())
      .toEqual(HOSTS.hosts.map((h) => h.host_id).sort());
  });

  it('counts only the shapes it claims to count', () => {
    const report = JSON.parse(run(['--declared', '--json']).out);
    const e2 = report.rows.find((r) => r.resource.includes('E2.1.Micro'));
    expect(e2.used).toBe(HOSTS.hosts.filter((h) => h.oci_shape === 'VM.Standard.E2.1.Micro').length);
    expect(e2.over).toBe(false);
  });
});

describe('an unverified figure never reads as healthy', () => {
  const fitting = (a) => {
    a.compute['VM.Standard.A1.Flex'].max_ocpu_total = 64;
    a.compute['VM.Standard.A1.Flex'].max_memory_mb_total = 65536;
  };

  it('reports WITHIN only when the estate fits AND the figures are fresh and canonical', () => {
    const f = withAllowance((a) => {
      fitting(a);
      a.provenance.canonical_source_read = true;
      a.confirmed_at_utc = new Date().toISOString();
    });
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: f });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/STATE: WITHIN/);
  });

  it('downgrades a fitting estate to UNVERIFIED when the canonical page was never read', () => {
    const f = withAllowance((a) => {
      fitting(a);
      a.provenance.canonical_source_read = false;
      a.confirmed_at_utc = new Date().toISOString();
    });
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: f });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/STATE: UNVERIFIED/);
  });

  it('downgrades to UNVERIFIED when the confirmation has gone stale', () => {
    const f = withAllowance((a) => {
      fitting(a);
      a.provenance.canonical_source_read = true;
      a.stale_after_days = 30;
      a.confirmed_at_utc = new Date(Date.now() - 200 * 86400_000).toISOString();
    });
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: f });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/STATE: UNVERIFIED/);
    expect(r.out).toMatch(/STALE/);
  });

  it('treats an undated allowance as unverified rather than assuming it is current', () => {
    const f = withAllowance((a) => {
      fitting(a);
      a.provenance.canonical_source_read = true;
      delete a.confirmed_at_utc;
    });
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: f });
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/UNDATED/);
  });

  it('EXCEEDS outranks UNVERIFIED — being over the line is the louder fact', () => {
    const f = withAllowance((a) => {
      a.provenance.canonical_source_read = false;
      a.confirmed_at_utc = new Date(Date.now() - 900 * 86400_000).toISOString();
    });
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: f });
    expect(r.out).toMatch(/STATE: EXCEEDS/);
    expect(r.status).toBe(1);
  });

  it('refuses rather than guessing when the allowance file is missing', () => {
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: '/nonexistent/allowance.json' });
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/no allowance file/);
  });
});

describe('the architecture no longer states the superseded figure as current', () => {
  const rev3 = fs.readFileSync(
    path.join(ROOT, 'docs/orchestration/DIAL_ORACLE_RESILIENT_3_NODE_CLUSTER_REV3.md'), 'utf8');

  it('records the 2026 A1 reduction', () => {
    expect(rev3).toMatch(/2 OCPU/);
    expect(rev3).toMatch(/2026-06-15|15 June 2026/);
    expect(rev3).toMatch(/2026-08-18|18 August 2026/);
  });

  it('points at the dated allowance file rather than repeating numbers inline as fact', () => {
    expect(rev3).toMatch(/free-tier-allowance\.json/);
    expect(rev3).toMatch(/50-free-tier-check\.sh/);
  });
});
