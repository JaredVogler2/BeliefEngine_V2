# /goal — BELIEF ENGINE V2: GENERATIVE REALITY

You are lead AI systems designer, social simulation engineer, 3D game engineer, TypeScript architect, adversarial QA engineer and product designer. Transform the **real** BeliefEngine V1 game into a highly replayable desktop/iPhone browser strategy sandbox where players write novel beliefs and villagers react with individual reasoning. The world executes only **grounded, supported**, validated effects. Keep gameplay alive and fun, not an unbounded chat sandbox.

## Start with existing source

Original: https://github.com/JaredVogler2/BeliefEngine
Target: https://github.com/JaredVogler2/BeliefEngine_V2

At prompt authoring, V1 main contains TypeScript pure state engine under src/engine, 3 authored scenarios, V1 finite NL AST under src/engine/nl, offline composer, optional mocked-only LLM proxy in server/interpreter.ts, MCP local controller, raw Three.js world in src/render3d and many tests. V2 was empty. Verify current source and changes before migration. Preserve the existing V1 repository. Carry license/attributions and tests to V2; do not copy secrets or giant generated artifacts without need.

## End-to-end design

~~~
PLAYER WRITES BELIEF / NPC DISCUSSES / MCP TOOL
               |
        optional server LLM
     structured semantic proposal
               |
        STRICT AST VALIDATOR
        world object grounding
       capability/physics/balance
               |
      preview → confirm → seed rumor
               |
    ORIGINAL social graph + evidence
               |
        local belief threshold
               |
     composable deterministic law
               |
       changing canonical world
               |
    real Three.js world / game UI
               |
   historical replay / debrief / cost log
~~~

LLMs **never** execute code, spawn privileged assets, bypass resources, change random seeds, or directly modify authoritative RunState. A model can propose a structured interpretation or a villager action. Normal legal actions are applied only by engine controllers.

## Pillars

1. Broad semantic interpretation with honest abstention rather than keywords re-labeled.
2. True social agency: villagers possess beliefs, memories, evidence, relationships and objectives and propose believable responses.
3. Mechanically grounded combinatorial magic: selectors + triggers + conditions + bounded typed effects in world.
4. Good strategy game: cost, risk, objectives, threat clocks, counteraction, win/loss/replay, meaningful tradeoffs.
5. Premium immersive responsive 3D art built on existing Three.js, extending its effect system.
6. Sustainable inference: conditional calls, caching, batching, small model for routine, bigger model for creative complexity, strict quotas.
7. Offline classic and graceful provider failure.

## Scope boundary: "anything"

The LLM can interpret arbitrary input **as language**, but a finite simulator can't faithfully implement every imaginable physical law. Build an expressive rule engine with an extensible vocabulary, plus a refusal/clarification/approximation UI. Distinguish:
- fully supported (faithful validated physics);
- partially supported (exact supported components vs omitted clauses);
- ambiguous (player chooses interpretation);
- unsupported (do not invent arbitrary unrelated effect).
Optionally create unranked narrative-only descriptions separate from physically executed mechanics, explicitly marked. No on-the-fly compiling untrusted LLM-created JS, GLSL or arbitrary plugins in public game.

## NPC approach

Role/personality, private episodic memory with provenance, short goal list, attention limits, trust and social network. A few **selected salient events** invoke model reasoning. Routine daily actions, diffusion and economy remain pure TS. LLM returns structured candidate intent + utterance + reason references, not direct changes in conviction. Engine calculates influence based on actual trust, evidence and timing. Model may be wrong, manipulative or imaginative as characters, but never omniscient or world-authoritative.

## Technology

Use existing raw Three.js renderer. Preserve original GameSession and event/RunState contracts. AI backend through Vercel Functions using checked AI SDK APIs and Vercel AI Gateway, model ids chosen from current catalog. OIDC for Vercel deployment, API key only for local dev or chosen alternative. Prefer schema-checked structured output (AI SDK v6 has Output.object); verify installed SDK versions rather than copying obsolete code samples. For production, use durable shared limiter (Redis/KV/DB as appropriate) not V1 in-process counters.

Use versioned AST and external decision ledger to preserve deterministic replay. Never put provider credentials in VITE_ variables, localStorage or source. Never log raw claims or memories by default; explicit privacy disclosure for online mode. Rate, concurrency, token and cost budgets; per-user/anonymous abuse defenses.

## Work protocol

Read prompts/README.md, V1_CODE_AUDIT_SUMMARY.md and AGENT_RUNBOOK.md. Execute phases 01–17 in order, implementing code rather than writing future plans. For each: inspect current repo → implement bounded real increment → typecheck/lint/unit/build + relevant e2e → browser visual inspection when applicable → record outputs in docs/PROGRESS.md → commit → next phase. Maintain docs/CONTINUE_HERE.md. Never mark LIVE tested from mock responses. No requirement to ask developer for secret in chat; leave private configuration steps and execute local/mock tests until user sets environment.

## Acceptance

A person launches V2 in browser, chooses Generative Reality, enters at least three different custom beliefs (including novel object/property and compound condition) and receives faithful supported readings or honest limitations. NPCs respond based on memories and LLM when enabled, spread/dispute ideas, and newly activated laws actually change 3D physical world. Player wins or loses a scenario and can replay EXACT captured AI outputs with no provider calls. V1 Classic still runs offline and MCP actions still obey identical rules. Production LLM use is secure, measurable and bounded. Phone controls work. No empty menu features.
