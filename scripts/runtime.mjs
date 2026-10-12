import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

export function findPython() {
  const candidates=[];
  if(process.env.MOLI_PYTHON)candidates.push([process.env.MOLI_PYTHON]);
  candidates.push(['python3'],['python']);
  if(process.platform==='win32') {
    candidates.push(['py','-3']);
    candidates.push([path.join(process.env.USERPROFILE??'', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')]);
  }
  for(const candidate of candidates) {
    const probe=spawnSync(candidate[0],[...candidate.slice(1),'-c','import sys,json; print(json.dumps({"executable":sys.executable,"version":list(sys.version_info[:3])}))'],{encoding:'utf8',timeout:5000,windowsHide:true});
    if(probe.status!==0)continue;
    try {const info=JSON.parse(probe.stdout);if(path.isAbsolute(info.executable)&&fs.existsSync(info.executable)&&info.version[0]===3&&info.version[1]>=11)return info;} catch {}
  }
  throw new Error('Python 3.11+ was not found. Install Python or set MOLI_PYTHON to its absolute executable path.');
}
