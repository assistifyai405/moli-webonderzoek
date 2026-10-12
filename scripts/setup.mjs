// Explicit user-run setup. Only project dependencies are downloaded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT} from '../src/process.mjs';
import {findPython} from './runtime.mjs';
const flags=process.argv.slice(2);
if(flags.some(f=>!['--skip-dependencies','--skip-engine'].includes(f)))throw new Error('Only --skip-dependencies and --skip-engine are supported.');
if(!['linux','win32'].includes(process.platform)||process.arch!=='x64'||Number(process.versions.node.split('.')[0])<22)throw new Error('Requires x64 Windows/Linux and Node.js 22+.');
const python=findPython();
async function run(command,args,env=process.env) {
  await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:ROOT,env,stdio:'inherit',shell:false,windowsHide:true});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Setup command failed: '+code)));});
}
if(!flags.includes('--skip-dependencies')) {
  // npm's JavaScript entrypoint avoids a Windows .cmd shell wrapper.
  let npm=process.env.npm_execpath;
  if(!npm)npm=path.join(path.dirname(process.execPath),process.platform==='win32'?'node_modules/npm/bin/npm-cli.js':'../lib/node_modules/npm/bin/npm-cli.js');
  try{await fs.access(npm);}catch{if(process.platform==='linux')npm='/usr/share/nodejs/npm/bin/npm-cli.js';else throw new Error('Run npm run setup so npm can supply its entrypoint.');}
  await run(process.execPath,[npm,'ci','--ignore-scripts','--no-audit','--no-fund']);
}
if(!flags.includes('--skip-engine'))await run(python.executable,[path.join(ROOT,'scripts/fetch-engine.py')]);
if(flags.includes('--skip-engine')&&process.platform==='linux') {
 const lock=JSON.parse(await fs.readFile(path.join(ROOT,'engine-lock.json'),'utf8'));
 await fs.chmod(path.join(ROOT,lock.assets.linux.binary),0o755);
}
const env={...process.env,MOLI_PYTHON:python.executable};
await run(process.execPath,[path.join(ROOT,'scripts/prepare-config.mjs'),'--replace'],env);
await run(process.execPath,[path.join(ROOT,'scripts/doctor.mjs')],env);
console.log('Setup finished. No Codex registration or global installation was performed.');
