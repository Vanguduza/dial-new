#!/usr/bin/env node
import fs from "node:fs";
import { executeHermesInstruction } from "./hermes-runtime-executor.mjs";
import { loadProviderRegistry } from "./execution-fabric/provider-registry.mjs";
import { loadHostRole } from "./execution-fabric/host-role.mjs";
import { admitAndSign, recordFabricAudit } from "./execution-fabric/dispatch.mjs";
import { loadPrivateKey, loadPublicKey } from "./execution-fabric/venue-decision.mjs";
import { ROUTER_ACTIONS, PROVIDER_OUTCOMES } from "./execution-fabric/constants.mjs";
import { classifyProviderFailure } from "./execution-fabric/failure-class.mjs";

const PROVIDER_ACTIONS = new Set([
  ROUTER_ACTIONS.DISPATCH_PROVIDER,
  ROUTER_ACTIONS.RETRY_PROVIDER,
  ROUTER_ACTIONS.SWITCH_PROVIDER,
]);

function bounded(value, max = 4000) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function paths(root) {
  const control = root || process.env.DIAL_CONTROL_HOME || "/var/lib/dial-control";
  return {
    control,
    registry: process.env.DIAL_PROVIDER_REGISTRY || "/etc/dial/provider-registry.json",
    role: process.env.DIAL_HOST_ROLE_FILE || "/etc/dial/host-role",
    privateKey: `${control}/secrets/venue-ed25519.pem`,
    publicKey: `${control}/secrets/venue-ed25519.pub`,
    heartbeat: `${control}/state/venue-guard.json`,
    audit: `${control}/execution/fabric-audit.jsonl`,
  };
}

export function buildHermesExecutionUnit({ packetId, requestedBy, controlPlaneFacts } = {}) {
  return {
    unit_id: packetId || `hermes-${Date.now()}`,
    requested_by: requestedBy || "hermes.control",
    work_class: "PROJECT",
    control_plane_facts: controlPlaneFacts && typeof controlPlaneFacts === "object" ? controlPlaneFacts : {},
  };
}

export function admitHermesExecution({ packetId, requestedBy, controlPlaneFacts, providerAttempts = [], root } = {}) {
  const p = paths(root);
  const unit = buildHermesExecutionUnit({ packetId, requestedBy, controlPlaneFacts });
  const registry = loadProviderRegistry(p.registry);
  const hostRole = loadHostRole(p.role);
  const privateKey = loadPrivateKey(fs.readFileSync(p.privateKey, "utf8"));
  const publicKey = loadPublicKey(fs.readFileSync(p.publicKey, "utf8"));
  const result = admitAndSign({
    unit,
    registry,
    hostRole,
    attempts: providerAttempts,
    privateKey,
    publicKey,
    heartbeatPath: p.heartbeat,
  });
  recordFabricAudit({
    auditPath: p.audit,
    unit,
    route: result.route,
    decision: result.decision,
    result: result.admission.ok ? "ADMITTED" : "REJECTED",
  });
  return { ...result, unit, registry, hostRole, paths: p };
}

function providerIdForRuntime(runtime) {
  if (runtime === "codex_app_server") return "codex.cloud";
  if (runtime === "claude_code") return "claude.remote";
  return null;
}

export function providerAttemptsFromHermesResult(result) {
  const attempts = [];
  const primary = result?.primary;
  if (primary) {
    const provider_id = "codex.cloud";
    if (primary.ok) {
      attempts.push({ provider_id, outcome: PROVIDER_OUTCOMES.SUCCESS, observed_reason: "Hermes Codex provider turn completed" });
    } else {
      const classified = classifyProviderFailure({
        outcome: primary.state === "ACCOUNT_LIMITED" || primary.state === "RATE_LIMITED" || primary.state === "MODEL_LIMITED" || primary.state === "AUTH_FAILED"
          ? PROVIDER_OUTCOMES.UNAVAILABLE : undefined,
        observed_reason: primary.skip_reason || primary.state || primary.stderr_tail || result?.reason,
        stderr: primary.stderr_tail,
      });
      attempts.push({ provider_id, outcome: classified.class, observed_reason: bounded(classified.observed_reason) });
    }
  }
  if (result?.fallback_used) {
    const provider_id = "claude.remote";
    if (result?.event === "HERMES_OPERATIONAL_TURN_COMPLETED" && result?.runtime === "claude_code") {
      attempts.push({ provider_id, outcome: PROVIDER_OUTCOMES.SUCCESS, observed_reason: "Hermes Claude provider fallback completed" });
    } else {
      const classified = classifyProviderFailure({ observed_reason: result?.reason || result?.failure_state || "Claude fallback failed" });
      attempts.push({ provider_id, outcome: classified.class, observed_reason: bounded(classified.observed_reason) });
    }
  } else if (!primary && result?.runtime) {
    const provider_id = providerIdForRuntime(result.runtime);
    if (provider_id) attempts.push({ provider_id, outcome: result?.event === "HERMES_OPERATIONAL_TURN_COMPLETED" ? PROVIDER_OUTCOMES.SUCCESS : PROVIDER_OUTCOMES.UNAVAILABLE, observed_reason: result?.reason || result?.event });
  }
  return attempts;
}

function rejectedEvent(admission, startedAt = new Date().toISOString()) {
  return {
    event: "HERMES_OPERATIONAL_TURN_FAILED",
    authority: "HERMES_RUNTIME_ONLY",
    policy: "PROVIDER_FIRST_EXECUTION_FABRIC",
    runtime: null,
    requested_model: null,
    resolved_model: null,
    fallback_used: false,
    failure_state: "EXECUTION_FABRIC_REJECTED",
    reason: bounded(admission?.admission?.reason || admission?.route?.visible_failure || "EXECUTION_FABRIC_REJECTED"),
    fabric_route: admission?.route || null,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  };
}

export async function executeProviderFirstHermesInstruction({
  repoDir,
  instruction = "",
  root,
  packetId = null,
  projectSlug = process.env.DIAL_PROJECT_SLUG || 'dial',
  skillActivation = null,
  requestedBy = "hermes.control",
  controlPlaneFacts = null,
  commanderAuthority = null,
  hermesExecutor = executeHermesInstruction,
} = {}) {
  const startedAt = new Date().toISOString();
  let admission;
  try {
    admission = admitHermesExecution({ packetId, requestedBy, controlPlaneFacts, root });
  } catch (error) {
    return rejectedEvent({ admission: { reason: `FABRIC_PREFLIGHT_ERROR:${bounded(error?.message || error)}` }, route: null }, startedAt);
  }

  if (!admission.admission?.ok) return rejectedEvent(admission, startedAt);
  if (!PROVIDER_ACTIONS.has(admission.route?.action)) {
    return rejectedEvent({ ...admission, admission: { ok: false, reason: `LOCAL_VENUE_REQUIRES_EXPLICIT_EXECUTOR:${admission.route?.action || "UNKNOWN"}` } }, startedAt);
  }

  const result = await hermesExecutor({ repoDir, instruction, root, projectSlug, packetId, skillActivation, commanderAuthority });
  const attempts = providerAttemptsFromHermesResult(result);
  let postRoute = null;
  if (attempts.length) {
    try {
      const post = admitHermesExecution({ packetId, requestedBy, controlPlaneFacts, providerAttempts: attempts, root });
      postRoute = post.route;
    } catch (error) {
      postRoute = { action: ROUTER_ACTIONS.FAIL, visible_failure: `FABRIC_POST_AUDIT_ERROR:${bounded(error?.message || error)}` };
    }
  }
  return { ...result, fabric_route: admission.route, fabric_provider_attempts: attempts, fabric_post_route: postRoute };
}
