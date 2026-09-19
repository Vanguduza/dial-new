#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";

const PORT=Number(process.env.DIAL_STAGEHAND_MODEL_PROXY_PORT||9152);
const KEY_FILE=process.env.GROQ_API_KEY_FILE||"/var/lib/dial-worker/secrets/groq-api.key";
const ZDR_FILE=process.env.GROQ_ZDR_MARKER_FILE||"/var/lib/dial-worker/secrets/groq-zdr-enabled";
const MODEL=process.env.DIAL_STAGEHAND_MODEL||"openai/gpt-oss-20b";
const MAX_BODY=Number(process.env.DIAL_STAGEHAND_MODEL_MAX_BODY||262144);
const key=fs.readFileSync(KEY_FILE,"utf8").trim();
if(!key||!fs.existsSync(ZDR_FILE)) throw new Error("GROQ_CREDENTIAL_OR_ZDR_MARKER_MISSING");

function compactText(value,max=12000){
  const s=String(value??"");
  if(s.length<=max) return s;
  const head=Math.floor(max*0.68), tail=max-head;
  return s.slice(0,head)+"\n...[STAGEHAND_PROMPT_COMPACTED]...\n"+s.slice(-tail);
}
function textPart(content){
  if(typeof content==="string") return compactText(content);
  const rows=Array.isArray(content)?content:[content];
  const joined=rows.filter(Boolean).map(x=>{
    if(x.type==="text") return x.text||"";
    if(x.type==="tool_result") return JSON.stringify(x.structuredContent||x.content||{});
    if(x.type==="tool_use") return JSON.stringify({tool:x.name,input:x.input});
    if(x.type==="image") throw new Error("IMAGE_INPUT_NOT_ALLOWED");
    return "";
  }).filter(Boolean).join("\n");
  return compactText(joined);
}

function toGroqMessages(input,{systemMax=4500,messageMax=8500,totalMax=15000}={}){
  const out=[];
  if(input.systemPrompt) out.push({role:"system",content:compactText(input.systemPrompt,systemMax)});
  for(const m of input.messages||[]) out.push({role:m.role,content:compactText(textPart(m.content),messageMax)});
  let total=out.reduce((n,m)=>n+m.content.length,0);
  while(total>totalMax && out.length){
    const target=out.reduce((best,m,i)=>m.content.length>out[best].content.length?i:best,0);
    out[target]={...out[target],content:compactText(out[target].content,Math.max(2200,out[target].content.length-2500))};
    total=out.reduce((n,m)=>n+m.content.length,0);
  }
  return out;
}
async function generate(input){
  const body={model:MODEL,messages:toGroqMessages(input),temperature:Number.isFinite(input.temperature)?input.temperature:0.1,max_tokens:900,reasoning_effort:"low"};
  if(input.stopSequences?.length) body.stop=input.stopSequences.slice(0,8);
  if(input.responseFormat?.type==="json_schema"){
    body.messages=[
      ...body.messages,
      {role:"system",content:"Return one JSON object matching this schema. No markdown. Schema: "+JSON.stringify(input.responseFormat.schema).slice(0,5000)}
    ];
  }
  async function invoke(payload){
    let attempt=0;
    while(true){
      attempt++;
      const response=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",signal:AbortSignal.timeout(30000),headers:{authorization:"Bearer "+key,"content-type":"application/json"},body:JSON.stringify(payload)});
      const raw=await response.text();
      if(response.status!==429 || attempt>=3) return {response,raw};
      const match=raw.match(/try again in\s+([0-9.]+)s/i);
      const waitMs=Math.min(30000,Math.max(1000,Math.ceil(Number(match?.[1]||2)*1000)+350));
      console.error(JSON.stringify({event:"GROQ_STAGEHAND_RATE_LIMIT_RETRY",attempt,wait_ms:waitMs}));
      await new Promise(resolve=>setTimeout(resolve,waitMs));
    }
  }
  let {response:r,raw}=await invoke(body);
  let coercedStructured=null;
  if(r.status===413){
    const reduced={...body,max_tokens:600,messages:toGroqMessages(input,{systemMax:2800,messageMax:6500,totalMax:10500})};
    console.error(JSON.stringify({event:"GROQ_STAGEHAND_TPM_REDUCE_RETRY",message_count:reduced.messages.length}));
    ({response:r,raw}=await invoke(reduced));
  }
  if(!r.ok && input.responseFormat?.type==="json_schema"){
    let providerError={}; try{providerError=JSON.parse(raw)}catch{}
    if(r.status===400 && providerError?.error?.code==="json_validate_failed"){
      const schema=input.responseFormat.schema||{};
      const required=Array.isArray(schema.required)?schema.required:[];
      const simpleKey=required.length===1 && schema.properties?.[required[0]]?.type==="string" ? required[0] : null;
      if(simpleKey){
        const retryBody={...body};
        delete retryBody.response_format;
        retryBody.max_tokens=800;
        retryBody.messages=[
          ...body.messages,
          {role:"system",content:"Answer the extraction request in plain text only. Do not emit JSON, markdown fences, or commentary about the task."}
        ];
        ({response:r,raw}=await invoke(retryBody));
        if(r.ok){
          const retryData=JSON.parse(raw);
          const plain=String(retryData.choices?.[0]?.message?.content||"").trim();
          if(!plain) throw new Error("GROQ_STAGEHAND_EMPTY_EXTRACTION");
          coercedStructured={[simpleKey]:plain};
          console.error(JSON.stringify({event:"GROQ_STAGEHAND_SIMPLE_SCHEMA_COERCED",model:MODEL,key:simpleKey}));
        }
      } else {
        const schemaText=JSON.stringify(schema);
        const retryBody={...body,response_format:{type:"json_object"},messages:[
          ...body.messages,
          {role:"system",content:"Return ONLY one valid JSON object conforming exactly to this JSON Schema. Do not use markdown or commentary. Schema: "+schemaText.slice(0,8000)}
        ]};
        ({response:r,raw}=await invoke(retryBody));
        if(r.ok) console.error(JSON.stringify({event:"GROQ_STAGEHAND_SCHEMA_RETRY_SUCCEEDED",model:MODEL}));
      }
    }
  }
  if(!r.ok){ console.error(JSON.stringify({event:"GROQ_STAGEHAND_REJECTED",status:r.status,response:raw.slice(0,1200),response_format:body.response_format||null,message_count:body.messages.length})); throw Object.assign(new Error("GROQ_STAGEHAND_HTTP_"+r.status),{detail:raw.slice(0,500)}); }
  let data=JSON.parse(raw);
  let msg=data.choices?.[0]?.message||{};
  let content=String(msg.content||"").trim();
  if(!content && input.responseFormat?.type==="json_schema"){
    const lastUser=[...body.messages].reverse().find(m=>m.role==="user")?.content||"";
    const retryBody={
      model:MODEL,
      messages:[
        {role:"system",content:"Extract the requested factual information from the supplied page context. Return concise plain text only. If evidence is insufficient, say so explicitly."},
        {role:"user",content:compactText(lastUser,7000)}
      ],
      temperature:0,
      max_tokens:700,
      reasoning_effort:"low"
    };
    const retry=await invoke(retryBody);
    if(retry.response.ok){
      data=JSON.parse(retry.raw);
      msg=data.choices?.[0]?.message||{};
      content=String(msg.content||"").trim();
      console.error(JSON.stringify({event:"GROQ_STAGEHAND_EMPTY_CONTENT_RETRY",success:Boolean(content)}));
    }
  }
  const usage=data.usage||{};
  const base={role:"assistant",content:{type:"text",text:content},stopReason:data.choices?.[0]?.finish_reason||"stop",usage:{inputTokens:usage.prompt_tokens||0,outputTokens:usage.completion_tokens||0,totalTokens:usage.total_tokens||0}};
  if(input.responseFormat?.type==="json_schema"){
    let structuredContent=coercedStructured;
    if(!structuredContent){
      try{
        structuredContent=JSON.parse(content);
      }catch{
        const schema=input.responseFormat.schema||{};
        const required=Array.isArray(schema.required)?schema.required:[];
        const simpleKey=required.length===1 && schema.properties?.[required[0]]?.type==="string" ? required[0] : null;
        if(!simpleKey) throw new Error("GROQ_STAGEHAND_INVALID_STRUCTURED_JSON");
        structuredContent={ [simpleKey]: content.trim() };
        console.error(JSON.stringify({event:"GROQ_STAGEHAND_LOCAL_SCHEMA_COERCION",model:MODEL,key:simpleKey}));
      }
    }
    return {...base,structuredContent,outputFormat:"json_schema"};
  }
  return {...base,outputFormat:"text"};
}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==="/healthz"){res.writeHead(200,{"content-type":"application/json"});return res.end(JSON.stringify({status:"ok",provider:"groq",model:MODEL,zdr_marker:true}));}
    if(req.method!=="POST"||req.url!=="/v1/generate"){res.writeHead(404);return res.end()}
    let n=0,chunks=[];for await(const c of req){n+=c.length;if(n>MAX_BODY)throw Object.assign(new Error("REQUEST_TOO_LARGE"),{status:413});chunks.push(c)}
    const input=JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
    const output=await generate(input);
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,output}));
  }catch(e){res.writeHead(e.status||500,{"content-type":"application/json"});res.end(JSON.stringify({ok:false,error:e.message}))}
});
server.listen(PORT,"127.0.0.1",()=>console.log(JSON.stringify({event:"DIAL_STAGEHAND_MODEL_PROXY_READY",port:PORT,model:MODEL})));
