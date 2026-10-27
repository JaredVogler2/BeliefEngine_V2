import { describe, expect, it } from 'vitest';
import { GameSession, allOffers, applyRun, serializeRun, deserializeRun, catalogEntries, emptyProgress, expeditionId, optionsFromState, replayRun, stateHash, eventHash, previewAction } from '../../src/engine/index.ts';
import type { Action, ClaimDef, RunState } from '../../src/engine/index.ts';
import { lawPusher } from '../../src/engine/ai/bots/lawpusher.ts';
import { policyById } from '../../src/engine/ai/bots/generic.ts';
import { cloneState } from '../../src/engine/core/clone.ts';
import { computeModifiers } from '../../src/engine/laws/effects.ts';
import { assignWatchers } from '../../src/engine/ai/routines.ts';
import { buildClaim } from '../../src/engine/nl/build.ts';
import { interpretBelief } from '../../src/engine/nl/interpret.ts';
import { OFFERED } from '../../src/engine/nl/ontology.ts';
import { stressTest } from '../../src/engine/nl/stress.ts';

function inventor(scenarioId = 'redbank', seed = 1): GameSession {
  const g = GameSession.create({ scenarioId, seed, difficulty: 'story', inventor: true });
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  return g;
}
function draftOf(g: GameSession, text: string) {
  const r = interpretBelief(g.state, text);
  const d = r.drafts.find((x) => !x.existing) ?? r.drafts[0];
  expect(d, `${text}: ${r.message}`).toBeTruthy();
  return d;
}

describe('Compose Belief: the action', () => {
  it('is refused outside Inventor runs, with the way in', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1, difficulty: 'story' });
    g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const d = interpretBelief(inventor().state, 'The river turns aside from lit lanterns.').drafts[0];
    const r = g.act({ type: 'COMPOSE', claim: d.claim });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('NOT_AVAILABLE');
      expect(r.error.message).toContain('Inventor');
    }
  });

  it('charges what the belief is worth, installs a real claim with laws, and tells the player what it needs', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    const ap = g.state.ap;
    const r = g.act({ type: 'COMPOSE', claim: d.claim });
    expect(r.ok).toBe(true);
    expect(g.state.ap).toBe(ap - d.cost.compose);
    const st = g.state.claims.find((c) => c.id === d.claim.id)!;
    // a copy of an opening choice (a starter) is told at once: it pays its writing cost instead of waiting
    expect(d.claim.unlockDay).toBeUndefined();
    expect(st.available).toBe(true);
    expect(st.def?.custom?.astHash).toBe(d.id);
    expect(g.state.laws.filter((l) => l.claimId === d.claim.id).map((l) => l.regionId)).toEqual(d.claim.regions);
    expect(r.ok && r.summary).toContain('firm believers');
    expect(g.state.flags.composed).toBe(1);
  });

  it('a written copy of an answer the chapter holds back waits for the day that answer unlocks, then can be told', () => {
    const g = inventor();
    const d = draftOf(g, 'The rain turns aside when the bells ring.');
    expect(d.claim.unlockDay).toBe(4);
    expect(d.adjustments.join(' ')).toContain('day 4');
    const r = g.act({ type: 'COMPOSE', claim: d.claim });
    expect(r.ok).toBe(true);
    expect(r.ok && r.summary).toContain('day 4');
    const id = d.claim.id;
    expect(g.state.claims.find((c) => c.id === id)!.available).toBe(false);
    expect(g.act({ type: 'SEED', claim: id, target: g.state.villagers[0].id }).ok).toBe(false);
    while (g.state.day < 4) g.endDay();
    expect(g.state.claims.find((c) => c.id === id)!.available).toBe(true);
    expect(g.act({ type: 'SEED', claim: id, target: g.state.villagers[0].id }).ok).toBe(true);
  });

  it('refuses, with the reason, a belief written for another version of the belief language', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    const old: ClaimDef = JSON.parse(JSON.stringify(d.claim));
    old.custom!.nl = 0;
    const r = g.act({ type: 'COMPOSE', claim: old });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe('STALE_BELIEF');
      expect(r.error.message).toContain('version 0');
    }
    expect(g.state.ap).toBe(inventor().state.ap);
  });

  it('rebuilds everything from the structure: a claim edited to be cheaper, easier or stronger is refused or corrected', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    const cheat: ClaimDef = JSON.parse(JSON.stringify(d.claim));
    cheat.spec.thresholds.on = 0.4;
    cheat.spec.thresholds.minSupporters = 1;
    cheat.spec.intensity = 3;
    cheat.spec.radius = 6;
    cheat.spec.side = [];
    cheat.benefit = 'Everyone is saved.';
    cheat.contradicts = [];
    const r = g.act({ type: 'COMPOSE', claim: cheat });
    expect(r.ok).toBe(true); // the edited numbers are simply never read
    const def = g.state.claims.find((c) => c.id === d.claim.id)!.def!;
    expect(def.spec.thresholds).toEqual(d.claim.spec.thresholds);
    expect(def.spec.radius).toBe(d.claim.spec.radius);
    expect(def.spec.side).toEqual(d.claim.spec.side);
    expect(def.benefit).toBe(d.claim.benefit);
  });

  it('refuses a stale or invented structure, a belief this village cannot use, too many beliefs and a repeat', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    const stale: ClaimDef = JSON.parse(JSON.stringify(d.claim));
    stale.custom!.astHash = 'deadbeef';
    expect((g.preview({ type: 'COMPOSE', claim: stale }).error?.code)).toBe('STALE_BELIEF');
    const nonsense: ClaimDef = JSON.parse(JSON.stringify(d.claim));
    (nonsense.custom!.ast.clauses[0] as { subject: string }).subject = 'constructor';
    expect(g.preview({ type: 'COMPOSE', claim: nonsense }).error?.code).toBe('BAD_BELIEF');
    const noCustom: ClaimDef = { ...d.claim };
    delete (noCustom as { custom?: unknown }).custom;
    expect(g.preview({ type: 'COMPOSE', claim: noCustom }).error?.code).toBe('BAD_BELIEF');
    const wolves = interpretBelief(inventor('ashwood').state, 'The wolves fear smoke.').drafts[0];
    expect(['NOT_HERE', 'BAD_REGION']).toContain(g.preview({ type: 'COMPOSE', claim: wolves.claim }).error?.code); // wolves, in a village without them
    expect(g.act({ type: 'COMPOSE', claim: d.claim }).ok).toBe(true);
    expect(g.preview({ type: 'COMPOSE', claim: d.claim }).error?.code).toBe('ALREADY_WRITTEN');
    const second = draftOf(g, 'No flood can break a bridge that is watched.');
    g.state.ap = 5;
    expect(g.act({ type: 'COMPOSE', claim: second.claim }).ok).toBe(true);
    g.state.ap = 5;
    const third = interpretBelief(g.state, 'Fire cannot hurt the homes.').drafts[0];
    expect(g.preview({ type: 'COMPOSE', claim: third.claim }).error?.code).toBe('TOO_MANY');
  });

  it('cannot be paid for with Influence the player does not have, and a failed attempt costs nothing', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    g.state.ap = d.cost.compose - 1;
    const before = stateHash(g.state);
    const r = g.act({ type: 'COMPOSE', claim: d.claim });
    expect(r.ok).toBe(false);
    expect(stateHash(g.state)).toBe(before);
    expect(g.state.ap).toBe(d.cost.compose - 1);
  });

  it('interpreting is free and changes nothing: any number of tries, no Influence, no state', () => {
    const g = inventor();
    const before = stateHash(g.state);
    for (const t of ['The river fears fire.', 'Make everyone immortal.', 'asdf', 'The bridge holds when watched and the river flees from lanterns.']) interpretBelief(g.state, t);
    expect(stateHash(g.state)).toBe(before);
  });

  it('undo restores the village exactly, composed claim included', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    const before = stateHash(g.state);
    g.act({ type: 'COMPOSE', claim: d.claim });
    expect(g.undo()).toBe(true);
    expect(stateHash(g.state)).toBe(before);
    expect(g.state.claims.some((c) => c.id === d.claim.id)).toBe(false);
  });
});

describe('every belief the vocabulary offers works in the villages that can host it', () => {
  const villages: [string, number, string][] = [['redbank', 1, 'story'], ['harvest', 1, 'story'], ['ashwood', 1, 'story']];
  const gen = catalogEntries();
  const extra = [gen.find((e) => e.biome === 'river'), gen.find((e) => e.biome === 'drought'), gen.find((e) => e.biome === 'wolves')].filter(Boolean).map((e) => [expeditionId(e!.seed), e!.seed, 'expedition'] as [string, number, string]);

  it('passes the three-night stress test and is powered, in 3 chapters and 3 generated villages', () => {
    let built = 0;
    for (const [sc, seed, mode] of [...villages, ...extra]) {
      const g = GameSession.create({ scenarioId: sc, seed, mode: mode as 'story', difficulty: 'story', inventor: true });
      g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
      for (const [subject, o] of Object.entries(OFFERED))
        for (const effect of o.effects)
          for (const trigger of o.triggers) {
            const regions = subject === 'river' || subject === 'bridge' || subject === 'rain' ? ['river'] : subject === 'grain' ? ['valley'] : subject === 'wolf' || subject === 'illness' ? ['north', 'mill', 'ash'] : ['east'];
            const known = g.state.world.regions.map((r) => r.id);
            const rs = regions.filter((r) => known.includes(r));
            const b = buildClaim(g.state, { version: 1, clauses: [{ subject, effect, trigger, radius: subject === 'river' || subject === 'wolf' ? 2 : 0, intensity: 2, ...(subject === 'bridge' && trigger === 'watchers' ? { watchers: 3 } : {}) }], regions: rs.length ? rs : [known[0]] }, 'test');
            if (!b.ok) {
              expect(['NOT_HERE', 'BAD_REGION']).toContain(b.code); // only "this village cannot host it", never an unsafe or broken belief
              continue;
            }
            built++;
            expect(b.draft.stress.invariantsOk, `${sc} ${subject} ${effect} ${trigger}`).toBe(true);
            expect(b.draft.stress.powered, `${sc} ${subject} ${effect} ${trigger}`).toBe(true);
          }
    }
    expect(built).toBeGreaterThan(45);
  }, 240_000);

  it('the stress test is a copy: it never touches the run and never reveals the real night', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    const before = stateHash(g.state);
    const r = stressTest(g.state, d.claim);
    expect(stateHash(g.state)).toBe(before);
    // what it reports is which kinds of thing changed, never numbers or who lives
    expect(r.changed.every((c) => typeof c === 'string')).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/\d{3,}/);
  });
});

describe('words become different physical effects, only after the village believes', () => {
  function playThrough(text: string): { state: RunState; log: Action[]; activated: number | null; id: string; probeMods: ReturnType<typeof computeModifiers> | null } {
    const g = inventor();
    const d = draftOf(g, text);
    expect(g.act({ type: 'COMPOSE', claim: d.claim }).ok).toBe(true);
    const id = d.claim.id;
    const policy = lawPusher({ name: 'inventor', claim: id, regions: d.claim.regions, counter: false, reserve: () => 0 });
    let probeMods: ReturnType<typeof computeModifiers> | null = null;
    let activated: number | null = null;
    for (let day = 0; day < g.state.maxDay && !g.state.outcome; day++) {
      // before the belief is law it does nothing at all, however it is powered
      const probe0 = cloneState(g.state);
      for (const lm of probe0.world.landmarks) {
        if (lm.kind === 'beacon' || lm.kind === 'campfire') { lm.lit = true; lm.fuelNights = 3; }
        if (lm.kind === 'bridge') lm.data.watchers = 4;
        if (lm.kind === 'belltower') lm.data.ringing = 1;
      }
      const law = g.state.laws.find((l) => l.claimId === id)!;
      if (law.status !== 'active') {
        const m0 = computeModifiers(probe0);
        expect(m0.floodShield.every((x) => x === 0) && m0.bridgeShield === 0, 'a dormant belief moved the world').toBe(true);
      }
      policy.playDay(g);
      const now = g.state.laws.find((l) => l.claimId === id && l.status === 'active');
      if (now && activated === null) {
        activated = now.activatedDay;
        const probe = cloneState(g.state);
        for (const lm of probe.world.landmarks) {
          if (lm.kind === 'beacon' || lm.kind === 'campfire') { lm.lit = true; lm.fuelNights = 3; }
          if (lm.kind === 'bridge') lm.data.watchers = 4;
        }
        probeMods = computeModifiers(probe);
        break;
      }
    }
    return { state: g.state, log: g.log.slice(), activated, id, probeMods };
  }

  it('two sentences, two different effects on the map, each after real telling and spreading; replayable offline', () => {
    const river = playThrough('The river turns aside from lit lanterns.');
    const bridge = playThrough('No flood can break a bridge that is watched.');
    expect(river.activated).not.toBeNull();
    expect(bridge.activated).not.toBeNull();
    // not on day 1 or 2: belief has to spread first
    expect(river.activated!).toBeGreaterThanOrEqual(3);
    expect(bridge.activated!).toBeGreaterThanOrEqual(3);
    // different physical effects
    expect(river.probeMods!.floodShield.filter((x) => x > 0).length).toBeGreaterThan(20);
    expect(river.probeMods!.bridgeShield).toBe(0);
    expect(bridge.probeMods!.bridgeShield).toBeGreaterThan(0.3);
    expect(bridge.probeMods!.floodShield.filter((x) => x > 0).length).toBe(0);
    // the same actions reproduce each run exactly, with no interpreter and no network involved
    for (const run of [river, bridge]) {
      const rep = replayRun({ ...optionsFromState(run.state), actions: run.log });
      expect(rep.rejected).toEqual([]);
      expect(stateHash(rep.state)).toBe(stateHash(run.state));
      expect(eventHash(rep.state)).toBe(eventHash(run.state));
    }
  });

  it('a harvest village reads two other sentences into crop and rain effects', () => {
    const g = inventor('harvest');
    const grow = draftOf(g, 'Crops ripen faster when the moon is up.');
    expect(grow.ast.clauses[0]).toMatchObject({ subject: 'grain', effect: 'grow', trigger: 'night' });
    const rain = draftOf(g, 'The clouds gather wherever the bells ring.');
    expect(rain.ast.clauses[0]).toMatchObject({ subject: 'rain', effect: 'attract', trigger: 'bell' });
  });

  it('the other power sources work too: each belief acts only when the source it names is present', () => {
    const forced = (scenario: string, text: string, power: (s: RunState) => void) => {
      const g = inventor(scenario);
      const d = draftOf(g, text);
      g.state.ap = 5;
      expect(g.act({ type: 'COMPOSE', claim: d.claim }).ok, text).toBe(true);
      const s = cloneState(g.state);
      for (const l of s.laws.filter((x) => x.claimId === d.claim.id)) { l.status = 'active'; l.progress = 100; l.strength = 1; l.pressure = 1; }
      const dark = computeModifiers(s);
      power(s);
      return { dark, lit: computeModifiers(s), id: d.claim.id, state: s };
    };
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

    const bellsCrops = forced('harvest', 'The crops grow faster when the bells ring.', (s) => { for (const l of s.world.landmarks) if (l.kind === 'belltower') l.data.ringing = 1; });
    expect(sum(bellsCrops.dark.cropBoost)).toBe(0);
    expect(sum(bellsCrops.lit.cropBoost)).toBeGreaterThan(0);

    const thrive = forced('harvest', 'The crops thrive everywhere.', () => {});
    expect(sum(thrive.dark.cropBoost)).toBeGreaterThan(0); // nothing to set up: believing it is enough

    const bellsBridge = forced('redbank', 'The bridge cannot fall while the bells ring.', (s) => { for (const l of s.world.landmarks) if (l.kind === 'belltower') l.data.ringing = 1; });
    expect(bellsBridge.dark.bridgeShield).toBe(0);
    expect(bellsBridge.lit.bridgeShield).toBeGreaterThan(0.3);
    // watchers do not power a bell belief
    const watched = forced('redbank', 'The bridge cannot fall while the bells ring.', (s) => { for (const l of s.world.landmarks) if (l.kind === 'bridge') l.data.watchers = 4; });
    expect(watched.lit.bridgeShield).toBe(0);

    const smoke = forced('ashwood', 'Sickness shuns smoke fires.', (s) => { for (const l of s.world.landmarks) if (l.kind === 'campfire') { l.lit = true; l.fuelNights = 3; } });
    expect(Object.keys(smoke.dark.sickMult)).toHaveLength(0);
    expect(Object.keys(smoke.lit.sickMult).length).toBeGreaterThan(0);
  });

  it('a compound belief runs both of its clauses', () => {
    const g = inventor();
    const r = interpretBelief(g.state, 'The river bends from lit lanterns and the bridge cannot fall while watched.');
    const both = r.drafts.find((d) => d.ast.clauses.length === 2)!;
    expect(both).toBeTruthy();
    expect(both.cost.compose).toBeGreaterThanOrEqual(2);
    g.state.ap = 5;
    expect(g.act({ type: 'COMPOSE', claim: both.claim }).ok).toBe(true);
    const s = cloneState(g.state);
    for (const l of s.laws.filter((x) => x.claimId === both.claim.id)) { l.status = 'active'; l.progress = 100; l.strength = 1; l.pressure = 1; }
    for (const lm of s.world.landmarks) {
      if (lm.kind === 'beacon') { lm.lit = true; lm.fuelNights = 3; }
      if (lm.kind === 'bridge') lm.data.watchers = 4;
    }
    const m = computeModifiers(s);
    expect(m.floodShield.some((x) => x > 0)).toBe(true);
    expect(m.bridgeShield).toBeGreaterThan(0);
  });

  it('cannot win on day 1: a belief written on day 1 needs days to spread, and the do-nothing village still loses', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    g.act({ type: 'COMPOSE', claim: d.claim });
    g.endDay();
    expect(g.state.laws.find((l) => l.claimId === d.claim.id)!.status).toBe('dormant');
    const idle = inventor();
    const noop = policyById('noop');
    for (let i = 0; i < 40 && !idle.state.outcome; i++) noop.playDay(idle);
    expect(idle.state.outcome?.result).toBe('defeat');
  });

  it('flags a belief that contradicts one the village already holds, and only one of them can hold the same ground', () => {
    const g = inventor();
    const d = draftOf(g, 'The river is drawn to lit lanterns.');
    expect(d.contradicts.map((c) => c.id)).toContain('river_fears_fire');
    expect(d.claim.contradicts).toContain('river_fears_fire');
    expect(d.risks.join(' ')).toMatch(/Contradicts/);
  });
});

describe('Inventor runs are unranked', () => {
  it('earn only their own badge, touch no atlas, and are kept out of ranked stats', () => {
    const g = inventor();
    const d = draftOf(g, 'No flood can break a bridge that is watched.');
    g.act({ type: 'COMPOSE', claim: d.claim });
    const policy = lawPusher({ name: 'inventor', claim: d.claim.id, regions: d.claim.regions, counter: false, reserve: () => 0 });
    for (let i = 0; i < 10 && !g.state.outcome; i++) policy.playDay(g);
    expect(g.state.outcome).toBeTruthy();
    const reward = applyRun(emptyProgress(), g.state, { debug: false });
    expect(reward.record.custom).toBe(true);
    expect(Object.keys(reward.progress.atlas.laws)).toEqual([]);
    expect(reward.newAchievements.every((a) => a.id === 'custom_law')).toBe(true);
    expect(reward.newUnlocks).toEqual([]);
    expect(g.state.laws.some((l) => l.claimId === d.claim.id && l.activatedDay !== null)).toBe(true);
    expect(reward.progress.achievements.custom_law).toBeTruthy();
  });

  it('a normal run is unchanged: no flag, no composing', () => {
    const g = GameSession.create({ scenarioId: 'redbank', seed: 1 });
    expect(g.state.flags.inventor).toBeUndefined();
    expect(optionsFromState(g.state).inventor).toBeUndefined();
    expect(previewAction(g.state, { type: 'SCOUT', target: 'ivo' }).ok).toBe(true);
  });

  it('is never offered in the daily village', () => {
    const g = GameSession.create({ scenarioId: expeditionId(1), seed: 1, mode: 'daily', dailyDate: 20261027, inventor: true });
    expect(g.state.flags.inventor).toBeUndefined();
  });
});

describe('the preview never drops part of a sentence silently', () => {
  it('says when one half of a two-part belief cannot work in this village, and does not mark used words as unused', () => {
    const g = inventor();
    const r = interpretBelief(g.state, 'The river slows beside lit beacons and the wolves flee from the bells.');
    expect(r.drafts.length).toBeGreaterThan(0);
    expect(r.message).toContain('Part of what you wrote cannot work here');
    expect(r.message).toContain('no wolves');
    // "lit beacons" is one phrase: neither word is reported as unused
    const plain = interpretBelief(g.state, 'The river slows beside lit beacons.');
    expect(plain.status).toBe('ok');
    expect(plain.ignored).toEqual([]);
    expect(plain.drafts[0].assumptions.join(' ')).not.toContain('could not use');
  });
});

describe('what the reader reports as unused is only what it could not use', () => {
  it('repeated words for the same thing, the place, and the source are used, not "ignored"', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 2, difficulty: 'normal', inventor: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const r = interpretBelief(g.state, 'Wheat and barley grow faster in the valley whenever the village bells are rung.');
    expect(r.ignored).toEqual([]);
    expect(r.drafts[0].ast.clauses[0]).toMatchObject({ subject: 'grain', effect: 'grow', trigger: 'bell' });
  });

  it('an idea the village cannot model is refused even when buried in a longer sentence', () => {
    const g = inventor('harvest');
    for (const t of ['The harvest is always safe: crops grow without rain, no villager can ever go hungry or die, and the granary never runs empty.', 'No one goes hungry when the bells ring.', 'Nobody can ever die.']) {
      const r = interpretBelief(g.state, t);
      expect(r.status, t).toBe('unsupported');
      expect(r.drafts, t).toEqual([]);
    }
  });

  it('offers say when a belief is already a built-in story', () => {
    const g = inventor('harvest');
    const r = interpretBelief(g.state, 'Gold falls from the sky.');
    expect(r.offers.length).toBeGreaterThan(0);
    const all = allOffers(g.state);
    expect(all.filter((o) => o.builtIn).map((o) => o.builtIn).sort()).toEqual(['Moonlight ripens grain', 'Rain answers the bells']);
  });
});

describe('a guessed power source is never presented as understood', () => {
  it('"morning sun" is not read as night: the leftover words and the assumption are both said, and it is only "partly understood"', () => {
    const g = GameSession.create({ scenarioId: 'harvest', seed: 2, difficulty: 'normal', inventor: true });
    g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
    const r = interpretBelief(g.state, 'Wheat grows faster under the morning sun.');
    expect(r.status).toBe('partial');
    expect(r.message).toContain('morning sun');
    expect(r.message).toContain('assumed');
    // a plain statement with nothing left over is still simply understood
    expect(interpretBelief(g.state, 'The crops grow faster at night.').status).toBe('ok');
  });
});

describe('saves keep written beliefs honest', () => {
  it('a save with a written belief loads, continues and replays; a save whose numbers were edited is refused', () => {
    const g = inventor();
    const d = draftOf(g, 'The river turns aside from lit lanterns.');
    expect(g.act({ type: 'COMPOSE', claim: d.claim }).ok).toBe(true);
    const json = serializeRun(g.state);
    const back = deserializeRun(json);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(stateHash(back.state)).toBe(stateHash(g.state));
      const h = new GameSession(back.state);
      expect(h.act({ type: 'SEED', claim: d.claim.id, target: h.state.villagers[0].id }).ok).toBe(true);
    }
    // make the belief cheaper and easier by editing the file
    const edited = JSON.parse(json);
    const claim = edited.state.claims.find((c: { def?: { custom?: unknown } }) => c.def?.custom);
    claim.def.spec.thresholds.on = 0.3;
    claim.def.spec.thresholds.minSupporters = 1;
    const bad = deserializeRun(JSON.stringify(edited));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('written belief');
    // or change its structure without fixing the fingerprint
    const edited2 = JSON.parse(json);
    edited2.state.claims.find((c: { def?: { custom?: unknown } }) => c.def?.custom).def.custom.ast.clauses[0].intensity = 3;
    expect(deserializeRun(JSON.stringify(edited2)).ok).toBe(false);
  });
});

describe('villagers only keep watch for a belief that is powered by watchers', () => {
  it('a bell-powered bridge belief sends nobody to the deck, a watcher-powered one does', () => {
    const watchersOn = (text: string): number => {
      const g = inventor();
      const d = draftOf(g, text);
      g.state.ap = 5;
      expect(g.act({ type: 'COMPOSE', claim: d.claim }).ok).toBe(true);
      const s = g.state;
      for (const v of s.villagers) v.beliefs[d.claim.id] = { conv: 90, heard: 3, lastDay: s.day, lastSource: 'keeper', evidence: 10, cause: null, stale: 0 };
      for (const l of s.laws.filter((x) => x.claimId === d.claim.id)) { l.status = 'active'; l.progress = 100; l.pressure = 1; l.strength = 1; }
      const mid = s.world.landmarks.find((l) => l.kind === 'bridge')!;
      assignWatchers({ s, events: [], expect: true });
      return mid.data.watchers ?? 0;
    };
    expect(watchersOn('The bridge cannot fall while the bells ring.')).toBe(0);
    expect(watchersOn('No flood can break a bridge that is watched.')).toBeGreaterThan(0);
  });
});
