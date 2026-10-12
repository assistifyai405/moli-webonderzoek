"""Verify every package member, scan public source and optionally run a clean MCP/browser smoke."""
import pathlib,json,zipfile,hashlib,re,sys,tempfile,subprocess,os,shutil
root=pathlib.Path(__file__).resolve().parent.parent
dist=root/'dist';packages=json.loads((dist/'SHA256.json').read_text())
report={'packages':[],'current_chat_proven':False,'github_ci_executed':False}
for item in packages:
 archive=dist/item['file']
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:raise SystemExit('Archive hash mismatch')
 with zipfile.ZipFile(archive) as z:
  names=z.namelist()
  if len(names)!=len(set(names)):raise SystemExit('Duplicate archive names')
  for name in names:
   parts=pathlib.PurePosixPath(name).parts
   if not parts or parts[0]!='moli-webonderzoek' or '..' in parts or pathlib.PurePosixPath(name).is_absolute():raise SystemExit('Unsafe member path')
  manifest=json.loads(z.read('moli-webonderzoek/package-manifest.json'))
  expected={'moli-webonderzoek/'+name for name in manifest}|{'moli-webonderzoek/package-manifest.json'}
  if set(names)!=expected:raise SystemExit('Manifest member mismatch')
  for name,digest in manifest.items():
   if hashlib.sha256(z.read('moli-webonderzoek/'+name)).hexdigest()!=digest:raise SystemExit('File hash mismatch: '+name)
   parts=pathlib.PurePosixPath(name).parts
   if parts[0] in ['data','validation','.git','.local'] or name in ['.mcp.json','.mcp.win32.json','.mcp.linux.json','.moli-install.json'] or '.backup-' in name:raise SystemExit('Local state in public archive: '+name)
   if parts[0] not in ['node_modules','vendor']:
    text=z.read('moli-webonderzoek/'+name).decode('utf-8')
    if re.search(r'(?:C:[/\\]Users[/\\][A-Za-z][^/\\]+[/\\]|/mnt/c/Users/[A-Za-z][A-Za-z0-9_-]+/|/home/[A-Za-z][A-Za-z0-9_-]+/|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})',text):raise SystemExit('Personal path or potential credential: '+name)
  checks={'file':item['file'],'sha256':item['sha256'],'members_verified':len(manifest),'local_state_excluded':True,'personal_path_scan_passed':True}
  if '--smoke' in sys.argv and '-source.zip' not in item['file']:
   with tempfile.TemporaryDirectory(prefix='moli-beta-package-') as temp:
    z.extractall(temp);stage=pathlib.Path(temp)/'moli-webonderzoek'
    lock=json.loads((stage/'engine-lock.json').read_text());platform='win32' if os.name=='nt' else 'linux'
    if platform=='linux':(stage/lock['assets'][platform]['binary']).chmod(0o755)
    node=os.environ.get('MOLI_NODE') or shutil.which('node')
    if not node:raise SystemExit('Node is missing from PATH')
    env={**os.environ,'MOLI_PYTHON':sys.executable}
    setup=subprocess.run([node,str(stage/'scripts/setup.mjs'),'--skip-dependencies','--skip-engine'],cwd=stage,env=env,capture_output=True,text=True,timeout=30)
    if setup.returncode:raise SystemExit('Clean setup failed: '+setup.stderr[-1000:])
    result=subprocess.run([node,str(stage/'scripts/package-smoke.mjs')],cwd=stage,env=env,capture_output=True,text=True,timeout=70)
    if result.returncode:raise SystemExit('Clean browser/MCP smoke failed: '+result.stderr[-1000:])
    data=json.loads(result.stdout)
    checks['smoke']={'platform':data['platform'],'tool_count':len(data['tools']),'engine_verified':data['status']['engine_digest_verified'],**data['actual_browser']}
  report['packages'].append(checks)
report['ok']=True
(dist/'release-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
