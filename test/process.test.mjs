import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runSupervised,cleanEnv} from '../src/process.mjs';

const child=fileURLToPath(new URL('./process-child.mjs',import.meta.url));
test('supervisor contains own children and cleans on fault paths',async t=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'moli-process-test-'));
  try {
    for(const [mode,reason] of [['hang','timeout'],['flood','output_limit'],['exit','completed'],['orphan','completed']])await t.test(mode,async()=>{const r=await runSupervised({command:[process.execPath,child,mode],temp,timeoutMs:mode==='hang'?300:2000,maxStdout:64000});assert.equal(r.reason,reason,JSON.stringify(r));assert.equal(r.cleanup_success,true,JSON.stringify(r));if(mode==='orphan'){const match=r.stdout.match(/"child_pid":(\d+)/);assert.ok(match,'child must be alive before parent exits');const pid=Number(match[1]);assert.throws(()=>process.kill(pid,0));}if(mode==='exit')assert.equal(r.exit_code,17);});
    await t.test('cancellation during startup',async()=>{const c=new AbortController();const p=runSupervised({command:[process.execPath,child,'hang'],temp,timeoutMs:2000,signal:c.signal});c.abort();const r=await p;assert.equal(r.reason,'cancelled');assert.equal(r.cleanup_success,true,JSON.stringify(r));});
    await t.test('cancellation while a process is alive',async()=>{const c=new AbortController();const p=runSupervised({command:[process.execPath,child,'hang'],temp,timeoutMs:2000,signal:c.signal});setTimeout(()=>c.abort(),150);const r=await p;assert.equal(r.reason,'cancelled');assert.equal(r.cleanup_success,true);});
    await t.test('no provider secrets or inherited proxy env',()=>{process.env.MOLI_TEST_SECRET='secret';process.env.HTTPS_PROXY='http://private';const env=cleanEnv(temp);assert.equal(env.MOLI_TEST_SECRET,undefined);assert.equal(env.HTTPS_PROXY,undefined);delete process.env.MOLI_TEST_SECRET;delete process.env.HTTPS_PROXY;});
  } finally {await fs.rm(temp,{recursive:true,force:true});}
});
