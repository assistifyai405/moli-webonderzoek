import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ipaddr from 'ipaddr.js';
import {publicAddress} from './policy.mjs';

export function normalizeOrigin(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('invalid_origin');
  let u; try { u = new URL(raw); } catch { throw new Error('invalid_origin'); }
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) throw new Error('Use an exact HTTP(S) origin, without a path, credentials, query, fragment or nonstandard port.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.') && !host.includes(':')) throw new Error('Local hosts are not allowed.');
  if (ipaddr.isValid(host) && !publicAddress(host)) throw new Error('Private or reserved addresses are not allowed.');
  return u.origin;
}
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.selected_origins) || value.selected_origins.length > 64 || typeof value.chromium_fallback !== 'boolean') throw new Error('invalid_config');
  const origins = value.selected_origins.map(normalizeOrigin);
  if (new Set(origins).size !== origins.length) throw new Error('duplicate_origins');
  return {...value, selected_origins: origins};
}
export async function loadConfig(file) {
  if ((await fs.lstat(file)).isSymbolicLink()) throw new Error('config_symlink_refused');
  return validateConfig(JSON.parse(await fs.readFile(file, 'utf8')));
}
export async function editOrigins(file, action, origin, {apply = false} = {}) {
  if (!['list','add','remove'].includes(action)) throw new Error('Use list, add or remove.');
  const original = await fs.readFile(file, 'utf8');
  const config = await loadConfig(file);
  const before = [...config.selected_origins];
  const normalized = action === 'list' ? null : normalizeOrigin(origin);
  if (action === 'add' && !before.includes(normalized)) config.selected_origins.push(normalized);
  if (action === 'remove') config.selected_origins = before.filter(o => o !== normalized);
  validateConfig(config);
  const changed = before.join('\n') !== config.selected_origins.join('\n');
  const result = {action, origin: normalized, before, after: config.selected_origins, changed, applied: false, restart_required: changed};
  if (!apply || !changed) return result;
  const lock = file + '.lock';
  const handle = await fs.open(lock, 'wx', 0o600);
  const id = crypto.randomUUID(), backup = file + '.backup-' + id, temporary = file + '.' + id + '.tmp';
  try {
    if ((await fs.lstat(file)).isSymbolicLink() || await fs.readFile(file, 'utf8') !== original) throw new Error('Configuration changed; preview again.');
    await fs.writeFile(backup, original, {flag:'wx', mode:0o600});
    await fs.writeFile(temporary, JSON.stringify(config,null,2)+'\n', {flag:'wx', mode:0o600});
    await fs.rename(temporary,file);
    result.applied = true; result.backup = backup;
    return result;
  } finally { await handle.close(); await fs.rm(lock,{force:true}); await fs.rm(temporary,{force:true}); }
}
