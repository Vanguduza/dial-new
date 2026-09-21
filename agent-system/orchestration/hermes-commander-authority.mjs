import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJsonl } from './state-store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = path.resolve(here, '../..');
const REGISTRY_REL = 'agent-system/registries/HERMES_COMMANDER_AUTOMATION_REGISTRY.json';

function now() { return new Date().toISOString(); }

export function loadHermesCommanderRegistry(repoDir = DEFAULT_REPO) {
  const target = path.join(repoDir, REGISTRY_REL);
  const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
  if (parsed?.authority !== 'HERMES' || parsed?.schema_version !== 1) {
    throw new Error('invalid Hermes Commander automation registry');
  }
  return parsed;
}

export function commanderTarget(commanderId, repoDir = DEFAULT_REPO) {
  return loadHermesCommanderRegistry(repoDir).targets.find((entry) => entry.commander_id === commanderId) ?? null;
}

export function decideHermesCommanderUse({
  source,
  commanderId,
  toolName,
  automationId = null,
  ownerAttested = false,
  ownerApproval = false,
  repoDir = DEFAULT_REPO,
} = {}) {
  const registry = loadHermesCommanderRegistry(repoDir);
  const target = registry.targets.find((entry) => entry.commander_id === commanderId);
  const base = {
    source: source ?? null,
    commander_id: commanderId ?? null,
    tool_name: toolName ?? null,
    automation_id: automationId,
    target_host: target?.host ?? null,
    capability_surface: target?.capability_surface ?? null,
  };

  if (!target) return { ...base, decision: 'REFUSE', reason: 'UNKNOWN_COMMANDER_TARGET' };
  if (target.capability_surface !== 'FULL') return { ...base, decision: 'REFUSE', reason: 'COMMANDER_NOT_FULL_CAPABILITY' };
  if (registry.normal_control_exclusions.includes(target.host)) {
    return { ...base, decision: 'REFUSE', reason: 'HOST_EXCLUDED_FROM_NORMAL_HERMES_COMMANDER_CONTROL' };
  }
  if (!String(toolName || '').trim()) return { ...base, decision: 'REFUSE', reason: 'TOOL_NAME_REQUIRED' };

  if (source === 'OWNER_EXPLICIT') {
    if (!ownerAttested) return { ...base, decision: 'REFUSE', reason: 'OWNER_ATTESTATION_REQUIRED' };
    return { ...base, decision: 'ALLOW', reason: 'OWNER_EXPLICIT_FULL_COMMANDER_AUTHORITY' };
  }

  if (source !== 'DESIGNED_AUTOMATION') {
    return { ...base, decision: 'REFUSE', reason: 'SOURCE_NOT_OWNER_OR_REGISTERED_AUTOMATION' };
  }

  const automation = registry.automations.find((entry) => entry.automation_id === automationId && entry.enabled);
  if (!automation) return { ...base, decision: 'REFUSE', reason: 'AUTOMATION_NOT_REGISTERED_OR_DISABLED' };
  if (!automation.targets.includes(commanderId)) return { ...base, decision: 'REFUSE', reason: 'AUTOMATION_TARGET_NOT_AUTHORIZED' };
  if (!automation.allowed_tools.includes(toolName)) return { ...base, decision: 'REFUSE', reason: 'AUTOMATION_TOOL_NOT_AUTHORIZED' };
  if (automation.owner_approval_required && !ownerApproval) {
    return { ...base, decision: 'OWNER_APPROVAL_REQUIRED', reason: 'AUTOMATION_REQUIRES_OWNER_APPROVAL' };
  }

  return { ...base, decision: 'ALLOW', reason: 'REGISTERED_DESIGNED_AUTOMATION' };
}

export function recordHermesCommanderDecision(decision, root) {
  const event = {
    event: 'HERMES_COMMANDER_AUTHORITY_DECISION',
    ...decision,
    at: now(),
  };
  appendJsonl('events/hermes-commander-authority.jsonl', event, root);
  return event;
}
