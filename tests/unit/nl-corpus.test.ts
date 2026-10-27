import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/engine/index.ts';
import { interpretBelief } from '../../src/engine/nl/interpret.ts';
import { sanitizeText } from '../../src/engine/nl/parse.ts';
import { loadCorpus, runCorpus, summarise } from '../../scripts/lib/nl-corpus-core.ts';

/**
 * The offline reader against written text. Three sets: the development corpus (the one the reader was built and tuned on), a
 * second set that was used once to find vocabulary the first missed, and a final set written afterwards and never tuned on.
 * What the thresholds below pin is the measured behaviour, not a claim of general language understanding.
 */
const DEV = loadCorpus(new URL('../fixtures/belief-corpus.json', import.meta.url).pathname);
const SECOND = loadCorpus(new URL('../fixtures/belief-holdout.json', import.meta.url).pathname);
const FINAL = loadCorpus(new URL('../fixtures/belief-holdout-2.json', import.meta.url).pathname);

describe('belief corpus', () => {
  it('has at least 100 development texts across every kind of difficulty', () => {
    expect(DEV.length).toBeGreaterThanOrEqual(100);
    const cats = new Set(DEV.map((e) => e.category));
    for (const c of ['synonym', 'ambiguous', 'negated', 'metaphor', 'multi', 'unsupported', 'nonsense', 'unicode', 'long', 'injection', 'contradiction', 'valid', 'mismatch']) expect(cats.has(c), c).toBe(true);
  });

  it('development corpus: every text is read as expected', () => {
    const out = runCorpus(DEV);
    const failing = out.filter((o) => !o.pass).map((o) => `${o.entry.text.slice(0, 60)}: ${o.why}`);
    expect(failing).toEqual([]);
    const s = summarise(out);
    expect(s.wrongReadings).toBe(0);
  });

  it('second set (used once to find missing vocabulary): at least 45 of 47', () => {
    const s = summarise(runCorpus(SECOND));
    expect(s.passed).toBeGreaterThanOrEqual(45);
  });

  it('final set (written after the reader was frozen, never tuned on): the measured score does not regress', () => {
    const out = runCorpus(FINAL);
    const s = summarise(out);
    expect(s.total).toBe(36);
    expect(s.passed).toBeGreaterThanOrEqual(31);
    // when it is not sure it must say so, never invent: every text that has to be refused is refused
    expect(s.abstentionCorrect.correct).toBe(s.abstentionCorrect.of);
  });

  it('the safety property holds in all three sets: nothing that should be refused is ever turned into a belief', () => {
    for (const set of [DEV, SECOND, FINAL]) {
      const refuse = set.filter((e) => e.status === 'unsupported' || e.status === 'rejected');
      const out = runCorpus(refuse);
      expect(out.filter((o) => !o.abstained).map((o) => o.entry.text.slice(0, 50))).toEqual([]);
    }
  });

  it('is deterministic: the same text in the same village always gets the same answer', () => {
    const a = runCorpus(DEV).map((o) => o.got);
    const b = runCorpus(DEV).map((o) => o.got);
    expect(a).toEqual(b);
  });

  it('survives anything: control characters, lone surrogates, huge strings, markup, null bytes and random noise never throw', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, inventor: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const weird = ['\u0000\u0001\u0002', '\ud800 the river fears fire', 'a'.repeat(100_000), '<img src=x onerror=alert(1)>', '${7*7}', '{{7*7}}', '../../../etc/passwd', 'river\u0000fears\u0000fire', '‮‭', ' '.repeat(5000), '🔥'.repeat(500), 'The river fears fire.'.repeat(1000)];
    let seed = 12345;
    for (let i = 0; i < 200; i++) {
      let t = '';
      const n = 1 + (i % 40);
      for (let k = 0; k < n; k++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        t += String.fromCodePoint(32 + (seed % 0x2ff));
      }
      weird.push(t);
    }
    for (const t of weird) {
      const r = interpretBelief(g.state, t);
      expect(['ok', 'ambiguous', 'partial', 'unsupported', 'rejected']).toContain(r.status);
      for (const d of r.drafts) expect(d.claim.text.length).toBeLessThanOrEqual(160);
    }
  });

  it('what a player types never reaches the game as anything but text: control and direction characters are stripped, nothing is executed', () => {
    expect(sanitizeText('a\u0000b‮c​d')).toBe('a b c d'.replace(/ /g, ' '));
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, inventor: true });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const r = interpretBelief(g.state, 'The river fears fire <b onclick="x()">now</b> and window.location');
    // the markup trips the guard for instructions: refused, not interpreted
    expect(r.drafts).toEqual([]);
  });
});
