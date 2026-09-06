import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
const UPSTREAM_HOST='127.0.0.1',UPSTREAM_PORT=9121,PORT=Number(process.env.PORT||9122);
const TOKEN_FILE='/var/lib/dial-control/secrets/screen-factory-public.token';
fs.mkdirSync('/var/lib/dial-control/secrets',{recursive:true,mode:0o700});
if(!fs.existsSync(TOKEN_FILE)) fs.writeFileSync(TOKEN_FILE,crypto.randomBytes(24).toString('base64url'),{mode:0o600});
const TOKEN=fs.readFileSync(TOKEN_FILE,'utf8').trim();
const PREFIX=`/sf/${TOKEN}`;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  if(!(url.pathname===PREFIX||url.pathname.startsWith(`${PREFIX}/`))){res.writeHead(403,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});return res.end('Access denied');}
  let upstreamPath=url.pathname.slice(PREFIX.length)||'/'; upstreamPath+=url.search;
  const headers={...req.headers,host:`${UPSTREAM_HOST}:${UPSTREAM_PORT}`};
  const p=http.request({host:UPSTREAM_HOST,port:UPSTREAM_PORT,path:upstreamPath,method:req.method,headers},u=>{
    const outHeaders={...u.headers,'cache-control':'no-store'};delete outHeaders['connection'];delete outHeaders['keep-alive'];
    res.writeHead(u.statusCode||502,outHeaders);u.pipe(res);
  });
  p.on('error',e=>{res.writeHead(502,{'content-type':'text/plain'});res.end(`Upstream error: ${e.message}`);});req.pipe(p);
});
server.listen(PORT,'127.0.0.1',()=>console.log(`Protected Screen Factory http://127.0.0.1:${PORT}${PREFIX}/`));
const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);