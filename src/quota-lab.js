// CropPulse quota and stress lab. Pure deterministic engine: five allocation
// strategies driven by the real root-zone water balance, a water-quota sweep,
// a FIPS 180-4 SHA-256 audited brief exporter, and a strict #cp= bookmark
// codec. No DOM, no dates, no randomness; identical state gives identical
// bytes and digests.

import { SCENARIOS } from './scenarios.js';
import { calendarBaseline, optimize, prepare, simulatePlot } from './planner.js';
import { canonicalJSON, csvCell } from './exports.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

// ---------- pure-JS SHA-256 (FIPS 180-4) ----------

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

const SHA_K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Sync(text) {
  const bytes = encoder.encode(String(text));
  const padded = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(padded);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padded - 4, (bytes.length * 8) >>> 0);
  view.setUint32(padded - 8, Math.floor(bytes.length / 0x20000000));
  const w = new Int32Array(64);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let block = 0; block < padded; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(block + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + s1 + ch + SHA_K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(word => (word >>> 0).toString(16).padStart(8, '0')).join('');
}

// ---------- lab input ----------

export const STRATEGIES = [
  'fixed-calendar', 'equal-split', 'calorie-optimal', 'wilting-guarded', 'revenue-weighted',
];

export function labScenario(caseId) {
  const scenario = SCENARIOS.find(item => item.id === caseId);
  if (!scenario) throw new RangeError('unknown case');
  return scenario;
}

export function maxQuota(caseId) {
  const scenario = labScenario(caseId);
  return scenario.lot * scenario.weather.length * scenario.plots.length;
}

export function labInput(caseId, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new RangeError('invalid lab options');
  }
  for (const key of Object.keys(options)) {
    if (key !== 'quota' && key !== 'shock') throw new RangeError('invalid lab option');
  }
  labScenario(caseId);
  return prepare(caseId, {
    quota: options.quota === undefined ? undefined : options.quota,
    shock: options.shock === undefined ? false : options.shock,
  });
}

// ---------- strategy enumeration ----------

const popcount = n => {
  let count = 0;
  while (n) { n &= n - 1; count++; }
  return count;
};

function variants(input) {
  return input.plots.map((_, index) =>
    Array.from({ length: 2 ** input.weather.length }, (_, mask) => simulatePlot(input, index, mask))
      .filter(plot => plot.lots <= input.budgetLots));
}

const compareKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

const calorieKey = (a, b, c) =>
  [-(a.calories + b.calories + c.calories), a.lots + b.lots + c.lots, a.mask, b.mask, c.mask];
const guardedKey = (a, b, c) =>
  [a.criticalDays + b.criticalDays + c.criticalDays,
    -(a.calories + b.calories + c.calories), a.lots + b.lots + c.lots, a.mask, b.mask, c.mask];
const revenueKey = (a, b, c) =>
  [-(a.value + b.value + c.value), -(a.calories + b.calories + c.calories),
    a.lots + b.lots + c.lots, a.mask, b.mask, c.mask];

// Same feasibility pruning as the planner's optimizer: at most one pulse per
// plot per day and at most dailyLots pulses across the farm per day.
function enumerateBest(input, scoreKey, lotCounts) {
  const vars = variants(input).map((list, index) =>
    lotCounts === undefined ? list : list.filter(plot => plot.lots === lotCounts[index]));
  let best = null;
  let bestKey = null;
  for (const a of vars[0]) {
    for (const b of vars[1]) {
      const shared = a.mask & b.mask;
      const union = a.mask | b.mask;
      const subtotal = a.lots + b.lots;
      if (subtotal > input.budgetLots ||
          (input.dailyLots < 1 && union) ||
          (input.dailyLots === 1 && shared)) continue;
      for (const c of vars[2]) {
        const lots = subtotal + c.lots;
        if (lots > input.budgetLots ||
            (input.dailyLots < 1 && (union | c.mask)) ||
            (input.dailyLots < 2 && (shared | (union & c.mask))) ||
            (input.dailyLots < 3 && (shared & c.mask))) continue;
        const key = scoreKey(a, b, c);
        if (best === null || compareKeys(key, bestKey) < 0) {
          best = [a, b, c];
          bestKey = key;
        }
      }
    }
  }
  return best;
}

// Equal split: every plot gets the same pulse count, apart from a remainder of
// one lot. All most-balanced profiles are tried and the feasible one with the
// highest modeled calories wins; the total shrinks until a profile is feasible.
function equalSplitMasks(input) {
  const cap = Math.min(input.budgetLots, input.weather.length * input.dailyLots);
  for (let total = cap; total >= 0; total--) {
    const base = Math.floor(total / 3);
    const rem = total % 3;
    const profiles = [];
    for (let bits = 0; bits < 8; bits++) {
      if (popcount(bits) !== rem) continue;
      profiles.push([0, 1, 2].map(i => base + ((bits >> i) & 1)));
    }
    let best = null;
    let bestKey = null;
    for (const counts of profiles) {
      const found = enumerateBest(input, calorieKey, counts);
      if (found) {
        const key = calorieKey(...found);
        if (best === null || compareKeys(key, bestKey) < 0) {
          best = found;
          bestKey = key;
        }
      }
    }
    if (best) return best.map(plot => plot.mask);
  }
  return [0, 0, 0];
}

export function strategyMasks(input, strategyId) {
  switch (strategyId) {
    case 'fixed-calendar':
      return calendarBaseline(input).plots.map(plot => plot.mask);
    case 'equal-split':
      return equalSplitMasks(input);
    case 'calorie-optimal':
      return optimize(input).plots.map(plot => plot.mask);
    case 'wilting-guarded':
      return enumerateBest(input, guardedKey).map(plot => plot.mask);
    case 'revenue-weighted':
      return enumerateBest(input, revenueKey).map(plot => plot.mask);
    default:
      throw new RangeError('unknown strategy');
  }
}

// ---------- strategy evaluation and verification ----------

const BALANCE_TOLERANCE = 1e-7;

export function evaluateMasks(input, masks, strategyId) {
  if (!Array.isArray(masks) || masks.length !== input.plots.length) {
    throw new RangeError('invalid mask set');
  }
  const plots = masks.map((mask, index) => simulatePlot(input, index, mask));
  const perDayPulses = input.weather.map(() => 0);
  let balanceOk = true;
  let boundsOk = true;
  let stressDays = 0;
  let maxDepletionPct = 0;
  plots.forEach((plot, index) => {
    const { taw, start } = input.plots[index];
    let previous = start * taw;
    plot.days.forEach((day, i) => {
      perDayPulses[i] += Number(day.pulse);
      const flux = day.eta + day.dp - day.effectiveRain - day.irrigation;
      if (Math.abs((day.dr - previous) - flux) > BALANCE_TOLERANCE) balanceOk = false;
      if (!(day.dr >= -1e-9 && day.dr <= taw + 1e-9)) boundsOk = false;
      stressDays += Number(day.ks < 1 - 1e-12);
      maxDepletionPct = Math.max(maxDepletionPct, 100 * day.dr / taw);
      previous = day.dr;
    });
  });
  const sum = key => plots.reduce((total, plot) => total + plot[key], 0);
  const lots = sum('lots');
  const water = lots * input.scenario.lot;
  const calories = sum('calories');
  const pumpOk = perDayPulses.every(count => count <= input.dailyLots);
  const budgetOk = lots <= input.budgetLots;
  return {
    id: strategyId, masks: [...masks], lots, water, calories, kg: sum('kg'),
    value: sum('value'), criticalDays: sum('criticalDays'), stressDays,
    maxDepletionPct, productivity: water > 0 ? calories / water : null,
    perDayPulses, pumpOk, budgetOk, balanceOk, boundsOk,
    verified: pumpOk && budgetOk && balanceOk && boundsOk,
    plots,
  };
}

export function runStrategy(input, strategyId) {
  return evaluateMasks(input, strategyMasks(input, strategyId), strategyId);
}

export function compareStrategies(input) {
  const strategies = STRATEGIES.map(id => runStrategy(input, id));
  return { strategies, allVerified: strategies.every(run => run.verified) };
}

// ---------- water-quota sweep ----------

export const SWEEP_PCTS = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];

export function quotaSweep(caseId, options = {}) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new RangeError('invalid sweep options');
  }
  for (const key of Object.keys(options)) {
    if (key !== 'shock' && key !== 'pcts') throw new RangeError('invalid sweep option');
  }
  const scenario = labScenario(caseId);
  const { shock = false, pcts = SWEEP_PCTS } = options;
  if (typeof shock !== 'boolean' || !Array.isArray(pcts) || pcts.length === 0 ||
      pcts.some(pct => !Number.isFinite(pct) || pct <= 0 || pct > 400)) {
    throw new RangeError('invalid sweep options');
  }
  const points = pcts.map(pct => {
    const quota = scenario.quota * pct / 100;
    const input = prepare(caseId, { quota, shock });
    const optimal = optimize(input);
    const calendar = calendarBaseline(input);
    return {
      pct, quota, budgetLots: input.budgetLots,
      optimalCalories: optimal.calories, optimalWater: optimal.water,
      optimalCritical: optimal.criticalDays, optimalKg: optimal.kg,
      optimalValue: optimal.value,
      calendarCalories: calendar.calories, calendarWater: calendar.water,
      calendarCritical: calendar.criticalDays,
      gap: optimal.calories - calendar.calories,
      marginalKcalPerM3: null,
    };
  });
  let monotonic = true;
  for (let i = 1; i < points.length; i++) {
    const deltaQuota = points[i].quota - points[i - 1].quota;
    const deltaCalories = points[i].optimalCalories - points[i - 1].optimalCalories;
    if (deltaCalories < -1e-9) monotonic = false;
    points[i].marginalKcalPerM3 = deltaQuota > 0 ? deltaCalories / deltaQuota : null;
  }
  const minCritical = Math.min(...points.map(point => point.optimalCritical));
  const cliff = points.find(point => point.optimalCritical === minCritical);
  return {
    scenario: caseId, shock, points, monotonic,
    cliffQuota: cliff ? cliff.quota : null, minCritical,
  };
}

// ---------- strict #cp= bookmark codec ----------

const CODEC_KEYS = ['case', 'plot', 'quota', 'shock', 'strategy', 'v'];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function normalizeState(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.getPrototypeOf(raw) !== Object.prototype) return null;
  const keys = Object.keys(raw);
  if (keys.length !== CODEC_KEYS.length ||
      keys.some(key => !CODEC_KEYS.includes(key) ||
        !Object.prototype.hasOwnProperty.call(raw, key))) return null;
  if (raw.v !== 1) return null;
  const scenario = SCENARIOS.find(item => item.id === raw.case);
  if (!scenario) return null;
  if (!Number.isFinite(raw.quota) || raw.quota < 0 || raw.quota > maxQuota(raw.case)) return null;
  if (typeof raw.shock !== 'boolean') return null;
  if (!STRATEGIES.includes(raw.strategy)) return null;
  if (!Number.isInteger(raw.plot) || raw.plot < 0 || raw.plot >= scenario.plots.length) return null;
  return {
    v: 1, case: raw.case, quota: raw.quota === 0 ? 0 : raw.quota,
    shock: raw.shock, strategy: raw.strategy, plot: raw.plot,
  };
}

function b64urlEncode(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function b64urlDecode(text) {
  if (!/^[A-Za-z0-9_-]+$/u.test(text) || text.length % 4 === 1) return null;
  const values = [];
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    let width = 0;
    for (let j = 0; j < 4 && i + j < text.length; j++) {
      n = (n << 6) | B64.indexOf(text[i + j]);
      width++;
    }
    n <<= 6 * (4 - width);
    if (width >= 2) values.push((n >> 16) & 255);
    if (width >= 3) values.push((n >> 8) & 255);
    if (width === 4) values.push(n & 255);
  }
  const bytes = new Uint8Array(values);
  return b64urlEncode(bytes) === text ? bytes : null;
}

export function encodeState(state) {
  const clean = normalizeState(state);
  if (!clean) throw new RangeError('invalid lab state');
  return `cp=${b64urlEncode(encoder.encode(canonicalJSON(clean)))}`;
}

export function decodeState(hash) {
  if (typeof hash !== 'string') return null;
  const match = /^#?cp=([A-Za-z0-9_-]+)$/u.exec(hash);
  if (!match) return null;
  const bytes = b64urlDecode(match[1]);
  if (bytes === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  return normalizeState(parsed);
}

// ---------- audited brief exporter ----------

const LAB_SCHEMA = 'croppulse.lab.v1';
const briefCache = new Map();
const BRIEF_CACHE_LIMIT = 24;

function briefPayload(state) {
  const input = labInput(state.case, { quota: state.quota, shock: state.shock });
  const { strategies, allVerified } = compareStrategies(input);
  const sweep = quotaSweep(state.case, { shock: state.shock });
  const selected = strategies.find(run => run.id === state.strategy);
  const scenario = input.scenario;
  const inspected = selected.plots[state.plot];
  return {
    schema: LAB_SCHEMA, synthetic: true, deterministic: true,
    state,
    site: {
      region: scenario.regions[0], latitude: scenario.latitude, elevation: scenario.elevation,
      lot: scenario.lot, flow: scenario.flow, pumpMinutes: scenario.pumpMinutes,
      startHour: scenario.startHour, dailyLots: input.dailyLots, budgetLots: input.budgetLots,
      caseQuota: scenario.quota, days: input.weather.length,
    },
    comparator: strategies.map(run => ({
      id: run.id, water: run.water, lots: run.lots, calories: run.calories,
      kg: run.kg, value: run.value, criticalDays: run.criticalDays,
      stressDays: run.stressDays, maxDepletionPct: run.maxDepletionPct,
      productivity: run.productivity, verified: run.verified,
    })),
    allVerified,
    selected: {
      strategy: state.strategy,
      masks: selected.masks,
      perDayPulses: selected.perDayPulses,
      inspectedPlot: {
        id: input.plots[state.plot].id,
        depletionPct: inspected.days.map(day => 100 * day.dr / input.plots[state.plot].taw),
        rawPct: inspected.days.map(day => 100 * day.raw / input.plots[state.plot].taw),
      },
    },
    frontier: sweep.points.map(point => ({
      pct: point.pct, quota: point.quota, budgetLots: point.budgetLots,
      optimalCalories: point.optimalCalories, calendarCalories: point.calendarCalories,
      gap: point.gap, optimalCritical: point.optimalCritical,
      marginalKcalPerM3: point.marginalKcalPerM3,
    })),
    monotonic: sweep.monotonic, cliffQuota: sweep.cliffQuota, minCritical: sweep.minCritical,
  };
}

const round = (value, digits) => {
  if (value === null || value === undefined) return '';
  return Number(value.toFixed(digits));
};

function briefCSV(payload, digest) {
  const rows = [
    ['provenance', LAB_SCHEMA, 'synthetic', true],
    ['sha256', digest],
    ['state', payload.state.case, `quota_m3=${payload.state.quota}`,
      `shock=${payload.state.shock}`, `strategy=${payload.state.strategy}`,
      `inspected_plot=${payload.state.plot}`],
    [],
    ['comparator'],
    ['strategy', 'water_m3', 'lots', 'calories_kcal', 'mass_kg', 'revenue',
      'critical_days', 'stress_days', 'max_depletion_pct', 'kcal_per_m3', 'verified'],
    ...payload.comparator.map(run => [
      run.id, round(run.water, 2), run.lots, round(run.calories, 2), round(run.kg, 3),
      round(run.value, 2), run.criticalDays, run.stressDays, round(run.maxDepletionPct, 2),
      round(run.productivity, 2), run.verified,
    ]),
    [],
    ['quota_frontier'],
    ['quota_m3', 'pct_of_case', 'budget_lots', 'optimal_kcal', 'calendar_kcal',
      'gap_kcal', 'optimal_critical_days', 'marginal_kcal_per_m3'],
    ...payload.frontier.map(point => [
      round(point.quota, 3), point.pct, point.budgetLots, round(point.optimalCalories, 2),
      round(point.calendarCalories, 2), round(point.gap, 2), point.optimalCritical,
      round(point.marginalKcalPerM3, 2),
    ]),
    ['monotonic', payload.monotonic, 'cliff_quota_m3', round(payload.cliffQuota, 3)],
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const mdCell = value => String(value ?? '').replaceAll('|', '\\|');

function briefMarkdown(payload, digest) {
  const lines = [
    '# CropPulse quota and stress brief',
    '',
    '| Field | Value |',
    '| --- | --- |',
    `| Case | ${mdCell(payload.state.case)} |`,
    `| Weekly quota (m3) | ${mdCell(round(payload.state.quota, 3))} |`,
    `| Heat and rain shock | ${mdCell(payload.state.shock)} |`,
    `| Strategy | ${mdCell(payload.state.strategy)} |`,
    `| Inspected plot | ${mdCell(payload.selected.inspectedPlot.id)} |`,
    `| Synthetic | ${mdCell(payload.synthetic)} |`,
    '',
    '## Strategy comparator',
    '',
    '| Strategy | Water m3 | kcal | Mass kg | Revenue | Critical d | Stress d | Max depletion % | kcal/m3 | Verified |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...payload.comparator.map(run =>
      `| ${mdCell(run.id)} | ${mdCell(round(run.water, 2))} | ${mdCell(round(run.calories, 2))} | ` +
      `${mdCell(round(run.kg, 3))} | ${mdCell(round(run.value, 2))} | ${mdCell(run.criticalDays)} | ` +
      `${mdCell(run.stressDays)} | ${mdCell(round(run.maxDepletionPct, 2))} | ` +
      `${mdCell(round(run.productivity, 2))} | ${mdCell(run.verified)} |`),
    '',
    '## Quota frontier',
    '',
    '| Quota m3 | % of case | Lots | Optimal kcal | Calendar kcal | Gap kcal | Critical d | Marginal kcal/m3 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...payload.frontier.map(point =>
      `| ${mdCell(round(point.quota, 3))} | ${mdCell(point.pct)} | ${mdCell(point.budgetLots)} | ` +
      `${mdCell(round(point.optimalCalories, 2))} | ${mdCell(round(point.calendarCalories, 2))} | ` +
      `${mdCell(round(point.gap, 2))} | ${mdCell(point.optimalCritical)} | ` +
      `${mdCell(round(point.marginalKcalPerM3, 2))} |`),
    '',
    `Frontier monotonic: ${payload.monotonic}. Fewest critical days first reached at ${round(payload.cliffQuota, 3)} m3.`,
    '',
    'All figures are simulated on synthetic data; not agronomic advice.',
    '',
    `sha256 ${digest}`,
    '',
  ];
  return lines.join('\n');
}

// One canonical digest-stamped brief per normalized state key: the on-page
// fingerprint, JSON export, CSV provenance row, and Markdown footer all reuse
// the same object so they can never drift apart.
export function buildBrief(rawState) {
  const state = normalizeState(rawState);
  if (state === null) throw new RangeError('invalid lab state');
  const key = canonicalJSON(state);
  const cached = briefCache.get(key);
  if (cached) {
    briefCache.delete(key);
    briefCache.set(key, cached);
    return cached;
  }
  const payload = briefPayload(state);
  const digest = sha256Sync(canonicalJSON(payload));
  const brief = {
    algorithm: 'SHA-256', digest, payload,
    json: `${canonicalJSON({ algorithm: 'SHA-256', digest, payload })}\n`,
    csv: briefCSV(payload, digest),
    markdown: briefMarkdown(payload, digest),
  };
  briefCache.set(key, brief);
  if (briefCache.size > BRIEF_CACHE_LIMIT) {
    briefCache.delete(briefCache.keys().next().value);
  }
  return brief;
}

// The digest detects changes; it is not a signature and names no author.
export function verifyBrief(bundle) {
  try {
    if (bundle === null || typeof bundle !== 'object' || Array.isArray(bundle)) {
      return { digestValid: false };
    }
    if (Object.keys(bundle).sort().join(',') !== 'algorithm,digest,payload' ||
        bundle.algorithm !== 'SHA-256' || typeof bundle.digest !== 'string' ||
        !/^[a-f0-9]{64}$/u.test(bundle.digest) ||
        bundle.payload?.schema !== LAB_SCHEMA) {
      return { digestValid: false };
    }
    return { digestValid: sha256Sync(canonicalJSON(bundle.payload)) === bundle.digest };
  } catch {
    return { digestValid: false };
  }
}

// Interactive tamper check: clone the brief, alter one modeled figure, and the
// digest no longer matches.
export function tamperForDemo(bundle) {
  const copy = JSON.parse(canonicalJSON({ algorithm: bundle.algorithm,
    digest: bundle.digest, payload: bundle.payload }));
  copy.payload.comparator[0].calories += 1;
  return copy;
}

// ---------- deterministic in-page self-checks ----------

const KAT_VECTORS = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['The quick brown fox jumps over the lazy dog',
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
];

export function labSelfChecks() {
  const checks = [];
  const check = (name, fn) => {
    try {
      checks.push({ name, ok: fn() === true });
    } catch {
      checks.push({ name, ok: false });
    }
  };

  for (const [text, expected] of KAT_VECTORS) {
    check(`SHA-256 KAT ${JSON.stringify(text.slice(0, 24))}`, () => sha256Sync(text) === expected);
  }

  check('five strategies defined', () => STRATEGIES.length === 5 &&
    new Set(STRATEGIES).size === 5);

  const grids = [];
  for (const scenario of SCENARIOS) {
    for (const shock of [false, true]) {
      grids.push({ scenario, shock, input: labInput(scenario.id, { shock }) });
    }
  }
  const runs = grids.map(grid => ({ ...grid, comparison: compareStrategies(grid.input) }));

  check('pump ceiling respected by every strategy', () =>
    runs.every(({ input, comparison }) =>
      comparison.strategies.every(run =>
        run.perDayPulses.every(count => count <= input.dailyLots))));

  check('weekly quota never exceeded', () =>
    runs.every(({ input, comparison }) =>
      comparison.strategies.every(run => run.lots <= input.budgetLots)));

  check('root-zone depletion stays inside 0..TAW', () =>
    runs.every(({ comparison }) => comparison.strategies.every(run => run.boundsOk)));

  check('root-zone water balance is exact', () =>
    runs.every(({ comparison }) => comparison.strategies.every(run => run.balanceOk)));

  check('calorie-optimal never loses to the fixed calendar', () =>
    runs.every(({ comparison }) => {
      const opt = comparison.strategies.find(run => run.id === 'calorie-optimal');
      const cal = comparison.strategies.find(run => run.id === 'fixed-calendar');
      return opt.calories >= cal.calories - 1e-9;
    }));

  check('wilting-guarded holds fewest critical days', () =>
    runs.every(({ comparison }) => {
      const guard = comparison.strategies.find(run => run.id === 'wilting-guarded');
      return comparison.strategies.every(run => run.criticalDays >= guard.criticalDays);
    }));

  check('revenue-weighted tops modeled revenue', () =>
    runs.every(({ comparison }) => {
      const rev = comparison.strategies.find(run => run.id === 'revenue-weighted');
      return comparison.strategies.every(run => run.value <= rev.value + 1e-9);
    }));

  check('equal split differs by at most one lot per plot', () =>
    runs.every(({ comparison }) => {
      const split = comparison.strategies.find(run => run.id === 'equal-split');
      const counts = split.plots.map(plot => plot.lots);
      return Math.max(...counts) - Math.min(...counts) <= 1;
    }));

  check('strategies are deterministic', () =>
    runs.every(({ input }) =>
      STRATEGIES.every(id => {
        const a = strategyMasks(input, id);
        const b = strategyMasks(input, id);
        return a.length === b.length && a.every((mask, i) => mask === b[i]);
      })));

  check('zero quota still verifies cleanly', () => {
    const input = labInput('terraces', { quota: 0 });
    const comparison = compareStrategies(input);
    return comparison.strategies.every(run =>
      run.water === 0 && run.verified && run.productivity === null);
  });

  check('every strategy reports verified', () =>
    runs.every(({ comparison }) => comparison.allVerified));

  check('CSV formula cells are neutralized', () =>
    csvCell('=CMD()').startsWith(`"'`) && csvCell('  =1+1').startsWith(`"'`) &&
    csvCell('\n+SUM(1)').startsWith(`"'`) && csvCell('\t@cmd').startsWith(`"'`));

  check('codec round-trips every case', () =>
    SCENARIOS.every((scenario, i) => {
      const state = { v: 1, case: scenario.id, quota: scenario.quota,
        shock: i % 2 === 0, strategy: STRATEGIES[i % STRATEGIES.length], plot: i % 3 };
      const decoded = decodeState(encodeState(state));
      return decoded !== null &&
        CODEC_KEYS.every(key => Object.is(decoded[key], state[key]));
    }));

  check('codec rejects hostile hashes', () => {
    const good = encodeState({ v: 1, case: 'terraces', quota: 18, shock: false,
      strategy: 'equal-split', plot: 1 });
    const tampered = JSON.stringify({ v: 1, case: 'terraces', quota: 18, shock: false,
      strategy: 'equal-split', plot: 1, ['__proto' + '__']: {} });
    const hostile = `cp=${b64urlEncode(encoder.encode(tampered))}`;
    return decodeState(good) !== null &&
      decodeState(`${good}x`) === null &&
      decodeState('cp=!!!') === null &&
      decodeState('cp=') === null &&
      decodeState(good.replace('cp=', '')) === null &&
      decodeState(hostile) === null &&
      decodeState(`cp=${b64urlEncode(encoder.encode('{"v":2}'))}`) === null &&
      decodeState(42) === null;
  });

  check('digest parity across JSON, CSV and Markdown', () => {
    const brief = buildBrief({ v: 1, case: 'high-plains', quota: 126, shock: true,
      strategy: 'revenue-weighted', plot: 2 });
    return brief.json.includes(`"digest":"${brief.digest}"`) &&
      brief.csv.includes(`"sha256","${brief.digest}"`) &&
      brief.markdown.includes(`sha256 ${brief.digest}`) &&
      sha256Sync(canonicalJSON(brief.payload)) === brief.digest &&
      buildBrief({ v: 1, case: 'high-plains', quota: 126, shock: true,
        strategy: 'revenue-weighted', plot: 2 }) === brief;
  });

  check('tamper demo always fails verification', () => {
    const brief = buildBrief({ v: 1, case: 'cooperative', quota: 144, shock: false,
      strategy: 'calorie-optimal', plot: 0 });
    return verifyBrief(JSON.parse(brief.json)).digestValid === true &&
      verifyBrief(tamperForDemo(brief)).digestValid === false;
  });

  check('quota frontier is monotonic in every case', () =>
    SCENARIOS.every(scenario =>
      [false, true].every(shock => quotaSweep(scenario.id, { shock }).monotonic)));

  check('frontier cliff marks fewest critical days', () =>
    SCENARIOS.every(scenario => {
      const sweep = quotaSweep(scenario.id);
      return sweep.points.every(point => point.optimalCritical >= sweep.minCritical) &&
        sweep.cliffQuota !== null;
    }));

  return { checks, passed: checks.filter(item => item.ok).length, total: checks.length };
}
