"""Add only this server and skill. Preview by default; refuse conflicts."""
import json,sys,pathlib,tomllib,os,uuid,hashlib

def sha(data):return hashlib.sha256(data).hexdigest()
def main():
 request=json.load(sys.stdin)
 home=pathlib.Path(request['codex_home']);skill=pathlib.Path(request['skill_dir'])
 config=home/'config.toml';lock=home/'.moli-connect.lock'
 if not home.is_absolute() or not skill.is_absolute():raise ValueError('Absolute directories required')
 if config.is_symlink() or skill.is_symlink():raise ValueError('Symlink targets refused')
 original=config.read_bytes() if config.exists() else b''
 parsed=tomllib.loads(original.decode('utf-8'))
 expected=request['server'];existing=parsed.get('mcp_servers',{}).get('moli-webonderzoek')
 if existing is not None and existing!=expected:raise ValueError('A different moli-webonderzoek server already exists; inspect it before changing anything')
 skill_bytes=pathlib.Path(request['skill_source']).read_bytes()
 if skill.exists() and (not (skill/'SKILL.md').exists() or (skill/'SKILL.md').read_bytes()!=skill_bytes):raise ValueError('A different skill already exists; preserved')
 q=lambda value:json.dumps(value,ensure_ascii=True)
 addition=('\n\n[mcp_servers.moli-webonderzoek]\ncommand = '+q(expected['command'])+'\nargs = '+q(expected['args'])+'\n\n[mcp_servers.moli-webonderzoek.env]\nMOLI_PYTHON = '+q(expected['env']['MOLI_PYTHON'])+'\n').encode()
 updated=original+addition if existing is None else original
 if tomllib.loads(updated.decode()).get('mcp_servers',{}).get('moli-webonderzoek')!=expected:raise ValueError('Generated TOML failed verification')
 result={'codex_home':str(home),'skill_dir':str(skill),'server_added':existing is None,'skill_added':not skill.exists(),'applied':False,'current_chat_proven':False,'cloud_proven':False}
 if not request.get('apply'):print(json.dumps(result));return
 home.mkdir(parents=True,exist_ok=True)
 handle=lock.open('x')
 try:
  backup=None;temporary=home/('.moli-config-'+str(uuid.uuid4())+'.tmp');skill_created=False
  try:
   if (config.read_bytes() if config.exists() else b'')!=original:raise ValueError('Configuration changed; run preview again')
   if config.is_symlink():raise ValueError('Configuration changed to a symlink')
   if not skill.exists():
    skill.parent.mkdir(parents=True,exist_ok=True);skill.mkdir();skill_created=True
    with (skill/'SKILL.md').open('xb') as f:f.write(skill_bytes)
   if updated!=original:
    backup=home/('config.toml.moli-backup-'+str(uuid.uuid4()))
    with backup.open('xb') as f:f.write(original)
    backup.chmod(0o600)
    with temporary.open('xb') as f:f.write(updated)
    temporary.chmod(0o600);os.replace(temporary,config)
   result.update(applied=True,backup=str(backup) if backup else None,config_sha256=sha(updated),skill_sha256=sha(skill_bytes))
  except:
   if skill_created:
    (skill/'SKILL.md').unlink(missing_ok=True);skill.rmdir()
   raise
  finally:temporary.unlink(missing_ok=True)
 finally:
  handle.close();lock.unlink(missing_ok=True)
 print(json.dumps(result))

if __name__=='__main__':
 try:main()
 except Exception as e:
  # Never print configuration contents or subprocess environment.
  print(str(e),file=sys.stderr);sys.exit(1)
