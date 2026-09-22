#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repo = process.env.DIAL_REPO_DIR || process.cwd();
const file = path.join(repo, 'ops/development-bootstrap/rev5.1/REV5_1_BOOTSTRAP_POLICY.json');
const phase = process.argv[2] || 'status';
if (!fs.existsSync(file)) {
  console.error('REV51_BOOTSTRAP_POLICY=MISSING');
  process.exit(2);
}
const p = JSON.parse(fs.readFileSync(file,'utf8'));
const required = ['Hermes','Codex','Claude','Antigravity','VEKL','Context7','Exa','xKiro','Groq','n8n DEV','Browser Fabric','Stagehand','Playwright','Stitch','explicit Figma','operator/status/truth MCP','recovery'];
const missing = required.filter((x)=>!p.capability_plan.preserve.includes(x));
if (missing.length) {
  console.error('REV51_BOOTSTRAP_POLICY=INVALID');
  console.error('missing_preserved='+missing.join(','));
  process.exit(3);
}
if (!Array.isArray(p.capability_plan.gap_triggered) || !p.capability_plan.gap_triggered.some((x)=>x.capability === 'Graphiti')) {
  console.error('REV51_BOOTSTRAP_POLICY=INVALID_GRAPHITI_STATE');
  process.exit(4);
}
if (!Array.isArray(p.capability_plan.conditional_required_gap_closure) ||
    !['Orca','Pullfrog'].every((x)=>p.capability_plan.conditional_required_gap_closure.includes(x))) {
  console.error('REV51_BOOTSTRAP_POLICY=INVALID_GAP_CLOSURE_STATE');
  process.exit(7);
}
if (p.gap_closure_policy?.rule !== 'IDENTIFIED_GAP_MUST_BE_COVERED' || p.gap_closure_policy?.no_prolonged_trials !== true) {
  console.error('REV51_BOOTSTRAP_POLICY=INVALID_OWNER_GAP_POLICY');
  process.exit(8);
}
if (p.capability_plan.add_after_exact_qualification.includes('LangWatch') !== true) {
  console.error('REV51_BOOTSTRAP_POLICY=INVALID_OBSERVABILITY_STATE');
  process.exit(5);
}
if (p.current_pack_state.build_ready !== false) {
  console.error('REV51_BOOTSTRAP_POLICY=UNEXPECTED_BUILD_READY');
  process.exit(6);
}
const out = {
  pack_id:p.source_pack.pack_id,
  phase,
  build_ready:p.current_pack_state.build_ready,
  research_open:p.current_pack_state.research_coverage.open,
  preserved:p.capability_plan.preserve,
  add_after_exact_qualification:p.capability_plan.add_after_exact_qualification,
  conditional_required_gap_closure:p.capability_plan.conditional_required_gap_closure,
  gap_triggered:p.capability_plan.gap_triggered,
  gap_closure_rule:p.gap_closure_policy.rule,
  blockers:p.current_pack_state.blockers
};
console.log(JSON.stringify(out,null,2));
