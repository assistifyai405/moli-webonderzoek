import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {resolveTarget, PolicyError} from './policy.mjs';

// Each fetch owns its proxy, sockets, counters and origin policy. HTTPS is a
// pinned CONNECT tunnel; only wire-byte totals are observable, not TLS bodies.
export async function createProxy({origins, fixtures = [], resolver, maxBytes = 16 * 1024 * 1024, maxRequests = 100, signal}) {
  const token = crypto.randomBytes(24).toString('hex');
  const expected = `Basic ${Buffer.from(`moli:${token}`).toString('base64')}`;
  const sockets = new Set(); const events = []; let bytes = 0, requests = 0, blocked = false, closed = false;
  let peakSockets = 0;
  function event(code){blocked=true;if(events.length<20)events.push({code});}
  function track(s) { sockets.add(s); peakSockets = Math.max(peakSockets, sockets.size); s.on('error', () => {}); s.once('close', () => sockets.delete(s)); return s; }
  function count(chunk) { bytes += chunk.length; if (bytes > maxBytes) { event('network_budget');for (const s of sockets) s.destroy(); } }
  async function target(raw) {
    requests++; if (requests > maxRequests) throw new PolicyError('request_budget');
    const u = new URL(raw); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new PolicyError('invalid_url');
    const r = await resolveTarget(u, {origins, fixtures, resolver}); if(closed)throw new PolicyError('proxy_closed');return {u, r};
  }
  const server = http.createServer(async (req, res) => {
    if (req.headers['proxy-authorization'] !== expected) { res.writeHead(407, {'Proxy-Authenticate':'Basic realm="moli"'}); res.end(); return; }
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new PolicyError('method_not_allowed');
      const {u, r} = await target(req.url);
      if (u.protocol !== 'http:') throw new PolicyError('unsupported_proxy_request');
      const headers = {...req.headers, host: u.host};
      delete headers['proxy-authorization']; delete headers['proxy-connection']; delete headers.authorization; delete headers.cookie;
      const upstream = http.request({hostname:r.address, family:r.family, port:r.port, path:u.pathname + u.search, method:req.method, headers}, response => {
        res.writeHead(response.statusCode, response.headers);
        response.on('data', count); response.pipe(res);
      });
      upstream.on('socket', track); upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      req.on('data', count); req.pipe(upstream);
    } catch (e) { event(e.code ?? 'proxy_error');res.writeHead(403);res.end('Moli network policy blocked the request.'); }
  });
  server.on('connect', async (req, client, head) => {
    if (req.headers['proxy-authorization'] !== expected) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="moli"\r\n\r\n'); return; }
    try {
      const {r} = await target(`https://${req.url}`);
      const upstream = track(net.connect({host:r.address, port:r.port, family:r.family}));
      upstream.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) { count(head); upstream.write(head); } client.on('data', count); upstream.on('data', count); client.pipe(upstream); upstream.pipe(client); });
      client.once('close', () => upstream.destroy()); upstream.once('close', () => client.destroy());
    } catch (e) { event(e.code ?? 'proxy_error');client.end('HTTP/1.1 403 Forbidden\r\n\r\n'); }
  });
  server.on('connection', track);
  server.maxConnections=64;
  server.on('clientError', (_, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const close = async () => { closed=true;for (const s of sockets) s.destroy(); await new Promise(r => server.close(r)); };
  const abort = () => { for (const s of sockets) s.destroy(); };
  signal?.addEventListener('abort', abort, {once:true});
  return {url:`http://moli:${token}@127.0.0.1:${server.address().port}`, summary:() => ({bytes, requests, blocked, events:events.slice(0,20), peak_sockets:peakSockets}), close:async () => { signal?.removeEventListener('abort', abort); await close(); }};
}
