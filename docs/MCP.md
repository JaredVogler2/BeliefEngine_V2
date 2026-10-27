# Playing Belief Engine through MCP

The browser game is the main way to play. This is a second *controller* for the same game: a local [Model Context Protocol](https://modelcontextprotocol.io) server that lets an AI client (Claude Code, or any client that speaks MCP over stdio) play real runs with tools. It is not a second simulation: every action goes through the same `GameSession` and the same engine functions the browser uses, so the same seed and the same actions give the same state hashes in both.

## Browser, MCP, and where the model lives

| | Browser | MCP server |
|---|---|---|
| Who decides | you, with a mouse or fingers | the AI client connected to the server |
| What it is | static page, no backend | a local process on your machine (stdio) |
| Needs network or an API key | no | no (the *client* may, to reach its own model; the server never does) |
| Rules, costs, randomness | the engine | the same engine (no copy of any rule in `mcp/`) |
| Saves | your browser's storage | files in `~/.belief-engine/mcp` (or `BELIEF_ENGINE_HOME`), each re-verified by replay on load |

**MCP is a transport, not intelligence.** The protocol only carries tool calls and results between a client and a server. All of the "thinking" is done by whatever model the *client* runs; the server contains no model, makes no inference call and has no key to leak. The scripted demo agent (`npm run mcp:demo`) shows the server working with no model at all.

## Register it (verified commands)

Needs Node 22.12 or newer and `npm ci` once in the repository. These were run in this repository with Claude Code CLI 2.1.311; `claude mcp list` connects to the server and reports its health (logs: `docs/data/mcp/claude-cli-verification.txt`).

```bash
# from the repository root
claude mcp add belief-engine -- npx tsx mcp/server.ts
claude mcp list                      # belief-engine: ... - √ Connected

# from anywhere (absolute path; --silent matters: npm's own banner on stdout would corrupt the protocol stream)
claude mcp add belief-engine -- npm --prefix /absolute/path/to/BeliefEngine run --silent mcp
```

A project-scope configuration to copy is in `mcp/example-mcp.json` (the `.mcp.json` shape) and `mcp/example-absolute-path.json`. Claude Desktop and other clients use the same `command` / `args` / `env` fields in their own config files; **those were not tried here** (no Desktop app or other client in this environment), so treat them as "should work, unverified". The server speaks stdio only, with protocol revisions up to 2025-11-25 (the newest the current official SDK, 1.32.2, supports; negotiation is tested).

Then ask for a game, for example: *"Start a normal Flood at Redbank game. Inspect the bridgekeeper. Try to win without lighting beacons. Explain each day before acting."* (A real Claude Code session did exactly this; its transcript is below.)

Environment: `BELIEF_ENGINE_HOME` (where runs are kept; `:memory:` keeps none), `BELIEF_ENGINE_MAX_RUNS` (default 50), `BELIEF_ENGINE_DEBUG_TOOLS=1` (adds `debug_dump_state`, which shows private convictions; never enable it for an agent that should play fairly).

## What the server offers

Tools (every result has a one-line summary and machine-readable JSON; errors are `{ code, message, alternatives }` and change nothing):

| Tool | Does |
|---|---|
| `list_scenarios`, `create_game` | chapters and generated villages (`mode: "expedition"`), a run id and the briefing |
| `get_game_state` | day, Influence, objectives, tonight's forecast, laws, recent events; `detail: "full"` once |
| `inspect_map`, `inspect_villager`, `inspect_claim` | the grid, one person (private convictions are masked unless scouted or just spoken to), one story and its law |
| `list_actions`, `compare_possible_actions` | legal actions with costs; exact previews (the ones the browser shows), best conviction per Influence first |
| `take_action`, `end_day` | the only writes. `expectedRevision` rejects a stale plan, `idempotencyKey` makes a retry harmless (a retried `end_day` never advances two days) |
| `get_history`, `get_results` | causal events with `reason` and `cause` ids; the debrief after the run ends (`whatIf: true` after a defeat adds the last day a different plan could still have saved the village) |
| `retry_or_new_game`, `export_replay`, `export_game`, `import_game`, `grant_control`, `get_tutorial` | fresh runs, the exact action log, hand-offs with the browser, coach to delegate |
| `list_belief_examples` | **Inventor runs only.** The beliefs this village can host, each as a sentence `submit_belief` understands exactly, with whether it is already a built-in story. The composer matches a fixed vocabulary, so this is the quickest way to learn it |
| `submit_belief` | **Inventor runs only** (`create_game { inventor: true }`). Reads one sentence with the offline composer into up to three bounded interpretations (what each does here, what it needs, cost, risks, safety-check result) and a ten-minute confirmation token each. Free: changes nothing, no revision. A refused sentence returns the reason and nearby beliefs that can be modelled. On a normal run: `CAPABILITY_NOT_ENABLED` with how to start an Inventor run |
| `confirm_belief` | pays Influence and writes one interpretation (the same `COMPOSE` action as the browser; the belief is rebuilt from its structure and re-checked against the village as it is). Confirming a token twice answers the same, once. Coach-mode runs get `READ_ONLY`; use `expectedRevision`/`idempotencyKey` as for any write |

Resources: `belief-engine://rules` (what an agent may and may not see, how to play), `belief-engine://tool-guide`, and one mission/objective text per chapter. Prompts: *Play cautiously*, *Find an alternate winning strategy*, *Explain why I lost*. The prompts are conveniences; the tools, not the instructions, enforce every rule.

The morning report an agent receives from `end_day` (`story`: who the story reached, or why it stalled) is the same one the browser shows.

## Three ways to play together

* **Coach.** Import the browser's save (`import_game` with the file from Settings > Download this game), then the agent inspects and compares and *recommends*; you click in the browser. A coach run is read-only: `take_action` answers `READ_ONLY` until the human calls `grant_control`.
* **Delegate.** The agent plays its own run turn by turn (`controller: "delegate"`, the default).
* **Co-op.** Hand a run back and forth with `export_game` / `import_game`, each side acting only when it holds the run; read-only coaching is the default until you give control. **This is a hand-off, not a live shared session**: the browser's save lives in your browser and the server's runs live on your disk, and nothing connects them. A live shared session needs the remote mode below.

## What was verified

* `tests/unit/mcp-stdio.test.ts` — the real server process spoken to by the official SDK client over stdio: protocol negotiation, tools/resources/prompts, a whole chapter played to victory with the browser engine's exact state and event hashes, structured errors, restart persistence; plus a raw JSON-RPC probe with no SDK in the way (garbage input survives, unknown methods error, stdout stays pure JSON-RPC).
* `tests/unit/mcp-service.test.ts` — invalid, stale, duplicate and unaffordable calls change nothing; the Influence cap is the browser's; no hidden state in `get_game_state`; tampered run files are refused; coach mode is read-only; run ids are validated (no path traversal); at most 50 runs are kept; the server code imports no network or process-spawning module.
* `tests/unit/mcp-demo.test.ts` — `npm run mcp:demo` plays a chapter through the server and the exported action log replays in the engine to identical hashes.
* **A scripted agent** (`docs/data/mcp/demo-redbank-seed1.md`: a victory; `demo-redbank-seed7.md`: a defeat with the what-if analysis). It is heuristics over the server's previews, not a model; over seeds 1-8 it won 4. Each trace's action log replays identically in the engine.
* **A real Claude Code session** (`docs/data/mcp/claude-code-session-redbank-seed11.md`): `claude -p` with this server registered and only its tools allowed, given the prompt above. It read the rules resource, inspected the bridgekeeper, played 7 days with 23 accepted actions, passing a revision and a key on every write, answered the rival's announced move, and **lost** (10 of 14 survived, 12 were needed). The server's persisted run replays in the browser engine to the identical state and event hashes (`npx tsx mcp/verify-run.ts <run file>`). The loss is kept as it happened; the what-if analysis says a bridge vigil staged as proof on day 1, instead of three tellings, would have won.
* What it found about us: the agent could not name the rival rumour's id when challenging it (a bare "Unknown rumour" error). The error now lists the rumours that can be challenged, and `end_day` now returns the same morning report as the browser (`story`).

## Security and privacy

Local only: the server listens on no port and talks to no network. Run ids are unguessable but are **not** a security boundary; anyone who can run your server process can read your runs, which is why it is local-only. Tool inputs are validated (ids, types, ranges, sizes: imported saves are capped, responses are bounded, history is paginated); nothing is evaluated or executed; run files are written atomically and checked by replay when loaded, and carry the versions they were recorded under (rules, save schema, village generator, belief language, and a fingerprint of the opening state, which changes if any chapter content or rule table does): a run recorded under other versions is refused with `RUN_VERSION_MISMATCH` naming what differs, and the file is left alone, instead of being replayed into a different result. `export_replay` returns the same `versions` block. Villager names, wants and event text come from authored or generated content and are returned as data. Text typed by a *player* or an agent (`submit_belief`) is **data**: it goes only to the offline composer (a vocabulary match, no model, no network), never to a shell, a file path or an evaluator, is stripped of control and invisible characters, and is capped at 280 characters; the sentence becomes a validated structure, and the engine rebuilds everything from that structure when it is confirmed (`docs/NL_BELIEFS.md`). Confirmation tokens are random (16 bytes), live in memory for ten minutes, belong to one run, and are never written to disk. There is no analytics. Debug tooling is off unless you set an environment variable.

## Remote mode: not implemented, not verified

An authenticated Streamable HTTP endpoint (so an agent that does not share your machine could play, or a browser and an agent could share a live session) is **not built**. It needs more than this repository can honestly claim without deploying it: a durable store with compare-and-swap on the run revision (serverless memory is not a store), per-user authorization (signed scoped tokens or OAuth, origin checks; an unguessable id is not enough), rate limits and size bounds, and the transport shape of the current Streamable HTTP revision, which the newest official SDK available here (1.32.2, protocol revisions up to 2025-11-25) does not implement. The pieces that already exist and would carry over are the revision check, the idempotency keys, replay-verified persistence and the response bounds. Until then, use local stdio; do not expose `mcp/server.ts` on a network.

## Limits

Tested with the official SDK client and Claude Code; not with Claude Desktop, ChatGPT or other clients. `compare_possible_actions` ranks by conviction per Influence, a proxy: a law also needs the right people, proof and physical set-up. The scripted demo agent is not a language model. Natural-language beliefs are described in [`NL_BELIEFS.md`](NL_BELIEFS.md); two real Claude Code sessions wrote beliefs through these tools (`docs/data/nl/claude-code-inventor-session-*.md`).
