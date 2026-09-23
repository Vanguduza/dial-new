#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { submitOwnerSteer } from './owner-steering-broker.mjs';

function sha(value) { return crypto.createHash('sha256').update(String(value ?? '')).digest('hex'); }
function now() { return new Date().toISOString(); }

export function runningUnderOwnerCommander({
  cgroupText = null,
  expectedUnit = 'dial-owner-commander-remote.service',
} = {}) {
  const text = cgroupText ?? (() => {
    try { return fs.readFileSync('/proc/self/cgroup', 'utf8'); }
    catch { return ''; }
  })();
  return text.includes(expectedUnit);
}

export function buildDesktopCommanderOwnerProvenance({ instruction, requestId }) {
  const text = String(instruction ?? '').trim();
  if (!text) throw new Error('instruction is required');
  return {
    authority: 'OWNER_EXPLICIT',
    instruction_sha256: sha(text),
    instruction_excerpt: text.slice(0, 500),
    request_id: requestId,
    channel: 'desktop_commander',
    actor: 'chatgpt-owner',
    transport: 'dial-owner-commander-remote',
    owner_attested: true,
    observed_at: now(),
  };
}

async function main() {
  const instruction = process.argv.slice(2).join(' ').trim();
  if (!instruction) throw new Error('usage: dial-owner-hermes <instruction>');
  if (!runningUnderOwnerCommander() && process.env.DIAL_ALLOW_OWNER_COMMANDER_DISPATCH_TEST !== '1') {
    throw new Error('REFUSE: dial-owner-hermes must be invoked through dial-owner-commander-remote.service');
  }

  const requestId = `desktop-commander-${crypto.randomUUID()}`;
  const provenance = buildDesktopCommanderOwnerProvenance({ instruction, requestId });
  const result = submitOwnerSteer({
    instruction,
    requestedBy: 'desktop_commander:chatgpt-owner',
    requestId,
    ownerProvenance: provenance,
    root: process.env.DIAL_CONTROL_HOME,
  });
  process.stdout.write(`${JSON.stringify({
    accepted: true,
    steer_id: result.steer_id,
    sequence: result.sequence,
    state: result.state,
    request_id: requestId,
    authority: provenance.authority,
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
