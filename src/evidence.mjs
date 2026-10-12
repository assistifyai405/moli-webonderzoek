import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {hash} from './extract.mjs';

export class EvidenceStore {
  constructor(root, {maxBytes=64*1024*1024}={}) { this.root=path.resolve(root); this.maxBytes=maxBytes; this.tail=Promise.resolve(); }
  async init() { await fs.mkdir(this.root,{recursive:true, mode:0o700}); }
  async save(result, page) {
    const task = this.tail.then(async () => {
      await this.init();
      const entries=await fs.readdir(this.root); let used=0;
      for (const f of entries) { if (f.endsWith('.json')) used+=(await fs.stat(path.join(this.root,f))).size; }
      const id=crypto.randomUUID();
      // Never persist engine headers/cookies; the rendered HTML is the original
      // DOM snapshot, not arbitrary network bodies. Public selected origins only.
      const safePage=page ? {final_url:page.final_url,status:page.status,title:page.title,html:page.html ?? null,headers:(page.headers ?? []).filter(h=>['content-type','last-modified','etag'].includes(h.name.toLowerCase())),redirect_chain:(page.redirect_chain ?? []).map(r=>({from_url:r.from_url,to_url:r.to_url,status:r.status}))} : null;
      const data={format_version:1, result:{...result,evidence_id:id}, page:safePage,page_hash:hash(JSON.stringify(safePage))};
      const bytes=Buffer.from(JSON.stringify(data)); if (used+bytes.length>this.maxBytes) throw new Error('evidence_store_full');
      const tmp=path.join(this.root,`.${id}.tmp`), dest=path.join(this.root,`${id}.json`);
      await fs.writeFile(tmp,bytes,{flag:'wx',mode:0o600}); await fs.rename(tmp,dest); return id;
    });
    this.tail=task.catch(()=>{}); return task;
  }
  async load(id) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error('invalid_evidence_id');
    const f=path.join(this.root,`${id}.json`); const st=await fs.lstat(f); if (st.isSymbolicLink() || st.size>8*1024*1024) throw new Error('invalid_evidence');
    const j=JSON.parse(await fs.readFile(f,'utf8')); if (hash(j.result.text)!==j.result.content_hash || hash(JSON.stringify(j.page))!==j.page_hash) throw new Error('evidence_integrity_failed'); return j;
  }
  async read(id, offset=0, limit=20000) {
    if (!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>20000) throw new Error('invalid_page');
    const {result}=await this.load(id); const text=result.text.slice(offset,offset+limit);
    return {...result,text,offset,total_chars:result.text.length,next_offset:offset+text.length<result.text.length?offset+text.length:null,truncated:offset+text.length<result.text.length};
  }
  async compare(a,b) {
    const x=(await this.load(a)).result,y=(await this.load(b)).result;
    if (x.requested_url!==y.requested_url) throw new Error('different_sources');
    if (x.extractor_version!==y.extractor_version||JSON.stringify(x.extraction_settings)!==JSON.stringify(y.extraction_settings)||x.engine!==y.engine||x.engine_version!==y.engine_version) return {state:'uncertain',comparable:false,reason:'extraction_or_engine_changed',before:a,after:b};
    const changed=x.content_hash!==y.content_hash;
    // A bounded line-oriented summary; full originals remain paginatable.
    const before=new Set(x.text.split('\n')),after=new Set(y.text.split('\n'));
    return {state:(!['ok','uncertain'].includes(x.state)||!['ok','uncertain'].includes(y.state))?'uncertain':'ok',comparable:true,changed,before:a,after:b,before_fetched_at:x.fetched_at,after_fetched_at:y.fetched_at,added:[...after].filter(s=>!before.has(s)).slice(0,20).map(s=>s.slice(0,500)),removed:[...before].filter(s=>!after.has(s)).slice(0,20).map(s=>s.slice(0,500)),warning:'bounded_line_summary_not_full_diff'};
  }
}
