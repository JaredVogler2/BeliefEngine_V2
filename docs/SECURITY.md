# Security

Phase 15 ([`prompts/15_SECURITY_PRIVACY_COST_AND_FAILURE.md`](../prompts/15_SECURITY_PRIVACY_COST_AND_FAILURE.md)), building on
phase 03's inference service ([`AI_SETUP.md`](AI_SETUP.md)). Companions: [`PRIVACY.md`](PRIVACY.md),
[`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md), [`REPLAY_V2.md`](REPLAY_V2.md) (the ledger and save checks).

Status on 2026-10-28: every control below is **VERIFIED by tests with scripted providers** (and a real Redis 7 for the quota store).
**LIVE: UNVERIFIED** (no provider credential exists in this environment; no model was ever called). **NOT DEPLOYED.** Nothing here
claims a penetration test, an audit or real traffic.

## 1. Threat model

**What is protected.** The operator's money and credentials (gateway key or OIDC, the quota store token, the session-signing secret,
the operator token); the integrity of a run and its replay (the engine is the only authority over what happens); the player's words
and saves; and the availability of the game itself (Classic play must work with every online part down).

**Trust boundaries.** The browser runs the whole game and holds the run; the inference service (`api/*.ts` → `server/ai/app.ts`, Vercel
Functions) holds every credential and calls the Vercel AI Gateway; the MCP server (`mcp/`) runs locally over stdio for an agent. The
static site and the functions share an origin but nothing else: the browser bundle holds no key, no SDK, no server code.

**Untrusted inputs, all treated as data:** belief text the player writes; a model's readings, decisions and lines; villager
memories (they quote players and models); imported saves, replays and MCP run files; MCP tool arguments; request headers and bodies.

**Attacks considered:** prompt injection, system-prompt spoofing, fake tool calls, hidden code, Unicode/BiDi tricks, HTML injection,
memory poisoning, coercive instructions, infinite law loops, expensive repeated inference, cross-user session leakage, authentication
bypass, serverless concurrency races, CSRF/CORS, cached responses, smuggled content types, crafted saves, path traversal in run ids.

## 2. What a model can and cannot do

A model only **proposes**: a reading in the belief language, a villager's move from the list the engine offered, a line citing that
villager's own memories. It is never given tools, URLs, files or a shell, and nothing it writes is executed: there is no `eval`, no
`Function` constructor, no string timer, no raw HTML injection and no `document.write` in anything that ships
(`no-unsafe-code.test.ts`); effects are a closed list of operators the engine implements; there is no generated JavaScript, GLSL or
SQL anywhere. Every proposal passes the server's schema and vocabulary checks, then the browser's, then the engine's own rebuild at the
moment it is used (`COMPOSE` rebuilds the claim from its structure; `NPC_DECIDE` holds each decision to the live run). A model upgrade
cannot change a recorded law: replays use the recorded structure, never the model.

## 3. Attacks, controls and the tests that show them

| Attack | Control | Evidence |
|---|---|---|
| Prompt injection, "SYSTEM:" spoofing, coercive instructions | instructions are fixed and versioned; the sentence, memories and player message travel only as JSON string values; the reader strips instruction patterns and names them (`instruction`); the corpus holds 22 injection sentences | `ai-app` ("keeps fixed instructions however the sentence tries to inject"), `security-chaos` (instructions refused by name, state unchanged), `evals` (0 of 22 obeyed) |
| Fake tool calls, hidden code payloads, HTML injection | no tools exist; text is never executed or injected as HTML; React escapes everything; CSP `script-src 'self'`, `object-src 'none'`, `connect-src 'self'` (`vercel.json`) | `no-unsafe-code`, `security-chaos` (`{"tool":...}`, `<script>`) |
| Unicode tricks (BiDi overrides, zero-width, control characters) | NFKC normalisation and stripping before anything reads a sentence (`sanitizeText`), on the server and in the engine | `security-chaos` (five hostile strings, browser reader and MCP) |
| Memory poisoning | a villager decision may cite only that villager's own memory ids; lines are checked against them; memories are bounded (24 episodes, folded summaries) | `ai-app`, `ai-npc-v2`, `evals` (the judge catches an invented memory) |
| Poisoned cache | the cache holds only validated readings, keyed by prompt version, vocabulary version, model, normalised text and village; re-validated on every read and dropped if it fails | `ai-app`, `ai-interpret-v2` |
| Expensive repeated inference | cooldowns, one request in flight, per-session, per-network and project caps, worst-case reservation; repeats served from the cache | `ai-app`, `ai-monitor`, [`COST_AND_QUOTAS.md`](COST_AND_QUOTAS.md) |
| Authentication bypass | HMAC-SHA256 session tokens (2 h, scoped to `interpret` and/or `npc`) in an `Authorization` header; Origin is checked but is never the authorisation; forged, expired, other-secret and wrong-scope tokens refused | `ai-config-session`, `ai-app`, `security-chaos` (a reading-only session cannot ask for villager decisions; nothing reaches the provider) |
| CSRF, CORS | no cookies, so no ambient credential; JSON bodies only (a cross-site form post gets 415 after authentication); no `Access-Control-Allow-*` header on any answer | `security-chaos` |
| Cached or sniffed responses | every answer, success or refusal: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, JSON | `security-chaos` |
| Cross-user leakage | sessions are signed, not stored, and name no person; addresses kept only as HMACs; the shared cache answers only the exact same sentence in the same public village; logs and metrics hold counts only | `ai-app` (no key, token or sentence in any response or log line), `ai-monitor` |
| Serverless races and cold starts | one atomic Lua reservation over every counter; counters live only in the shared store | `ai-store` and `ai-app` (100 racing requests, 4 instances, memory and real Redis: never more calls than the quota); `security-chaos` (a brand-new instance honours the old one's sessions and spent cap) |
| Run ownership, revision and modality | the server holds no game state; a reading is bound to the run revision it was made against (`claim.reality.rev`) and villager decisions to theirs (`NPC_DECIDE.rev`); a stale one is refused (`STALE_REVISION`) and spends nothing; the ledger names a moved decision; session scopes separate reading from villager reasoning | `security-chaos`, `reality-execute`, `ledger`, `mcp-v2` |
| Double taps | writing the same belief twice charges once; telling the same person twice in a day is refused (`ALREADY_SPOKE`); one in-flight request per session | `security-chaos`, `ai-app` |
| Crafted saves, replays and run files | strict shape checks; numbers must be finite and in range; written beliefs rebuilt from their structure; ledgers checked by replay; **impossible entity counts refused before anything iterates** (logs over 50,000 events, more than 400 days, 200 villagers, more living hens than the cap, more hens than a flock a dawn could add, more stones or coops than a run makes) | `security-chaos`, `ledger-save`, `reality-execute` |
| Path traversal and odd ids (MCP) | run ids match a strict pattern (`BAD_RUN_ID`); tool arguments are schema-checked | `security-chaos`, `mcp-service`, `mcp-v2` |
| Secrets in the repository or the bundle | the secret scan (section 6); no `VITE_` provider variable; `.env*` ignored; the bundle checked for credential names | `scan-secrets`, `no-unsafe-code`, `npm run size` (`scripts/check-bundle.ts`) |

## 4. Physics and compute limits

Any rule, whoever wrote it, must fit these. The Reality Lab relaxes **balance** (clauses, reach, price); it never relaxes a compute
or security limit (`LAB_LIMITS.maxDepth === LIMITS.maxDepth`, and every cap below is a constant with no mode branch).

| Limit | Value | Where |
|---|---|---|
| Sentence | 1-240 characters, sanitised | `read.ts` `MAX_BELIEF_TEXT`, server `claimMaxChars` |
| Clauses per belief | 2 (Lab 3) | `ast.ts` `LIMITS` / `LAB_LIMITS` |
| Trigger nesting / combinator width | depth 2; AND/OR of 2-3 members | `validateRealityAst`; a 200-deep or 10,000-wide trigger is refused in under 50 ms |
| Reach | radius 4 tiles (Lab 6), inside the law's own region; "the whole world", "everywhere", "forever" are refused (`absolute`) | `ast.ts`, `lexicon.ts` |
| Targets per clause per night | 40 | `execute.ts` `MAX_TARGETS` |
| Entities | 24 living hens, 12 a coop, 12 stones, coops placed at creation; each chick costs one food; spawn counts clamp to the operator's bounds | `state.ts`, `entities.ts` |
| Beliefs per run | 5 | `TOO_MANY` |
| Chain reactions | triggers are read from the night's starting state: a law whose effect feeds its own trigger fires once a night and never compounds | `reality-properties` |
| Time | days pass one by one; time reversal, undoing and resurrection are refused (`time`, `the_dead`) | `lexicon.ts` |
| Resources | nothing endless (`infinite_resource`, `unbounded_spawn`); the game itself (influence, score, victory) is out of reach (`game`) | `lexicon.ts` |
| Units | amounts are the game's own steps; "5000 metres" or "minus five kilograms" is named and left out (`measure`), never silently used | `lexicon.ts`, `read.ts` |
| Memory | log compacted at 3,000 events; 24 episodes a villager; ledger at most 2,000 entries | `events.ts`, `mind/types.ts`, `ledger.ts` |

Measured on this machine (2026-10-28), well inside the budget the tests enforce (500 ms a night): the five beliefs a Lab run may
write (13 clauses) forced live every night, bell rung and every beacon lit, all five laws acting, 11-13 clauses a night: slowest night
**25-46 ms**; 20 active laws over a 100-villager village: under 150 ms a night (`reality-execute`). A spawn law forced live for a
whole chapter never keeps more hens alive than the caps allow, and the save it leaves (dead hens stay on the list) still loads.

## 5. Reliability chaos suite

Every failure ends in the offline reader or the villagers' own rules, with an explanation, and leaves influence unspent for anything
that was only a preview. Writing a belief is transactional (rebuilt and validated at write time) and idempotent (a repeat is refused,
charged once).

| Failure | Behaviour | Evidence |
|---|---|---|
| provider missing / not configured | `available: false` with the reason; paid routes refuse without calling | `ai-app`, `v2-online.spec.ts` |
| 429, 401/403, 402 budget, 404 bad model, 400 (including `no_providers_available` from privacy routing), 5xx, network error | classified, never echoed; offline fallback | `ai-sdk-provider`, `ai-app` |
| timeout / network partition | hard deadline (10 s / 15 s), no retries; the player can also stop a reading (`cancelled`) | `ai-sdk-provider`, `ai-reality-client`, `nl-online-client` |
| malformed structured output, schema drift, refusal | `malformed` / `refused` → offline fallback | `ai-sdk-provider`, `ai-app` |
| invalid model id | `bad_model`; priced at the worst case, so a typo can only over-reserve | `ai-sdk-provider`, `security-chaos` |
| over budget / over quota | refused before any call (429 with the reason); counted as a fallback in the monitor | `ai-app`, `ai-monitor` |
| poisoned cache | dropped on read | `ai-app` |
| quota store outage | fail closed (503), no call | `ai-app`, `ai-store` |
| double tap, concurrent stale request | one in flight; `STALE_REVISION`; charged once | `ai-app`, `security-chaos` |
| session expired or closed | 401; the client drops the session and reads offline | `nl-online-client` |
| deep nested AST, 10,000 entities, expensive compound rules | refused quickly / refused at load / bounded per night | `security-chaos` |
| everything online down | Classic and offline Generative play make no request at all | `v2-online.spec.ts`, `v2-bridge.spec.ts` (zero `/api` requests) |

## 6. Secrets

- Provider credentials live only in the server environment or come from Vercel OIDC; `server/ai/config.ts` is the only code that reads
  them. Never in prompts, `VITE_` variables, local storage, source or git. `.env.example` documents names only.
- **Secret scan** (`npm run scan:secrets`, `scripts/scan-secrets.ts`): eleven rules (private keys; AWS, GitHub, Anthropic, OpenAI,
  Google, Slack, Stripe tokens; JWTs; a credential name given a literal value; a `VITE_` variable naming a key, token or secret),
  plus a tracked env file and `.gitignore` coverage. It names file, line and rule, never the value. **CI runs it on every push**
  over every tracked file and every line added by every commit reachable from HEAD (`--history`, with a full-depth checkout), and
  over the built site (`--dist`, which also refuses any credential *name* in the bundle). A deliberate test fake carries
  `scan-secrets: fake` on its line; a value assigned in a fixture that says what it is ("test-...", "fake", "example") passes.
  Result at this commit: clean (every tracked file, every commit in the history, `dist/`).
- If a secret ever lands in git: rotate it first (history is never rewritten here), then remove it.

## 7. Configuration (security-relevant; names only)

1. `BE_SESSION_SECRET`: 32+ random characters (`openssl rand -base64 48`), different per environment.
2. `BE_ALLOWED_ORIGINS`: the exact deployment origin(s); nothing else may open sessions.
3. On Vercel, leave `AI_GATEWAY_API_KEY` unset and enable OIDC federation; locally, keep the key in an untracked `.env.local`.
4. The quota store (Upstash for Redis via the Vercel Marketplace sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`). The per-process
   memory store is refused on Vercel.
5. `BE_ADMIN_TOKEN` only if the metrics route is wanted (32+ characters); without it the route answers 404.
6. Keep the CSP and headers in `vercel.json` as they are; `npm run verify:hosting` serves the build with them in a real browser and fails on any CSP violation or missing header (it cannot prove Vercel applies the file: nothing is deployed).

## 8. Known limitations

- **No live verification**: every provider behaviour above is shown with the AI SDK's mock model or a scripted provider.
- **No bot check** on `/api/session`: anonymous sessions are rate-limited per network and bounded by project caps; add Vercel BotID
  (or Turnstile) before a public launch.
- **The game is client-side**: a player can edit their own run in their own browser. That changes only their game; saves and replays
  are checked on load, and the replay check says whether a run replays to its recorded end, but no server vouches for a score.
- The Upstash REST protocol is exercised through a local shim over real Redis, not against Upstash itself.
- Secret scanning is pattern-based: it catches credential-shaped values, not every possible secret.
