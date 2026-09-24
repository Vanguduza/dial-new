import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const repoDir = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoDir, rel), 'utf8');

describe('Netcup and Oracle network hardening', () => {
  it('makes Dial Control SSH key-only and reachable only over the overlay, behind a default-deny firewall', () => {
    const s = read('deploy/netcup/hermes-control/harden-netcup-host.sh');
    for (const line of ['PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'PermitRootLogin no']) expect(s).toContain(line);
    expect(s).toContain('ufw --force default deny incoming');
    expect(s).toMatch(/ufw allow in on "\$WG_IF" from "\$WG_NET" to any port 22 proto tcp/);
    expect(s).toMatch(/for r in OpenSSH 22\/tcp 22; do ufw --force delete allow/);
    // No public SSH allowance anywhere in the Netcup control path.
    for (const rel of ['deploy/netcup/hermes-control/harden-netcup-host.sh', 'deploy/netcup/hermes-control/postboot-converge.sh']) {
      expect(read(rel)).not.toMatch(/ufw allow (OpenSSH|22\b)/);
    }
    expect(read('deploy/netcup/hermes-control/postboot-converge.sh')).toContain('harden-netcup-host.sh" apply');
  });

  it('restricts Oracle peer SSH to the overlay, the VNIC subnet and Dial Control, behind an automatic rollback', () => {
    const s = read('deploy/oracle/resource-fabric/harden-oracle-peer.sh');
    const arm = s.indexOf('systemd-run --unit="$ROLLBACK_UNIT" --on-active=180');
    const firstChange = s.indexOf('while spec="$(iptables -S INPUT');
    expect(arm).toBeGreaterThan(0);
    expect(firstChange).toBeGreaterThan(arm);
    expect(s).toContain('"$TAG overlay"');
    expect(s).toContain('"$TAG vcn-subnet/bastion"');
    expect(s).toContain('"$TAG netcup-direct"');
    expect(s).toContain('PermitRootLogin no');
    expect(s).toMatch(/systemctl mask rpcbind\.socket/);
  });

  it('confirms a peer only after a fresh overlay login and never touches the migration source by default', () => {
    const s = read('deploy/netcup/hermes-control/harden-oracle-estate.sh');
    expect(s).toContain('ControlMaster=no');
    expect(s).toMatch(/grep -vx "\$MIGRATION_SOURCE"/);
    const apply = s.indexOf('dial-harden-peer apply');
    const confirm = s.indexOf('dial-harden-peer confirm');
    expect(confirm).toBeGreaterThan(apply);
  });
});
