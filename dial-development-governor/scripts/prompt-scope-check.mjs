// UserPromptSubmit hook.
// Claude Code delivers hook input as JSON on stdin, not as an environment
// variable. The v2.0 version read process.env.CLAUDE_USER_PROMPT, which is
// never set, so the guard silently passed every prompt.
let input = '';
for await (const chunk of process.stdin) input += chunk;

let payload = {};
try { payload = JSON.parse(input); } catch { /* fall through to empty prompt */ }

const prompt = String(payload.prompt ?? payload.user_prompt ?? '');

// A bootstrap/audit/review prompt is legitimately repository-wide.
const scopeExempt = /\b(bootstrap|audit|review|drift|closure|canonicaliz)/i.test(prompt);

const unbounded = [
  /\bbuild\s+(all|everything|the\s+whole|the\s+entire)\b/i,
  /\bimplement\s+(all|everything|every\s+feature)\b/i,
  /\bfinish\s+the\s+(whole|entire)\s+(project|platform|system)\b/i,
  /\b(do|complete)\s+all\s+186\b/i,
];

if (!scopeExempt && unbounded.some((r) => r.test(prompt))) {
  console.error(
    'DIAL scope guard: this prompt is unbounded.\n' +
    'Resolve one or more Feature IDs (or state that this is bootstrap/audit work) before material edits.\n' +
    'Use: node agent-system/bin/context-get.mjs <FEATURE_ID>'
  );
  process.exit(2);
}
