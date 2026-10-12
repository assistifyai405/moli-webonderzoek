import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
import {fixtures} from '../test/fixtures.mjs';import {createProxy} from '../src/proxy.mjs';import {runChromium} from '../src/chromium.mjs';import {extract} from '../src/extract.mjs';import {ROOT} from '../src/process.mjs';
const executable=process.argv[2];if(!executable)throw new Error('Explicit installed Chromium path required');
const f=await fixtures();const report={platform:process.platform,executable,checks:[],qualified:false,filesystem_isolation:false,scope:'selected_public_origins_only'};
try {
  report.executable_sha256=crypto.createHash('sha256').update(await fs.readFile(executable)).digest('hex');
  for(const route of ['static','dynamic','private-redirect','private-script']){
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'moli-chromium-test-'));const proxy=await createProxy({origins:[],fixtures:[f.origin]});
    try{const run=await runChromium({url:f.origin+'/'+route,selector:route==='dynamic'?'#ready p':undefined,temp,proxy:proxy.url,executable,timeoutMs:10000});let page;try{page=JSON.parse(run.stdout);}catch{}
      const network=proxy.summary();const expected=route==='static'?page&&extract(page,{selector:'main'}).text.includes('const answer = 42;'):route==='dynamic'?page&&extract(page,{selector:'#ready p'}).text.includes('9918'):network.blocked&&f.hits.length===0;
      report.checks.push({route,pass:!!expected&&run.cleanup_success===true,exit_code:run.exit_code,cleanup_success:run.cleanup_success,reason:run.reason,diagnostic:run.stderr.slice(0,500),network,engine_version:page?.engine_version,peak_process_tree_bytes:run.peak_process_tree_bytes,memory_measure:run.memory_measure});
    }finally{await proxy.close();await fs.rm(temp,{recursive:true,force:true});}
  }
  report.qualified=report.checks.every(c=>c.pass);report.private_target_requests=f.hits.length;
}finally{await f.close();}
await fs.writeFile(path.join(ROOT,'validation',`chromium-${process.platform}.json`),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(!report.qualified)process.exitCode=1;
