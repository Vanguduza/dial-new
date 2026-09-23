import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MAX_OUTPUT = 8 * 1024 * 1024;
const ALLOWED_TOOLS = new Set([
  'mobile_run_task',
  'mobile_manage_task',
  'mobile_get_device_state',
  'mobile_inspect_trace',
  'mobile_diagnose',
]);

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function artemisRootFromBinary(binary) {
  return path.resolve(path.dirname(binary), '../..');
}

export function artemisSubordinateConfig() {
  const binary = process.env.DIAL_ARTEMIS_BIN || '/opt/hermes-mobile-fabric/artemis/current/.venv/bin/artemis';
  const root = process.env.DIAL_ARTEMIS_ROOT || artemisRootFromBinary(binary);
  const python = process.env.DIAL_ARTEMIS_PYTHON || path.join(root, '.venv/bin/python');
  const bridge = process.env.DIAL_ARTEMIS_BRIDGE || path.join(repoRoot(), 'deploy/netcup/hermes-control/artemis/dial_artemis_mcp_bridge.py');
  const runner = process.env.DIAL_ARTEMIS_BRIDGE_RUNNER || python;
  return { binary, root, python, bridge, runner };
}

export function invokeArtemisSubordinate(tool, args = {}, { timeoutMs = 180000 } = {}) {
  if (!ALLOWED_TOOLS.has(tool)) throw new Error(`ARTEMIS tool is outside the Hermes subordinate allowlist: ${tool}`);
  const cfg = artemisSubordinateConfig();
  if (!fs.existsSync(cfg.bridge)) throw new Error(`Hermes ARTEMIS bridge missing: ${cfg.bridge}`);
  if (cfg.runner.includes(path.sep) && !fs.existsSync(cfg.runner)) throw new Error(`Hermes ARTEMIS bridge runner missing: ${cfg.runner}`);
  if (!fs.existsSync(cfg.root)) throw new Error(`ARTEMIS root missing: ${cfg.root}`);
  const raw = execFileSync(cfg.runner, [cfg.bridge, tool, cfg.root], {
    cwd: cfg.root,
    env: {
      ...process.env,
      ARTEMIS_STANDALONE: '1',
      ARTEMIS_TASK_INGRESS: 'dial-hermes-subordinate',
      DIAL_ARTEMIS_SUBORDINATE: '1',
    },
    input: JSON.stringify(args || {}),
    encoding: 'utf8',
    timeout: Math.min(Math.max(Number(timeoutMs) || 180000, 5000), 2700000),
    maxBuffer: MAX_OUTPUT,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let envelope;
  try { envelope = JSON.parse(raw); }
  catch { throw new Error(`Hermes ARTEMIS bridge returned invalid JSON: ${String(raw).slice(0, 2000)}`); }
  if (!envelope?.ok) throw new Error(String(envelope?.error || `ARTEMIS ${tool} failed`));
  return envelope.result;
}

export const ARTEMIS_SUBORDINATE_CAPABILITIES = Object.freeze({
  authority: 'HERMES_CONTROL_AUTHORITY',
  executor: 'ARTEMIS_SUBORDINATE',
  raw_upstream_mcp_exposed: false,
  upstream_tools_consumed_internally: [
    'mobile_run_task',
    'mobile_manage_task',
    'mobile_get_device_state',
    'mobile_inspect_trace',
    'mobile_diagnose',
  ],
  capabilities: {
    autonomous_cross_app_ui: true,
    flash_reactive_execution: true,
    pro_planned_execution: true,
    strict_checkpoint_verification: true,
    explorer_modes: ['flash', 'pro', 'ultra'],
    asynchronous_tasks: true,
    task_status_and_progress: true,
    midflight_instruction_injection: true,
    graceful_continuous_loop_release: true,
    force_stop: true,
    live_screenshot_observation: true,
    accessibility_ocr_ui_hierarchy: true,
    trace_summary: true,
    trace_search: true,
    per_step_screenshots_and_action_overlays: true,
    per_step_replay_details: true,
    logcat_and_adb_diagnostics: true,
    environment_diagnosis: true,
    safe_self_heal: true,
    credential_probe: true,
    end_to_end_device_probe: true,
    allowlisted_avd_launch: true,
    multi_device_parallelism: true,
    accessibility_helper_with_uiautomator_fallback: true,
    video_and_history_analysis_inside_artemis: true,
    long_horizon_and_continuous_monitoring: true,
  },
});
