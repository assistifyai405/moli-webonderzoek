import {parseHTML} from 'linkedom';
import TurndownService from 'turndown';
import gfm from 'turndown-plugin-gfm';
import crypto from 'node:crypto';

export const EXTRACTOR = 'dom-markdown-v1';
export const hash = text => crypto.createHash('sha256').update(text).digest('hex');
export function extract(page, {selector} = {}) {
  if (!page || !Number.isInteger(page.status) || typeof page.final_url !== 'string') throw new Error('invalid_engine_json');
  if (typeof page.html !== 'string') return {text:'', state:'unsupported', warnings:['non_html_response']};
  const {document} = parseHTML(page.html);
  for (const el of document.querySelectorAll('script,style,noscript,template,iframe,object,embed')) el.remove();
  // Linkedom parses inertly: no fetches, no JavaScript execution.
  let root = document.body ?? document.documentElement;
  const warnings = ['untrusted_source_content'];
  if (selector) { try { root = document.querySelector(selector); } catch { throw new Error('invalid_selector'); } if (!root) return {text:'',state:'partial',warnings:[...warnings,'expected_selector_missing']}; }
  for (const el of root.querySelectorAll('[hidden],[aria-hidden="true"]')) el.remove();
  for (const el of root.querySelectorAll('a[href],img[src]')) {
    const attr = el.localName === 'a' ? 'href' : 'src';
    try { const u = new URL(el.getAttribute(attr), page.final_url); if (['http:','https:'].includes(u.protocol) && !u.username && !u.password) el.setAttribute(attr,u.href); else el.removeAttribute(attr); } catch { el.removeAttribute(attr); }
  }
  const converter = new TurndownService({headingStyle:'atx', codeBlockStyle:'fenced'}); converter.use(gfm.gfm);
  const text = converter.turndown(root.innerHTML).replace(/\r\n/g,'\n').trim();
  const sample = `${page.title ?? ''}\n${text}`.toLowerCase();
  let state = 'ok';
  if (page.status === 401 || page.status === 403 || /captcha|verify you are human|checking your browser|just a moment|access denied/.test(sample)) state = 'blocked';
  else if (page.status >= 400) state = 'error';
  else if (!text) { state='partial'; warnings.push('empty_document'); }
  else if (/sign in to continue|log in to continue|please log in|login required/.test(sample)) { state='blocked'; warnings.push('possible_login_wall'); }
  else if (!selector) { state='uncertain'; warnings.push('semantic_completeness_not_verified'); }
  return {text,state,warnings};
}
