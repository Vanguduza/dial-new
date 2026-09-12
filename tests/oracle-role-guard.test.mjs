import { describe, it, expect } from 'vitest';
import { evaluate, describeSelf, isHeavy, recoveryClassOf, DECISION, REASON, POLICY }
  from '../deploy/oracle/resource-fabric/role-guard.mjs';

/**
 * Task separation must hold at the HOST, not only at the scheduler. placement.mjs
 * binds work that arrives through it; role-guard binds work however it arrives —
 * SSH, Desktop Commander, cron, or an operator's hands.
 */

const task = (extra = {}) => ({ task_id: 't', project: 'dial', ...extra });

// Rev 3 section 5.2: recovery is bidirectional in capability and asymmetric in privilege.
// Rev 2 required one-way recovery; Rev 3 opens the second direction but caps it at R1, so
// these tests must distinguish "which host" from "which class" rather than conflating them.
const R1 = ['SSH_REPAIR', 'DESKTOP_COMMANDER_REPAIR', 'HOST_SYSTEMD_REPAIR', 'HOST_LEVEL_CLEANUP'];
const R2 = ['NETWORK_FIREWALL_CORRECTION', 'CREDENTIAL_SESSION_REPAIR', 'RECOVERY_KEY_ROTATION'];
const R3 = ['OCI_RECOVERY'];
const owned = (extra = {}) => task({ owner_authorization: 'OWNER-TEST-TOKEN', ...extra });

describe('recovery authorities stay off hosts with no recovery remit', () => {
  for (const authority of [...R1, ...R2, ...R3]) {
    it(`${authority} is allowed on oracle-admin with the right authorization`, () => {
      expect(evaluate(owned({ authority_class: authority }), { hostId: 'oracle-admin' }).decision)
        .toBe(DECISION.ALLOW);
    });
  }

  it('refuses a recovery authority on a host that is neither a peer nor a bounded recoverer', () => {
    const hosts = {
      hosts: [{
        host_id: 'bystander', architecture: 'x86_64', roles: ['LIGHT_X86'],
        recovers: [], development_pool_mb: 512, max_concurrent_heavy_jobs: 0,
      }],
    };
    const r = evaluate(task({ authority_class: 'SSH_REPAIR' }), { hostId: 'bystander', hosts });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.AUTHORITY_REQUIRES_RECOVERY_ROLE);
  });
});

describe('the second recovery direction is bounded at R1', () => {
  // The gap this closes is "both E2s down at once", which on 2026-09-12 was the actual
  // situation. Hermes may bring their recovery planes back; it may not operate them.
  for (const authority of R1) {
    it(`dial-hermes-control may run ${authority} (R1)`, () => {
      const r = evaluate(task({ authority_class: authority }), { hostId: 'dial-hermes-control' });
      expect(r.decision).toBe(DECISION.ALLOW);
      expect(r.recovery_class).toBe('R1');
    });
  }

  for (const authority of [...R2, ...R3]) {
    it(`dial-hermes-control may never run ${authority}, even with owner authorization`, () => {
      const r = evaluate(owned({ authority_class: authority }), { hostId: 'dial-hermes-control' });
      expect(r.decision).toBe(DECISION.REFUSE);
      expect(r.reason).toBe(REASON.AUTHORITY_EXCEEDS_HOST_RECOVERY_MAX);
      expect(r.recovery_authority_max).toBe('R1');
    });
  }

  it('a compromised Hermes cannot rotate recovery keys or reach the OCI control plane', () => {
    for (const authority of ['RECOVERY_KEY_ROTATION', 'OCI_RECOVERY']) {
      expect(evaluate(owned({ authority_class: authority }), { hostId: 'dial-hermes-control' }).decision)
        .toBe(DECISION.REFUSE);
    }
  });
});

describe('R2 and above are never automatic in either direction', () => {
  for (const authority of [...R2, ...R3]) {
    it(`${authority} is refused on oracle-admin without owner authorization`, () => {
      const r = evaluate(task({ authority_class: authority }), { hostId: 'oracle-admin' });
      expect(r.decision).toBe(DECISION.REFUSE);
      expect(r.reason).toBe(REASON.OWNER_AUTHORIZATION_REQUIRED);
    });
  }

  it('R1 needs no owner authorization — bounded, reversible repair must not stall on a human', () => {
    expect(evaluate(task({ authority_class: 'SSH_REPAIR' }), { hostId: 'oracle-admin' }).decision)
      .toBe(DECISION.ALLOW);
  });
});

describe('the recovery bound fails closed', () => {
  const base = {
    host_id: 'h', architecture: 'x86_64', roles: ['ADMIN', 'RECOVERY'],
    recovers: [], development_pool_mb: 0, max_concurrent_heavy_jobs: 0,
  };

  it('refuses a recovery authority that no R-class maps', () => {
    const policy = JSON.parse(JSON.stringify(POLICY));
    policy.authority_routing.recovery_plane_only.push('UNMAPPED_THING');
    const r = evaluate(owned({ authority_class: 'UNMAPPED_THING' }),
      { hostId: 'h', hosts: { hosts: [{ ...base, recovery_authority_max: 'R3' }] }, policy });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.UNMAPPED_RECOVERY_AUTHORITY);
  });

  it('refuses when the host declares no recovery_authority_max at all', () => {
    const r = evaluate(task({ authority_class: 'SSH_REPAIR' }),
      { hostId: 'h', hosts: { hosts: [base] } });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.HOST_HAS_NO_RECOVERY_AUTHORITY_MAX);
  });

  it('refuses when the declared maximum is not a class the policy knows', () => {
    const r = evaluate(task({ authority_class: 'SSH_REPAIR' }),
      { hostId: 'h', hosts: { hosts: [{ ...base, recovery_authority_max: 'R9' }] } });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.HOST_HAS_NO_RECOVERY_AUTHORITY_MAX);
  });

  it('caps an R0-only host at observation', () => {
    const hosts = { hosts: [{ ...base, recovery_authority_max: 'R0' }] };
    const r = evaluate(task({ authority_class: 'SSH_REPAIR' }), { hostId: 'h', hosts });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.AUTHORITY_EXCEEDS_HOST_RECOVERY_MAX);
  });
});

describe('the R0-R3 mapping covers the authority vocabulary exactly', () => {
  // Rev 3 section 5.3 calls this mapping normative. A new authority_class added to
  // policy.json without an R-class would otherwise be silently refused everywhere, or
  // worse, silently permitted if the bound were ever relaxed.
  it('every recovery-plane authority has exactly one R-class', () => {
    const classes = POLICY.recovery_action_classes.classes;
    for (const authority of POLICY.authority_routing.recovery_plane_only) {
      const hits = Object.entries(classes).filter(([, members]) => members.includes(authority));
      expect(hits, `${authority} should map to exactly one R-class`).toHaveLength(1);
    }
  });

  it('maps nothing that is not a recovery-plane authority', () => {
    const mapped = Object.values(POLICY.recovery_action_classes.classes).flat();
    for (const authority of mapped) {
      expect(POLICY.authority_routing.recovery_plane_only).toContain(authority);
    }
  });

  it('R0 is observation only and carries no authority_class', () => {
    expect(POLICY.recovery_action_classes.classes.R0).toEqual([]);
  });
});

describe('owner-control authorities stay on the control host', () => {
  for (const authority of ['OWNER_STEER', 'OWNER_CONTROL', 'WHATSAPP_CONTROL']) {
    it(`${authority} is refused on the E2 recovery pair`, () => {
      for (const host of ['oracle-admin', 'oracle-admin-v2']) {
        const r = evaluate(task({ authority_class: authority }), { hostId: host });
        expect(r.decision).toBe(DECISION.REFUSE);
        expect(r.reason).toBe(REASON.AUTHORITY_REQUIRES_CONTROL_ROLE);
      }
    });
  }
});

describe('development work never runs on an admin/recovery node', () => {
  // The E2 pair exist to recover the estate. A recovery node busy building is not one,
  // however much memory happens to be free at that moment.
  it('is refused on both E2 hosts', () => {
    for (const host of ['oracle-admin', 'oracle-admin-v2']) {
      const r = evaluate(task({ predicted_memory_mb: 64 }), { hostId: host });
      expect(r.decision).toBe(DECISION.REFUSE);
      expect(r.reason).toBe(REASON.NO_DEVELOPMENT_POOL_ON_THIS_HOST);
    }
  });

  it('is allowed on the control host, which has a development pool', () => {
    expect(evaluate(task({ predicted_memory_mb: 64 }), { hostId: 'dial-hermes-control' }).decision)
      .toBe(DECISION.ALLOW);
  });

  it('does not block recovery authorities, which are the point of those hosts', () => {
    expect(evaluate(task({ authority_class: 'SSH_REPAIR', predicted_memory_mb: 64 }),
                    { hostId: 'oracle-admin' }).decision).toBe(DECISION.ALLOW);
  });
});

describe('heavy work respects per-host limits', () => {
  it('classifies by the same thresholds the scheduler uses', () => {
    expect(isHeavy({ predicted_memory_mb: 4096 })).toBe(true);
    expect(isHeavy({ disk_io_class: 'heavy' })).toBe(true);
    expect(isHeavy({ cpu_seconds: 6000 })).toBe(true);
    expect(isHeavy({ predicted_memory_mb: 16 })).toBe(false);
  });

  it('is refused on a host whose heavy-job limit is zero', () => {
    const r = evaluate(task({ authority_class: 'SSH_REPAIR', predicted_memory_mb: 4096 }),
                       { hostId: 'oracle-admin' });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.HEAVY_WORK_NOT_PERMITTED);
  });
});

describe('fails closed', () => {
  it('refuses on a host it does not know', () => {
    const r = evaluate(task(), { hostId: 'some-random-box' });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.UNKNOWN_HOST);
  });

  it('refuses an architecture mismatch rather than trying anyway', () => {
    const r = evaluate(task({ authority_class: 'SSH_REPAIR', architecture: 'arm64' }),
                       { hostId: 'oracle-admin' });
    expect(r.decision).toBe(DECISION.REFUSE);
    expect(r.reason).toBe(REASON.ARCHITECTURE_MISMATCH);
  });

  it('refuses a task with no authority class on a recovery node', () => {
    expect(evaluate(task(), { hostId: 'oracle-admin' }).decision).toBe(DECISION.REFUSE);
  });
});

describe('a host can describe its own remit', () => {
  it('reports the E2 as recovery-only', () => {
    const d = describeSelf('oracle-admin');
    expect(d.known).toBe(true);
    expect(d.development_permitted).toBe(false);
    expect(d.heavy_work_permitted).toBe(false);
    expect(d.authority_classes_permitted).toContain('SSH_REPAIR');
    expect(d.authority_classes_permitted).not.toContain('OWNER_STEER');
    expect(d.recovers).toContain('dial-hermes-control');
  });

  it('reports the control host as development-capable and a bounded recoverer', () => {
    const d = describeSelf('dial-hermes-control');
    expect(d.development_permitted).toBe(true);
    expect(d.heavy_work_permitted).toBe(true);
    expect(d.authority_classes_permitted).toContain('OWNER_STEER');
    // Rev 3: it gains R1, and only R1.
    expect(d.recovery_authority_max).toBe('R1');
    expect(d.authority_classes_permitted).toContain('SSH_REPAIR');
    expect(d.authority_classes_permitted).not.toContain('OCI_RECOVERY');
    expect(d.authority_classes_permitted).not.toContain('RECOVERY_KEY_ROTATION');
    expect(d.recovers).toEqual(['oracle-admin', 'oracle-admin-v2']);
    expect(d.recovery_service_allowlist).not.toContain('*');
  });

  it('reports what each authority maps to, so an operator can read the bound', () => {
    expect(recoveryClassOf('SSH_REPAIR')).toBe('R1');
    expect(recoveryClassOf('RECOVERY_KEY_ROTATION')).toBe('R2');
    expect(recoveryClassOf('OCI_RECOVERY')).toBe('R3');
    expect(recoveryClassOf('OWNER_STEER')).toBe(null);
  });

  it('does not pretend to know an unlisted host', () => {
    expect(describeSelf('nope').known).toBe(false);
  });
});

describe('the two E2 peers cover each other and the control host', () => {
  it('each recovery peer lists the other and dial-hermes-control', () => {
    expect(describeSelf('oracle-admin').recovers.sort())
      .toEqual(['dial-hermes-control', 'oracle-admin-v2']);
    expect(describeSelf('oracle-admin-v2').recovers.sort())
      .toEqual(['dial-hermes-control', 'oracle-admin']);
  });
});
