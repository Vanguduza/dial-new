import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression guards for the failure classes that made the 2026-09-12 recovery take a
 * day. Each one cost a round trip with a live operator on a phone, and each is a
 * pattern rather than a one-off typo, so each is checked by pattern.
 *
 * See docs/orchestration/DIAL_ORACLE_RECOVERY_METHODS.md, "What went wrong".
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['deploy/oracle/provisioning', 'deploy/oracle/resource-fabric'];

function shellScripts() {
  const out = [];
  for (const d of DIRS) {
    const abs = path.join(ROOT, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (f.endsWith('.sh')) out.push({ rel: path.join(d, f), abs: path.join(abs, f) });
    }
  }
  return out;
}
const read = (p) => fs.readFileSync(p, 'utf8');
const lines = (p) => read(p).split('\n');

describe('shell scripts are syntactically valid', () => {
  for (const { rel, abs } of shellScripts()) {
    it(rel, () => {
      expect(() => execFileSync('bash', ['-n', abs], { encoding: 'utf8' })).not.toThrow();
    });
  }
});

describe('pipefail cannot silently double a value', () => {
  // `grep` exits 1 on no match; with `set -o pipefail` the whole pipeline fails even
  // though the tail of it already produced good output, and a trailing `|| echo '[]'`
  // then APPENDS a second value. "[]\n[]" is a valid jq stream but not a single JSON
  // value, so `--argjson` rejects it and the caller gets an empty body. A healthy host
  // was the failing case, because grep matched nothing precisely when nothing was wrong.
  it('no pipeline both produces output and falls back with || echo', () => {
    const offenders = [];
    for (const { rel, abs } of shellScripts()) {
      lines(abs).forEach((line, i) => {
        if (/^\s*#/.test(line)) return; // prose about the bug is not the bug
        if (/\|\s*(jq|awk|sed|sort)\b/.test(line) && /\|\|\s*echo\s+'/.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('grep whose no-match is a normal outcome is neutralised', () => {
    const offenders = [];
    for (const { rel, abs } of shellScripts()) {
      lines(abs).forEach((line, i) => {
        if (/^\s*#/.test(line)) return;
        // A grep mid-pipeline inside a command substitution must not be able to fail
        // the pipeline: wrap it as `{ grep … || true; }`.
        if (/\$\(.*\|\s*grep\b/.test(line) && !/\{\s*grep[^}]*\|\|\s*true;\s*\}/.test(line)) {
          offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('remote calls cannot hang forever', () => {
  // ConnectTimeout bounds the handshake, never the remote command. A remote program
  // that does not exit stalls the caller silently and indefinitely.
  it('every ssh in run.sh is bounded, except the interactive pairing call', () => {
    const p = path.join(ROOT, 'deploy/oracle/provisioning/run.sh');
    const src = read(p);
    const fn = src.slice(src.indexOf('ssh_host()'), src.indexOf('diagnose()'));
    expect(fn).toMatch(/timeout "\$\{DIAL_SSH_TIMEOUT/);
    // The pairing call is deliberately unbounded: it waits on a human in a browser.
    const pairFn = src.slice(src.indexOf('pair()'), src.indexOf('repair()'));
    expect(pairFn).toMatch(/deliberately NOT wrapped in/i);
  });
});

describe('no tool is executed merely to read its version', () => {
  // `desktop-commander --version` is not a supported flag: an unrecognised argument
  // falls through to the MCP stdio server, which waits on stdin forever.
  it('desktop-commander is never invoked with --version', () => {
    const offenders = [];
    for (const { rel, abs } of shellScripts()) {
      if (/desktop-commander['" ]*\s+--version/.test(read(abs))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe('jq is not asked to decide emptiness', () => {
  // jq's exit status for "no output at all" is version-dependent: 1.7 exits 4, older
  // builds exit 0. Cloud Shell ships an older one, so a guard resting on that admitted
  // an empty body and the real failure surfaced several steps later.
  it('a file is tested with -s before jq -e validates it', () => {
    const p = path.join(ROOT, 'deploy/oracle/provisioning/run.sh');
    expect(read(p)).toMatch(/\[\[ -s "\$tmp" \]\] && jq -e/);
  });
});

describe('scripts invoked by path are executable in git', () => {
  // install-recovery-peer.sh called install-host.sh directly while it was committed
  // 100644, so recovery-peer staging failed with "Permission denied" on every host.
  it('every .sh referenced for direct execution has mode 100755', () => {
    const modes = new Map(
      execFileSync('git', ['ls-files', '-s', ...DIRS], { cwd: ROOT, encoding: 'utf8' })
        .trim().split('\n').filter(Boolean)
        .map((l) => { const [m, , , f] = l.split(/\s+/); return [f, m]; }));

    const offenders = [];
    for (const { rel, abs } of shellScripts()) {
      for (const line of lines(abs)) {
        // "$SOMEDIR/name.sh" at the start of a command, not preceded by bash/sh/source.
        const m = line.match(/^\s*"\$[A-Za-z_][A-Za-z0-9_]*\/([a-z0-9-]+\.sh)"/);
        if (!m) continue;
        for (const [file, mode] of modes) {
          if (file.endsWith(`/${m[1]}`) && mode !== '100755') {
            offenders.push(`${rel} executes ${file} which is mode ${mode}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('certification can never report an empty body', () => {
  it('host-certify validates its report and falls back to a structured RED', () => {
    const src = read(path.join(ROOT, 'deploy/oracle/provisioning/host-certify.sh'));
    expect(src).toMatch(/report="\$\(jq -n/);
    expect(src).toMatch(/could not build its report/);
    expect(src).toMatch(/builder_error/);
  });
});
