# CropPulse

## What it is

CropPulse is an irrigation workbench: a single static page that compares an
exact optimizer's weekly pump schedule against a fixed calendar on synthetic
demonstration farms. It is an educational exhibit, not a field tool.

## Surface and stack

- **Platform:** web, single static page. No build step, no dependencies, no
  external services or fonts. Everything is same-origin.
- **Runtime:** `index.html` + `styles.css` + ES modules under `src/` plus a
  precaching service worker (`sw.js`). Works at a subpath mount (`/croppulse/`).
- **Local host:** `scripts/serve.mjs` (Node standard library, 127.0.0.1,
  allowlisted paths, strict CSP). `scripts/browser.mjs` drives real headless
  Chrome over CDP for verification. No npm dependencies; Node 22+.
- **Model core (read only):** `src/physics.js` (FAO-56 ET and soil water
  balance), `src/scenarios.js` (three synthetic farms), `src/planner.js`
  (prepare/simulate/baseline/optimize/compare), `src/exports.js` (CSV, ICS,
  canonical JSON audit with digest and replay).

## Hard truths the UI must keep visible

- **No field evidence.** All weather, soils, yields, and prices are synthetic
  demonstration data. No field sensors feed it and no local agronomist reviewed
  it. Every surface says so.
- **Fixed windows.** Pumping happens only in fixed-volume lots (one pulse per
  plot per day, bounded daily pump minutes and a weekly m3 quota). The
  optimizer picks pulse days, never flow rates.
- **Calorie objective.** The optimizer maximizes modeled kilocalories subject
  to the same limits as the fixed calendar. It is not guaranteed to beat the
  calendar on water, kg yield, or revenue on every setting; negative
  differences render as-is.
- **Simulated calculations.** Numbers are model output for teaching. The
  schedule, exports, print sheet, and audit are framed as simulation, not
  agronomic recommendation.
- **Audience.** Students and reviewers at a hackathon exhibit; Operate-mode
  workbench in English and Spanish.
