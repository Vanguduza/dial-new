#!/usr/bin/env node
import { readOracleOperatorStatus } from '../orchestration/operator-status.mjs';

export const ORACLE_STATUS_PROMPT = /\b(status|anything\s+running|running\s+(?:now|right\s+now)|what(?:'s|\s+is)?\s+(?:running|happening|changed)|progress|mission|packet|oracle|resume|pause|prioriti[sz]e|approve|reject)\b/i;

function ageText(ageMs) {
  if (!Number.isFinite(ageMs)) return 'unknown age';
  if (ageMs < 60_000) return `${Math.max(0, Math.round(ageMs / 1000))}s old`;
  return `${Math.round(ageMs / 60_000)}m old`;
}

export function formatOracleStatusContext(result) {
  const invariant = [
    'DIAL runtime authority is the Oracle control plane, not the local Claude session.',
    'Local Claude-session counts, local tasks, local process lists, and a clean local Git tree are never evidence that autonomous DIAL development is idle.',
    'For a run-state answer, use this Oracle snapshot or the typed DIAL control MCP. If neither is fresh/available, say Oracle live status is unavailable from this client; do not infer idle.',
    'Mission mutations must use the typed DIAL control surface when available; never substitute local repository activity for Oracle mission control.',
  ];
  if (!result?.available) return [...invariant, `Oracle snapshot: unavailable (${result?.error || 'no status source'}).`].join('\n');

  const s = result.status;
  const active = s.mission?.active_packets?.map((p) => `${p.packet_id}:${p.state}`).join(', ') || 'none';
  return [
    ...invariant,
    `Oracle snapshot authority: ${s.authority}; source=${result.source}; fresh=${result.fresh}; ${ageText(result.age_ms)}; observed=${s.observed_at}.`,
    `Mission ${s.mission?.mission_id}: state=${s.mission?.state}; turn=${s.mission?.turn_number}; last_packet=${s.mission?.last_packet_id || 'none'}; last_packet_state=${s.mission?.last_packet_state || 'none'}; active_packets=${active}.`,
    `Queue: state=${s.orchestration?.queue_state || 'unknown'}; active_job=${s.orchestration?.active_job_id || 'none'}; queued=${s.orchestration?.queued ?? 'unknown'}.`,
    `Development gate: unblocked=${s.development?.unblocked}; state=${s.development?.state}; gate=${s.development?.gate_status || 'none'}; failed_checks=${(s.development?.failed_checks || []).join(',') || 'none'}.`,
    `Runtime: Sol=${s.runtime?.primary?.state || 'unknown'}; Sonnet=${s.runtime?.fallback?.state || 'unknown'}; research=${s.research?.state || 'unknown'} via ${s.research?.resolved_model || 'unknown'}.`,
  ].join('\n');
}
async function readStdin() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = await readStdin();
  let input = {};
  try { input = raw ? JSON.parse(raw) : {}; } catch {}
  const event = input.hook_event_name || process.env.DIAL_ORACLE_STATUS_HOOK_EVENT || 'UserPromptSubmit';
  const prompt = String(input.prompt || '');
  if (event === 'UserPromptSubmit' && !ORACLE_STATUS_PROMPT.test(prompt)) process.exit(0);
  const result = readOracleOperatorStatus({ repoDir: input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd() });
  const additionalContext = formatOracleStatusContext(result);
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext,
    },
  }));
}
