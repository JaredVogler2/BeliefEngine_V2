import { NL_VERSION, candidatesFromReply, parseLlmReply } from '../engine/index.ts';
import type { RunState } from '../engine/index.ts';
import type { Candidate } from '../engine/nl/parse.ts';

/**
 * The browser side of the optional online interpreter. It is off unless the site was built with VITE_INTERPRETER_URL, and even
 * then it is asked only when the player ticks the box for that one sentence. What leaves the device is the sentence and the
 * names of the village's features and regions (nothing else: no save, no villagers). The answer is validated against a strict
 * schema and then goes through the same checks as an offline reading; any failure simply means the offline reading is used.
 */
export const INTERPRETER_URL: string | null = ((import.meta.env.VITE_INTERPRETER_URL as string | undefined) ?? '').trim() || null;

export type OnlineResult = { ok: true; readings: Candidate[] } | { ok: false; why: string };

export function onlineHost(): string | null {
  if (!INTERPRETER_URL) return null;
  try {
    return new URL(INTERPRETER_URL, window.location.href).host;
  } catch {
    return null;
  }
}

export async function askOnline(state: RunState, text: string, opts: { timeoutMs?: number; fetchImpl?: typeof fetch; url?: string } = {}): Promise<OnlineResult> {
  const url = opts.url ?? INTERPRETER_URL;
  if (!url) return { ok: false, why: 'The online interpreter is not set up here.' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 10_000);
  try {
    const features = Object.entries(state.scn.features).filter(([, v]) => v).map(([k]) => k);
    const regions = state.world.regions.map((r) => r.id);
    const res = await (opts.fetchImpl ?? fetch)(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, ontology: NL_VERSION, context: { features, regions } }),
      signal: ac.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; reply?: unknown; message?: string } | null;
    if (!j || j.ok !== true) return { ok: false, why: typeof j?.message === 'string' ? j.message.slice(0, 160) : 'The online interpreter could not help.' };
    const checked = parseLlmReply(j.reply);
    if (!checked.ok) return { ok: false, why: 'The online interpreter gave an answer the game cannot use.' };
    if (!checked.reply.understood) return { ok: false, why: 'The online interpreter found no belief it could map onto this village.' };
    const readings = candidatesFromReply(checked.reply);
    if (!readings.length) return { ok: false, why: 'The online interpreter suggested things this village cannot model.' };
    return { ok: true, readings };
  } catch (e) {
    return { ok: false, why: (e as { name?: string })?.name === 'AbortError' ? 'The online interpreter took too long.' : 'The online interpreter could not be reached.' };
  } finally {
    clearTimeout(timer);
  }
}
