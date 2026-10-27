# Release checklist

State of each gate at commit `bb11761` plus the Phase 14 additions. "Evidence" points at `docs/TEST_RESULTS.md`.

## Gates (from the Phase 14 brief)

| # | Gate | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Fresh checkout and `npm ci` succeed | **pass** | fresh clone, 5 s |
| 2 | typecheck, lint, test, build, test:e2e pass | **pass** | all exit 0; E2E 105 passed, 0 failed |
| 3 | Two distinct complete Redbank victories and a credible loss, reproducible | **pass** | Fire Wall and Witness Bridge traces plus a no-action defeat, replayed by the engine and by real clicks with identical hashes |
| 4 | At least three playable campaign scenarios with different mechanisms | **pass** (3 of the 5 planned) | Redbank (flood, bridge, bells), Harvest (crops, trade, rival), Ashwood (predators, smoke); two winning routes each. Two further chapters are not built |
| 5 | Valid random or seeded expedition, same-seed replay, daily variant, usable debrief | **pass** | `modes.spec.ts`, `expedition-win.spec.ts` (a generated village played to its end by clicks), `expedition.test.ts` |
| 6 | Auto-save and recovery, non-fatal errors | **pass** | `persistence.spec.ts`, `resilience.spec.ts` (render crash, no canvas, full disk, corrupt and foreign saves) |
| 7 | Critical touch interactions at small phone width | **pass in Chromium emulation** | 320 and 390 px specs; no real device |
| 8 | A browser E2E with input -> social shift -> physical effect -> ending | **pass** | `redbank.spec.ts`, `scenarios.spec.ts`, `expedition-win.spec.ts` |
| 9 | Honest accessibility checklist and telemetry/privacy statement | **pass (automated + built-in); manual screen-reader pass owed** | `docs/ACCESSIBILITY.md`; the page makes no network requests and sets no cookies; CSP allows same-origin only |
| 10 | Source, assets, documentation committed with hashes | **pass** | `git log`; `docs/ASSETS.md` |

## Security and hygiene

* Client-only; no secrets, no `VITE_` variables, no network calls (the CSP `connect-src 'self'` would block any). `npm audit`: 0 vulnerabilities. Licences: `docs/THIRD_PARTY_LICENSES*.md`.
* Content-Security-Policy, framing denial, `nosniff`, no referrer, permissions denied, immutable hashed assets, revalidated shell: `vercel.json`, verified against a real browser by `npm run verify:hosting`.
* Share-link parameters, saves, archives and imports are schema-validated; user text is never executed (the future composer treats claim text as data).

## Deployment: **not deployed**

No project was created and no deployment was made by this repository's automation, so **there is no live URL and no live smoke test**. To deploy yourself:

1. `npm ci && npm run build && npm run verify:hosting` locally (expect "hosting configuration verified").
2. On Vercel: *Add New > Project*, import this repository, framework preset **Vite**, install `npm ci`, build `npm run build`, output `dist` (all already in `vercel.json`). No environment variables are needed.
3. Deploy the commit you tested (the one whose hash is in `docs/TEST_RESULTS.md`); then load the URL, play one day, reload to check Continue, and confirm the response headers match `vercel.json` (`curl -I <url>`).
4. Any other static host works if it sends the same headers and falls unknown paths back to `index.html`.

## Blockers and caveats a release owner should read

* No human playtest. Difficulty and fun are measured on bots only (`docs/BALANCE_REPORT.md`).
* Redbank's best plan still wins almost every seed; Harvest allows no late recovery (`docs/KNOWN_ISSUES.md`).
* Two of five planned chapters are missing.
* Real-device testing, a real-Safari run and a screen-reader pass are owed.
