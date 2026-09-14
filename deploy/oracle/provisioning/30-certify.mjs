#!/usr/bin/env node
// Section 24 certification report for oracle-admin.
//
//   ./30-certify.mjs [--host-report host-certification.json] [--out report.json]
//
// Merges three evidence sources into one machine-readable and human-readable
// report:
//
//   1. OCI control plane  — instance, shape, image, addresses, VCN/subnet, agent
//                           plugin state, IMDS hardening
//   2. The host itself    — host-certify.sh output, fetched over SSH
//   3. Hermes drift proof — 00-hermes-fingerprint.sh before/after comparison
//
// Every field is measured. A field that cannot be measured is emitted as
// "unverified" and DOWNGRADES the verdict; it never defaults to healthy. The
// verdict is computed from the evidence, not asserted.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNVERIFIED = 'unverified';

const args = process.argv.slice(2);
const arg = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const OUT = arg('--out', path.join(HERE, 'certification-report.json'));
const HOST_REPORT = arg('--host-report', null);
const BEFORE = arg('--hermes-before', path.join(HERE, 'hermes-before.json'));
const AFTER = arg('--hermes-after', path.join(HERE, 'hermes-after.json'));

const region = process.env.DIAL_OCI_REGION || 'af-johannesburg-1';

// Same detection as lib.sh: Cloud Shell has no ~/.oci/config and authenticates with
// a delegation token, so `--profile DEFAULT` would fail every call before it is sent.
const configFile = process.env.OCI_CLI_CONFIG_FILE || path.join(os.homedir(), '.oci', 'config');
const hasConfig = fs.existsSync(configFile);
const authArgs = [];
if (process.env.OCI_CLI_PROFILE) authArgs.push('--profile', process.env.OCI_CLI_PROFILE);
else if (hasConfig) authArgs.push('--profile', 'DEFAULT');
if (!hasConfig && fs.existsSync('/etc/oci/delegation_token')) authArgs.push('--auth', 'instance_obo_user');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function oci(argv) {
  try {
    const out = execFileSync('oci', [...authArgs, '--region', region, ...argv],
      { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out).data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- control plane
const network = readJson(path.join(HERE, 'network.json'));
const launched = readJson(path.join(HERE, 'instance.json'));
const compartment = process.env.DIAL_OCI_COMPARTMENT;

let instance = null, vnic = null, subnet = null, vcn = null;
let instanceId = launched?.instance_id ?? null;

if (compartment && !instanceId) {
  const list = oci(['compute', 'instance', 'list', '--compartment-id', compartment,
                    '--display-name', 'oracle-admin', '--all']) ?? [];
  instanceId = list.find((i) => i['lifecycle-state'] !== 'TERMINATED')?.id ?? null;
}
if (instanceId) {
  instance = oci(['compute', 'instance', 'get', '--instance-id', instanceId]);
  vnic = (oci(['compute', 'instance', 'list-vnics', '--instance-id', instanceId]) ?? [])[0] ?? null;
  if (vnic?.['subnet-id']) {
    subnet = oci(['network', 'subnet', 'get', '--subnet-id', vnic['subnet-id']]);
    if (subnet?.['vcn-id']) vcn = oci(['network', 'vcn', 'get', '--vcn-id', subnet['vcn-id']]);
  }
}

const pluginState = (name) =>
  instance?.['agent-config']?.['plugins-config']?.find((p) => p.name === name)?.['desired-state'] ?? UNVERIFIED;

// ---------------------------------------------------------------- host evidence
let host = HOST_REPORT ? readJson(HOST_REPORT) : null;
if (!host) {
  // Fetch it live if we have an address and a key.
  const ip = launched?.public_ip || vnic?.['public-ip'];
  const key = process.env.DIAL_SSH_PRIVATE_KEY_FILE;
  if (ip && key) {
    try {
      const out = execFileSync('ssh', ['-i', key, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
        '-o', 'StrictHostKeyChecking=accept-new', `ubuntu@${ip}`, 'sudo dial-host-certify'],
        { encoding: 'utf8', timeout: 120_000 });
      host = JSON.parse(out);
    } catch (error) {
      host = { error: `could not collect host certification over SSH: ${error.message.split('\n')[0]}` };
    }
  }
}

// ---------------------------------------------------------------- Hermes proof
let hermes = { state: UNVERIFIED, detail: 'no before/after fingerprint pair supplied' };
const before = readJson(BEFORE), after = readJson(AFTER);
if (before && after) {
  const same = JSON.stringify(before) === JSON.stringify(after);
  hermes = same
    ? { state: 'UNCHANGED', detail: 'before/after control-plane fingerprints are identical' }
    : { state: 'DRIFT_DETECTED', detail: 'dial-hermes-control state differs between snapshots — investigate immediately' };
}

// ---------------------------------------------------------------- verdict
const sshOk = host?.ssh?.healthy === true;
const ociOk = host?.oci?.run_command_capable === true
  && pluginState('Compute Instance Run Command') === 'ENABLED';
const recoveryOk = host?.recovery_plane?.healthy === true;
const commanderOk = host?.desktop_commander?.functionally_proven === true;
const hermesOk = hermes.state === 'UNCHANGED';

const blockers = [];
if (!sshOk) blockers.push('SSH not functionally proven');
if (!ociOk) blockers.push('OCI Run Command emergency path not proven');
if (!recoveryOk) blockers.push('recovery plane not proven');
if (!commanderOk) blockers.push('Remote Commander not proven end to end from the authorized client');
if (!hermesOk) blockers.push(`dial-hermes-control unchanged status: ${hermes.state}`);

let state, reason;
if (sshOk && ociOk && recoveryOk && commanderOk && hermesOk) {
  state = 'GREEN';
  reason = 'SSH, OCI emergency access, recovery plane and Commander are all functionally proven.';
} else if (sshOk && ociOk && hermesOk) {
  state = 'AMBER';
  reason = `Host and out-of-band recovery are healthy; outstanding: ${blockers.join('; ')}.`;
} else {
  state = 'RED';
  reason = `No reliable remote recovery path established. Outstanding: ${blockers.join('; ')}.`;
}

const report = {
  schema_version: 1,
  report: 'oracle-admin recovery readiness certification',
  generated_at: new Date().toISOString(),
  certification: { state, reason, blockers },
  instance: {
    ocid: instanceId ?? UNVERIFIED,
    name: instance?.['display-name'] ?? 'oracle-admin',
    lifecycle_state: instance?.['lifecycle-state'] ?? UNVERIFIED,
    shape: instance?.shape ?? launched?.shape ?? UNVERIFIED,
    ocpus: instance?.['shape-config']?.ocpus ?? UNVERIFIED,
    memory_gb: instance?.['shape-config']?.['memory-in-gbs'] ?? UNVERIFIED,
    image_id: instance?.['image-id'] ?? launched?.image_id ?? UNVERIFIED,
    availability_domain: instance?.['availability-domain'] ?? launched?.availability_domain ?? UNVERIFIED,
    region,
    in_transit_encryption: instance?.['launch-options']?.['is-pv-encryption-in-transit-enabled'] ?? UNVERIFIED,
    imds_v1_disabled: instance?.['instance-options']?.['are-legacy-imds-endpoints-disabled'] ?? UNVERIFIED,
  },
  networking: {
    public_ip: vnic?.['public-ip'] ?? launched?.public_ip ?? UNVERIFIED,
    private_ip: vnic?.['private-ip'] ?? launched?.private_ip ?? UNVERIFIED,
    vnic_name: vnic?.['display-name'] ?? UNVERIFIED,
    hostname_label: vnic?.['hostname-label'] ?? UNVERIFIED,
    vcn: vcn?.['display-name'] ?? UNVERIFIED,
    vcn_cidr: vcn?.['cidr-block'] ?? UNVERIFIED,
    subnet: subnet?.['display-name'] ?? UNVERIFIED,
    subnet_cidr: subnet?.['cidr-block'] ?? UNVERIFIED,
    nsg_ids: vnic?.['nsg-ids'] ?? [],
    ssh_ingress_cidr: network?.ssh_ingress_cidr ?? UNVERIFIED,
    shared_objects_modified: network?.hermes_shared_objects_modified ?? UNVERIFIED,
    resources_created_by_provisioning: network?.resources_created_by_this_run ?? [],
  },
  oracle_cloud_agent: {
    run_command: pluginState('Compute Instance Run Command'),
    monitoring: pluginState('Compute Instance Monitoring'),
    bastion: pluginState('Bastion'),
    management_disabled: instance?.['agent-config']?.['is-management-disabled'] ?? UNVERIFIED,
    host_agent_state: host?.oci?.cloud_agent ?? UNVERIFIED,
    ocarun_present: host?.oci?.ocarun_present ?? UNVERIFIED,
    imds_hardened_on_host: host?.oci?.imds_hardened ?? UNVERIFIED,
  },
  ssh: host?.ssh ?? { state: UNVERIFIED },
  recovery_plane: host?.recovery_plane ?? { state: UNVERIFIED },
  desktop_commander: host?.desktop_commander ?? { state: UNVERIFIED },
  resources: host?.resources ?? { state: UNVERIFIED },
  bootstrap: host?.bootstrap ?? { state: UNVERIFIED },
  hermes_control_untouched: hermes,
  host_report_error: host?.error ?? null,
};

fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

// ---------------------------------------------------------------- human readable
const g = (v) => (v === true ? 'yes' : v === false ? 'NO' : String(v ?? UNVERIFIED));
const lines = [
  '',
  `oracle-admin recovery readiness  —  ${report.certification.state}`,
  '='.repeat(64),
  report.certification.reason,
  '',
  `Instance     ${report.instance.ocid}`,
  `             ${report.instance.name}  ${report.instance.shape}  ${report.instance.lifecycle_state}`,
  `             image ${report.instance.image_id}`,
  `             IMDSv1 disabled: ${g(report.instance.imds_v1_disabled)}   in-transit encryption: ${g(report.instance.in_transit_encryption)}`,
  '',
  `Network      public ${report.networking.public_ip}   private ${report.networking.private_ip}`,
  `             ${report.networking.vcn} (${report.networking.vcn_cidr}) / ${report.networking.subnet} (${report.networking.subnet_cidr})`,
  `             SSH ingress ${report.networking.ssh_ingress_cidr} via NSG ${(report.networking.nsg_ids ?? []).join(', ') || UNVERIFIED}`,
  '',
  `SSH          service ${g(report.ssh.service)}  listening ${g(report.ssh.listening_22)}  password-auth ${g(report.ssh.password_auth)}`,
  `             fingerprint ${g(report.ssh.host_key_fingerprint)}`,
  `OCI agent    run-command ${report.oracle_cloud_agent.run_command}  monitoring ${report.oracle_cloud_agent.monitoring}  ocarun ${g(report.oracle_cloud_agent.ocarun_present)}`,
  `Recovery     repo ${g(report.recovery_plane.repo_sha)} (${g(report.recovery_plane.repo_ref)})`,
  `             fail-closed on stale telemetry: ${g(report.recovery_plane.stale_telemetry_fails_closed)}`,
  `Commander    ${g(report.desktop_commander.package)}  transport: ${g(report.desktop_commander.transport)}`,
  `             paired ${g(report.desktop_commander.paired)}  proven ${g(report.desktop_commander.functionally_proven)}`,
  `Resources    RAM ${g(report.resources.memory_available_mb)}/${g(report.resources.memory_total_mb)} MB free  swap ${g(report.resources.swap_used_mb)}/${g(report.resources.swap_total_mb)} MB  disk ${g(report.resources.disk_used_pct)}%  load ${g(report.resources.load_1m)}`,
  '',
  `dial-hermes-control: ${hermes.state} — ${hermes.detail}`,
  '',
];
if (blockers.length) lines.push('Outstanding:', ...blockers.map((b) => `  - ${b}`), '');
lines.push(`Written to ${OUT}`, '');
console.log(lines.join('\n'));

process.exitCode = state === 'GREEN' ? 0 : state === 'AMBER' ? 2 : 1;
