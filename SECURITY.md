# Security policy

## Reporting a vulnerability

Use the private GitHub Security Advisory form at [Report a vulnerability](https://github.com/draarivpatel-ui/croppulse/security/advisories/new). Do not open a public issue, pull request or discussion with exploit details.

Never include a live secret, token, cookie, private key, victim hostname or proprietary payload in a report. Use synthetic values and redacted transcripts.

## Supported versions

| Version | Status |
| --- | --- |
| latest `main` | Supported |

Security fixes are applied to the latest state of the default branch.

## Scope

This policy covers the static CropPulse browser application, including irrigation planning state, quota lab results, calendar and audit exports, share links, service worker behavior, offline caching and browser rendering.

In scope:

- A cross-site scripting or HTML injection path through plot data, scenario state, schedule output, share links or report output.
- A share-link decoder or serialization flaw that bypasses validation, corrupts another irrigation plan or executes attacker-controlled code.
- A calendar, audit, CSV or Markdown export flaw that makes generated output execute a formula, script or unexpected calendar action when opened.
- A service worker, cache-control or content-security flaw that serves attacker-controlled application code across an update.
- A worker or offline-boundary flaw that sends simulation data off the device or misrepresents synthetic results as live field telemetry.

Out of scope:

- Browser vulnerabilities, operating system compromise or physical access to the machine.
- Damage caused by modified copies of the static application that do not come from this repository.
- The documented synthetic-data and irrigation-model limitations, unless a report shows a specific validation or output integrity failure.

## Coordinated disclosure

- Acknowledgment: within 3 business days.
- Initial triage: within 14 calendar days.
- Fix or mitigation target: within 90 calendar days for confirmed reports.
- Coordinated public disclosure: up to 90 days by default, adjusted by mutual agreement when exploitation or user risk requires a different date.
