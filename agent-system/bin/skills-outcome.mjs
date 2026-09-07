#!/usr/bin/env node
import { recordSkillOutcome } from '../orchestration/skill-outcome-recorder.mjs';
const [activationId, packetId, outcome = 'UNASSESSED'] = process.argv.slice(2);
if (!activationId || !packetId) throw new Error('usage: skills-outcome.mjs <activation-id> <packet-id> [GREEN|RED|BLOCKED|UNASSESSED]');
console.log(JSON.stringify(recordSkillOutcome({ activationId, packetId, outcome }), null, 2));
