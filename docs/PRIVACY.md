# Privacy

Phase 15 ([`prompts/15_SECURITY_PRIVACY_COST_AND_FAILURE.md`](../prompts/15_SECURITY_PRIVACY_COST_AND_FAILURE.md)), with phase 14's
device controls ([`REPLAY_V2.md`](REPLAY_V2.md) section 4). Companions: [`SECURITY.md`](SECURITY.md),
[`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md).

Status on 2026-10-28: the behaviour below is **VERIFIED by tests** (unit and browser) with scripted providers. **LIVE: UNVERIFIED**
and **NOT DEPLOYED**: no real provider has received anything from this game. What a provider does with data is described from its
published policies as routed by this code, not promised.

## 1. The short version

- **Classic play sends nothing.** No request, no cookie, no analytics, no telemetry (`v2-online.spec.ts`, `v2-bridge.spec.ts`: zero
  `/api` requests).
- **Generative play is offline by default.** The offline reader and the villagers' own rules do everything. Online reading and
  villager reasoning start only when the player opens them and accepts a notice that says what leaves the device and who pays; the
  player can turn them off at any time.
- **What is sent is the current turn,** never the save, never the player's identity, never other villagers' private lives.
- **The server keeps no transcript** and nothing that names a person.

## 2. What leaves the device, and why

| Feature (after the player accepts its notice) | What is sent | Purpose |
|---|---|---|
| Reading a belief (Generative composer) | the sentence; which village it is (scenario and seed); the region picked, if any; the day; a hashed run reference and its revision | to read the sentence into the belief language; the engine then checks the reading itself |
| Reading a belief (Inventor composer) | the sentence; the vocabulary version; the names of this village's places and features; a hashed run reference | the same, for the V1 belief vocabulary |
| Villager decisions | for each villager due to think (at most six, chosen by salience): their name, role, faction, traits, up to 4 goals, their 6 strongest beliefs, 8 closest ties, the 8 memories most relevant now (each clipped to 160 characters), the moment, the moves open to them; plus the names of the living villagers and the stories in play | to propose each villager's move from the engine's own list |
| A conversation | that villager's memories, beliefs and ties, the stories they know, and what the player asks | to voice that villager's answer, citing only their own memories |

Not sent: the save, the action log, other villagers' memories, the Atlas, settings, any account or device identifier. The session
token lives in page memory only (never local storage). Tests: `nl-online-client.test.ts` and `ai-reality-client.test.ts` (exactly
what each request carries; nothing before consent), `ai-npc-v2.test.ts` (requests carry only what each villager knows).

## 3. Who receives it

The player's browser → this game's own server (a Vercel Function on the same origin) → the **Vercel AI Gateway** → a model provider
chosen by the gateway for the configured model (defaults `anthropic/claude-haiku-5.5` and `anthropic/claude-sonnet-5.5`, which the
gateway can serve through Anthropic, Amazon Bedrock or Google Vertex AI).

Routing this code asks for on **every** call (`gatewayRouting` in `server/ai/sdk-provider.ts`; `ai-sdk-provider.test.ts` checks the
request):

- **No prompt training: always on.** `disallowPromptTraining: true`: the gateway routes only to providers that do not train on what
  they are sent, or refuses the call (then the player gets the offline reader). Available on every Vercel plan at no extra cost
  ([docs](https://vercel.com/docs/ai-gateway/security-and-compliance/disallow-prompt-training), updated 2026-09-10, read 2026-10-28).
- **Zero data retention: on when `BE_AI_ZERO_RETENTION=1`.** `zeroDataRetention: true`: only providers with zero-data-retention
  agreements with the gateway, or the call is refused. Per-request ZDR is available on Vercel **Pro and Enterprise** at no extra cost
  per request; team-wide ZDR (dashboard) costs $0.10 per 1,000 requests
  ([docs](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr), updated 2026-09-22, read 2026-10-28). Those docs list
  Anthropic, Bedrock and Vertex as ZDR providers and exclude no model this game uses by default. **With it off, how long a provider
  keeps a request is that provider's own policy** (abuse monitoring, for example); the game does not promise otherwise.
- The gateway itself states it does not retain prompts or outputs (same ZDR page).

`GET /api/ai-status` reports the routing in force (`routing: { noPromptTraining, zeroDataRetention }`) and says it in its privacy
note; the consent notice says that providers that train on requests are not used.

## 4. What the server keeps

| Kept | For how long | What it contains |
|---|---|---|
| Usage counters (quotas, spend, leases, cooldowns) | until their window ends (seconds for cooldowns and leases, an hour for new sessions, the UTC day for quotas and spend) | keys built from a random session id and **HMACs** of network addresses; numbers only |
| Validated readings of sentences (so a repeat costs nothing) | 7 days | the validated reading (which can quote words of the sentence) under a hash of the prompt version, model, sentence and village; nothing links it to a session or an address |
| Daily metrics | 9 days | counts by route and outcome, tokens, micro-dollars, latency buckets, model ids |
| Logs | the platform's log retention | one line per call: route, outcome, tier, model, token counts, milliseconds, micro-dollars; never a sentence, memory, session, address or key (`ai-app.test.ts`) |

There is no account, no user table, no transcript store and no analytics. Errors never echo a key, a prompt or a provider's message
(`ai-sdk-provider.test.ts`, `ai-app.test.ts`).

## 5. On the device

Local storage (`be:save:v1`, `be:settings:v1`, `be:progress:v1`, `be:progress:v2`, `be:seen:v1`) holds the run (with every belief the
player wrote and what villagers said), the Atlas and settings. Settings → **Your data** says this, and offers **Delete this game** and
**Delete everything on this device** (every `be:*` key), each behind a confirmation (`v2-ux.spec.ts`). **Download the save** and
**Download the replay** export the whole run, including what the player wrote; the ledger inside never holds a key, a prompt or a raw
model answer (`cleanMeta`, `ledger.test.ts`).

The local MCP server keeps its runs as files under `~/.belief-engine/mcp/runs/` (or under `BELIEF_ENGINE_HOME`; `:memory:` keeps
nothing) on the machine that runs it; it reads online only if started with `BE_AI_ENABLED=1`.

## 6. Configuration (names only)

1. `BE_AI_ZERO_RETENTION=1` on a Pro or Enterprise plan (or team-wide ZDR in the AI Gateway dashboard → Settings).
2. Choose model ids that have zero-data-retention providers when ZDR is on (otherwise every call is refused and the game reads
   offline: safe, but useless).
3. Keep `BE_ALLOWED_ORIGINS` exact so only this game's pages can open sessions.
4. Do not add analytics, error reporting that captures request bodies, or log drains that capture them without a separate consent.

## 7. Known limitations

- Retention by a provider when zero data retention is off is governed by that provider's policy, not by this code.
- A cached reading cannot be deleted on request before its 7 days, because nothing ties it to the person who wrote it.
- A downloaded save or replay is a file the player controls; the game cannot recall it.
- The privacy routing has been checked in the request the code builds (mock model), not against the live gateway.
