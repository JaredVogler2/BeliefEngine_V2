/**
 * V2 capability switches. Each V2 capability ships OFF and stays OFF until its phase gate in prompts/AGENT_RUNBOOK.md passes; with
 * every switch off the game is exactly the migrated V1 classic game: no model, no inference endpoint, no key, no network after load.
 * They are compile-time constants on purpose: nothing a page visitor can type (URL, storage, console) turns a paid capability on.
 *
 * A switch that is on makes a capability *offerable*, never automatic: `serverInference` lets the composer offer online reading,
 * which still sends nothing until the player opts in and the server reports that it is configured (docs/AI_SETUP.md).
 */
export const V2_FEATURES = Object.freeze({
  /** phase 03 (on since 2026-10-27): budgeted model calls through a server function holding the credential (never a browser key) */
  serverInference: true,
  /** phases 04-06 and 09-11: the Generative Reality mode, where written beliefs compile to validated rules with new primitives */
  generativeReality: false,
  /** phases 07-08: villagers whose salient decisions are proposed by a model and then checked and applied by the engine */
  villagerCognition: false,
});

export type V2Feature = keyof typeof V2_FEATURES;

export function v2Enabled(feature: V2Feature): boolean {
  return V2_FEATURES[feature];
}
