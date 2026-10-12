"""Build public-only source and runtime packages; never include local profiles/evidence."""
import pathlib,json,hashlib,zipfile,sys
root=pathlib.Path(__file__).resolve().parent.parent
dist=root/'dist';dist.mkdir(exist_ok=True)
version=json.loads((root/'package.json').read_text())['version']
public_dirs={'src','scripts','test','skills','docs','.github','.codex-plugin'}
public_files={'package.json','package-lock.json','config.json','engine-lock.json','.gitignore','.mcp.example.json','LICENSE','THIRD-PARTY-NOTICES.md','README.md','README.nl.md','HANDOFF.md','TESTBEWIJS.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md'}
source=[];runtime=[]
for f in root.rglob('*'):
 if not f.is_file():continue
 rel=f.relative_to(root);parts=rel.parts
 if '__pycache__' in parts or f.name.endswith('.tmp'):continue
 public=parts[0] in public_dirs or len(parts)==1 and parts[0] in public_files
 if public:source.append(f);runtime.append(f)
 elif parts[0]=='node_modules' or parts[0]=='vendor' and len(parts)>2:runtime.append(f)
def archive(name,files):
 target=dist/name
 with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for f in sorted(files):z.write(f,'moli-webonderzoek/'+f.relative_to(root).as_posix())
  manifest={f.relative_to(root).as_posix():hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
  z.writestr('moli-webonderzoek/package-manifest.json',json.dumps(manifest,indent=2))
 return {'file':name,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'files':len(files)}
lock=json.loads((root/'engine-lock.json').read_text())
hosts=[host for host,asset in lock['assets'].items() if (root/asset['binary']).exists()]
label='Windows-WSL' if len(hosts)==2 else 'Windows' if hosts==['win32'] else 'Linux' if hosts==['linux'] else 'No-Engine'
outputs=[archive(f'Moli-Webonderzoek-{version}-source.zip',source)]
if '--source-only' not in sys.argv:outputs.append(archive(f'Moli-Webonderzoek-{version}-{label}.zip',runtime))
(dist/'SHA256.json').write_text(json.dumps(outputs,indent=2))
print(json.dumps(outputs,indent=2))
