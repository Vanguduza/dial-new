import { check, STATUS, CRITICALITY } from '../lib/result.mjs';
import { dockerProbe, run } from '../lib/probes.mjs';

export function certifyContainers({ manifest }) {
  const domain = 'Containers';
  const d = dockerProbe();
  const checks = [check({ id: 'containers.declared', domain, title: 'no container workloads declared (canonical deployment is systemd sandboxing)', status: STATUS.NOT_APPLICABLE, criticality: CRITICALITY.OPTIONAL, evidence: { containers: manifest.containers.length, note: manifest.containers_note } })];
  if (d.installed) {
    checks.push(check({ id: 'containers.docker-present', domain, title: `docker present (daemon ${d.daemon_reachable ? 'reachable' : 'unreachable'})`, status: STATUS.PASS, criticality: CRITICALITY.OPTIONAL, evidence: { command: d.command, server_version: d.server_version } }));
    if (d.daemon_reachable) {
      const latest = run('sh', ['-c', "docker ps -a --format '{{.Image}}' | grep -E ':latest$|^[^:]+$' | head -5"], { timeoutMs: 8000 });
      checks.push(check({ id: 'containers.no-latest-tags', domain, title: 'no running/stopped containers on floating :latest images', status: latest.output.trim() ? STATUS.FAIL : STATUS.PASS, criticality: CRITICALITY.OPTIONAL, evidence: { command: latest.command, output: latest.output || 'none' }, remediation: 'pin image digests' }));
    }
  }
  return checks;
}
