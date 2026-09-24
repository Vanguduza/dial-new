import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { compareVersions, parseVersion, rehashRepoFiles, releaseVersion, replaceTokens, selectVersions, summaryMarkdown } from '../ops/development-bootstrap/supply-chain/watch-pins.mjs';

const repoDir = path.resolve(import.meta.dirname, '..');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

describe('supply-chain pin watcher', () => {
  it('treats prereleases as non-candidates and compares numerically', () => {
    expect(parseVersion('1.2.0-rc.1')).toBeNull();
    expect(parseVersion('v0.4.21.1')).toEqual([0, 4, 21, 1]);
    expect(compareVersions('0.153.10', '0.153.9')).toBeGreaterThan(0);
  });

  it('selects the newest stable release inside the pinned major and reports newer majors separately', () => {
    const r = selectVersions(['22.23.2', '22.23.3', '22.24.0-rc.1', '24.1.0', '26.10.0'], '22.23.2');
    expect(r).toEqual({ inMajor: '22.23.3', newest: '26.10.0' });
    expect(selectVersions(['0.153.1', '0.156.1', '1.0.0'], '0.153.1').inMajor).toBe('0.156.1');
  });

  it('reads the product version from the release name for date-tagged projects', () => {
    const w = { source: { version_from: 'release_name' } };
    expect(releaseVersion({ tag_name: 'v2026.9.21', name: 'Hermes Agent v0.21.4 (v2026.9.21)' }, w)).toBe('0.21.4');
    expect(releaseVersion({ tag_name: 'v2.337.0', name: 'v2.337.0' }, {})).toBe('2.337.0');
  });

  it('replaces exact tokens, including v-prefixed versions, but never longer versions or hashes', () => {
    const text = 'NODE="22.23.2" node-v22.23.2-linux v22.23.2 122.23.2 22.23.21 22.23.2.1 x22.23.2 aa11';
    const { text: out, count } = replaceTokens(text, [['22.23.2', '22.23.3'], ['aa11', 'bb22']]);
    expect(count).toBe(4);
    expect(out).toBe('NODE="22.23.3" node-v22.23.3-linux v22.23.3 122.23.2 22.23.21 22.23.2.1 x22.23.2 bb22');
  });

  it('recomputes repository script hashes that consumers changed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwatch-'));
    fs.writeFileSync(path.join(dir, 'install.sh'), 'VERSION=2\n');
    const pins = { tool: { script: 'install.sh', script_sha256: sha('VERSION=1\n') } };
    expect(rehashRepoFiles(pins, dir)).toEqual(['tool.script_sha256']);
    expect(pins.tool.script_sha256).toBe(sha('VERSION=2\n'));
    expect(rehashRepoFiles(pins, dir)).toEqual([]);
  });

  it('declares a watch entry for every pin and never auto-applies the patched Desktop Commander runtime', () => {
    const pins = JSON.parse(fs.readFileSync(path.join(repoDir, 'ops/development-bootstrap/supply-chain/PINS.json'), 'utf8')).pins;
    const watch = JSON.parse(fs.readFileSync(path.join(repoDir, 'ops/development-bootstrap/supply-chain/WATCH.json'), 'utf8'));
    expect(Object.keys(watch.pins).sort()).toEqual(Object.keys(pins).sort());
    expect(watch.policy).toMatchObject({ select: 'LATEST_STABLE_WITHIN_PINNED_MAJOR', newer_major: 'PROPOSE_ONLY', prereleases: false });
    expect(watch.pins['@wonderwhy-er/desktop-commander'].auto).toBe(false);
    for (const w of Object.values(watch.pins)) for (const c of w.consumers || []) expect(fs.existsSync(path.join(repoDir, c)), c).toBe(true);
  });

  it('keeps every repository-pinned installer hash in step with its file', () => {
    const pins = JSON.parse(fs.readFileSync(path.join(repoDir, 'ops/development-bootstrap/supply-chain/PINS.json'), 'utf8')).pins;
    expect(rehashRepoFiles(structuredClone(pins), repoDir)).toEqual([]);
  });

  it('summarises newer majors and review-required pins for the owner', () => {
    const md = summaryMarkdown({ generated_at_utc: 'T', files_changed: [], entries: [
      { pin: 'node', current: '22.23.2', candidate: '22.23.3', action: 'UPDATED', newer_major: { version: '26.10.0', release_notes: { url: 'u' } } },
      { pin: 'x', current: '1', action: 'REVIEW_REQUIRED', reason: 'patched' },
    ] });
    expect(md).toContain('newer major 26.10.0 (proposal)');
    expect(md).toContain('- `x`: patched');
  });
});
