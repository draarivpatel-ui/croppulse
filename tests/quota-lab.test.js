import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { canonicalJSON, csvCell } from '../src/exports.js';
import { prepare, simulatePlot } from '../src/planner.js';
import { SCENARIOS } from '../src/scenarios.js';
import { STRATEGIES, SWEEP_PCTS, buildBrief, compareStrategies, decodeState,
  encodeState, evaluateMasks, labInput, labScenario, labSelfChecks, maxQuota,
  normalizeState, quotaSweep, runStrategy, sha256Sync, strategyMasks,
  tamperForDemo, verifyBrief } from '../src/quota-lab.js';

const close = (a, b, epsilon = 1e-10) => assert.ok(
  Math.abs(a - b) <= epsilon, `actual ${a}, expected ${b} within ${epsilon}`);

// ---------- SHA-256 ----------

for (const [text, expected] of [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['The quick brown fox jumps over the lazy dog',
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
  ['The quick brown fox jumps over the lazy dog.',
    'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c'],
]) {
  test(`SHA-256 known answer ${JSON.stringify(text.slice(0, 20))}`, () =>
    assert.equal(sha256Sync(text), expected));
}

for (const n of [0, 1, 2, 3, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 127, 128,
  129, 191, 192, 255, 256, 511, 512, 1000, 4096, 100000]) {
  test(`SHA-256 matches node crypto at byte length ${n}`, () => {
    const text = 'a'.repeat(n) + 'x'.repeat(n % 11);
    assert.equal(sha256Sync(text), createHash('sha256').update(text, 'utf8').digest('hex'));
  });
}

for (const text of ['Parcela \u00f1', '\u{1f33e}\u{1f331}\u{1f33d}', '\u00fc\u00e9\u00e8',
  'line\nbreak\ttab', '\u0000\u0001\u00ff', '\ud83d\ude00emoji']) {
  test(`SHA-256 unicode edge ${JSON.stringify(text.slice(0, 12))}`, () =>
    assert.equal(sha256Sync(text), createHash('sha256').update(text, 'utf8').digest('hex')));
}

// ---------- input validation ----------

for (const scenario of SCENARIOS) {
  test(`labScenario and maxQuota ${scenario.id}`, () => {
    assert.equal(labScenario(scenario.id), scenario);
    assert.equal(maxQuota(scenario.id),
      scenario.lot * scenario.weather.length * scenario.plots.length);
    const input = labInput(scenario.id);
    assert.equal(input.quota, scenario.quota);
    assert.equal(input.shock, false);
    const shocked = labInput(scenario.id, { shock: true });
    assert.ok(shocked.weather[2].et0 > input.weather[2].et0);
  });
}

for (const bad of [null, undefined, 0, 'nope', {}, 'high-plains ']) {
  test(`labScenario rejects ${JSON.stringify(bad) ?? 'undefined'}`, () =>
    assert.throws(() => labScenario(bad), RangeError));
}

for (const opts of [
  null, 5, 'x', [], { quota: NaN }, { quota: -1 }, { quota: Infinity },
  { quota: '18' }, { quota: 1e9 }, { shock: 0 }, { shock: 'true' },
  { stages: ['flower', 'fill', 'establish'] }, { plot: 0 }, { extra: 1 },
  { quota: 36, plot: 1 },
]) {
  test(`labInput rejects ${JSON.stringify(opts)}`, () =>
    assert.throws(() => labInput('high-plains', opts), RangeError));
}

for (const opts of [
  null, 'x', [], { pcts: [] }, { pcts: '50' }, { pcts: [0] }, { pcts: [-10] },
  { pcts: [NaN] }, { pcts: [401] }, { pcts: [Infinity] }, { shock: 1 },
  { quota: 5 }, { pcts: [50], extra: 1 },
]) {
  test(`quotaSweep rejects ${JSON.stringify(opts)}`, () =>
    assert.throws(() => quotaSweep('cooperative', opts), RangeError));
}

test('quotaSweep rejects an unknown case', () =>
  assert.throws(() => quotaSweep('nowhere'), RangeError));

// ---------- codec ----------

const validState = { v: 1, case: 'high-plains', quota: 126, shock: true,
  strategy: 'revenue-weighted', plot: 2 };

for (const scenario of SCENARIOS) {
  for (const strategy of STRATEGIES) {
    test(`codec round-trip ${scenario.id} ${strategy}`, () => {
      for (const plot of [0, 1, 2]) {
        const state = { v: 1, case: scenario.id, quota: scenario.quota,
          shock: plot === 1, strategy, plot };
        assert.deepEqual(decodeState(encodeState(state)), state);
        assert.deepEqual(decodeState(`#${encodeState(state)}`), state);
      }
    });
  }
}

test('encodeState rejects invalid lab states', () => {
  for (const bad of [null, undefined, 5, 'x', [], { v: 1 },
    { ...validState, extra: 1 }, { ...validState, v: 2 },
    { ...validState, case: 'nope' }, { ...validState, quota: -5 },
    { ...validState, quota: NaN }, { ...validState, quota: Infinity },
    { ...validState, shock: 0 }, { ...validState, strategy: 'greedy' },
    { ...validState, plot: -1 }, { ...validState, plot: 3 },
    { ...validState, plot: 1.5 }, { ...validState, plot: 'A' }]) {
    assert.throws(() => encodeState(bad), RangeError);
  }
});

const hostilePayloads = [
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2, extra: 1 },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2, constructor: {} },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted' },
  { v: 2, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: '1', case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'unknown', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 5, quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: -1, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: 99999, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: NaN, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: Infinity, shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: '126', shock: true, strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: 126, shock: 'yes', strategy: 'revenue-weighted', plot: 2 },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'bogus', plot: 2 },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 9 },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: -1 },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 2.5 },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: 'revenue-weighted', plot: 'B' },
  { v: 1, case: 'high-plains', quota: 126, shock: true, strategy: { id: 'revenue-weighted' }, plot: 2 },
  [1, 2, 3],
  'still a string',
  42,
  null,
];

const toHash = obj => `cp=${Buffer.from(JSON.stringify(obj), 'utf8')
  .toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`;

for (const [i, payload] of hostilePayloads.entries()) {
  test(`decodeState rejects hostile payload ${i + 1}`, () =>
    assert.equal(decodeState(toHash(payload)), null));
}

test('decodeState rejects a __proto__ key payload', () => {
  const raw = '{"v":1,"case":"terraces","quota":18,"shock":false,"strategy":"equal-split","plot":1,"__proto__":{}}';
  const hash = `cp=${Buffer.from(raw, 'utf8').toString('base64')
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`;
  assert.equal(decodeState(hash), null);
});

test('decodeState rejects non-canonical base64url trailing bits', () => {
  const canonical = encodeState({ v: 1, case: 'high-plains', quota: 0, shock: false,
    strategy: 'fixed-calendar', plot: 0 });
  assert.equal(canonical.at(-1), '0');
  for (const last of ['1', '2', '3']) {
    assert.equal(decodeState(`${canonical.slice(0, -1)}${last}`), null);
  }
  assert.notEqual(decodeState(canonical), null);
});

for (const bad of [
  'cp=', 'cp=!!!', 'cp=AAAA!', 'cp=A', 'cp=eyJ2IjoxfQ==', '#cp', 'cp',
  'cp=eyJ2IjoxfQ==extra', 'cp=%%%%', 'cp=not-base64-at-all!!',
  'schedule', '#schedule', 'xcp=AAAA', 'cp==AAA', 'cp====', 'cp==',
  '', '#', 'cp= eyJ2IjoxfQ', ' cp=eyJ2IjoxfQ',
  `cp=${Buffer.from('[1,2,3]').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  `cp=${Buffer.from('"text"').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  `cp=${Buffer.from('42').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  `cp=${Buffer.from('null').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  `cp=${Buffer.from('{bad json').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  `cp=${Buffer.from('{"v":2,"case":"terraces","quota":18,"shock":false,"strategy":"equal-split","plot":1}').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  `cp=${Buffer.from('\xff\xfe\x00invalid').toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}`,
  42, null, undefined, {}, [],
]) {
  test(`decodeState rejects ${JSON.stringify(bad)?.slice(0, 40)}`, () =>
    assert.equal(decodeState(bad), null));
}

test('normalizeState accepts only plain objects with the exact six keys', () => {
  const protoFree = Object.create(null);
  Object.assign(protoFree, validState);
  assert.equal(normalizeState(protoFree), null);
  assert.deepEqual(normalizeState({ ...validState }), validState);
  assert.equal(normalizeState({ ...validState, quota: -0 }).quota, 0);
  assert.equal(Object.is(normalizeState({ ...validState, quota: -0 }).quota, -0), false);
  const swapped = { shock: true, plot: 2, strategy: 'revenue-weighted',
    quota: 126, case: 'high-plains', v: 1 };
  assert.deepEqual(normalizeState(swapped), validState);
});

// ---------- strategy correctness on the grid ----------

const quotaLevels = scenario => [0, scenario.quota * 0.5, scenario.quota, scenario.quota * 1.5];

for (const scenario of SCENARIOS) {
  for (const shock of [false, true]) {
    for (const quota of quotaLevels(scenario)) {
      const input = labInput(scenario.id, { quota, shock });
      for (const id of STRATEGIES) {
        test(`strategy ${id} conserves water ${scenario.id} shock=${shock} quota=${quota}`, () => {
          const run = runStrategy(input, id);
          assert.ok(run.verified);
          assert.ok(run.lots <= input.budgetLots);
          assert.ok(run.perDayPulses.every(count => count <= input.dailyLots));
          assert.equal(run.water, run.lots * input.scenario.lot);
          run.plots.forEach((plot, index) => {
            const { taw, start } = input.plots[index];
            let previous = start * taw;
            plot.days.forEach(day => {
              assert.ok(day.dr >= -1e-9 && day.dr <= taw + 1e-9);
              const flux = day.eta + day.dp - day.effectiveRain - day.irrigation;
              close(day.dr - previous, flux, 1e-7);
              previous = day.dr;
            });
          });
        });
      }
      test(`calorie-optimal dominates fixed-calendar ${scenario.id} shock=${shock} quota=${quota}`, () => {
        const { strategies } = compareStrategies(input);
        const opt = strategies.find(run => run.id === 'calorie-optimal');
        const cal = strategies.find(run => run.id === 'fixed-calendar');
        assert.ok(opt.calories >= cal.calories - 1e-9);
        assert.ok(opt.calories >= cal.calories);
      });
      test(`wilting-guarded minimizes critical days ${scenario.id} shock=${shock} quota=${quota}`, () => {
        const { strategies } = compareStrategies(input);
        const guard = strategies.find(run => run.id === 'wilting-guarded');
        for (const run of strategies) {
          assert.ok(run.criticalDays >= guard.criticalDays);
        }
      });
      test(`revenue-weighted maximizes modeled revenue ${scenario.id} shock=${shock} quota=${quota}`, () => {
        const { strategies } = compareStrategies(input);
        const rev = strategies.find(run => run.id === 'revenue-weighted');
        for (const run of strategies) {
          assert.ok(run.value <= rev.value + 1e-9);
        }
      });
      test(`equal split keeps plot lots within one ${scenario.id} shock=${shock} quota=${quota}`, () => {
        const run = runStrategy(input, 'equal-split');
        const counts = run.plots.map(plot => plot.lots);
        assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
        assert.ok(run.verified);
      });
      test(`comparator returns five verified strategies ${scenario.id} shock=${shock} quota=${quota}`, () => {
        const { strategies, allVerified } = compareStrategies(input);
        assert.equal(strategies.length, 5);
        assert.deepEqual(strategies.map(run => run.id), STRATEGIES);
        assert.ok(allVerified);
        for (const run of strategies) {
          assert.ok(Number.isFinite(run.calories));
          assert.ok(Number.isFinite(run.kg));
          assert.ok(Number.isFinite(run.value));
          assert.ok(Number.isFinite(run.maxDepletionPct));
          assert.ok(run.productivity === null || Number.isFinite(run.productivity));
          assert.ok(run.maxDepletionPct >= 0 && run.maxDepletionPct <= 100.0001);
        }
      });
    }
  }
}

// ---------- independent enumeration oracle ----------

const cmpKey = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

// Straightforward per-day pulse counting: an independent feasibility check
// that does not share the implementation's bitmask pruning.
function oracle(input, scoreKey, lotCounts) {
  const cand = input.plots.map((_, i) => {
    const list = [];
    for (let mask = 0; mask < 2 ** input.weather.length; mask++) {
      const sim = simulatePlot(input, i, mask);
      if (sim.lots <= input.budgetLots &&
          (lotCounts === undefined || sim.lots === lotCounts[i])) list.push(sim);
    }
    return list;
  });
  let best = null;
  let bestKey = null;
  for (const a of cand[0]) {
    for (const b of cand[1]) {
      for (const c of cand[2]) {
        const lots = a.lots + b.lots + c.lots;
        if (lots > input.budgetLots) continue;
        let ok = true;
        for (let d = 0; d < input.weather.length; d++) {
          const n = ((a.mask >> d) & 1) + ((b.mask >> d) & 1) + ((c.mask >> d) & 1);
          if (n > input.dailyLots) { ok = false; break; }
        }
        if (!ok) continue;
        const key = scoreKey(a, b, c);
        if (best === null || cmpKey(key, bestKey) < 0) {
          best = [a, b, c];
          bestKey = key;
        }
      }
    }
  }
  return best;
}

const guardedScore = (a, b, c) =>
  [a.criticalDays + b.criticalDays + c.criticalDays,
    -(a.calories + b.calories + c.calories), a.lots + b.lots + c.lots, a.mask, b.mask, c.mask];
const revenueScore = (a, b, c) =>
  [-(a.value + b.value + c.value), -(a.calories + b.calories + c.calories),
    a.lots + b.lots + c.lots, a.mask, b.mask, c.mask];

for (const scenario of SCENARIOS) {
  for (const shock of [false, true]) {
    for (const days of [1, 3, 4]) {
      for (const budgetLots of [0, 2, 5]) {
        for (const dailyLots of [0, 1, 2]) {
          const input = prepare(scenario.id, { shock });
          const tiny = { ...input, weather: input.weather.slice(0, days), budgetLots, dailyLots };
          test(`oracle wilting-guarded ${scenario.id} shock=${shock} days=${days} daily=${dailyLots} budget=${budgetLots}`, () => {
            const expected = oracle(tiny, guardedScore);
            const actual = strategyMasks(tiny, 'wilting-guarded');
            assert.deepEqual(actual, expected.map(plot => plot.mask));
          });
          test(`oracle revenue-weighted ${scenario.id} shock=${shock} days=${days} daily=${dailyLots} budget=${budgetLots}`, () => {
            const expected = oracle(tiny, revenueScore);
            const actual = strategyMasks(tiny, 'revenue-weighted');
            assert.deepEqual(actual, expected.map(plot => plot.mask));
          });
        }
      }
    }
  }
}

// ---------- strategy plumbing ----------

test('strategyMasks rejects an unknown strategy', () => {
  const input = labInput('terraces');
  for (const bad of ['greedy', '', 5, null, 'FIXED-CALENDAR']) {
    assert.throws(() => strategyMasks(input, bad), RangeError);
  }
});

test('calorie-optimal masks equal the canonical optimizer output', () => {
  for (const scenario of SCENARIOS) {
    for (const shock of [false, true]) {
      const input = labInput(scenario.id, { shock });
      const opt = compareStrategies(input).strategies.find(run => run.id === 'calorie-optimal');
      assert.ok(opt.masks.every((mask, i) => mask === opt.plots[i].mask));
    }
  }
});

test('evaluateMasks flags an illegal plan instead of hiding it', () => {
  const input = labInput('high-plains', { quota: 18 });
  const run = evaluateMasks(input, [127, 127, 127], 'fixed-calendar');
  assert.equal(run.pumpOk, false);
  assert.equal(run.budgetOk, false);
  assert.equal(run.verified, false);
  assert.equal(run.balanceOk, true);
});

test('evaluateMasks rejects malformed mask sets', () => {
  const input = labInput('terraces');
  for (const masks of [null, [], [1], [1, 2, 3, 4], 'x']) {
    assert.throws(() => evaluateMasks(input, masks, 'equal-split'), RangeError);
  }
});

test('zero quota produces verified dry plans with null productivity', () => {
  for (const scenario of SCENARIOS) {
    const input = labInput(scenario.id, { quota: 0 });
    for (const id of STRATEGIES) {
      const run = runStrategy(input, id);
      assert.equal(run.water, 0);
      assert.equal(run.lots, 0);
      assert.equal(run.productivity, null);
      assert.ok(run.verified);
    }
  }
});

// ---------- sweep ----------

for (const scenario of SCENARIOS) {
  for (const shock of [false, true]) {
    test(`quota sweep ${scenario.id} shock=${shock} is exact and monotonic`, () => {
      const sweep = quotaSweep(scenario.id, { shock });
      assert.equal(sweep.points.length, SWEEP_PCTS.length);
      let previous = -Infinity;
      for (const [i, point] of sweep.points.entries()) {
        assert.equal(point.pct, SWEEP_PCTS[i]);
        close(point.quota, scenario.quota * point.pct / 100);
        assert.equal(point.budgetLots, Math.floor(point.quota / scenario.lot));
        assert.ok(point.optimalCalories >= previous - 1e-9);
        assert.ok(point.optimalCalories >= point.calendarCalories);
        close(point.gap, point.optimalCalories - point.calendarCalories, 1e-6);
        assert.equal(point.optimalWater % scenario.lot, 0);
        if (i === 0) {
          assert.equal(point.marginalKcalPerM3, null);
        } else {
          const deltaQ = point.quota - sweep.points[i - 1].quota;
          const deltaC = point.optimalCalories - sweep.points[i - 1].optimalCalories;
          if (deltaQ > 0) close(point.marginalKcalPerM3, deltaC / deltaQ, 1e-6);
        }
        previous = point.optimalCalories;
      }
      assert.equal(sweep.monotonic, true);
      assert.ok(sweep.points.every(p => p.optimalCritical >= sweep.minCritical));
      const cliff = sweep.points.find(p => p.optimalCritical === sweep.minCritical);
      assert.equal(sweep.cliffQuota, cliff.quota);
    });
  }
}

test('custom sweep percentages are honored', () => {
  const sweep = quotaSweep('terraces', { pcts: [25, 50, 100] });
  assert.equal(sweep.points.length, 3);
  assert.deepEqual(sweep.points.map(p => p.pct), [25, 50, 100]);
});

// ---------- brief, digest parity, verification ----------

for (const scenario of SCENARIOS) {
  for (const shock of [false, true]) {
    for (const strategy of STRATEGIES.slice(0, 3)) {
      const state = { v: 1, case: scenario.id, quota: scenario.quota,
        shock, strategy, plot: (shock ? 2 : 0) };
      test(`brief digest parity ${scenario.id} shock=${shock} ${strategy}`, () => {
        const brief = buildBrief(state);
        assert.equal(brief.algorithm, 'SHA-256');
        assert.match(brief.digest, /^[a-f0-9]{64}$/u);
        assert.equal(sha256Sync(canonicalJSON(brief.payload)), brief.digest);
        assert.ok(brief.json.includes(`"digest":"${brief.digest}"`));
        assert.ok(brief.csv.includes(`"sha256","${brief.digest}"`));
        assert.ok(brief.markdown.includes(`sha256 ${brief.digest}`));
        assert.ok(brief.json.endsWith('\n'));
        assert.equal(brief.payload.schema, 'croppulse.lab.v1');
        assert.equal(brief.payload.synthetic, true);
        assert.equal(brief.payload.deterministic, true);
        assert.deepEqual(brief.payload.state, state);
        assert.equal(brief.payload.comparator.length, 5);
        assert.ok(brief.payload.allVerified);
        assert.ok(brief.payload.comparator.every(run => run.verified));
        assert.equal(brief.payload.frontier.length, SWEEP_PCTS.length);
        assert.equal(brief.payload.selected.inspectedPlot.depletionPct.length, 7);
        assert.equal(brief.payload.selected.inspectedPlot.rawPct.length, 7);
        const verified = verifyBrief(JSON.parse(brief.json));
        assert.deepEqual(verified, { digestValid: true });
      });
    }
  }
}

test('buildBrief caches one canonical object per state key', () => {
  const a = buildBrief(validState);
  const b = buildBrief({ ...validState });
  const c = buildBrief({ shock: true, plot: 2, strategy: 'revenue-weighted',
    quota: 126, case: 'high-plains', v: 1 });
  assert.equal(a, b);
  assert.equal(a, c);
  const d = buildBrief({ ...validState, shock: false });
  assert.notEqual(a.digest, d.digest);
  const e = buildBrief({ ...validState, plot: 0 });
  assert.notEqual(a.digest, e.digest);
});

test('brief selected masks match the live strategy', () => {
  const state = { v: 1, case: 'terraces', quota: 100, shock: true,
    strategy: 'equal-split', plot: 1 };
  const brief = buildBrief(state);
  const input = labInput(state.case, { quota: state.quota, shock: state.shock });
  assert.deepEqual(brief.payload.selected.masks, strategyMasks(input, 'equal-split'));
  const run = compareStrategies(input).strategies.find(r => r.id === 'equal-split');
  assert.deepEqual(brief.payload.selected.perDayPulses, run.perDayPulses);
});

test('tamper demo breaks the digest without touching the original', () => {
  const brief = buildBrief(validState);
  const before = brief.payload.comparator[0].calories;
  const copy = tamperForDemo(brief);
  assert.equal(verifyBrief(copy).digestValid, false);
  assert.equal(brief.payload.comparator[0].calories, before);
  assert.equal(verifyBrief(JSON.parse(brief.json)).digestValid, true);
});

for (const broken of [
  null, undefined, 5, 'x', [], {}, { algorithm: 'SHA-256' },
  { algorithm: 'SHA-256', digest: 'f'.repeat(64) },
  { algorithm: 'SHA-256', digest: 'f'.repeat(64), payload: {} },
  { algorithm: 'SHA-1', digest: 'f'.repeat(64), payload: {} },
  { algorithm: 'SHA-256', digest: 'F'.repeat(64), payload: {} },
  { algorithm: 'SHA-256', digest: 'f'.repeat(63), payload: {} },
  { algorithm: 'SHA-256', digest: 'g'.repeat(64), payload: {} },
  { algorithm: 'SHA-256', digest: 5, payload: {} },
  { algorithm: 'SHA-256', digest: 'f'.repeat(64), payload: null },
  { algorithm: 'SHA-256', digest: 'f'.repeat(64), payload: { schema: 'other' } },
]) {
  test(`verifyBrief rejects malformed bundle ${JSON.stringify(broken)?.slice(0, 50)}`, () =>
    assert.deepEqual(verifyBrief(broken), { digestValid: false }));
}

test('verifyBrief rejects extra unhashed keys', async () => {
  const brief = buildBrief(validState);
  const bundle = JSON.parse(brief.json);
  bundle.extra = 'not hashed';
  assert.equal(verifyBrief(bundle).digestValid, false);
  bundle.extra = undefined;
  delete bundle.extra;
  bundle.digest = 'f'.repeat(64);
  assert.equal(verifyBrief(bundle).digestValid, false);
});

test('brief CSV is formula-safe and carries provenance', () => {
  const brief = buildBrief(validState);
  const lines = brief.csv.split('\r\n');
  assert.equal(lines[0], '"provenance","croppulse.lab.v1","synthetic","true"');
  assert.equal(lines[1], `"sha256","${brief.digest}"`);
  assert.ok(brief.csv.endsWith('\r\n'));
  assert.doesNotMatch(brief.csv, /(?<!\r)\n/u);
  for (const row of lines) {
    if (!row) continue;
    for (const cell of row.split('","')) {
      const inner = cell.replace(/^"|"$/gu, '');
      if (/^[\t\n\r ]*[=+\-@]/u.test(inner) && !inner.startsWith("'") &&
          !Number.isFinite(Number(inner))) {
        assert.fail(`unsafe CSV cell ${inner.slice(0, 30)}`);
      }
    }
  }
  assert.ok(brief.csv.includes('"quota_frontier"'));
  assert.ok(brief.csv.includes('"comparator"'));
});

test('brief Markdown carries the digest footer and no em dashes', () => {
  const brief = buildBrief(validState);
  assert.ok(brief.markdown.includes(`sha256 ${brief.digest}`));
  assert.ok(brief.markdown.startsWith('# CropPulse'));
  assert.ok(brief.markdown.includes('| Strategy |'));
  assert.ok(brief.markdown.includes('| Quota m3 |'));
  assert.doesNotMatch(brief.markdown, /[\u2013\u2014]/u);
});

test('buildBrief rejects an invalid state', () => {
  for (const bad of [null, 5, [], { v: 1 }, { ...validState, quota: -1 },
    { ...validState, case: 'nope' }, { ...validState, strategy: 'x' }]) {
    assert.throws(() => buildBrief(bad), RangeError);
  }
});

// ---------- self checks ----------

test('every in-page deterministic check passes', () => {
  const { checks, passed, total } = labSelfChecks();
  assert.ok(total >= 14);
  const failed = checks.filter(item => !item.ok).map(item => item.name);
  assert.deepEqual(failed, []);
  assert.equal(passed, total);
});

test('self-check names are unique and non-empty', () => {
  const { checks } = labSelfChecks();
  const names = checks.map(item => item.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.ok(name.length > 5);
});
