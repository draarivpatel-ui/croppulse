import { bounded, referenceET, relativeYield, rootZone, waterDay } from './physics.js';
import { SCENARIOS, STAGES } from './scenarios.js';

const dayMs = 86400000;
const popcount = n => {
  let count = 0;
  while (n) { n &= n - 1; count++; }
  return count;
};

export function prepare(scenarioId, options = {}) {
  const scenario = SCENARIOS.find(item => item.id === scenarioId);
  if (!scenario) throw new RangeError('unknown scenario');
  const { quota = scenario.quota, shock = false, stages = scenario.plots.map(p => p.stage) } = options;
  bounded(quota, 0, scenario.lot * scenario.weather.length * scenario.plots.length, 'water quota');
  if (typeof shock !== 'boolean' || !Array.isArray(stages) || stages.length !== scenario.plots.length ||
      Array.from(stages).some(stage => !STAGES.includes(stage))) {
    throw new RangeError('invalid drought or stage setting');
  }
  const weather = scenario.weather.map(([low, high, dry, humid, wind, solar, rain], index) => {
    const stamp = new Date(Date.parse(scenario.start) + index * dayMs);
    const doy = 1 + (stamp.valueOf() - Date.UTC(stamp.getUTCFullYear(), 0, 1)) / dayMs;
    const hotter = shock && index >= 2 && index <= 5;
    const tMin = low + (hotter ? 2 : 0);
    const tMax = high + (hotter ? 3 : 0);
    const rhMin = dry - (hotter ? 8 : 0);
    const rhMax = humid - (hotter ? 8 : 0);
    const et = referenceET({ ...scenario, doy, tMin, tMax, rhMin, rhMax, wind, solar });
    return { ...et, date: stamp.toISOString().slice(0, 10), tMin, tMax, rhMin, rhMax,
      rain: hotter ? rain * 0.15 : rain };
  });
  const plots = scenario.plots.map((plot, index) => {
    const stage = stages[index];
    const i = STAGES.indexOf(stage);
    const { p, kc, ky, kgHa, kcalKg, valueKg } = plot.crop;
    const { taw } = rootZone({ ...plot, p });
    const maximumKg = kgHa * plot.area / 10000;
    return { ...plot, stage, taw, depletionFraction: p, kc: kc[i], ky: ky[i], maximumKg,
      maximumCalories: maximumKg * kcalKg, maximumValue: maximumKg * valueKg,
      netDepth: scenario.lot * 1000 / plot.area * plot.efficiency };
  });
  const lotMinutes = 60 * scenario.lot / scenario.flow;
  const dailyLots = Math.min(plots.length, Math.floor(scenario.pumpMinutes / lotMinutes));
  return { scenario, quota, shock, stages: [...stages], weather, plots, lotMinutes, dailyLots,
    budgetLots: Math.min(weather.length * dailyLots, Math.floor(quota / scenario.lot)) };
}

export function simulatePlot(input, index, mask) {
  const plot = input.plots[index];
  if (!plot || !Number.isInteger(mask) || mask < 0 || mask >= 2 ** input.weather.length) {
    throw new RangeError('invalid plot or irrigation mask');
  }
  let dr = plot.start * plot.taw;
  let etcSum = 0;
  let etaSum = 0;
  let criticalDays = 0;
  const days = input.weather.map(({ rain, et0, date }, day) => {
    const etc = et0 * plot.kc;
    const p = Math.min(0.8, Math.max(0.1, plot.depletionFraction + 0.04 * (5 - etc)));
    const raw = p * plot.taw;
    const pulse = Boolean(mask & (1 << day));
    const row = waterDay({ ...plot, etc, dr, raw, rain, irrigation: pulse ? plot.netDepth : 0 });
    dr = row.dr;
    etcSum += row.etc;
    etaSum += row.eta;
    criticalDays += Number(row.critical);
    return { ...row, raw, date, pulse, volume: pulse ? input.scenario.lot : 0 };
  });
  const yieldRatio = relativeYield(etaSum, etcSum, plot.ky);
  return { mask, lots: popcount(mask), days, etcSum, etaSum, criticalDays, yieldRatio,
    kg: yieldRatio * plot.maximumKg, calories: yieldRatio * plot.maximumCalories,
    value: yieldRatio * plot.maximumValue };
}

function summarize(input, plots) {
  const sum = key => plots.reduce((total, plot) => total + plot[key], 0);
  const potential = key => input.plots.reduce((total, plot) => total + plot[key], 0);
  const lots = sum('lots');
  const calories = sum('calories');
  const value = sum('value');
  const kg = sum('kg');
  const schedule = input.weather.map(({ date }, day) => {
    let used = 0;
    return { date, events: plots.flatMap((plot, i) => {
      const { pulse, volume, irrigation } = plot.days[day];
      if (!pulse) return [];
      const start = new Date(Date.parse(`${date}T00:00:00Z`) +
        (input.scenario.startHour * 60 + used * input.lotMinutes) * 60000);
      used++;
      const end = new Date(start.valueOf() + input.lotMinutes * 60000);
      return [{ plot: input.plots[i].id, volume, irrigation, start: start.toISOString(),
        end: end.toISOString(), minutes: input.lotMinutes }];
    }) };
  });
  return { plots, lots, water: lots * input.scenario.lot, calories, value, kg, schedule,
    calorieIndex: calories / potential('maximumCalories'),
    valueIndex: value / potential('maximumValue'), yieldIndex: kg / potential('maximumKg'),
    criticalDays: sum('criticalDays') };
}

export function calendarBaseline(input) {
  const masks = input.plots.map(() => 0);
  let used = 0;
  for (let day = 0; day < input.weather.length; day++) {
    let daily = 0;
    input.plots.forEach((plot, index) => {
      if (used >= input.budgetLots || daily >= input.dailyLots || !plot.calendar.includes(day)) return;
      masks[index] |= 1 << day;
      used++;
      daily++;
    });
  }
  return summarize(input, masks.map((mask, i) => simulatePlot(input, i, mask)));
}

// Exact for three plots, at most one fixed-volume pulse per plot per day.
// After precomputing per-plot trajectories the only cross-plot coupling is feasibility.
export function optimize(input) {
  const variants = input.plots.map((_, index) =>
    Array.from({ length: 2 ** input.weather.length }, (_, mask) => simulatePlot(input, index, mask))
      .filter(plot => plot.lots <= input.budgetLots));
  const [aOptions, bOptions, cOptions] = variants;
  let bestScore = -1;
  let bestLots = Infinity;
  let best;
  let feasible = 0;
  for (const a of aOptions) {
    for (const b of bOptions) {
      const shared = a.mask & b.mask;
      const subtotal = a.lots + b.lots;
      if (subtotal > input.budgetLots || (input.dailyLots === 1 && shared)) continue;
      for (const c of cOptions) {
        const lots = subtotal + c.lots;
        if (lots > input.budgetLots ||
            (input.dailyLots === 1 && ((a.mask | b.mask) & c.mask)) ||
            (input.dailyLots === 2 && (shared & c.mask))) continue;
        feasible++;
        const score = a.calories + b.calories + c.calories;
        if (score > bestScore || (score === bestScore && lots < bestLots)) {
          best = [a, b, c];
          bestScore = score;
          bestLots = lots;
        }
      }
    }
  }
  return { ...summarize(input, best), feasible };
}

export function compare(input) {
  const baseline = calendarBaseline(input);
  const optimized = optimize(input);
  const waterSaved = baseline.water - optimized.water;
  return { baseline, optimized, waterSaved,
    waterSavedPct: baseline.water ? 100 * waterSaved / baseline.water : null,
    yieldLossAvoidedPoints: 100 * (optimized.yieldIndex - baseline.yieldIndex),
    calorieGainPoints: 100 * (optimized.calorieIndex - baseline.calorieIndex),
    criticalDaysAvoided: baseline.criticalDays - optimized.criticalDays };
}
