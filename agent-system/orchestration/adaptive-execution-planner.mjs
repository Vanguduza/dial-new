#!/usr/bin/env node
import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import { DEFAULT_CONTROL_HOME,readJson,writeJsonAtomic,appendJsonl } from './state-store.mjs';import { classifyTask } from './task-triage.mjs';import { createTaskExecutionEnvelope } from './task-execution-envelope.mjs';import { compileFrontendDesignExecutionPacket } from './frontend-design-execution-packet.mjs';import { loadHarnessCards,selectHcxWorkers } from './harness-capability-exchange.mjs';import { performanceFor } from './harness-performance-ledger.mjs';import { selectExecutionTopology } from './execution-topology.mjs';import { reserveCompute } from './compute-governor.mjs';import { buildRoleContextProjection } from './role-context-projector.mjs';import { loadSkillActivationForPacket } from './skill-activation-store.mjs';import { loadKnowledgeResolutionTrace } from './knowledge-resolution-trace.mjs';import { loadRuntimeHealth } from './runtime-health.mjs';
import { readCapabilityEvidence } from './providers/google/external-capability-core.mjs';
const here=path.dirname(new URL(import.meta.url).pathname);const DEFAULT_REPO=path.resolve(here,'../..');function now(){return new Date().toISOString();}
function budget(repoDir,klass){const p=JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/COMPUTE_BUDGET_POLICY.json'),'utf8'));const b=p.classes?.[klass];if(!b)throw new Error(`unknown compute budget class: ${klass}`);return{...b,budget_class:klass,policy_version:p.policy_version};}
function topologyPolicy(repoDir){return JSON.parse(fs.readFileSync(path.join(repoDir,'agent-system/registries/EXECUTION_TOPOLOGY_POLICY.json'),'utf8'));}
function overlayCards(cards, root, archetype) {
  const health = loadRuntimeHealth(root).runtimes || {};
  const availability = readJson('state/model-availability.json', { models: {}, harnesses: {} }, root) || { models: {}, harnesses: {} };
  return cards.flatMap((card) => {
    let slot = null;
    if (card.harness_family === 'codex-app-server') slot = health.codex_app_server;
    if (card.harness_family === 'claude-code') slot = health.claude_code;

    if (card.harness_family === 'antigravity-cli') {
      const evidence = readCapabilityEvidence(root, 'DEV-ANTIGRAVITY');
      const authenticated = evidence?.authentication?.verified === true;
      const discovered = Object.entries(availability.models || {})
        .filter(([, probe]) => probe?.harness_id === 'antigravity'
          && probe?.subscription_source === 'google-subscription'
          && probe?.subscription_present === true
          && probe?.availability !== 'UNAVAILABLE')
        .sort(([a], [b]) => a.localeCompare(b));
      if (!authenticated || discovered.length === 0) {
        const identity = card.identity?.worker_identity_hash || card.harness_id;
        return [{
          ...card,
          qualification: { ...card.qualification, state: 'DISCOVERED', evidence_hash: null },
          operational: { ...card.operational, health_state: 'UNKNOWN', observed_at: evidence?.observed_at || null },
          performance: performanceFor({ root, workerIdentityHash: identity, archetype }),
        }];
      }
      return discovered.map(([modelId, probe]) => {
        const workerIdentityHash = `${card.identity?.worker_identity_hash || 'antigravity-worker'}:${modelId}`;
        return {
          ...card,
          model: {
            model_id: modelId,
            provider_family: probe.provider_family || 'google',
            model_lineage_id: modelId,
            discovery_source: probe.discovered_by || 'ANTIGRAVITY_MODEL_DISCOVERY',
          },
          identity: { ...card.identity, worker_identity_hash: workerIdentityHash },
          qualification: {
            ...card.qualification,
            state: 'QUALIFIED',
            evidence_hash: evidence?.evidence_hash || probe.capability_fingerprint || null,
          },
          operational: {
            ...card.operational,
            health_state: ['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(probe.health_state) ? probe.health_state : 'UNKNOWN',
            quota_state: probe.quota_state || 'UNKNOWN',
            observed_at: probe.observed_at || evidence?.observed_at || null,
          },
          performance: performanceFor({ root, workerIdentityHash, archetype }),
        };
      });
    }

    let qualification = card.qualification;
    let operationalState = { ...card.operational };
    if (card.harness_family === 'stitch') {
      const evidence = readCapabilityEvidence(root, 'DESIGN-STITCH');
      const live = ['LIVE_QUALIFIED', 'ORCHESTRATED', 'INTEGRATED'].includes(evidence?.status);
      qualification = { ...qualification, state: live ? 'QUALIFIED' : 'DISCOVERED', evidence_hash: live ? evidence?.evidence_hash : null };
      operationalState = { ...operationalState, health_state: live ? 'HEALTHY' : 'UNKNOWN', observed_at: evidence?.observed_at || null };
    }
    const identity = card.identity?.worker_identity_hash || card.harness_id;
    return [{
      ...card,
      qualification,
      operational: { ...operationalState, ...(slot ? { health_state: slot.state, observed_at: slot.observed_at } : {}) },
      performance: performanceFor({ root, workerIdentityHash: identity, archetype }),
    }];
  });
}
function roleFor(triage){if(['NEW_FRONTEND_DESIGN','DONOR_ADAPTATION','LOCKED_DESIGN_ENHANCEMENT','VISUAL_REGRESSION'].includes(triage.archetype))return'FRONTEND_BUILDER';return'BUILDER';}
export function planAdaptiveExecution({repoDir=DEFAULT_REPO,root=DEFAULT_CONTROL_HOME,packetId,instruction='',budgetClass='S',allowedPaths=[],deniedPaths=[],toolGrants=['filesystem','git','test-runner'],networkAllowlist=[],dataClass='INTERNAL_SAFE_FOR_APPROVED_PROVIDER',ownerAuthorityRef=null}={}){if(!packetId)throw new Error('packetId required');const activation=loadSkillActivationForPacket(packetId,root);if(!activation?.knowledge_context?.unit_lineage_id)throw new Error('current Unit-scoped VEKL activation required');const trace=loadKnowledgeResolutionTrace(packetId,root);if(!trace)throw new Error('current KnowledgeResolutionTrace required');const pointer=readJson(`knowledge/graph/units/${activation.knowledge_context.unit_lineage_id}/current.json`,null,root);if(!pointer)throw new Error('current Unit map pointer required');const unitMap=readJson(pointer.map_rel,null,root);if(!unitMap)throw new Error('current Unit map required');const triage=classifyTask({unitMap,instruction,affectedPaths:allowedPaths});const b=budget(repoDir,budgetClass);const top=selectExecutionTopology({triage,budget:b,policy:topologyPolicy(repoDir)});if(!top.ok)throw new Error(top.reason);const taskId=`task_${crypto.randomUUID().replaceAll('-','')}`;const fdep=triage.frontend_routing?.applicable?compileFrontendDesignExecutionPacket({repoDir,root,taskId,unitMap,triage,instruction,affectedPaths:allowedPaths,ownerAuthorityRef}):null;const requiredCount=top.topology==='COMPETITIVE_CELL'?2:1;const role=roleFor(triage);const cards=overlayCards(loadHarnessCards(repoDir),root,triage.archetype);const routing=selectHcxWorkers({cards,triage,role,dataClass,count:requiredCount});if(!routing.ok)throw new Error('NO_ELIGIBLE_HCX_WORKER_COMPOSITION');const reservation=reserveCompute({root,taskId,budget:b,estimatedInputTokens:Math.min(24000,b.max_input_tokens_total),estimatedOutputTokens:Math.min(8000,b.max_output_tokens_total),workers:Math.max(requiredCount,top.topology==='WORKER_VERIFIER'?2:1)});if(!reservation.ok)throw new Error(reservation.reason);const envelope=createTaskExecutionEnvelope({repoDir,root,taskId,packetId,unitMap,activationManifest:activation,knowledgeResolutionTraceHash:trace.trace_hash,triage,budget:b,ownerAuthorityRef,allowedPaths,deniedPaths,toolGrants,networkAllowlist,frontendDesignExecutionPacket:fdep});const projections={};for(const w of routing.selected_workers){const r=role;projections[`${w.identity?.worker_identity_hash||w.harness_id}:${r}`]=buildRoleContextProjection({root,packetId,taskId,role:r,krtHash:trace.trace_hash});}const plan={schema_version:1,task_id:taskId,packet_id:packetId,envelope_hash:envelope.envelope_hash,frontend_design_execution_packet_hash:fdep?.content_hash||null,triage,compute:{budget:b,reservation:reservation.reservation},topology:top.topology,routing:{...routing,selected_workers:routing.selected_workers.map((w)=>({harness_id:w.harness_id,worker_identity_hash:w.identity?.worker_identity_hash,independence_class:w.identity?.independence_class,provider:w.provider,model:w.model}))},role_projections:projections,created_at:now()};writeJsonAtomic(`execution/tasks/${taskId}/plan.json`,plan,root);appendJsonl('events/adaptive-execution.jsonl',{event:'ADAPTIVE_EXECUTION_PLANNED',task_id:taskId,packet_id:packetId,topology:top.topology,fdep_hash:fdep?.content_hash||null,at:now()},root);return plan;}
if(import.meta.url===`file://${process.argv[1]}`){const packet=process.argv[2];const instruction=process.argv.slice(3).join(' ');console.log(JSON.stringify(planAdaptiveExecution({packetId:packet,instruction}),null,2));}
