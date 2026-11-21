// CropPulse local static host. Node standard library only: serves the repo's
// runtime files under /croppulse/ on 127.0.0.1 with a strict CSP header.
// It makes no outbound requests.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOUNT = '/croppulse';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Exact runtime allowlist: anything else answers 404.
const ALLOWED = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/icon.svg', 'icon.svg'],
  ['/sw.js', 'sw.js'],
  ['/src/ui.js', 'src/ui.js'],
  ['/src/i18n.js', 'src/i18n.js'],
  ['/src/physics.js', 'src/physics.js'],
  ['/src/scenarios.js', 'src/scenarios.js'],
  ['/src/planner.js', 'src/planner.js'],
  ['/src/exports.js', 'src/exports.js'],
]);

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export function startServer({ port = 4178, host = '127.0.0.1' } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('method not allowed');
        return;
      }
      if (url.pathname === '/') {
        res.writeHead(302, { ...HEADERS, Location: `${MOUNT}/` });
        res.end();
        return;
      }
      if (url.pathname === MOUNT) {
        res.writeHead(302, { ...HEADERS, Location: `${MOUNT}/` });
        res.end();
        return;
      }
      if (url.pathname === '/favicon.ico') {
        const body = await readFile(path.join(ROOT, 'icon.svg'));
        res.writeHead(200, { ...HEADERS, 'Content-Type': 'image/svg+xml', 'Content-Length': body.length });
        res.end(req.method === 'HEAD' ? undefined : body);
        return;
      }
      const rel = url.pathname.startsWith(`${MOUNT}/`)
        ? url.pathname.slice(MOUNT.length)
        : null;
      let key = null;
      try {
        key = rel === null ? null : decodeURIComponent(rel);
      } catch {
        key = null;
      }
      const file = key === null ? undefined : ALLOWED.get(key);
      if (!file) {
        res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      const body = await readFile(path.join(ROOT, file));
      const headers = {
        ...HEADERS,
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Length': body.length,
      };
      if (file === 'sw.js') headers['Service-Worker-Allowed'] = `${MOUNT}/`;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('server error');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      resolve({
        server,
        port: address.port,
        origin: `http://${host}:${address.port}`,
        url: `http://${host}:${address.port}${MOUNT}/`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argPort = process.argv.indexOf('--port');
  const port = Number(
    argPort > -1 ? process.argv[argPort + 1] : (process.env.PORT ?? 4178),
  );
  const { url } = await startServer({ port: Number.isFinite(port) ? port : 4178 });
  console.log(`CropPulse served at ${url}`);
}
