# Phase 17 — Let players WRITE their own beliefs without destroying game balance

## Goal

Players should be able to type a magical proposition such as:

- "The river forgets how to flow wherever lanterns burn."
- "The old bridge cannot fall while a child is watching."
- "The clouds gather wherever the bells ring."
- "The wolves mistake smoke for a sleeping giant."
- "Crops grow faster when their names are spoken at night."

The game interprets its meaning as a **structured, testable belief**, shows what it would do, identifies limits/costs and asks the player to confirm before paying Influence or introducing it into the village. When sufficiently believed, the selected effects operate in the deterministic world simulator. This capability should feel expressive, not fake: avoid reducing all arbitrary prose to one unrelated card.

**Critical boundary:** Natural-language understanding is optional and can use an LLM, but the world physics must NOT be generated/executed from unrestricted model text. The LLM is an **interpreter/designer candidate generator**, never authoritative rule executor. An API is NOT necessary to play the normal browser game or local MCP. For genuinely open-ended semantic interpretation of unlimited input, an LLM or comparable NLP model is strongly recommended; a lightweight parser can support a limited offline fallback only.

## Product modes

**Mode A — Offline composer (must work without network, mandatory):**
- Typed claims or selected phrase fragments.
- Grammar-driven parser and synonym matching to known ontology (targets, verbs, conditions, location, timeframe).
- If recognized with high confidence, map to an existing law or a composable expression of validated components.
- If ambiguous, present 2–3 possible interpretations and ask player to pick; do not silently invent meaning.
- If unsupported, state limitation clearly and offer nearest valid claim template; NEVER pretend an unrelated effect matches the player's words.
- Players can customize fictional title/flavor wording while exact effects remain visible.
- No remote API cost, privacy risk or key requirement.

**Mode B — LLM-enhanced composer (optional opt-in):**
- Player enters genuine freeform short natural-language claim; a server-side provider call extracts intent, constraints and suggested bounded effect from an approved ontology.
- Strict JSON schema output with normalizer and engine-side validator. One provider failure must not end a game; fallback gracefully to Mode A.
- Show "I understand your claim as: [mechanics]" with exact target, trigger, area, intensity, costs, limitations and risks; confirm/revise before game action.
- Can propose 2–3 interpretations or clarify ambiguous text; one-click choose, not verbose chat.
- Permit surprising *combinations* of approved mechanics. The composer is creative, but laws remain mechanically constrained.
- No unsolicited model-call charges, no hidden key logging, no cloud requirement for people choosing offline.

## Build a Rule Ontology / Domain-Specific Language (DSL)

Typed, strictly validated AST. Suggested structure:

~~~ts
type BeliefAST = {
  version: 1;
  subject: "river" | "rain" | "bridge" | "grain" | "wolf" | "stone" | "smoke" | "illness";
  effect: "repel" | "redirect" | "strengthen" | "grow" | "weaken" | "attract" | "slow" | "conceal";
  trigger: { kind: "proximity" | "observed" | "sound" | "time_of_day" | "evidence"; sourceId?: string };
  regionId: string;
  modifiers: { radius: number; intensity: number; duration: number };
  costProfile: { activationDifficulty: number; materialCost: number; adverseEffectBudget: number };
  ruleTags: string[];
};
~~~

This is illustrative; design an exact discriminated union where invalid subject/effect pairings are impossible or rejected. A river may redirect; a bridge may strengthen; crops may grow, but "bridge grows rain" should not become a nonsensical executable rule. Always normalize from user text into **supported** physical primitives and validate against type/rule compatibility.

The ontology should support meaningful compositional expression such as:
- target + conditional catalyst (river + lantern visibility);
- effect + geographic region + activation witnesses (bridge + watchers);
- compound laws with two bounded effects and competing cost profiles;
- mutually exclusive claims (river avoids fire vs river approaches fire);
- context-sensitive activations, bounded strength/area/decay with hysteresis.

Do NOT simply attach a whimsical title to an existing unrelated law and call that open-ended generative gameplay. Build a diverse effect vocabulary over several domains and preserve semantic faithfulness; offer transparent alternatives when unavailable.

## Balance validation of novel authored belief

Before belief enters game:
1. Strictly validate AST schema and effect compatibility.
2. Calculate power budget from affected tiles/entities, intensity, duration, ease of trigger, activation social threshold, upkeep cost and side effects.
3. Normalize power by requiring stronger/more global laws to have higher social adoption threshold, higher Influence/evidence costs, shorter durability, narrower area or larger downside. Use transparent formula, not intuition only.
4. Run a cheap deterministic counterfactual simulation over representative world conditions when practical. Reject explosive loops and impossible triggers.
5. Detect contradictions with existing laws, ask player to resolve incompatible effects.
6. Check for unconditional "win now", infinite resource, permanent invulnerability, map-wide instant conversion, recursive self-trigger and identity/spoofing abuses.
7. Return clear mechanic preview, strength rating and cost; ask confirmation.
8. Only confirmed AST gets canonical rule id (hash/version) and becomes a Claim, then normal social diffusion and law-activation mechanics apply.
9. Save original player-facing text, canonical AST, origin/source, parser/model version and balance checksum so run is deterministic even if API changes later.
10. Treat LLM text as UNTRUSTED data, never as executable code or system instruction.

If the engine cannot support a requested novel belief, report that honestly ("the village cannot yet model time reversal") and offer adjacent possible choices rather than making arbitrary unrelated result.

## Gameplay loop integration

New action: **Compose Belief**. Player writes up to a modest validated character limit, for example 140–280 characters. UI shows small cost-free interpretation preview before player confirms; confirm costs drafting/spreading AP if applicable, and immediately asks which villager to seed as first witness. Allow editing/revising *before* commitment, but don't let repeated API interpretations brute-force power/advantage without sensible cost/limit.

Seeded run rules:
- Preexisting authored content remains playable and fair.
- Freeform beliefs optional in Story Chapters, available in a separate "Inventor" challenge mode or draft slot to avoid turning authored puzzles into trivial bypasses.
- Scores for LLM-built custom laws stored in distinct category; clearly mark custom/unranked runs or compare only equivalent law/ruleset versions.
- A human can win using freeform belief (with legal social propagation) but not simply by typing "Everyone survives."

Good UX: after "the river forgets how to flow near lit lanterns", display:
"Interpretation: redirect flood flow up to 2 tiles away from lit lamps along Eastbank; needs local belief support ≥64% and lamp fuel; may flood Westbank instead. Confirm / Change / Choose canonical Fire-River claim."
No promise of unbounded literal fiction simulation.

## LLM provider and key architecture

- Must be optional and opt-in, per-user activation.
- Prefer a **server-side proxy** with selected provider (e.g. Anthropic/OpenAI as operator chooses); the browser NEVER receives server-owned provider API keys.
- If supporting bring-your-own-key, explain tradeoffs and avoid browser localStorage for secrets; prefer user-owned backend credential or short-lived scoped credential if appropriate; no plaintext telemetry/logging of key.
- Set per-request token/input limits, concurrency limits, daily cost quota and abuse/rate caps. Provide a graceful "offline composer still works" fallback.
- Don't send villagers' personal data (if any) or full save state to LLM. Supply only fixed schema, current rule metadata and minimally required context. Explain what claim text leaves device on opt-in.
- Require strict structured output and validate again server-side/engine-side; never trust model "safe" or "balanced" assertions.
- Static Vercel deployment alone cannot safely hide a secret API key without server functions; if remote interpretation deployed, document serverless function deployment, protection and monthly budget considerations.
- Caching by normalized short text + engine ontology/version can reduce provider expense but should not expose other players' private prompts.
- User-generated prompt-injection strings remain data. No eval, script, prototype pollution, file access, network browsing or tool invocation in the model-powered interpreter.
- Model outage, refusal, malformed JSON or timeout → explicit result and an offline fallback, without AP deduction for unsuccessful interpretation.

## MCP interoperability

The phase-16 submit_belief MCP tool must use **exactly** this composer; do not create a separate AI-only shortcut or trust statements by Claude without validation. An MCP-playing agent may submit user-written beliefs and receives proposed canonical effects, clarification options, constraints and confirmation token. Confirming the proposed law should be a **separate explicit game action** using token/rule version and same AP cost. MCP agents must not mutate rule registry directly.

Provide get_belief_interpretations and confirm_belief tools if submit_belief's 2-step contract is unwieldy. Secure tokens expire and bind to run revision/session/AST hash; confirmations idempotent.

## Quality, safety and tests

Create a corpus of ≥100 text claims containing:
- near synonyms of known laws;
- ambiguous, negated and metaphorical statements;
- multi-effect compositions;
- completely unsupported concepts ("revert time", "make everyone immortal");
- nonsensical input, Unicode/emoji, long text and adversarial prompt injections;
- contradictions to active laws;
- beneficial and dangerous but game-valid claims.

For offline mode: deterministic mapping result for same text/ontology; high precision or explicit abstention for ambiguous statements.
For opt-in LLM: mocked provider tests for structured responses, timeout/malformed output, prompt injection, quotas, caching and version drift; live provider tests only when authorized with configured key. Log results honestly, no fabricated inference accuracy.
Balance tests ensure user-authored laws cannot trivially win on Day 1, cheat AP, crash engine or generate endless resources. Prove at least 2 natural-language inputs produce DIFFERENT actual physical effects after genuine in-game social activation, and same canonical AST/replay reproduces effect offline with no model call.

## Exit criteria

A browser player can type an original statement; the game interprets it (offline if supported, enhanced if enabled), transparently previews bounded mechanics, asks for confirmation, seeds it socially, and the changed belief produces a real physical map consequence when activation requirements are met. The feature also works via MCP with the same rules. Users who don't want an API or do not have credentials can play the whole core game. Document precisely which claim phrasings are supported offline vs. truly open-ended model-assisted. Commit playable examples, tests, budget/security docs and honest provider/deployment status.