import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {Service} from '../src/service.mjs';import {fixtures} from './fixtures.mjs';
import {runSupervised,sandboxCommand,ROOT} from '../src/process.mjs';

test('slow DNS cannot exceed batch deadline',async()=>{
  const s=new Service({origins:['http://slow.test'],resolver:()=>new Promise(()=>{})});const start=Date.now();
  const r=await s.readPages({urls:['http://slow.test'],budget_ms:150});assert.ok(Date.now()-start<1500);assert.equal(r.results[0].state,'timeout');assert.equal(s.active,0);await s.close();
});
test('unknown cleanup disables fallback and cannot produce ok content',async()=>{
  const f=await fixtures();let calls=0;const s=new Service({fixtures:[f.origin],evidenceDir:f.evidenceDir,runner:async()=>{calls++;return {reason:'completed',exit_code:0,cleanup_success:false,stdout:'{}',stderr:''};},fallbackEnabled:true});
  try{const r=await s.readPage({url:f.origin+'/static'});assert.equal(r.state,'error');assert.equal(r.cleanup_unknown,true);assert.equal(calls,1);assert.ok(r.warnings.includes('cleanup_unknown'));}finally{await s.close();await f.close();}
});
test('store quota and source mismatches stay explicit',async()=>{
  const f=await fixtures();const s=new Service({fixtures:[f.origin],evidenceDir:f.evidenceDir});
  try{const a=await s.readPage({url:f.origin+'/static',selector:'main'}),b=await s.readPage({url:f.origin+'/revision',selector:'main'});await assert.rejects(s.store.compare(a.evidence_id,b.evidence_id),/different_sources/);s.store.maxBytes=1;const c=await s.readPage({url:f.origin+'/static',selector:'main'});assert.equal(c.state,'partial');assert.equal(c.evidence_id,null);assert.ok(c.warnings.includes('evidence_store_full_or_unavailable'));}finally{await s.close();await f.close();}
});
test('page-controlled title metadata cannot flood the tool response',async()=>{
  const f=await fixtures();const s=new Service({fixtures:[f.origin],evidenceDir:f.evidenceDir});try{const r=await s.readPage({url:f.origin+'/large-title',selector:'main'});assert.equal(r.state,'ok');assert.equal(r.title.length,500);assert.ok(JSON.stringify(r).length<5000);assert.equal((await s.store.load(r.evidence_id)).page.title.length,30000);}finally{await s.close();await f.close();}
});
test('Linux browser filesystem namespace cannot read a host marker',{skip:process.platform!=='linux'},async()=>{
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'moli-fs-proof-'));const marker=path.join(temp,'host-marker');await fs.writeFile(marker,'not visible in browser');
  try {const binary=path.join(ROOT,'vendor/linux/moli-v1.1.16-x86_64-unknown-linux-gnu/moli');const command=sandboxCommand(binary,[],{temp});command.splice(command.lastIndexOf('--')+1,1,'/usr/bin/test','-e',marker);const r=await runSupervised({command,temp,timeoutMs:2000});assert.equal(r.exit_code,1);assert.equal(r.cleanup_success,true);}finally{await fs.rm(temp,{recursive:true,force:true});}
});
