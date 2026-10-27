# Phase 03 — Connect a genuine LLM securely, predictably and affordably

## Product goal

Build working, opt-in server-side inference supporting an open-ended semantic interpreter and NPC cognition. The existing V1 server/interpreter.ts is a useful proof-of-architecture, NOT a production deployment: it is mocked-only and its in-memory limits are non-global on serverless. Do not simply set its API key and call V2 done.

## Credential choices

Recommended: Vercel AI SDK (verify installed/current major and type signatures) + Vercel AI Gateway with OIDC for Vercel-hosted functions. Use a gateway API key in ignored .env.local for local development; optionally direct provider with its own server-only key. The user does NOT need to give keys to Claude chat or GitHub. OIDC may avoid a manually supplied provider key on Vercel, but inference remains metered and billing/configuration must be authorized. Claude Code Max subscription is not deployed-app token authorization.

Read current official docs: https://vercel.com/docs/ai-gateway/authentication-and-byok and https://ai-sdk.dev/docs . Verify currently available model IDs and rates from model catalog. Select a fast low-cost model for simple conversions/dialogue and a higher-accuracy model for difficult multi-clause interpretations; benchmark quality/cost. Never assume hardcoded old model IDs.

## Architecture

Create Vercel-compatible authenticated server endpoints:
- POST /api/interpret-belief: bounded claim/context, structured candidate + unsupported/clarify decisions.
- POST /api/npc-decision: authorized run/citizen snapshot of minimal safe data, return action intentions and dialogue.
- Optional POST /api/npc-dialogue for direct player-to-villager chat; no duplicate game-state authority.
- GET /api/ai-status: safe capability/model-tier/budget-available info; never disclose API key or user-specific spend.

Use schemas for every request/response; model output is untrusted. Content-type, Origin, CSRF/auth strategy and size limits. Treat player text as user data. Keep all provider calls server-side. Avoid public unauthenticated open proxy. Sessions use short-lived capability tokens or real authentication; choose design appropriate to eventual public sharing. Do not treat client-controlled headers or origin alone as sufficient authorization.

## Global durable protection

Per-instance memory Maps are NOT reliable across Vercel invocations. Use shared durable atomic counter/rate limiter with TTL (Redis/Upstash/Vercel-compatible DB), plus quotas per anonymous session/IP/user and project-level hard gateway spend cap. Default design limits (tunable):
- User trigger: 1 simultaneous interpretation; cooldown; max ~240 chars claim.
- NPC reasoning: batch salient agents, per-run/day caps and per-session token budget.
- Provider timeout e.g. 8–15s; no infinite retries or multi-provider fanout at unlimited cost.
- Daily/project budget explicit and FAIL CLOSED on shared limit service outage.
- Cache validated interpretations only with normalized text, ontology version and context hash. Never inadvertently cross-user leak conversation memory.
- Truncate/compact NPC context; rate cap responses and downstream generated dialogue.
- Meter input/output tokens, latency, cached hits, provider fail/refusal count and estimated cost. Do not log raw claim text or private NPC memory by default.

## Model output

For AI SDK v6, verify Output.object({schema}) with generateText (do not assume older generateObject API), or equivalent current recommended structured output API. Enforce a response schema requiring status, candidate AST, explicit ambiguous alternatives and unsupported residual clauses. Model cannot assert approval; post-validate compatibility, causal references and budget.

## Setup UX / docs

Supply env.example with NAMES only: AI_GATEWAY_API_KEY for local (or provider-specific server var), optional AI model identifiers, durable quota store config, app origin, spend cap. Document Vercel project OIDC and budget configuration. UI "LLM mode" consent notice must say text/limited game context leaves device, processing is paid by app operator, and offline mode is available.

## Tests

Mock provider: valid structured, malformed JSON, missing key, timeout, denied origin, token overspend, simultaneous 100 requests, quota boundary, outage, cache hit, prompt injection. Verify NO secret appears in JS bundle, thrown response, logs or submitted data.

**Actual LIVE smoke test** only when user sets private authorized credentials: one canonical freeform interpretation and one NPC decision; record redacted model ID/version, latency, token count and cost. Distinguish LIVE vs MOCK in report. No key? Implement mock tests, leave LIVE status UNVERIFIED, provide precise setup steps; never ask key value in chat.

## Exit

Secure backend runs under Vercel-compatible server functions and local simulator, real provider integration verified when configured, quotas shared across instances, classic game works with network disabled. Commit docs/AI_SETUP.md, docs/AI_COSTS.md, backend tests, and actual evidence.
