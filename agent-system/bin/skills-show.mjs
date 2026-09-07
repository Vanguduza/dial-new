#!/usr/bin/env node
import { readSkillSnapshotBody } from '../orchestration/engineering-knowledge-broker.mjs';
const skillId = process.argv[2];
if (!skillId) throw new Error('usage: skills-show.mjs <skill-id>');
console.log(JSON.stringify(readSkillSnapshotBody(skillId, { repoDir: process.env.DIAL_REPO_DIR || process.cwd() }), null, 2));
