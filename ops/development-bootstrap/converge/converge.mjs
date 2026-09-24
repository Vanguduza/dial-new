import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { run, versionProbe, requiredServicePath } from '../lib/probes.mjs';
import { loadPins, itemsForRole } from '../lib/manifest.mjs';

// Convergence of required packages/runtimes (closure item 1). Every action is detect-first and pinned:
//   APT_PINNED        apt-get install <pkg>=<exact version>  (Ubuntu archive signatures verified by apt)
//   APT_SIGNED_REPO   vendor apt repository whose keyring SHA-256 is pinned; then apt-get install <pkg>=<exact>
//   NPM_EXACT         npm install -g <pkg>@<exact> --ignore-scripts, after `npm view` integrity equals the pin
//   INSTALLER_SHA256  installer downloaded to a file, SHA-256 verified, then executed with the pinned version
//   BINARY_TARBALL_SHA256 immutable release archive; one pinned binary plus declared aliases installed to ~/.local/bin
// A pin with null verification material is refused (PIN_MISSING -> OWNER_ACTION_REQUIRED). curl|bash and
// @latest are never produced by this module. Root-only steps run only when sudo -n succeeds; otherwise the
// exact command is printed for the owner and the action is reported OWNER_ACTION_REQUIRED.

export const CONVERGE_STATES = Object.freeze({ CONVERGED: 'CONVERGED', APPLIED: 'APPLIED', PLANNED: 'PLANNED', PIN_MISSING: 'PIN_MISSING', OWNER_ACTION_REQUIRED: 'OWNER_ACTION_REQUIRED', FAILED: 'FAILED', NOT_APPLICABLE: 'NOT_APPLICABLE' });

export function pinReady(pin) {
  if (!pin) return { ready: false, missing: ['pin'] };
  const missing = [];
  if (pin.method === 'NPM_EXACT') { if (!pin.version) missing.push('version'); if (!pin.integrity) missing.push('integrity'); }
  else if (pin.method === 'INSTALLER_SHA256') { if (!pin.sha256) missing.push('sha256'); if (!pin.version) missing.push('version'); if (!pin.install_args_template?.includes('<version>')) missing.push('install_args_template:<version>'); }
  else if (pin.method === 'RELEASE_TARBALL_SHA256' || pin.method === 'BINARY_TARBALL_SHA256') {
    if (!pin.version) missing.push('version');
    for (const arch of ['arm64', 'x64']) {
      if (!pin.architectures?.[arch]?.url) missing.push(`architectures.${arch}.url`);
      if (!pin.architectures?.[arch]?.sha256) missing.push(`architectures.${arch}.sha256`);
    }
  }
  else if (pin.method === 'SOURCE_ARCHIVE_SHA256') {
    for (const field of ['version', 'source_commit', 'url', 'sha256']) if (!pin[field]) missing.push(field);
    if (!Array.isArray(pin.install_command) || !pin.install_command.length) missing.push('install_command');
    else {
      const rendered = pin.install_command.join(' ');
      if (/^(?:sh|bash)$/i.test(pin.install_command[0]) || /(?:\||@latest\b|\s-e(?:\s|$)|--editable\b)/i.test(rendered)) missing.push('safe_install_command');
      if (!pin.install_command.some((arg) => String(arg).includes('<source-dir>'))) missing.push('install_command:<source-dir>');
    }
  }
  else if (pin.method === 'REPO_PINNED_SCRIPT') {
    for (const field of ['version','script','script_sha256']) if (!pin[field]) missing.push(field);
    if (pin.architectures) for (const arch of ['arm64','x64']) { if (!pin.architectures?.[arch]?.url) missing.push(`architectures.${arch}.url`); if (!pin.architectures?.[arch]?.sha256) missing.push(`architectures.${arch}.sha256`); }
    if (pin.lockfile && !pin.lockfile_sha256) missing.push('lockfile_sha256');
    if (pin.wrapper && !pin.wrapper_sha256) missing.push('wrapper_sha256');
    if ((pin.package || pin.integrity) && !(pin.package && pin.integrity)) missing.push('package+integrity');
  }
  else if (pin.method === 'APT_SIGNED_REPO') { if (!pin.keyring_sha256) missing.push('keyring_sha256'); if (!pin.version) missing.push('version'); }
  else if (pin.method === 'APT_PINNED') { for (const [p, v] of Object.entries(pin.packages || {})) if (!v) missing.push(`packages.${p}`); }
  else missing.push(`unsupported method ${pin.method}`);
  return { ready: missing.length === 0, missing };
}

export function sudoAvailable() {
  if (typeof process.getuid === 'function' && process.getuid() === 0) return { ok: true, mode: 'root' };
  const r = run('sudo', ['-n', 'true'], { timeoutMs: 5000 });
  return { ok: r.ok, mode: r.ok ? 'sudo' : 'none' };
}

function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function downloadToFile(url, dest) {
  return run('curl', ['--proto', '=https', '--tlsv1.2', '--fail', '--silent', '--show-error', '--location', '-o', dest, url], { timeoutMs: 120000 });
}

// ---- per-method actions -------------------------------------------------------------------------------
function aptPinnedAction({ item, pin, pkgName }) {
  const version = pin?.packages?.[pkgName] ?? null;
  const probe = versionProbe(item.binary, item.version_args || ['--version'], { minimum: item.minimum_version });
  return {
    id: `converge.${item.id}`, item: item.id, method: 'APT_PINNED', package: pkgName, pinned_version: version,
    needed: !(probe.installed && probe.satisfies),
    pin_ready: Boolean(version), missing_pin: version ? [] : [`apt.packages.${pkgName}`],
    requires_root: true,
    command: version ? ['apt-get', 'install', '-y', '--no-install-recommends', `${pkgName}=${version}`] : null,
    owner_record: `apt-cache policy ${pkgName}  -> record the candidate version under supply-chain/PINS.json pins.apt.packages.${pkgName}`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

function aptSignedRepoAction({ item, pin }) {
  const probe = versionProbe(item.binary, item.version_args || ['--version'], { minimum: item.minimum_version });
  const ready = pinReady(pin);
  const keyringName = `${item.pin_ref}.gpg`;
  return {
    id: `converge.${item.id}`, item: item.id, method: 'APT_SIGNED_REPO', package: pin?.package || null, pinned_version: pin?.version || null,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready, missing_pin: ready.missing, requires_root: true,
    steps: ready.ready ? [
      { kind: 'DOWNLOAD_VERIFY', url: pin.keyring_url, sha256: pin.keyring_sha256, dest: `/usr/share/keyrings/${keyringName}.armored` },
      { kind: 'ROOT', command: ['gpg', '--batch', '--yes', '--dearmor', '-o', `/usr/share/keyrings/${keyringName}`, `/usr/share/keyrings/${keyringName}.armored`] },
      { kind: 'ROOT_WRITE', file: `/etc/apt/sources.list.d/dial-${item.pin_ref}.list`, content: `${pin.repo_line.replace('<arch>', os.arch() === 'arm64' ? 'arm64' : 'amd64')}\n` },
      { kind: 'ROOT', command: ['apt-get', 'update'] },
      { kind: 'ROOT', command: ['apt-get', 'install', '-y', '--no-install-recommends', `${pin.package}=${pin.version}`] },
    ] : [],
    owner_record: `download ${pin?.keyring_url} to a file and record its sha256 as pins.${item.pin_ref}.keyring_sha256; record the exact ${pin?.package} version as pins.${item.pin_ref}.version`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

function npmExactAction({ item, pin }) {
  const probe = versionProbe(item.binary, ['--version'], { minimum: item.minimum_version, exact: pin?.version || null });
  const ready = pinReady(pin);
  return {
    id: `converge.${item.id}`, item: item.id, method: 'NPM_EXACT', package: pin?.package || item.package, pinned_version: pin?.version || null,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready, missing_pin: ready.missing, requires_root: false,
    steps: ready.ready ? [
      { kind: 'NPM_INTEGRITY_CHECK', package: pin.package, version: pin.version, integrity: pin.integrity },
      { kind: 'USER', command: ['npm', 'install', '-g', '--ignore-scripts', '--no-fund', '--no-audit', `${pin.package}@${pin.version}`] },
      { kind: 'VERSION_ASSERT', binary: item.binary, exact: pin.version },
    ] : [],
    owner_record: `npm view ${pin?.package || item.package}@<version> dist.integrity -> record version + integrity under pins["${item.pin_ref}"]`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

function installerSha256Action({ item, pin }) {
  // An exact pin (claude-code 2.1.281) must converge to that version; a minimum alone left 2.1.270 in place.
  const probe = versionProbe(item.binary, ['--version'], pin?.version ? { exact: pin.version } : { minimum: item.minimum_version });
  const ready = pinReady(pin);
  const dest = path.join(os.tmpdir(), `dial-installer-${item.pin_ref}.sh`);
  return {
    id: `converge.${item.id}`, item: item.id, method: 'INSTALLER_SHA256', package: item.pin_ref, pinned_version: pin?.version || null,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready, missing_pin: ready.missing, requires_root: false,
    steps: ready.ready ? [
      { kind: 'DOWNLOAD_VERIFY', url: pin.url, sha256: pin.sha256, dest },
      { kind: 'USER', command: ['bash', dest, ...(pin.install_args_template || []).map((a) => (a === '<version>' ? pin.version : a))] },
      ...(pin.version ? [{ kind: 'VERSION_ASSERT', binary: item.binary, exact: pin.version }] : []),
    ] : [],
    owner_record: `download ${pin?.url} to a file, inspect it, record sha256 + the vendor version under pins["${item.pin_ref}"]`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

function releaseTarballAction({ item, pin }) {
  const arch = os.arch() === 'arm64' ? 'arm64' : os.arch() === 'x64' ? 'x64' : os.arch();
  const artifact = pin?.architectures?.[arch];
  const ready = pinReady(pin);
  const probe = versionProbe(item.binary, item.version_args || ['--version'], { exact: pin?.version || null });
  const dest = path.join(os.tmpdir(), `dial-${item.pin_ref}-${pin?.version || 'unpinned'}-${arch}.tar.xz`);
  return {
    id: `converge.${item.id}`, item: item.id, method: 'RELEASE_TARBALL_SHA256', package: item.pin_ref,
    pinned_version: pin?.version || null, architecture: arch,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready && Boolean(artifact),
    missing_pin: [...ready.missing, ...(artifact ? [] : [`architectures.${arch}`])], requires_root: false,
    steps: ready.ready && artifact ? [
      { kind: 'DOWNLOAD_VERIFY', url: artifact.url, sha256: artifact.sha256, dest },
      { kind: 'NODE_RELEASE_INSTALL', archive: dest, version: pin.version },
      { kind: 'VERSION_ASSERT', binary: item.binary, exact: pin.version },
    ] : [],
    owner_record: `record official node-v${pin?.version || '<version>'}-linux-${arch} SHASUMS256 under pins.node.architectures.${arch}`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

function binaryTarballAction({ item, pin }) {
  const arch = os.arch() === 'arm64' ? 'arm64' : os.arch() === 'x64' ? 'x64' : os.arch();
  const artifact = pin?.architectures?.[arch];
  const ready = pinReady(pin);
  const probe = versionProbe(item.binary, item.version_args || ['--version'], { exact: pin?.version || null });
  const dest = path.join(os.tmpdir(), `dial-${item.pin_ref}-${pin?.version || 'unpinned'}-${arch}.tar.gz`);
  return {
    id: `converge.${item.id}`, item: item.id, method: 'BINARY_TARBALL_SHA256', package: item.pin_ref,
    pinned_version: pin?.version || null, architecture: arch,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready && Boolean(artifact),
    missing_pin: [...ready.missing, ...(artifact ? [] : [`architectures.${arch}`])], requires_root: false,
    steps: ready.ready && artifact ? [
      { kind: 'DOWNLOAD_VERIFY', url: artifact.url, sha256: artifact.sha256, dest },
      { kind: 'BINARY_TARBALL_INSTALL', archive: dest, source_binary: pin.binary_path, binary: item.binary, aliases: pin.aliases || [] },
      { kind: 'VERSION_ASSERT', binary: item.binary, exact: pin.version },
    ] : [],
    owner_record: `record exact release archive URL/SHA-256 for ${item.id} under pins["${item.pin_ref}"]`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

function repoPinnedScriptAction({ item, pin }) {
  const ready = pinReady(pin);
  const probe = versionProbe(item.binary, item.version_args || ['--version'], { exact: pin?.version || null });
  const script = pin?.script ? path.resolve(process.cwd(), pin.script) : null;
  const steps = [];
  if (ready.ready) {
    steps.push({ kind: 'FILE_SHA256_ASSERT', file: script, sha256: pin.script_sha256 });
    if (pin.lockfile) steps.push({ kind: 'FILE_SHA256_ASSERT', file: path.resolve(process.cwd(), pin.lockfile), sha256: pin.lockfile_sha256 });
    if (pin.wrapper) steps.push({ kind: 'FILE_SHA256_ASSERT', file: path.resolve(process.cwd(), pin.wrapper), sha256: pin.wrapper_sha256 });
    if (pin.package && pin.integrity) steps.push({ kind: 'NPM_INTEGRITY_CHECK', package: pin.package, version: pin.version, integrity: pin.integrity });
    steps.push({ kind: 'USER', command: ['bash', script] });
    steps.push({ kind: 'VERSION_ASSERT', binary: item.binary, exact: pin.version });
  }
  return {
    id: `converge.${item.id}`, item: item.id, method: 'REPO_PINNED_SCRIPT', package: pin?.package || item.pin_ref, pinned_version: pin?.version || null,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready, missing_pin: ready.missing, requires_root: false,
    steps,
    owner_record: `record the reviewed repository installer path/hash and exact external release digests under pins["${item.pin_ref}"]`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source }, script },
  };
}

function sourceArchiveAction({ item, pin }) {
  const ready = pinReady(pin);
  const probe = versionProbe(item.binary, item.version_args || ['--version'], { exact: pin?.version || null });
  const dest = path.join(os.tmpdir(), `dial-${item.pin_ref}-${pin?.source_commit || 'unpinned'}.tar.gz`);
  return {
    id: `converge.${item.id}`, item: item.id, method: 'SOURCE_ARCHIVE_SHA256', package: item.pin_ref,
    pinned_version: pin?.version || null, source_commit: pin?.source_commit || null,
    needed: !(probe.installed && probe.satisfies), pin_ready: ready.ready, missing_pin: ready.missing, requires_root: false,
    steps: ready.ready ? [
      { kind: 'DOWNLOAD_VERIFY', url: pin.url, sha256: pin.sha256, dest },
      { kind: 'SOURCE_ARCHIVE_INSTALL', archive: dest, source_commit: pin.source_commit, command: pin.install_command },
      { kind: 'VERSION_ASSERT', binary: item.binary, exact: pin.version },
    ] : [],
    owner_record: `record an immutable Hermes release archive URL, exact source commit, SHA-256, exact version and deterministic non-editable install command under pins["${item.pin_ref}"]`,
    evidence: { probe: { installed: probe.installed, version: probe.version, location: probe.location, path_source: probe.path_source } },
  };
}

export function planConvergence({ manifest, role, pins = loadPins() } = {}) {
  const actions = [];
  const items = [...itemsForRole(manifest.packages, role), ...itemsForRole(manifest.runtimes, role)];
  for (const item of items) {
    if (role === 'provider-container' && ['pkg.', 'rt.'].some((p) => item.id.startsWith(p))) {
      // Provider containers are provider-managed: verify only, never install.
      actions.push({ id: `converge.${item.id}`, item: item.id, method: 'PROVIDER_MANAGED', needed: false, pin_ready: true, missing_pin: [], requires_root: false, state_hint: CONVERGE_STATES.NOT_APPLICABLE });
      continue;
    }
    if (item.readiness_class === 'REFERENCE_ONLY' || item.install_method === 'NONE' || item.install_method === 'PREINSTALLED' || item.install_method === 'REPO_LOCAL' || item.install_method === 'PROVIDER_MANAGED') continue;
    if (item.install_method === 'RELEASE_TARBALL_SHA256') { actions.push(releaseTarballAction({ item, pin: pins.pins[item.pin_ref] })); continue; }
    if (item.install_method === 'REPO_PINNED_SCRIPT') { actions.push(repoPinnedScriptAction({ item, pin: pins.pins[item.pin_ref] })); continue; }
    if (item.install_method === 'BINARY_TARBALL_SHA256') { actions.push(binaryTarballAction({ item, pin: pins.pins[item.pin_ref] })); continue; }
    if (item.install_method === 'SOURCE_ARCHIVE_SHA256') { actions.push(sourceArchiveAction({ item, pin: pins.pins[item.pin_ref] })); continue; }
    if (item.install_method === 'APT_PINNED') { const pkgName = String(item.pin_ref || '').replace(/^apt\./, ''); actions.push(aptPinnedAction({ item, pin: pins.pins.apt, pkgName })); continue; }
    if (item.install_method === 'APT_SIGNED_REPO') { actions.push(aptSignedRepoAction({ item, pin: pins.pins[item.pin_ref] })); continue; }
    if (item.install_method === 'NPM_EXACT') { actions.push(npmExactAction({ item, pin: pins.pins[item.pin_ref] })); continue; }
    if (item.install_method === 'INSTALLER_SHA256') { actions.push(installerSha256Action({ item, pin: pins.pins[item.pin_ref] })); continue; }
    actions.push({ id: `converge.${item.id}`, item: item.id, method: item.install_method, needed: false, pin_ready: false, missing_pin: ['unsupported install_method'], requires_root: false, state_hint: CONVERGE_STATES.FAILED });
  }
  return actions;
}

function execStep(step, { sudo, log }) {
  if (step.kind === 'DOWNLOAD_VERIFY') {
    const d = downloadToFile(step.url, step.dest);
    if (!d.ok) return { ok: false, step, error: `download failed: ${d.output || d.error}` };
    const actual = sha256File(step.dest);
    if (actual !== step.sha256) { try { fs.unlinkSync(step.dest); } catch {} return { ok: false, step, error: `sha256 mismatch: expected ${step.sha256} got ${actual}` }; }
    return { ok: true, step: { ...step, verified_sha256: actual } };
  }
  if (step.kind === 'FILE_SHA256_ASSERT') {
    if (!step.file || !fs.existsSync(step.file)) return { ok: false, step, error: `pinned file missing: ${step.file || '(none)'}` };
    const actual = sha256File(step.file);
    return actual === step.sha256 ? { ok: true, step: { ...step, verified_sha256: actual } } : { ok: false, step, error: `sha256 mismatch for ${step.file}: expected ${step.sha256} got ${actual}` };
  }
  if (step.kind === 'NPM_INTEGRITY_CHECK') {
    const v = run('npm', ['view', `${step.package}@${step.version}`, 'dist.integrity', '--json'], { timeoutMs: 60000 });
    let observed = null; try { observed = JSON.parse(v.output); } catch { observed = v.output.trim().replace(/^"|"$/g, ''); }
    if (!v.ok || observed !== step.integrity) return { ok: false, step, error: `npm integrity mismatch for ${step.package}@${step.version}: registry ${observed || '(none)'} != pin ${step.integrity}` };
    return { ok: true, step: { ...step, observed_integrity: observed } };
  }
  if (step.kind === 'VERSION_ASSERT') {
    const p = versionProbe(step.binary, ['--version'], { exact: step.exact });
    return p.installed && p.satisfies ? { ok: true, step: { ...step, observed: p.version } } : { ok: false, step, error: `post-install version ${p.version || 'absent'} != ${step.exact}` };
  }
  if (step.kind === 'BINARY_TARBALL_INSTALL') {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dial-binary-release-'));
    const extracted = run('tar', ['-xzf', step.archive, '-C', temp, '--no-same-owner', '--no-same-permissions'], { timeoutMs: 120000, env: { ...process.env, PATH: requiredServicePath() } });
    if (!extracted.ok) return { ok: false, step, error: extracted.output || extracted.error };
    const source = path.join(temp, step.source_binary || step.binary);
    if (!fs.existsSync(source)) return { ok: false, step, error: `release archive missing ${step.source_binary || step.binary}` };
    const binDir = path.join(os.homedir(), '.local', 'bin'); fs.mkdirSync(binDir, { recursive: true, mode: 0o755 });
    for (const name of [step.binary, ...(step.aliases || [])]) {
      const target = path.join(binDir, name); fs.copyFileSync(source, target); fs.chmodSync(target, 0o755);
    }
    return { ok: true, step: { ...step, install_dir: binDir } };
  }
  if (step.kind === 'NODE_RELEASE_INSTALL') {
    const prefix = path.join(os.homedir(), '.local');
    const target = path.join(prefix, 'lib', `node-v${step.version}`);
    fs.mkdirSync(target, { recursive: true, mode: 0o755 });
    const extracted = run('tar', ['-xJf', step.archive, '--strip-components=1', '-C', target], { timeoutMs: 120000, env: { ...process.env, PATH: requiredServicePath() } });
    if (!extracted.ok) return { ok: false, step, error: extracted.output || extracted.error };
    fs.mkdirSync(path.join(prefix, 'bin'), { recursive: true, mode: 0o755 });
    for (const binary of ['node', 'npm', 'npx', 'corepack']) {
      const source = path.join(target, 'bin', binary);
      if (!fs.existsSync(source)) continue;
      const link = path.join(prefix, 'bin', binary);
      try { fs.unlinkSync(link); } catch (error) { if (error.code !== 'ENOENT') return { ok: false, step, error: error.message }; }
      fs.symlinkSync(source, link);
    }
    return { ok: true, step: { ...step, install_prefix: target, service_path: requiredServicePath() } };
  }
  if (step.kind === 'SOURCE_ARCHIVE_INSTALL') {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), `dial-source-${step.source_commit.slice(0, 12)}-`));
    const extracted = run('tar', ['-xzf', step.archive, '--strip-components=1', '-C', sourceDir], { timeoutMs: 120000, env: { ...process.env, PATH: requiredServicePath() } });
    if (!extracted.ok) return { ok: false, step, error: extracted.output || extracted.error };
    const command = step.command.map((arg) => String(arg).replaceAll('<source-dir>', sourceDir));
    const installed = run(command[0], command.slice(1), { timeoutMs: 20 * 60 * 1000, env: { ...process.env, PATH: requiredServicePath() } });
    return installed.ok ? { ok: true, step: { ...step, command, source_dir: sourceDir } } : { ok: false, step, error: installed.output || installed.error };
  }
  if (step.kind === 'ROOT_WRITE') {
    if (!sudo.ok) return { ok: false, step, error: 'root required', owner_action: `sudo tee ${step.file} <<'EOF'\n${step.content}EOF` };
    const r = sudo.mode === 'root' ? (() => { fs.writeFileSync(step.file, step.content, { mode: 0o644 }); return { ok: true, command: `write ${step.file}` }; })() : run('sudo', ['-n', 'tee', step.file], { timeoutMs: 10000, input: step.content });
    return r.ok ? { ok: true, step } : { ok: false, step, error: r.output || r.error };
  }
  if (step.kind === 'ROOT' || step.kind === 'USER') {
    const argv = step.kind === 'ROOT' && sudo.mode === 'sudo' ? ['sudo', ['-n', '-E', ...step.command]] : [step.command[0], step.command.slice(1)];
    if (step.kind === 'ROOT' && !sudo.ok) return { ok: false, step, error: 'root required', owner_action: `sudo ${step.command.join(' ')}` };
    const r = run(argv[0], argv[1], { timeoutMs: 20 * 60 * 1000, env: { ...process.env, PATH: requiredServicePath(), DEBIAN_FRONTEND: 'noninteractive' } });
    log?.info?.(`converge.step`, { command: r.command, ok: r.ok });
    return r.ok ? { ok: true, step, output_tail: r.output.split('\n').slice(-3) } : { ok: false, step, error: r.output.split('\n').slice(-5).join(' | ') || r.error };
  }
  return { ok: false, step, error: `unknown step kind ${step.kind}` };
}

export function executeConvergence({ actions, dryRun = true, log = null } = {}) {
  const sudo = sudoAvailable();
  const results = [];
  for (const a of actions) {
    if (a.state_hint === CONVERGE_STATES.NOT_APPLICABLE) { results.push({ ...a, state: CONVERGE_STATES.NOT_APPLICABLE }); continue; }
    if (!a.needed) { results.push({ ...a, state: CONVERGE_STATES.CONVERGED }); log?.ok?.(a.id, { status: 'CONVERGED', message: `${a.item} already satisfies its pin/minimum` }); continue; }
    if (!a.pin_ready) { results.push({ ...a, state: CONVERGE_STATES.PIN_MISSING, owner_action: a.owner_record }); log?.warn?.(a.id, { status: 'PIN_MISSING', message: `refusing to install ${a.item}: pin material missing (${a.missing_pin.join(', ')})` }); continue; }
    if (dryRun) { results.push({ ...a, state: CONVERGE_STATES.PLANNED }); log?.warn?.(a.id, { status: 'PLANNED', message: a.item }); continue; }
    const steps = a.steps || (a.command ? [{ kind: a.requires_root ? 'ROOT' : 'USER', command: a.command }] : []);
    const executed = [];
    let state = CONVERGE_STATES.APPLIED;
    for (const step of steps) {
      const r = execStep(step, { sudo, log });
      executed.push(r);
      if (!r.ok) { state = r.owner_action ? CONVERGE_STATES.OWNER_ACTION_REQUIRED : CONVERGE_STATES.FAILED; break; }
    }
    results.push({ ...a, state, executed, owner_action: executed.find((e) => e.owner_action)?.owner_action || null });
    log?.[state === CONVERGE_STATES.APPLIED ? 'ok' : 'error']?.(a.id, { status: state, message: a.item });
  }
  return { sudo: sudo.mode, results };
}

// Repository-level supply-chain assertion: every required install item for the role has a supported pinned
// method and, for GREEN, pin material present. Reported by the certifier as supply.pinned-installers /
// supply.pins-declared.
export function supplyChainStatus({ manifest, role, pins = loadPins() } = {}) {
  const roleItems = [...itemsForRole(manifest.packages, role), ...itemsForRole(manifest.runtimes, role)];
  const byId = new Map(roleItems.map((item) => [item.id, item]));
  const actions = planConvergence({ manifest, role, pins });
  const unpinned_methods = roleItems.filter((i) => ['VENDOR_INSTALLER_UNPINNED', 'CURL_BASH', 'NPM_LATEST'].includes(i.install_method)).map((i) => i.id);
  const missing = actions.filter((a) => a.state_hint !== CONVERGE_STATES.NOT_APPLICABLE && !a.pin_ready).map((a) => ({ item: a.item, missing: a.missing_pin, owner_record: a.owner_record, readiness_class: byId.get(a.item)?.readiness_class || null, criticality: byId.get(a.item)?.criticality || null }));
  const isOptional = (entry) => entry.readiness_class === 'OPTIONAL_CAPABILITY' || entry.readiness_class === 'REFERENCE_ONLY' || entry.criticality === 'OPTIONAL';
  const pins_missing = missing.filter((entry) => !isOptional(entry));
  const optional_pins_missing = missing.filter(isOptional);
  return { unpinned_methods, pins_missing, optional_pins_missing, actions: actions.map((a) => ({ item: a.item, method: a.method, pin_ready: a.pin_ready, needed: a.needed, readiness_class: byId.get(a.item)?.readiness_class || null })) };
}
