import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { canonicalJSON, csvCell, foldLine, icsText, makeAudit, scheduleCSV, scheduleICS, sha256, verifyAudit }
  from '../src/exports.js';
import { compare, prepare } from '../src/planner.js';
import { SCENARIOS } from '../src/scenarios.js';

const sample = {
  schedule: [{ date: '2027-07-12', events: [{
    plot: 'A', start: '2027-07-12T12:00:00.000Z', end: '2027-07-12T12:36:00.000Z',
    volume: 18, irrigation: 10.123456,
  }] }],
};
const stamp = '2026-11-21T03:04:05.000Z';

for (const [value, expected] of [
  ['=SUM(A1:A9)', `"'=SUM(A1:A9)"`], ['+1+2', `"'+1+2"`], ['-1+2', `"'-1+2"`],
  [' @cmd', `"' @cmd"`], ['\ufeff=1+1', `"'\ufeff=1+1"`], ['\tA1', `"'\tA1"`],
  ['\nA1', `"'\nA1"`], ['\r+1', `"'\r+1"`], ['\u200b =2', `"'\u200b =2"`],
  ['A, "B"', '"A, ""B"""'], [-2, '"-2"'], [0, '"0"'], [null, '""'], ['plain', '"plain"'],
]) test(`CSV cell safety ${JSON.stringify(value)}`, () => assert.equal(csvCell(value), expected));

test('CSV has a stable field order, explicit units, and CRLF records', () => {
  assert.equal(scheduleCSV(sample), [
    '"date_utc","plot","pump_start_utc","pump_end_utc","gross_m3","net_mm"',
    '"2027-07-12","A","2027-07-12T12:00:00.000Z","2027-07-12T12:36:00.000Z","18","10.1235"',
    '',
  ].join('\r\n'));
  assert.equal(scheduleCSV({ schedule: [] }).split('\r\n').length, 2);
  assert.throws(() => csvCell(NaN), TypeError);
});

test('RFC 5545 UTC calendar wraps stable keys, duration and a display alarm', () => {
  const output = scheduleICS(sample, 'high-plains', { stamp });
  assert.ok(output.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(output.endsWith('END:VCALENDAR\r\n'));
  assert.match(output, /\r\nUID:high-plains%2FA%2F20270712T120000Z@croppulse\.invalid\r\n/);
  assert.match(output, /\r\nDTSTAMP:20261121T030405Z\r\nDTSTART:20270712T120000Z\r\nDTEND:20270712T123600Z\r\n/);
  assert.match(output, /\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Irrigate plot A\r\nEND:VALARM\r\n/);
  assert.doesNotMatch(output, /(?<!\r)\n|\r(?!\n)|TZID/);
  assert.match(scheduleICS(sample, 'high-plains', { stamp, es: true }), /\r\nSUMMARY:Riego de parcela A\r\n/);
  assert.equal(scheduleICS({ schedule: [{ events: [] }] }, 'test', { stamp }), null);
});

test('calendar uses UTC ISO dates, valid calendar values and forward intervals only', () => {
  for (const invalid of ['2027-07-12T12:00:00', '2027-02-30T00:00:00Z',
    '2027-07-12T24:00:00Z', '2027-07-12T00:00:00+00:00', null]) {
    assert.throws(() => scheduleICS(sample, 'test', { stamp: invalid }), TypeError);
  }
  const malformed = structuredClone(sample);
  malformed.schedule[0].events[0].end = '2027-07-12T11:00:00Z';
  assert.throws(() => scheduleICS(malformed, 'test', { stamp }), RangeError);
});

test('calendar UID and escaped summary cannot inject properties or a second event', () => {
  const dangerous = structuredClone(sample);
  dangerous.schedule[0].events[0].plot = 'A\r\nBEGIN:VEVENT\\,;\t';
  const output = scheduleICS(dangerous, 'key\r\nATTENDEE', { stamp });
  assert.equal(output.split('\r\n').filter(line => line === 'BEGIN:VEVENT').length, 1);
  assert.doesNotMatch(output, /\r\nATTENDEE/);
  assert.equal(icsText('x\r\ny\rz\n;,\\\t'), 'x\\ny\\nz\\n\\;\\,\\\\');
});

for (const length of [0, 72, 73, 74, 75, 76, 149, 207]) {
  test(`calendar folding preserves content at byte boundary ${length}`, () => {
    const input = 'a'.repeat(length) + '\u00f3\u{1f33e}tail'.repeat(20);
    const output = foldLine(input);
    assert.equal(output.replaceAll('\r\n ', ''), input);
    output.split('\r\n').forEach(line => assert.ok(Buffer.byteLength(line) <= 75));
    assert.doesNotMatch(output, /\ufffd/);
  });
}

test('canonical JSON sorts keys recursively and preserves array order', () => {
  assert.equal(canonicalJSON({ z: [2, 1, { b: true, a: null }], '2': 2, '10': 1, a: -0 }),
    '{"10":1,"2":2,"a":0,"z":[2,1,{"a":null,"b":true}]}');
  assert.equal(canonicalJSON({ b: 1, a: 2 }), canonicalJSON(JSON.parse('{"a":2,"b":1}')));
  for (const outside of [undefined, NaN, Infinity, Array(1), 1n, new Date(), { bad: undefined }]) {
    assert.throws(() => canonicalJSON(outside), TypeError);
  }
});

test('SHA-256 standard test vector and Node independent digest', async () => {
  assert.equal(await sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const unicode = 'Parcela \u00f1 \u{1f33e}';
  assert.equal(await sha256(unicode), createHash('sha256').update(unicode, 'utf8').digest('hex'));
});

for (const scenario of SCENARIOS) {
  for (const shock of [false, true]) {
    test(`canonical audit restart and replay ${scenario.id} shock=${shock}`, async () => {
      const input = prepare(scenario.id, { shock, stages: ['fill', 'flower', 'establish'] });
      const report = compare(input);
      const bundle = await makeAudit(input, report);
      const reopened = JSON.parse(canonicalJSON(bundle));
      assert.deepEqual(await verifyAudit(reopened), { digestValid: true, replayValid: true });
      assert.deepEqual(await makeAudit(input, report), bundle);
      assert.equal(bundle.digest, createHash('sha256').update(canonicalJSON(bundle.payload)).digest('hex'));
      reopened.payload.weather[0].et0 += 1;
      assert.deepEqual(await verifyAudit(reopened), { digestValid: false, replayValid: false });
      reopened.digest = await sha256(canonicalJSON(reopened.payload));
      assert.deepEqual(await verifyAudit(reopened), { digestValid: true, replayValid: false });
    });
  }
}

test('verifier rejects malformed algorithms, extensions, invalid settings and version mismatch', async () => {
  const input = prepare('terraces', { quota: 0 });
  const original = await makeAudit(input, compare(input));
  for (const broken of [null, [], {}, { ...original, extra: 'not hashed' },
    { ...original, algorithm: 'SHA-1' }, { ...original, digest: 'f'.repeat(63) }]) {
    assert.deepEqual(await verifyAudit(broken), { digestValid: false, replayValid: false });
  }
  for (const patch of [{ model: 'future' }, { settings: { scenario: 'not-known' } }]) {
    const payload = { ...original.payload, ...patch };
    assert.deepEqual(await verifyAudit({ ...original, payload, digest: await sha256(canonicalJSON(payload)) }),
      { digestValid: true, replayValid: false });
  }
});
