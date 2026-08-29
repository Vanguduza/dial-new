// PostToolUse hook.
// The Claude Code v2 Operating Model requires PostToolUse to "record changed
// paths / affected Feature IDs". The v2.0 plugin declared no PostToolUse hook
// at all, so nothing was ever recorded and evidence had to be reconstructed
// by hand at the end of a session.
import fs from 'node:fs';
import path from 'node:path';

let input = '';
for await (const chunk of process.stdin) input += chunk;

let payload = {};
try { payload = JSON.parse(input); } catch { process.exit(0); }

const tool = payload.tool_name ?? '';
if (!['Edit', 'Write', 'NotebookEdit'].includes(tool)) process.exit(0);

const filePath = String(payload.tool_input?.file_path ?? '');
if (!filePath) process.exit(0);

const repoRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const relative = path.relative(repoRoot, filePath).replaceAll('\\', '/');

// Resolve affected Feature IDs from the source-path map when one exists.
let featureIds = [];
try {
  const map = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'agent-system/registries/SOURCE_PATH_MAP.json'), 'utf8'),
  );
  featureIds = map
    .filter((entry) => (entry.source_paths ?? []).some((p) => relative.startsWith(p)))
    .map((entry) => entry.feature_id);
} catch { /* map is optional until CT-6 task 10 lands */ }

const logDir = path.join(repoRoot, 'agent-system/checkpoints');
fs.mkdirSync(logDir, { recursive: true });
fs.appendFileSync(
  path.join(logDir, 'CHANGED_PATHS.jsonl'),
  `${JSON.stringify({
    at: new Date().toISOString(),
    tool,
    path: relative,
    feature_ids: featureIds,
  })}\n`,
  'utf8',
);
