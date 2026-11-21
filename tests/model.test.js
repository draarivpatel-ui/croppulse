import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saturation, pressure, slope, extraterrestrial, referenceET, rootZone,
  waterDay, relativeYield } from '../src/physics.js';
import { SCENARIOS, STAGES } from '../src/scenarios.js';
import { calendarBaseline, compare, optimize, prepare, simulatePlot } from '../src/planner.js';

const close = (a, b, epsilon = 1e-10) => assert.ok(
  Math.abs(a - b) <= epsilon, `actual ${a}, expected ${b} within ${epsilon}`);
const data = { latitude: 50.8, elevation: 100, doy: 187, tMin: 12.3, tMax: 21.5,
  rhMin: 63, rhMax: 84, wind: 10 / 3.6, windHeight: 10, sunshine: 9.25 };

// FAO-56 chapter 4, Example 18. Allow half a displayed decimal unit.
for (const [name, published, tolerance] of [
  ['temp', 16.9, 0.05], ['es', 1.997, 0.0005], ['ea', 1.409, 0.0005],
  ['delta', 0.122, 0.0005], ['gamma', 0.0666, 0.00005], ['u2', 2.078, 0.0005],
  ['ra', 41.09, 0.005], ['daylight', 16.1, 0.05], ['rs', 22.07, 0.005],
  ['rso', 30.90, 0.005], ['rns', 17.00, 0.005], ['rnl', 3.71, 0.005],
  ['rn', 13.28, 0.005], ['et0', 3.88, 0.005],
]) {
  test(`FAO-56 Uccle Example 18 ${name}`, () => close(referenceET(data)[name], published, tolerance));
}

test('point identities and limiting cases', () => {
  assert.equal(saturation(0), 0.6108);
  assert.equal(pressure(0), 101.3);
  close(pressure(100), 100.1, 0.05);
  close(slope(20), (saturation(20.0001) - saturation(19.9999)) / 0.0002, 3e-5);
  assert.deepEqual(extraterrestrial(90, 355), { ra: 0, daylight: 0 });
  assert.deepEqual(extraterrestrial(-90, 172), { ra: 0, daylight: 0 });
  assert.equal(extraterrestrial(90, 172).daylight, 24);
  assert.equal(extraterrestrial(0, 45).daylight, 12);
  const zone = rootZone({ fc: 0.35, wp: 0.15, depth: 0.5, p: 0.5 });
  close(zone.taw, 100);
  close(zone.raw, 50);
});

const invalidWeather = [
  { latitude: 90.001 }, { latitude: '50.8' }, { latitude: NaN }, { elevation: Infinity },
  { elevation: -501 }, { doy: 0 }, { doy: 367 }, { doy: 180.5 }, { tMin: 22 },
  { tMin: -100 }, { tMax: 71 }, { rhMin: -1 }, { rhMax: 50 }, { rhMax: 101 },
  { wind: -0.01 }, { windHeight: 0 }, { sunshine: 24 }, { solar: -0.01 },
  { solar: 42 }, { actualVapor: 3 }, { actualVapor: -0.01 },
  { solar: undefined, sunshine: undefined },
];
invalidWeather.forEach((patch, i) => test(`weather validation ${i + 1} ${Object.keys(patch)}`, () =>
  assert.throws(() => referenceET({ ...data, ...patch }), RangeError)));

for (const latitude of [-89, -64, -28, 0, 28, 64, 89]) {
  for (const doy of [1, 79, 172, 266, 355, 366]) {
    test(`radiation and energy balance ${latitude} degrees day ${doy}`, () => {
      const a = extraterrestrial(latitude, doy);
      const b = referenceET({ latitude, doy, elevation: 1200, tMin: 2, tMax: 12,
        rhMin: 50, rhMax: 90, wind: 2, solar: a.ra * 0.55 });
      assert.ok(Object.values(b).every(Number.isFinite));
      assert.ok(a.ra >= 0 && a.daylight >= 0 && a.daylight <= 24);
      close(b.rso, 0.774 * a.ra);
      close(b.rns, 0.77 * b.rs);
      close(b.rn + b.rnl, b.rns);
      assert.ok(b.et0 >= 0);
      assert.equal(b.u2, 2);
      if (!a.daylight) assert.equal(b.rn, 0);
    });
  }
}

test('exact limiting daily equation with no radiation and no wind', () => {
  const b = referenceET({ ...data, latitude: 90, doy: 355, sunshine: 0, wind: 0 });
  assert.equal(b.et0, 0);
  assert.equal(b.rn, 0);
});

test('measured solar and direct vapor pathways reproduce the sunshine and RH pathway', () => {
  const example = referenceET(data);
  const direct = referenceET({ ...data, solar: example.rs, actualVapor: example.ea });
  assert.deepEqual(direct, example);
});

test('very low shortwave ratio keeps the published Equation 39 expression', () => {
  const b = referenceET({ ...data, solar: 0 });
  const expected = 4.903e-9 * ((21.5 + 273.16) ** 4 + (12.3 + 273.16) ** 4) / 2 *
    (0.34 - 0.14 * Math.sqrt(b.ea)) * -0.35;
  close(b.rnl, expected);
});

const soil = { taw: 100, raw: 40, dr: 60, etc: 10, rain: 0, irrigation: 0, infiltration: 20 };
test('hand-worked stress, uptake and end depletion', () => {
  const row = waterDay(soil);
  close(row.ks, 2 / 3);
  close(row.eta, 20 / 3);
  close(row.dr, 200 / 3);
  assert.equal(row.dp, 0);
});
test('rain and irrigation wet the root zone before uptake; infiltration and overflow are distinct', () => {
  const row = waterDay({ ...soil, dr: 10, rain: 35, irrigation: 5 });
  assert.deepEqual(row, { dr: 10, ks: 1, etc: 10, eta: 10, rain: 35, effectiveRain: 20,
    runoff: 15, irrigation: 5, dp: 15, critical: false });
});
test('withdrawal caps at wilting point without creating water', () => {
  const row = waterDay({ ...soil, taw: 10, raw: 9, dr: 9.9, etc: 90 });
  close(row.eta, 0.1);
  assert.equal(row.dr, 10);
  assert.equal(row.critical, true);
  assert.equal(waterDay({ ...soil, dr: 100 }).eta, 0);
});

for (const [key, value] of [
  ['taw', 0], ['raw', 101], ['dr', -1], ['dr', 101], ['etc', Infinity],
  ['rain', -2], ['irrigation', '1'], ['infiltration', NaN],
]) test(`reject invalid soil balance input ${key} ${value}`, () =>
  assert.throws(() => waterDay({ ...soil, [key]: value }), RangeError));

test('field capacity, permanent wilt point and root-depth validation', () => {
  for (const patch of [{ fc: 0.1 }, { wp: 0.3 }, { depth: 0 }, { p: 1 }]) {
    assert.throws(() => rootZone({ fc: 0.25, wp: 0.1, depth: 0.5, p: 0.5, ...patch }), RangeError);
  }
});

test('FAO-33 hand-calculated yield response and saturation limits', () => {
  close(relativeYield(75, 100, 1.2), 0.7);
  assert.equal(relativeYield(0, 100, 1.2), 0);
  assert.equal(relativeYield(100, 100, 1.2), 1);
  assert.equal(relativeYield(0, 0, 1.2), 1);
  assert.equal(relativeYield(0, 100, 0), 1);
  assert.throws(() => relativeYield(11, 10, 1), RangeError);
  assert.throws(() => relativeYield(5, 10, -1), RangeError);
});

function rng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

for (let seed = 1; seed <= 128; seed++) {
  test(`seed ${seed} conserves water across seven wet-to-dry days`, () => {
    const rand = rng(seed * 99991);
    const taw = 8 + 260 * rand();
    const raw = taw * rand();
    const start = taw * rand();
    const infiltration = 40 * rand();
    let dr = start;
    let balance = 0;
    for (let i = 0; i < 7; i++) {
      const etc = rand() * 18;
      const rain = Math.max(0, 65 * rand() - 18);
      const irrigation = Math.max(0, 35 * rand() - 11);
      const row = waterDay({ taw, raw, dr, etc, rain, infiltration, irrigation });
      const flux = row.eta + row.dp - row.effectiveRain - irrigation;
      close(row.dr - dr, flux);
      close(row.effectiveRain + row.runoff, rain);
      assert.ok(row.dr >= 0 && row.dr <= taw);
      assert.ok(row.ks >= 0 && row.ks <= 1);
      assert.ok(row.eta >= 0 && row.eta <= etc);
      assert.ok(row.dp === 0 || row.dp <= irrigation + row.effectiveRain);
      const wetter = waterDay({ taw, raw, dr, etc, rain, infiltration, irrigation: irrigation + 1 });
      assert.ok(wetter.eta >= row.eta - 1e-10);
      assert.ok(wetter.dr <= row.dr + 1e-10);
      balance += flux;
      dr = row.dr;
    }
    close(dr - start, balance);
  });
}

// Independent exhaustive oracle branches by day and places one operation at a
// time; the implementation combines whole-plot masks instead.
function exhaustive(input) {
  const masks = [0, 0, 0];
  const maxWater = input.budgetLots * input.scenario.lot;
  const choices = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];
  let feasible = 0;
  let bestScore = -Infinity;
  let bestVolume = Infinity;
  function walk(day, used) {
    if (day === input.weather.length) {
      feasible++;
      const score = masks.reduce((sum, mask, plot) => sum + simulatePlot(input, plot, mask).calories, 0);
      if (score > bestScore || (score === bestScore && used < bestVolume)) {
        bestScore = score;
        bestVolume = used;
      }
      return;
    }
    for (const picked of choices) {
      const added = picked.length * input.scenario.lot;
      if (used + added > maxWater || picked.length * input.lotMinutes >
          input.dailyLots * input.lotMinutes) continue;
      for (const plot of picked) masks[plot] += 2 ** day;
      walk(day + 1, used + added);
      for (const plot of picked) masks[plot] -= 2 ** day;
    }
  }
  walk(0, 0);
  return { bestScore, bestVolume, feasible };
}

for (const scenario of SCENARIOS) {
  for (const shock of [false, true]) {
    for (const days of [1, 3, 4]) {
      for (const dailyLots of [0, 1, 2]) {
        for (const budgetLots of [0, 2, 5]) {
          test(`exact independent enumeration ${scenario.id} shock=${shock} days=${days} daily=${dailyLots} budget=${budgetLots}`, () => {
            const input = prepare(scenario.id, { shock, stages: shock ? STAGES : undefined });
            const tiny = { ...input, weather: input.weather.slice(0, days), dailyLots, budgetLots };
            const expected = exhaustive(tiny);
            const actual = optimize(tiny);
            assert.equal(actual.calories, expected.bestScore);
            assert.equal(actual.water, expected.bestVolume);
            assert.equal(actual.feasible, expected.feasible);
            assert.ok(actual.calories >= calendarBaseline(tiny).calories);
          });
        }
      }
    }

    const grid = [0, 1, 2, 4, 6, 8, 11, 14];
    for (const [index, lots] of grid.entries()) {
      test(`full week feasibility and monotonic calories ${scenario.id} shock=${shock} lots=${lots}`, () => {
        const quota = lots * scenario.lot + 0.75;
        const input = prepare(scenario.id, { quota, shock });
        const result = compare(input);
        const previous = index ? optimize(prepare(scenario.id, { quota: grid[index - 1] * scenario.lot, shock })) : null;
        assert.ok(result.optimized.calories >= (previous?.calories ?? 0));
        assert.ok(result.optimized.calories >= result.baseline.calories);
        for (const plan of [result.optimized, result.baseline]) {
          assert.ok(plan.water <= quota);
          assert.equal(plan.water, plan.schedule.flatMap(d => d.events).reduce((n, e) => n + e.volume, 0));
          for (const key of ['calorieIndex', 'valueIndex', 'yieldIndex']) assert.ok(plan[key] >= 0 && plan[key] <= 1);
          for (const day of plan.schedule) {
            assert.ok(day.events.reduce((sum, e) => sum + e.minutes, 0) <= scenario.pumpMinutes);
            assert.equal(new Set(day.events.map(e => e.plot)).size, day.events.length);
            for (const [i, event] of day.events.entries()) {
              close((Date.parse(event.end) - Date.parse(event.start)) / 60000, event.minutes);
              close(event.volume, scenario.flow * event.minutes / 60);
              if (i) assert.ok(day.events[i - 1].end <= event.start);
            }
          }
        }
      });
    }
  }
}

test('wet terraces leave capacity unused and reduce pump use against the calendar', () => {
  const result = compare(prepare('terraces'));
  assert.equal(result.baseline.water, 144);
  assert.equal(result.optimized.water, 108);
  assert.equal(result.waterSaved, 36);
  assert.equal(result.waterSavedPct, 25);
  assert.equal(result.optimized.calorieIndex, result.optimized.calories /
    prepare('terraces').plots.reduce((total, p) => total + p.maximumCalories, 0));
});

test('zero quota produces a dry plan and no relative water-saving percentage', () => {
  const result = compare(prepare('terraces', { quota: 0 }));
  assert.equal(result.optimized.feasible, 1);
  assert.equal(result.waterSavedPct, null);
  assert.equal(result.calorieGainPoints, 0);
  assert.equal(result.criticalDaysAvoided, 0);
});

test('calendar deliberately follows fixed dates, sorting simultaneous jobs by plot', () => {
  const input = prepare('cooperative', { quota: 37 });
  const plan = calendarBaseline(input);
  assert.deepEqual(plan.schedule[0].events.map(e => e.plot), ['A', 'B']);
  assert.equal(plan.schedule[0].events[0].start, '2027-04-19T13:00:00.000Z');
  assert.equal(plan.schedule[0].events[1].start, '2027-04-19T13:36:00.000Z');
  assert.equal(plan.schedule.slice(1).flatMap(d => d.events).length, 0);
});

test('shock is isolated to four declared days and leaves the original weather fixture intact', () => {
  const dry = prepare('terraces', { shock: true });
  const normal = prepare('terraces');
  for (const i of [0, 1, 6]) assert.deepEqual(dry.weather[i], normal.weather[i]);
  for (const i of [2, 3, 4, 5]) {
    assert.ok(dry.weather[i].et0 > normal.weather[i].et0);
    assert.equal(dry.weather[i].rain, normal.weather[i].rain * 0.15);
  }
  assert.deepEqual(normal.weather, prepare('terraces').weather);
});

test('stage edit changes crop demand and sensitivity but not rooting geometry', () => {
  const normal = prepare('high-plains');
  const edit = prepare('high-plains', { stages: ['establish', 'fill', 'flower'] });
  assert.notEqual(normal.plots[0].kc, edit.plots[0].kc);
  assert.notEqual(normal.plots[0].ky, edit.plots[0].ky);
  assert.equal(normal.plots[0].taw, edit.plots[0].taw);
  assert.deepEqual(normal.weather, edit.weather);
});

test('invalid options and masks cannot create partial or nonfinite plans', () => {
  for (const opts of [{ quota: NaN }, { quota: -1 }, { quota: 379 }, { quota: '20' },
    { shock: 0 }, { stages: [] }, { stages: Array(3) }, { stages: ['flower', 'fill', 'x'] },
    null, 'x', 5, [], true]) {
    assert.throws(() => prepare('high-plains', opts), RangeError);
  }
  assert.throws(() => prepare('unknown'), RangeError);
  const input = prepare('terraces');
  for (const mask of [-1, 2 ** input.weather.length, NaN, 2.5]) {
    assert.throws(() => simulatePlot(input, 0, mask), RangeError);
  }
});

test('a zero daily pump window yields a dry plan, and caps apply per day', () => {
  const input = prepare('high-plains', { quota: 126 });
  const dry = optimize({ ...input, dailyLots: 0 });
  assert.equal(dry.lots, 0);
  assert.equal(dry.water, 0);
  assert.equal(dry.feasible, 1);
  assert.ok(dry.schedule.every(day => day.events.length === 0));
  for (const dailyLots of [1, 2, 3]) {
    const plan = optimize({ ...input, dailyLots });
    assert.ok(plan.schedule.every(day => day.events.length <= dailyLots));
  }
});

test('optimize rejects malformed planner inputs with RangeError', () => {
  const input = prepare('terraces');
  for (const patch of [
    { plots: input.plots.slice(0, 2) },
    { plots: [...input.plots, input.plots[0]] },
    { weather: [] },
    { weather: Array(31).fill(input.weather[0]) },
    { budgetLots: -1 }, { budgetLots: 1.5 }, { budgetLots: NaN }, { budgetLots: '4' },
    { dailyLots: -1 }, { dailyLots: 0.5 }, { dailyLots: NaN }, { dailyLots: '2' },
  ]) {
    assert.throws(() => optimize({ ...input, ...patch }), RangeError);
  }
});
