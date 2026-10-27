/**
 * Phase 15 evidence, headless: measurements that back the persona review in docs/FUN_REVIEW.md. Every number the review quotes
 * from this script is printed by it and saved to docs/data/fun-review/probes.json. Bots are proxies; nothing here measures
 * how a person feels, and each probe says what it can and cannot show.
 *
 *   npx tsx scripts/fun-review-probes.ts [--seeds 40] [--out docs/data/fun-review/probes.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { GameSession, getHand, influenceRanks, catalogEntries, expeditionId, nightReport } from '../src/engine/index.ts';
import type { CreateRunOptions, GameEvent } from '../src/engine/index.ts';
import { policyById } from '../src/engine/ai/bots/generic.ts';
import { getTutorial } from '../src/ui/tutorial.ts';
import type { UiState } from '../src/ui/store.ts';

const args = process.argv.slice(2);
const arg = (k: string, d: string): string => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(arg('seeds', '40'));
const outFile = arg('out', 'docs/data/fun-review/probes.json');

const results: Record<string, unknown> = {};
const median = (xs: number[]) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);

/** Story chapters, then generated villages drawn from the verified catalog so every one is known to be winnable. */
function cohorts(): { id: string; opts: (i: number) => CreateRunOptions }[] {
  const verified = catalogEntries().map((e) => e.seed);
  return [
    { id: 'redbank', opts: (i) => ({ scenarioId: 'redbank', seed: i + 1 }) },
    { id: 'harvest', opts: (i) => ({ scenarioId: 'harvest', seed: i + 1 }) },
    { id: 'ashwood', opts: (i) => ({ scenarioId: 'ashwood', seed: i + 1 }) },
    { id: 'expedition', opts: (i) => ({ scenarioId: expeditionId(verified[i % verified.length]), seed: verified[i % verified.length], mode: 'expedition' }) },
  ];
}

// ---------------------------------------------------------------- 1. newcomer: what does the first night say?
{
  const rows: Record<string, { n: number; quiet: number; belief: number; story: number; newRule: number; lines: number[] }> = {};
  for (const c of cohorts()) {
    const r = { n: 0, quiet: 0, belief: 0, story: 0, newRule: 0, lines: [] as number[] };
    for (let i = 0; i < N; i++) {
      const g = GameSession.create(c.opts(i));
      const hand = getHand(g.state);
      const starter = hand.find((h) => g.state.scn.starters.includes(h.id)) ?? hand[0];
      if (g.state.starter === null) g.act({ type: 'PICK_STARTER', claim: starter.id });
      // the person the tutorial points at: the best-connected villager who already trusts the Keeper (keeperTrust >= 40)
      const ranks = influenceRanks(g.state);
      const trusted = new Set(g.state.villagers.filter((v) => v.status !== 'dead' && v.keeperTrust >= 40).map((v) => v.id));
      const targets = g.options({}, false).filter((o) => o.action.type === 'SEED');
      const pool = targets.filter((o) => trusted.has((o.action as { target: string }).target));
      const best = (pool.length ? pool : targets).sort((a, b) => (ranks.get((a.action as { target: string }).target) ?? 99) - (ranks.get((b.action as { target: string }).target) ?? 99))[0];
      if (!best) continue;
      // the same night, but telling the person the tutorial points at now (first Tell must reach the spreading threshold)
      const guide = getTutorial(g.state, { tutorialDone: false, selection: null } as UiState)?.hintVillagers[0];
      const alt = new GameSession(g.snapshot());
      const guideOpt = targets.find((o) => (o.action as { target: string }).target === guide);
      if (guideOpt) {
        alt.act(guideOpt.action);
        const nr = alt.endDay();
        if (nr.events.some((e: GameEvent) => e.code === 'BELIEF_SHIFT')) r.newRule++;
      }
      g.act(best.action);
      const res = g.endDay();
      r.n++;
      const shifts = res.events.filter((e: GameEvent) => e.code === 'BELIEF_SHIFT').length;
      if (res.summary.lines.length === 0) r.quiet++;
      if (shifts > 0) r.belief++;
      if (nightReport(g.state, res.events, res.summary).story.length > 0) r.story++;
      r.lines.push(res.summary.lines.length);
    }
    rows[c.id] = r;
  }
  results.firstNight = Object.fromEntries(
    Object.entries(rows).map(([k, r]) => [k, { runs: r.n, digestHasNoLines: r.quiet, sharePct: pct(r.quiet, r.n), nightsWhereSomeoneChangedTheirMind_oldTutorialTarget: r.belief, nightsWhereSomeoneChangedTheirMind_newTutorialTarget: r.newRule, nightsWhereTheReportNamesTheStoryOrWhyItStalled: r.story }]),
  );
  console.log('1. First night after the opening Tell: stored digest with zero lines (the old morning screen, "a quiet night") vs the morning report with a story line:');
  console.log(JSON.stringify(results.firstNight));
}

// ---------------------------------------------------------------- 2. bored player: dramatic-event timeline of winning runs
const DRAMA = new Set([
  'LAW_ACTIVATED', 'LAW_AWAKENING', 'LAW_WAVERING', 'LAW_COLLAPSED', 'LAW_DISCREDITED', 'LAW_SUPPRESSED',
  'RIVAL_CAMPAIGN', 'RIVAL_REBUTTAL', 'RIVAL_SABOTAGE', 'RIVAL_FOILED', 'RIVAL_STANDS_DOWN', 'FACTION_BAN', 'FACTION_ENDORSES', 'COUNCIL_BAN',
  'HOME_DESTROYED', 'HOME_SPARED', 'DEATH', 'LIFE_SPARED', 'BRIDGE_COLLAPSED', 'BRIDGE_HELD', 'BRIDGE_DAMAGED', 'FIRE_STARTED', 'FIELD_BURNED',
  'FIELD_FLOODED', 'FIELD_RIPE', 'HARVEST', 'LIVESTOCK_KILLED', 'PEN_SPARED', 'PACK_LURED', 'PACK_STARVING', 'CARAVAN_ARRIVES', 'CARAVAN_DELAYED',
  'TRAPPED', 'EVACUATION', 'WATCHER_DEFECTS', 'RAIN_DISPLACED', 'MUDSLIDE', 'FAMINE', 'SMOKE_SICKNESS', 'EVIDENCE_STAGED', 'EVIDENCE_BACKFIRED',
  'TRADE_AGREED', 'GATHERING',
]);
{
  const out: Record<string, unknown> = {};
  for (const c of cohorts()) {
    const quietStreaks: number[] = [];
    const quietShare: number[] = [];
    const firstDrama: number[] = [];
    const firstLaw: number[] = [];
    const firstAwake: number[] = [];
    const firstProof: number[] = [];
    const passDays: number[] = [];
    const repeatShare: number[] = [];
    const days: number[] = [];
    let wins = 0;
    let n = 0;
    for (const polId of ['evidence-first', 'threat-aware', 'greedy']) {
      for (let i = 0; i < Math.max(10, Math.floor(N / 2)); i++) {
        const g = GameSession.create(c.opts(i));
        const pol = policyById(polId);
        const perDayDrama: boolean[] = [];
        const perDayAp: number[] = [];
        let guard = 0;
        while (!g.state.outcome && guard++ < 40) {
          const before = g.state.stats.apSpent;
          const nextId = g.state.nextEventId;
          pol.playDay(g);
          perDayAp.push(g.state.stats.apSpent - before);
          perDayDrama.push(g.state.log.some((e) => e.id >= nextId && DRAMA.has(e.code)));
        }
        if (g.state.outcome?.result !== 'victory') continue;
        wins++;
        n++;
        days.push(perDayDrama.length);
        let streak = 0;
        let best = 0;
        for (const d of perDayDrama) {
          streak = d ? 0 : streak + 1;
          best = Math.max(best, streak);
        }
        quietStreaks.push(best);
        quietShare.push(perDayDrama.filter((d) => !d).length / perDayDrama.length);
        firstDrama.push(perDayDrama.findIndex((d) => d) + 1);
        const law = g.state.log.find((e) => e.code === 'LAW_ACTIVATED');
        firstLaw.push(law ? law.day : 0);
        const aw = g.state.log.find((e) => e.code === 'LAW_AWAKENING' || e.code === 'LAW_ACTIVATED');
        firstAwake.push(aw ? aw.day : 0);
        const pr = g.state.log.find((e) => e.code === 'EVIDENCE_STAGED');
        firstProof.push(pr ? pr.day : 0);
        passDays.push(perDayAp.filter((a) => a === 0).length / perDayAp.length);
        const acts = g.log.filter((a) => a.type !== 'END_DAY' && a.type !== 'PICK_STARTER');
        const counts = new Map<string, number>();
        for (const a of acts) {
          const k = a.type === 'SEED' ? `SEED:${a.claim}` : a.type;
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        repeatShare.push(acts.length ? Math.max(...counts.values()) / acts.length : 0);
      }
    }
    out[c.id] = {
      winningRunsAnalysed: n,
      medianLongestQuietStreakDays: median(quietStreaks),
      maxQuietStreakDays: Math.max(0, ...quietStreaks),
      meanShareOfQuietDays: +mean(quietShare).toFixed(2),
      medianFirstDramaticDay: median(firstDrama),
      medianFirstLawDay: median(firstLaw.filter((x) => x > 0)),
      medianFirstLawAwakeningOrActivationDay: median(firstAwake.filter((x) => x > 0)),
      medianFirstProofStagedDay: median(firstProof.filter((x) => x > 0)),
      runsWithoutAnyProofStaged: firstProof.filter((x) => x === 0).length,
      meanShareOfDaysWithNoInfluenceSpent: +mean(passDays).toFixed(2),
      meanShareOfActionsThatAreTheSingleMostCommonMove: +mean(repeatShare).toFixed(2),
      medianRunLengthDays: median(days),
    };
    void wins;
  }
  results.boredPlayer = out;
  console.log('2. Winning runs: quiet days (no law, rival, hazard, harvest, caravan, fire, death, proof or gathering event), repetition:');
  console.log(JSON.stringify(out, null, 1));
}

// ---------------------------------------------------------------- 3. strategist: does the social graph matter?
{
  const byRank: Record<string, number[]> = { top3: [], middle: [], bottom3: [] };
  for (let i = 0; i < N; i++) {
    const base = GameSession.create({ scenarioId: 'redbank', seed: i + 1 });
    base.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
    const ranks = influenceRanks(base.state);
    const tellable = base.options({}, false).filter((o) => o.action.type === 'SEED');
    const n = tellable.length;
    for (const o of tellable) {
      const target = (o.action as { target: string }).target;
      const rank = ranks.get(target) ?? 99;
      const g = GameSession.create({ scenarioId: 'redbank', seed: i + 1 });
      g.act({ type: 'PICK_STARTER', claim: 'river_fears_fire' });
      g.act(o.action);
      g.endDay();
      // total conviction the story holds across the village after one Tell and one night (people other than the target count too)
      const total = g.state.villagers.reduce((a, v) => a + Math.max(0, v.beliefs['river_fears_fire']?.conv ?? 0), 0);
      (rank <= 3 ? byRank.top3 : rank > n - 3 ? byRank.bottom3 : byRank.middle).push(total);
    }
  }
  results.centrality = {
    note: `Total conviction in the Keeper's story across the whole village after one Tell and one night, by the target's influence rank (Redbank, river_fears_fire; every villager tried as the target on ${N} seeds)`,
    top3: { telling: byRank.top3.length, meanTotalConviction: +mean(byRank.top3).toFixed(2) },
    middle: { telling: byRank.middle.length, meanTotalConviction: +mean(byRank.middle).toFixed(2) },
    bottom3: { telling: byRank.bottom3.length, meanTotalConviction: +mean(byRank.bottom3).toFixed(2) },
  };
  console.log('3. Centrality (one Tell + one night):');
  console.log(JSON.stringify(results.centrality));
}

// ---------------------------------------------------------------- 4. strategist: do generated villages ask for different things?
{
  const j = JSON.parse(readFileSync('docs/data/expeditions.json', 'utf8')) as { reports: { seed: number; biome: string; wins: string[] }[] };
  const out: Record<string, unknown> = {};
  for (const biome of ['river', 'drought', 'wolves']) {
    const rs = j.reports.filter((r) => r.biome === biome && r.wins.length > 0);
    const sigs = new Map<string, number>();
    for (const r of rs) {
      const k = r.wins.slice().sort().join('+');
      sigs.set(k, (sigs.get(k) ?? 0) + 1);
    }
    const sorted = [...sigs.entries()].sort((a, b) => b[1] - a[1]);
    // chance that two random verified villages of the same biome share a winning planner
    let same = 0;
    let pairs = 0;
    for (let a = 0; a < rs.length; a++)
      for (let b = a + 1; b < Math.min(rs.length, a + 40); b++) {
        pairs++;
        if (rs[a].wins.some((w) => rs[b].wins.includes(w))) same++;
      }
    out[biome] = {
      verified: rs.length,
      distinctWinnerSets: sigs.size,
      mostCommon: sorted.slice(0, 3).map(([k, v]) => `${k} (${v})`),
      shareOfVillagesWithOnlyOneWinningPlan: pct(rs.filter((r) => r.wins.length === 1).length, rs.length),
      pairsSharingAWinningPlanPct: pct(same, pairs),
    };
  }
  results.generatedVariety = out;
  console.log('4. Generated villages: winning-plan diversity (planners are scripted, so this is an upper bound on route variety):');
  console.log(JSON.stringify(out, null, 1));
}

// ---------------------------------------------------------------- 5. story lover: what does a loss say?
{
  const rows: Record<string, unknown> = {};
  const { buildDebrief } = await import('../src/engine/index.ts');
  for (const c of cohorts()) {
    let losses = 0;
    let namedLost = 0;
    let missedGeneric = 0;
    let chains = 0;
    for (let i = 0; i < N; i++) {
      const g = GameSession.create(c.opts(i));
      const pol = policyById('noop');
      let guard = 0;
      while (!g.state.outcome && guard++ < 40) pol.playDay(g);
      if (g.state.outcome?.result !== 'defeat') continue;
      losses++;
      const d = buildDebrief(g.state);
      if (d.lost.length > 0) namedLost++;
      chains += d.chains.length;
      if (d.missed.length === 1 && /^Try again with a different story/.test(d.missed[0])) missedGeneric++;
    }
    rows[c.id] = { idleLosses: losses, debriefNamesWhoDied: namedLost, debriefOffersOnlyAGenericRetryLine: missedGeneric, meanStoryChains: +(chains / Math.max(1, losses)).toFixed(2) };
  }
  results.lossDebrief = rows;
  console.log('5. A passive run\'s loss debrief:');
  console.log(JSON.stringify(rows));
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify({ seeds: N, results }, null, 1) + '\n');
console.log(`written ${outFile}`);
