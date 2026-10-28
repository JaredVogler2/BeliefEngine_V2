# Continue here

Read this first after any context reset, then [`../prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md) and
[`PROGRESS.md`](PROGRESS.md).

## Phase and status

- **01 V1 audit, 02 migration and baseline: VERIFIED.**
- **03 Provider, auth and budgets: VERIFIED with mocks, a real Redis and an offline `vercel build`. LIVE: UNVERIFIED** (no
  credential exists here; `npm run ai:smoke` refuses and exits 2). **NOT DEPLOYED** (no Vercel project). Details:
  [`AI_SETUP.md`](AI_SETUP.md), [`AI_COSTS.md`](AI_COSTS.md).
- **04 Generative belief language: VERIFIED** (engine gate). Reference: [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md).
- **05 Interpreter and compiler: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Generalisation (second held-out corpus,
  scored untuned): 51/80 labels, 13/30 supported sentences read faithfully; V1's composer on the same sentences: 34/80 and 3/30.
- **06 Simulation primitives: VERIFIED (gate)**; hens, stones and the raised bank are drawn in 3D and on the classic map (phase 09).
  Stated limits: turned-aside floodwater is not conserved elsewhere; faster growth has no water demand.
- **07 Agent cognition and memory: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Reference: [`MINDS.md`](MINDS.md).
- **08 Multi-agent social dynamics: VERIFIED offline and with mocks; LIVE UNVERIFIED** (the gate's "one real provider run makes
  faction behaviour observably different" needs a credential). Reference: [`MINDS.md`](MINDS.md) §6.
- **09 Belief-to-reality bridge: VERIFIED offline and with mocks; LIVE UNVERIFIED.** Reference: [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md).
- **V1's 3D work (JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3) is merged** into V2 (`08877e7`).
- **10 3D visual effects: IN PROGRESS.** The effect registry and three physical laws drawn as the engine computed them are
  **VERIFIED** (unit tests over the recorded chains; both 3D browser suites, 46 passed). The gate's "looks like premium real-time
  gameplay" is **NOT MET** by my own reading (daylight diorama; the art stages 1-9 of [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md)
  remain); GPU and phone frame times **UNVERIFIED**. Reference: [`3D_EFFECTS.md`](3D_EFFECTS.md).
- **11 Generative gameplay and balance: VERIFIED offline (gate met by measurement); LIVE UNVERIFIED** (the gate's "the model adds
  strategic variety" needs a provider). Written-belief rules 2 are recorded per run (older runs keep rules 1 and replay exactly).
  Reference: [`GAMEPLAY_V2.md`](GAMEPLAY_V2.md); tournament reports in [`data/tournament-v2/`](data/tournament-v2/).
- **12 Desktop and iPhone UX: NOT STARTED. It is the next task (below).**

## Last good commit / branch

Branch `claude/gracious-heisenberg-x6dvn1` of `JaredVogler2/BeliefEngine_V2`. JaredVogler2/BeliefEngine_V2#2 was merged into `main`
at phase 03 (`d9312bc`); everything since is in the open follow-up JaredVogler2/BeliefEngine_V2#3 (`main` merged into the branch
without rewriting history, `2308bda`; it changed no files). Phase 03: `0344851`; phases 04/06 (engine): `e33209b`; phase 05: `e093c4f` … `70575ad`; phase 07:
`802dbe2` … `d842cc6`; phase 08: `e48a7ca`; V1 merge: `08877e7`, `1b7086b`; phase 09: `07e06f7` (engine) and the commit after it
(browser chains, drawing, provenance UI, docs); phase 10: `48693d1` (effect registry, lifts) and the commit after it (hen model,
matrix, docs, `39ab15b`); phase 11: the commit after `39ab15b` (rules 2, modes, tournament, docs).

## Working files changed in phase 11

New: `src/engine/reality/{demonstrate,twin,harm}.ts`, `src/engine/ai/bots/reality.ts`, `scripts/tournament-v2.ts`,
`tests/unit/gameplay-v2.test.ts`, `tests/e2e/v2-modes.spec.ts`, `tests/fixtures/v2-bridge-traces-rules1.json` (the phase 09 chains
as recorded under rules 1), `docs/GAMEPLAY_V2.md`, `docs/data/tournament-v2/`, `docs/screenshots/v2-phase11/`. Changed:
`reality/{balance,build,read,state}.ts` (rules 2, the authored floor, every-hamlet beliefs, demonstrations), `core/{actions,create,
memory,resolve,types}.ts` (`stagingOmen`, `realityRules`/`living` options, `law_harmed` memories, the harm step), `mind/{claims,
decide,types}.ts` (leaders against harm, six thinkers in a Living Village), `progress/{progress,types,options}.ts` (records per mode,
invented laws in the atlas), `ai/bots/generic.ts` (tactics exported; staging omens), `ui/play/{Hand,Panels}.tsx`, `ui/screens.tsx`,
`tests/fixtures/v2-bridge-traces.json` (re-recorded under rules 2), `tests/unit/{belief-bridge,reality-properties}.test.ts`, docs.

## Commands run and exact results

In [`PROGRESS.md`](PROGRESS.md) (phase 11 entry): typecheck and lint pass; `npm test` 50 files, 607 passed; the V2 tournament at
30 seeds under both rule sets (the table in the entry); `v2-modes.spec.ts` 4 passed; the V2 browser specs and the re-recorded
`v2-bridge.spec.ts` green; size: entry 289 KB gzip of 300; V1 golden hashes unchanged.

## Mock vs LIVE model tests

Every model-facing test used a scripted provider or the offline policy standing in for a model: **TESTED MOCK ONLY**.
**LIVE: UNVERIFIED.** Executing ASTs and running villager minds needs no model.

## Screenshots and browser/device

[`screenshots/v2-phase11/`](screenshots/v2-phase11/): the mode screen, a Living Village conversation, a written belief offered for
staging at the bell tower (desktop and phone, production build). [`screenshots/v2-phase10/`](screenshots/v2-phase10/): the 3D effect
matrix. [`screenshots/v2-phase09/`](screenshots/v2-phase09/), from the production build: the composer's full preview (desktop, and the
compound rain belief on desktop and phone), the law ledger's provenance, the debrief's provenance, the classic map with the hens a law
saved and the raised bank, and the same states in the 3D world (desktop-3d, phone-3d; software WebGL). Earlier phases:
[`v2-phase08/`](screenshots/v2-phase08/), [`v2-phase07/`](screenshots/v2-phase07/).

## Known blockers and risks

1. **No credential, no deployment.** Every LIVE item stays UNVERIFIED until the owner privately sets the variables in
   [`AI_SETUP.md`](AI_SETUP.md) and runs `npm run ai:smoke`; deployment needs the owner's authorisation (no Vercel project exists).
   Phase 08's gate asks for one real provider run making faction behaviour observably different from the policy; it is marked
   LIVE UNVERIFIED.
2. **V2 balance** (phase 11): written beliefs now decide chapters (Redbank 27/30, Harvest 28/30, Ashwood 21/30 for the best written
   plan); the strongest written law in each chapter does what one of the chapter's own stories does (priced at least as high);
   Harvest's growth belief leaves about 3.5 idle days once it holds (dead time). Generated villages were not in the tournament.
   Classic is unchanged.
3. **Entry bundle**: 285 of 300 KB gzip. New V2 engine code ships in the entry (it must be present wherever a day resolves). If
   headroom runs out, move the V2-only engine to a chunk installed before any V2 run starts (a hook in `resolve.ts`), never after.
4. **V1's later 3D work is merged**; any further V1 change would merge the same way (procedure at the end of this file). CI now
   has a separate 3D job (software WebGL, about 30-45 minutes).
5. **3D tests are slow on a software rasteriser** (≈3 fps): keep new 3D browser tests short; long traces behind `BE_SLOW_3D=1`.
6. V1 defects D7, D8, D9 ([`V1_AUDIT.md`](V1_AUDIT.md) §12) are still open.
7. The offline reader understands about half of unfamiliar phrasings; the model contracts are where broad comprehension and
   richer villager voices are meant to come from, and they are unmeasured until a provider is configured.

## Next exact code changes (phase 12: complex generative play made intuitive on desktop and iPhone)

[`../prompts/12_DESKTOP_IPHONE_UX.md`](../prompts/12_DESKTOP_IPHONE_UX.md). Start by walking the generative flow in the browser at
1366×768 and on 320×568, 375×667, 390×844, 430×932 (Playwright WebKit as the iPhone stand-in; real iPhone Safari stays UNVERIFIED).

1. **Main menu**: Classic (offline), Generative Reality (with the model requirement, consent and cost said plainly; offline reader
   when the backend is not configured), Living Village, Reality Lab, Continue. Never a "live" label on a stub.
2. **Generative flow**: the composer from a compact tray; region or landmark selector; "understand" with a cancel and a timeout, no
   retry loops; the preview already shows said/can-do, clauses, omissions, strength, evidence, targets, threshold and side effects
   (phase 09) — check it fits a phone; then choose the first villager in 3D or a roster with the AP cost confirmed.
3. **Villager card**: what they think, why, who told them, persuadable or not, what you can say, their next move, one "Why?" link
   to the source event; recorded dialogue replayed without new calls.
4. **Phone**: safe areas, dynamic viewport, 44 px targets, the software keyboard never hiding the composer, orientation change
   keeping the draft and the run revision, no world gesture submitting anything.
5. **Outage**: "Online interpretation unavailable; use the offline composer", no Influence lost, live dialogue disabled honestly.
6. E2E on desktop Chromium and WebKit phone: start, write, choose, seed, advance, inspect, law and effect, save, reload, win or lose,
   retry; keyboard and screen-reader audit; reduced motion; orientation and keyboard tests.

## Parallel track: the 3D world

[`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md): stage 0 (merge V1's 3D work) is done; stage 1 (draw packs, fire,
smoke, forecast, lens and labels in 3D) and stage 2 (time of day) remain, and with them phase 10's "premium" bar. Written laws'
effects are drawn and animated from logged events (phase 10, [`3D_EFFECTS.md`](3D_EFFECTS.md)).

## What MUST NOT be rewritten

`src/engine/**` and `tests/fixtures/**` behaviour for Classic (any change that moves a golden hash is a rules change: bump
`RULES_VERSION`, re-record, update the tripwire, say why); `GameSession` as the only mutation path; the `WorldRenderer` observer
contract; save, archive, catalog and MCP run formats, the MCP server name and resources, `localStorage` keys; the offline composer
as the Classic reader and fallback; the `server/ai` checks order (cheap before paid, fail closed) and the no-request-before-consent
rule in `src/ai/client.ts`; villager minds as data the engine records (a model proposes decisions and voices answers, never
writes memories, beliefs or trust); the reality language's closed vocabulary (a new operator, kind or trigger is a language version bump,
`reality-2`, never a silent change to `reality-1`, whose saves must keep replaying), the executor's order independence and
support-weighted conflicts, and V1 laws running on V1's executor in every run; the written-belief rules versions (a change to how
written beliefs are priced, staged or punished is a new `REALITY_RULES`, gated by `realityRules(s)`, never a silent change to an
existing version: every run records its version and older runs must replay exactly).

## Private configuration needed (names only, never values)

For LIVE: `BE_AI_ENABLED`, `AI_GATEWAY_API_KEY` (local) or Vercel OIDC (deployed), `BE_SESSION_SECRET`, `BE_ALLOWED_ORIGINS`,
`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN`), optionally
`BE_AI_DAILY_BUDGET_USD`, `BE_ADMIN_TOKEN`; plus an AI Gateway budget in the Vercel dashboard. Never paste a value into a prompt,
an issue, a commit or a `VITE_` variable. Steps: [`AI_SETUP.md`](AI_SETUP.md).

## Current daily inference budget / usage

Application cap: $1.00 per UTC day (default), 3,000 calls per day. Usage so far: 0 calls, 0 tokens, $0.

## Merging later V1 changes

V1's `main` up to `22b7b1c` (JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3) was merged on 2026-10-28 as ordinary
history (`08877e7`). Anything newer merges the same way:

```bash
git fetch https://github.com/JaredVogler2/BeliefEngine main
git merge FETCH_HEAD
```

Last time the conflicts were `README.md` (keep V2's; V1's goes to `docs/v1/README.md` with links re-pointed), `docs/PROGRESS.md`
(keep V2's; V1's entries appended to `docs/v1/PROGRESS.md`), the three `docs/3D_*.md` (keep V2's; V1's saved under `docs/v1/`),
`docs/ASSETS.md`, the licence inventories (regenerate: `npx tsx scripts/licenses.ts [--prod] --write`), `src/styles.css` (keep both),
`src/ui/play/Hand.tsx` and `Play.tsx` (V1's HUD with V2's reality button and lazy composer). Then the unit suite (the tripwire must
not move), the classic suite, both 3D suites, and V2's own specs.
