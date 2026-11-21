import assert from 'node:assert/strict';
import { Socket } from 'node:net';
import { test } from 'node:test';
import { startServer } from '../scripts/serve.mjs';

function rawRequest(port, head) {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let body = '';
    socket.setTimeout(5000);
    socket.connect(port, '127.0.0.1',
      () => socket.write(head));
    socket.on('data', chunk => { body += chunk; });
    socket.on('timeout', () => socket.destroy());
    socket.on('close', () => resolve(body));
    socket.on('error', reject);
  });
}

const statusLine = raw => raw.split('\r\n', 1)[0];

test('static host answers 400, not 500, on malformed Host headers', async () => {
  const host = await startServer({ port: 0 });
  try {
    for (const malformed of ['Host: [::1\r\n', 'Host: x:99999\r\n', 'Host: a b\r\n']) {
      const raw = await rawRequest(host.port,
        `GET /croppulse/ HTTP/1.1\r\n${malformed}Connection: close\r\n\r\n`);
      assert.match(statusLine(raw), /^HTTP\/1\.1 400/u, `${malformed.trim()} -> ${statusLine(raw)}`);
    }
  } finally {
    await host.close();
  }
});

test('static host serves the shell and its headers on an ordinary request', async () => {
  const host = await startServer({ port: 0 });
  try {
    const raw = await rawRequest(host.port,
      'GET /croppulse/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    assert.match(statusLine(raw), /^HTTP\/1\.1 200/u);
    assert.match(raw, /content-security-policy: default-src 'none'/iu);
    const post = await rawRequest(host.port,
      'POST /croppulse/ HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    assert.match(statusLine(post), /^HTTP\/1\.1 405/u);
    const missing = await rawRequest(host.port,
      'GET /croppulse/../etc/passwd HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
    assert.match(statusLine(missing), /^HTTP\/1\.1 (404|400)/u);
  } finally {
    await host.close();
  }
});
