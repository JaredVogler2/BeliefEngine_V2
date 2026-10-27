# V1 technical review — evidence from GitHub main, 2026-10-27

These observations are based on reading V1 source code and checked-in test/status documents. They are **not** a locally run test suite in V2. Re-verify at migration.

| Capability | Exact V1 files | Conclusion / migration |
|---|---|---|
| Authoritative engine | src/engine/core/{types,actions,resolve,session,rng,replay,hash}.ts | Reuse deterministic TS core and preserve golden traces |
| Social diffusion | src/engine/social/{persuasion,propagation}.ts and src/engine/ai/{rivals,factions,routines,utility}.ts | Existing believable utility AI, but **not live LLM NPC cognition** |
| Laws | src/engine/laws/{rules,effects,resolver}.ts | Existing rules specialized to a few subjects; generalize rather than remove |
| Finite NL AST | src/engine/nl/{ast,ontology,parse,interpret,build,balance,stress,llm}.ts | Has strict typed AST with up to two clauses and limited vocabulary |
| Online LLM service | server/interpreter.ts, server/vercel-function.example.ts | Optional server proxy with Anthropic Messages request; mocked provider tests only; NOT deployed |
| Browser composer | src/ui/play/Compose.tsx and src/ui/interpreter.ts | Checkbox-enabled online interpreter, otherwise offline lexicon |
| Original 3D | src/render3d/World3D.ts and ~25 3D helpers | Hand-managed Three.js/WebGLRenderer; not React Three Fiber. Keep to avoid regressions |
| 2D fallback | src/render/MapRenderer.ts, src/render/choose.ts | Retain low-capability fallback and test flags |
| Game content | src/engine/content/scenarios/{redbank,harvest,ashwood}.ts, src/engine/gen/** | Original 3 authored chapters, expedition generators |
| Local MCP | mcp/{server,service}.ts, docs/MCP.md | Existing stdio gameplay and state validation; no native remote MCP |
| Tests | tests/unit/**, tests/e2e/** and scripts/** | Broad tests & reports, should run before changing V2 |

## Explicit current limitations

1. V1 docs/NL_BELIEFS.md describes only 7 active subjects, 40 valid subject/effect/trigger combinations (~31 behaviorally distinct), and refuses concepts beyond its finite operators. Reading free text is NOT unrestricted understanding.
2. src/engine/nl/llm.ts validates a small schema with subject/effect/trigger; out-of-ontology model suggestions are discarded. Simply adding an API key does not make arbitrary beliefs executable.
3. server/interpreter.ts sends a bounded request to an Anthropic-style endpoint, validates JSON and caches responses **in memory**, with rate limits **per function instance**. It has no durable global cap for multi-instance production.
4. docs/FINAL_ACCEPTANCE.md reports 140 browser tests, local MCP client acceptance and a finite composer, but clearly says the optional **real provider has never been called**, remote MCP not built and no production deployment. Treat these as project-reported evidence.
5. V1 3D status docs/3d-rebuild/STATUS.md show a real Three.js implementation and an incomplete quality verification program. Future V2 work must continue quality improvements and real browser captures.
6. No game-native LLM memory agents exist; a separate Claude Code MCP client playing the game is NOT evidence that villagers use generative reasoning.

## Safety and product implications

- Reuse MIT-licensed source, preserve copyright notices/attributions.
- Preserve Classic deterministic gameplay with zero model access and original seeds.
- Never pass model output as executable code or raw arbitrary physics injection.
- Add typed rule capabilities, provenance, entropy limits and diagnostic refusers.
- Record external LLM decisions in an immutable turn ledger with model/version and parsed response to enable deterministic replay.
- Route model calls via server functions with securely configured key/OIDC, quotas and usage limits.
- Don't copy huge generated tournament artifacts into the initial V2 port unless tests depend on them.
- Inference spent through hosted gateway or provider is independent of Claude Code's coding subscription.
