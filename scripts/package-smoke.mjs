import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ROOT} from '../src/process.mjs';import {fixtures} from '../test/fixtures.mjs';import {Service} from '../src/service.mjs';
// Run this script from a freshly extracted package. All module/binary paths
// resolve inside that package, not from the development checkout.
const f=await fixtures();const service=new Service({fixtures:[f.origin],evidenceDir:f.evidenceDir});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{...process.env,MOLI_EVIDENCE_DIR:f.evidenceDir},stderr:'pipe'});transport.stderr?.on('data',()=>{});
const client=new Client({name:'clean-package-smoke',version:'1'},{capabilities:{}});
const result={platform:process.platform,package_root:ROOT,development_modules_used:false};
try {await client.connect(transport);result.tools=(await client.listTools()).tools.map(t=>t.name);result.status=(await client.callTool({name:'moli_status',arguments:{}})).structuredContent;const r=await service.readPage({url:f.origin+'/static',selector:'main'});result.actual_browser={state:r.state,table_and_code_present:r.text.includes('CPU')&&r.text.includes('const answer = 42;'),cleanup_success:r.cleanup_success,engine_version:r.engine_version};if(result.tools.length!==5||!result.status.engine_digest_verified||r.state!=='ok'||!result.actual_browser.table_and_code_present||!r.cleanup_success)process.exitCode=1;}
finally{await service.close();await client.close();await f.close();}
console.log(JSON.stringify(result,null,2));
