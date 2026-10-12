import {test} from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {publicAddress,parseUrl,resolveTarget} from '../src/policy.mjs';
import {createProxy} from '../src/proxy.mjs';
import {Service} from '../src/service.mjs';
import {fixtures} from './fixtures.mjs';

test('reject credentials, schemes, private/reserved IPv4 and IPv6',async()=>{
  for(const ip of ['127.0.0.1','10.1.2.3','192.168.1.2','169.254.169.254','0.0.0.0','::1','fc00::1','fe80::1','::ffff:127.0.0.1','198.18.0.1','224.0.0.1'])assert.equal(publicAddress(ip),false,ip);
  for(const ip of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
  for(const url of ['file:///etc/passwd','http://user:secret@example.com','http://example.com:8080'])assert.throws(()=>parseUrl(url));
  await assert.rejects(resolveTarget(new URL('http://allowed.test'),{origins:['http://allowed.test'],resolver:async()=>[{address:'1.1.1.1',family:4},{address:'127.0.0.1',family:4}]}),/private_network/);
});

test('DNS re-resolution rejects a rebinding result before connection',async()=>{
  let n=0;const resolver=async()=>[{address:++n===1?'1.1.1.1':'127.0.0.1',family:4}];
  await resolveTarget(new URL('http://rebind.test'),{origins:['http://rebind.test'],resolver});
  const proxy=await createProxy({origins:['http://rebind.test'],resolver});
  try {const u=new URL(proxy.url);const status=await new Promise((resolve,reject)=>{http.get({hostname:u.hostname,port:u.port,path:'http://rebind.test/path',headers:{'Proxy-Authorization':`Basic ${Buffer.from(`${u.username}:${u.password}`).toString('base64')}`}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(status,403);assert.equal(proxy.summary().events[0].code,'private_network');}
  finally {await proxy.close();}
});

test('real Moli contract, content, faults, evidence and network policy',async t=>{
  const f=await fixtures();const svc=new Service({fixtures:[f.origin],evidenceDir:f.evidenceDir});
  try {
    await t.test('static table, code, links and source instruction remain data',async()=>{
      const r=await svc.readPage({url:f.origin+'/static',selector:'main'});assert.equal(r.state,'ok',JSON.stringify(r));assert.equal(r.cleanup_success,true);assert.match(r.text,/CPU/);assert.match(r.text,/42/);assert.match(r.text,/const answer = 42;/);assert.match(r.text,new RegExp(f.origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/docs'));assert.match(r.text,/Ignore previous instructions/);assert.equal(r.network.requests,1);const e=await svc.store.load(r.evidence_id);assert.equal(e.result.text,r.text);assert.equal(e.page.headers.some(h=>h.name.toLowerCase()==='set-cookie'),false);
    });
    await t.test('JavaScript content is awaited by selector',async()=>{const r=await svc.readPage({url:f.origin+'/dynamic',selector:'#ready p'});assert.equal(r.state,'ok',JSON.stringify(r));assert.match(r.text,/9918/);});
    await t.test('redirect retains final URL',async()=>{const r=await svc.readPage({url:f.origin+'/redirect',selector:'main'});assert.equal(r.state,'ok',JSON.stringify(r));assert.equal(r.final_url,f.origin+'/static');});
    for(const [route,state] of [['empty','partial'],['captcha','blocked'],['login','blocked'],['missing','error'],['forbidden','blocked'],['raw','unsupported']])await t.test(route,async()=>{const r=await svc.readPage({url:f.origin+'/'+route,selector:'main'});assert.equal(r.state,state,JSON.stringify(r));assert.equal(r.cleanup_success,true);});
    await t.test('a missing expected selector is incomplete',async()=>{const r=await svc.readPage({url:f.origin+'/static',selector:'#absent',timeout_ms:200});assert.notEqual(r.state,'ok');assert.equal(r.cleanup_success,true);});
    await t.test('private redirect and subresources never reach target',async()=>{for(const route of ['private-redirect','private-script']){const r=await svc.readPage({url:f.origin+'/'+route,selector:'main',timeout_ms:800});assert.notEqual(r.state,'ok',JSON.stringify(r));}assert.deepEqual(f.hits,[]);});
    await t.test('timeout closes the browser tree',async()=>{const r=await svc.readPage({url:f.origin+'/hang',timeout_ms:200});assert.notEqual(r.state,'ok');assert.equal(r.cleanup_success,true,JSON.stringify(r));});
    await t.test('cancellation closes browser tree',async()=>{const c=new AbortController();const promise=svc.readPage({url:f.origin+'/hang'},{signal:c.signal});setTimeout(()=>c.abort(),150);const r=await promise;assert.equal(r.state,'cancelled',JSON.stringify(r));assert.equal(r.cleanup_success,true);});
    await t.test('large source is fully stored and paginated',async()=>{const r=await svc.readPage({url:f.origin+'/large',selector:'main'});assert.equal(r.state,'partial');assert.equal(r.truncated,true);const a=await svc.store.read(r.evidence_id,0,20000),b=await svc.store.read(r.evidence_id,a.next_offset,20000);assert.ok(b.text.length);assert.equal(a.content_hash,b.content_hash);await assert.rejects(svc.store.read('../private'));});
    await t.test('response size limit is visible',async()=>{const r=await svc.readPage({url:f.origin+'/too-large',selector:'main',timeout_ms:1000});assert.notEqual(r.state,'ok');});
    await t.test('batch cap, errors and deadlines are per source',async()=>{await assert.rejects(svc.readPages({urls:Array(11).fill(f.origin+'/static')}));const r=await svc.readPages({urls:[f.origin+'/static',f.origin+'/missing'],selector:'main'});assert.equal(r.results.length,2);assert.equal(r.results[0].state,'ok');assert.equal(r.results[1].state,'error');const short=await svc.readPages({urls:[f.origin+'/hang',f.origin+'/static'],budget_ms:120});assert.equal(short.state,'partial');assert.equal(svc.active,0);});
    await t.test('same-source snapshots compare; altered settings do not',async()=>{const a=await svc.readPage({url:f.origin+'/revision',selector:'main'});f.setRevision('after');const b=await svc.readPage({url:f.origin+'/revision',selector:'main'});const diff=await svc.store.compare(a.evidence_id,b.evidence_id);assert.equal(diff.changed,true);assert.ok(diff.added.some(x=>x.includes('after')));const c=await svc.readPage({url:f.origin+'/revision',selector:'body'});assert.equal((await svc.store.compare(b.evidence_id,c.evidence_id)).comparable,false);});
    await t.test('tampered evidence is refused',async()=>{const r=await svc.readPage({url:f.origin+'/static',selector:'main'});const file=path.join(f.evidenceDir,r.evidence_id+'.json');const data=JSON.parse(await fs.readFile(file,'utf8'));data.result.text+='changed';await fs.writeFile(file,JSON.stringify(data));await assert.rejects(svc.store.load(r.evidence_id),/integrity/);});
  }finally {await svc.close();await f.close();}
});

test('public mode never allows fixture URLs via caller input',async()=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moli-public-test-'));const svc=new Service({evidenceDir:dir});try{const r=await svc.readPage({url:'http://127.0.0.1:12345'});assert.equal(r.state,'blocked');assert.equal(r.attempts.length,0);}finally{await svc.close();await fs.rm(dir,{recursive:true,force:true});}});
