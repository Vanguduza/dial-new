#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { hashObject, now } from './knowledge-graph-core.mjs';
import { buildSourceManifest } from './structural-source-manifest.mjs';
import { writeJsonAtomic } from './state-store.mjs';

export function qualifyGraphify({repoDir,root,command='graphify',requiredVersion='0.9.58',noEgressProven=process.env.DIAL_GRAPHIFY_NO_EGRESS_PROVEN==='1'}={}){
 if(!repoDir)throw new Error('repoDir required');const sourcePolicy={profile:'DIAL_CODE_ONLY_V1'};const before=buildSourceManifest({repoDir,declarations:['**/*'],policy:sourcePolicy});let versionText='',helpText='',schemaText='';const failures=[];
 try{versionText=execFileSync(command,['--version'],{cwd:repoDir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000}).trim();}catch(e){failures.push('VERSION_PROBE_FAILED');}
 const version=(versionText.match(/(\d+\.\d+\.\d+)/)||[])[1]||null;if(version!==requiredVersion)failures.push('VERSION_MISMATCH');
 try{helpText=execFileSync(command,['--help'],{cwd:repoDir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000});}catch(e){failures.push('HELP_PROBE_FAILED');}
 try{schemaText=execFileSync(command,['schema','--help'],{cwd:repoDir,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:20000});}catch{schemaText='schema-help-unavailable';}
 const after=buildSourceManifest({repoDir,declarations:['**/*'],policy:sourcePolicy});if(before.source_manifest_hash!==after.source_manifest_hash)failures.push('SOURCE_TREE_MUTATED');if(!noEgressProven)failures.push('NO_EGRESS_UNPROVEN');
 const evidence={schema_version:1,provider:'graphify',version,required_version:requiredVersion,version_output_hash:hashObject(versionText),help_hash:hashObject(helpText),parser_versions_hash:hashObject({graphify_version:version,help:helpText}),schema_sample_hash:hashObject(schemaText),no_egress_proven:noEgressProven,source_tree_immutable_proven:before.source_manifest_hash===after.source_manifest_hash,source_manifest_hash:before.source_manifest_hash,status:failures.length?'NOT_QUALIFIED':'QUALIFIED',failures,observed_at:now()};evidence.evidence_hash=hashObject({...evidence,observed_at:null,evidence_hash:null});if(root)writeJsonAtomic('knowledge/structural/qualification/graphify.json',evidence,root);return evidence;
}
if(import.meta.url===`file://${process.argv[1]}`){const repoDir=process.argv[2]||process.cwd();const result=qualifyGraphify({repoDir});console.log(JSON.stringify(result,null,2));process.exitCode=result.status==='QUALIFIED'?0:2;}
