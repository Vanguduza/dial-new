import path from 'node:path';
import {
  readCapabilityEvidence,
} from './providers/google/external-capability-core.mjs';
import {
  qualifyAntigravity,
} from './providers/google/antigravity-adapter.mjs';
import {
  qualifyStitch,
} from './providers/google/stitch-adapter.mjs';
import {
  ingestPomelliExport,
  qualifyPomelliWorkstation,
  recordPomelliHumanSessionAttestation,
} from './providers/google/pomelli-workstation.mjs';

const repoDir = process.env.DIAL_REPO_DIR || process.cwd();
const root = process.env.DIAL_CONTROL_HOME || path.join(repoDir, '.dial-control-test');
const [command = 'status', provider = null, ...rest] = process.argv.slice(2);
const ids = {
  antigravity: 'DEV-ANTIGRAVITY',
  stitch: 'DESIGN-STITCH',
  pomelli: 'CREATIVE-POMELLI',
};

function print(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function arg(name) {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : null;
}
if (command === 'status') {
  const selected = provider ? [provider] : Object.keys(ids);
  print(Object.fromEntries(selected.map((name) => {
    if (!ids[name]) throw new Error(`unknown provider ${name}`);
    return [name, readCapabilityEvidence(root, ids[name]) || { status: 'NO_EVIDENCE' }];
  })));
} else if (command === 'qualify') {
  if (provider === 'antigravity') {
    print(await qualifyAntigravity({ repoDir, root }));
  } else if (provider === 'stitch') {
    print(await qualifyStitch({ root }));
  } else if (provider === 'pomelli') {
    print(qualifyPomelliWorkstation({ root }));
  } else {
    throw new Error('qualify requires antigravity, stitch or pomelli');
  }
} else if (command === 'pomelli-attest') {
  print(recordPomelliHumanSessionAttestation({ root, actor: arg('--actor') || 'owner' }));
} else if (command === 'pomelli-ingest') {
  const filePath = arg('--file');
  if (!filePath) throw new Error('pomelli-ingest requires --file');
  print(ingestPomelliExport({
    filePath,
    root,
    sourceUrl: arg('--source-url'),
    actor: arg('--actor') || 'owner',
    containsCommercialClaim: rest.includes('--commercial-claim'),
  }));
} else {
  throw new Error(`unknown command ${command}`);
}
