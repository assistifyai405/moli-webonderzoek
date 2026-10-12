import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {parseUrl,resolveTarget} from './policy.mjs';
import {createProxy} from './proxy.mjs';
import {extract,hash,EXTRACTOR} from './extract.mjs';
import {EvidenceStore} from './evidence.mjs';
import {ROOT,runSupervised,sandboxCommand,pythonPath} from './process.mjs';
import {runChromium} from './chromium.mjs';

const DEFAULT_ORIGINS=['https://example.com','https://nodejs.org'];
async function bounded(promise,signal) {
  if(signal.aborted)throw new Error(signal.reason==='deadline'?'timeout':'cancelled');
  let listener;const abort=new Promise((_,reject)=>{listener=()=>reject(new Error(signal.reason==='deadline'?'timeout':'cancelled'));signal.addEventListener('abort',listener,{once:true});});
  try{return await Promise.race([promise,abort]);}finally{signal.removeEventListener('abort',listener);}
}
export class Service {
  constructor({root=ROOT,evidenceDir=process.env.MOLI_EVIDENCE_DIR??path.join(ROOT,'data/evidence'),origins=DEFAULT_ORIGINS,fixtures=[],runner=runSupervised,sandbox=process.platform==='linux',resolver,fallbackEnabled=false}={}) {
    this.root=root;this.origins=origins;this.fixtures=fixtures;this.runner=runner;this.sandbox=sandbox;this.resolver=resolver;
    this.store=new EvidenceStore(evidenceDir);this.pending=0;this.active=0;this.hosts=new Set();this.jobs=new Set();this.closing=false;this.fallbackEnabled=fallbackEnabled;
  }
  async fallback() {
    if(!this.fallbackEnabled)return {enabled:false,reason:'operator_disabled'};
    if(process.platform!=='win32')return {enabled:false,reason:'no_qualified_adapter_on_this_host'};
    try {const q=JSON.parse(await fs.readFile(path.join(this.root,'validation','chromium-win32.json'),'utf8'));
      if(q.platform!=='win32'||q.qualified!==true||!q.checks?.every(c=>c.pass&&c.cleanup_success))throw new Error();
      if(hash(await fs.readFile(q.executable))!==q.executable_sha256)throw new Error();
      return {enabled:true,executable:q.executable,qualification:'selected_origins_proxy_job',filesystem_isolation:false};
    }catch{return {enabled:false,reason:'qualification_missing_failed_or_stale'};}
  }
  async lock() {
    if(process.arch!=='x64')throw new Error('unsupported_platform');
    if(!this.engineLock)this.engineLock=JSON.parse(await fs.readFile(path.join(this.root,'engine-lock.json'),'utf8'));
    const asset=this.engineLock.assets[process.platform];if(!asset)throw new Error('unsupported_platform');
    const binary=path.join(this.root,asset.binary);const digest=crypto.createHash('sha256').update(await fs.readFile(binary)).digest('hex');
    if(digest!==asset.binary_sha256)throw new Error('engine_integrity_failed');
    return {binary,version:this.engineLock.version};
  }
  async status() {
    try {const engine=await this.lock();return {state:'ok',host:os.hostname(),platform:process.platform,engine:'moli',version:engine.version,engine_digest_verified:true,python:pythonPath(),network_request_made:false,selected_origins:this.origins,active:this.active,pending:this.pending,filesystem_isolation:this.sandbox?'bwrap_required':'not_qualified',process_containment:process.platform==='win32'?'suspended_windows_job':'linux_session_subreaper',fallback:await this.fallback(),jev:{required:false,embedded:false},limits:{batch_urls:10,parallel:2,per_host:1,batch_ms:60000,process_ms:20000,text_chars:20000,evidence_store_bytes:this.store.maxBytes}};}catch(e){return {state:'unsupported',reason:e.message,platform:process.platform,network_request_made:false};}
  }
  async slot(host,deadline,signal) {
    if(this.pending>=32||this.closing)throw new Error('queue_full_or_closing');this.pending++;
    try {while(this.active>=2||this.hosts.has(host)) {if(signal.aborted)throw new Error('cancelled');if(Date.now()>=deadline)throw new Error('timeout');await new Promise(r=>setTimeout(r,20));} if(signal.aborted)throw new Error('cancelled');if(Date.now()>=deadline)throw new Error('timeout');this.active++;this.hosts.add(host);}
    finally {this.pending--;}
    return ()=>{this.active--;this.hosts.delete(host);};
  }
  async readPage(args,{signal,deadline=Date.now()+60000}={}) {
    const started=Date.now(), controller=new AbortController();const externalAbort=()=>controller.abort();signal?.addEventListener('abort',externalAbort,{once:true});if(signal?.aborted)controller.abort();this.jobs.add(controller);
    const deadlineTimer=setTimeout(()=>controller.abort('deadline'),Math.max(1,deadline-Date.now()));
    let release,proxy,temp,run,page;
    const result={evidence_id:null,requested_url:args.url,final_url:null,fetched_at:new Date().toISOString(),engine:'moli',engine_version:null,http_status:null,state:'error',title:null,text:'',content_hash:hash(''),truncated:false,warnings:[],attempts:[],extractor_version:EXTRACTOR,extraction_settings:{selector:args.selector??null},cleanup_success:true};
    try {
      if(typeof args.url!=='string')throw new Error('invalid_url');
      if(args.selector!==undefined&&(typeof args.selector!=='string'||args.selector.length>500))throw new Error('invalid_selector');
      const timeout=args.timeout_ms??15000;if(!Number.isInteger(timeout)||timeout<100||timeout>15000)throw new Error('invalid_timeout');
      const u=parseUrl(args.url,this.fixtures);result.requested_url=u.href;
      release=await this.slot(u.hostname,deadline,controller.signal);
      await bounded(resolveTarget(u,{origins:this.origins,fixtures:this.fixtures,resolver:this.resolver}),controller.signal);
      if(controller.signal.aborted)throw new Error(controller.signal.reason==='deadline'?'timeout':'cancelled');
      const engine=await this.lock();result.engine_version=engine.version;
      temp=await fs.mkdtemp(path.join(os.tmpdir(),'moli-webonderzoek-'));
      proxy=await createProxy({origins:this.origins,fixtures:this.fixtures,resolver:this.resolver,signal:controller.signal});
      const remaining=Math.max(1,deadline-Date.now());
      const commandArgs=['fetch','--dump','json','--wait-until','done','--timeout',String(Math.min(timeout,remaining)), '--fail-with-body','--block-private-networks','--http-max-response-size','2097152','--http-max-concurrent','8','--http-max-host-open','4','--http-max-total-connections','16','--http-connect-timeout','5000','--http-timeout',String(Math.min(timeout,remaining)),'--http-proxy',proxy.url];
      if(args.selector)commandArgs.push('--wait-selector',args.selector);
      commandArgs.push(u.href);
      run=await this.runner({command:sandboxCommand(engine.binary,commandArgs,{temp,sandbox:this.sandbox}),temp,timeoutMs:Math.min(20000,remaining),signal:controller.signal});
      result.cleanup_success=run.cleanup_success===true;result.cleanup_unknown=!result.cleanup_success;
      const network=proxy.summary();result.network={...network};
      result.attempts.push({engine:'moli',reason:run.reason,exit_code:run.exit_code,cleanup_success:result.cleanup_success,peak_process_tree_bytes:run.peak_process_tree_bytes,memory_measure:run.memory_measure,containment:run.containment,pid:run.pid});
      if(!result.cleanup_success)throw new Error('cleanup_unknown');
      try{page=JSON.parse(run.stdout);}catch{}
      const candidate=(run.reason==='timeout'||(run.reason==='completed'&&!page&&!/raw non-HTML|HTTP status (?:401|403|404)|captcha|login/i.test(run.stderr)));
      if(candidate&&!controller.signal.aborted&&!network.blocked&&Date.now()+1000<deadline){
        const fallback=await this.fallback();
        if(fallback.enabled){
          run=await runChromium({url:u.href,selector:args.selector,temp,proxy:proxy.url,executable:fallback.executable,signal:controller.signal,timeoutMs:Math.min(20000,deadline-Date.now())});
          result.attempts.push({engine:'chromium',reason:run.reason,exit_code:run.exit_code,cleanup_success:run.cleanup_success,peak_process_tree_bytes:run.peak_process_tree_bytes,memory_measure:run.memory_measure,containment:run.containment,pid:run.pid});
          result.engine='chromium';result.cleanup_success=run.cleanup_success===true;result.cleanup_unknown=!result.cleanup_success;
          if(!result.cleanup_success)throw new Error('cleanup_unknown');
          try{page=JSON.parse(run.stdout);}catch{page=undefined;}
          result.engine_version=page?.engine_version??null;Object.assign(network,proxy.summary());result.network={...network};
        }
      }
      if(run.reason!=='completed')throw new Error(run.reason==='cancelled'&&controller.signal.reason==='deadline'?'timeout':run.reason);
      try {page=JSON.parse(run.stdout);} catch {throw new Error(network.blocked?'network_policy':/raw non-HTML document fetch does not support/.test(run.stderr)?'unsupported_non_html_wait':'engine_failed');}
      // Final URL is checked again; browser transitions and subrequests are
      // gated by the per-fetch DNS-pinning proxy before transport.
      if(typeof page.final_url!=='string'||page.final_url.length>4096)throw new Error('oversize_engine_metadata');
      const final=new URL(page.final_url);await bounded(resolveTarget(final,{origins:this.origins,fixtures:this.fixtures,resolver:this.resolver}),controller.signal);
      const content=extract(page,args);
      Object.assign(result,content,{final_url:page.final_url,http_status:page.status,title:page.title==null?null:String(page.title).slice(0,500),content_hash:hash(content.text)});
      if(network.blocked){if(result.state!=='blocked')result.state='partial';result.warnings.push('network_requests_blocked');}
      if(/timeout|deadline/i.test(run.stderr)){result.state='partial';result.warnings.push('engine_readiness_warning');}
      if(run.exit_code!==0 && page.status<400){result.state='partial';result.warnings.push('engine_nonzero_exit');}
    }catch(e){
      let code=e.code??e.message;if(code==='cancelled'&&controller.signal.reason==='deadline')code='timeout';
      result.state=code==='cancelled'?'cancelled':code==='timeout'?'timeout':['invalid_url','port_not_allowed','origin_not_selected','private_network','network_policy'].includes(code)?'blocked':['unsupported_platform','filesystem_sandbox_unavailable','unsupported_non_html_wait'].includes(code)?'unsupported':'error';
      if(code==='invalid_url')result.requested_url='[invalid_url]';
      result.warnings.push(code); // Only controlled codes, never raw browser stderr.
    }finally{
      clearTimeout(deadlineTimer);if(proxy)await proxy.close();if(temp)await fs.rm(temp,{recursive:true,force:true});release?.();this.jobs.delete(controller);signal?.removeEventListener('abort',externalAbort);
    }
    result.elapsed_ms=Date.now()-started;
    // No evidence write for an invalid source string: never persist arbitrary
    // user-provided payloads as if they were URLs.
    if(result.final_url || result.attempts.length) {
      try{result.evidence_id=await this.store.save(result,page);}catch{result.warnings.push('evidence_store_full_or_unavailable');result.state='partial';}
    }
    const full=result.text;result.text=full.slice(0,20000);result.truncated=result.text.length<full.length;
    if(result.truncated){result.state='partial';result.warnings.push('text_truncated_use_evidence');}
    return result;
  }
  async readPages(args,{signal}={}) {
    if(!Array.isArray(args.urls)||args.urls.length<1||args.urls.length>10)throw new Error('invalid_batch');
    const budget=args.budget_ms??60000;if(!Number.isInteger(budget)||budget<100||budget>60000)throw new Error('invalid_budget');
    const deadline=Date.now()+budget;
    const results=await Promise.all(args.urls.map(url=>this.readPage({url,selector:args.selector,timeout_ms:args.timeout_ms},{signal,deadline})));
    // Keep the total tool payload bounded as well as individual page payloads.
    let chars=20000;for(const r of results){const text=r.text.slice(0,chars);if(text.length<r.text.length){r.truncated=true;r.state='partial';r.warnings.push('batch_text_truncated_use_evidence');}r.text=text;chars-=text.length;}
    return {state:results.every(r=>r.state==='ok')?'ok':'partial',results};
  }
  async call(name,args={},context={}) {
    if(name==='moli_status')return this.status();
    if(name==='moli_read_page')return this.readPage(args,context);
    if(name==='moli_read_pages')return this.readPages(args,context);
    if(name==='moli_get_evidence')return this.store.read(args.evidence_id,args.offset,args.limit);
    if(name==='moli_compare_evidence')return this.store.compare(args.before,args.after);
    throw new Error('unknown_tool');
  }
  async close(){this.closing=true;for(const c of this.jobs)c.abort();const until=Date.now()+10000;while(this.jobs.size && Date.now()<until)await new Promise(r=>setTimeout(r,25));return this.jobs.size===0;}
}
