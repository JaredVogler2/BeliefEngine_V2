import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { replayRun } from '../../src/engine/index.ts';
import type { Action } from '../../src/engine/index.ts';
import { browserState, replayTraceViaUi, watchConsole } from './helpers.ts';

interface Saved {
  scenarioId: string;
  seed: number;
  policy: string;
  kind: 'victory' | 'defeat';
  stateHash: string;
  eventHash: string;
  actions: Action[];
}
const saved = (JSON.parse(readFileSync(new URL('../fixtures/tournament-traces.json', import.meta.url), 'utf8')) as { traces: Saved[] }).traces;
const generated = saved.filter((t) => t.scenarioId.startsWith('x1.'));

/**
 * A generated village, played to its end through real clicks from a saved engine trace: the same flow a person takes (expedition tab, seed,
 * briefing, tell, send, stage, end the day), with the browser's state and event hashes compared with the engine's at the end.
 */
test.describe('a generated village played to its end in the browser (desktop)', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900, 'desktop flows');
  test.setTimeout(240_000);

  for (const kind of ['victory', 'defeat'] as const) {
    test(`expedition ${kind}: the saved trace replayed with real clicks ends the same way, with identical hashes`, async ({ page }) => {
      const t = generated.find((x) => x.kind === kind);
      test.skip(!t, `no saved ${kind} trace for a generated village`);
      const errors = watchConsole(page);
      await page.goto('/?debug=1');
      await page.getByTestId('play').click();
      await page.getByTestId('mode-expedition').click();
      await page.getByTestId('expedition-seed').fill(String(t!.seed));
      await page.getByTestId('begin-expedition').click();
      await page.getByTestId('begin').click();
      await expect(page.getByTestId('play')).toBeVisible();
      await replayTraceViaUi(page, t!.seed, t!.actions, t!.scenarioId);
      await expect(page.getByTestId('debrief')).toBeVisible();
      await expect(page.getByTestId('verdict')).toHaveText(kind === 'victory' ? 'Victory' : 'Defeat');
      await expect(page.getByTestId('debrief-scene')).toHaveAttribute('data-result', kind);
      const st = await browserState(page);
      // the tournament ran the village in plain story mode; the browser starts it as an expedition (the mode is part of the state), so compare with the engine run the browser corresponds to
      const direct = replayRun({ scenarioId: t!.scenarioId, seed: t!.seed, difficulty: 'normal', mode: 'expedition', actions: t!.actions });
      expect(direct.state.outcome?.result).toBe(kind);
      expect(st.hash).toBe(direct.stateHash);
      expect(st.eventHash).toBe(direct.eventHash);
      // the debrief explains itself and offers another go
      await expect(page.getByTestId('retry-same')).toBeVisible();
      await expect(page.getByTestId('share')).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});
