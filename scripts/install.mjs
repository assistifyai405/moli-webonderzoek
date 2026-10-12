// Explicit local package copy only. Does not change Codex global configuration.
import fs from 'node:fs/promises';import path from 'node:path';
import {ROOT} from '../src/process.mjs';import {findPython} from './runtime.mjs';
const argv=process.argv.slice(2),targetArg=argv[argv.indexOf('--target')+1];
if(!argv.includes('--target')||!targetArg||!path.isAbsolute(targetArg))throw new Error('Use --target ABSOLUTE_DIRECTORY; --apply performs the prepared copy.');
const target=path.resolve(targetArg);
if(target===ROOT||target.startsWith(ROOT+path.sep))throw new Error('Target must be outside the source project.');
try{await fs.lstat(target);throw new Error('Target already exists; no overwrite permitted.');}catch(e){if(e.code!=='ENOENT')throw e;}
const names=['src','scripts','test','skills','.codex-plugin','node_modules','vendor','docs','.github','config.json','engine-lock.json','package.json','package-lock.json','README.md','README.nl.md','TESTBEWIJS.md','HANDOFF.md','LICENSE','THIRD-PARTY-NOTICES.md','CHANGELOG.md','CONTRIBUTING.md','SECURITY.md','.mcp.example.json'];
const plan={target,copy:names,registration_performed:false,existing_evidence_preserved:true};console.log(JSON.stringify(plan,null,2));
if(argv.includes('--apply')){
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.mkdir(target);
  for(const name of names)await fs.cp(path.join(ROOT,name),path.join(target,name),{recursive:true,force:false,errorOnExist:true,verbatimSymlinks:true,filter:p=>!p.includes('public-evidence-')&&!p.endsWith('.tar.gz')&&!p.endsWith('.zip')});
  const config={mcpServers:{'moli-webonderzoek':{command:process.execPath,args:[path.join(target,'src/server.mjs')],env:{MOLI_PYTHON:findPython().executable}}}};
  await fs.writeFile(path.join(target,'.mcp.json'),JSON.stringify(config,null,2),{flag:'wx'});
  const {version}=JSON.parse(await fs.readFile(path.join(ROOT,'package.json'),'utf8'));
  await fs.writeFile(path.join(target,'.moli-install.json'),JSON.stringify({version,installed_at:new Date().toISOString(),source:ROOT,target,platform:process.platform},null,2),{flag:'wx'});
  console.log('Local copy ready. Import its .mcp.json or local plugin in Codex only when requested.');
}
