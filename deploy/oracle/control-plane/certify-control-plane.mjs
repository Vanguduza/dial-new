#!/usr/bin/env node
import assert from 'node:assert/strict';
import { allowedOnHost, route } from './hybrid-router.mjs';
import { admit } from './guarded-command.mjs';
import { normalizeOwnerInstruction, workloadHint } from './owner-channel-adapter.mjs';

assert.equal(allowedOnHost('oracle-admin', 'HEAVY_BUILD'), false);
assert.equal(allowedOnHost('oracle-admin', 'TEST'), false);
assert.equal(allowedOnHost('oracle-admin', 'VEKL_LIGHT'), false);
assert.equal(allowedOnHost('oracle-admin', 'RECOVERY'), true);
assert.equal(allowedOnHost('oracle-admin-v2', 'VEKL_LIGHT'), true);
assert.equal(allowedOnHost('oracle-admin-v2', 'HEAVY_BUILD'), false);
assert.equal(allowedOnHost('dial-hermes-control', 'HEAVY_BUILD'), true);
assert.equal(route({ workload_class: 'HEAVY_BUILD', target_host: 'oracle-admin' }, { localHost: 'oracle-admin' }).target_host, 'dial-hermes-control');
assert.equal(route({ workload_class: 'VEKL_LIGHT' }, { localHost: 'oracle-admin' }).target_host, 'oracle-admin-v2');
assert.equal(admit({ command: 'npm run verify', source: 'COMMANDER', host: 'oracle-admin' }).decision, 'REFUSE');
assert.equal(admit({ command: 'uptime', source: 'COMMANDER', host: 'oracle-admin' }).decision, 'ALLOW');
assert.equal(admit({ command: 'some-unknown-tool --do-stuff', source: 'SSH', host: 'oracle-admin' }).reason, 'AMBIGUOUS_WORKLOAD_FAIL_CLOSED');
const owner = normalizeOwnerInstruction({ source: 'WHATSAPP', text: 'Run the full DIAL verification' });
assert.equal(owner.authority, 'OWNER');
assert.equal(workloadHint(owner), 'TEST');
console.log(JSON.stringify({ certification: 'GREEN', assertions: 13 }, null, 2));
