#!/usr/bin/env node
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import dns from "node:dns/promises";
import net from "node:net";
import { chromium } from "playwright";
import { Stagehand, localBrowser } from "@browserbasehq/stagehand";

const BIND=process.env.DIAL_BROWSER_BIND||"127.0.0.1";
const PORT=Number(process.env.DIAL_BROWSER_PORT||9150);
const TOKEN_FILE=process.env.DIAL_BROWSER_TOKEN_FILE||"/var/lib/dial-browser/secrets/api.token";
const AUTH_MODE=process.env.DIAL_BROWSER_AUTH_MODE||"SSH_TUNNEL_ONLY";
const EVIDENCE_ROOT=process.env.DIAL_BROWSER_EVIDENCE_ROOT||"/var/lib/dial-browser/evidence";
const MAX_BODY=Number(process.env.DIAL_BROWSER_MAX_BODY_BYTES||65536);
const MAX_RESULT=Number(process.env.DIAL_BROWSER_MAX_RESULT_BYTES||180000);
const NAV_TIMEOUT=Number(process.env.DIAL_BROWSER_NAV_TIMEOUT_MS||20000);
const MAX_LINKS=Number(process.env.DIAL_BROWSER_MAX_LINKS||12);
const STAGEHAND_PROXY=process.env.DIAL_STAGEHAND_MODEL_PROXY||"http://127.0.0.1:9152";
const STAGEHAND_CHROME=process.env.DIAL_STAGEHAND_CHROME_PATH||"";
const token=AUTH_MODE==="TOKEN"&&fs.existsSync(TOKEN_FILE)?fs.readFileSync(TOKEN_FILE,"utf8").trim():"";

const sha=v=>crypto.createHash("sha256").update(typeof v==="string"?v:JSON.stringify(v)).digest("hex");
const now=()=>new Date().toISOString();
const bounded=(v,n=12000)=>{const s=String(v??"");return s.length>n?s.slice(0,n)+"…[bounded]":s};

function privateIp(ip){
  if(!net.isIP(ip)) return true;
  if(ip==="::1"||ip==="0.0.0.0") return true;
  if(ip.startsWith("127.")||ip.startsWith("10.")||ip.startsWith("192.168.")||ip.startsWith("169.254.")) return true;
  const m=ip.match(/^172\.(\d+)\./); if(m && +m[1]>=16 && +m[1]<=31) return true;
  if(ip.startsWith("100.64.")||ip.startsWith("198.18.")) return true;
  if(ip.includes(":") && (/^f[cd]/i.test(ip)||/^fe[89ab]/i.test(ip))) return true;
  return false;
}

export async function assertPublicHttps(raw){
  const u=new URL(String(raw||""));
  if(u.protocol!=="https:") throw new Error("PUBLIC_HTTPS_REQUIRED");
  const h=u.hostname.toLowerCase();
  if(h==="localhost"||h.endsWith(".local")||h.endsWith(".internal")) throw new Error("PRIVATE_HOST_REJECTED");
  const rows=await dns.lookup(h,{all:true,verbatim:true});
  if(!rows.length||rows.some(r=>privateIp(r.address))) throw new Error("PRIVATE_DNS_TARGET_REJECTED");
  return u;
}

function normalize({sourceUrl,finalUrl,method,text,html,trace=[],links=[]}){
  const body=bounded(text,MAX_RESULT);
  const pageHash=sha(html||body);
  const contentHash=sha(body);
  return {
    schema_version:1,
    authority:"NON_AUTHORITATIVE_RESEARCH",
    acquisition_method:method,
    source_url:sourceUrl,
    final_url:finalUrl,
    content_hash:contentHash,
    page_snapshot_hash:pageHash,
    interaction_trace_hash:sha(trace),
    observed_at:now(),
    source_kind:"PUBLIC_WEB",
    trust_suggestion:"T4_COMMUNITY_SIGNAL",
    candidate_id:"DISC-"+sha(finalUrl).slice(0,24),
    excerpt:body,
    links:links.slice(0,MAX_LINKS),
  };
}

async function withBrowser(fn){
  const browser=await chromium.launch({headless:true});
  try{return await fn(browser);} finally{await browser.close();}
}

async function rendered(url,method="BROWSER_RENDERED"){
  await assertPublicHttps(url);
  return withBrowser(async browser=>{
    const ctx=await browser.newContext({acceptDownloads:false,serviceWorkers:"block"});
    const page=await ctx.newPage();
    const trace=[{op:"goto",url}];
    await page.route("**/*",async route=>{
      try{
        await assertPublicHttps(route.request().url());
        await route.continue();
      }catch{
        await route.abort();
      }
    });
    const navResponse=await page.goto(url,{waitUntil:"domcontentloaded",timeout:NAV_TIMEOUT});
    const finalUrl=navResponse?.url ? navResponse.url() : url;
    await assertPublicHttps(finalUrl);
    const text=await page.locator("body").innerText({timeout:5000}).catch(()=> "");
    const html=await page.content();
    const links=await page.locator("a[href]").evaluateAll((els,max)=>els.slice(0,max).map(a=>({text:(a.textContent||"").trim().slice(0,180),url:a.href})),MAX_LINKS).catch(()=>[]);
    await ctx.close();
    const out=normalize({sourceUrl:url,finalUrl:page.url(),method,text,html,trace,links});
    fs.mkdirSync(EVIDENCE_ROOT,{recursive:true});
    fs.writeFileSync(EVIDENCE_ROOT+"/"+out.page_snapshot_hash+".json",JSON.stringify(out));
    return out;
  });
}

function decodeBingRedirect(raw){
  try{
    const u=new URL(raw);
    if(!u.hostname.endsWith("bing.com")) return raw;
    const encoded=u.searchParams.get("u");
    if(!encoded||!encoded.startsWith("a1")) return raw;
    let b64=encoded.slice(2).replace(/-/g,"+").replace(/_/g,"/");
    while(b64.length%4) b64+="=";
    const decoded=Buffer.from(b64,"base64").toString("utf8");
    return decoded.startsWith("https://")?decoded:raw;
  }catch{return raw}
}

async function browserSearch(query){
  const q=String(query||"").trim().slice(0,500); if(!q) throw new Error("QUERY_REQUIRED");
  return withBrowser(async browser=>{
    const ctx=await browser.newContext({acceptDownloads:false,serviceWorkers:"block"});
    const page=await ctx.newPage();
    const attempts=[
      {engine:"BING",url:"https://www.bing.com/search?q="+encodeURIComponent(q),selector:"li.b_algo h2 a, a[href]"},
      {engine:"BRAVE",url:"https://search.brave.com/search?q="+encodeURIComponent(q)+"&source=web",selector:"a[href]"},
      {engine:"DUCKDUCKGO",url:"https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),selector:"a.result__a, a[href]"},
      {engine:"GITHUB",url:"https://github.com/search?q="+encodeURIComponent(q)+"&type=repositories",selector:"div.search-title a, a.Link--primary, a[href]"}
    ];
    const engineHosts=new Set(["www.bing.com","bing.com","search.brave.com","html.duckduckgo.com","duckduckgo.com","github.com"]);
    let safe=[], used=null, finalUrl=null, html="";
    for(const attempt of attempts){
      try{
        await assertPublicHttps(attempt.url);
        await page.goto(attempt.url,{waitUntil:"domcontentloaded",timeout:NAV_TIMEOUT});
        await page.waitForTimeout(1800);
        const rows=await page.locator(attempt.selector).evaluateAll((els,max)=>els.slice(0,max*8).map(a=>({
          title:(a.textContent||"").trim().replace(/\s+/g," ").slice(0,240),
          url:a.href,
          snippet:(a.closest("li,article,div")?.textContent||"").trim().replace(/\s+/g," ").slice(0,700)
        })),MAX_LINKS).catch(()=>[]);
        const dedup=new Map();
        for(const row of rows){
          try{
            if(!row.url||row.url.startsWith("javascript:")||!row.title) continue;
            const normalizedUrl=decodeBingRedirect(row.url);
            const u=await assertPublicHttps(normalizedUrl);
            if(engineHosts.has(u.hostname.toLowerCase())) continue;
            const key=u.href.replace(/[#?].*$/,"");
            if(!dedup.has(key)) dedup.set(key,{...row,url:u.href,search_redirect_url:u.href===row.url?null:row.url});
          }catch{}
        }
        safe=[...dedup.values()].slice(0,MAX_LINKS);
        if(safe.length){used=attempt.engine;finalUrl=page.url();html=await page.content();break;}
      }catch{}
    }
    if(!safe.length){
      await ctx.close();
      const e=new Error("BROWSER_SEARCH_NO_RESULTS"); e.status=502; throw e;
    }
    const text=safe.map((r,i)=>(i+1)+". "+r.title+"\n"+r.url+"\n"+r.snippet).join("\n\n");
    const out=normalize({sourceUrl:finalUrl,finalUrl,method:"BROWSER_SEARCH",text,html,trace:[{op:"search",query:q,engine:used}],links:safe});
    out.search_engine=used;
    await ctx.close();
    return out;
  });
}

async function stagehandGenerate(input){
  const r=await fetch(STAGEHAND_PROXY+"/v1/generate",{
    method:"POST",
    signal:AbortSignal.timeout(70000),
    headers:{"content-type":"application/json"},
    body:JSON.stringify(input),
  });
  const body=await r.json().catch(()=>null);
  if(!r.ok||!body?.ok||!body?.output) throw new Error("STAGEHAND_MODEL_PROXY_"+(body?.error||"HTTP_"+r.status));
  return body.output;
}

async function semanticExtractOnce(url,instruction,attempt){
  const profileDir=(process.env.DIAL_BROWSER_PROFILE_ROOT||"/var/lib/dial-browser/profiles")+"/stagehand-"+crypto.randomUUID();
  const launchOptions={
    headless:true,
    chromiumSandbox:false,
    acceptDownloads:false,
    preserveUserDataDir:false,
    userDataDir:profileDir,
    args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--no-first-run","--disable-background-networking"],
  };
  if(STAGEHAND_CHROME) launchOptions.executablePath=STAGEHAND_CHROME;
  const browser=await localBrowser.launch(launchOptions);
  let stagehand;
  try{
    stagehand=await Stagehand.create({
      browser,
      model:{generate:stagehandGenerate},
      selfHeal:true,
      cache:false,
      domSettleTimeoutMs:3000,
      logging:{level:"warn",format:"json"},
    });
    const pages=await stagehand.browser.context.pages();
    const page=pages[0] || (await stagehand.browser.context.newPage());
    const navResponse=await page.goto(url,{waitUntil:"domcontentloaded",timeout:NAV_TIMEOUT});
    const finalUrl=navResponse?.url ? navResponse.url() : url;
    await assertPublicHttps(finalUrl);
    const extraction=await stagehand.extract(String(instruction||"Extract the relevant engineering evidence from this page.").slice(0,1600));
    const data=extraction?.data??extraction;
    const text=typeof data==="string"?data:JSON.stringify(data);
    const snapshot=await page.snapshot().catch(()=>null);
    const snapshotText=snapshot?JSON.stringify(snapshot):text;
    return normalize({
      sourceUrl:url,
      finalUrl,
      method:"STAGEHAND_NAVIGATION",
      text,
      html:snapshotText,
      trace:[{op:"stagehand_extract",instruction:String(instruction||"").slice(0,1600),attempt}],
      links:[],
    });
  } finally {
    if(stagehand) await stagehand.close().catch(()=>{});
    await browser.close().catch(()=>{});
    try{fs.rmSync(profileDir,{recursive:true,force:true})}catch{}
  }
}

async function semanticExtract(url,instruction){
  if(process.env.DIAL_STAGEHAND_ENABLED!=="1"){
    const e=new Error("STAGEHAND_DISABLED_FAIL_CLOSED"); e.status=503; throw e;
  }
  await assertPublicHttps(url);
  const health=await fetch(STAGEHAND_PROXY+"/healthz",{signal:AbortSignal.timeout(3000)}).catch(()=>null);
  if(!health?.ok){const e=new Error("STAGEHAND_MODEL_PROXY_UNAVAILABLE");e.status=503;throw e}
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{return await semanticExtractOnce(url,instruction,attempt)}
    catch(error){
      lastError=error;
      const transient=/No target with given id|Target closed|Session closed|browser has been closed/i.test(String(error?.message||error));
      if(!transient||attempt===3) throw error;
      await new Promise(r=>setTimeout(r,250*attempt));
    }
  }
  throw lastError;
}

async function handle(op,body){
  if(op==="browser_search") return browserSearch(body.query);
  if(op==="fetch_rendered") return rendered(body.url,"BROWSER_RENDERED");
  if(op==="inspect_repository_docs") return rendered(body.url,"REPOSITORY_INSPECTION");
  if(op==="inspect_official_docs") return rendered(body.url,"OFFICIAL_DOC_INSPECTION");
  if(op==="follow_relevant_links"){
    const first=await rendered(body.url,"BROWSER_RENDERED");
    return {...first,links:first.links.slice(0,Math.min(MAX_LINKS,Number(body.limit||5)))};
  }
  if(op==="semantic_extract") return semanticExtract(body.url,body.instruction||"extract relevant engineering evidence");
  const e=new Error("OPERATION_NOT_ALLOWED"); e.status=400; throw e;
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==="/healthz"){
      res.writeHead(200,{"content-type":"application/json"});
      return res.end(JSON.stringify({status:"ok",auth_mode:AUTH_MODE,stagehand_enabled:process.env.DIAL_STAGEHAND_ENABLED==="1",playwright:"1.63.0",port:PORT}));
    }
    if(req.method!=="POST"||req.url!=="/v1/acquire"){const e=new Error("NOT_FOUND");e.status=404;throw e}
    if(AUTH_MODE==="TOKEN"&&req.headers.authorization!=="Bearer "+token){const e=new Error("UNAUTHORIZED");e.status=401;throw e}
    let n=0,chunks=[]; for await(const c of req){n+=c.length;if(n>MAX_BODY){const e=new Error("REQUEST_TOO_LARGE");e.status=413;throw e}chunks.push(c)}
    const body=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
    const result=await handle(body.operation,body);
    res.writeHead(200,{"content-type":"application/json"});
    res.end(JSON.stringify({ok:true,result}));
  }catch(e){
    console.error(JSON.stringify({event:"DIAL_BROWSER_REQUEST_FAILED",error:e?.message||String(e),stack:String(e?.stack||"").slice(0,4000)}));
    res.writeHead(e.status||500,{"content-type":"application/json"});
    res.end(JSON.stringify({ok:false,error:e.message}));
  }
});
server.listen(PORT,BIND,()=>console.log(JSON.stringify({event:"DIAL_BROWSER_FABRIC_READY",bind:BIND,port:PORT})));
