# Phase 15 — Adversarial security, privacy and cost-control engineering

## Threat model

Player-supplied belief text, generated NPC dialogue, imported replays, saved memories and external tool outputs are **untrusted**. Attacks include prompt injection, system prompt spoofing, fake tool calls, hidden code payloads, Unicode/BiDi tricks, HTML injection, memory poisoning, coercive adversarial instructions, infinite law loops, expensive repeated inference calls, cross-user session leakage, authentication bypass, and Vercel serverless process concurrency races.

The LLM must not browse arbitrary URLs, execute code, read files/secrets, or call infrastructure tools just because player writes a magic claim. Only known tools with validated schemas can be invoked; model utterances are inert text. No AI-created executable JS/GLSL/SQL.

## Strong isolation

- Separate public game runtime from inference service with private credentials.
- Securely authenticate service calls; Origin checking alone is insufficient; use session tokens signed server-side or user auth if exposed publicly.
- Bind requests to run ownership, revision and modality (interpret vs NPC reason).
- Enforce per-session, per-user/IP, model and project quotas using **atomic durable shared storage**, not V1 per-instance Maps. Fail closed on quota store failure.
- Gateway key/project hard spend budgets are an additional upstream last line, not replacement for application quotas.
- Limit max input characters, prompt tokens, generated output length, model requests per minute/day, concurrency, retries and response sizes.
- Avoid fanout of one chat statement to 20 per-villager LLM requests. Batch or salience-select agents.
- Deny unauthenticated costly calls; if using anonymous game, use CAPTCHA/turnstile or signed session capabilities/rate guarding appropriate to real threat level. Public demo usage must have a small hard budget.

## Secrets & cost reporting

Never log or return keys, credentials, private model headers or system secrets. No VITE_-prefixed AI keys. env.example documents names not values; .gitignore .env and secrets; scan CI commits for tokens and disallow. Vercel deployed OIDC may avoid manually supplying provider keys, but inference still bills. Implement live dashboard/dev monitor of model calls, input/output tokens, estimated per-model spend, cache hit %, quota counters, p95 latency, fallback counts and overall budget. Default to a modest capped spend; configure per-key/project budget in Vercel dashboard.

## User privacy

Opt-in to send written beliefs and relevant game context (NPC memory when required) to external provider; display what leaves device and purpose. Minimize payload to current turn and selected character's approved memory, not full unrelated history or user identifiers. Document provider retention/training considerations from current chosen routing settings rather than making universal promises. Save/delete/export locally; remote storage purpose, TTL and access controls clear. No telemetry or transcript logging without separate consent. No content in prompt echoes keys through error messages.

## Reliability chaos suite

Test with provider missing, 429, 401, timeouts, network partition, invalid model ID, malformed structured output, refusal, over-budget, poisoned cache, shared limit outage, user double-tap, concurrent stale request, session closed, deep nested AST, 10k entities and expensive compound rules. Provider failure cannot leave AP spent for a preview-only operation or break gameplay. On planned user confirmation, use transactional validation and idempotent write.

Rate limiting race: simulate 100 parallel requests from multiple fake instances sharing quota store, verify no bypass. Ensure Vercel serverless cold starts don't reset quota or game state. Test CORS/CSRF, input header, response caching private/public, unsupported content-type, authentication and run ownership.

## Physics limits

Any custom rule must fit AST depth, target count, recursion, spatial radius, execution time and memory budgets. Reject forced time reversal, arbitrary execution, huge entity spawns, infinite free resources, global object mutation, invalid physical units and runaway feedback. Sandbox exceptions may relax GAME BALANCE but NEVER compute/security limits.

## Exit

docs/SECURITY.md, docs/PRIVACY.md and docs/COST_AND_QUOTAS.md with explicit configuration steps, live/mocked evidence and known limitations. No endpoint that can incur provider charges exposed without robust controls. Classic/offline unaffected by outages.
