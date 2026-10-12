import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class PolicyError extends Error { constructor(code) { super(code); this.code = code; } }
export function publicAddress(value) {
  try { let ip = ipaddr.parse(value); if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address(); return ip.range() === 'unicast'; }
  catch { return false; }
}
export function parseUrl(raw, fixtures = []) {
  let u; try { u = new URL(raw); } catch { throw new PolicyError('invalid_url'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || raw.length > 4096) throw new PolicyError('invalid_url');
  if (!['', '80', '443'].includes(u.port) && !fixtures.includes(u.origin)) throw new PolicyError('port_not_allowed');
  u.hash = ''; return u;
}
export function originAllowed(u, origins) { return origins.includes(u.origin); }
export async function resolveTarget(u, {origins, fixtures = [], resolver = dns.lookup}) {
  // Test origins are injected in-process; never a model argument or env switch.
  if (!originAllowed(u, origins) && !fixtures.includes(u.origin)) throw new PolicyError('origin_not_selected');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let records; try { records = await resolver(host, {all: true, verbatim: true}); } catch { throw new PolicyError('dns_failed'); }
  if (!records.length) throw new PolicyError('dns_failed');
  const fixture = fixtures.includes(u.origin) && ['127.0.0.1', '::1'].includes(host);
  if (records.some(r => !publicAddress(r.address) && !(fixture && ['127.0.0.1', '::1'].includes(r.address)))) throw new PolicyError('private_network');
  return {address: records[0].address, family: records[0].family, port: Number(u.port || (u.protocol === 'https:' ? 443 : 80))};
}
