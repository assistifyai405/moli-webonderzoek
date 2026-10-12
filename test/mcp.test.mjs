import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ROOT} from '../src/process.mjs';
test('real stdio MCP handshake, five schemas and blocked request',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'moli-mcp-evidence-'));
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{...process.env,MOLI_EVIDENCE_DIR:dir},stderr:'pipe'});
  let stderr='';transport.stderr?.on('data',b=>{stderr+=b.toString().slice(0,2000);});
  const client=new Client({name:'moli-integration-test',version:'1'},{capabilities:{}});
  try {await client.connect(transport);const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name).sort(),['moli_status','moli_read_page','moli_read_pages','moli_get_evidence','moli_compare_evidence'].sort());const status=await client.callTool({name:'moli_status',arguments:{}});assert.equal(status.structuredContent.engine_digest_verified,true);const blocked=await client.callTool({name:'moli_read_page',arguments:{url:'http://127.0.0.1:12345'}});assert.equal(blocked.structuredContent.state,'blocked');const error=await client.callTool({name:'moli_get_evidence',arguments:{evidence_id:'00000000-0000-4000-8000-000000000000'}});assert.equal(error.isError,true);assert.equal(stderr,'');}
  finally{await client.close();await fs.rm(dir,{recursive:true,force:true});}
});
