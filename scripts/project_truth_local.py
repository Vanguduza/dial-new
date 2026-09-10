#!/usr/bin/env python3
from __future__ import annotations
import argparse, datetime as dt, fnmatch, hashlib, json, os, pathlib, re, subprocess, sys

R=pathlib.Path(__file__).resolve().parents[1]
L=R/'docs/project-state/CHANGE_LEDGER.jsonl'
C=R/'docs/project-state/CURRENT_STATE.json'
P=R/'docs/project-state/OWNER_AUTHORITY_POLICY.json'
A=R/'docs/project-state/authorizations'
X=[':(exclude)docs/project-state/CHANGE_LEDGER.jsonl',':(exclude)docs/project-state/CURRENT_STATE.json',':(exclude)docs/project-state/LOCAL_CHANGE_LEDGER.jsonl']
SHA_RE=re.compile(r'^[0-9a-f]{40}$',re.I); DIGEST_RE=re.compile(r'^[0-9a-f]{64}$',re.I)

def g(*a,check=True,b=False): return subprocess.run(['git',*a],cwd=R,check=check,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=not b)
def o(*a): return g(*a).stdout.strip()
def policy(): return json.loads(P.read_text()) if P.exists() else {}
def parents(s):
 c=g('rev-list','--parents','-n','1',s,check=False); a=c.stdout.strip().split(); return a[1:] if c.returncode==0 and a else []
def par(s):
 a=parents(s); return a[0] if a else None
def is_ancestor(a,b): return bool(a and b and g('merge-base','--is-ancestor',a,b,check=False).returncode==0)
def reproducible_merge(s):
 a=parents(s)
 if len(a)!=2:return False
 m=g('merge-tree','--write-tree',a[0],a[1],check=False)
 if m.returncode!=0:return False
 lines=[x.strip() for x in m.stdout.splitlines() if x.strip()]
 return bool(lines) and lines[0].split()[0]==o('rev-parse',s+'^{tree}')

def files_staged(): return [x for x in g('diff','--cached','--name-only','--no-renames','--','.',*X).stdout.splitlines() if x]
def status_staged(): return [x.split('\t',1) for x in g('diff','--cached','--name-status','--no-renames').stdout.splitlines() if '\t' in x]
def dig_staged(): return hashlib.sha256(g('diff','--cached','--binary','--no-ext-diff','--no-renames','--','.',*X,b=True).stdout).hexdigest()
def cfiles(s):
 p=par(s); a=('diff','--name-only','--no-renames',p,s,'--','.',*X) if p else ('show','--pretty=','--name-only',s,'--','.',*X)
 return [x for x in g(*a).stdout.splitlines() if x]
def cdig(s):
 p=par(s); a=('diff','--binary','--no-ext-diff','--no-renames',p,s,'--','.',*X) if p else ('show','--binary','--format=','--no-ext-diff',s,'--','.',*X)
 return hashlib.sha256(g(*a,b=True).stdout).hexdigest()
def rows_at(s):
 c=g('show',f'{s}:docs/project-state/CHANGE_LEDGER.jsonl',check=False); r=[]
 if c.returncode==0:
  for q in c.stdout.splitlines():
   try:r.append(json.loads(q))
   except Exception:pass
 return r
def generated(path): return path in set(policy().get('generated_evidence_paths',[]))
def auth_path(path): return path.startswith('docs/project-state/authorizations/') and path.endswith('.json')
def substantive(files): return [x for x in files if not generated(x) and not auth_path(x)]
def path_covered(path,patterns): return any(fnmatch.fnmatchcase(path,p) for p in patterns)
def auth_id_path(auth_id): return f'docs/project-state/authorizations/{auth_id}.json'

def load_auth_file(path):
 try:return json.loads(pathlib.Path(path).read_text())
 except Exception:return None
def auths_worktree():
 return [a for a in (load_auth_file(p) for p in sorted(A.glob('*.json')) if A.exists()) if a]
def auth_at(ref,auth_id):
 c=g('show',f'{ref}:{auth_id_path(auth_id)}',check=False)
 if c.returncode!=0:return None
 try:return json.loads(c.stdout)
 except Exception:return None

def validate_auth(a,target_ref,branch):
 p=policy(); errs=[]
 if not isinstance(a,dict): return ['authorization is not an object']
 aid=str(a.get('authorization_id',''))
 if not re.match(r'^auth-[A-Za-z0-9_.-]{8,120}$',aid): errs.append('invalid authorization_id')
 if a.get('project')!='dial': errs.append('project must be dial')
 classes=set((p.get('authority_classes') or {}).keys())
 authority=a.get('authority')
 if authority not in classes or authority=='NO_AUTHORITY': errs.append('authorization class grants no write authority')
 if not DIGEST_RE.match(str(a.get('owner_instruction_sha256',''))): errs.append('owner instruction digest missing/invalid')
 base=str(a.get('base_sha',''))
 if not SHA_RE.match(base): errs.append('base_sha missing/invalid')
 elif not is_ancestor(base,target_ref): errs.append('base_sha is not an ancestor of target')
 scope=str(a.get('branch_scope',''))
 if not scope or not fnmatch.fnmatchcase(branch,scope): errs.append('branch outside authorization scope')
 paths=a.get('authorized_paths')
 if not isinstance(paths,list) or not paths or any(not isinstance(x,str) or not x.strip() for x in paths): errs.append('authorized_paths must be explicit')
 changes=a.get('change_classes')
 if not isinstance(changes,list) or not changes: errs.append('change_classes must be explicit')
 if a.get('revoked') is True: errs.append('authorization revoked')
 flags=p.get('material_change_flags',[])
 if authority in {'OWNER_DERIVED','OWNER_DELEGATED_AUTONOMY'} and (a.get('material_scope_expansion') is True or any(a.get(k) is True for k in flags)):
  errs.append('derived/delegated authority may not expand material scope')
 src=a.get('source') or {}; kind=src.get('kind')
 if kind not in set(p.get('owner_instruction_sources',[])): errs.append('unrecognized owner instruction source')
 if kind=='oracle_owner_instruction':
  if src.get('channel') not in set(p.get('oracle_owner_channels',[])): errs.append('untrusted oracle owner channel')
  if not src.get('job_id'): errs.append('oracle source job_id missing')
 if kind=='owner_session_instruction' and src.get('owner_attested') is not True: errs.append('owner session instruction is not attested')
 return errs

def select_auths(files,auths,target_ref,branch):
 required=substantive(files); usable=[]; invalid={}
 for a in auths:
  errs=validate_auth(a,target_ref,branch)
  if errs: invalid[a.get('authorization_id','?')]=errs
  else: usable.append(a)
 chosen=[]; uncovered=[]
 for f in required:
  matches=[a for a in usable if path_covered(f,a.get('authorized_paths',[]))]
  if not matches: uncovered.append(f); continue
  pick=sorted(matches,key=lambda x:x['authorization_id'])[0]
  if pick not in chosen: chosen.append(pick)
 return chosen,uncovered,invalid

def append_ledger_entry(entry):
 L.parent.mkdir(parents=True,exist_ok=True)
 rows=[]
 if L.exists():
  for q in L.read_text().splitlines():
   try: rows.append(json.loads(q))
   except Exception: pass
 if rows and rows[-1].get('source_parent')==entry.get('source_parent') and rows[-1].get('diff_sha256')==entry.get('diff_sha256'):
  return rows[-1]
 with L.open('a') as z:z.write(json.dumps(entry,sort_keys=True,separators=(',',':'))+'\n')
 return entry

def record():
 f=files_staged()
 if not f:return 0
 for status,path in status_staged():
  if auth_path(path) and status!='A':
   print(f'BLOCKED: authorization records are append-only; staged {status} {path}',file=sys.stderr); return 42
 branch=o('rev-parse','--abbrev-ref','HEAD'); target=o('rev-parse','HEAD')
 chosen,uncovered,invalid=select_auths(f,auths_worktree(),target,branch)
 if uncovered:
  print('BLOCKED: staged changes lack owner-derived Project Truth authority: '+', '.join(uncovered),file=sys.stderr)
  if invalid: print('authorization validation: '+json.dumps(invalid,sort_keys=True),file=sys.stderr)
  return 43
 ids=sorted({a['authorization_id'] for a in chosen})
 classes=sorted({a['authority'] for a in chosen})
 d=dig_staged(); parent=target
 entry={'schema_version':2,'kind':'precommit-staged-diff','recorded_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'branch':branch,'source_parent':parent,'changed_files':f,'diff_sha256':d,
        'actor':os.getenv('USER') or os.getenv('USERNAME') or 'unknown','owner_authorized':True,
        'authorization_ids':ids,'authority_classes':classes}
 append_ledger_entry(entry)
 C.write_text(json.dumps({'schema_version':2,'state':'AUTHORIZED_PENDING_COMMIT','repository':'Vanguduza/dial-new',
                          'branch':branch,'source_parent':parent,'content_diff_sha256':d,'changed_files':f,
                          'authorization_ids':ids,'authority_classes':classes,'observed_at_utc':entry['recorded_at_utc']},indent=2,sort_keys=True)+'\n')
 subprocess.run(['git','add','docs/project-state/CHANGE_LEDGER.jsonl','docs/project-state/CURRENT_STATE.json'],cwd=R,check=True)
 return 0

def install_guard():
 c=g('log','--reverse','--format=%H','--diff-filter=A','--','scripts/project_truth_local.py',check=False)
 a=[x for x in c.stdout.splitlines() if x]; return a[0] if a else None
def install_authority():
 c=g('log','--reverse','--format=%H','--diff-filter=A','--','docs/project-state/OWNER_AUTHORITY_POLICY.json',check=False)
 a=[x for x in c.stdout.splitlines() if x]; return a[0] if a else None

def matching_row(s):
 f=cfiles(s)
 if not f:return None
 p=par(s); d=cdig(s)
 for r in rows_at(s):
  if r.get('source_parent')==p and r.get('diff_sha256')==d and sorted(r.get('changed_files',[]))==sorted(f): return r
 return None

def verify_authorized_commit(s):
 f=cfiles(s)
 if not f:return []
 row=matching_row(s)
 if not row:return [f'{s}: no matching Project Truth ledger row']
 ids=row.get('authorization_ids') or []
 if row.get('owner_authorized') is not True or not ids:return [f'{s}: ledger row lacks owner authorization']
 branch=str(row.get('branch') or '')
 auths=[]; errs=[]
 for aid in ids:
  a=auth_at(s,aid)
  if not a: errs.append(f'{s}: authorization {aid} not present at commit'); continue
  ae=validate_auth(a,s,branch)
  if ae: errs.append(f'{s}: authorization {aid} invalid: '+', '.join(ae)); continue
  auths.append(a)
 _,uncovered,_=select_auths(f,auths,s,branch)
 if uncovered: errs.append(f'{s}: authorization scope does not cover '+', '.join(uncovered))
 return errs

def verify_legacy_commit(s):
 f=cfiles(s)
 if not f:return []
 return [] if matching_row(s) else [f'{s}: unlogged post-guard commit']

def verified_history_boundary(baseline):
 configured=str(policy().get('legacy_history_verified_through') or '').strip()
 if configured and SHA_RE.match(configured) and g('rev-parse','--verify',configured,check=False).returncode==0 and is_ancestor(configured,'HEAD'):
  return configured
 return baseline

def verify():
 baseline=install_guard()
 if not baseline: print('BLOCKED: Project Truth local guard baseline missing',file=sys.stderr); return 40
 start=verified_history_boundary(baseline)
 authority=install_authority(); bad=[]
 for s in [x for x in o('rev-list','--reverse',f'{start}..HEAD').splitlines() if x]:
  ps=parents(s)
  if len(ps)>1:
   if reproducible_merge(s): continue
   bad.append(f'{s}: non-reproducible merge requires separately evidenced resolution'); continue
  bad.extend(verify_authorized_commit(s) if authority and is_ancestor(authority,s) else verify_legacy_commit(s))
 if bad:
  print('BLOCKED: Project Truth verification failed:\n - '+'\n - '.join(bad),file=sys.stderr); return 41
 return 0

def locked_decision_evolution(base, head='HEAD'):
 old=g('show',f'{base}:agent-system/registries/DECISION_LOG.json',check=False)
 if old.returncode!=0: return ['base DECISION_LOG.json missing']
 try:
  before=json.loads(old.stdout); after=json.loads((R/'agent-system/registries/DECISION_LOG.json').read_text())
 except Exception as e: return [f'DECISION_LOG parse failure: {e}']
 old_by={x.get('decision_id'):x for x in before if isinstance(x,dict)}; new_by={x.get('decision_id'):x for x in after if isinstance(x,dict)}
 errs=[]
 if len(new_by)!=len(after): errs.append('DECISION_LOG contains duplicate or missing decision_id values')
 for did,row in old_by.items():
  if row.get('status')!='LOCKED': continue
  if did not in new_by: errs.append(f'locked decision removed: {did}'); continue
  if json.dumps(row,sort_keys=True,separators=(',',':')) != json.dumps(new_by[did],sort_keys=True,separators=(',',':')):
   errs.append(f'locked decision mutated in place: {did}; add a superseding/revision decision instead')
 for row in after:
  sid=row.get('supersedes_decision_id') if isinstance(row,dict) else None
  if sid and sid not in old_by and sid not in new_by: errs.append(f"decision {row.get('decision_id')} supersedes unknown decision {sid}")
 return errs

def changed_name_status(base,head='HEAD',pathspec=None):
 args=['diff','--name-status','--no-renames',f'{base}...{head}']
 if pathspec: args+=['--',pathspec]
 return [x.split('\t',1) for x in g(*args).stdout.splitlines() if '\t' in x]

def verify_pr(base,branch_override=None):
 if g('rev-parse','--verify',base,check=False).returncode!=0:
  print(f'BLOCKED: PR base ref not found: {base}',file=sys.stderr); return 44
 rc=verify()
 if rc:return rc
 auth_changes=changed_name_status(base,'HEAD','docs/project-state/authorizations')
 for status,path in auth_changes:
  if status!='A': print(f'BLOCKED: authorization records are append-only across PRs: {status} {path}',file=sys.stderr); return 45
 changed=[x for x in g('diff','--name-only','--no-renames',f'{base}...HEAD').stdout.splitlines() if x]
 if 'agent-system/registries/DECISION_LOG.json' in changed:
  decision_errors=locked_decision_evolution(base,'HEAD')
  if decision_errors:
   print('BLOCKED: locked Decision evolution violation: '+'; '.join(decision_errors),file=sys.stderr); return 51
 required=substantive(changed)
 if required:
  if 'docs/project-state/CHANGE_LEDGER.jsonl' not in changed or 'docs/project-state/CURRENT_STATE.json' not in changed:
   print('BLOCKED: authorized PR changes must carry PR-native CHANGE_LEDGER and CURRENT_STATE evidence',file=sys.stderr); return 46
  branch=branch_override or o('rev-parse','--abbrev-ref','HEAD')
  auths=auths_worktree(); selected,uncovered,invalid=select_auths(changed,auths,'HEAD',branch)
  if uncovered:
   print('BLOCKED: PR changes exceed owner authorization scope: '+', '.join(uncovered),file=sys.stderr); return 47
  added={p for s,p in auth_changes if s=='A'}
  for a in selected:
   if not a.get('reusable') and auth_id_path(a['authorization_id']) not in added:
    print(f"BLOCKED: non-reusable authorization {a['authorization_id']} was not added by this PR",file=sys.stderr); return 48
 print(json.dumps({'status':'GREEN','mode':'PR_AUTHORITY_VERIFY','base':base,'head':o('rev-parse','HEAD'),'owner_authorized':True,'post_merge_write':False},indent=2))
 return 0

def verify_merge(before,after):
 if after and o('rev-parse','HEAD')!=o('rev-parse',after):
  print('BLOCKED: checked-out HEAD does not match pushed after SHA',file=sys.stderr); return 49
 rc=verify()
 if rc:return rc
 if before and set(before)!={'0'}:
  for status,path in changed_name_status(before,after,'docs/project-state/authorizations'):
   if status!='A': print(f'BLOCKED: merged history altered an existing authorization record: {status} {path}',file=sys.stderr); return 50
  decision_changes=changed_name_status(before,after,'agent-system/registries/DECISION_LOG.json')
  if decision_changes:
   decision_errors=locked_decision_evolution(before,after)
   if decision_errors: print('BLOCKED: merged locked Decision evolution violation: '+'; '.join(decision_errors),file=sys.stderr); return 51
 print(json.dumps({'status':'GREEN','mode':'POST_MERGE_READ_ONLY_VERIFY','before':before or None,'after':after or o('rev-parse','HEAD'),'repository_mutation_allowed':False},indent=2))
 return 0

if __name__=='__main__':
 a=argparse.ArgumentParser()
 a.add_argument('cmd',choices=['record','verify','verify-pr','verify-merge'])
 a.add_argument('--base'); a.add_argument('--before'); a.add_argument('--after'); a.add_argument('--branch')
 n=a.parse_args()
 if n.cmd=='record': rc=record()
 elif n.cmd=='verify': rc=verify()
 elif n.cmd=='verify-pr':
  if not n.base: a.error('--base is required for verify-pr')
  rc=verify_pr(n.base,n.branch)
 else:
  rc=verify_merge(n.before or '',n.after or o('rev-parse','HEAD'))
 raise SystemExit(rc)
