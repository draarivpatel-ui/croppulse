import { referenceET } from '../src/physics.js';
import { compare, prepare } from '../src/planner.js';
import { SCENARIOS } from '../src/scenarios.js';

const example = referenceET({ latitude: 50.8, elevation: 100, doy: 187, tMin: 12.3, tMax: 21.5,
  rhMin: 63, rhMax: 84, wind: 10 / 3.6, windHeight: 10, sunshine: 9.25 });
const summarize = ({ water, kg, calorieIndex, valueIndex, yieldIndex, criticalDays }) =>
  ({ water, kg, calorieIndex, valueIndex, yieldIndex, criticalDays });
const runs = [...SCENARIOS.map(({ id, quota }) => ({ id, quota, shock: false })),
  { id: 'high-plains', quota: 36, shock: true },
  { id: 'high-plains', quota: 72, shock: true }];
const scenarios = runs.map(({ id, quota, shock }) => {
  const result = compare(prepare(id, { quota, shock }));
  return { id, quota, shock, baseline: summarize(result.baseline), optimized: summarize(result.optimized),
    waterSaved: result.waterSaved, waterSavedPct: result.waterSavedPct,
    yieldLossAvoidedPoints: result.yieldLossAvoidedPoints, calorieGainPoints: result.calorieGainPoints,
    criticalDaysAvoided: result.criticalDaysAvoided, feasibleSchedules: result.optimized.feasible };
});
console.log(JSON.stringify({ synthetic: true, uccleET0: example.et0, scenarios }, null, 2));
