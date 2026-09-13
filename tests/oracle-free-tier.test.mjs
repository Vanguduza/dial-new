import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Rev 3 section 2.1 asserted the estate fitted inside Always Free using figures with no
 * provenance. The first correction replaced them with different figures that had no better
 * provenance — secondary reports of a June 2026 A1 reduction, from three pages that were
 * all blocked and never actually opened — and stated the result as established fact. The
 * second version was more confident than the first while being no better founded, and the
 * estate itself contradicted it: the supposedly over-limit host was running fine.
 *
 * So the fix is not a corrected constant, which rots the same way. It is that the file
 * records how well each figure is KNOWN — including `any_source_read_directly` — and that
 * the check keeps two questions apart:
 *
 *   does the estate exceed the figures on record   (arithmetic, reliable)
 *   are those figures actually known               (provenance, currently not)
 *
 * Over a weakly-known figure is CHECK_TENANCY, not EXCEEDS. And nothing here is authority:
 * service limits are per-account, so only the tenancy's own limits settle it.
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

  it('says whether ANY source was read directly, not just the canonical one', () => {
    // The first version of this file listed three "corroborating sources" that had all
    // been blocked and never opened. Naming a URL is not reading it, and a schema that
    // only asks about the canonical page lets that pass.
    expect(ALLOWANCE.canonical_source).toMatch(/^https:\/\/docs\.oracle\.com\//);
    expect(typeof ALLOWANCE.provenance.canonical_source_read).toBe('boolean');
    expect(typeof ALLOWANCE.provenance.any_source_read_directly).toBe('boolean');
    expect(ALLOWANCE.provenance.confidence).toMatch(/^(LOW|MEDIUM|HIGH)$/);
  });

  it('lists unread sources under a name that says they were not read', () => {
    if (!ALLOWANCE.provenance.any_source_read_directly) {
      expect(ALLOWANCE.provenance.sources_named_but_not_read.length).toBeGreaterThan(0);
      expect(ALLOWANCE.provenance).not.toHaveProperty('corroborating_sources');
      expect(ALLOWANCE.provenance.why).toMatch(/blocked|could not be fetched|not.*opened/i);
    }
  });

  it('records evidence that contradicts its own figures', () => {
    // The estate itself is evidence. dial-hermes-control running at 4/24 well after the
    // reported termination date outranks an unread secondary source, and a file that only
    // recorded the supporting evidence would be advocacy, not provenance.
    const c = ALLOWANCE.provenance.contradicting_evidence;
    expect(c.observation).toBeTruthy();
    expect(c.why_it_matters).toBeTruthy();
    expect(c.possible_explanations.length).toBeGreaterThanOrEqual(2);
  });

  it('names the tenancy service limits as the authority, not itself', () => {
    expect(ALLOWANCE.authority.note).toMatch(/NOT authority|not authority/);
    expect(ALLOWANCE.authority.cli).toMatch(/oci limits/);
    expect(ALLOWANCE.authority.console_path).toMatch(/Limits, Quotas and Usage/);
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
  it('reports CHECK_TENANCY, not EXCEEDS, while the figures are weakly known', () => {
    // The arithmetic is right — 4 is more than 2 — but the 2 came from search summaries
    // of pages that could not be opened, and the estate contradicts it. "Over a number
    // nobody has read" is a prompt to go and look, not a finding.
    const r = run(['--declared']);
    expect(r.out).toMatch(/STATE: CHECK_TENANCY/);
    expect(r.out).toMatch(/A1\.Flex OCPU \(total\): 4 of 2/);
    expect(r.out).toMatch(/--tenancy/);
    expect(r.status).toBe(3);
  });

  it('surfaces the contradicting evidence in the CHECK_TENANCY message', () => {
    const r = run(['--declared']);
    expect(r.out).toMatch(/Evidence against them/);
    expect(r.out).toMatch(/change nothing on this basis/);
  });

  it('still raises the backup gap, which does not depend on the limit question', () => {
    expect(run(['--declared']).out).toMatch(/40-backup-policy\.sh/);
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

  it('reports EXCEEDS only when the figure it exceeded was actually confirmed', () => {
    // This test previously asserted the opposite — that EXCEEDS outranks UNVERIFIED,
    // "being over the line is the louder fact". That was wrong: it is only a line if
    // someone read it. An unread figure produces CHECK_TENANCY however far over it you are.
    const unread = withAllowance((a) => {
      a.provenance.canonical_source_read = false;
      a.confirmed_at_utc = new Date(Date.now() - 900 * 86400_000).toISOString();
    });
    expect(run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: unread }).out)
      .toMatch(/STATE: CHECK_TENANCY/);

    const read = withAllowance((a) => {
      a.provenance.canonical_source_read = true;
      a.provenance.any_source_read_directly = true;
      a.confirmed_at_utc = new Date().toISOString();
    });
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: read });
    expect(r.out).toMatch(/STATE: EXCEEDS/);
    expect(r.status).toBe(1);
  });

  it('offers a way to read the only thing that actually decides', () => {
    // Service limits are per-account: grandfathering, age, region and account type all
    // change the answer, so no published figure settles it for a given tenancy.
    const r = run(['--tenancy']);
    expect(r.out).toMatch(/oci limits value list/);
    expect(r.out).toMatch(/Limits, Quotas and Usage/);
    expect(r.out).toMatch(/ONLY authority/);
  });

  it('refuses rather than guessing when the allowance file is missing', () => {
    const r = run(['--declared'], { DIAL_FREE_TIER_ALLOWANCE: '/nonexistent/allowance.json' });
    expect(r.status).toBe(2);
    expect(r.out).toMatch(/no allowance file/);
  });
});

describe('the architecture states the limit as an open question, not a finding', () => {
  const rev3 = fs.readFileSync(
    path.join(ROOT, 'docs/orchestration/DIAL_ORACLE_RESILIENT_3_NODE_CLUSTER_REV3.md'), 'utf8');

  it('records the reported 2026 A1 reduction', () => {
    expect(rev3).toMatch(/2 OCPU/);
    expect(rev3).toMatch(/2026-06-15|15 June 2026/);
    expect(rev3).toMatch(/2026-08-18|18 August 2026/);
  });

  it('points at the allowance file and the check rather than repeating numbers as fact', () => {
    expect(rev3).toMatch(/free-tier-allowance\.json/);
    expect(rev3).toMatch(/50-free-tier-check\.sh --tenancy/);
  });

  it('does not assert the estate is over the line', () => {
    expect(rev3).not.toMatch(/\*\*The estate is over the line\.\*\*/);
    expect(rev3).toMatch(/Open question, not a finding/);
  });

  it('records that the sources were unreadable and that the estate contradicts them', () => {
    expect(rev3).toMatch(/blocked by the egress proxy|could not be read/i);
    expect(rev3).toMatch(/running at 4 \/ 24 today/);
    expect(rev3).toMatch(/per-account/);
  });
});
