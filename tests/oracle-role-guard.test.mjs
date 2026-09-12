import { describe, it, expect } from 'vitest';
import { evaluate, describeSelf, isHeavy, DECISION, REASON }
  from '../deploy/oracle/resource-fabric/role-guard.mjs';

/**
 * Task separation must hold at the HOST, not only at the scheduler. placement.mjs
 * binds work that arrives through it; role-guard binds work however it arrives —
 * SSH, Desktop Commander, cron, or an operator's hands.
 */

const task = (extra = {}) => ({ task_id: 't', project: 'dial', ...extra });

describe('recovery authorities stay on recovery peers', () => {
  for (const authority of ['OCI_RECOVERY', 'SSH_REPAIR', 'DESKTOP_COMMANDER_REPAIR',
                           'HOST_SYSTEMD_REPAIR', 'CREDENTIAL_SESSION_REPAIR']) {
    it(`${authority} is allowed on oracle-admin and refused on dial-hermes-control`, () => {
      expect(evaluate(task({ authority_class: authority }), { hostId: 'oracle-admin' }).decision)
        .toBe(DECISION.ALLOW);
      const onControl = evaluate(task({ authority_class: authority }), { hostId: 'dial-hermes-control' });
      expect(onControl.decision).toBe(DECISION.REFUSE);
      expect(onControl.reason).toBe(REASON.AUTHORITY_REQUIRES_RECOVERY_ROLE);
    });
  }
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

  it('reports the control host as development-capable but not a recovery peer', () => {
    const d = describeSelf('dial-hermes-control');
    expect(d.development_permitted).toBe(true);
    expect(d.heavy_work_permitted).toBe(true);
    expect(d.authority_classes_permitted).toContain('OWNER_STEER');
    expect(d.authority_classes_permitted).not.toContain('SSH_REPAIR');
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
