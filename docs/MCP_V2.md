# MCP in V2: Generative Reality through tools (phase 13)

V1's MCP server ([`MCP.md`](MCP.md): registration, the V1 tools, coach/delegate/co-op, security, the remote-mode decision) is kept
whole: every V1 tool name, argument and result still works, and Classic runs behave exactly as before. Phase 13 adds the V2 game to it.
It is still **a game interface, not a simulation of its own**: every write is a `GameSession` action the browser also performs, and the
same seed and actions give the same state hash in both (proved below for a whole Generative Reality run).

**MCP is not inference.** A client may run any model it likes; the server runs the deterministic engine and, by default, calls no model.
Villagers decide by the game's own rules (or, in the browser, through the game's own inference service when a player opts in).

## What is new

| Tool | Does |
|---|---|
| `create_game { variant }` | `classic` (default) \| `generative` (write beliefs of your own) \| `living` (villagers who remember and argue; no writing) \| `lab` (stronger beliefs, unranked). The variant is in every state view and kept by `retry_or_new_game` and `import_game`. Inventor stays a Classic option |
| `get_interpreter_status` | the offline reader (always) and whether online reading is available, on what provider, within which limits. No secrets |
| `propose_belief { text, region?, online? }` | any sentence → what the game can make of it **beside the words** (`said`, `willDo`), what it acts on and when, the support and firm believers it needs, upkeep, side effects, who may push back, what it leaves out, its cost, where it is proven, and a ten-minute token per buildable interpretation. Free: no Influence, no revision. Text is data. In a Classic Inventor run it is the Inventor composer (`submit_belief`) |
| `confirm_belief { token, acknowledge?, title? }` | writes the interpretation with the browser's `COMPOSE`. A token from an older revision is refused (`STALE_REVISION`; reading again is free); an interpretation marked `needsAcknowledgement` (it leaves part of the sentence out, or is a substitute) needs `acknowledge: true` (`UNSUPPORTED_EFFECT` otherwise), like the browser's checkbox |
| `speak_to_villager { villagerId, mode, claimId?, online? }` | the browser's conversation: ask (free), persuade or challenge (1 Influence, like a telling), or ask what they make of things. The engine decides what it changes; the words are the villager's own, or a model's line checked against their memories when online is asked for and offered. Recorded in the action |
| `stage_evidence { claimId, landmarkId? }` | proof at the belief's rite (the bell for a bell belief): the same `RITUAL` action, with tonight's omen for it |
| `inspect_object`, `inspect_region`, `get_social_graph`, `get_rule_explanation` | a landmark (or a coop, stone, hen), a region (people, laws, each written belief's support among its voters), the trust graph the browser shows (no convictions), and a rule's supported effects, what it cannot do, side effects, thresholds and provenance |
| `inspect_villager` | now adds the villager's mind as the browser card shows it (traits, goals, memories and how they know). Private convictions stay masked unless scouted or just spoken to |
| `export_replay` | now says how many accepted model proposals the action log carries (`modelProposals`): a written belief's structure, villagers' decisions and checked lines are inside the actions, so a replay needs no model |

**Errors** keep `{ code, message, alternatives }` and add `kind` and `errorsVersion: 2`. A client branches on `kind`; `code` is the
detail and may grow:

| kind | e.g. codes |
|---|---|
| `INVALID_CLAIM` | `TOKEN_INVALID`, `UNKNOWN_CLAIM`, `CLAIM_LOCKED`, `RIVAL_CLAIM` |
| `STALE_REVISION` | `STALE_REVISION` (an `expectedRevision` or a belief read at an older revision) |
| `OUT_OF_BUDGET` | `NO_INFLUENCE`; online `over_budget`, `over_quota`, `rate_limited`, `busy` |
| `LLM_UNAVAILABLE` | `LLM_UNAVAILABLE` (online required but off), `not_configured`, `provider_unavailable`, `timeout`, `bad_output`, ... |
| `UNSUPPORTED_EFFECT` | a partial or substitute reading confirmed without `acknowledge: true` |
| `NOT_AUTHORIZED` | `READ_ONLY` (coach mode), `CAPABILITY_NOT_ENABLED` (writing in a Living Village or a plain Classic run), `DEBUG_OFF` |
| `NOT_FOUND`, `INVALID_ARGUMENT`, `INVALID_STATE`, `ACTION_REFUSED`, `INTERNAL` | unknown ids; bad arguments; run over or no opening story; a rule of the game saying no (`ALREADY_SPOKE`, `NO_PATH`, ...); a bug |

## Online reading through MCP (off by default)

The server calls no model unless **the person who starts it** sets the same switch the game's inference service uses. Then the MCP
process runs that service in-process (`mcp/online.ts` → `server/ai/app.ts`: consent session, cooldowns, one request at a time, daily
call and spend reservations, a provider timeout, and the engine's validation of every answer) and talks to it with the browser's own
client. A tool argument can only *ask* for it (`online: "prefer"` falls back to the offline reader with a note; `"require"` fails with
`LLM_UNAVAILABLE`); it can never switch it on or carry a credential.

```bash
# the scripted stand-in: no model, no key (answers are labelled "mock")
BE_AI_ENABLED=1 BE_AI_DEV_PROVIDER=mock BE_AI_DEV_MEMORY_STORE=1 npm run mcp

# a real provider: names only, values stay in your environment or .env.local, never in an MCP config file or a prompt
#   BE_AI_ENABLED=1, AI_GATEWAY_API_KEY, BE_SESSION_SECRET (and a quota store: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN,
#   or BE_AI_DEV_MEMORY_STORE=1 for a single local process); optionally BE_AI_DAILY_BUDGET_USD. See AI_SETUP.md.
```

What it costs: whoever runs the server pays the provider. List-price estimates (not measured: no model has been called from this
repository) are in [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md): about $0.00014 for a fast reading and $0.0027 for an accurate one, with the
application's own daily cap ($1.00 by default) and per-session allowances enforced before any call.

## Example: a legal creative claim, from the words to the world

From [`data/mcp/v2-hens-session.md`](data/mcp/v2-hens-session.md) (generated by `npx tsx scripts/mcp-v2-session.ts`: the real server,
the official SDK client, **a script, not a model**):

```text
create_game { scenarioId: "redbank", seed: 2, variant: "generative" }
take_action PICK_STARTER river_fears_fire
propose_belief "Chickens fly when the bell rings."
  -> supported, a light belief, high confidence. willDo: "When the bell is rung: chickens in Eastbank rise up to 2 tiles into the air
     for the night (out of reach of water and wolves; ...)". Needs 55% of the 9 who vote on it in Eastbank and 3 firm believers;
     upkeep: ring the bell (1 Influence) on nights it should act; side effect: a windy lift carries hens across the river. Cost 1.
confirm_belief { token } -> written as reality_12f5310edc, 2 Influence left
take_action GATHER, SEED, MESSENGER on days 1-5 (13 actions)       -> day 5: LAW_AWAKENING (62% support)
two more messengers, then take_action RITUAL ring_bells             -> day 6: LAW_ACTIVATED; CHICKENS_ROSE: 22 rode out the water
day 7: four villagers drown (every Influence went to the hens)      -> get_results: Defeat, 10 of 14 remain
state hash 0ce7238943cc8d = the browser's recorded hash for the same chain
```

The loss is the point of that chain (the browser test plays the same one): a belief that saves the hens does not save the people.

## What was verified (TESTED MOCK ONLY for every online path)

| Test | Result |
|---|---|
| `tests/unit/mcp-v2-stdio.test.ts` (the real server process, the official SDK client over stdio) | **3 passed**: the V2 tools are advertised beside every V1 tool and online reading is off by default; a whole Generative Reality run (inspect → propose → confirm → persuasion → law → hens rising → ending → replay) ends on the browser's recorded state hash, with a stale revision, an unknown villager and a duplicated call along the way changing nothing; a coach-mode run refuses every write with `NOT_AUTHORIZED`; with the scripted stand-in switched on, `propose_belief { online: "require" }` is read by "the model" (labelled mock) |
| `tests/unit/mcp-v2.test.ts` (the service) | **14 passed**: variants and their records; the interpreter status; propose is free, confirm pays the advertised cost once, the replay reproduces the run; a stale token and an unacknowledged partial reading change nothing; who may write; an instruction to the game is data; online off/prefer/require; the mock reading and a mock villager line recorded in the replay; conversations (free and paid, Classic refused, coach read-only); staged proof with its omen; objects, regions, the graph and rule explanations, and hidden convictions staying hidden |
| the V1 MCP tests (`mcp-stdio`, `mcp-service`, `mcp-beliefs`, `mcp-demo`) | all pass unchanged |

Not verified: **a model-powered agent session** in V2 (V1's Claude Code session, [`MCP.md`](MCP.md), predates these tools; running
one needs a client with its own model access, which this phase did not use), and any **real provider** behind online reading
(LIVE UNVERIFIED). The registration commands in `MCP.md` were verified for V1 with Claude Code CLI; the entry point and transport
are unchanged, and the stdio tests start the server the same way (`node --import tsx mcp/server.ts`).

## Remote (Streamable HTTP): not built

Unchanged from [`MCP.md`](MCP.md): an authenticated, durable, shared remote session needs a store with compare-and-swap on the
revision, per-user authorization, origin checks and rate limits, none of which is deployed. Browser and MCP do **not** share a live
run; they hand runs over with `export_game` / `import_game`. Do not expose `mcp/server.ts` on a network.
