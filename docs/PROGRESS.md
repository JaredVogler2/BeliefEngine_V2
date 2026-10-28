# V2 progress log

One entry per verified checkpoint, newest first. Status words follow [`prompts/AGENT_RUNBOOK.md`](../prompts/AGENT_RUNBOOK.md):
NOT STARTED, IN PROGRESS, IMPLEMENTED UNVERIFIED, VERIFIED, BLOCKED. V1's own build log is [`v1/PROGRESS.md`](v1/PROGRESS.md).

| Phase | Status | Evidence |
|---|---|---|
| 01 V1 audit | **VERIFIED** | [`V1_AUDIT.md`](V1_AUDIT.md); V1 baseline run in a clone ([`BASELINE.md`](BASELINE.md)) |
| 02 Migration and baseline | **VERIFIED** | [`MIGRATION.md`](MIGRATION.md), [`BASELINE.md`](BASELINE.md), `tests/unit/v2-migration.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 03 Provider, auth, budgets | **VERIFIED with mocks, a real Redis and an offline `vercel build`; LIVE UNVERIFIED (no credential); NOT DEPLOYED** | [`AI_SETUP.md`](AI_SETUP.md), [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md), `tests/unit/ai-*.test.ts`, `tests/e2e/v2-online.spec.ts`, [`screenshots/v2-phase03/`](screenshots/v2-phase03/) |
| 04 Generative belief language | **VERIFIED (gate: typed, validated, deterministic, V1-compatible, three novel executable claims, property tests); the interactive preview UI arrives with phase 05's composer** | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md), `tests/unit/reality-language.test.ts`, `tests/unit/reality-properties.test.ts`, `tests/fixtures/reality-corpus-1.json` |
| 05 Interpreter and compiler | **VERIFIED offline and with mocks; LIVE UNVERIFIED** (no provider configured: model accuracy, latency and token cost not measured). On sentences neither reader was tuned on, the offline reader v2 reads 13/30 supported sentences faithfully against V1's 3/30 (labels 51/80 against 34/80); it refuses rather than invents (1 invented effect in 32 impossible sentences, 0/7 injections obeyed); written beliefs become executable rules that change the world (integration test, two villages) | entry below, [`screenshots/v2-phase05/`](screenshots/v2-phase05/) |
| 06 Simulation primitives | **VERIFIED (gate)**: executor, 17 operators, chickens and loose stones in engine tests; hens, stones and the raised bank drawn on the classic map and in 3D and checked in the browser from belief to changed scene (phase 09). Stated limits: floodwater turned aside is not conserved elsewhere, faster growth has no water demand; effects are drawn as state, animated in phase 10 | [`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md) §7, `tests/unit/reality-execute.test.ts`, `tests/e2e/v2-world3d.spec.ts` |
| 07 Agent cognition and memory | **VERIFIED offline and with mocks; LIVE UNVERIFIED** (no provider: no model-backed decision has been made). Every villager of a V2 run has a personality, goals and memories with provenance; a few a day decide at moments that matter (legal moves only, V1 rules decide the effect); the player can talk with any of them; a model may propose decisions and voice answers, checked twice and recorded so replays need no model | [`MINDS.md`](MINDS.md), entry below, [`screenshots/v2-phase07/`](screenshots/v2-phase07/) |
| 08 Multi-agent social dynamics | **VERIFIED offline and with mocks; LIVE UNVERIFIED.** Influence journal with cause chains; faction leanings; skeptics demanding proof (answered, failed, ignored); competing claims villagers write in the same language (announced, withdrawable, capped, contestable); lies the engine flags and witnesses discover; social energy so decisions redirect rather than add influence. Measured: the social layer moves the outcome of knife-edge chapters (table in the entry) | [`MINDS.md`](MINDS.md) §6, entry below, [`screenshots/v2-phase08/`](screenshots/v2-phase08/) |
| 09 Belief-to-reality bridge | **VERIFIED offline and with mocks; LIVE UNVERIFIED.** A typed sentence becomes law only through the whole chain (preview → hashed confirmation → real persuasion → threshold with hysteresis → catalyst → executor → V1 hazards), proven in the browser for the three proof claims plus a complete win and a complete loss; below threshold nothing happens; replays need no model and no network. Measured: written beliefs reach law in 6-9 days, so they rarely decide a chapter (phase 11) | [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md), entry below, [`screenshots/v2-phase09/`](screenshots/v2-phase09/) |
| 10 3D visual effects | **IN PROGRESS: the effect registry and three physical laws in 3D VERIFIED (they match canonical state, tested over the recorded chains and in the browser); the gate's "looks like premium real-time gameplay" NOT MET by my own reading (the art stages of the 3D plan remain); frame times on a GPU or phone UNVERIFIED** | [`3D_EFFECTS.md`](3D_EFFECTS.md), `tests/unit/render3d-reality.test.ts`, `tests/e2e/v2-world3d.spec.ts`, [`screenshots/v2-phase10/`](screenshots/v2-phase10/) |
| 11 Generative gameplay and balance | **VERIFIED offline (gate met by measurement); LIVE UNVERIFIED** (the gate's "the model adds strategic variety" needs a provider). Under the old rules no written-belief policy won a single seed of 30 in any chapter; under rules 2 (recorded per run; older runs replay exactly) written beliefs win in all three (Redbank 27/30, Harvest 28/30, Ashwood 21/30), a decoy belief backfires on 11 of 30, the dominant cheap win (a written copy of the unpicked opening story, 20/20) is closed (0/30); four modes with separate records; leaders stand against magic that harms livelihoods | [`GAMEPLAY_V2.md`](GAMEPLAY_V2.md), [`data/tournament-v2/`](data/tournament-v2/), `tests/unit/gameplay-v2.test.ts`, `tests/e2e/v2-modes.spec.ts`, [`screenshots/v2-phase11/`](screenshots/v2-phase11/) |
| 12 Desktop and iPhone UX | **VERIFIED in Chromium (desktop and phone profile, four iPhone sizes); the Generative smoke VERIFIED in CI on WebKit, the iPhone 14 profile and Firefox (run 40644114976); real iPhone Safari UNVERIFIED; LIVE UNVERIFIED.** A main menu that names every mode; the composer keeps an unsent belief and its reading, can stop an online reading, falls back on an outage with nothing spent; "who tells it first" after writing; a villager card that answers what they think, why, whether they would listen and what they will do, with a "Why?" link to the event; the debrief says what a written law cost; a new seed keeps the V2 mode (it used to start a Classic run) | [`UX_V2.md`](UX_V2.md), entry below, `tests/e2e/v2-ux.spec.ts`, [`screenshots/v2-phase12/`](screenshots/v2-phase12/) |
| 13 MCP and tool play | **VERIFIED locally (stdio, the official SDK client): an agent plays a whole Generative Reality run through tools on the browser's own state hash; online reading through MCP TESTED MOCK ONLY; LIVE UNVERIFIED; a model-powered V2 agent session NOT RUN; remote Streamable HTTP NOT BUILT** (no durable shared store). V1 tools unchanged | [`MCP_V2.md`](MCP_V2.md), entry below, `tests/unit/mcp-v2*.test.ts`, [`data/mcp/v2-hens-session.md`](data/mcp/v2-hens-session.md) |
| 14 Replay, persistence and evals | **VERIFIED offline (gate met): a Generative run replays like a Classic one once its inputs are recorded; a complete browser win and four losses replay offline with no provider call; evaluations measured offline and with MOCK stand-ins, LIVE not run** | [`REPLAY_V2.md`](REPLAY_V2.md), entry below, [`data/evals/REPORT.md`](data/evals/REPORT.md), `tests/unit/ledger*.test.ts`, `tests/unit/evals.test.ts` |
| 15 Security, privacy, cost and failure | **VERIFIED with scripted providers and a real Redis; LIVE UNVERIFIED; NOT DEPLOYED.** Threat model with every attack mapped to a control and a test; a chaos suite (hostile text, hostile structures, a heavier compute load than play can reach, physics limits, double taps, stale confirmations, session scopes, CORS and caching headers, a cold start); the secret scan runs in CI over every tracked file, every commit and the built site; gateway privacy routing (no training always, zero retention by setting); an operator cost monitor. Found and fixed four defects (entry) | [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md), entry below, `tests/unit/{security-chaos,scan-secrets,ai-monitor}.test.ts` |
| 16 Integration and release testing | **Integrated but not live-tested: the six journeys PASS offline and with scripted providers (A Classic offline, B novel laws, C living society, D replay, E MCP over stdio, F phone sizes in Chromium and CI WebKit); V2 runs at scale replay exactly from stored model outputs; LIVE UNVERIFIED; NOT DEPLOYED** | [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md), [`RELEASE.md`](RELEASE.md), [`data/sim-v2/REPORT.md`](data/sim-v2/REPORT.md), entry below |
| 17 Adversarial fun review | **Review done; two P0 and five P1 fixed and VERIFIED offline, with mocks and in Chromium; FUN SUBJECTIVE/UNVERIFIED (no playtest); LIVE UNVERIFIED; NOT DEPLOYED.** A model could swap what a sentence's change is (289 of 292 swapped readings trusted → 11); the composer's price was not always the charge (4 of 72 → 0 of 108); written-belief rules 3 price a ward around every home for the ground it covers; ideas, offers, flavour and wording fixed; a first-time player's sentence is understood 35 of 69 times (blind held-out set). V2 is not complete: LIVE, deployment, a playtest and the premium 3D look remain | [`FUN_REVIEW_V2.md`](FUN_REVIEW_V2.md), [`data/fun-review-v2/`](data/fun-review-v2/), [`data/tournament-v2/`](data/tournament-v2/) `rules3-*`, `tests/unit/reality-rules3.test.ts`, `tests/e2e/v2-review.spec.ts`, [`screenshots/v2-phase17/`](screenshots/v2-phase17/) |
| 3D visual track (standard, plan, report) | standard and plan written; stage 0 (V1's 3D work merged) done; stages 1-9 NOT STARTED | [`3D_VISUAL_STANDARD.md`](3D_VISUAL_STANDARD.md), [`3D_IMPLEMENTATION_PLAN.md`](3D_IMPLEMENTATION_PLAN.md), [`3D_QUALITY_REPORT.md`](3D_QUALITY_REPORT.md) |

Live model calls so far: **none**. Inference spend so far: **0**. Deployments: **none**.

---

## 2026-10-28 — Phase 17: adversarial fun review (fixes VERIFIED; FUN UNVERIFIED; LIVE UNVERIFIED; NOT DEPLOYED)

**What was done** (reference: [`FUN_REVIEW_V2.md`](FUN_REVIEW_V2.md); fixes in `d3b83c1`)

- **Reviewed** as eight reviewers against the running code: ten failure cases with reproductions and code paths, four non-issues
  checked, the seven questions answered from evidence, a rubric. Evidence script `scripts/fun-review-v2.ts`, run on this tree and on a
  checkout of `5132f26` for the "before" numbers ([`data/fun-review-v2/`](data/fun-review-v2/)).
- **P0-1 effect fidelity**: a model's reading is held to the change its words name (`fidelity.ts` `changesNamed`); swapped-effect
  readings trusted at full confidence 289/292 → 11/292, honest readings unchanged (191/193).
- **P0-2 price truth**: the composer's price is the engine's charge for every run (4 of 72 written beliefs showed 3 and charged 2, and
  the button refused a legal write); MCP reports the same number.
- **P1 fixes**: written-belief rules 3 (a clause measured from every landmark of a kind priced for the ground they cover; the charge from
  the whole power; "Every night", "any home", the acting reach; a Living Village stays under 2); village-aware ideas (Ashwood 0/3 →
  3/3 understood); helpful offers for impossible sentences (3/8 harmful → 0/8); flavour kept and shown; no repeated left-out line;
  reader `offline-v2.3` (place words, merged repeats, typed contractions) and its anchor phrases indexed by word (reading p50
  12.9 → 2.5 ms).
- **Measured honestly**: two blind sets of first-time players' sentences written by independent agents; the dev set the fixes used:
  22/68 → 36/68; the held-out set: 34/69 → **35/69**; impossible sentences accepted: 0 both. The rules-3 tournament (30 seeds a chapter)
  is published: Redbank's spamming village-wide ward 20/30 → 0/30, lantern-ward play unchanged; Harvest unchanged; Ashwood's best bot
  policy 21/30 → 15/30 (its three-hamlet ward now costs what it always showed).

**Commands and results**: lint and typecheck clean; `npm test` 60 files, 684 passed; the V2 browser specs (bridge, ux, journeys,
reality, modes, online, minds) on desktop and phone 52 passed, 20 skipped by design; `v2-review.spec.ts` 6 passed (screenshots in
[`screenshots/v2-phase17/`](screenshots/v2-phase17/)); `v2-world3d` and `v2-bridge` on desktop-3d 4 passed; the flaky 3D phone
person-click (CI on `5132f26`) passed 6 of 6 repeats after the fix; `npm run eval`: corpora unchanged (172/172, 78/80, 51/80);
`test:sim:v2` at 20 seeds and 40 villages under rules 3: 620 of 620 replayed exactly, 8,212 stand-in decisions accepted, 0 refused;
`npm run size` entry 296 KB gzip of 300. Chains recorded under rules 1 and 2 replay to their recorded hashes.

**Not verified:** FUN (no human playtest; all judgements are the reviewers'); LIVE (no credential: no model-backed playthrough, no
no-key/live comparison); a real iPhone; a GPU; the premium 3D look. NOT DEPLOYED. V2 is not complete by the strict finish.

---

## 2026-10-28 — Phase 16: integration and release testing (integrated but not live-tested; NOT DEPLOYED)

**What was done** (references: [`FINAL_ACCEPTANCE.md`](FINAL_ACCEPTANCE.md), [`RELEASE.md`](RELEASE.md))

- **Journeys as tests.** A: `tests/e2e/v2-journeys.spec.ts` plays V1's recorded Classic win by clicks and a loss with every request
  watched (0 to `/api`, 0 off-origin), both on V1's hashes and both confirmed by the debrief's on-device replay. B: the same spec types
  "chickens rise into the air when bells sound" (read as the hens' lift on the bell, previewed, nothing spent) and a sentence whose
  "time runs backwards" clause is named and left out; `tests/unit/journeys-v2.test.ts` checks the readings and preview headless.
  C: six named villagers with different goals hear one new belief at a gathering; their intentions differ (proof-seekers look for
  proof); staging it before it is law backfires, all six lose conviction and some change plans; over the recorded "rain" chain trust
  moves on 5+ edges and a faction endorses; the scripted stand-in's decisions pass the server's and the engine's checks, change
  nothing until dusk, and replay with no model. D: a belief read by "a model" (the stand-in) replays from its recorded structure while
  a newer model id that reads the words as a stronger lift changes nothing; truncated, future, edited saves and an edited ledger are
  refused by name. E: the real stdio test gained stale and repeated confirmations, a villager's answer and inspection. F: the
  cross-browser smoke now runs on WebKit at iPhone SE (320), iPhone 14 (390) and iPhone 14 Pro Max (430).
- **At scale with stored model outputs.** `scripts/sim-v2.ts` (`npm run test:sim:v2`): V2 policies over three chapters, the Lab, the
  Living Village and generated villages; every morning the stand-in decides for the villagers due to think (through the server's
  task code) and every written belief is read again by it; each run then replays from options + actions alone to the same hashes
  with an identical ledger. At 20 seeds and 40 generated villages ([`data/sim-v2/REPORT.md`](data/sim-v2/REPORT.md)): 620 runs, 4,942 game days, 8,356 stand-in decisions accepted (0 refused), 500 beliefs written with the stand-in's reading, 3,171 ledger entries, and **620 of 620 replayed exactly** (636 s, sharing the machine with the browser suite). MOCK ONLY.
- **Release documents.** `docs/FINAL_ACCEPTANCE.md` (V2's table; V1's moved to `docs/v1/`), `docs/RELEASE.md` (install, build,
  verify, Vercel settings by name, OIDC, cost caps, rollback), the README's Classic-offline / Generative table (and no "LLM-enabled"
  claim while LIVE is unverified). The hosting check now also plays a Generative Reality run under the production CSP.

**Commands and results**: the new journey tests pass (`journeys-v2.test.ts` 7, `mcp-v2-stdio.test.ts` 4, `v2-journeys.spec.ts` 3 passed and 1 skipped by design); `npm run verify:hosting` verified with the Generative Reality flow; `npm run test:sim:smoke` 256/256, SMOKE OK; `npm run typecheck` and lint clean. `npm test` 59 files, 670 passed; the whole Chromium suite (desktop + phone) 195 passed, 73 skipped by design, 0 failed (20.7 min); `test:sim:v2` at 20 seeds and 40 villages: 620 of 620 replayed exactly; `npm run size` entry 295 KB gzip of 300; `npm run scan:secrets -- --history --dist` clean; screenshots in [`screenshots/v2-phase16/`](screenshots/v2-phase16/). The 3D suite and the cross-browser smoke run in CI.

**Not verified:** LIVE (no credential): the live checklist is listed and not run; NOT DEPLOYED (no authorisation); no human playtest;
no real iPhone; no GPU.

---

## 2026-10-28 — Phase 15: security, privacy, cost and failure (VERIFIED with mocks; LIVE UNVERIFIED; NOT DEPLOYED)

**What was done** (references: [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md), [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md))

- **Threat model** over phase 03's service and everything built since: what is protected, the trust boundaries, the untrusted
  inputs, and a table mapping each attack the prompt names to its control and the test that shows it.
- **Chaos suite** (`tests/unit/security-chaos.test.ts`, 14 tests, adding to phase 03's `ai-*.test.ts`): BiDi, zero-width and control
  characters, markup, fake tool calls and "SYSTEM:" instructions in the browser reader and through MCP (stripped, read as words,
  instructions refused by name, state unchanged); a path-escaping run id (`BAD_RUN_ID`); a trigger nested 200 deep and an OR of 10,000
  (refused in under 50 ms); crafted saves with 10,000 hens or a 60,000-event log (refused before anything iterates); the five beliefs
  a Lab run may write (13 clauses) forced live every night with the bell rung and every beacon lit (all five act, 11-13 clauses a
  night, slowest night 25-46 ms here against a 500 ms budget, no clause past 40 targets); double taps (one charge; `ALREADY_SPOKE`);
  a stale reading (`STALE_REVISION`, nothing spent); an unknown model id (priced at the worst case); a reading-only session asking
  for villager decisions (refused, provider never called); `no-store`, `nosniff`, JSON and **no CORS grant** on every answer
  including a 415; a **cold start** (a brand-new instance honours the old one's sessions and its spent cap).
- **Physics limits** (`physics limits` in the same suite): time reversal, code, the game itself, endless resources, the whole world,
  ten thousand chicks and invented units are refused or named as left out, identically in balanced play and the Lab; what a partial
  reading keeps stays inside every operator's bounds; a spawn law forced live all chapter never keeps more hens alive than the caps
  allow, every chick costs food, and the save still loads. The reader gained two names for things it used to narrow or drop
  silently: "the whole world" (now `absolute`, as "everywhere" already was) and a number with a unit (`measure`: "5000 metres high"
  is the ordinary lift, now said). Checked against all 332 corpus sentences before and after: every reading identical, so no
  evaluation number moved (reader id unchanged).
- **Secrets**: `npm run scan:secrets` (`scripts/scan-secrets.ts`): eleven credential patterns plus tracked env files and `.gitignore`;
  names file, line and rule, never the value. CI now checks out the whole history and runs it over every tracked file and every line
  added by every commit (`--history`), and over the built site after the build (`--dist`, which also refuses any credential name in
  the bundle). Clean.
- **Privacy routing**: every gateway call asks for providers that do not train on what they are sent (`disallowPromptTraining`, all
  plans, no extra cost) and, with `BE_AI_ZERO_RETENTION=1`, zero data retention (Pro and Enterprise); a provider that cannot comply
  refuses and the player reads offline. Read from Vercel's docs (updated 2026-09-10 and 2026-09-22) and from the installed
  `@ai-sdk/gateway` 4.0.128 types. `/api/ai-status` reports the routing; the consent notice says it.
- **Cost monitor**: the meter now records spend per model, fallbacks and the application's own quota refusals; `npm run ai:monitor`
  prints the operator panel from `/api/ai-metrics` (live server, `--watch`, or `--demo` in-process with the scripted provider).

**Found and fixed on the way**

1. My first cut of the save caps refused **honest** saves: dead hens stay on the list, so a run with a hatching law passes 24 entries.
   The spawn test caught it (mutation-checked: the old cap fails it); the cap is now on living hens plus at most one flock a dawn.
2. A quota refusal kept the session's in-flight lease until it expired, so the next request read "busy" instead of the real reason;
   the lease is now released at once.
3. Quota refusals were invisible to the operator; they now count as fallbacks.
4. The first compute test claimed three acting laws when only one acted (two were authored-story twins held until day 4, and finite
   attention means no village holds five written beliefs strongly at once). It now forces the laws live and asserts that all five act.

**Commands and results** (this machine): `npm run lint` clean; `npm run typecheck` clean; `npm test` 58 files, 662 tests passed
(112 s, with a real Redis); the browser specs the consent notice touches (`v2-online`, `v2-reality`, `v2-minds`, `v2-ux`, `smoke`) on the desktop and phone
projects: 42 passed, 14 skipped by design, 0 failed (2.2 min); `npm run size`: entry 295 KB gzip of 300; `npm run scan:secrets -- --history --dist` clean; `npm run ai:monitor -- --demo` (output in
[`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md)); V1 golden hashes unchanged (Classic untouched).

**Not verified:** any live provider behaviour, including the privacy routing at the real gateway (**LIVE: UNVERIFIED**); a deployment
(**NOT DEPLOYED**); Upstash itself (a shim over real Redis stands in). **Known limits:** no bot check on `/api/session` yet; secret
scanning is pattern-based; provider retention without zero data retention is the provider's policy.

---

## 2026-10-28 — Phase 14: inputs recorded, runs replayed, readers measured (VERIFIED offline; LIVE not run)

**What was done** (reference: [`REPLAY_V2.md`](REPLAY_V2.md))

- **The external-decision ledger** (`src/engine/save/ledger.ts`): one entry per input that did not come from the rules (a belief read,
  villagers' decisions or a line a model proposed), with its revision, target, producer, validation versions, the exact output the
  engine used and a hash chain; kept by `GameSession` as play goes on, derived by replaying the run's own log, and checked with exact,
  named refusals (`LEDGER_MISSING`, `_EXTRA`, `_REORDERED`, `_EDITED`, `_VERSION`, `REPLAY_DIVERGES`) and a recovery that never asks a
  model again. Found on the way: the run state already holds its whole action log (`history` + `today`), so every save could already
  be replayed; and inference metadata on an action is now cleaned before it is recorded.
- **Saves** carry the ledger beside the state (no schema bump; older saves derive theirs on load); the **debrief** replays the run on
  the device and says whether it reaches the same end, with a downloadable replay; `scripts/verify-replay.ts` checks one offline; MCP
  run files carry and verify it; the browser and MCP record online readings' metadata (provider, model, latency, cache).
- **Privacy**: Settings > Your data (what is kept where, what online reading sends and the server keeps, delete this game, delete
  everything); the Credits' privacy line corrected for V2. **Bug fixed**: Settings' "Restart this seed" dropped the V2 mode.
- **Evaluation** (`npm run eval`): 332 labelled beliefs, 211 generated villager cases (`tests/fixtures/npc-cases-1.json`), V1
  migration, latency, cost estimates, win diversity ([`data/evals/REPORT.md`](data/evals/REPORT.md)).

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm test` | pass; 56 files, **641 tests**. Run while the browser suite loaded the machine, 2 timing-sensitive tests failed (the real-Redis 100-request race: 503s under load, as seen before; the exploit-seeker's 60 s limit); both pass on a quiet machine (32/32), and the session's ledger does not slow the bot (28.6 s with it, 32.2 s without) |
| `npx playwright test --project=desktop --project=phone` | **192 passed, 72 skipped by design, 0 failed** (19.9 min) |
| `tests/unit/ledger.test.ts`, `ledger-save.test.ts`, `evals.test.ts` | **16 passed** |
| `npx playwright test tests/e2e/v2-bridge.spec.ts --project=desktop` | **6 passed**: the debrief's replay check reaches each recorded hash (a complete win, four losses) with zero `/api` requests |
| `npx playwright test tests/e2e/v2-ux.spec.ts -g "your data"` (desktop, phone) | **2 passed** |
| `npm run eval` | offline reader 172/172, 78/80, 51/80 labels; 0/22 injections obeyed; 1/126 invented effects; V1 composer 80/172, 32/80, 34/80; V1 migration 130/130; villagers 211/211 legal with true provenance (policy and MOCK); latency and estimates in the report |

**Mock vs LIVE:** no model was called; the MOCK rows are the scripted stand-ins and are labelled as such everywhere.

## 2026-10-28 — Phase 13: the MCP server plays V2 (VERIFIED locally; online TESTED MOCK ONLY; remote NOT BUILT)

**What was done** (reference: [`MCP_V2.md`](MCP_V2.md))

- `create_game { variant: classic | generative | living | lab }`; the variant in every state view, kept by retry and import.
- `get_interpreter_status`; `propose_belief` (the reality reader: what it does beside the words, support, upkeep, side effects, what
  it leaves out, cost, a token per buildable interpretation; free) and `confirm_belief` for those tokens (the browser's `COMPOSE`;
  `STALE_REVISION` for an older village, `UNSUPPORTED_EFFECT` without `acknowledge: true` for a partial or substitute reading).
- `speak_to_villager` (the browser's TALK), `stage_evidence` (RITUAL with the claim and tonight's omen), `inspect_object`,
  `inspect_region`, `get_social_graph` (no convictions), `get_rule_explanation`; `inspect_villager` adds the mind the browser shows.
- Versioned error kinds (`kind`, `errorsVersion: 2`) on every failure; `code` unchanged.
- Online reading is off unless the person starting the server sets `BE_AI_ENABLED=1`: then the game's own inference service runs
  in-process (`mcp/online.ts`) under its consent, quotas and validation; `online: prefer | require` only asks.
- `export_replay` counts the accepted model proposals inside the action log (`modelProposals`).
- The agents' rules and tool guide resources teach the V2 tools; `scripts/mcp-v2-session.ts` writes a scripted session transcript.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm test` | pass; 52 files, **625 passed** |
| `npx vitest run tests/unit/mcp-*.test.ts` | **62 passed**: V1's 45 unchanged, `mcp-v2.test.ts` 14, `mcp-v2-stdio.test.ts` 3 |
| `mcp-v2-stdio.test.ts`, the proof | the real server over stdio replays the recorded `hens` chain with propose/confirm in place of the composer: law on day 6, 22 hens lifted on each of the last two nights, defeat, **state hash `0ce7238943cc8d`, identical to the browser's**; a stale revision, an unknown villager and a duplicated call change nothing; a coach-mode run refuses every write |
| `npx tsx scripts/mcp-v2-session.ts` | [`data/mcp/v2-hens-session.md`](data/mcp/v2-hens-session.md): the same run as a readable transcript (a script, not a model) |

**Mock vs LIVE:** the online path is tested against the scripted stand-in only (TESTED MOCK ONLY). No model-powered agent played V2
through MCP in this phase.

## 2026-10-28 — Phase 12: generative play made legible on desktop and iPhone (VERIFIED in Chromium; real iPhone UNVERIFIED)

**What was done** (reference: [`UX_V2.md`](UX_V2.md))

- **Main menu**: Play Classic (offline, the hand-made stories), then Generative Reality, Living Village and Reality Lab, each with
  its few words; each opens the mode screen on its tab with its button leading. The mode screen explains how reading works before
  anything is played (offline first; a model only when asked, after a notice; who pays; a failure costs nothing; a model only
  proposes).
- **Composer**: the unsent sentence, region and (at the same run revision) the reading come back when the dialog is reopened; a
  stale reading is dropped with a note; a turning phone does not close it. "Stop reading" for an online reading (the client ends it
  as `cancelled` and sends nothing if stopped before sending); an outage shows the offline reading with the reason and "no Influence
  was spent"; "Try online again" by hand only, waiting out a rate limit's `retryAfterSec`. Phone keyboards: dictation, 16px fields.
- **Who tells it first?** after writing: the people who vote on the new law, ranked by the engine's dry run of telling them (weighted
  as support is weighed), each with what it would do and **Tell · 1**; or close and choose in the village.
- **Villager glance** (every mode): Thinks / Why (+ **Why?**, which opens the log at the event with its causes and points the camera)
  / Would listen? (the dry run, or the engine's reason) / Next. `BeliefView.whyEvent` carries the event id (the MCP's
  `inspect_villager` gets it too).
- **Debrief**: "What it cost" for a written law that harmed people (`Provenance.harm` from `LAW_HARMED`). **Bug fixed**: "New seed"
  on a Generative Reality debrief started a Classic run (`v2ModeOf` now shared with `optionsFromState`).
- **Phones**: 44px controls on coarse pointers; the dialog overlay follows the visual viewport (`src/ui/viewport.ts`) so the iOS
  keyboard cannot cover the field (UNVERIFIED without an iPhone); safe-area padding.
- **Accessibility**: axe found that the Tell buttons' spoken names did not contain their visible label (WCAG 2.5.3): they are named
  by their content now ("Tell · 1 Influence, to Ivo Thatcher").

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 50 files, **608 passed** (new: the client's Stop path; the provenance harm counts on the recorded bell-rain chain) |
| `npx playwright test tests/e2e/v2-ux.spec.ts tests/e2e/smoke.spec.ts` (desktop, phone) | **21 passed**, 7 skipped by design (phone sizes run on the phone profile; keyboard, online and retry on desktop). Axe: no serious or critical violations on the five new surfaces once the Tell buttons were fixed |
| `npx playwright test --project=desktop --project=phone` (every spec; the three V2 specs that write a belief now close "who tells it first") | **189 passed, 71 skipped by design, 0 failed** (15.1 min), on the build before the retry fix; the phase 12 spec and smoke re-run after it (row above) |
| `tests/e2e/smoke.spec.ts` (new Generative Reality smoke) | desktop and phone Chromium: passed; WebKit, iPhone 14 and Firefox: run by CI only (not installed here) |
| `npm run size` | entry 292 KB gzip (budget 300; 289 before this phase), composer chunk 28 (budget 40), CSS 9.2 (budget 12) |

**Mock vs LIVE:** no model was called. The online reading tests use the local simulated server, and routed responses for the hung
request, the outage (503) and the rate limit (429).

## 2026-10-28 — Phase 11: a strategy game, not a wish machine (VERIFIED offline; LIVE UNVERIFIED)

**What was done** (reference: [`GAMEPLAY_V2.md`](GAMEPLAY_V2.md))

- **A Generative Reality tournament** (`scripts/tournament-v2.ts`, `src/engine/ai/bots/reality.ts`): the prompt's seven policies
  (no-op, spam a broad law, evidence-first, bridge-based persuasion, inventive compound, careful low-power synergy, rival antagonist
  through `NPC_DECIDE`) plus two probes, all through the public actions, network switched off; AP, activation day, survival,
  collateral (homes, hens, animals, fields, pooled tiles), reach, demonstrations, tests, harm and opposition, dead time, ms per run.
- **Written-belief rules 2, recorded per run** (`s.v2.rules`; absent = 1, so older saves and the phase 09 chains replay to their
  hashes): support and believers nearer authored laws of equal power; breadth priced per region; demonstrations at a belief's
  catalyst with an omen read from what it does (`reality/demonstrate.ts`); a copy of an authored story is as provable as it.
- **The dominant cheap win fixed**: a written copy of the opening story the player did not pick won Redbank 20/20 for 1 Influence;
  a copy now asks at least what the story it copies asks (support, believers, watchers, ramp) and waits for its day (`reality/twin.ts`).
- **Every hamlet**: "in every hamlet" holds a belief in each region that has what it acts on (the reader; rules 2 only).
- **Strategic events**: `LAW_HARMED` (the people a written belief harmed trust the Keeper less and hold it less; `reality/harm.ts`)
  and `LEADER_OPPOSES` (a council or scholars' leader stands against it; `mind/claims.ts`). Recorded through real persuasion in the
  re-recorded claim C chain: a faction leader stood against the bell-rain belief after it flooded Eastbank.
- **Modes and records**: Living Village (`living: true`: six thinkers a day, the chapter's own stories, no writing); every V2 run
  is recorded with its mode, apart from Classic (no unlocks, no Classic badges, own bests; Lab unranked); a Chronicle's laws go to
  the atlas as keepsakes with no power; an import keeps the mode (and Inventor runs' `custom` mark, which it used to drop).
- UI: Living Village on the reality tab, its mode in the hand, the mode in the debrief; the staging omen of a written belief in the
  landmark card and the preview.

**Tournament (30 seeds per chapter, normal), wins, rules 1 → rules 2**

| Policy | Redbank | Harvest | Ashwood |
|---|---|---|---|
| noop | 0 → 0 | 0 → 0 | 0 → 0 |
| spam-broad | 0 → 20 | 0 → 0 | 0 → 0 |
| evidence-first | 0 → 27 | 0 → 13 | 0 → 18 |
| bridge-persuasion | 0 → 0 | 0 → 0 | 0 → 0 |
| inventive-compound | 0 → 0 | 0 → 3 | 0 → 9 |
| careful-synergy (authored plan + a light belief) | 26 → 26 | 13 → 13 | 6 → 6 |
| rival-antagonist | 0 → 23 | 0 → 25 | 0 → 21 |
| ward-greedy (probe: antagonist's control) | 0 → 24 | 0 → 28 | 0 → 21 |
| backfire-probe (probe) | 0 → 0 | 0 → 0 | 0 → 7 (worse than doing nothing on 11) |

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 50 files, **607 passed** (17 in `gameplay-v2.test.ts`; `belief-bridge.test.ts` replays the rules-1 chains to their recorded hashes) |
| `npx tsx scripts/tournament-v2.ts --seeds 30` and `--rules 1` | the table above; 0 model calls (the network is switched off); 0.5-2 s per run |
| `npx playwright test tests/e2e/v2-modes.spec.ts` (desktop, phone) | **6 passed**: Living Village (mode shown, no composer, a villager answers); a written belief offered for staging at the bell tower with the engine's omen; the Atlas showing a Chronicle's law and each mode's record (this test found that the archive importer dropped the invented laws: fixed) |
| V2 browser specs (`v2-reality`, `v2-minds`, `v2-online`, `v2-bridge` re-recorded under rules 2) | 25 + 7 passed, the rest skipped by design |
| `npx playwright test --project=desktop --project=phone` (the whole classic suite) | **171 passed, 65 skipped by design**: 8 first failed with `browserContext.close: ENOENT` on their trace files because a parallel Playwright run had cleared `test-results/`; all 8 re-run green on a quiet machine. `atlas.spec.ts` re-run after the atlas change: green |
| `npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop-3d --project=phone-3d -g "a click on a person"` | 2 passed: the 3D click test now aims at a person nobody stands in front of (it failed in CI at both phase 10 commits, where Tilly covered Ivo) |
| `npm run size` | entry 289 KB gzip (budget 300), 3D 215, composer 26, mind panel 3 |

**Mock vs LIVE:** no model was called. The gate's "the model adds strategic variety rather than only more text" is **LIVE
UNVERIFIED**; the adversarial proposer standing where a model would moves the ward's outcome by 0-3 seeds in 30.

## 2026-10-28 — Phase 10: written laws in the 3D world (effects VERIFIED; premium look NOT MET; GPU UNVERIFIED)

**What was done** (reference: [`3D_EFFECTS.md`](3D_EFFECTS.md))

- **An effect registry keyed by logged events** (`render3d/plan.ts`, plain data): each written-law event (`REALITY_EFFECT` by its
  operator, `BANK_RAISED`, `STONE_RAMS_BRIDGE`, `WATER_POOLED`, `FIRE_WARDS_COOLED`, `STRAYS_FLEW_HOME`) and each villager's own choice
  (`NPC_ACT`, tests, lies, claims) maps to an effect planned from positions and amounts the engine computed; `effects.ts` plays them
  (lift, chill, gesture added), skippable and reduced-motion aware.
- **Forces**: the executor now records what each entity effect amounted to once every law's pull was combined (`amount` on the
  applied effect); a bell night lifts exactly the hens it lifted, to that height, with blob shadows that shrink as they rise.
- **Written laws described by their own clauses** in the snapshot (trigger, target, operator, what powers them tonight), never by
  the neutral V1 spec they carry; the ledger in the world no longer shows a bell law as wanting a lantern.
- **Things drawn legibly**: hens with body, head, comb, beak and tail; stones by state (placed, wet, dry); the bank's courses at the
  waterline.
- **The screenshot matrix** (`scripts/capture-matrix-v2.ts`, `capture-3d.ts --trace/--save`): day 1, two activations, compound
  weather aftermath, debate near the bridge, a law let go (constructed save), the end-of-run scene, 390×844 and 320×568.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `npx vitest run tests/unit/render3d-reality.test.ts` | **9 passed**: every planned effect names an event of that very night (four chains); lifts only on the nights the law acted, exactly the executor's hens at its height; a law that never woke shows nothing; written laws described by their clauses |
| `npx playwright test --project=desktop-3d --project=phone-3d` | **46 passed, 4 skipped by design** (29.3 minutes, software WebGL): V1's 3D suite (tiers, context loss, restart memory, picking, camera limits, axe) and V2's (the outcome of a law drawn; a bell night with hens rising and settling) |
| Matrix frames (`info()`) | high tier 1440×900: 515-750 draw calls, 0.49-0.67 M triangles; low tier 320×568: 147 calls, 0.23 M (SwiftShader, not a GPU) |

**Not met / not verified:** the gate asks that the laws "look like premium real-time gameplay": by my reading of these frames they do
not (a daylight diorama, not the dusk standard; hens drawn about twice life size; no human has judged it). Frame times on real
hardware are UNVERIFIED. Both are carried by the 3D plan's stages 1-9.

## 2026-10-28 — Phase 09: imagine → persuade → manifest → consequences (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done** (reference: [`BELIEF_TO_REALITY.md`](BELIEF_TO_REALITY.md))

- **V1's 3D work merged** (V1 `main` at `22b7b1c`: JaredVogler2/BeliefEngine#2 and JaredVogler2/BeliefEngine#3): immersive HUD,
  end-of-run scene, finishing chain, 3D browser projects and CI job. Conflicts resolved as planned (V2's docs kept, V1's copies in
  `docs/v1/`); V2's specs updated for the new HUD (the selection card, the sheet opened on request).
- **Preview of the whole chain** (`reality/preview.ts`, composer): per clause target and count now, reach, duration, catalyst and
  whether it could act tonight; support from how many voters; upkeep; side effects only as the engine plays them; who may push back.
- **Honest side effects**: operator downsides corrected; cooler flames now cool the hearths (V1 cold) and lower fire-kept flood wards.
- **Fixes the chain exposed**: river-commons effects did nothing (keyed to `river`); district protections summed per target;
  forecast and evacuations ignored written beliefs (now `reality/project.ts`); stones never lay within reach of a lantern; "the
  orchard" read as fields without saying so.
- **Lifted strays fly home** over the river on a still night; WATER_POOLED and CHICKENS_ROSE name the law that caused them.
- **Provenance** of each written belief from the log, in the debrief and the law ledger.
- **Drawn**: coops, hens, stones and the raised bank on the classic map and in the 3D world (`render/reality2d.ts`,
  `render3d/reality.ts`); both expose `realityInfo()` for tests.
- A generated village can be started as a Generative Reality run from the reality tab.

**Proof chains** (recorded by `scripts/record-bridge.ts`, real persuasion, replayed by hash):

| Chain | Result |
|---|---|
| A, Redbank seed 2 | law day 6; 22 hens saved on two flood nights; complete loss (4 drowned) |
| A told once (control) | never law; bell rung daily; every hen drowned |
| B, Redbank seed 3 | law day 6; stones made light, one carried; 3 bank tiles raised for good |
| C, generated village x1.2 (Eastbank) | law day 9; river one step lower, 7 tiles pooled, fire cut, hearths cooled; a skeptic's demand went unanswered |
| Win, Redbank seed 1 | victory by the Fire Wall; the written belief spread but never became law |

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 48 files, **576 passed** (27 in `belief-bridge.test.ts`) |
| `npx playwright test tests/e2e/v2-bridge.spec.ts --project=desktop --project=phone` | **7 passed** (five full chains on desktop; the preview on both), 5 skipped by design |
| `npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop-3d --project=phone-3d` | **7 passed**, 3 skipped (slow or other-profile tests); the hens a law saved and the raised bank drawn in 3D |
| V2 browser specs (`v2-reality`, `v2-minds`, `v2-online`, `v2-bridge`) on desktop and phone | 26 passed, 12 skipped by design |
| After the merge: classic suite (desktop, phone) | **160 passed**, 60 skipped by design |
| After the merge: 3D suites (desktop-3d, phone-3d) | 39 passed; the 2 failures were V2's own spec expecting the old side panel, fixed and re-run green |
| `npm run build`, `npm run size` | entry 285 KB gzip (budget 300), 3D chunk 212 KB (270), composer 25 KB (40), mind panel 3 KB (20) |

**Mock vs LIVE:** no model has been called. A model-proposed reading (scripted) replays to the same hash with the network switched
off (unit test); live interpretation is **LIVE UNVERIFIED**.

## 2026-10-28 — Phase 08: social dynamics that change outcomes (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done** (reference: [`MINDS.md`](MINDS.md) §6)

- Influence journal (`src/engine/mind/journal.ts`) and cause chains; Log tab "who influenced whom" with "how it happened".
- Faction leanings in the policy (empiricists, storykeepers, council, hearth).
- `request_test`: skeptics and empiricists demand to see a story shown; met, failed or lapsed, each with its consequence; open
  demands shown with a button to the place.
- Competing claims villagers write (`claims.ts`): the opposite of a story a leader doubts, in the reality language, through
  `buildRealityClaim`; announced a day ahead, withdrawn if the author changes their mind, one per faction per run, three days apart,
  not counted against the player's allowance; both stories crowd each other out (V2 only).
- Lies with a family motive, flagged by the engine, discovered by witnesses (trust −20, rebuttal).
- Social energy: deliberate arguing replaces that villager's broadcast in the night's gossip; small extra for a retelling.
- Player inspection: beliefs beside how they are known; a law's firm believers who saw it themselves.
- Fixes the measurements found: (1) moments from daytime events (the Keeper's words, demonstrations) never queued anyone: day and
  night memories now both feed the next day's queue; (2) **hens' eggs made Harvest unlosable** (one food per five hens every dawn
  cancelled the chapter's grain deficit; doing nothing won 10/10): eggs now feed the household that keeps the coop (less hunger),
  every third dawn, never the granary; (3) villagers' moves were almost all pro-story and nobody challenged: skeptics may now
  challenge unshown stories, and arguing spends the night's gossip.

**Win rates, strategy bots, seeds 1-10** (`runPolicy`, same seeds, Classic vs V2 Generative Reality runs with minds):

| Chapter | Strategy | Classic | V2 |
|---|---|---|---|
| Redbank | do nothing | 0/10 | 0/10 |
| Redbank | Fire Wall | 9/10 | 9/10 |
| Redbank | Witness Bridge | 10/10 | 10/10 |
| Harvest | do nothing | 0/10 | 0/10 |
| Harvest | Moonlight | 4/10 | 9/10 |
| Harvest | Caravans | 10/10 | 10/10 |
| Ashwood | do nothing | 0/10 | 0/10 |
| Ashwood | Smoke Ring | 8/10 | 6/10 |
| Ashwood | Decoy | 4/10 | 8/10 |

With minds removed, V2 matches Classic exactly on these strategies (ablation). The social layer brings some laws a day earlier in
chapters that turn on a single day (Harvest: Moonlight forming on day 5 instead of 6 means one more harvest), and costs Smoke Ring
some of its edge. This is the phase's intended effect (social dynamics change results), but it is a balance change to the V2
chapters; phase 11 (generative gameplay and balance) owns re-tuning them. Classic is unchanged.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 46 files, **541 passed** |
| `npx vitest run tests/unit/social-dynamics.test.ts` | 17 passed: journal and chains; paired proof demand (same seed and story, shown vs ignored: different, explainable outcomes); faction leanings; competing claims made, withdrawn, capped, contestable, not counted against the player; lies only with a motive, discovered by witnesses; a fallen bridge cuts who can be reached; requests never carry others' memories; bounded thinkers per day; 100 villagers and 30 laws within budget; chapters still winnable and losable; exact replay |
| `npx playwright test tests/e2e/v2-minds.spec.ts --project=desktop --project=phone` | **8 passed, 2 skipped** (online tests on desktop only) |
| `npm run build`, `npm run size` | entry 276 KB gzip (budget 300), mind panel 4 KB (20) |

**Mock vs LIVE:** no model has been called. The gate's "one real provider run makes faction behaviour observably different from
the deterministic fallback" is **LIVE UNVERIFIED**.

## 2026-10-28 — Phase 07: villager minds, decisions and conversation (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done** (reference: [`MINDS.md`](MINDS.md))

- **Minds** for every villager of a V2 run (`s.v2.minds`; Classic has none): personality from V1 traits, archetype and seed
  (bounded, drifting at most 15 after major events); goals from household, work and character.
- **Memories** captured twice a day from the engine's own log, each with its event id, seen or heard and from whom, credibility,
  salience, valence and privacy: what a villager saw within sight, was told, lost, or heard their law decided. Bounded (24 kept,
  older minor ones folded into summary lines that keep their sources); memories that judge a story are never dropped.
- **Decisions**: each night the strongest moments queue at most four villagers; each picks one legal move at dusk (spread,
  persuade, challenge, ask, investigate, comfort, stage evidence, and in a flood leaving early or taking in a neighbour); effects
  only through V1's persuasion and evidence rules. The game's own deterministic policy decides offline.
- **Model path** (`npc v2`): the engine builds the request (only what each thinker knows); the server checks the answer against
  the request; `NPC_DECIDE` checks it against the live run, bound to the run revision, with a per-run allowance; refused or stale
  proposals fall back to the policy. Recorded, so replays never call a model.
- **Conversation** (`TALK`): ask, argue for (1 Influence), challenge (1 Influence) or ask what they make of things; answers come
  only from the villager's own memories; a model may voice them (checked against those memories), never decide what changes.
- **UI**: a lazy mind panel in the villager card (traits, goals, memories with "saw it" / "heard from …", what they did at the
  last dusk, the conversation, its own online opt-in) and a "who is thinking today" section in the village panel with an opt-in
  "let them decide now".
- Fixes found on the way: asking about a story no longer plants it; evacuation reads early moves and offered floors (V2 only).
- Bundle: the entry budget was raised from 260 to 300 KB gzip (the V2 engine is part of the deterministic core; measured 266 KB
  before the mind panel moved to its own 3 KB chunk; now 270 KB including small shared chunks). The script says why and how to
  split it later.

**Tests and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 45 files, **524 passed** |
| `npx vitest run tests/unit/mind-*.test.ts tests/unit/ai-npc-v2.test.ts` | memories and provenance, bounds, drift, saves; queue limits, legal moves, effects, refusals, stale requests, allowance, replay with recorded model decisions, six villagers choosing differently on the same story and evidence, flood choices, cost; conversation answers and knowledge limits, costs, effects, model lines checked; npc v2 requests from real runs always match the contract, simulated answers legal, 50+ forged answers refused |
| `npx playwright test tests/e2e/v2-minds.spec.ts tests/e2e/v2-reality.spec.ts --project=desktop --project=phone` | **13 passed, 3 skipped** (online tests run on desktop only by design) |
| `npm run build`, `npm run size` | entry 270 KB gzip (budget 300), mind panel 3 KB (20), reality composer 23 KB (40), 3D 193 KB (270) |

**Mock vs LIVE:** every model-facing test used a scripted provider standing in for a model: **TESTED MOCK ONLY**. The phase gate's
"six named villagers make legal model-backed decisions under a real configured provider" is **LIVE UNVERIFIED**; latency, tokens,
cost and a fallback-versus-model comparison are not measured.

## 2026-10-27 — Phase 05: reading any sentence, the model contract and the composer (VERIFIED offline and with mocks; LIVE UNVERIFIED)

**What was done**

- **Offline reader v2** (`src/engine/reality/read.ts`, data-only `lexicon.ts`): any sentence → the four answers a model must also
  give (supported / partial / ambiguous / unsupported), with the words each part came from; instructions and markup are removed
  and reported; every candidate is validated and built against the actual village, choosing a region where it can act.
- **`interpret v2`** (`server/ai/tasks/interpret-v2.ts`, `POST /api/interpret-reality`, `api/interpret-reality.ts`): the browser
  names the village (scenario id and seed) and the server rebuilds it itself; the model's schema is generated from the operator
  registry; the server fills in provenance, validates, builds, moves a reading to a region where it can act, and drops readings that
  act on something the sentence never mentions or are powered by something it never names (`fidelity.ts`). Same allowance, lease,
  reservation and fail-closed path as v1; a cache of model outputs re-checked on every read. The demo provider is the offline reader.
- **Browser**: `aiClient.interpretReality` (rebuilds every reading against the live run; `wire.ts`), a lazy **reality composer**
  (`RealityCompose.tsx`, its own 19 KB chunk) showing what the player said beside what the game will do, what is left out, needs,
  support, cost and confidence, with an explicit yes for partial or substitute readings and confirmation bound to the run revision;
  a **Generative Reality** tab on the mode screen (chapters, or Reality Lab, unranked); `V2_FEATURES.generativeReality` on.
- Language and engine fixes found on the way: see the phase 05 checkpoint commit; the preview sentences now agree in number and name
  regions ("rain in The Redbank is called onto Eastbank").
- **Integration test** (`tests/unit/reality-integration.test.ts`): three sentences written for the test (in no corpus) per village,
  in Redbank and Harvest, read offline, written through `COMPOSE`, believed (white-box social shortcut) and played 7 nights against a
  control on the same seed. Each reads as a different mechanic and leaves a different, measured world: hens rise and more of the
  flock lives; rain called onto Eastbank pools there and more homes stand; the river turned from the bridge leaves the bridge
  standing where the control's collapses; wheat ripens and is harvested that the control never ripens; rain called onto the valley
  keeps its fields from parching; tireless farmhands add a little growth (less than the wheat belief) and no water. Eight distinct
  state hashes.
- What that test found and fixed: (1) water a belief turned from the bridge never reached the bridge (bank shields skip river tiles;
  the stamp was also centred on the bell tower, not the bridge the sentence named): positional effects now measure from the named
  landmark, and a new optional `bridgeFlow` modifier changes the river level the bridge takes (V1 arithmetic unchanged when absent);
  (2) "work without tiring" logged an effect but changed nothing unless a moonlight law was draining workers: diligence now makes the
  fields its believers work give a little more, says when it found nothing it could change, and is refused where nobody works
  fields; (3) the reader offered readings the village could not hold as "understood": it now refuses them with the reason
  (`not_here`); one in-sample label that expected such a reading was corrected; (4) logs named "the source" instead of the place.

**Corpus results.** In-sample (`reality-corpus-1`, the reader was tuned on it): 172/172 labels. **First held-out**
(`reality-corpus-holdout-1`, 80 sentences written by a separate agent that never saw the reader, its lexicon or the in-sample corpus;
scored once, before any change it could inform): labels **42/80 (52.5%)**; supported sentences read faithfully **6/30 (20%)**;
impossible sentences refused 29/32, with an invented effect for **3/32**; partial readings naming what was left out 3/12; ambiguous
sentences offered a choice 0/6; injected instructions obeyed 0/3; readings that build in their village 24/25. The reader was then
improved against its misses by mechanism (reader `offline-v2.2`), so that corpus is **in-sample from then on** (now 78/80, a
regression floor only).

**Second held-out** (`reality-corpus-holdout-2`, 80 new sentences by another separate agent that read only the language reference,
the AST and operator code and the scenario files; never the reader, lexicon, earlier corpora or scorer), scored **once, untuned**,
against reader `offline-v2.2` before any change it could inform: labels **51/80 (63.8%)**; supported sentences read faithfully
**13/30 (43.3%)**; impossible sentences refused 28/32 with the reason named for 19/32, an invented effect for **1/32**; partial
readings naming what was left out 5/12; ambiguous sentences offered a choice **0/6**; two-clause sentences kept whole 2/5; injected
instructions obeyed **0/7**; readings that build in their village 29/31. This is the number to quote for the offline reader's
generalisation: better than the first measurement, still well short of reliable comprehension. It is honest about what it cannot do
(it refuses rather than invents) far more often than it understands an unfamiliar phrasing.

**Against V1** (the gate's "parsed more broadly than V1"): V1's offline composer (`nl/interpret.ts`), its claims carried into AST v2
by `astFromV1`, scored by the same scorer on the same sentences (`npm run reality:corpus -- --holdout2 --v1`): labels **34/80**,
supported sentences read faithfully **3/30**, invented effects 1/32, injections obeyed 0/7 (V1 names no v2 reason ids, so "reason
named" does not apply). The v2 reader reads four times as many unfamiliar sentences faithfully, mostly because V1's vocabulary has
no chickens, stones, light, temperature, motivation or status at all. A unit test keeps v2 above three times V1 on this corpus.

**Gate.** Novel sentences are read more broadly than V1 (above); unsupported meaning is acknowledged with the reason (holdout-2:
28/32 refused, 1 invented effect; every reading the reader offers now builds in its village); validated ASTs become executable
rules that change the world (integration test). "Actual model-provider evidence where configured": no provider is configured, so
the LIVE column is UNVERIFIED, not failed. Model accuracy, latency and token cost are **not measured**.

**Commands and results**

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 41 files, **475 passed** |
| `npx vitest run tests/unit/reality-integration.test.ts` | 10 passed (two villages × three new sentences, each against a control) |
| `npx vitest run tests/unit/ai-interpret-v2.test.ts tests/unit/ai-reality-client.test.ts` | 12 passed (schema, provenance, invented keys and numbers, fidelity, region move, refusals, timeout, shared allowance, cache poisoning) |
| `npm run reality:corpus` / `-- --holdout` / `-- --holdout2` | the tables above |
| `npm run build`, `npm run size` | entry 254 KB gzip (budget 260), reality composer chunk 23 KB (budget 40), 3D chunk 193 KB |
| `npx playwright test tests/e2e/{v2-online,inventor,v2-reality,modes}.spec.ts --project=desktop --project=phone` | **42 passed, 6 skipped** (skips are desktop-only or phone-only by design) |

**Mock vs LIVE:** every `interpret v2` test used a scripted provider or the offline reader as a stand-in: **TESTED MOCK ONLY**. No
model has been called; **LIVE: UNVERIFIED**; model accuracy is **not measured**.

---

## 2026-10-27 — Phases 04 and 06 (engine): the reality language and its night executor

**What was done**

- `src/engine/reality/` ([`REALITY_LANGUAGE.md`](REALITY_LANGUAGE.md)): AST v2 (`reality-1`) with literal text, author,
  provenance, regions, 1-2 clauses (3 in Reality Lab) of trigger + condition + selector + effect + duration, explicit omissions
  and narrative kept apart; a strict validator that never throws; mechanics and belief fingerprints. A world vocabulary built from
  what the simulation really holds (14 kinds marked simulated / logical, 10 absent concepts with reasons, 18 properties with units),
  19 operators (17 executable, 13 families) each with targets, typed ranges, tick order, cost weight, persistence, downside and a
  3D effect key. Balance on V1's power scale (a lantern flood belief costs 40 in both languages), grounding against the actual
  village, V1's pacing rule, a preview with units, needs, risks and omissions.
- The night executor runs only in runs with `s.v2`: triggers read tonight's inputs, selectors resolve to ≤40 targets in the law's
  region, effects become contributions combined per property, opposite pushes resolve by support (order independent), and results
  go into V1's `Modifiers` (plus optional fields absent in Classic) so V1's hazard code carries the consequences. Two new entity
  archetypes exist only in Generative Reality runs: **chickens** (coops, roosting, drowning, wolves, wind, eggs) and **loose
  stones** (mass, wetness, hauling that raises the riverbank for good, floating debris that batters the bridge).
- The three proof beliefs work on Redbank seed 1 against a control run: "Chickens fly when the bell rings" saves the flock that
  the control loses to the flood; "Wet stone becomes light beside lanterns" raises the bank; "At night, bell ringing pulls rain
  toward the orchard and makes local flames burn weaker" (compound) keeps 13 homes standing against the control's 7, at the cost
  of water pooled on the fields. Four runs, four different state hashes.
- `COMPOSE` rebuilds every reality claim from its AST and refuses a stale confirmation, a forged fingerprint or a classic run;
  saves re-verify reality claims on load; the action log replays a reality run exactly with no model.
- Every V1 rule has an AST v2 reading (`v1.ts`): all 11 authored claims and every combination V1's composer offers translate and
  validate; V1 laws keep running on V1's executor so old saves and replays reproduce bit for bit.
- A 172-sentence adversarial corpus (`tests/fixtures/reality-corpus-1.json`, 15 categories, 12 kinds) for phase 05's reader and
  model contract.
- **Found and fixed by the new loop test**: a belief anchored "near the bridge" but written for Eastbank fired an effect event
  while changing nothing (the bridge stands in the river commons), and grounding had accepted it. Anchors now resolve inside the
  law's region in every operator, grounding refuses per region (lanterns, smoke fires and `near` landmarks the region lacks), and
  a clause that changes nothing reports `REALITY_IDLE`.

**Commands and results** (this container: Node 22.22, redis-server 7.0.15)

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 37 files, **438 passed** (was 400: +20 language and bridge and corpus, +14 executor, +4 property and time tests) |
| `npx vitest run tests/unit/reality-properties.test.ts` | 4 passed: 1,500 seeded beliefs (875 valid, 206 built in Redbank, 669 refused with reasons) and 1,500 corrupted copies, no validator crash, every accepted belief within its bounds; a collapsing law stops acting and its raised bank stays; a flood-triggered law that draws more floodwater fires once a night and never compounds |
| `npm run build`, `npm run size` | pass; entry **251 KB gzip of a 260 KB budget** (was 231: the reality engine is in the entry chunk), 3D chunk 193 KB, CSS 6.3 KB |
| `npm run test:sim:smoke` | 256/256 runs, `SMOKE OK`, determinism 32/32 |
| V1 golden hashes (`tests/unit/v2-migration.test.ts`) | unchanged |

**Mock vs LIVE:** no model is involved in executing a validated AST. No model was called. **LIVE: UNVERIFIED** (unchanged).

**Known limits:** the corpus is checked for shape only until phase 05's reader is scored against it; the same author wrote both,
so its scores will measure regressions, not unbiased accuracy. Chickens and stones are not drawn in 3D yet, so phase 06 stays IN
PROGRESS. The entry bundle has 9 KB gzip of headroom left: phase 05 loads the reader and composer lazily.

---

## 2026-10-27 — Phase 03: the inference service, safe with no credentials

**What was done**

- Checked the current APIs before writing code: `ai@7.0.155` (latest; `generateText` + `Output.object`, `instructions` replaces the
  deprecated `system`), `@ai-sdk/gateway@4.0.128` (API key, else OIDC), the gateway budget and OIDC docs (updated 2026-09-08/10),
  and the public model catalog (496 models; defaults `anthropic/claude-haiku-5.5` $0.10/$0.50 and `anthropic/claude-sonnet-5.5`
  $2/$10 per million tokens). Recorded in [`AI_SETUP.md`](AI_SETUP.md) and [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md).
- Built `server/ai/` as one transport-free app behind five Vercel Functions in `api/`: `GET /api/ai-status`, `POST /api/session`
  (consent + allowed origin + per-network rate → HMAC-signed 2 h token), `POST /api/interpret-belief` (the V1 vocabulary contract;
  phase 05 adds v2), `POST /api/npc-decision` (validated against each villager's own moves, targets and memories),
  `GET /api/ai-metrics` (operator only). Durable store over the Upstash REST protocol with one atomic Lua reservation across
  session, network, project-call, token and dollar counters; worst-case cost reserved before a call and settled after; **fail
  closed** on any store error; validated-only cache re-validated on read; metering with no text, session, address or key.
- **Found and fixed a deployment defect before deploying**: Vercel's builder keeps `.ts` import paths (verified with
  `vercel build` 65.4.0 offline), so functions importing `../server/*.ts` crash with `ERR_MODULE_NOT_FOUND`;
  `rewriteRelativeImportExtensions` fixes it, and `tests/unit/ai-functions.test.ts` (mutation-checked) keeps it fixed. The SPA
  rewrite now leaves `/api/` to the functions (audit hole H12).
- Browser: `src/ai/client.ts` (same-origin, token in memory only, nothing sent until the player opts in) replaced V1's
  `src/ui/interpreter.ts` and its build-time `VITE_INTERPRETER_URL`; the composer gained a consent notice (what leaves the device,
  who pays, offline always works) and labels every online reading with its source, "simulated (no model)" for the scripted
  provider. `V2_FEATURES.serverInference` is now on (an offer, not a default). V1's in-memory proxy was removed.
- Local simulator `npm run dev:api` (same app; scripted provider with `BE_AI_DEV_PROVIDER=mock`); `npm run ai:smoke` for the LIVE
  test (refuses and exits 2 without a credential); `.env.example` with names only; CI now installs `redis-server` and requires
  the real-Redis tests.

**Commands and results** (this container: Node 22.22, redis-server 7.0.15, Chromium 1243)

| Command | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | pass |
| `BE_REQUIRE_REDIS=1 npm test` | 34 files, **400 passed** (was 364: +47 inference tests in five new files, +2 secret guards, the 14 V1 proxy tests removed with the proxy, the 4 V1 client tests rewritten as 5) |
| `npx vitest run tests/unit/ai-store.test.ts` | 8 passed, incl. 100 racing reservations from 4 clients on real Redis → exactly 10 admitted, counters exact |
| `npx vitest run tests/unit/ai-app.test.ts` | 22 passed, incl. 100 simultaneous requests through 4 app instances sharing one store (memory and real Redis): provider calls = the per-network quota (60), never more |
| `npm run build`, `npm run size` | pass; entry 231 KB gzip (was 228), no credential name, gateway host or SDK code in the bundle |
| `npm run verify:hosting` | hosting configuration verified (CSP, headers, flows) |
| `npx playwright test tests/e2e/v2-online.spec.ts --project=desktop` | 4 passed (Classic makes no `/api` request; consent; simulated reading labelled; not configured; provider failure spends nothing) |
| `vercel build` (CLI 65.4.0, offline, scratch copy) | 5 functions (`nodejs24.x`) + static site; each built function imported and called with plain Node: `disabled` unconfigured, `quota_unavailable` with an unreachable store |
| `npm run ai:smoke` | `LIVE: UNVERIFIED` (no credential), exit 2, nothing called |
| `npx playwright test` (full) | **149 passed, 59 skipped, 0 failed** in 8.9 min (was 145/55: the 4 online-reading tests pass on desktop and skip on phone) |

**Mock vs LIVE:** every inference test used a scripted provider or the AI SDK's `MockLanguageModelV4`: **TESTED MOCK ONLY**. No model
has been called. **LIVE: UNVERIFIED.** No Vercel project exists for this repository: **NOT DEPLOYED.**

**Known limits:** no CAPTCHA/BotID (sessions are rate-limited per network; project-wide call and dollar caps bound the total); the
Upstash REST protocol is exercised through a local shim over real Redis, not against Upstash itself; costs in `COST_AND_QUOTAS.md` are
list-price arithmetic, not measurements.

---

## 2026-10-27 — Phases 01 and 02: V1 audited, imported and verified

**What was done**

- Audited V1 `main@6a92862` (its CI run on that commit: success) with four read-only code audits and hand spot-checks of the
  claims the audit leans on; ran V1's whole baseline in a throw-away clone. Inspected V1's open
  [JaredVogler2/BeliefEngine#2](https://github.com/JaredVogler2/BeliefEngine/pull/2) (3D part 2, unmerged, still receiving commits) and
  left it for a later ordinary merge ([`V1_AUDIT.md`](V1_AUDIT.md) §16).
- Imported V1 with its 67-commit history as an unrelated-history merge (`a5c1c8a`); V1's prompts, README and build log relocated under
  `prompts/v1/` and `docs/v1/`; four raw tournament archives (444 KB) left out. Nothing was written to the V1 repository.
- Identity (`cc0389c`): package `belief-engine-v2` `2.0.0-alpha.0`, page title, a "V2" mark on the title screen; save, archive, catalog
  and MCP identifiers deliberately unchanged. Fixed V1's missing three.js attribution (licence inventory, `docs/ASSETS.md`, Credits).
- Added `src/v2/features.ts` (every V2 capability off), `tests/unit/v2-migration.test.ts` (pins the V1 golden values; mutation-checked)
  and `tests/e2e/v2-world3d.spec.ts` (the first browser tests that draw the Three.js world: V1's browser tests all ran on the 2D map).
- Wrote the V2 records: audit, migration, baseline, architecture, the 3D visual standard (from the owner's lantern-lit canyon
  reference and the Web-graphics standard), the 3D implementation plan and the 3D quality report with real captures.

**Commands and results** (full table in [`BASELINE.md`](BASELINE.md))

| Command | Result |
|---|---|
| `npm ci`, `npm run typecheck`, `npm run lint` | pass |
| `npm test` | 29 files, **364 passed** (V1: 356) |
| `npm run build`, `npm run size` | pass; 228 / 193 / 6.2 KB gzip within budgets |
| `npm run test:sim:smoke` | 256/256, `SMOKE OK`, output identical to V1's |
| `npm run replay:example` (both routes) | identical hashes |
| `npm run mcp:demo`, `npm run acceptance:mcp`, `scripts/nl-demo.ts` | identical to V1; Journey B 28/28 |
| `npx playwright test` | see [`BASELINE.md`](BASELINE.md) |
| `BE_SLOW_3D=1 npx playwright test tests/e2e/v2-world3d.spec.ts --project=desktop` | 3 passed (incl. the two-day route clicked in 3D: identical hashes), 1 skipped (phone-only test), 7.7 min |

**Mock vs LIVE:** no model was called. V1's mocked-provider tests (`nl-llm` 19, `nl-online-client` 4) pass: TESTED MOCK ONLY.

**Found and recorded, not fixed** (they are V1 behaviour, and the baseline must equal V1): defects D1-D13 in
[`V1_AUDIT.md`](V1_AUDIT.md) §12, among them Settings → "Restart this seed" dropping the run's mode, the archive dropping the Inventor
mark, payload-blind MCP idempotency keys, and a 3D world that does not draw wolf packs, live fire, smoke, the lens or the forecast.
