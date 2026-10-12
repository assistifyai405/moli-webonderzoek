import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
import {editOrigins,validateConfig} from '../src/config.mjs';import {ROOT} from '../src/process.mjs';import {findPython} from '../scripts/runtime.mjs';

test('origin preview, apply, backup and removal preserve other configuration',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moli-onboarding-'));const file=path.join(dir,'config.json');
 const original=JSON.stringify({selected_origins:['https://example.com'],chromium_fallback:false,note:'keep'});
 try {
  await fs.writeFile(file,original);const preview=await editOrigins(file,'add','https://nodejs.org/');assert.equal(preview.applied,false);assert.equal(await fs.readFile(file,'utf8'),original);
  const added=await editOrigins(file,'add','https://nodejs.org',{apply:true});assert.equal(added.applied,true);assert.equal(await fs.readFile(added.backup,'utf8'),original);assert.equal(JSON.parse(await fs.readFile(file,'utf8')).note,'keep');
  assert.equal((await editOrigins(file,'add','https://nodejs.org',{apply:true})).changed,false);
  const removed=await editOrigins(file,'remove','https://nodejs.org',{apply:true});assert.deepEqual(removed.after,['https://example.com']);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('invalid, private and credential origins cannot broaden configuration',()=>{
 for(const raw of ['http://127.0.0.1','http://[::1]','http://[::ffff:127.0.0.1]','https://localhost','http://10.1.2.3','https://service.local','https://user:secret@example.com','https://example.com/path','https://example.com:1234','https://example.com#x','ftp://example.com'])assert.throws(()=>validateConfig({selected_origins:[raw],chromium_fallback:false}),raw);
 assert.throws(()=>validateConfig({selected_origins:['https://example.com','https://example.com/'],chromium_fallback:false}));
 assert.throws(()=>validateConfig({selected_origins:[],chromium_fallback:'false'}));
 assert.deepEqual(validateConfig({selected_origins:[],chromium_fallback:false}).selected_origins,[]);
});
test('origin writer refuses another active writer without changing source',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moli-lock-'));const file=path.join(dir,'config.json');const bytes=JSON.stringify({selected_origins:[],chromium_fallback:false});
 try{await fs.writeFile(file,bytes);await fs.writeFile(file+'.lock','');await assert.rejects(editOrigins(file,'add','https://example.com',{apply:true}));assert.equal(await fs.readFile(file,'utf8'),bytes);}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Codex connection preserves unrelated TOML, previews, applies once and refuses conflicting server',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moli-codex-'));const home=path.join(dir,'codex'),skill=path.join(dir,'skills/moli-webonderzoek');
 const original='# retain this comment\nmodel = "example"\n[mcp_servers.other]\ncommand = "unrelated"\n';
 const python=findPython();const request={codex_home:home,skill_dir:skill,skill_source:path.join(ROOT,'skills/moli-webonderzoek/SKILL.md'),server:{command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{MOLI_PYTHON:python.executable}}};
 const run=apply=>spawnSync(python.executable,[path.join(ROOT,'scripts/connect-codex.py')],{input:JSON.stringify({...request,apply}),encoding:'utf8'});
 try {
  await fs.mkdir(home);await fs.writeFile(path.join(home,'config.toml'),original);
  const preview=run(false);assert.equal(preview.status,0,preview.stderr);assert.equal(await fs.readFile(path.join(home,'config.toml'),'utf8'),original);await assert.rejects(fs.stat(skill));
  const applied=run(true);assert.equal(applied.status,0,applied.stderr);const receipt=JSON.parse(applied.stdout);assert.equal(receipt.current_chat_proven,false);assert.equal(await fs.readFile(receipt.backup,'utf8'),original);
  const updated=await fs.readFile(path.join(home,'config.toml'),'utf8');assert.ok(updated.startsWith(original));assert.equal(await fs.readFile(path.join(skill,'SKILL.md'),'utf8'),await fs.readFile(request.skill_source,'utf8'));
  assert.equal(run(true).status,0);assert.equal(await fs.readFile(path.join(home,'config.toml'),'utf8'),updated);
  request.server.command='different';assert.equal(run(true).status,1);assert.equal(await fs.readFile(path.join(home,'config.toml'),'utf8'),updated);
 } finally{await fs.rm(dir,{recursive:true,force:true});}
});
