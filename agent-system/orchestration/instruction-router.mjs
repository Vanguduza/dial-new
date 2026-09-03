import crypto from 'node:crypto';
import { classifyDevelopmentTask, evaluateDevelopmentAuthority, markComplexWorkPaused } from './development-policy.mjs';
import { electDevelopmentManager, loadDevelopmentManager } from './manager-router.mjs';
import { assertNoSecretMaterial } from './feature-memory.mjs';
import { appendJsonl, writeJsonAtomic } from './state-store.mjs';

function now() { return new Date().toISOString(); }
function instructionHash(instruction) {
  return crypto.createHash('sha256').update(String(instruction ?? ''), 'utf8').digest('hex');
}

export function routeHermesInstruction({
  instruction = '',
  task = {},
  selected_model_id = null,
  feature_id = null,
  worktree = null,
  atomic_unit = null,
  user_override = false,
  root,
} = {}) {
  // Instructions may be routed in-memory, but routing evidence never persists the
  // instruction body. Known credential patterns are rejected before any state write.
  assertNoSecretMaterial(instruction, 'Hermes development instruction');
  const classification = classifyDevelopmentTask(task);
  const eventBase = {
    instruction_sha256: instructionHash(instruction),
    classification,
    selected_model_id,
    at: now(),
  };

  if (classification === 'COMPLEX') {
    const directAuthority = selected_model_id ? evaluateDevelopmentAuthority({ selected_model_id, task, root, user_override }) : null;
    if (directAuthority?.allowed) {
      const decision = {
        route: 'DIRECT_SELECTED_MANAGER_CHAIR',
        classification,
        selected_model_id,
        authority: directAuthority.authority,
      };
      appendJsonl('events/instruction-routing.jsonl', { event: 'HERMES_INSTRUCTION_ROUTED', ...eventBase, ...decision }, root);
      return decision;
    }

    const election = electDevelopmentManager({ root, feature_id, worktree, atomic_unit, task });
    if (!election.elected) {
      const paused = markComplexWorkPaused({ reason: 'NO_QUALIFIED_MANAGER', task }, root);
      const decision = {
        route: 'COMPLEX_WORK_PAUSED',
        classification,
        reason: 'NO_QUALIFIED_MANAGER',
        state: paused.state,
      };
      writeJsonAtomic('state/pending-development-instruction.json', {
        schema_version: 1,
        instruction_sha256: eventBase.instruction_sha256,
        task,
        created_at: now(),
        authority: 'PENDING_QUALIFIED_MANAGER',
        note: 'Instruction body intentionally not persisted; recover mission text from approved higher-authority sources/session input.',
      }, root);
      appendJsonl('events/instruction-routing.jsonl', { event: 'HERMES_INSTRUCTION_PAUSED', ...eventBase, ...decision }, root);
      return decision;
    }
    const decision = {
      route: 'FORWARD_TO_MANAGER_CHAIR',
      classification,
      development_manager: {
        assignment_id: election.assignment.assignment_id,
        model_id: election.assignment.model_id,
        runtime_id: election.assignment.runtime_id,
      },
    };
    appendJsonl('events/instruction-routing.jsonl', { event: 'HERMES_INSTRUCTION_ROUTED', ...eventBase, ...decision }, root);
    return decision;
  }

  const decision = {
    route: 'BOUNDED_OR_DIRECT_CHAT',
    classification,
    selected_model_id,
    active_development_manager: loadDevelopmentManager(root)?.assignment_id ?? null,
  };
  appendJsonl('events/instruction-routing.jsonl', { event: 'HERMES_INSTRUCTION_ROUTED', ...eventBase, ...decision }, root);
  return decision;
}
