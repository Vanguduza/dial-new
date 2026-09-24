#!/usr/bin/env node
// Supply-chain pin watcher (DIAL, owner decision auth-20260924-owner-netcup-bootstrap-latest-pins-watch).
//
// For every PINS.json entry declared in WATCH.json it finds the newest stable upstream release within the
// pinned major, measures the verification material the converger enforces (npm integrity, release asset
// SHA-256, source archive SHA-256 bound to the tag commit, OCI digests), and records release notes and
// advisories as VEKL RELEASE_NOTES / SECURITY_ADVISORY references. With --apply it rewrites PINS.json and
// every declared consumer copy of the pin, regenerates bound npm lockfiles, and recomputes repository script
// hashes. Nothing is installed here; a change takes effect only through an owner-approved PR.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '../../..');
const PINS_PATH = path.join(HERE, 'PINS.json');
const WATCH_PATH = path.join(HERE, 'WATCH.json');

// ---------- version handling ----------
export function parseVersion(raw) {
  const s = String(raw || '').trim().replace(/^v/i, '');
  if (!/^\d+(\.\d+)*$/.test(s)) return null; // prereleases/build tags are never candidates
  return s.split('.').map(Number);
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}
// Returns the newest stable version in the current major and the newest stable overall.
export function selectVersions(available, current) {
  const cur = parseVersion(current);
  const stable = [...new Set(available)].filter((v) => parseVersion(v));
  stable.sort(compareVersions);
  const inMajor = cur ? stable.filter((v) => parseVersion(v)[0] === cur[0]) : [];
  return { inMajor: inMajor.at(-1) || null, newest: stable.at(-1) || null };
}

// GitHub advisory ranges: comma-separated comparators such as ">= 0.12.7, < 0.12.18" or "<= 0.9.5".
export function versionInRange(version, range) {
  const parts = String(range || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length || !parseVersion(version)) return false;
  return parts.every((part) => {
    const m = part.match(/^(<=|>=|<|>|=)?\s*v?(\S+)$/);
    if (!m || !parseVersion(m[2])) return false;
    const c = compareVersions(version, m[2]);
    return { '<': c < 0, '<=': c <= 0, '>': c > 0, '>=': c >= 0, '=': c === 0, undefined: c === 0 }[m[1]];
  });
}
export function advisoriesAffecting(advisories, version) {
  return (advisories || []).filter((a) => (a.vulnerable || []).some((r) => versionInRange(version, r))).map((a) => a.id);
}

// ---------- network ----------
const UA = { 'user-agent': 'dial-supply-chain-watch' };
function ghHeaders() {
  const h = { ...UA, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) h.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}
async function get(url, headers = UA) {
  const r = await fetch(url, { headers, redirect: 'follow' });
  if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
  return r;
}
const getJson = async (url, headers) => (await get(url, headers)).json();
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
async function sha256Url(url, headers) { return sha256(Buffer.from(await (await get(url, headers)).arrayBuffer())); }
const gh = (p) => getJson(`https://api.github.com${p}`, ghHeaders());

async function githubReleases(repo) {
  const rows = await gh(`/repos/${repo}/releases?per_page=100`);
  return rows.filter((r) => !r.draft && !r.prerelease && parseVersion(r.tag_name));
}
// Some projects tag by date (hermes-agent: tag v2026.9.21, name "Hermes Agent v0.21.4 (v2026.9.21)").
export function releaseVersion(rel, w) {
  if (w?.source?.version_from === 'release_name') {
    const m = String(rel.name || '').match(/\bv?(\d+\.\d+\.\d+(?:\.\d+)?)\b/);
    return m ? m[1] : null;
  }
  return String(rel.tag_name || '').replace(/^v/i, '');
}
function pickRelease(rels, pin, w) {
  const tagged = rels.map((r) => ({ r, v: releaseVersion(r, w) })).filter((x) => parseVersion(x.v));
  const { inMajor, newest } = selectVersions(tagged.map((x) => x.v), pin.version);
  if (!inMajor) throw new Error(`no stable release within the pinned major of ${pin.version} (newest ${newest || 'none'})`);
  return { inMajor, newest, rel: tagged.find((x) => x.v === inMajor).r };
}
function excerpt(text, n = 1500) { const t = String(text || '').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; }
async function releaseNotesFor(repo, version) {
  if (!repo) return null;
  for (const tag of [`v${version}`, version, `rust-v${version}`]) {
    try { const r = await gh(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`); return { url: r.html_url, excerpt: excerpt(r.body) }; } catch {}
  }
  return { url: `https://github.com/${repo}/releases`, excerpt: '' };
}
async function npmAdvisories(pkg, version) {
  try {
    const rows = await gh(`/advisories?ecosystem=npm&affects=${encodeURIComponent(`${pkg}@${version}`)}&per_page=50`);
    return rows.map((a) => ({ id: a.ghsa_id, severity: a.severity, summary: a.summary, url: a.html_url }));
  } catch (e) { return [{ id: 'LOOKUP_FAILED', severity: 'unknown', summary: String(e.message).slice(0, 200) }]; }
}
async function repoAdvisories(repo) {
  if (!repo) return [];
  try {
    const rows = await gh(`/repos/${repo}/security-advisories?state=published&per_page=50`);
    return rows.map((a) => ({ id: a.ghsa_id, severity: a.severity, summary: a.summary, url: a.html_url,
      vulnerable: (a.vulnerabilities || []).map((v) => v.vulnerable_version_range).filter(Boolean) }));
  } catch { return []; }
}

// ---------- resolvers: return { version, newest, set: {...pin fields}, tokens: [[old,new]...], notes, advisories } ----------
const resolvers = {
  async npm(pin, w) {
    const doc = await getJson(`https://registry.npmjs.org/${encodeURIComponent(w.source.package).replace('%40', '@')}`);
    const { inMajor, newest } = selectVersions(Object.keys(doc.versions || {}), pin.version);
    const integrity = doc.versions?.[inMajor]?.dist?.integrity;
    if (!integrity) throw new Error(`no dist.integrity for ${w.source.package}@${inMajor}`);
    const set = { version: inMajor, ...(pin.integrity ? { integrity } : {}) };
    const tokens = [[pin.version, inMajor], ...(pin.integrity ? [[pin.integrity, integrity]] : [])];
    return { version: inMajor, newest, set, tokens,
      advisories: await npmAdvisories(w.source.package, inMajor), notes: await releaseNotesFor(w.repository, inMajor) };
  },
  async claude_installer(pin, w) {
    const doc = await getJson(`https://registry.npmjs.org/${encodeURIComponent(w.source.version_package).replace('%40', '@')}`);
    const { inMajor, newest } = selectVersions(Object.keys(doc.versions || {}), pin.version);
    const installer = await sha256Url(pin.url);
    return { version: inMajor, newest, set: { version: inMajor, sha256: installer },
      tokens: [[pin.version, inMajor], [pin.sha256, installer]],
      advisories: await npmAdvisories(w.source.version_package, inMajor), notes: await releaseNotesFor(w.repository, inMajor) };
  },
  async node_dist(pin, w) {
    const index = await getJson('https://nodejs.org/dist/index.json');
    const { inMajor, newest } = selectVersions(index.map((r) => r.version.replace(/^v/i, '')), pin.version);
    const sums = await (await get(`https://nodejs.org/dist/v${inMajor}/SHASUMS256.txt`)).text();
    const architectures = {}; const tokens = [[pin.version, inMajor]];
    for (const [arch, plat] of Object.entries(w.source.arches)) {
      const file = `node-v${inMajor}-${plat}.tar.xz`;
      const line = sums.split('\n').find((l) => l.trim().endsWith(`  ${file}`));
      if (!line) throw new Error(`SHASUMS256 lacks ${file}`);
      const sum = line.split(/\s+/)[0];
      architectures[arch] = { url: `https://nodejs.org/dist/v${inMajor}/${file}`, sha256: sum };
      if (pin.architectures?.[arch]?.sha256) tokens.push([pin.architectures[arch].sha256, sum]);
    }
    return { version: inMajor, newest, set: { version: inMajor, architectures, source: `official Node.js v${inMajor} SHASUMS256.txt` }, tokens,
      advisories: [], notes: { url: (w.release_notes || '').replace('{version}', inMajor), excerpt: '' } };
  },
  async github_source_archive(pin, w) {
    const repo = w.source.repository;
    const rels = await githubReleases(repo);
    const { inMajor, newest, rel } = pickRelease(rels, pin, w);
    const commit = (await gh(`/repos/${repo}/commits/${encodeURIComponent(rel.tag_name)}`)).sha;
    const url = `https://codeload.github.com/${repo}/tar.gz/${commit}`;
    const archive = await sha256Url(url);
    const install_command = (pin.install_command || []).map((a) => (a === pin.source_commit ? commit : a));
    return { version: inMajor, newest, set: { version: inMajor, url, source_commit: commit, sha256: archive, install_command },
      tokens: [[pin.source_commit, commit], [pin.sha256, archive], [pin.version, inMajor]],
      advisories: await repoAdvisories(repo), notes: { url: rel.html_url, excerpt: excerpt(rel.body) } };
  },
  async github_release_assets(pin, w) {
    const repo = w.source.repository;
    const rels = await githubReleases(repo);
    const { inMajor, newest, rel } = pickRelease(rels, pin, w);
    const architectures = {}; const tokens = [[pin.version, inMajor]];
    for (const [arch, name] of Object.entries(w.source.assets)) {
      const asset = rel.assets.find((a) => a.name === name);
      if (!asset) throw new Error(`${repo} ${rel.tag_name} lacks asset ${name}`);
      const sum = await sha256Url(asset.browser_download_url);
      if (asset.digest && asset.digest !== `sha256:${sum}`) throw new Error(`${name} digest disagrees with GitHub (${asset.digest})`);
      architectures[arch] = { url: asset.browser_download_url, sha256: sum };
      if (pin.architectures?.[arch]?.sha256) tokens.push([pin.architectures[arch].sha256, sum]);
    }
    return { version: inMajor, newest, set: { version: inMajor, architectures }, tokens,
      advisories: await repoAdvisories(repo), notes: { url: rel.html_url, excerpt: excerpt(rel.body) } };
  },
  async github_release_asset(pin, w) {
    const repo = w.source.repository;
    const rels = await githubReleases(repo);
    const { inMajor, newest, rel } = pickRelease(rels, pin, w);
    const name = w.source.asset.replace('{version}', inMajor);
    const asset = rel.assets.find((a) => a.name === name);
    if (!asset) throw new Error(`${repo} ${rel.tag_name} lacks asset ${name}`);
    const sum = await sha256Url(asset.browser_download_url);
    if (asset.digest && asset.digest !== `sha256:${sum}`) throw new Error(`${name} digest disagrees with GitHub (${asset.digest})`);
    return { version: inMajor, newest, set: { version: inMajor, asset: name, url: asset.browser_download_url, sha256: sum },
      tokens: [[pin.version, inMajor], [pin.sha256, sum]],
      advisories: await repoAdvisories(repo), notes: { url: rel.html_url, excerpt: excerpt(rel.body) } };
  },
  async github_release_version(pin, w) {
    const repo = w.source.repository;
    const rels = await githubReleases(repo);
    const { inMajor, newest, rel } = pickRelease(rels, pin, w);
    return { version: inMajor, newest, set: { version: inMajor }, tokens: [[pin.version, inMajor]],
      advisories: await repoAdvisories(repo), notes: { url: rel.html_url, excerpt: excerpt(rel.body) } };
  },
  async ghcr_image(pin, w) {
    const image = w.source.image;
    const { token } = await getJson(`https://ghcr.io/token?scope=repository:${image}:pull`);
    const auth = { ...UA, authorization: `Bearer ${token}` };
    let tags = []; let next = `https://ghcr.io/v2/${image}/tags/list?n=1000`;
    while (next) {
      const r = await get(next, auth); tags = tags.concat((await r.json()).tags || []);
      const link = r.headers.get('link'); const m = link && link.match(/<([^>]+)>;\s*rel="next"/);
      next = m ? new URL(m[1], 'https://ghcr.io').href : null;
    }
    const { inMajor, newest } = selectVersions(tags.map((t) => t.replace(/^v/i, '')), pin.version);
    const tag = tags.find((t) => t.replace(/^v/i, '') === inMajor);
    const accept = 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json';
    const r = await get(`https://ghcr.io/v2/${image}/manifests/${tag}`, { ...auth, accept });
    const index = await r.json(); const multi = r.headers.get('docker-content-digest');
    const amd64 = (index.manifests || []).find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
    if (!multi || !amd64) throw new Error(`${image}:${tag} lacks a multi-platform index with linux/amd64`);
    return { version: tag, newest: newest && tags.find((t) => t.replace(/^v/i, '') === newest), set: { version: tag, x86_64_digest: amd64.digest, multi_platform_manifest_digest: multi },
      tokens: [[pin.version, tag], [pin.x86_64_digest, amd64.digest], [pin.multi_platform_manifest_digest, multi]],
      advisories: await repoAdvisories(w.source.repository), notes: await releaseNotesFor(w.source.repository, inMajor) };
  },
};

// ---------- apply ----------
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Replace exact tokens; versions only where not embedded in a longer version or hash.
export function replaceTokens(text, tokens) {
  let out = text; let count = 0;
  for (const [from, to] of tokens) {
    if (!from || !to || from === to) continue;
    // An optional v/V prefix (v22.23.2, node-v22.23.2-linux) belongs to the token and is preserved.
    const re = new RegExp(`(?<![0-9A-Za-z.])([vV]?)${escapeRe(from)}(?![0-9A-Za-z]|\\.[0-9])`, 'g');
    out = out.replace(re, (_m, v) => { count += 1; return v + to; });
  }
  return { text: out, count };
}
const HASHED_FIELDS = [['script', 'script_sha256'], ['wrapper', 'wrapper_sha256'], ['bridge', 'bridge_sha256'], ['lockfile', 'lockfile_sha256'], ['lock_file', 'package_lock_sha256']];
export function rehashRepoFiles(pins, repo = REPO) {
  const changed = [];
  for (const [name, pin] of Object.entries(pins)) {
    if (!pin || typeof pin !== 'object') continue;
    for (const [fileKey, hashKey] of HASHED_FIELDS) {
      if (!pin[fileKey] || !pin[hashKey]) continue;
      const abs = path.join(repo, pin[fileKey]);
      if (!fs.existsSync(abs)) continue;
      const now = sha256(fs.readFileSync(abs));
      if (now !== pin[hashKey]) { changed.push(`${name}.${hashKey}`); pin[hashKey] = now; }
    }
  }
  return changed;
}

export async function watch({ apply = false, only = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const pinsDoc = JSON.parse(fs.readFileSync(PINS_PATH, 'utf8'));
  const watchDoc = JSON.parse(fs.readFileSync(WATCH_PATH, 'utf8'));
  const report = { schema_version: 1, generated_at_utc: new Date().toISOString(), policy: watchDoc.policy, entries: [], files_changed: [] };
  const touched = new Set();
  for (const [name, w] of Object.entries(watchDoc.pins)) {
    if (only && !only.includes(name)) continue;
    const pin = pinsDoc.pins[name];
    const entry = { pin: name, current: pin?.version ?? null };
    report.entries.push(entry);
    if (!pin) { entry.action = 'ERROR'; entry.error = 'not in PINS.json'; continue; }
    if (w.source?.kind === 'none') { entry.action = 'REVIEW_REQUIRED'; entry.reason = w.review_reason; continue; }
    try {
      const r = await resolvers[w.source.kind](pin, w);
      Object.assign(entry, { candidate: r.version, newest_overall: r.newest, release_notes: r.notes, advisories: r.advisories });
      if (r.newest && r.version && compareVersions(r.newest, r.version) > 0 && parseVersion(r.newest)[0] !== parseVersion(r.version)[0]) {
        entry.newer_major = { version: r.newest, action: 'PROPOSE_ONLY', release_notes: await releaseNotesFor(w.repository || w.source.repository, String(r.newest).replace(/^v/i, '')) };
      }
      // npm advisories are queried for the exact candidate (affects=<pkg>@<version>), so any hit blocks it.
      // Repository advisories carry ranges this watcher does not evaluate; they are reported for review.
      const exactQuery = w.source.kind === 'npm' || w.source.kind === 'claude_installer';
      entry.advisories_fixed_by_candidate = advisoriesAffecting(r.advisories, pin.version).filter((id) => !advisoriesAffecting(r.advisories, r.version).includes(id));
      entry.advisories_affecting_candidate = advisoriesAffecting(r.advisories, r.version);
      const candidateAffected = (exactQuery && (r.advisories || []).some((a) => a.id !== 'LOOKUP_FAILED')) || entry.advisories_affecting_candidate.length > 0;
      if (!r.version || compareVersions(r.version, pin.version) <= 0) { entry.action = 'UP_TO_DATE'; continue; }
      if (!w.auto) { entry.action = 'REVIEW_REQUIRED'; entry.reason = w.review_reason; continue; }
      if (candidateAffected) { entry.action = 'BLOCKED_ADVISORY'; continue; }
      entry.action = apply ? 'UPDATED' : 'UPDATE_AVAILABLE';
      if (!apply) continue;
      Object.assign(pin, r.set, { pin_state: 'PINNED', evidence: `watch-pins ${today}: ${name} ${entry.current} -> ${r.version} within pinned major; verification material measured from the upstream artefact; release notes ${r.notes?.url || 'n/a'}` });
      entry.consumers = {};
      for (const rel of w.consumers || []) {
        const abs = path.join(REPO, rel);
        if (!fs.existsSync(abs)) { entry.consumers[rel] = 'MISSING'; continue; }
        const { text, count } = replaceTokens(fs.readFileSync(abs, 'utf8'), r.tokens);
        entry.consumers[rel] = count;
        if (count) { fs.writeFileSync(abs, text); touched.add(rel); }
      }
      if (w.npm_lock_dir) {
        execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: path.join(REPO, w.npm_lock_dir), stdio: 'pipe' });
        touched.add(path.join(w.npm_lock_dir, 'package-lock.json'));
      }
    } catch (e) {
      entry.action = 'ERROR'; entry.error = String(e.message || e).slice(0, 300);
    }
  }
  if (apply) {
    report.rehashed = rehashRepoFiles(pinsDoc.pins);
    fs.writeFileSync(PINS_PATH, `${JSON.stringify(pinsDoc, null, 2)}\n`);
    touched.add(path.relative(REPO, PINS_PATH));
  }
  report.files_changed = [...touched].sort();
  return report;
}

export function summaryMarkdown(report) {
  const adv = (e) => [e.advisories_fixed_by_candidate?.length ? `fixes ${e.advisories_fixed_by_candidate.join(', ')}` : '', e.advisories_affecting_candidate?.length ? `**affects candidate: ${e.advisories_affecting_candidate.join(', ')}**` : ''].filter(Boolean).join('; ') || '–';
  const rows = report.entries.map((e) => `| \`${e.pin}\` | ${e.current ?? '–'} | ${e.candidate ?? '–'} | ${e.action}${e.newer_major ? ` · newer major ${e.newer_major.version} (proposal)` : ''} | ${e.release_notes?.url ? `[notes](${e.release_notes.url})` : '–'} | ${adv(e)} |`);
  const review = report.entries.filter((e) => e.action === 'REVIEW_REQUIRED' || e.newer_major || e.action === 'ERROR' || e.action === 'BLOCKED_ADVISORY')
    .map((e) => `- \`${e.pin}\`: ${e.action === 'ERROR' ? `error: ${e.error}` : e.reason || (e.newer_major ? `newer major ${e.newer_major.version} available: review breaking changes at ${e.newer_major.release_notes?.url || 'release notes'} before moving the pin` : e.action)}`);
  return [
    '## Supply-chain pin watch',
    '',
    `Policy: newest stable release within the pinned major; newer majors are proposals only. Generated ${report.generated_at_utc}.`,
    '',
    '| Pin | Current | Candidate | Action | Release notes | Advisories |', '|---|---|---|---|---|---|', ...rows,
    '', '### Needs owner review', review.length ? review.join('\n') : '- nothing',
    '', `Files changed: ${report.files_changed.length ? report.files_changed.map((f) => `\`${f}\``).join(', ') : 'none'}`,
    '', 'Release notes and advisories are VEKL reference evidence, not authority. Merging this PR is the owner approval that lets the bootstrap converge to these pins.',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const report = await watch({ apply: args.includes('--apply'), only: val('--only')?.split(',') || null });
  const out = val('--report'); if (out) fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  const md = val('--summary'); if (md) fs.writeFileSync(md, `${summaryMarkdown(report)}\n`);
  console.log(summaryMarkdown(report));
  if (report.entries.some((e) => e.action === 'ERROR') && args.includes('--strict')) process.exit(2);
}
