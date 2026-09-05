#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { controlScreenFactory, ensureScreenFactory, screenFactoryStatus } from './screen-factory.mjs';
import { readJson } from './state-store.mjs';
import { contractReadiness } from './screen-factory-design-policy.mjs';
import { storageConfig, storageStatus } from './screen-factory-storage.mjs';

const HOST = process.env.DIAL_SCREEN_FACTORY_HOST || '127.0.0.1';
const PORT = Number(process.env.DIAL_SCREEN_FACTORY_PORT || 9121);
const WORKER_SERVICE = 'dial-health-screen-factory.service';

function json(res, value, code = 200) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}
function systemdUserEnv() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const runtime = process.env.XDG_RUNTIME_DIR || (uid !== null ? `/run/user/${uid}` : null);
  return {
    ...process.env,
    ...(runtime ? { XDG_RUNTIME_DIR: runtime, DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || `unix:path=${runtime}/bus` } : {}),
  };
}
function safeService(action) {
  if (!['start', 'stop'].includes(action)) throw new Error('invalid service action');
  try { execFileSync('systemctl', ['--user', action, WORKER_SERVICE], { timeout: 15000, stdio: 'ignore', env: systemdUserEnv() }); return true; }
  catch { return false; }
}
function manifest() { return readJson('screen-factory/manifest.json', { tasks: [], batches: [], platform_packages: [] }); }
function workerServiceState() {
  try { return String(execFileSync('systemctl', ['--user', 'is-active', WORKER_SERVICE], { encoding: 'utf8', timeout: 2500, env: systemdUserEnv() })).trim() || 'unknown'; }
  catch (error) { return String(error?.stdout || '').trim() || 'inactive'; }
}
function platformProgress(m) {
  const groups = new Map();
  for (const task of m.tasks || []) {
    if (String(task.platform_policy || 'REQUIRED') !== 'REQUIRED') continue;
    const key = `${task.business_unit}::${task.platform}`;
    const g = groups.get(key) || { key, business_unit: task.business_unit, platform: task.platform, total: 0, complete: 0, contract_ready: 0, implementation_ready: 0, materialized: 0 };
    g.total += 1;
    if (['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)) g.complete += 1;
    if (contractReadiness(task).ready) g.contract_ready += 1;
    if (task.implementation_ready === true && ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)) g.implementation_ready += 1;
    if (task.status === 'COMPLETE' && task.asset_path && fs.existsSync(task.asset_path)) g.materialized += 1;
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({ ...g, percent: g.total ? Number(((g.complete / g.total) * 100).toFixed(2)) : 0, contract_percent: g.total ? Number(((g.contract_ready / g.total) * 100).toFixed(2)) : 0 }));
}
function recentFactoryEvents(limit = 14) {
  try {
    const target = path.join(process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control', 'events/screen-factory.jsonl');
    if (!fs.existsSync(target)) return [];
    const parsed = fs.readFileSync(target, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return { event: 'UNPARSEABLE_EVENT' }; } });
    let resetIndex = -1;
    for (let i = parsed.length - 1; i >= 0; i -= 1) { if (/RESET/.test(String(parsed[i]?.event || ''))) { resetIndex = i; break; } }
    const currentEpoch = resetIndex >= 0 ? parsed.slice(resetIndex) : parsed;
    // Dashboard view is operational, not a raw log tail: collapse repeated retries while
    // preserving the append-only JSONL evidence on disk. This prevents a single fault
    // from flooding the UI and makes the root reason visible.
    const collapsed = new Map();
    for (let i = currentEpoch.length - 1; i >= 0; i -= 1) {
      const e = currentEpoch[i] || {};
      const identity = e.task_id || e.batch_id || e.screen_id || e.action || '';
      const key = `${e.event || 'Factory event'}::${identity}`;
      if (!collapsed.has(key)) collapsed.set(key, { ...e, repeat_count: 1 });
      else collapsed.get(key).repeat_count += 1;
      if (collapsed.size >= limit) break;
    }
    return [...collapsed.values()];
  } catch { return []; }
}
function taskSummary(task) {
  return {
    task_id: task.task_id, screen_id: task.screen_id, title: task.title,
    business_unit: task.business_unit, platform: task.platform,
    platform_policy: task.platform_policy, status: task.status,
    basic_qa: task.basic_qa, visual_qa: task.visual_qa, approved: Boolean(task.approved), implementation_ready: task.implementation_ready === true,
    generation_attempts: task.generation_attempts, asset_available: Boolean(task.asset_path && fs.existsSync(task.asset_path)),
    external_asset_registered: task.external_evidence?.verified === true,
    external_filename: task.external_evidence?.filename || null,
    external_sha256: task.external_evidence?.sha256 || null,
    last_error: task.last_error || null,
  };
}
function taskList() { return manifest().tasks.map(taskSummary); }

function sendFile(res, target, downloadName, mime = 'application/octet-stream', cleanup = false) {
  if (!target || !fs.existsSync(target)) return json(res, { error: 'artifact not found' }, 404);
  const stat = fs.statSync(target);
  res.writeHead(200, {
    'content-type': mime, 'content-length': stat.size,
    'content-disposition': downloadName ? `attachment; filename="${downloadName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"` : 'inline',
    'cache-control': 'no-store',
  });
  if (cleanup) res.once('finish', () => { try { fs.rmSync(target, { force: true }); } catch {} });
  fs.createReadStream(target).pipe(res);
}
function materializeRemotePackage(record) {
  const st = storageStatus();
  if (st.r2?.state !== 'SYNCED') return null;
  const cfg = storageConfig();
  const bin = '/home/ubuntu/.local/bin/rclone';
  if (!fs.existsSync(bin) || !fs.existsSync(cfg.rclone_config)) return null;
  const cache = path.join(process.env.DIAL_CONTROL_HOME || '/var/lib/dial-control', 'screen-factory', 'download-cache');
  fs.mkdirSync(cache, { recursive: true, mode: 0o700 });
  const target = path.join(cache, `${record.package_id}.zip`);
  const remote = `${cfg.r2_remote}:dial-health-screen-factory/v2/platform-packs/${record.package_id}.zip`;
  try { execFileSync(bin, ['copyto', remote, target, '--config', cfg.rclone_config, '--transfers', '1', '--checkers', '2'], { timeout: 30 * 60_000, stdio: 'ignore' }); return target; }
  catch { try { fs.rmSync(target, { force: true }); } catch {} return null; }
}
async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') return json(res, screenFactoryStatus());
  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const m = manifest(); const status = screenFactoryStatus();
    const request = readJson('screen-factory/requests/current.json', null);
    const recent_tasks = m.tasks.filter((task) => ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)).slice(-80).map(taskSummary);
    const byId = new Map(m.tasks.map((task) => [task.task_id, task]));
    const currentTasks = (request?.tasks || []).map((item) => byId.get(item.task_id) || item);
    const complete_count = currentTasks.filter((task) => ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)).length;
    const current_batch = request ? { batch_id: request.batch_id, expected_count: request.expected_count || currentTasks.length, complete_count, prepared_at: request.prepared_at } : { batch_id: null, expected_count: 0, complete_count: 0 };
    return json(res, { server_time: new Date().toISOString(), status, worker_service: workerServiceState(), batches: m.batches || [], platform_packages: m.platform_packages || [], platform_progress: platformProgress(m), current_batch, current_ping: request ? { ping_type: request.ping_type, batch_id: request.batch_id, business_unit: request.business_unit, platform: request.platform, expected_count: request.expected_count, hermes_role: request.hermes_role, design_boundary: request.design_boundary, functional_message: request.functional_message, tasks: request.tasks, prepared_at: request.prepared_at } : null, recent_events: recentFactoryEvents(), recent_tasks });
  }
  if (req.method === 'GET' && url.pathname === '/api/tasks') {
    let tasks = taskList();
    if (url.searchParams.get('completed') === '1') tasks = tasks.filter((task) => ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status));
    const limit = Math.max(0, Math.min(500, Number(url.searchParams.get('limit') || 0)));
    if (limit) tasks = tasks.slice(-limit);
    return json(res, { tasks });
  }
  if (req.method === 'GET' && url.pathname === '/api/batches') return json(res, { batches: manifest().batches || [] });
  if (req.method === 'GET' && url.pathname === '/api/platform-packages') return json(res, { platform_packages: manifest().platform_packages || [] });
  if (req.method === 'GET' && url.pathname === '/api/request') return json(res, readJson('screen-factory/requests/current.json', null));
  if (req.method === 'GET' && url.pathname === '/api/ping') {
    const request = readJson('screen-factory/requests/current.json', null);
    if (!request) return json(res, { ping_type: null, message: 'No functional generation ping is currently prepared.' });
    return json(res, {
      ping_type: request.ping_type, batch_id: request.batch_id, business_unit: request.business_unit, platform: request.platform,
      expected_count: request.expected_count, hermes_role: request.hermes_role, design_boundary: request.design_boundary,
      functional_message: request.functional_message, tasks: request.tasks, prepared_at: request.prepared_at,
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/current-batch') {
    const request = readJson('screen-factory/requests/current.json', null);
    if (!request) return json(res, { batch_id: null, expected_count: 0, complete_count: 0, tasks: [] });
    const byId = new Map(taskList().map((task) => [task.task_id, task]));
    const tasks = (request.tasks || []).map((item) => byId.get(item.task_id) || item);
    const complete_count = tasks.filter((task) => ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)).length;
    return json(res, { batch_id: request.batch_id, expected_count: request.expected_count || tasks.length, complete_count, prepared_at: request.prepared_at, tasks });
  }
  const control = url.pathname.match(/^\/api\/(play|resume|pause|stop)$/);
  if (req.method === 'POST' && control) {
    const action = control[1];
    const status = controlScreenFactory(action);
    let serviceAction = 'unchanged', serviceOk = true;
    if (action === 'play' || action === 'resume') { serviceAction = 'start'; serviceOk = safeService('start'); }
    if (action === 'stop') serviceAction = 'cooperative_stop_requested';
    const workerAfter = workerServiceState();
    if (['play','resume'].includes(action) && (!serviceOk || workerAfter !== 'active')) return json(res, { ...screenFactoryStatus(), worker_service_action: serviceAction, worker_service: workerAfter, error: 'worker service failed to start' }, 503);
    return json(res, { ...status, worker_service_action: serviceAction, worker_service: workerAfter });
  }
  const platformPackage = url.pathname.match(/^\/api\/platform-packages\/([^/]+)\/download$/);
  if (req.method === 'GET' && platformPackage) {
    const found = (manifest().platform_packages || []).find((item) => item.package_id === decodeURIComponent(platformPackage[1]));
    if (!found || found.state !== 'COMPLETE') return json(res, { error: 'platform package is not complete' }, 409);
    const local = found.zip_path && fs.existsSync(found.zip_path) ? found.zip_path : null;
    const target = local || materializeRemotePackage(found);
    if (!target) return json(res, { error: 'platform package is complete but durable storage is not currently reachable' }, 503);
    return sendFile(res, target, `${found.package_id}.zip`, 'application/zip', !local);
  }
  const preview = url.pathname.match(/^\/api\/screens\/([^/]+)\/preview$/);
  if (req.method === 'GET' && preview) {
    const task = manifest().tasks.find((item) => item.task_id === decodeURIComponent(preview[1]));
    if (!task?.asset_path) return json(res, { error: 'screen preview not found' }, 404);
    return sendFile(res, task.asset_path, null, 'image/png');
  }
  return json(res, { error: 'not found' }, 404);
}

const DASHBOARD = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Dial Health Screen Factory</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102033;background:#f5f8fa;--navy:#102033;--navy2:#19324d;--teal:#0f766e;--teal2:#14b8a6;--green:#15803d;--blue:#2563eb;--amber:#b45309;--red:#b91c1c;--muted:#64748b;--line:#dbe5ea;--soft:#eef5f6;--card:#fff;--radius:20px;--shadow:0 10px 32px rgba(15,35,55,.065)}
*{box-sizing:border-box}html{background:#f5f8fa;max-width:100%;overflow-x:hidden}body{margin:0;background:linear-gradient(180deg,#eef7f6 0,#f8fafc 290px,#f5f8fa 100%);min-height:100vh;overflow-x:hidden}.wrap{max-width:1540px;margin:auto;padding:20px 22px 42px}.topbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.14em;font-weight:850;color:var(--teal)}h1{font-size:30px;line-height:1.08;margin:5px 0 5px;letter-spacing:-.03em}.subtitle{color:var(--muted);font-size:13px;max-width:780px;line-height:1.55}.controlbox{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.btn,button{appearance:none;border:1px solid #cbd8df;background:#fff;color:var(--navy);border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer;min-height:42px;display:inline-flex;align-items:center;justify-content:center;gap:7px;text-decoration:none}.btn:hover,button:hover{border-color:#94a8b5;box-shadow:0 4px 14px rgba(15,35,55,.07)}button:disabled{opacity:.42;cursor:not-allowed;box-shadow:none}.play{background:var(--teal);border-color:var(--teal);color:#fff}.danger{color:var(--red)}.ghost{background:#f8fafc}.download{background:#eff6ff;color:#1d4ed8;border-color:#bfdbfe}.statusline{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.badge{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:rgba(255,255,255,.86);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;color:#425466}.badge .dot{width:8px;height:8px;border-radius:50%;background:#94a3b8}.badge.live .dot{background:#10b981;box-shadow:0 0 0 4px #d1fae5}.badge.warn .dot{background:#f59e0b}.badge.stop .dot{background:#64748b}.badge.fail .dot{background:#ef4444}.notice{margin-top:12px;padding:11px 13px;border-radius:13px;border:1px solid var(--line);background:#fff;font-size:13px;box-shadow:var(--shadow)}.notice.ok{background:#ecfdf5;color:#047857;border-color:#bbf7d0}.notice.err{background:#fff1f2;color:#be123c;border-color:#fecdd3}
.kpis{display:grid;grid-template-columns:repeat(6,minmax(135px,1fr));gap:11px;margin:18px 0}.kpi{background:rgba(255,255,255,.96);border:1px solid var(--line);border-radius:18px;padding:15px 16px;box-shadow:var(--shadow);min-height:96px}.kpi .label,.label{font-size:10px;text-transform:uppercase;letter-spacing:.095em;font-weight:850;color:#718096}.kpi .value{font-size:25px;font-weight:900;letter-spacing:-.025em;margin-top:5px}.kpi .hint{font-size:11px;color:var(--muted);margin-top:3px}.kpi.emphasis{border-color:#b9ded9;background:linear-gradient(145deg,#fff,#f0fdfa)}.kpi.blocked{border-color:#fde6b8;background:#fffbeb}
.panel{background:rgba(255,255,255,.97);border:1px solid var(--line);border-radius:var(--radius);padding:17px;box-shadow:var(--shadow)}.panel+.panel{margin-top:14px}.panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.panel h2{font-size:17px;margin:0 0 3px;letter-spacing:-.015em}.panel p{margin:0;color:var(--muted);font-size:12px;line-height:1.5}.grid2{display:grid;grid-template-columns:1.12fr .88fr;gap:14px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}.barrow{margin-top:14px}.barlabel{display:flex;justify-content:space-between;gap:12px;font-size:12px;font-weight:800;margin-bottom:6px}.bar{height:10px;background:#e8eef2;border-radius:999px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,var(--teal),var(--teal2));border-radius:inherit;transition:width .35s ease}.fill.contract{background:linear-gradient(90deg,#2563eb,#60a5fa)}.fill.warn{background:linear-gradient(90deg,#d97706,#fbbf24)}
.mission{display:grid;grid-template-columns:1.35fr .75fr .85fr .75fr;gap:10px;margin-top:15px}.mission-card{padding:13px 14px;border:1px solid var(--line);background:#f8fbfc;border-radius:15px}.mission-card strong{display:block;font-size:15px;margin-top:4px}.mission-card .small{font-size:11px;color:var(--muted);margin-top:3px}.statepill{display:inline-flex;border-radius:999px;padding:5px 8px;font-weight:850;font-size:10px;background:#eef2ff;color:#4338ca}.statepill.good{background:#ecfdf5;color:#047857}.statepill.warn{background:#fff7ed;color:#c2410c}.statepill.bad{background:#fff1f2;color:#be123c}
.ping-shell{margin-top:12px;border:1px solid #cde2df;border-radius:16px;background:linear-gradient(180deg,#f5fffd,#fff);overflow:hidden}.ping-summary{padding:14px 15px;display:flex;justify-content:space-between;gap:12px;align-items:center;min-width:0}.ping-summary>div{min-width:0}.ping-summary>div>div{overflow-wrap:anywhere}.ping-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:6px}.tasklist{display:grid;gap:8px;padding:0 12px 12px}.taskbrief{border:1px solid var(--line);border-radius:13px;background:#fff;overflow:hidden}.taskbrief summary{cursor:pointer;list-style:none;padding:12px 13px;display:flex;align-items:center;justify-content:space-between;gap:10px}.taskbrief summary::-webkit-details-marker{display:none}.task-title{font-weight:850;font-size:13px}.task-body{border-top:1px solid #edf2f5;padding:12px 13px;display:grid;grid-template-columns:1fr 1fr;gap:12px}.briefblock h4{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#718096;margin:0 0 6px}.briefblock ul{padding-left:17px;margin:0;color:#334155;font-size:12px;line-height:1.55}.briefblock .text{font-size:12px;line-height:1.55;color:#334155}.route{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;background:#f1f5f9;border-radius:7px;padding:3px 6px;display:inline-block;margin:2px 3px 2px 0}.boundary{padding:12px 13px;background:#f8fafc;border-top:1px solid var(--line);font-size:11px;color:#526579;line-height:1.55}.boundary b{color:var(--navy)}
.rows{display:grid;gap:9px;margin-top:12px}.prow{display:grid;grid-template-columns:minmax(150px,1fr) 1.2fr 70px;gap:10px;align-items:center;font-size:12px}.prow .name{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.microbar{height:7px;background:#edf2f5;border-radius:999px;overflow:hidden}.microbar span{display:block;height:100%;background:var(--teal);border-radius:inherit}.microbar.contract span{background:#3b82f6}.tablewrap{overflow-x:auto;overflow-y:hidden;max-width:100%;margin-top:10px;border:1px solid #edf2f5;border-radius:14px;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;font-size:12px;min-width:760px}th,td{text-align:left;padding:10px 11px;border-bottom:1px solid #edf2f5;vertical-align:middle}th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.07em;z-index:1}tr:last-child td{border-bottom:0}.search{border:1px solid #cbd8df;border-radius:11px;padding:9px 11px;min-height:40px;min-width:220px;font:inherit;background:#fff;color:var(--navy)}
.eventlist{display:grid;gap:8px;margin-top:11px}.event{display:grid;grid-template-columns:9px 1fr auto;gap:10px;align-items:start;padding:9px 0;border-bottom:1px solid #edf2f5}.event:last-child{border-bottom:0}.eventdot{width:8px;height:8px;border-radius:50%;background:#94a3b8;margin-top:5px}.eventdot.bad{background:#ef4444;box-shadow:0 0 0 3px #fee2e2}.eventdot.good{background:#10b981}.eventname{font-size:12px;font-weight:800;overflow-wrap:anywhere}.eventmeta{font-size:11px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}.eventreason{font-size:10px;color:#b45309;margin-top:4px;line-height:1.4;overflow-wrap:anywhere}.eventtime{font-size:10px;color:#94a3b8;white-space:nowrap}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:11px;margin-top:12px}.thumb{background:#fff;border:1px solid var(--line);border-radius:15px;overflow:hidden}.thumb img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#f1f5f9;display:block}.empty-visual{aspect-ratio:16/10;background:#f1f5f9;display:grid;place-items:center;padding:14px;text-align:center;color:#64748b;font-size:11px}.meta{padding:10px 11px;font-size:11px;line-height:1.45}.meta b{font-size:12px}.footer-note{margin-top:16px;text-align:center;color:#8292a3;font-size:10px}.hidden{display:none!important}
@media(max-width:1180px){.kpis{grid-template-columns:repeat(3,1fr)}.grid3{grid-template-columns:1fr}.mission{grid-template-columns:1fr 1fr}.mission-card:first-child{grid-column:1/-1}}@media(max-width:900px){.wrap{padding:14px}.topbar{display:block}.controlbox{justify-content:flex-start;margin-top:14px}.grid2{grid-template-columns:1fr}.task-body{grid-template-columns:1fr}.prow{grid-template-columns:130px 1fr 58px}.ping-summary{align-items:flex-start}.kpis{grid-template-columns:repeat(2,1fr)}.mission{grid-template-columns:1fr}.mission-card:first-child{grid-column:auto}}@media(max-width:520px){h1{font-size:25px}.wrap{padding:11px}.kpis{grid-template-columns:1fr 1fr}.kpi{min-height:88px;padding:12px}.kpi .value{font-size:21px}.controlbox{display:grid;grid-template-columns:1fr 1fr;width:100%}.controlbox button{width:100%}.panel{padding:14px}.prow{grid-template-columns:105px 1fr 52px}.search{min-width:0;width:100%}.gallery{grid-template-columns:1fr}.ping-summary{display:block}.ping-summary .btn{margin-top:9px}}
</style></head><body><main class="wrap">
<section class="topbar"><div><div class="eyebrow">Dial Health · Design Control Plane</div><h1>Screen Factory</h1><div class="subtitle">Evidence-backed screen generation with functional requirements delivered by Hermes, independent Dial Health design authority, deterministic rendering, live QA and platform-level packaging. Play latches an autonomous run that advances continuously across groups and platforms until paused, stopped, completed or held by a fail-closed gate.</div><div class="statusline"><span id="liveBadge" class="badge"><span class="dot"></span><span>Connecting…</span></span><span id="workerBadge" class="badge"><span class="dot"></span><span>Worker…</span></span><span id="autoBadge" class="badge"><span class="dot"></span><span>Autonomous run…</span></span><span class="badge"><span class="dot" style="background:#2563eb"></span><span>Hermes: functions only</span></span><span class="badge"><span class="dot" style="background:#8b5cf6"></span><span>Visual authority: independent</span></span></div></div><div class="controlbox"><button class="play" data-act="play" title="Latch continuous autonomous processing">▶ Play</button><button data-act="pause" title="Pause after the current atomic screen; keep the worker alive">Ⅱ Pause</button><button data-act="resume" title="Resume continuous autonomous processing">↻ Resume</button><button class="danger" data-act="stop" title="Cooperatively stop after the current atomic screen">■ Stop</button></div></section>
<div id="actionNotice" class="notice" style="display:none"></div>
<section id="kpis" class="kpis"></section>
<section class="panel"><div class="panel-head"><div><h2>Factory readiness & generation</h2><p>Contract readiness is distinct from generated-screen progress and implementation readiness.</p></div><div id="lastUpdated" class="label"></div></div><div class="barrow"><div class="barlabel"><span>Generated REQUIRED screens</span><span id="overallText">0 / 0</span></div><div class="bar"><div id="overallFill" class="fill" style="width:0"></div></div></div><div class="barrow"><div class="barlabel"><span>Evidence-backed screen contracts</span><span id="contractText">0 / 0</span></div><div class="bar"><div id="contractFill" class="fill contract" style="width:0"></div></div></div><div id="mission" class="mission"></div></section>
<section class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>Storage & Oracle protection</h2><p>R2 is the primary durable artifact plane; Google Drive archives complete platform packs. Oracle keeps a bounded local cache and fails safe before disk pressure threatens the free-tier VM.</p></div><div class="label">2 GB local cache target · 8 GB disk reserve</div></div><div id="storagePanel" class="mission"></div></section>
<section class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>Hermes functional generation ping</h2><p>Hermes tells the designer what each screen must do. It does not prescribe how the screen should look.</p></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="copyPing" class="ghost">Copy functional brief</button><a id="openPing" class="btn ghost" href="#" target="_blank" rel="noreferrer">Open ping JSON</a></div></div><div id="pingPanel"></div></section>
<section class="grid2" style="margin-top:14px"><div class="panel"><div class="panel-head"><div><h2>Business-unit progress</h2><p>Generation progress across REQUIRED surfaces.</p></div><button id="buToggle" class="ghost">Show all</button></div><div id="buRows" class="rows"></div></div><div class="panel"><div class="panel-head"><div><h2>Contract coverage</h2><p>Evidence-backed contracts by product family. Generation fails closed at the first gap.</p></div><button id="contractToggle" class="ghost">Show all</button></div><div id="contractRows" class="rows"></div></div></section>
<section class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>Platform queue & packaging</h2><p>Ten-screen groups are internal execution boundaries. ZIP files are created only when an entire business-unit/platform is complete.</p></div><div style="display:flex;gap:7px;flex-wrap:wrap"><input id="platformSearch" class="search" placeholder="Filter business unit or platform…"><button id="platformToggle" class="ghost">Show all platforms</button></div></div><div class="tablewrap"><table><thead><tr><th>Business unit</th><th>Platform</th><th>Contract ready</th><th>Generated</th><th>Implementation ready</th><th>Package</th></tr></thead><tbody id="platformTable"></tbody></table></div></section>
<section class="grid2" style="margin-top:14px"><div class="panel"><div class="panel-head"><div><h2>Recent factory events</h2><p>Control-plane activity, generation receipts and gate outcomes.</p></div></div><div id="eventList" class="eventlist"></div></div><div class="panel"><div class="panel-head"><div><h2>Completed platform packs</h2><p>Only complete platform packs are downloadable.</p></div><div id="latestDownload"></div></div><div class="tablewrap"><table style="min-width:520px"><thead><tr><th>Package</th><th>Progress</th><th>Download</th></tr></thead><tbody id="packageTable"></tbody></table></div></div></section>
<section class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>Generated screen evidence</h2><p>Images are visual evidence only. They do not automatically imply UX, implementation or clinical green.</p></div><div id="screenCount" class="label"></div></div><div id="gallery" class="gallery"></div></section>
<div class="footer-note">Dial Health Screen Factory · live control-plane state · no batch ZIP packaging · no cosmetic controls</div>
</main><script>
const pathParts=location.pathname.split('/').filter(Boolean);const mount=(pathParts[0]==='sf'&&pathParts[1])?'/sf/'+pathParts[1]:'';const api=p=>mount+p;
const $=id=>document.getElementById(id);let latestPing=null,latestSnap=null,refreshing=false,actionBusy=false,platformFilter='',platformExpanded=false,buExpanded=false,contractExpanded=false;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pct(a,b){return b?Math.max(0,Math.min(100,(Number(a||0)/Number(b))*100)):0}
function fmtTime(v){if(!v)return '—';try{return new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}catch{return '—'}}
function fmtBytes(v){const n=Number(v||0);if(n>=1073741824)return(n/1073741824).toFixed(2)+' GB';if(n>=1048576)return(n/1048576).toFixed(1)+' MB';if(n>=1024)return(n/1024).toFixed(1)+' KB';return n+' B'}
function statusClass(state){state=String(state||'').toUpperCase();if(['FAILED','RUNTIME_BLOCKED'].includes(state))return'fail';if(['CONTRACT_BLOCKED','STORAGE_BLOCKED','PAUSED','PAUSING','STOPPING'].includes(state))return'warn';if(['RUNNING','GENERATING','RENDERING','QA','IMPORTING','WAITING_FOR_CHATGPT'].includes(state))return'live';return'stop'}
async function reqJson(path,opt){const r=await fetch(api(path),{cache:'no-store',...opt});const text=await r.text();if(!r.ok)throw new Error(r.status+' '+text.slice(0,180));try{return JSON.parse(text)}catch{throw new Error('Invalid JSON from '+path)}}
function notice(msg,kind='ok'){const e=$('actionNotice');e.textContent=msg;e.className='notice '+kind;e.style.display='block';setTimeout(()=>e.style.display='none',5000)}
function syncControls(s){const requested=String(s.requested_state||'STOPPED'),state=String(s.state||'STOPPED'),stopping=state==='STOPPING';document.querySelector('[data-act="play"]').disabled=requested==='RUNNING'||stopping;document.querySelector('[data-act="pause"]').disabled=requested!=='RUNNING'||stopping;document.querySelector('[data-act="resume"]').disabled=requested!=='PAUSED'||stopping;document.querySelector('[data-act="stop"]').disabled=requested==='STOPPED'}
async function act(a){if(actionBusy)return;actionBusy=true;document.querySelectorAll('[data-act]').forEach(b=>b.disabled=true);notice('Sending '+a.toUpperCase()+'…');try{const s=await reqJson('/api/'+a,{method:'POST'});notice(a.toUpperCase()+' accepted · '+s.state);setTimeout(refresh,120)}catch(e){notice(a.toUpperCase()+' failed: '+e.message,'err')}finally{actionBusy=false}}
document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.act)));
function row(name,value,total,kind='normal'){return '<div class="prow"><div class="name" title="'+esc(name)+'">'+esc(name)+'</div><div class="microbar '+(kind==='contract'?'contract':'')+'"><span style="width:'+pct(value,total)+'%"></span></div><div style="text-align:right;color:#64748b">'+esc(value)+'/'+esc(total)+'</div></div>'}
function aggregateContractByBu(platforms){const m=new Map();for(const p of platforms||[]){const g=m.get(p.business_unit)||{total:0,ready:0};g.total+=Number(p.total||0);g.ready+=Number(p.contract_ready||0);m.set(p.business_unit,g)}return m}
function renderProgressLists(s,platforms){const bu=Object.entries(s.by_business_unit||{});const bvis=buExpanded?bu:bu.slice(0,10);$('buRows').innerHTML=bvis.map(([n,v])=>row(n,v.complete,v.total)).join('');$('buToggle').textContent=buExpanded?'Show fewer':'Show all '+bu.length;const contract=[...aggregateContractByBu(platforms).entries()];const cvis=contractExpanded?contract:contract.slice(0,10);$('contractRows').innerHTML=cvis.map(([n,v])=>row(n,v.ready,v.total,'contract')).join('');$('contractToggle').textContent=contractExpanded?'Show fewer':'Show all '+contract.length}
function kpis(s){const contractPct=pct(s.contract_ready,s.required_total).toFixed(1);return [
 ['Generated',s.complete+' / '+s.required_total,s.percent+'% complete','emphasis'],
 ['Contract ready',s.contract_ready+' / '+s.required_total,contractPct+'% evidence-backed',''],
 ['Contract blocked',s.contract_blocked,'fail-closed until resolved','blocked'],
 ['Implementation ready',s.implementation_ready,'separate from visual QA',''],
 ['Materialized',s.materialized,'local evidence bundles',''],
 ['Failures',s.failed,'generation/basic-QA failures','']
 ].map(x=>'<div class="kpi '+x[3]+'"><div class="label">'+esc(x[0])+'</div><div class="value">'+esc(x[1])+'</div><div class="hint">'+esc(x[2])+'</div></div>').join('')}
function renderMission(s,cb){const next=s.next_task;const readiness=next?.contract_readiness;const stateClass=readiness?.ready?'good':'warn',run=s.execution_policy?.autonomous_run_latched;return '<div class="mission-card"><div class="label">Next canonical screen</div><strong>'+(next?esc(next.screen_id+' — '+next.title):'Queue complete')+'</strong><div class="small">'+(next?esc(next.business_unit+' · '+next.platform):'No remaining REQUIRED tasks')+'</div></div><div class="mission-card"><div class="label">Contract gate</div><strong><span class="statepill '+stateClass+'">'+(readiness?.ready?'READY':'BLOCKED')+'</span></strong><div class="small">'+esc(readiness?.reason||'Durable functional contract available')+'</div></div><div class="mission-card"><div class="label">Active group</div><strong>'+esc(cb?.batch_id||'No active group')+'</strong><div class="small">'+(cb?.expected_count?esc((cb.complete_count||0)+' / '+cb.expected_count+' generated'):'Prepared on demand')+'</div></div><div class="mission-card"><div class="label">Autonomous run</div><strong><span class="statepill '+(run?'good':'warn')+'">'+(run?'LATCHED':'OFF')+'</span></strong><div class="small">'+(run?'Advances automatically; no batch/platform stop':'Press Play to start continuous processing')+'</div></div>'}
function renderStorage(s){const x=s.storage||{},r=x.r2||{},g=x.google_drive||{};const localClass=Number(x.local_percent||0)>=85?'warn':'good';const rClass=r.state==='SYNCED'?'good':(r.state==='ERROR'?'bad':'warn');const gClass=g.state==='ARCHIVED'?'good':(g.state==='ERROR'?'bad':'warn');$('storagePanel').innerHTML='<div class="mission-card"><div class="label">Oracle local cache</div><strong>'+esc(fmtBytes(x.local_bytes))+' / '+esc(fmtBytes(x.local_limit_bytes))+'</strong><div class="small"><span class="statepill '+localClass+'">'+esc(x.local_percent??0)+'%</span> · free disk '+esc(fmtBytes(x.disk_free_bytes))+'</div></div><div class="mission-card"><div class="label">R2 durable storage</div><strong><span class="statepill '+rClass+'">'+esc(r.state||'WAITING_AUTH')+'</span></strong><div class="small">Primary machine artifact store</div></div><div class="mission-card"><div class="label">Google Drive archive</div><strong><span class="statepill '+gClass+'">'+esc(g.state||'WAITING_AUTH')+'</span></strong><div class="small">'+esc(g.account_email||'Google account not pinned')+' · complete platform ZIPs only</div></div><div class="mission-card"><div class="label">Last storage sync</div><strong>'+esc(fmtTime(x.last_sync_at))+'</strong><div class="small">'+esc(x.last_error||'No storage error')+'</div></div>'}
function renderPing(p){latestPing=p;if(!p){$('pingPanel').innerHTML='<div class="ping-shell"><div class="ping-summary"><div><b>No functional ping prepared</b><div class="subtitle">The next contract-ready group will be prepared when required.</div></div></div></div>';$('copyPing').disabled=true;return}$('copyPing').disabled=false;$('openPing').href=api('/api/ping');const tasks=p.tasks||[];const briefs=tasks.map((t,i)=>'<details class="taskbrief" '+(i===0?'open':'')+'><summary><div><span class="statepill good">'+esc(t.screen_id)+'</span> <span class="task-title">'+esc(t.title)+'</span></div><span class="label">'+esc(t.platform)+'</span></summary><div class="task-body"><div class="briefblock"><h4>Purpose</h4><div class="text">'+esc(t.purpose||'Not documented')+'</div></div><div class="briefblock"><h4>Intended roles</h4><div class="text">'+esc((t.intended_roles||[]).join(' · ')||'Not documented')+'</div></div><div class="briefblock"><h4>Required functions</h4><ul>'+(t.required_functions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><div class="briefblock"><h4>Required user actions</h4><ul>'+(t.required_user_actions||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div><div class="briefblock"><h4>Routes / handoffs</h4><div>'+(t.routes_and_handoffs||[]).map(x=>'<span class="route">'+esc(x)+'</span>').join('')+'</div></div><div class="briefblock"><h4>Required states</h4><div class="text">'+esc((t.required_states||[]).join(' · '))+'</div></div>'+(t.record_detail_requirement?'<div class="briefblock"><h4>Record/detail obligation</h4><div class="text">'+esc(t.record_detail_requirement)+'</div></div>':'')+(t.export_requirement?'<div class="briefblock"><h4>Export obligation</h4><div class="text">'+esc(t.export_requirement)+'</div></div>':'')+'</div></details>').join('');$('pingPanel').innerHTML='<div class="ping-shell"><div class="ping-summary"><div><div class="label">'+esc(p.ping_type||'FUNCTIONAL PING')+'</div><div style="font-size:16px;font-weight:900;margin-top:3px">'+esc(p.batch_id)+'</div><div class="ping-meta"><span class="statepill good">'+esc(p.business_unit)+'</span><span class="statepill">'+esc(p.platform)+'</span><span class="statepill">'+tasks.length+' screens</span></div></div><span class="label">Prepared '+esc(fmtTime(p.prepared_at))+'</span></div><div class="boundary"><b>Design boundary:</b> Hermes supplies functional requirements only. Layout, visual style, colours, typography, component placement, density, framing and composition are not part of the Hermes ping.</div><div class="tasklist">'+briefs+'</div></div>'}
$('copyPing').addEventListener('click',async()=>{if(!latestPing?.functional_message)return;try{await navigator.clipboard.writeText(latestPing.functional_message);notice('Functional brief copied')}catch{notice('Clipboard unavailable on this browser','err')}});
function renderPlatforms(list,packs){const q=platformFilter.toLowerCase().trim();const packByKey=new Map((packs||[]).map(x=>[x.business_unit+'::'+x.platform,x]));const matched=(list||[]).filter(x=>!q||(String(x.business_unit)+' '+String(x.platform)).toLowerCase().includes(q));const visible=(q||platformExpanded)?matched:matched.slice(0,14);$('platformToggle').textContent=platformExpanded?'Show fewer platforms':'Show all '+matched.length+' platforms';$('platformToggle').style.display=q?'none':'inline-flex';const rows=visible.map(x=>{const pack=packByKey.get(x.business_unit+'::'+x.platform);const packCell=pack?.downloadable?'<a class="btn download" style="min-height:32px;padding:6px 9px;font-size:10px" href="'+api('/api/platform-packages/'+encodeURIComponent(pack.package_id)+'/download')+'">ZIP</a>':'<span class="statepill '+(x.complete===x.total?'good':'')+'">'+(x.complete===x.total?'PACKING':'PENDING')+'</span>';return '<tr><td><b>'+esc(x.business_unit)+'</b></td><td>'+esc(x.platform)+'</td><td>'+x.contract_ready+' / '+x.total+' <span style="color:#94a3b8">('+x.contract_percent+'%)</span></td><td>'+x.complete+' / '+x.total+'</td><td>'+x.implementation_ready+' / '+x.total+'</td><td>'+packCell+'</td></tr>'}).join('');$('platformTable').innerHTML=rows||'<tr><td colspan="6" style="color:#64748b">No matching platform.</td></tr>'}
$('platformSearch').addEventListener('input',e=>{platformFilter=e.target.value;if(latestSnap)renderPlatforms(latestSnap.platform_progress,latestSnap.platform_packages)});
$('platformToggle').addEventListener('click',()=>{platformExpanded=!platformExpanded;if(latestSnap)renderPlatforms(latestSnap.platform_progress,latestSnap.platform_packages)});
$('buToggle').addEventListener('click',()=>{buExpanded=!buExpanded;if(latestSnap)renderProgressLists(latestSnap.status,latestSnap.platform_progress)});
$('contractToggle').addEventListener('click',()=>{contractExpanded=!contractExpanded;if(latestSnap)renderProgressLists(latestSnap.status,latestSnap.platform_progress)});
function renderEvents(events){$('eventList').innerHTML=(events||[]).map(e=>{const name=String(e.event||'Factory event');const bad=/FAILED|BLOCKED|ERROR/.test(name);const good=/COMPLETE|INGESTED|RESET/.test(name);const count=Number(e.repeat_count||1);const identity=e.task_id||e.batch_id||e.screen_id||e.action||'control-plane update';const reason=e.reason?'<div class="eventreason">'+esc(e.reason)+'</div>':'';return '<div class="event"><span class="eventdot '+(bad?'bad':good?'good':'')+'"></span><div><div class="eventname">'+esc(name)+(count>1?' <span class="statepill warn">×'+count+'</span>':'')+'</div><div class="eventmeta">'+esc(identity)+'</div>'+reason+'</div><div class="eventtime">'+esc(fmtTime(e.at||e.observed_at))+'</div></div>'}).join('')||'<div class="subtitle">No recent factory events.</div>'}
function renderPackages(packs){const done=(packs||[]).filter(x=>x.downloadable).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));$('packageTable').innerHTML=done.length?done.map(x=>'<tr><td><b>'+esc(x.business_unit)+'</b><br><span style="color:#64748b">'+esc(x.platform)+'</span></td><td>'+x.complete_count+' / '+x.expected_count+'</td><td><a class="btn download" style="min-height:34px;padding:7px 10px" href="'+api('/api/platform-packages/'+encodeURIComponent(x.package_id)+'/download')+'">Download ZIP</a></td></tr>').join(''):'<tr><td colspan="3" style="color:#64748b">No complete platform packs yet.</td></tr>';$('latestDownload').innerHTML=done[0]?'<a class="btn download" href="'+api('/api/platform-packages/'+encodeURIComponent(done[0].package_id)+'/download')+'">Latest ZIP</a>':''}
function renderGallery(done,s){$('screenCount').textContent=s.complete+' complete';$('gallery').innerHTML=(done||[]).slice().reverse().map(x=>{const visual=x.asset_available?'<img loading="lazy" src="'+api('/api/screens/'+encodeURIComponent(x.task_id)+'/preview')+'">':'<div class="empty-visual"><div><b>Verified external evidence</b><br>'+esc(x.external_filename||'asset registered')+'</div></div>';return '<article class="thumb">'+visual+'<div class="meta"><b>'+esc(x.screen_id)+' — '+esc(x.title)+'</b><br>'+esc(x.business_unit)+' · '+esc(x.platform)+'<br><span class="statepill good" style="margin-top:5px">'+esc(x.status)+'</span> <span class="statepill" style="margin-top:5px">QA '+esc(x.basic_qa)+'</span>'+(x.implementation_ready?' <span class="statepill good" style="margin-top:5px">implementation-ready</span>':'')+'</div></article>'}).join('')||'<div class="subtitle">No screens generated under the current design policy yet.</div>'}
async function refresh(){if(refreshing)return;refreshing=true;try{const snap=await reqJson('/api/dashboard');latestSnap=snap;const s=snap.status||{},cb=snap.current_batch||{},platforms=snap.platform_progress||[];const cls=statusClass(s.state);$('liveBadge').className='badge '+cls;$('liveBadge').innerHTML='<span class="dot"></span><span>Factory '+esc(s.state)+'</span>';$('workerBadge').className='badge '+(snap.worker_service==='active'?'live':'stop');$('workerBadge').innerHTML='<span class="dot"></span><span>Worker '+esc(snap.worker_service||'unknown')+'</span>';const auto=s.execution_policy?.autonomous_run_latched;$('autoBadge').className='badge '+(auto?'live':(s.requested_state==='PAUSED'?'warn':'stop'));$('autoBadge').innerHTML='<span class="dot"></span><span>Autonomous '+(auto?'latched':(s.requested_state==='PAUSED'?'paused':'off'))+'</span>';$('lastUpdated').textContent='Updated '+fmtTime(snap.server_time);$('kpis').innerHTML=kpis(s);$('overallText').textContent=s.complete+' / '+s.required_total+' · '+s.percent+'%';$('overallFill').style.width=pct(s.complete,s.required_total)+'%';$('contractText').textContent=s.contract_ready+' / '+s.required_total+' · '+pct(s.contract_ready,s.required_total).toFixed(1)+'%';$('contractFill').style.width=pct(s.contract_ready,s.required_total)+'%';$('mission').innerHTML=renderMission(s,cb);renderStorage(s);syncControls(s);renderPing(snap.current_ping);renderProgressLists(s,platforms);renderPlatforms(platforms,snap.platform_packages||[]);renderPackages(snap.platform_packages||[]);renderEvents(snap.recent_events||[]);renderGallery(snap.recent_tasks||[],s)}catch(e){$('liveBadge').className='badge fail';$('liveBadge').innerHTML='<span class="dot"></span><span>Connection error</span>';notice('Live refresh failed: '+e.message,'err')}finally{refreshing=false}}
refresh();setInterval(refresh,2500);
</script></body></html>`;
ensureScreenFactory();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(DASHBOARD);
    }
    return json(res, { error: 'not found' }, 404);
  } catch (error) {
    return json(res, { error: String(error?.message || error) }, 500);
  }
});
server.listen(PORT, HOST, () => console.log(`Dial Health Screen Factory dashboard http://${HOST}:${PORT}`));
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
