import { compare, prepare } from './planner.js';

const encoder = new TextEncoder();
const schema = 'croppulse.audit.v1';
const model = 'croppulse.model.v1';
const crlf = '\r\n';

export function csvCell(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('nonfinite CSV number');
  let text = String(value ?? '');
  if (typeof value !== 'number' &&
      (/^[\t\r\n]/u.test(text) || /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u.test(text))) {
    text = "'" + text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function scheduleCSV(result) {
  const rows = [['date_utc', 'plot', 'pump_start_utc', 'pump_end_utc', 'gross_m3', 'net_mm']];
  for (const { date, events } of result.schedule) {
    for (const event of events) {
      rows.push([date, event.plot, event.start, event.end, event.volume, Number(event.irrigation.toFixed(4))]);
    }
  }
  return rows.map(row => row.map(csvCell).join(',')).join(crlf) + crlf;
}

const stripUnsafe = value => String(value)
  .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\ud800-\udfff]/gu, '');

export function icsText(value) {
  return stripUnsafe(String(value).replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/gu, '\\n')
    .replaceAll(';', '\\;').replaceAll(',', '\\,'));
}

export function foldLine(line) {
  const lines = [];
  let current = '';
  let length = 0;
  for (const point of line) {
    const size = encoder.encode(point).length;
    if (length + size > 75) {
      lines.push(current);
      current = ' ';
      length = 1;
    }
    current += point;
    length += size;
  }
  return [...lines, current].join(crlf);
}

function icalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/u.test(value)) {
    throw new TypeError('expected UTC date and time');
  }
  if (value.includes('.') && !value.endsWith('.000Z')) {
    throw new TypeError('fractional seconds are not supported');
  }
  const normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  const date = new Date(normalized);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== normalized) {
    throw new TypeError('invalid UTC date and time');
  }
  return normalized.replace(/[-:]|\.\d{3}/gu, '');
}

export function scheduleICS(result, scenarioId,
  { stamp = new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z'), es = false } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CropPulse//Field Schedule 1.0//EN',
    'CALSCALE:GREGORIAN'];
  const timestamp = icalDate(stamp);
  for (const { events } of result.schedule) {
    for (const event of events) {
      const start = icalDate(event.start);
      const end = icalDate(event.end);
      if (end <= start) throw new RangeError('event must end after it starts');
      const key = encodeURIComponent(stripUnsafe(`${scenarioId}/${event.plot}/${start}`));
      const summary = es ? `Riego de parcela ${event.plot}` : `Irrigate plot ${event.plot}`;
      const notes = es ? `${event.volume} m3. Plan simulado, no una recomendaci\u00f3n.` :
        `${event.volume} m3. Simulated plan, not a recommendation.`;
      lines.push('BEGIN:VEVENT', `UID:${key}@croppulse.invalid`, `DTSTAMP:${timestamp}`,
        `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(notes)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT15M', `DESCRIPTION:${icsText(summary)}`,
        'END:VALARM', 'END:VEVENT');
    }
  }
  return lines.length === 4 ? null : [...lines, 'END:VCALENDAR'].map(foldLine).join(crlf) + crlf;
}

export function canonicalJSON(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${Array.from(value, canonicalJSON).join(',')}]`;
  if (typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  }
  throw new TypeError('unsupported canonical JSON value');
}

export async function sha256(text) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function auditPayload(input, comparison) {
  return { schema, model, synthetic: true,
    settings: { scenario: input.scenario.id, quota: input.quota, shock: input.shock, stages: input.stages },
    site: { latitude: input.scenario.latitude, elevation: input.scenario.elevation,
      lot: input.scenario.lot, flow: input.scenario.flow, pumpMinutes: input.scenario.pumpMinutes,
      startHour: input.scenario.startHour },
    weather: input.weather, plots: input.plots, comparison };
}

export async function makeAudit(input, comparison) {
  const payload = auditPayload(input, comparison);
  return { algorithm: 'SHA-256', digest: await sha256(canonicalJSON(payload)), payload };
}

// The digest detects changes; replay checks the bundled data against this model version.
export async function verifyAudit(bundle) {
  let digestValid = false;
  try {
    if (Object.keys(bundle).sort().join(',') !== 'algorithm,digest,payload' ||
        bundle.algorithm !== 'SHA-256' || typeof bundle.digest !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(bundle.digest) || bundle.payload?.schema !== schema) {
      return { digestValid: false, replayValid: false };
    }
    const text = canonicalJSON(bundle.payload);
    digestValid = await sha256(text) === bundle.digest;
    if (!digestValid || bundle.payload.model !== model) return { digestValid, replayValid: false };
    const { scenario, quota, shock, stages } = bundle.payload.settings;
    const input = prepare(scenario, { quota, shock, stages });
    const expected = auditPayload(input, compare(input));
    // Transcendental functions may round differently between JavaScript engines.
    const same = (a, b) => {
      if (typeof a === 'number' && typeof b === 'number') {
        return Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(b));
      }
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' ||
          Array.isArray(a) !== Array.isArray(b)) return false;
      const keys = Object.keys(b);
      return Object.keys(a).length === keys.length &&
        keys.every(key => Object.hasOwn(a, key) && same(a[key], b[key]));
    };
    return { digestValid, replayValid: same(bundle.payload, expected) };
  } catch {
    return { digestValid, replayValid: false };
  }
}
