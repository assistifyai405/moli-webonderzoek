import path from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ROOT} from '../src/process.mjs';import {findPython} from './runtime.mjs';
const args=process.argv.slice(2);if(args.length>1)throw new Error('Usage: npm run demo -- PUBLIC_URL');
const url=args[0]??'https://nodejs.org/en';const python=findPython();
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{...process.env,MOLI_PYTHON:python.executable},stderr:'pipe'});transport.stderr?.on('data',()=>{});
const client=new Client({name:'moli-research-demo',version:'0.2.0-beta.1'},{capabilities:{}});
try {
 await client.connect(transport);
 const status=(await client.callTool({name:'moli_status',arguments:{}})).structuredContent;
 console.log(JSON.stringify({engine:status.version,selected_origins:status.selected_origins,tools:(await client.listTools()).tools.map(t=>t.name)},null,2));
 const result=(await client.callTool({name:'moli_read_page',arguments:{url}},undefined,{timeout:70000})).structuredContent;
 console.log(JSON.stringify({state:result.state,final_url:result.final_url,title:result.title,evidence_id:result.evidence_id,cleanup_success:result.cleanup_success,warnings:result.warnings,excerpt:result.text.slice(0,700)},null,2));
 if(result.evidence_id) {
  const evidence=(await client.callTool({name:'moli_get_evidence',arguments:{evidence_id:result.evidence_id,limit:250}})).structuredContent;
  const comparison=(await client.callTool({name:'moli_compare_evidence',arguments:{before:result.evidence_id,after:result.evidence_id}})).structuredContent;
  console.log(JSON.stringify({retrieved_evidence:evidence,self_comparison:comparison},null,2));
 }
 if(!result.evidence_id||!result.cleanup_success)process.exitCode=1;
} finally {await client.close();}
