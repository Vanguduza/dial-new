#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { controlScreenFactory, ensureScreenFactory, screenFactoryStatus } from './screen-factory.mjs';
import { readJson } from './state-store.mjs';

const HOST = process.env.DIAL_SCREEN_FACTORY_HOST || '127.0.0.1';
const PORT = Number(process.env.DIAL_SCREEN_FACTORY_PORT || 9121);
const WORKER_SERVICE = 'dial-health-screen-factory.service';

function json(res, value, code = 200) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
  res.end(body);
}
function safeService(action) {
  if (!['start', 'stop'].includes(action)) throw new Error('invalid service action');
  try { execFileSync('systemctl', ['--user', action, WORKER_SERVICE], { timeout: 15000, stdio: 'ignore' }); return true; }
  catch { return false; }
}
function manifest() { return readJson('screen-factory/manifest.json', { tasks: [], batches: [] }); }
function taskList() {
  const m = manifest();
  return m.tasks.map((task) => ({
    task_id: task.task_id, screen_id: task.screen_id, title: task.title,
    business_unit: task.business_unit, platform: task.platform,
    platform_policy: task.platform_policy, status: task.status,
    basic_qa: task.basic_qa, visual_qa: task.visual_qa, approved: Boolean(task.approved),
    generation_attempts: task.generation_attempts, asset_available: Boolean(task.asset_path && fs.existsSync(task.asset_path)),
    external_asset_registered: task.external_evidence?.verified === true,
    external_filename: task.external_evidence?.filename || null,
    external_sha256: task.external_evidence?.sha256 || null,
    last_error: task.last_error || null,
  }));
}

function sendFile(res, target, downloadName, mime = 'application/octet-stream') {
  if (!target || !fs.existsSync(target)) return json(res, { error: 'artifact not found' }, 404);
  const stat = fs.statSync(target);
  res.writeHead(200, {
    'content-type': mime, 'content-length': stat.size,
    'content-disposition': downloadName ? `attachment; filename="${downloadName.replace(/[^a-zA-Z0-9_.-]/g, '_')}"` : 'inline',
    'cache-control': 'no-store',
  });
  fs.createReadStream(target).pipe(res);
}
async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/status') return json(res, screenFactoryStatus());
  if (req.method === 'GET' && url.pathname === '/api/tasks') return json(res, { tasks: taskList() });
  if (req.method === 'GET' && url.pathname === '/api/batches') return json(res, { batches: manifest().batches || [] });
  if (req.method === 'GET' && url.pathname === '/api/request') return json(res, readJson('screen-factory/requests/current.json', null));
  const control = url.pathname.match(/^\/api\/(play|resume|pause|stop)$/);
  if (req.method === 'POST' && control) {
    const action = control[1];
    const status = controlScreenFactory(action);
    if (action === 'play' || action === 'resume') safeService('start');
    if (action === 'stop') safeService('stop');
    return json(res, { ...status, worker_service_action: action === 'stop' ? 'stop' : (['play','resume'].includes(action) ? 'start' : 'unchanged') });
  }
  const batch = url.pathname.match(/^\/api\/batches\/([^/]+)\/download$/);
  if (req.method === 'GET' && batch) {
    const found = (manifest().batches || []).find((item) => item.batch_id === decodeURIComponent(batch[1]));
    if (!found?.downloadable) return json(res, { error: 'batch is not complete/downloadable' }, 409);
    return sendFile(res, found.zip_path, `${found.batch_id}.zip`, 'application/zip');
  }
  const preview = url.pathname.match(/^\/api\/screens\/([^/]+)\/preview$/);
  if (req.method === 'GET' && preview) {
    const task = manifest().tasks.find((item) => item.task_id === decodeURIComponent(preview[1]));
    if (!task?.asset_path) return json(res, { error: 'screen preview not found' }, 404);
    return sendFile(res, task.asset_path, null, 'image/png');
  }
  return json(res, { error: 'not found' }, 404);
}

const DASHBOARD = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dial Health Screen Factory</title><style>
:root{font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc}*{box-sizing:border-box}body{margin:0;padding:24px}.wrap{max-width:1500px;margin:auto}
header{display:flex;justify-content:space-between;gap:16px;align-items:center}.brand{font-size:28px;font-weight:800}.sub{color:#64748b}.controls{display:flex;gap:8px;flex-wrap:wrap}
button,a.btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:12px;padding:10px 15px;font-weight:700;cursor:pointer;text-decoration:none}.play{background:#0f766e;color:#fff;border-color:#0f766e}.stop{color:#b91c1c}
.cards{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:12px;margin:22px 0}.card,.panel{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:16px;box-shadow:0 8px 30px rgba(15,23,42,.05)}.big{font-size:28px;font-weight:800}.label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
.bar{height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden}.fill{height:100%;background:#0f766e}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rows{display:grid;gap:8px}.row{display:grid;grid-template-columns:180px 1fr 74px;gap:10px;align-items:center;font-size:13px}.state{font-weight:800}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}.thumb{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}.thumb img{width:100%;aspect-ratio:9/16;object-fit:cover;background:#f1f5f9}.meta{padding:10px;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:9px;border-bottom:1px solid #e2e8f0}th{color:#64748b}@media(max-width:900px){.cards{grid-template-columns:1fr 1fr}.grid{grid-template-columns:1fr}.row{grid-template-columns:120px 1fr 55px}}
</style></head><body><div class="wrap">
<header><div><div class="brand">Dial Health — Screen Factory</div><div class="sub">ChatGPT-powered visual factory · Hermes controls queue, heartbeat, QA and ZIPs</div></div><div class="controls"><button class="play" onclick="act('play')">▶ Play</button><button onclick="act('pause')">Ⅱ Pause</button><button onclick="act('resume')">↻ Resume</button><button class="stop" onclick="act('stop')">■ Stop</button></div></header>
<div class="cards" id="cards"></div><div class="panel" style="margin-bottom:16px"><div class="label">Overall progress</div><div class="bar" style="margin:10px 0"><div id="overallFill" class="fill"></div></div><div id="current"></div></div>
<div class="grid"><div class="panel"><h3>Business units</h3><div class="rows" id="bu"></div></div><div class="panel"><h3>Platforms</h3><div class="rows" id="platform"></div></div></div>
<div class="panel" style="margin-top:16px"><h3>Completed batches</h3><div id="batches"></div></div><div class="panel" style="margin-top:16px"><h3>Generated screens</h3><div class="gallery" id="gallery"></div></div>
</div><script>
async function j(url,opt){const r=await fetch(url,opt);return r.json()}async function act(a){await j('/api/'+a,{method:'POST'});await refresh()}
function rows(obj){return Object.entries(obj||{}).map(([k,v])=>'<div class="row"><b>'+k+'</b><div class="bar"><div class="fill" style="width:'+v.percent+'%"></div></div><span>'+v.complete+'/'+v.total+'</span></div>').join('')}
async function refresh(){
 const [s,t,b]=await Promise.all([j('/api/status'),j('/api/tasks'),j('/api/batches')]);
 document.getElementById('cards').innerHTML=[['State',s.state],['Generator',s.generator_authority],['Complete',s.complete],['Materialized',s.materialized],['Required',s.required_total],['Implementation ready',s.implementation_ready],['Remaining',s.remaining],['Failed',s.failed]].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="big">'+x[1]+'</div></div>').join('');
 document.getElementById('overallFill').style.width=s.percent+'%';
 document.getElementById('current').innerHTML='<b>'+s.percent+'%</b> · <b>'+s.generator_mode+'</b> · Hermes: '+s.hermes_role+' · active batch <span class="state">'+(s.active_batch_id||'—')+'</span> · next '+(s.next_task?(s.next_task.business_unit+' / '+s.next_task.platform+' / '+s.next_task.screen_id+' — '+s.next_task.title):'—');
 document.getElementById('bu').innerHTML=rows(s.by_business_unit); document.getElementById('platform').innerHTML=rows(s.by_platform);
 const complete=(b.batches||[]).filter(x=>x.downloadable); document.getElementById('batches').innerHTML=complete.length?complete.map(x=>'<a class="btn" href="/api/batches/'+encodeURIComponent(x.batch_id)+'/download">Download '+x.batch_id+' ('+x.complete_count+'/'+x.expected_count+')</a>').join(' '):'<span class="sub">No complete batch ZIP yet.</span>';
 const done=(t.tasks||[]).filter(x=>x.asset_available||x.external_asset_registered).slice(-60).reverse(); document.getElementById('gallery').innerHTML=done.map(x=>{const visual=x.asset_available?'<img loading="lazy" src="/api/screens/'+encodeURIComponent(x.task_id)+'/preview">':'<div style="aspect-ratio:9/16;background:#f1f5f9;display:grid;place-items:center;padding:16px;text-align:center;color:#475569"><div><b>Verified prior screen</b><br><span style="font-size:11px">'+(x.external_filename||'external asset')+'</span></div></div>';return '<div class="thumb">'+visual+'<div class="meta"><b>'+x.screen_id+'</b> · '+x.platform+'<br>'+x.title+'<br>QA '+x.basic_qa+' · Visual '+x.visual_qa+(x.external_asset_registered&&!x.asset_available?'<br>Registered evidence · not materialized on Oracle':'')+'</div></div>'}).join('');
}
refresh();setInterval(refresh,1000);
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
