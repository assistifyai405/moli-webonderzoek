import fs from 'node:fs/promises';import path from 'node:path';import {ROOT} from '../src/process.mjs';
import {findPython} from './runtime.mjs';
const python=findPython();
const config={mcpServers:{'moli-webonderzoek':{command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{MOLI_PYTHON:python.executable}}}};
for(const name of [`.mcp.${process.platform}.json`,'.mcp.json']) {
 const target=path.join(ROOT,name);
 try{await fs.writeFile(target,JSON.stringify(config,null,2)+'\n',{flag:process.argv.includes('--replace')?'w':'wx'});console.log(target);}catch(e){if(e.code==='EEXIST'){console.log(name+': configuration exists; preserved.');}else throw e;}
}
