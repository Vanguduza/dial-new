import fs from 'node:fs';
import path from 'node:path';
import { hashObject, sha256 } from './knowledge-graph-core.mjs';

const DEFAULT_EXCLUDED_DIRS=new Set(['.git','node_modules','dist','build','coverage','.cache','.next','.turbo']);
function posix(p){return p.split(path.sep).join('/');}
function globRegex(pattern){
 const s=String(pattern||'').replaceAll('\\','/'); let out='^';
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(c==='*'){
   if(s[i+1]==='*'){i++; if(s[i+1]==='/'){i++;out+='(?:.*/)?';}else out+='.*';}
   else out+='[^/]*';
  } else if(c==='?') out+='[^/]';
  else out+=c.replace(/[|\\{}()[\]^$+?.]/g,'\\$&');
 }
 return new RegExp(out+'$');
}
function inside(root,target){const rel=path.relative(root,target);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));}
function walk(root,{excludedDirs=DEFAULT_EXCLUDED_DIRS,excludePrefixes=[]}={}){
 const rows=[]; const visit=(abs)=>{
  const st=fs.lstatSync(abs); const rel=posix(path.relative(root,abs));
  if(rel&&excludePrefixes.some((p)=>rel.startsWith(p)))return;
  if(st.isSymbolicLink()){rows.push({path:rel,kind:'SYMLINK',bytes:Buffer.byteLength(fs.readlinkSync(abs)),content_hash:sha256(`SYMLINK:${fs.readlinkSync(abs)}`)});return;}
  if(st.isDirectory()){
   if(rel&&excludedDirs.has(path.basename(abs)))return;
   for(const name of fs.readdirSync(abs).sort())visit(path.join(abs,name));
   return;
  }
  if(st.isFile())rows.push({path:rel,kind:'FILE',bytes:st.size,content_hash:sha256(fs.readFileSync(abs))});
 }; visit(root); return rows.filter((x)=>x.path);
}
export function buildSourceManifest({repoDir,declarations=['**/*'],owners={},policy={}}={}){
 if(!repoDir)throw new Error('repoDir required'); const root=path.resolve(repoDir);if(!fs.existsSync(root))throw new Error('repoDir missing');
 const excludeDirs=new Set(policy.exclude_directory_names||[...DEFAULT_EXCLUDED_DIRS]); const excludePrefixes=(policy.exclude_path_prefixes||[]).map((x)=>String(x).replaceAll('\\','/'));
 const all=walk(root,{excludedDirs:excludeDirs,excludePrefixes}); const patterns=[...new Set((declarations||[]).filter(Boolean).map((x)=>String(x).replaceAll('\\','/')))];
 const regs=patterns.map((x)=>[x,globRegex(x.replace(/^\.\//,''))]); const selected=[];const missing=[];
 for(const decl of patterns){
  const abs=path.resolve(root,decl); if(!inside(root,abs))throw new Error(`source declaration escapes repository: ${decl}`);
  const direct=fs.existsSync(abs)&&!/[?*]/.test(decl); let matches=[];
  if(direct){const norm=posix(path.relative(root,abs));matches=all.filter((x)=>x.path===norm||x.path.startsWith(norm+'/'));}
  else {const re=regs.find(([p])=>p===decl)[1];matches=all.filter((x)=>re.test(x.path));}
  if(!matches.length)missing.push(decl);
  for(const row of matches)selected.push({...row,declarations:[decl],owners:[...(owners[decl]||[])]});
 }
 const byPath=new Map();for(const row of selected){const e=byPath.get(row.path);if(!e)byPath.set(row.path,row);else{e.declarations=[...new Set([...e.declarations,...row.declarations])].sort();e.owners=[...new Set([...e.owners,...row.owners])].sort();}}
 const entries=[...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path));
 const identity={profile:policy.profile||'DIAL_CODE_ONLY_V1',declarations:patterns.sort(),missing_declarations:missing.sort(),entries:entries.map(({path,kind,bytes,content_hash,declarations,owners})=>({path,kind,bytes,content_hash,declarations,owners}))};
 return {...identity,file_count:entries.length,total_bytes:entries.reduce((n,x)=>n+x.bytes,0),source_manifest_hash:hashObject(identity)};
}
export function sourceManifestForUnit({repoDir,unit,policy={}}={}){
 if(!unit)throw new Error('unit required');const declarations=[...new Set((unit.affected_paths||[]).filter(Boolean))];
 const safe=declarations.length?declarations:['agent-system/orchestration/**/*.mjs'];
 const owners=Object.fromEntries(safe.map((d)=>[d,[unit.unit_lineage_id]]));
 return buildSourceManifest({repoDir,declarations:safe,owners,policy});
}
