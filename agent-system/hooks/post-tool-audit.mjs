import { createHash } from 'node:crypto';
import { appendJsonl } from '../orchestration/state-store.mjs';
import { isConsequentialToolUse } from '../orchestration/shell-effect-classifier.mjs';

let input=''; for await (const chunk of process.stdin) input+=chunk;
let event={}; try{event=JSON.parse(input);}catch{}
const tool=event.tool_name||''; const toolInput=event.tool_input||{};
if(isConsequentialToolUse(tool,toolInput)){
 const digest=(value)=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
 try{appendJsonl('events/tool-invocations.jsonl',{event:'TOOL_INVOCATION_AFTER',tool_name:tool,tool_input_sha256:digest(toolInput),tool_result_sha256:digest(event.tool_response??event.tool_result??null),packet_id:process.env.DIAL_PACKET_ID||null,task_id:process.env.DIAL_TASK_ID||null,success:event.tool_error==null,at:new Date().toISOString()},process.env.DIAL_CONTROL_HOME||undefined);}catch{}
}
