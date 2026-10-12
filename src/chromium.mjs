import fs from 'node:fs/promises';import path from 'node:path';
import {ROOT,runSupervised} from './process.mjs';

export async function runChromium({url,selector,temp,proxy,executable,signal,timeoutMs}) {
  if(!path.isAbsolute(executable))throw new Error('invalid_chromium_path');
  const file=path.join(temp,'chromium-config.json');
  await fs.writeFile(file,JSON.stringify({url,selector,proxy,executable,timeout_ms:Math.min(15000,timeoutMs)}),{mode:0o600,flag:'wx'});
  const run=await runSupervised({command:[process.execPath,path.join(ROOT,'scripts/chromium-worker.mjs'),file],temp,signal,timeoutMs});
  return run;
}
