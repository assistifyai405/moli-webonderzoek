"""Explicit build dependency download; no global install or latest upgrade."""
import hashlib,json,pathlib,urllib.request,tarfile,zipfile,platform,os
root=pathlib.Path(__file__).resolve().parent.parent
lock=json.loads((root/'engine-lock.json').read_text())
key='win32' if os.name=='nt' else 'linux' if platform.system()=='Linux' else None
if platform.machine().lower() not in ['x86_64','amd64']:raise SystemExit('This package only provides x86_64 assets.')
if key not in lock['assets']:raise SystemExit('This release package supports x86_64 Windows and Linux only.')
asset=lock['assets'][key];archive=root/'vendor'/asset['archive'];archive.parent.mkdir(exist_ok=True)
binary=root/asset['binary']
if binary.exists() and hashlib.sha256(binary.read_bytes()).hexdigest()==asset['binary_sha256']:
 if key=='linux':binary.chmod(0o755)
 print('Existing project dependency verified:',key,lock['version']);raise SystemExit(0)
urllib.request.urlretrieve(asset['url'],archive)
if hashlib.sha256(archive.read_bytes()).hexdigest()!=asset['sha256']:raise SystemExit('Archive checksum mismatch; no extraction.')
dst=root/'vendor'/key;dst.mkdir(exist_ok=True)
if key=='win32':
 with zipfile.ZipFile(archive) as z:
  if any(pathlib.PurePosixPath(n).is_absolute() or '..' in pathlib.PurePosixPath(n).parts for n in z.namelist()):raise SystemExit('Unsafe archive paths')
  z.extractall(dst)
else:
 with tarfile.open(archive) as z:
  if hasattr(tarfile,'data_filter'):z.extractall(dst,filter='data')
  else:
   if any(pathlib.PurePosixPath(m.name).is_absolute() or '..' in pathlib.PurePosixPath(m.name).parts or not (m.isfile() or m.isdir()) for m in z.getmembers()):raise SystemExit('Unsafe archive entries')
   z.extractall(dst)
binary=root/asset['binary']
if hashlib.sha256(binary.read_bytes()).hexdigest()!=asset['binary_sha256']:raise SystemExit('Binary checksum mismatch')
if key=='linux':binary.chmod(0o755)
print('Verified project dependency:',key,lock['version'])
