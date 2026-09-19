import fs from "node:fs";
import crypto from "node:crypto";

const ENDPOINT=process.env.DIAL_BROWSER_FABRIC_URL||"http://127.0.0.1:9150";
const TOKEN_FILE=process.env.DIAL_BROWSER_TOKEN_FILE||"/var/lib/dial-control/secrets/browser-fabric.token";
const AUTH_MODE=process.env.DIAL_BROWSER_AUTH_MODE||"SSH_TUNNEL_ONLY";
const sha=v=>crypto.createHash("sha256").update(typeof v==="string"?v:JSON.stringify(v)).digest("hex");

export function browserFabricCredentialStatus(){
  return {
    configured: AUTH_MODE==="SSH_TUNNEL_ONLY" || (fs.existsSync(TOKEN_FILE) && Boolean(fs.readFileSync(TOKEN_FILE,"utf8").trim())),
    auth_mode: AUTH_MODE,
    token_file: AUTH_MODE==="TOKEN" ? TOKEN_FILE : null,
    endpoint: ENDPOINT,
    material_exposed:false,
  };
}

export async function browserFabricHealth(fetchImpl=fetch){
  try{
    const r=await fetchImpl(ENDPOINT+"/healthz",{signal:AbortSignal.timeout(3000)});
    if(!r.ok) return {ok:false,status:r.status};
    return {ok:true,...await r.json()};
  }catch(error){
    return {ok:false,error:String(error?.message||error)};
  }
}

export async function callBrowserFabric(operation,input={},fetchImpl=fetch){
  let token="";
  if(AUTH_MODE==="TOKEN"){
    if(!fs.existsSync(TOKEN_FILE)) throw new Error("BROWSER_FABRIC_TOKEN_REQUIRED");
    token=fs.readFileSync(TOKEN_FILE,"utf8").trim();
    if(!token) throw new Error("BROWSER_FABRIC_TOKEN_REQUIRED");
  }
  const started=Date.now();
  const response=await fetchImpl(ENDPOINT+"/v1/acquire",{
    method:"POST",
    signal:AbortSignal.timeout(operation==="semantic_extract"?75000:30000),
    headers:{...(AUTH_MODE==="TOKEN"?{authorization:"Bearer "+token}:{}),"content-type":"application/json"},
    body:JSON.stringify({operation,...input}),
  });
  const raw=await response.text();
  let body; try{body=JSON.parse(raw)}catch{throw new Error("BROWSER_FABRIC_INVALID_JSON")}
  if(!response.ok||!body?.ok) throw new Error("BROWSER_FABRIC_"+(body?.error||"HTTP_"+response.status));
  const result=body.result;
  if(!result?.content_hash||!result?.page_snapshot_hash||!result?.interaction_trace_hash) throw new Error("BROWSER_FABRIC_EVIDENCE_INCOMPLETE");
  return {...result,acquisition_latency_ms:Date.now()-started,acquisition_response_hash:sha(raw)};
}

export async function browserSearch(query,fetchImpl=fetch){
  return callBrowserFabric("browser_search",{query},fetchImpl);
}
export async function browserRenderedRead(url,fetchImpl=fetch){
  return callBrowserFabric("fetch_rendered",{url},fetchImpl);
}
export async function stagehandSemanticExtract(url,instruction,fetchImpl=fetch){
  return callBrowserFabric("semantic_extract",{url,instruction},fetchImpl);
}
