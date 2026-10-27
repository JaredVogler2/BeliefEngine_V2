import { claimDef, modActive } from '../core/lookup.ts';
import type { ClaimDef, LawState, Landmark, RuleSpec, RunState } from '../core/types.ts';
import { activeLaws } from './resolver.ts';

/**
 * Effect primitives: translate each active law into bounded physical modifiers for tonight. Hazard modules
 * (flood, fire, crops, predators) read these modifiers; they never look at beliefs directly. That keeps the
 * causal chain inspectable: belief -> pressure -> law -> modifier -> hazard outcome.
 */
export interface Modifiers {
  /** added to effective elevation per tile (negative attracts water) */
  floodShield: number[];
  /** river level change from redirected rain (negative = water drawn off) */
  levelDelta: number;
  sinkPool: { region: string; amount: number } | null;
  /** fraction of bridge damage prevented (0..0.9) */
  bridgeShield: number;
  cropBoost: Record<string, number>;
  laborDrain: Record<string, number>;
  rainBonus: Record<string, number>;
  predatorBlock: number[];
  predatorLure: number[];
  fireDamageCut: Record<string, number>;
  ignitionMult: Record<string, number>;
  spreadMult: Record<string, number>;
  sickMult: Record<string, number>;
  /** health the weak lose each night in a region (open-door style laws let the cold in) */
  coldDrain: Record<string, number>;
  smokeLungs: { x: number; y: number; r: number }[];
  stoneStress: { x: number; y: number; r: number; amount: number }[];
  /** number of trigger sources that powered each law tonight */
  sourcesByLaw: Record<string, number>;
  notes: { law: string; text: string }[];
  // ---- written only by Generative Reality laws (src/engine/reality/execute.ts); absent in every classic run, and every reader
  // ---- treats absent as "no change", so V1's arithmetic is untouched
  /** share of flood damage to the bridge prevented whether or not anyone watches it (negative: weaker) */
  bridgeHardness?: number;
  /** river levels of floodwater turned away from the bridge tonight (negative: drawn onto it) */
  bridgeFlow?: number;
  /** home id → share of flood damage prevented */
  homeShield?: Record<string, number>;
  /** home id → share of fire damage prevented (negative: more) */
  homeFireCut?: Record<string, number>;
  /** villagers fire cannot hurt tonight */
  fireproof?: string[];
  /** water moved by reality laws onto the low ground of a region (in addition to `sinkPool`) */
  sinks?: { region: string; amount: number }[];
  /** tiles a pack may move beyond its usual steps (negative: slower), -2..2 */
  wolfStepDelta?: number;
}

export function emptyModifiers(s: RunState): Modifiers {
  const n = s.world.w * s.world.h;
  return {
    floodShield: new Array<number>(n).fill(0),
    levelDelta: 0,
    sinkPool: null,
    bridgeShield: 0,
    cropBoost: {},
    laborDrain: {},
    rainBonus: {},
    predatorBlock: new Array<number>(n).fill(0),
    predatorLure: new Array<number>(n).fill(0),
    fireDamageCut: {},
    ignitionMult: {},
    spreadMult: {},
    sickMult: {},
    coldDrain: {},
    smokeLungs: [],
    stoneStress: [],
    sourcesByLaw: {},
    notes: [],
  };
}

export interface Source {
  id: string;
  x: number;
  y: number;
}

/** What a source is called in the law notes the player reads. */
const SOURCE_WORD: Partial<Record<string, string>> = { smoke_fire: 'smoke', lit_beacon: 'lantern light', bell: 'bells' };

/** What physically powers a law tonight: lit beacons, a rung bell, bridge watchers, campfires... */
export function triggerSources(s: RunState, law: LawState, def: ClaimDef, spec: RuleSpec = def.spec): Source[] {
  const lm = s.world.landmarks;
  const inRegion = (l: Landmark) => law.regionId === 'river' || l.district === law.regionId;
  switch (spec.trigger.kind) {
    case 'lit_beacon':
      return lm.filter((l) => l.kind === 'beacon' && l.lit && l.fuelNights > 0 && inRegion(l)).map((l) => ({ id: l.id, x: l.x, y: l.y }));
    case 'smoke_fire':
      return lm.filter((l) => l.kind === 'campfire' && l.lit && l.fuelNights > 0 && inRegion(l)).map((l) => ({ id: l.id, x: l.x, y: l.y }));
    case 'bell':
      return lm.filter((l) => l.kind === 'belltower' && (l.data.ringing ?? 0) > 0).map((l) => ({ id: l.id, x: l.x, y: l.y }));
    case 'watchers': {
      const br = lm.find((l) => l.kind === 'bridge' && l.hp > 0);
      if (!br) return [];
      const watchers = br.data.watchers ?? 0;
      return watchers >= (spec.trigger.min ?? 1) ? [{ id: br.id, x: br.x, y: br.y }] : [];
    }
    case 'night':
    case 'evidence':
    case 'always': {
      const rubble = lm.filter((l) => l.kind === 'rubble' && inRegion(l));
      if (spec.subject === 'stone') return rubble.map((l) => ({ id: l.id, x: l.x, y: l.y }));
      return [{ id: law.regionId, x: 0, y: 0 }];
    }
  }
}

export function stampShield(s: RunState, arr: number[], src: Source, radius: number, bonus: number, sign: 1 | -1): void {
  const w = s.world;
  const r = Math.ceil(radius + 0.5);
  for (let y = src.y - r; y <= src.y + r; y++)
    for (let x = src.x - r; x <= src.x + r; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const d = Math.sqrt((x - src.x) * (x - src.x) + (y - src.y) * (y - src.y));
      if (d > radius + 0.5) continue;
      const i = y * w.w + x;
      if (w.terrain[i] === 1) continue; // river bed itself is unaffected
      const v = d <= 1.6 ? bonus : Math.max(1, bonus - 1);
      const signed = v * sign;
      if (sign === 1) arr[i] = Math.max(arr[i], signed);
      else arr[i] = Math.min(arr[i], signed);
    }
}

/** Compute tonight's modifiers from currently active laws. */
export function computeModifiers(s: RunState): Modifiers {
  const m = emptyModifiers(s);
  for (const law of activeLaws(s)) {
    const def = claimDef(s, law.claimId);
    const st = law.strength;
    if (st <= 0) continue;
    // a compound belief runs each of its clauses; thresholds, costs and downsides belong to the whole and live on the first
    [def.spec, ...(def.extra ?? [])].forEach((spec, specIndex) => {
    const sources = triggerSources(s, law, def, spec);
    m.sourcesByLaw[law.id] = Math.max(m.sourcesByLaw[law.id] ?? 0, sources.length);
    if (!sources.length) return;
    const B = Math.max(1, Math.round(spec.intensity * (0.5 + 0.5 * st)));
    const pctTxt = `${Math.round(law.pressure * 100)}% support`;
    switch (`${spec.subject}.${spec.effect}`) {
      case 'river.repel':
      case 'river.redirect':
      case 'river.slow':
      case 'stone.redirect':
      case 'stone.strengthen':
        for (const src of sources) stampShield(s, m.floodShield, src, spec.radius, B, 1);
        m.notes.push({ law: law.id, text: `${def.short}: ${sources.length} source(s) raise the ground by up to ${B} (${pctTxt}).` });
        if (spec.subject === 'stone') for (const src of sources) m.stoneStress.push({ x: src.x, y: src.y, r: spec.radius + 1, amount: 8 });
        break;
      case 'river.attract':
        for (const src of sources) stampShield(s, m.floodShield, src, spec.radius, B, -1);
        m.notes.push({ law: law.id, text: `${def.short}: ${sources.length} source(s) draw the water in (${pctTxt}).` });
        break;
      case 'rain.redirect': {
        const shift = Math.max(1, Math.round(spec.intensity * (0.5 + 0.5 * st)));
        m.levelDelta -= shift;
        m.sinkPool = { region: String(def.params?.sink ?? 'west'), amount: shift };
        m.notes.push({ law: law.id, text: `${def.short}: the bells draw ${shift} step(s) of rain off the river (${pctTxt}).` });
        break;
      }
      case 'rain.repel':
        m.levelDelta -= 1;
        m.notes.push({ law: law.id, text: `${def.short}: clouds turn from the bells (${pctTxt}).` });
        break;
      case 'rain.attract': {
        const bonus = Math.max(1, Math.round(spec.intensity * (0.5 + 0.5 * st)));
        for (const r of def.regions) m.rainBonus[r] = (m.rainBonus[r] ?? 0) + bonus;
        // the displaced-rain cost the card advertises: the water that is called to the fields slides off the hillside onto the road
        if (spec.side.includes('rain_displace') && def.params?.sink) m.sinkPool = { region: String(def.params.sink), amount: bonus };
        m.notes.push({ law: law.id, text: `${def.short}: the bells call rain onto the fields (${pctTxt}).` });
        break;
      }
      case 'bridge.strengthen': {
        const cut = [0, 0.45, 0.7, 0.9][spec.intensity] * (0.6 + 0.4 * st);
        m.bridgeShield = Math.min(0.9, Math.max(m.bridgeShield, cut));
        m.notes.push({ law: law.id, text: `${def.short}: ${spec.trigger.kind === 'bell' ? 'the bells' : 'watchers'} cut bridge damage by ${Math.round(Math.min(0.9, cut) * 100)}% (${pctTxt}).` });
        break;
      }
      case 'bridge.weaken':
        m.bridgeShield = Math.max(-0.5, m.bridgeShield - 0.3);
        break;
      case 'grain.grow':
        for (const r of def.regions) m.cropBoost[r] = (m.cropBoost[r] ?? 0) + Math.round(10 * spec.intensity * st * (modActive(s, 'clear_night_skies') ? 1.5 : 1));
        m.notes.push({ law: law.id, text: `${def.short}: crops ripen ${Math.round(10 * spec.intensity * st)}% faster each night (${pctTxt}).` });
        break;
      case 'grain.weaken':
        for (const r of def.regions) m.cropBoost[r] = (m.cropBoost[r] ?? 0) - Math.round(6 * spec.intensity * st);
        break;
      case 'wolf.repel':
        for (const src of sources) stampShield(s, m.predatorBlock, src, spec.radius, B, 1);
        m.notes.push({ law: law.id, text: `${def.short}: wolves will not cross the ${SOURCE_WORD[spec.trigger.kind] ?? 'smoke'} (${pctTxt}).` });
        break;
      case 'wolf.attract':
        for (const src of sources) stampShield(s, m.predatorLure, src, spec.radius, B, 1);
        m.notes.push({ law: law.id, text: `${def.short}: wolves are drawn to the ${SOURCE_WORD[spec.trigger.kind] ?? 'smoke'} (${pctTxt}).` });
        break;
      case 'illness.repel':
      case 'illness.weaken':
        for (const r of def.regions) m.sickMult[r] = Math.max(0.2, (m.sickMult[r] ?? 1) - 0.25 * spec.intensity * st);
        break;
      case 'fire.weaken':
        for (const r of def.regions) m.fireDamageCut[r] = Math.min(0.8, (m.fireDamageCut[r] ?? 0) + 0.25 * spec.intensity * st);
        break;
      case 'fire.strengthen':
        for (const r of def.regions) m.fireDamageCut[r] = Math.max(-0.5, (m.fireDamageCut[r] ?? 0) - 0.2 * spec.intensity * st);
        break;
      case 'fire.slow':
        for (const r of def.regions) m.spreadMult[r] = Math.max(0.2, (m.spreadMult[r] ?? 1) - 0.2 * spec.intensity * st);
        break;
      case 'smoke.conceal':
        break;
      default:
        break;
    }
    // side effects tied to the law
    if (specIndex === 0) for (const side of spec.side) {
      switch (side) {
        case 'ignition':
          for (const r of def.regions) m.ignitionMult[r] = (m.ignitionMult[r] ?? 1) + 1.0 * st;
          break;
        case 'complacency':
          for (const r of def.regions) m.ignitionMult[r] = (m.ignitionMult[r] ?? 1) + 0.6 * st;
          break;
        case 'labor_drain':
          if (spec.subject !== 'bridge') for (const r of def.regions) m.laborDrain[r] = (m.laborDrain[r] ?? 0) + Math.round(44 * st * (modActive(s, 'busy_harvest') ? 1.35 : 1));
          break;
        case 'smoke_sickness':
          for (const src of sources) m.smokeLungs.push({ x: src.x, y: src.y, r: spec.radius + 1 });
          break;
        case 'cold':
          for (const r of def.regions) m.coldDrain[r] = (m.coldDrain[r] ?? 0) + Math.max(1, Math.round(4 * st));
          break;
        default:
          break;
      }
    }
    });
  }
  return m;
}
