import { open } from 'node:fs/promises';
import { verifyAudit } from '../src/exports.js';

const limit = 1024 * 1024;
const path = process.argv[2];
try {
  if (!path || process.argv.length !== 3) throw new Error('Usage: node scripts/verify.mjs <bundle.json>');
  const file = await open(path, 'r');
  let json;
  try {
    const meta = await file.stat();
    if (!meta.isFile() || meta.size > limit) throw new Error('Expected a JSON file no larger than 1 MiB');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error('Expected a JSON file no larger than 1 MiB');
    json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
  } finally {
    await file.close();
  }
  const verdict = await verifyAudit(json);
  console.log(JSON.stringify(verdict));
  if (!verdict.digestValid || !verdict.replayValid) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
