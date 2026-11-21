# CropPulse

CropPulse compares two ways to share a limited irrigation supply among three plots in a seven-day synthetic weather window. It calculates daily atmospheric water demand, updates each root-zone water balance, and searches the full set of schedules allowed by a shared pump. No account, backend, field telemetry, or live weather service is used.

## Run locally

Use Node 22 or later. Nothing needs to be installed.

```sh
npm start
nice -n 15 npm test
npm run test:browser
node scripts/benchmarks.mjs
node scripts/verify.mjs path/to/croppulse-audit.json
```

Open the loopback URL printed by `npm start`. The browser check needs Chrome. To deploy, serve the application files under `/croppulse/` on an HTTPS static host. The worker is relative to the application, does not cache outside its scope, and can serve the model and exports offline after it installs. The developer server adds a frame-ancestor policy in the response header; replicate it on any supporting static host because a meta policy cannot restrict framing.

## Study a plan

Pick a case, set the water quota, and try crop stage edits or a heat-and-rain shock. Select a plot and day to compare end-of-day depletion across the two plans. High depletion means a drier root zone. Then open the field schedule to print the week or download calendar reminders, CSV, or a replayable audit file.

The optimized plan maximizes modeled food calories under the stated constraints. The calendar adheres to a preset sequence under the same ceilings. It can use less than the ceiling, and a calorie-optimal plan is not necessarily the best plan for crop mass, revenue, or near-wilting days. The results include these tradeoffs rather than hiding them.

The audit separates a SHA-256 integrity check from a model replay. The hash is not a signature and does not identify an author. Use the on-page checker or the command above. Calendar events use UTC and contain 15-minute display reminders; their dates belong to the simulation, not a real farm schedule.

See [methods and limits](docs/methods.md) for equations, references, and model assumptions.

## Intended use

All farms, weather sequences, pump settings, and economic weights are synthetic. This is an educational comparison, not a farm prescription, crop forecast, or alternative to soil sensors and local extension agronomists.
