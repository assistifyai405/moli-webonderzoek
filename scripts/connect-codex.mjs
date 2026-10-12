import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
import {ROOT} from '../src/process.mjs';import {findPython} from './runtime.mjs';
const args=process.argv.slice(2);
if(args.some(a=>a!=='--apply'))throw new Error('Usage: node scripts/connect-codex.mjs [--apply]');
const python=findPython();
const request={codex_home:process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),skill_dir:path.join(os.homedir(),'.agents','skills','moli-webonderzoek'),skill_source:path.join(ROOT,'skills/moli-webonderzoek/SKILL.md'),server:{command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{MOLI_PYTHON:python.executable}},apply:args.includes('--apply')};
const result=spawnSync(python.executable,[path.join(ROOT,'scripts/connect-codex.py')],{input:JSON.stringify(request),encoding:'utf8',timeout:15000,windowsHide:true});
if(result.status!==0){console.error(result.stderr||'Connection failed.');process.exitCode=1;}else{
 console.log(result.stdout.trim());
 if(request.apply){const dir=path.join(ROOT,'data/integration');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,`codex-${process.platform}.json`),result.stdout,{mode:0o600});}
}
