#!/usr/bin/env node
import { engineeringKnowledgeStatus } from '../orchestration/engineering-knowledge-broker.mjs';
const packetId = process.argv[2] || process.env.DIAL_PACKET_ID || null;
console.log(JSON.stringify(engineeringKnowledgeStatus({ repoDir: process.env.DIAL_REPO_DIR || process.cwd(), packetId }), null, 2));
