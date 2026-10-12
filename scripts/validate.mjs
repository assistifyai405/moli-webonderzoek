import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ROOT} from '../src/process.mjs';
const evidence=path.join(ROOT,'validation',`public-evidence-${process.platform}`);
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(ROOT,'src/server.mjs')],env:{...process.env,MOLI_EVIDENCE_DIR:evidence},stderr:'pipe'});transport.stderr?.on('data',()=>{});
const client=new Client({name:'moli-public-qualification',version:'1'},{capabilities:{}});
const report={date:'2026-10-12',platform:process.platform,host:os.hostname(),native_current_chat_discovery:false,cloud_proven:false,results:[]};
try {
  await client.connect(transport);report.tools=(await client.listTools()).tools.map(t=>t.name);report.status=(await client.callTool({name:'moli_status',arguments:{}})).structuredContent;
  const sources=[{url:'https://nodejs.org/en',selector:'main',expected:'Node.js'},{url:'https://nodejs.org/api/',selector:'body',expected:'Node.js'}];
  const repeats=process.argv.includes('--single')?1:3;
  for(let repeat=0;repeat<repeats;repeat++)for(const source of sources){const result=(await client.callTool({name:'moli_read_page',arguments:{url:source.url,selector:source.selector}} ,undefined,{timeout:70000})).structuredContent;report.results.push({repeat,url:source.url,expected_text_found:result.text.includes(source.expected),...result});}
  const first=report.results.find(r=>r.evidence_id);
  if(first){report.evidence_page=(await client.callTool({name:'moli_get_evidence',arguments:{evidence_id:first.evidence_id,offset:0,limit:200}})).structuredContent;report.compare=(await client.callTool({name:'moli_compare_evidence',arguments:{before:first.evidence_id,after:first.evidence_id}})).structuredContent;}
}finally{await client.close();}
await fs.writeFile(path.join(ROOT,'validation',`public-${process.platform}.json`),JSON.stringify(report,null,2));
console.log(JSON.stringify({platform:report.platform,tools:report.tools,results:report.results.map(r=>({url:r.url,state:r.state,expected:r.expected_text_found,cleanup:r.cleanup_success,elapsed_ms:r.elapsed_ms,peak:r.attempts[0]?.peak_process_tree_bytes,memory_measure:r.attempts[0]?.memory_measure}))},null,2));
