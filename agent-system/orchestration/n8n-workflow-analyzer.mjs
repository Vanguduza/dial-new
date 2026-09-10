import crypto from 'node:crypto';

export const N8N_ANALYZER_VERSION='n8n-analyzer-v1';
const order={INFO:0,LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4};
function sha256(v){return crypto.createHash('sha256').update(v).digest('hex');}
function uniq(xs){return [...new Set(xs.filter(Boolean))].sort();}
function highest(findings){return findings.reduce((m,f)=>(order[f.severity]||0)>(order[m]||0)?f.severity:m,'INFO');}
function finding(code,severity,detail){return{code,severity,location:'workflow',detail:detail||null};}

export function analyzeSanitizedN8nWorkflow(sanitized){
 if(!sanitized||sanitized.schema_version!==1)throw new Error('sanitized workflow v1 required');
 const findings=[...(sanitized.findings||[])]; const caps=new Set(sanitized.capabilities||[]); const controls=new Set(sanitized.required_controls||[]);
 const sideEffecting=['HTTP_CALL','DATABASE','NOTIFY','FILESYSTEM','SHELL_EXECUTION','SSH'].some((x)=>caps.has(x));
 if(caps.has('AI_AGENT')&&caps.has('SHELL_EXECUTION'))findings.push(finding('AI_TO_SHELL_PATH','CRITICAL'));
 if(caps.has('AI_AGENT')&&caps.has('HTTP_CALL'))findings.push(finding('AI_TO_NETWORK_PATH','HIGH'));
 if(caps.has('AI_AGENT')&&caps.has('DATABASE'))findings.push(finding('AI_TO_DATABASE_PATH','HIGH'));
 if(caps.has('AI_AGENT')&&caps.has('MCP_CLIENT'))findings.push(finding('AI_TO_MCP_PATH','HIGH'));
 if(sideEffecting)controls.add('IDEMPOTENCY_WHERE_SIDE_EFFECTING');
 if((sanitized.trigger_classes||[]).includes('WEBHOOK'))controls.add('REPLAY_PROTECTION');
 const retryObserved=(sanitized.nodes||[]).some((n)=>n.behavior?.retry_on_fail===true||/continue|error/i.test(String(n.behavior?.on_error||'')));
 const idempotencyObserved=(sanitized.nodes||[]).some((n)=>/dedup|idempot|unique/i.test([n.type,...(n.parameter_keys||[])].join(' ')));
 const unknown=(sanitized.compatibility?.unknown_or_community_node_count||0)>0;
 const risk=highest(findings);
 const positiveEligible=(order[risk]||0)<order.HIGH && !unknown;
 const analysis={schema_version:1,analyzer_version:N8N_ANALYZER_VERSION,node_count:sanitized.node_count,trigger_classes:uniq(sanitized.trigger_classes||[]),capabilities:uniq(sanitized.capabilities||[]),required_controls:uniq([...controls]),security_findings:findings.sort((a,b)=>a.code.localeCompare(b.code)||String(a.location).localeCompare(String(b.location))),risk_severity:risk,side_effecting:sideEffecting,retry:{observed:retryObserved,required:sideEffecting},idempotency:{observed:idempotencyObserved,required:sideEffecting},compatibility:{...sanitized.compatibility,runtime_compatible:false},positive_guidance_eligible:positiveEligible,knowledge_polarity:positiveEligible?'POSITIVE_PATTERN':'ANTI_PATTERN',raw_workflow_persisted:false};
 return {...analysis,analysis_hash:sha256(JSON.stringify(analysis))};
}
