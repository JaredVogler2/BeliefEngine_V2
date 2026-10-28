# Replay, persistence and evaluations (phase 14)

A Generative Reality run is as reproducible as a Classic one: everything that did not come from the engine's own deterministic
rules is an **input**, recorded and validated in the action that used it, and a replay reads it back instead of asking anyone again.
This document is the reference for that record (the external-decision ledger), how saves carry it, what is checked when, the privacy
controls, and the evaluation corpus with its measured results.

## 1. What is recorded, and where

The run state already holds its complete action log: every accepted action of every finished day (`history`) and today's (`today`).
With the run's options (`optionsFromState`) that log replays to the identical state, Classic and V2 alike (checked for the Classic
traces and the four recorded V2 chains). So the inputs are inside the save already:

| Input | Carried by | What the engine used |
|---|---|---|
| a sentence read into a belief (offline reader or a model) | `COMPOSE` with the claim's AST (`source`: reader, model, prompt version, request id) | the structure, rebuilt and re-checked at write time |
| villagers' decisions a model proposed | `NPC_DECIDE` with `rev`, the decisions, `model`, `id` | each decision held to the live run (`validateChoice`) |
| a line a model voiced for a villager | `TALK` with `reply` (checked against their memories) | the line; the effect is the engine's |
| what the inference service reported about the call | `meta` on any of the three (provider, model, tier, prompt version, request id, latency, cache, cost, tokens) | nothing (cleaned to bounded fields before it is recorded) |

## 2. The external-decision ledger (`src/engine/save/ledger.ts`)

One entry per input, in order: a stable id, its position in the action log, the day and the run revision it was made against, its
kind (`interpretation`, `npc_decisions`, `dialogue`), what it targeted (claim or villagers), who produced it (reader, provider, model,
prompt version, request id), the versions it was validated under (ledger, rules, validator `reality-1/npc-2/talk-1`, belief
language), exactly what the engine used (`output`) with its canonical hash, a hash chain over the entries, a digest of the words a
belief was read from (the words themselves stay in the belief's own text, on the player's device), and the cleaned inference metadata.

- **Kept as play goes on** by `GameSession` (appended when an action carrying an input is accepted, taken back on undo), so saving
  never replays the run.
- **Derived** by replaying the action log (`deriveLedger`): deterministic, no network, no model, about 50-80 ms for a whole chapter here.
- **Checked** (`checkLedger`, `checkRun`): the log must replay without a refusal, reach the saved state's hash, and derive exactly the
  recorded entries. The first problem is named, never repaired: `LEDGER_MISSING`, `LEDGER_EXTRA`, `LEDGER_REORDERED`, `LEDGER_EDITED`
  (re-hashing an edited entry does not help: it is not what the run used), `LEDGER_VERSION` (validated under another validator or
  rules: "open it with the engine version that recorded it"), `REPLAY_DIVERGES` (the log is refused or ends elsewhere). Each comes
  with the recovery: nothing is re-asked of any model; the run can still be opened as saved (its state is validated on its own); only
  its replay is not vouched for.
- Decisions moved to another point of the run are refused by the engine itself (they were asked about another village: their `rev`
  no longer matches), and a belief read at an older revision is refused at write time; the ledger names it.
- A model upgrade cannot change a recorded law: replay uses the recorded structure, never the model, and the balance a run was made
  under is recorded with it (`s.v2.rules`).

## 3. Saves and files

- **Browser save** (`be:save:v1`): `{ format, schemaVersion, rulesVersion, state, ledger? }`. The ledger is written only when the run
  has inputs (a Classic run never does). An older save without one loads as before and gets its ledger derived from its own log on
  load; a malformed one refuses the save. No schema bump was needed (the state did not change), so older saves and older MCP run
  files keep loading. Measured: a whole V2 chapter is a 140-170 KB save, of which the ledger is about 2 KB; save → load → save is
  byte-stable.
- **Debrief replay check** ([`screenshots/v2-phase14/`](screenshots/v2-phase14/)): the run's own action log replayed on the device
  with no network and no model, compared with the run's end and its ledger: "Replays to the same end ... state 0272c5e8205376. From
  outside the rules: 1 belief read; none from a model." **Download the replay** gives `{ format: belief-engine-replay, options,
  actions, ledger, stateHash, eventHash }`.
- **Offline verifier**: `npx tsx scripts/verify-replay.ts <file>` checks a replay file, a save or an MCP `export_replay` result with
  the network switched off (exit 0 when it holds; the problem by name otherwise).
- **MCP run files** carry the ledger; loading replays the log, checks the hash and the ledger, and refuses a mismatch by name
  (`LEDGER_EDITED`, ...) leaving the file untouched; a file from before the ledger is accepted with its ledger derived.
  `export_replay` returns the ledger and a one-line summary.

## 4. Privacy

Settings > **Your data** says what is kept on the device (the run with what the player wrote and what villagers said, the Atlas,
settings), what online reading sends and what the server keeps (hashed usage counters and, for 7 days, validated readings of
sentences; nothing that names the player), and that a downloaded save or replay holds the whole run. **Delete this game** and
**Delete everything on this device** (every `be:*` key) are there, each behind a confirmation. Ledger metadata never holds a key, a
prompt or a raw model answer (`cleanMeta`, tested with a planted key). Classic play makes no network request (the Credits' privacy
line now says so precisely).

## 5. Evaluation (`npm run eval` → [`data/evals/REPORT.md`](data/evals/REPORT.md))

**LIVE: not run** (no provider configured). Every number is from the offline reader, the game's own policy, or a MOCK stand-in that
runs no model (it measures the online pipeline's plumbing, never a model's understanding).

| Corpus | What | Size |
|---|---|---|
| `reality-corpus-1`, `-holdout-1`, `-holdout-2` | labelled beliefs: supported, partial, ambiguous, unsupported (impossible requests, game requests), compounds, 22 injection sentences | **332** |
| `npc-cases-1` (generated, `scripts/lib/npc-cases.ts`) | villager decision cases from seeded runs: what a model would be told and the constraints an answer must meet | **211** |
| V1 corpora through `astFromV1` | V1 saved-belief migration | 130 beliefs |

Results (this machine, this commit): the offline reader gets 172/172, 78/80 and 51/80 labels (in-sample, once-held-out, untuned
held-out), reads 89/89, 30/30 and 13/30 supported sentences faithfully, abstains on 122 of 126 unsupported ones, invents an effect for
1 of 126, and obeys 0 of 22 injections; V1's composer through the bridge gets 80/172, 32/80 and 34/80. The MOCK pipeline matches the
offline reader within a sentence (the conversion keeps what the reader produced). V1 migration: 130/130 valid AST v2, 130 build.
Villagers: 211/211 policy decisions legal and citing only their own memories, and the same for the MOCK stand-in; no persona check
fired, with stated opportunity (a disbelieved story could be spread in 0 cases, a firmly held one challenged in 9, a skeptic spread
hearsay in 19), so those checks are there for a model's answers. Latency p50/p95 on this machine, over two runs (the second shared
it with the browser suite): offline reading 10-13 / 21-39 ms, MOCK pipeline 19-21 / 32-41 ms, a policy decision 0.2 / 1.5-2 ms. Tokens and cost are list-price estimates from measured prompt sizes (about 765 input tokens a reading,
2,500 a six-villager batch; $0.00015 a fast reading). Win diversity (phase 11, rules 2): 5, 5 and 6 of 9 policies win at least once.

## 6. Tests

`tests/unit/ledger.test.ts` (7: empty for Classic; a written belief is one entry; a scripted adversary's decisions recorded and
replayed; edited, missing, extra, reordered, differently validated and diverging records refused by name; metadata cleaned; the live
ledger equals the derived one, through undo; no state leaks between runs), `tests/unit/ledger-save.test.ts` (6: round trip; older
saves; malformed and edited ledgers; byte-stable reloads; MCP run files; the verifier script), `tests/unit/evals.test.ts` (3),
`tests/e2e/v2-bridge.spec.ts` (the debrief's replay check on a complete win and four losses, with zero `/api` requests),
`tests/e2e/v2-ux.spec.ts` (Your data). V1's golden hashes are unchanged.
