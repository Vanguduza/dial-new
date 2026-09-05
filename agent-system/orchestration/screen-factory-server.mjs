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
  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const m = manifest(); const status = screenFactoryStatus();
    const request = readJson('screen-factory/requests/current.json', null);
    const recent_tasks = m.tasks.filter((task) => ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)).slice(-80).map(taskSummary);
    const byId = new Map(m.tasks.map((task) => [task.task_id, task]));
    const currentTasks = (request?.tasks || []).map((item) => byId.get(item.task_id) || item);
    const complete_count = currentTasks.filter((task) => ['COMPLETE','EXTERNAL_COMPLETE'].includes(task.status)).length;
    const current_batch = request ? { batch_id: request.batch_id, expected_count: request.expected_count || currentTasks.length, complete_count, prepared_at: request.prepared_at } : { batch_id: null, expected_count: 0, complete_count: 0 };
    return json(res, { server_time: new Date().toISOString(), status, batches: m.batches || [], platform_packages: m.platform_packages || [], current_batch, recent_tasks });
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
    if (action === 'play' || action === 'resume') safeService('start');
    if (action === 'stop') safeService('stop');
    return json(res, { ...status, worker_service_action: action === 'stop' ? 'stop' : (['play','resume'].includes(action) ? 'start' : 'unchanged') });
  }
  const platformPackage = url.pathname.match(/^\/api\/platform-packages\/([^/]+)\/download$/);
  if (req.method === 'GET' && platformPackage) {
    const found = (manifest().platform_packages || []).find((item) => item.package_id === decodeURIComponent(platformPackage[1]));
    if (!found?.downloadable) return json(res, { error: 'platform package is not complete/downloadable' }, 409);
    return sendFile(res, found.zip_path, `${found.package_id}.zip`, 'application/zip');
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
:root{font-family:Inter,system-ui,sans-serif;color:#0f172a;background:#f8fafc}*{box-sizing:border-box}body{margin:0;padding:18px}.wrap{max-width:1500px;margin:auto}header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}.brand{font-size:28px;font-weight:850}.sub{color:#64748b}.controls{display:flex;gap:8px;flex-wrap:wrap}.controls button{min-width:92px}button,a.btn{border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:12px;padding:11px 15px;font-weight:750;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px}.play{background:#0f766e;color:#fff;border-color:#0f766e}.stop{color:#b91c1c}.download{background:#eff6ff!important;color:#1d4ed8!important;border-color:#bfdbfe!important}.cards{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;margin:18px 0}.card,.panel{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:16px;box-shadow:0 8px 30px rgba(15,23,42,.05)}.big{font-size:27px;font-weight:850}.label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.07em}.bar{height:11px;background:#e2e8f0;border-radius:999px;overflow:hidden}.fill{height:100%;background:#0f766e;transition:width .35s ease}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rows{display:grid;gap:9px}.row{display:grid;grid-template-columns:180px 1fr 80px;gap:10px;align-items:center;font-size:13px}.state{font-weight:850}.live{display:inline-flex;align-items:center;gap:7px;color:#047857;font-weight:800}.dot{width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 0 4px #d1fae5}.notice{margin-top:12px;padding:11px 13px;border-radius:12px;background:#f1f5f9;color:#475569;font-size:13px}.notice.err{background:#fff1f2;color:#be123c}.notice.ok{background:#ecfdf5;color:#047857}.batch-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.tablewrap{overflow:auto;margin-top:10px}table{width:100%;border-collapse:collapse;font-size:12px;min-width:760px}th,td{text-align:left;padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:middle}th{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:#ecfdf5;color:#047857;font-weight:800}.pill.wait{background:#fff7ed;color:#c2410c}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}.thumb{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}.thumb img{width:100%;aspect-ratio:16/10;object-fit:cover;background:#f1f5f9}.meta{padding:10px;font-size:12px}.section-title{margin:0 0 4px}.muted{color:#64748b}.currentbox{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-top:12px}.currentitem{padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc}.currenttitle{font-size:16px;font-weight:850;margin-top:3px}@media(max-width:900px){body{padding:12px}.brand{font-size:23px}.cards{grid-template-columns:1fr 1fr}.grid,.currentbox{grid-template-columns:1fr}.row{grid-template-columns:120px 1fr 62px}.controls{width:100%}.controls button{flex:1;min-width:75px}.gallery{grid-template-columns:1fr 1fr}}@media(max-width:520px){.gallery{grid-template-columns:1fr}.cards{grid-template-columns:1fr 1fr}.big{font-size:23px}}
</style></head><body><div class="wrap">
<header><div><div class="brand">Dial Health — Screen Factory</div><div class="sub">GPT-5.6 Sol generates implementation-ready screens · exact Sonnet 5 fallback · Hermes controls heartbeat, queue, QA and packaging</div></div><div class="controls"><button class="play" data-act="play">▶ Play</button><button data-act="pause">Ⅱ Pause</button><button data-act="resume">↻ Resume</button><button class="stop" data-act="stop">■ Stop</button></div></header>
<div id="actionNotice" class="notice" style="display:none"></div>
<div class="cards" id="cards"></div>
<div class="panel"><div class="batch-head"><div><div class="label">Overall progress</div><div id="liveLine" class="live"><span class="dot"></span>Live</div></div><div id="lastUpdated" class="muted"></div></div><div class="bar" style="margin:12px 0"><div id="overallFill" class="fill"></div></div><div id="current"></div><div id="batchProgress" style="margin-top:14px"></div></div>
<div class="grid" style="margin-top:16px"><div class="panel"><h3 class="section-title">Business-unit progress</h3><div class="muted">Required screens only</div><div class="rows" id="bu" style="margin-top:12px"></div></div><div class="panel"><h3 class="section-title">Platform progress</h3><div class="muted">Required screens only</div><div class="rows" id="platform" style="margin-top:12px"></div></div></div>
<div class="panel" style="margin-top:16px"><div class="batch-head"><div><h3 class="section-title">Completed platform packs</h3><div class="muted">ZIPs are produced only when an entire business-unit/platform is complete.</div></div><div id="latestDownload"></div></div><div class="tablewrap"><table><thead><tr><th>Business unit</th><th>Platform</th><th>Package</th><th>Screens</th><th>Completed</th><th>Download</th></tr></thead><tbody id="batches"></tbody></table></div></div>
<div class="panel" style="margin-top:16px"><div class="batch-head"><div><h3 class="section-title">Completed screens</h3><div class="muted">Most recent materialized screens and verified prior evidence.</div></div><div id="screenCount" class="muted"></div></div><div class="gallery" id="gallery" style="margin-top:12px"></div></div>
</div><script>
const pathParts=location.pathname.split('/').filter(Boolean);const mount=(pathParts[0]==='sf'&&pathParts[1])?'/sf/'+pathParts[1]:'';const api=p=>mount+p;
async function reqJson(path,opt){const r=await fetch(api(path),{cache:'no-store',...opt});const text=await r.text();if(!r.ok)throw new Error(r.status+' '+text.slice(0,160));try{return JSON.parse(text)}catch{throw new Error('Invalid JSON from '+path)}}
function showNotice(msg,kind='ok'){const e=document.getElementById('actionNotice');e.className='notice '+kind;e.textContent=msg;e.style.display='block';setTimeout(()=>e.style.display='none',5000)}
let actionBusy=false;async function act(a){if(actionBusy)return;actionBusy=true;const buttons=[...document.querySelectorAll('[data-act]')];buttons.forEach(b=>b.disabled=true);showNotice('Sending '+a.toUpperCase()+'…','ok');try{const s=await reqJson('/api/'+a,{method:'POST'});showNotice(a.toUpperCase()+' accepted — state: '+s.state);document.getElementById('liveLine').innerHTML='<span class=\"dot\"></span>Live · '+esc(s.state);setTimeout(()=>refresh(),100)}catch(e){showNotice(a.toUpperCase()+' failed: '+e.message,'err')}finally{buttons.forEach(b=>b.disabled=false);actionBusy=false}}document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>act(b.dataset.act)));
function rows(obj){return Object.entries(obj||{}).map(([k,v])=>'<div class="row"><b>'+k+'</b><div class="bar"><div class="fill" style="width:'+v.percent+'%"></div></div><span>'+v.complete+'/'+v.total+'</span></div>').join('')}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
let refreshing=false;async function refresh(){if(refreshing)return;refreshing=true;try{const snap=await reqJson('/api/dashboard');const s=snap.status,packs=snap.platform_packages||[],cb=snap.current_batch||{},completeTasks=snap.recent_tasks||[];
 document.getElementById('liveLine').innerHTML='<span class="dot"></span>Live · '+esc(s.state);document.getElementById('lastUpdated').textContent='Updated '+new Date(snap.server_time||Date.now()).toLocaleTimeString();
 document.getElementById('cards').innerHTML=[['Complete',s.complete+' / '+s.required_total],['Remaining',s.remaining],['Contract ready',s.contract_ready],['Contract blocked',s.contract_blocked],['Implementation ready',s.implementation_ready],['Materialized',s.materialized],['Factory state',s.state],['Next screen',s.next_task?.screen_id||'—']].map(x=>'<div class="card"><div class="label">'+esc(x[0])+'</div><div class="big">'+esc(x[1])+'</div></div>').join('');
 document.getElementById('overallFill').style.width=s.percent+'%';document.getElementById('current').innerHTML='<div class="currentbox"><div class="currentitem"><div class="label">Next canonical screen</div><div class="currenttitle">'+(s.next_task?esc(s.next_task.screen_id+' — '+s.next_task.title):'Queue complete')+'</div><div class="muted">'+(s.next_task?esc(s.next_task.business_unit+' · '+s.next_task.platform+' · contract '+(s.next_task.contract_readiness?.ready?'READY':'BLOCKED')):'No remaining required tasks')+'</div></div><div class="currentitem"><div class="label">Authority boundary</div><div class="currenttitle">'+esc(s.generator_mode)+'</div><div class="muted">Hermes: '+esc(s.hermes_role)+'</div></div></div>';
 const doneInReq=cb?.complete_count||0;const exp=cb?.expected_count||0;document.getElementById('batchProgress').innerHTML=exp?'<div class="batch-head"><b>Active group: '+esc(cb.batch_id)+'</b><span>'+doneInReq+' / '+exp+'</span></div><div class="bar" style="margin-top:7px"><div class="fill" style="width:'+(doneInReq/exp*100)+'%"></div></div><div class="muted" style="margin-top:6px">Grouping boundary only — completing 10 does not stop the factory.</div>':'<span class="muted">No active group.</span>';
 document.getElementById('bu').innerHTML=rows(s.by_business_unit);document.getElementById('platform').innerHTML=rows(s.by_platform);
 const packages=packs.filter(x=>x.downloadable).sort((a,z)=>String(z.updated_at).localeCompare(String(a.updated_at)));document.getElementById('batches').innerHTML=packages.length?packages.map(x=>'<tr><td><b>'+esc(x.business_unit)+'</b></td><td>'+esc(x.platform)+'</td><td>'+esc(x.package_id)+'</td><td>'+x.complete_count+' / '+x.expected_count+'</td><td><span class="pill">COMPLETE</span></td><td><a class="btn download" href="'+api('/api/platform-packages/'+encodeURIComponent(x.package_id)+'/download')+'">⬇ ZIP</a></td></tr>').join(''):'<tr><td colspan="6" class="muted">No completed platform ZIPs yet.</td></tr>';document.getElementById('latestDownload').innerHTML=packages[0]?'<a class="btn download" href="'+api('/api/platform-packages/'+encodeURIComponent(packages[0].package_id)+'/download')+'">⬇ Download latest completed platform ZIP</a>':'';
 const done=completeTasks.slice(-80).reverse();document.getElementById('screenCount').textContent=s.complete+' complete';document.getElementById('gallery').innerHTML=done.map(x=>{const visual=x.asset_available?'<img loading="lazy" src="'+api('/api/screens/'+encodeURIComponent(x.task_id)+'/preview')+'">':'<div style="aspect-ratio:16/10;background:#f1f5f9;display:grid;place-items:center;padding:16px;text-align:center;color:#475569"><div><b>Verified prior screen</b><br><span style="font-size:11px">'+esc(x.external_filename||'external asset')+'</span></div></div>';return '<div class="thumb">'+visual+'<div class="meta"><b>'+esc(x.screen_id)+'</b> · '+esc(x.platform)+'<br>'+esc(x.title)+'<br><span class="pill">'+esc(x.status)+'</span> · QA '+esc(x.basic_qa)+(x.implementation_ready?' · implementation ready':'')+'</div></div>'}).join('');
 }catch(e){document.getElementById('liveLine').innerHTML='<span style="color:#be123c;font-weight:800">Connection error</span>';showNotice('Live refresh failed: '+e.message,'err')}finally{refreshing=false}}
refresh();setInterval(refresh,2000);
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
