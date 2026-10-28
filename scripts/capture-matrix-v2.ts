/**
 * Phase 10's screenshot matrix: real frames of the real 3D world, from the recorded Generative Reality chains
 * (tests/fixtures/v2-bridge-traces.json) and, for the one state no chain reaches, a saved run built below. Needs a production build
 * served (npm run build && npm run preview). Each line of output names the seed, the chain and the camera.
 *
 *   npx tsx scripts/capture-matrix-v2.ts [--only A,B] [--url http://127.0.0.1:4173]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameSession, buildRealityClaim, serializeRun, type Action, type CreateRunOptions, type RunState } from '../src/engine/index.ts';
import { readBelief } from '../src/engine/reality/read.ts';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const url = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://127.0.0.1:4173';
const dir = 'docs/screenshots/v2-phase10';
const fx = JSON.parse(readFileSync('tests/fixtures/v2-bridge-traces.json', 'utf8')) as Record<string, { opts: CreateRunOptions; actions: Action[] }>;

/** where things are in a chain's run, for the camera */
function stateOf(key: string, day: number): RunState {
  const t = fx[key];
  const g = GameSession.create(t.opts);
  for (const a of t.actions) {
    if (g.state.day >= day || g.state.outcome) break;
    g.act(a);
  }
  return g.state;
}
const at = (x: number, y: number, dist: number, el: number, az = 24) => `az=${az},el=${el},dist=${dist},x=${x + 0.5},z=${y + 0.5}`;

// the one constructed state: a written law let go. Everyone in Eastbank firmly believes "Wet stone becomes light beside lanterns" for
// two mornings (set directly, as the unit tests' support shortcut does), then nobody does; the law's own rules then make it waver.
function expiredSave(): string {
  const g = GameSession.create({ scenarioId: 'redbank', seed: 3, difficulty: 'normal', mode: 'story', reality: true });
  g.act({ type: 'PICK_STARTER', claim: g.state.scn.starters[0] });
  const r = readBelief(g.state, 'Wet stone becomes light beside lanterns.');
  if (r.kind !== 'supported') throw new Error(r.kind);
  const b = buildRealityClaim(g.state, r.candidates[0].ast);
  if (!b.ok) throw new Error(b.message);
  g.act({ type: 'COMPOSE', claim: b.draft.claim });
  for (let d = 0; d < 5 && !g.state.outcome; d++) {
    for (const v of g.state.villagers) if (v.district === 'east') v.beliefs[b.draft.claim.id] = { conv: d < 2 ? 85 : -20, heard: 3, lastDay: g.state.day, lastSource: null, evidence: 0, cause: null, stale: 0 };
    g.endDay();
  }
  const law = g.state.laws.find((l) => l.claimId === b.draft.claim.id)!;
  console.log(`  constructed: the stones law is ${law.status} (progress ${Math.round(law.progress)}) on day ${g.state.day}`);
  const file = join(tmpdir(), 'be-v2-expired.json');
  writeFileSync(file, serializeRun(g.state));
  return file;
}

const hens6 = stateOf('hens', 6);
const coop = hens6.v2!.coops[0];
const stones7 = stateOf('stones', 7);
const placed = stones7.v2!.stones.find((x) => x.state === 'placed') ?? stones7.v2!.stones[0];
const bridge = hens6.world.landmarks.find((l) => l.kind === 'bridge')!;

interface Shot { id: string; name: string; what: string; args: string[] }
const SHOTS: Shot[] = [
  { id: 'A', name: 'A-day1-reality', what: 'Day 1 of a Generative Reality run (Redbank seed 2), the interface at rest: coops, hens and loose stones in the village', args: ['--trace', 'hens', '--day', '1', '--size', '1440x900', '--hud', '1', '--settle', '3'] },
  { id: 'B', name: 'B-law-wakes-hens-lift', what: 'Claim A wakes on day 6: the glyph on its ground and the hens it lifts rising to the height the engine computed', args: ['--trace', 'hens', '--day', '6', '--resolve', '1', '--t', '2.4', '--size', '1440x900', '--view', at(coop.x, coop.y, 7, 32)] },
  { id: 'C', name: 'C-law-wakes-stone-bank', what: 'Claim B wakes on day 6: a stone made light carried to the bank (the arc from the villager), dust where the bank rises', args: ['--trace', 'stones', '--day', '6', '--resolve', '1', '--t', '2.2', '--size', '1440x900', '--view', at(placed.x, placed.y, 8, 38)] },
  // claim C acts on the generated village's last night, so the morning after it is the end-of-run scene: the real final world
  { id: 'D', name: 'D-compound-weather-aftermath', what: 'The morning after claim C acted (generated village, its last night): the end-of-run scene of the real final world, with the rain it drew pooled on Eastbank’s low ground', args: ['--trace', 'rain', '--day', '10', '--size', '1440x900', '--hud', '1', '--wait', '6000'] },
  { id: 'E', name: 'E-debate-near-bridge', what: 'Day 5 night of claim A: villagers act on their own (gestures; arcs only along real ties) around the bridge', args: ['--trace', 'hens', '--day', '5', '--resolve', '1', '--t', '1.6', '--size', '1440x900', '--view', at(bridge.x, bridge.y, 12, 42)] },
  { id: 'F', name: 'F-law-let-go-wavering', what: 'A written law let go (constructed: support withdrawn), wavering, with the ledger open', args: ['--save', 'EXPIRED', '--size', '1440x900', '--hud', '1', '--sheet', 'laws', '--settle', '3'] },
  { id: 'G', name: 'G-aftermath-loss', what: 'The end-of-run scene after claim A’s loss: the real final village, the hens it saved, the homes the flood took', args: ['--trace', 'hens', '--day', '8', '--size', '1440x900', '--hud', '1', '--wait', '6000'] },
  { id: 'H', name: 'H-phone-390-hens-lift', what: 'Phone portrait 390x844: the same waking law and lift', args: ['--trace', 'hens', '--day', '6', '--resolve', '1', '--t', '2.4', '--size', '390x844', '--dpr', '2', '--quality', 'medium', '--hud', '1', '--view', at(coop.x, coop.y, 8, 34)] },
  { id: 'I', name: 'I-phone-320-low', what: 'Small phone 320x568 on the lowest tier, day 7 of claim B: still 3D, the raised bank and the stones', args: ['--trace', 'stones', '--day', '7', '--size', '320x568', '--dpr', '2', '--quality', 'low', '--hud', '1', '--view', at(placed.x, placed.y, 9, 40)] },
];

let expired = '';
for (const s of SHOTS) {
  if (only && !only.includes(s.id)) continue;
  if (s.args.includes('EXPIRED')) {
    expired ||= expiredSave();
    s.args[s.args.indexOf('EXPIRED')] = expired;
  }
  const out = `${dir}/${s.name}.jpg`;
  console.log(`${s.id}: ${s.what}\n  ${s.args.join(' ')}`);
  try {
    const log = execFileSync('npx', ['tsx', 'scripts/capture-3d.ts', ...s.args, '--url', url, '--out', out], { encoding: 'utf8', timeout: 600000 });
    console.log(`  ${log.trim().split('\n').pop()}`);
  } catch (e) {
    console.log(`  FAILED: ${(e as Error).message.split('\n')[0]}`);
  }
}
