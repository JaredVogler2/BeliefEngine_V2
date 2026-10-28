/** Text served to agents as MCP resources and prompts: concise rules, usage examples, and how to read what is hidden. */

export const RULES_TEXT = `# Belief Engine for agents

You are the **Keeper of Stories** in a small village. You cannot command the world, but if enough villagers believe a story it becomes a
**law** and the world obeys: flames turn the flood, a watched bridge does not break, bells draw rain, smoke keeps wolves from the pens.
Belief spreads along ties of trust, only between people who can reach each other, and overnight events (floods, packs, fire, hunger) test
what you built. The run ends at the last day; victory means the scenario's objectives hold at the end (listed in get_game_state).

## What you can do each day (Influence is the budget; it recovers a little each dawn)
- SEED (1): tell one villager a story. One conversation per person per day. Skeptics barely move on words alone.
- MESSENGER (1): a believer (35+) carries the story to someone they trust. This is how stories cross the river and reach hermits.
- RITUAL (1, +1 to stage as proof): light a beacon, ring the bells, keep a bridge vigil, work a field by moonlight. Rituals have *physical*
  effects that laws can use, and when staged as proof for a story on a good-omen night they convince witnesses who saw it.
- GATHER (2): call up to six people to one place. Repeated crowds draw the Council's attention and can be forbidden for a day.
- COUNTER (1): challenge a rival rumour with a specific villager. Rivals announce their moves a day ahead.
- TRADE (varies): a scenario deal, e.g. buying grain from a trader who wants proof first.
- SCOUT: the first scout each day is free; it reveals one villager's private convictions for two days.
- end_day: resolve the night. Never simulates more than one day.

## What you can and cannot see
You see what the browser shows a player: who is where, public law support, objectives, the forecast of *tonight if nothing else
changes*, and exact previews of any action you consider. A villager's private conviction is hidden unless you scouted or just spoke to them.
You never see future dice, hidden state or other runs. Nothing can set a random outcome, move a villager, refund Influence or skip a cost.

## How to play well
1. get_game_state (detail "full" once), then inspect_claim on each opening story and inspect_map.
2. Choose the opening story whose law answers the danger you can read in tonight's forecast and the omens.
3. Use compare_possible_actions: conviction gained per Influence is a proxy, so also ask who the story still has to reach, who needs proof,
   and which physical set-up (beacons lit, watchers, bells) the law needs. A law with no physical trigger does nothing.
4. Answer announced rival moves (a campaign names its target a day ahead).
5. Always check food and the objectives; a won flood can still lose on hunger.
6. Call end_day only when you are done planning. Read the digest, explain it, then plan the next day.

## Writing your own beliefs (Inventor runs)
Start a run with create_game { inventor: true } (unranked: no atlas, no unlocks, no personal bests; at most two beliefs per run). The composer matches a
fixed vocabulary (it does not understand free language), so call list_belief_examples { runId } first: it lists the sentences this village understands
exactly. A belief names what behaves (river, rain, bridge, crops, wolves, sickness, fire), how, and what powers it (lit beacons, smoke fires, ringing
bells, watchers on the bridge, night work, or nothing). Many of them are already built-in stories; writing one of those only costs Influence. Then
submit_belief { runId, text } reads one
sentence into bounded mechanics. It is free and changes nothing: you get up to three interpretations, each with what it really does in this village,
what it needs (for example lit beacons or watchers), its Influence cost, the local support and firm believers it needs, its risks, and a safety-check
result. A belief that is too strong is not refused: it is narrowed (reach first, then strength) until it fits, and the interpretation says so under "adjustments"; a sentence about invulnerability, forever, free food or wealth is refused outright. Pick one and confirm_belief { runId, token }. A written belief is a story like any other: it does nothing until villagers believe it
(SEED, MESSENGER, proof), and a stronger belief needs more believers. A sentence the village cannot model is refused with the reason and the nearest
beliefs it can. Tokens last ten minutes and belong to one run; at confirm time the game rebuilds the belief and checks it again against the village as it is then.

## Generative runs (V2): any sentence, made real only by belief
create_game { variant: "generative" } (or "lab": stronger beliefs, unranked; "living": the chapter's own stories with villagers who remember,
argue and demand proof, no writing). Then propose_belief { runId, text } with any sentence about how this world works. It is free: you get
what the game can make of it beside your words (what it acts on and when, the support and firm believers it needs, its upkeep, side
effects, who may push back, what it leaves out, its cost, where it is proven) and a token per buildable interpretation. confirm_belief
{ runId, token } writes it with the same action the browser uses; a token from an older revision is refused (read again, it is free), and
one marked needsAcknowledgement (it leaves part of the sentence out, or is a substitute) needs acknowledge: true. Then make people believe
it: take_action SEED / MESSENGER / GATHER, speak_to_villager (ask is free; persuade or challenge cost 1), and stage_evidence at its rite
(the omen is read from what the belief does). A belief that harms the people who live with it costs their trust. Read get_rule_explanation
and inspect_region to see where it stands. Villagers' minds (inspect_villager: memories and how they know) are what the browser card shows;
their private convictions stay hidden unless scouted or just spoken to.

A model reads sentences or voices villagers only if the person running this server switched the game's inference service on
(get_interpreter_status); ask for it with online: "prefer" or "require". It only proposes: the engine rebuilds and checks everything.

## Reliability
Every mutating call returns a \`revision\`. Pass \`expectedRevision\` so a stale plan is rejected rather than applied, and an
\`idempotencyKey\` so a retried call never acts twice (end_day never advances two days because a request was repeated).
Errors are structured: { code, message, alternatives, kind, errorsVersion }. Branch on \`kind\` (INVALID_CLAIM, STALE_REVISION,
OUT_OF_BUDGET, LLM_UNAVAILABLE, UNSUPPORTED_EFFECT, NOT_AUTHORIZED, NOT_FOUND, INVALID_ARGUMENT, INVALID_STATE, ACTION_REFUSED, INTERNAL);
\`code\` is the detail. An invalid call changes nothing.
`;

export const TOOLS_GUIDE = `# Tool cheat sheet (examples)

- list_scenarios {} -> ids and missions.
- create_game { scenarioId: "redbank", seed: 1, difficulty: "normal" } -> runId, day 1, starters, nextValidActions.
  Generated villages: { mode: "expedition", seed: 4242 }.
- take_action { runId, action: { type: "PICK_STARTER", claim: "bridge_stands_watched" }, expectedRevision: 0, idempotencyKey: "d1-a1" }
- take_action { runId, action: { type: "SEED", claim: "bridge_stands_watched", target: "ivo" } }
- take_action { runId, action: { type: "MESSENGER", claim: "...", from: "mara", to: "hester" } }
- take_action { runId, action: { type: "RITUAL", ritual: "keep_vigil", landmark: "br", claim: "bridge_stands_watched" } }
- take_action { runId, action: { type: "COUNTER", claim: "mine", against: "rival_claim", target: "villager" } }
- list_actions { runId, targetId: "ivo" } -> only legal actions involving that villager or place.
- compare_possible_actions { runId, top: 8 } -> exact previews, best first.
- end_day { runId, expectedRevision, idempotencyKey } -> digest, law changes, outcome.
- get_history { runId, fromDay: 4, minImportance: 2 } -> causal events; follow \`cause\` ids and \`reason\` codes.
- get_results { runId } -> debrief (after the run ends). With whatIf: true, after a defeat it also names the last day a different plan could
  still have saved the village (a few seconds; replays the run on its own seed, so it shows a route existed, not that it was easy to see).
  export_replay { runId } -> exact action log.
- create_game { scenarioId: "redbank", seed: 1, inventor: true } -> an unranked run where you may write beliefs.
- list_belief_examples { runId } -> the beliefs this village understands, as sentences, with which are already built-in stories.
- submit_belief { runId, text: "The river slows beside lit beacons." } -> interpretations with tokens (free, changes nothing).
- confirm_belief { runId, token, expectedRevision, idempotencyKey } -> pays and writes it; then take_action SEED with the new claim id.
- create_game { scenarioId: "redbank", seed: 2, variant: "generative" } -> a Generative Chronicle.
- propose_belief { runId, text: "Chickens fly when the bell rings." } -> interpretations (willDo, support, upkeep, sideEffects, leftOut, cost, token).
- confirm_belief { runId, token, expectedRevision, idempotencyKey, acknowledge?, title? } -> writes it; claim.id is the new story.
- speak_to_villager { runId, villagerId: "ivo", mode: "ask" | "persuade" | "challenge" | "guess", claimId? }
- stage_evidence { runId, claimId } -> the rite at its place, with tonight's omen for it.
- inspect_object { runId, objectId: "bell" }, inspect_region { runId, regionId: "east" }, get_social_graph { runId, villagerId? },
  get_rule_explanation { runId, claimId }, get_interpreter_status {}.
- Coach mode: import_game { saveJson } (the browser's save) then compare_possible_actions and recommend; the human clicks.
  grant_control { runId } only when the human says so.
`;

export function promptPlayCautiously(scenario: string): string {
  return `Play a normal ${scenario} game of Belief Engine through the tools. Be cautious: before every action call compare_possible_actions
or list_actions, never spend your last Influence on something you cannot explain, check the forecast and food every day, and explain your
plan in two sentences before acting and the night's result after end_day. Pass expectedRevision and an idempotencyKey on every mutating call.
Stop when get_results is available and give me the story of why it went the way it did.`;
}

export function promptAlternateStrategy(scenario: string, avoid: string): string {
  return `Start a ${scenario} game and try to win with a *different* strategy from the obvious one${avoid ? ` (avoid: ${avoid})` : ''}. Read inspect_claim for every
claim first and say which law you will build, what physical set-up it needs, and what could go wrong. Play it turn by turn with exact previews,
answer rival moves, and at the end compare your approach with the one you avoided using get_results.`;
}

export function promptExplainLoss(runId: string): string {
  return `Explain why run ${runId || '<runId>'} was lost. Use get_results for the debrief, then get_history with minImportance 2 and follow the \`cause\`
chains and \`reason\` codes. Name the first day the outcome became likely, the decision that mattered most, one thing that was out of the player's
control and one concrete alternative that the exact previews would have supported. Do not invent events that are not in the history.`;
}
