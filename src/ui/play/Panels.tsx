import { Suspense, lazy } from 'react';
import { councilBanDays, getAvailableActions, getCallouts, getForecast, getIntents, getLawViews, getModifierViews, getVillagerView, memoryLines, previewAction, describeAction, stagingOmen } from '../../engine/index.ts';
import type { Action, ClaimDef, GameEvent, Landmark, Preview, RunState, VillagerView } from '../../engine/index.ts';
import { findClaimDef, neighborsOf } from '../../engine/core/lookup.ts';
import { firstName } from '../../engine/core/names.ts';
import { lawWitnesses } from '../../engine/mind/view.ts';
import { Avatar, Bar, ClaimGlyph, Icon, evIcon } from '../components.tsx';
import { store, useStore, type SideTab } from '../store.ts';
import { getRenderer } from './MapView.tsx';
import { LawProvenance } from './Provenance.tsx';

// a villager's mind and a conversation with them (V2 runs only): its own chunk, loaded when a V2 villager is opened
const MindPanel = lazy(() => import('./MindPanel.tsx'));
const VillageMinds = lazy(() => import('./MindPanel.tsx').then((m) => ({ default: m.VillageMinds })));
const InfluenceJournal = lazy(() => import('./MindPanel.tsx').then((m) => ({ default: m.InfluenceJournal })));

// ------------------------------------------------------------------ shared action row

export interface Opt {
  action: Action;
  label: string;
  cost: number;
  preview: Preview;
  badge?: 'good' | 'bad' | null;
}

export function ActionRow({ o, onDone }: { o: Opt; onDone?: () => void }) {
  const ok = o.preview.ok;
  const deltas = o.preview.deltas.slice(0, 3).map((d) => `${firstName(d.name)} ${d.before}→${d.after}`).join(', ');
  return (
    <button
      className={`act ${o.badge === 'good' ? 'omen-good' : o.badge === 'bad' ? 'omen-bad' : ''}`}
      disabled={!ok}
      aria-disabled={!ok}
      data-action={o.action.type}
      onClick={() => {
        const r = store.act(o.action);
        if (r?.ok) onDone?.();
      }}
    >
      <span className="a-label">{o.label}</span>
      <span className={`pill-cost ${o.cost === 0 ? 'free' : ''}`}>{o.cost === 0 ? 'free' : `${o.cost} AP`}</span>
      <span className="a-sub">
        {ok ? (
          <>
            {deltas ? <b>{deltas}</b> : o.preview.lines[0]}
            {o.preview.warnings.length > 0 && <> · {o.preview.warnings[0]}</>}
          </>
        ) : (
          <>Not possible: {o.preview.error?.message}</>
        )}
      </span>
    </button>
  );
}

/** Player stories are always playable; a rival theory only when the scenario lets the Keeper adopt it. */
function playable(s: RunState, claimId: string): boolean {
  const d = findClaimDef(s, claimId);
  return !!d && (!d.rival || !!d.adoptable);
}

export function mk(s: RunState, action: Action): Opt {
  return { action, label: describeAction(s, action), cost: previewAction(s, action).cost, preview: previewAction(s, action) };
}

// ------------------------------------------------------------------ selected panel

export function SelectedPanel() {
  const state = useStore((s) => s.state);
  const ui = useStore((s) => s.ui);
  const version = useStore((s) => s.version);
  if (!state) return null;
  const sel = ui.selection;
  if (!sel) return <EmptySelection />;
  return sel.kind === 'villager' ? <VillagerCard key={sel.id + version} id={sel.id} /> : <LandmarkCard key={sel.id + version} id={sel.id} />;
}

function EmptySelection() {
  const state = useStore((s) => s.state)!;
  const hud = state.scn;
  return (
    <div>
      <h3>Nothing selected</h3>
      <p className="muted">Tap a villager or a landmark on the map. Pick a story card first to see what you can do with it.</p>
      <h3>Goals for {hud.name}</h3>
      <ul className="small">
        {hud.objectives.filter((o) => !o.instantLoss).map((o) => (
          <li key={o.id}>{o.label}</li>
        ))}
      </ul>
      <h3>Hints</h3>
      <ul className="small">
        {hud.hints.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
      <Twists />
    </div>
  );
}

/** Short lines about what is happening between people and factions right now. */
function Callouts() {
  const state = useStore((s) => s.state)!;
  const lines = getCallouts(state);
  if (!lines.length) return null;
  return (
    <section data-testid="callouts" aria-label="What is going on">
      <h3>What is going on</h3>
      <ul className="small callouts">
        {lines.map((c, i) => <li key={i} className={`callout ${c.kind}`}>{c.text}</li>)}
      </ul>
    </section>
  );
}

/** The run modifiers in play, each with its effect and its price. */
function Twists() {
  const state = useStore((s) => s.state)!;
  const twists = getModifierViews(state);
  if (!twists.length) return null;
  const bans = state.modifiers.includes('divided_council') ? councilBanDays(state.seed, state.maxDay).filter((d) => d >= state.day) : [];
  return (
    <section data-testid="twists-panel">
      <h3>Twists this run</h3>
      <ul className="small twists">
        {twists.map((m) => <li key={m.id}><b>{m.name}</b>: {m.blurb} <span className="muted">{m.tradeoff}</span></li>)}
      </ul>
      {bans.length > 0 && <p className="small">Gatherings are banned on day{bans.length === 1 ? '' : 's'} {bans.join(', ')}.</p>}
    </section>
  );
}

/** every action the Keeper can take on or through this person right now */
export function villagerOpts(state: RunState, id: string, claimId: string | null): Opt[] {
  const v = state.villagers.find((x) => x.id === id)!;
  const out: Opt[] = [];
  if (v.status === 'dead') return out;
  if (claimId && state.claims.find((c) => c.id === claimId)?.available && playable(state, claimId)) {
    out.push(mk(state, { type: 'SEED', claim: claimId, target: id }));
    const believes = (v.beliefs[claimId]?.conv ?? 0) >= 35;
    for (const n of neighborsOf(state, id)) {
      const other = state.villagers.find((x) => x.id === n.id)!;
      if (other.status === 'dead') continue;
      if (believes && (other.beliefs[claimId]?.conv ?? 0) < 70) out.push(mk(state, { type: 'MESSENGER', claim: claimId, from: id, to: n.id }));
      if ((other.beliefs[claimId]?.conv ?? 0) >= 35 && (v.beliefs[claimId]?.conv ?? 0) < 70) out.push(mk(state, { type: 'MESSENGER', claim: claimId, from: n.id, to: id }));
    }
  }
  for (const c of state.scn.claimDefs.filter((d) => d.rival)) {
    const targeted = state.rivals.some((r) => r.claim === c.id && r.plan?.target === id);
    if (claimId && ((v.beliefs[c.id]?.conv ?? 0) >= 10 || targeted)) out.push(mk(state, { type: 'COUNTER', claim: claimId, against: c.id, target: id }));
  }
  for (const d of state.scn.deals ?? []) if (d.broker === id) out.push(mk(state, { type: 'TRADE', deal: d.id, target: id }));
  out.push(mk(state, { type: 'SCOUT', target: id }));
  return out;
}

function VillagerCard({ id }: { id: string }) {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const view = getVillagerView(state, id);
  const v = state.villagers.find((x) => x.id === id)!;
  const intents = getIntents(state, id);
  const memories = memoryLines(v);
  const claimId = ui.activeClaim;
  const claimShort = claimId ? findClaimDef(state, claimId)?.short ?? claimId : null;

  const opts = villagerOpts(state, id, claimId);

  const seed = opts.filter((o) => o.action.type === 'SEED');
  const msgFrom = opts.filter((o) => o.action.type === 'MESSENGER' && (o.action as { from: string }).from === id && o.preview.ok).sort((a, b) => b.preview.deltas.reduce((m, d) => m + d.after - d.before, 0) - a.preview.deltas.reduce((m, d) => m + d.after - d.before, 0)).slice(0, 6);
  const msgTo = opts.filter((o) => o.action.type === 'MESSENGER' && (o.action as { to: string }).to === id && o.preview.ok).slice(0, 6);
  const counter = opts.filter((o) => o.action.type === 'COUNTER');
  const trade = opts.filter((o) => o.action.type === 'TRADE');
  const scout = opts.filter((o) => o.action.type === 'SCOUT');

  return (
    <div data-testid="villager-card">
      <div className="vc-head">
        <Avatar look={v.look} faction={v.faction} label={`Portrait of ${v.name}`} />
        <div style={{ minWidth: 0 }}>
          <h2>{view.name}</h2>
          <div className="row wrap" style={{ gap: '0.3rem' }}>
            <span className="chip">{view.role}</span>
            <span className="chip" style={{ borderColor: view.faction.color, color: view.faction.color }}>{view.faction.name}</span>
            {view.status !== 'ok' && <span className={`chip ${view.status === 'dead' ? 'bad' : 'bad'}`}>{view.status === 'dead' ? `Lost (${view.deathCause})` : view.status}</span>}
          </div>
        </div>
      </div>
      {view.status !== 'dead' && <Glance state={state} view={view} claimId={claimId} />}
      <p className="small" style={{ margin: '0.5rem 0 0.2rem' }}><em>{view.want}</em></p>
      <p className="small muted" style={{ margin: 0 }}>{view.archetype.label}: {view.archetype.blurb}</p>
      {view.status !== 'dead' && <p className="small" style={{ margin: '0.3rem 0 0' }}>{view.dutyNote}{view.place ? ` (${view.place})` : ''}</p>}

      <h3>What can I do?</h3>
      {!claimId && <p className="small muted">Choose a story card below to see how to tell it to {firstName(view.name)}.</p>}
      {claimId && <p className="small muted">Active story: <b>{claimShort}</b></p>}
      {!view.canBeReached && view.status !== 'dead' && <p className="small" style={{ color: 'var(--gold)' }}>You cannot walk to {firstName(view.name)} today. Only a messenger on their side can reach them.</p>}
      <div className="actions">
        {seed.map((o, i) => <ActionRow key={'s' + i} o={o} />)}
        {msgFrom.length > 0 && <div className="small muted" style={{ marginTop: '0.3rem' }}>{firstName(view.name)} can carry it to:</div>}
        {msgFrom.map((o, i) => <ActionRow key={'f' + i} o={o} />)}
        {msgTo.length > 0 && <div className="small muted" style={{ marginTop: '0.3rem' }}>Believers who can carry it to {firstName(view.name)}:</div>}
        {msgTo.map((o, i) => <ActionRow key={'t' + i} o={o} />)}
        {counter.map((o, i) => <ActionRow key={'c' + i} o={o} />)}
        {trade.map((o, i) => <ActionRow key={'d' + i} o={o} />)}
        {scout.map((o, i) => <ActionRow key={'k' + i} o={o} />)}
      </div>

      <h3>What they are weighing</h3>
      {intents.length === 0 ? <p className="small muted">Nothing: they are gone.</p> : (
        <ul className="small intents" data-testid="intents">
          {intents.map((i) => <li key={i.kind} className={i.chosen ? 'chosen' : ''}><b>{i.label}</b> {i.score}{i.chosen ? ' ← what they will do' : ''}<span className="muted"> — {i.why}.</span></li>)}
        </ul>
      )}
      {memories.length > 0 && !state.v2?.minds && (
        <>
          <h3>What they remember</h3>
          <ul className="small" data-testid="memories">{memories.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      )}
      {state.v2?.minds && (
        <Suspense fallback={<p className="small muted" role="status">Reading their mind…</p>}>
          <MindPanel id={id} />
        </Suspense>
      )}

      <h3>What they believe</h3>
      {view.beliefs.length === 0 && <p className="small muted">They have not heard any of your stories yet.</p>}
      {view.beliefs.map((b) => (
        <div className="belief" key={b.claimId}>
          <div className="row spread">
            <b className="small">{b.short}</b>
            <span className="chip">{b.label}{b.conv !== null ? ` (${b.conv})` : ''}</span>
          </div>
          {b.conv !== null ? (
            <div className="conv-track" role="img" aria-label={`Conviction ${b.conv} on a scale from minus 100 to plus 100`}>
              <b style={{ left: '50%' }} />
              <b style={{ left: '75%' }} />
              <i style={{ left: `${50 + b.conv / 2}%` }} />
            </div>
          ) : (
            <div className="small muted">Exact conviction hidden — scout them to see it.</div>
          )}
          {b.why && <div className="why">Last moved: {b.why}</div>}
        </div>
      ))}
      <p className="small" style={{ marginTop: '0.4rem' }}><b>To change their mind:</b> {view.needsToChangeMind}</p>

      <h3>Who they trust</h3>
      <div className="kv"><span>Trusts you</span><Bar value={view.keeperTrust} kind="gold" label="Trust in the Keeper" /><b>{view.keeperTrust}</b></div>
      <div className="kv"><span>Influence rank</span><span /><b>#{view.influenceRank} of {state.villagers.filter((x) => x.status !== 'dead').length}</b></div>
      <div className="kv"><span>Within 2 ties</span><span /><b>{view.reach2} people</b></div>
      {view.trusts.slice(0, 7).map((t) => (
        <button key={t.id} className="tie" onClick={() => store.select({ kind: 'villager', id: t.id })}>
          <span>{t.name} <span className="muted">({t.kind})</span></span>
          <span className={t.trust >= 0 ? 'chip good' : 'chip bad'}>{t.trust >= 0 ? '+' : ''}{t.trust}</span>
        </button>
      ))}

      <h3>Body and mind</h3>
      <div className="kv"><span>Health</span><Bar value={view.needs.health} kind="blue" label="Health" /><b>{view.needs.health}</b></div>
      <div className="kv"><span>Fear</span><Bar value={view.needs.fear} kind="red" label="Fear" /><b>{view.needs.fear}</b></div>
      {view.traits.map((t) => (
        <div className="kv" key={t.key}><span>{t.label}</span><Bar value={t.value} label={t.label} kind="gold" /><b className="small">{t.value}</b></div>
      ))}
    </div>
  );
}

/** Open the log at one event (a "Why?" link): the event, what caused it, and the place or person it concerns on the map. */
export function showEvent(s: RunState, id: number): void {
  const e = s.log.find((x) => x.id === id);
  store.set({ tab: 'log', sheetOpen: true, logFocus: id });
  if (e?.tile) getRenderer()?.focusTile(e.tile[0], e.tile[1], 1.4);
  else if (e?.target) getRenderer()?.focusVillager(e.target);
}

/**
 * The questions a player asks of a villager, answered first (phase 12): what they think of the story in hand, why (with one link
 * to the event that last moved them), whether hearing it from you would move them (the engine's own dry run of the telling), and
 * what they mean to do next. The detail below stays for whoever wants it.
 */
function Glance({ state, view, claimId }: { state: RunState; view: VillagerView; claimId: string | null }) {
  const def = claimId ? findClaimDef(state, claimId) : undefined;
  const b = def ? view.beliefs.find((x) => x.claimId === def.id) : view.beliefs[0];
  const next = getIntents(state, view.id).find((i) => i.chosen);
  const first = firstName(view.name);
  const seed = def && playable(state, def.id) && state.claims.find((c) => c.id === def.id)?.available ? previewAction(state, { type: 'SEED', claim: def.id, target: view.id }) : null;
  const moved = seed?.ok ? seed.deltas.find((d) => d.id === view.id && d.claim === def!.id) : undefined;
  const skeptic = (state.villagers.find((x) => x.id === view.id)?.traits.skepticism ?? 0) >= 70;
  let listen: string;
  if (!def) listen = 'Choose a story card to see whether they would listen.';
  else if (seed?.ok) listen = `Yes: hearing it from you now would move them ${moved ? `${moved.before} → ${moved.after}` : 'a little'}${skeptic ? ', but words barely move a skeptic; seeing it work does' : ''}.`;
  else if (seed?.error?.code === 'NO_TRUST' || seed?.error?.code === 'NO_PATH') listen = `Not from you: ${seed.error.message} A believer they trust can carry it.`;
  else listen = seed?.error?.message ?? 'Not with this story.';
  return (
    <dl className="glance" data-testid="villager-glance">
      <div>
        <dt>Thinks</dt>
        <dd data-testid="glance-thinks">{def && !b ? <>Has not heard “{def.short}”.</> : b ? <>“{b.short}”: <b>{b.label}</b>{b.conv !== null ? ` (${b.conv})` : ''}</> : 'Has not heard any of your stories yet.'}</dd>
      </div>
      {b?.why && (
        <div>
          <dt>Why</dt>
          <dd data-testid="glance-why">
            {b.why}.{' '}
            {b.whyEvent !== null && <button type="button" className="link-btn" onClick={() => showEvent(state, b.whyEvent!)} data-testid="glance-why-link" aria-label={`Why does ${first} think this? Show the event`}>Why?</button>}
          </dd>
        </div>
      )}
      <div>
        <dt>Would listen?</dt>
        <dd data-testid="glance-listen">{listen}</dd>
      </div>
      {next && (
        <div>
          <dt>Next</dt>
          <dd data-testid="glance-next">{next.label}<span className="muted"> — {next.why}.</span></dd>
        </div>
      )}
    </dl>
  );
}

export function landmarkBlurb(l: Landmark): string {
  switch (l.kind) {
    case 'beacon': return l.lit ? `Burning: ${l.fuelNights} night${l.fuelNights === 1 ? '' : 's'} of fuel left.` : 'Cold brazier. Lighting it costs fuel and carries a spark risk.';
    case 'bridge': return `Integrity ${l.hp}/${l.maxHp}.`;
    case 'belltower': return 'The chapel bell. Its voice carries across both banks.';
    case 'home': return l.hp <= 0 ? 'A ruin.' : `Standing at ${l.hp}% strength.`;
    case 'field': return l.data.burned ? 'Burned. No harvest.' : l.data.ruined ? 'Ruined. No harvest.' : l.data.harvested ? 'Harvested.' : l.data.growth !== undefined && (l.data.moisture !== undefined) ? `Growth ${Math.round(l.data.growth)}%, soil moisture ${Math.round(l.data.moisture)}%${l.data.ripe ? ' — ripe, ready to bring in.' : '.'}` : 'A standing crop. Worked fields add food each day.';
    case 'shelter': return `Shelter with room for ${l.capacity}. High ground.`;
    case 'market': return 'A busy place to gather and talk.';
    case 'hall': return 'The Reeve’s hall. Council business.';
    case 'chapel': return 'A place to gather.';
    case 'mill': return 'The mill.';
    case 'pen': return `${l.data.stock ?? 0} of ${l.data.stockMax ?? l.data.stock ?? 0} animals left. Wolves take them.`;
    case 'campfire': return l.lit ? `Burning: ${l.fuelNights} night(s) of fuel left. Smoke sickens anyone standing in it.` : 'A cold fire pit. Lighting it costs fuel.';
    case 'granary': return 'The village granary.';
    case 'well': return 'The village well: a place to talk.';
    case 'road': return (l.data.blockedUntil ?? -1) >= (store.state?.day ?? 0) ? 'Buried in mud. Nothing can travel it yet.' : 'The only road for caravans.';
    case 'cabin': return 'A lonely cabin.';
    default: return '';
  }
}

/** the rituals and gatherings a place offers, with the active story */
export function landmarkOpts(state: RunState, id: string, claimId: string | null): Opt[] {
  const l = state.world.landmarks.find((x) => x.id === id);
  const out: Opt[] = [];
  if (!l) return out;
  for (const r of state.scn.rituals.filter((q) => q.landmark === l.kind)) {
    const claims: (string | undefined)[] = [undefined];
    if (claimId) {
      const def = findClaimDef(state, claimId);
      if (def?.ritual === r.id) claims.unshift(claimId);
    }
    for (const c of claims) {
      const o = mk(state, { type: 'RITUAL', ritual: r.id, landmark: l.id, claim: c });
      if (c) {
        const omen = stagingOmen(state, r, c).value;
        o.badge = omen > 0 ? 'good' : omen < 0 ? 'bad' : null;
      }
      out.push(o);
    }
  }
  if (claimId && ['chapel', 'market', 'hall', 'shelter', 'well'].includes(l.kind) && playable(state, claimId)) out.push(mk(state, { type: 'GATHER', claim: claimId, site: l.id }));
  return out;
}

function LandmarkCard({ id }: { id: string }) {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const l = state.world.landmarks.find((x) => x.id === id);
  const claimId = ui.activeClaim;
  const opts = landmarkOpts(state, id, claimId);
  if (!l) return null;
  const def: ClaimDef | undefined = claimId ? findClaimDef(state, claimId) : undefined;
  const ritual = def?.ritual ? state.scn.rituals.find((r) => r.id === def.ritual) : undefined;
  const omen = ritual && ritual.landmark === l.kind ? stagingOmen(state, ritual, claimId) : null;
  const occupants = state.villagers.filter((v) => v.status !== 'dead' && v.place === l.id);
  return (
    <div data-testid="landmark-card">
      <h2>{l.name}</h2>
      <p className="small muted" style={{ marginTop: 0 }}>{l.kind} · {l.district === 'east' ? 'Eastbank' : l.district === 'west' ? 'Westbank' : l.district}</p>
      <p>{landmarkBlurb(l)}</p>
      {l.kind === 'bridge' && <Bar value={l.hp} max={l.maxHp} kind={l.hp / l.maxHp < 0.4 ? 'red' : 'gold'} label="Bridge integrity" />}
      {occupants.length > 0 && (
        <p className="small">Here now: {occupants.map((o) => firstName(o.name)).join(', ')}.</p>
      )}
      {omen && (
        <div className={`chip ${omen.value > 0 ? 'good' : omen.value < 0 ? 'bad' : ''}`} style={{ whiteSpace: 'normal', marginBottom: '0.5rem' }}>
          {omen.text}
        </div>
      )}
      <h3>What can I do here?</h3>
      {!claimId && opts.length > 0 && <p className="small muted">Pick a story first to stage proof for it.</p>}
      <div className="actions">
        {opts.map((o, i) => <ActionRow key={i} o={o} />)}
        {opts.length === 0 && (
          <p className="small muted" data-testid="empty-landmark">
            {state.ap <= 0
              ? 'You are out of Influence today. End the day to recover it.'
              : !claimId
                ? 'Pick a story card first; places only offer what a story can use.'
                : `Nothing is done at a ${l.kind}. Rituals belong to beacons, bells, bridges and fields; crowds gather at the chapel, market, hall, shelter or well.`}
          </p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ laws

export function LawsPanel() {
  const state = useStore((s) => s.state)!;
  const laws = getLawViews(state);
  return (
    <div data-testid="laws-panel">
      <h3>Law ledger</h3>
      <p className="small muted">A story becomes <b>law</b> when enough local people believe it (the white line) and enough of them are firm believers. It fades if support slips below the lower line.</p>
      {laws.map((l) => (
        <div key={l.id} className={`law ${l.status === 'active' ? 'active' : ''} ${l.rival ? 'rival' : ''}`}>
          <div className="l-head">
            <ClaimGlyph icon={l.icon} />
            <div style={{ minWidth: 0 }}>
              <b>{l.short}</b>
              <div className="small muted">{l.regionName}</div>
            </div>
            <span className={`chip ${l.status === 'active' ? 'gold' : l.status === 'wavering' || l.status === 'suppressed' ? 'bad' : l.status === 'awakening' ? 'good' : ''}`} style={{ marginLeft: 'auto' }}>{l.statusLabel}</span>
          </div>
          <div className="kv"><span>Support</span><Bar value={l.pressure * 100} kind="gold" marks={[l.on * 100, l.off * 100]} label={`Support for ${l.short} in ${l.regionName}`} /><b>{Math.round(l.pressure * 100)}%</b></div>
          <div className="kv"><span>Awakening</span><Bar value={l.progress} kind="blue" label="Awakening progress" /><b>{l.progress}%</b></div>
          <div className="small">Firm believers: <b>{l.supporters.length}</b> / {l.minSupporters} needed{l.supporters.length ? ` (${l.supporters.map((x) => firstName(x.name)).join(', ')})` : ''}.</div>
          {(() => {
            const w = state.v2?.minds && l.supporters.length ? lawWitnesses(state, l.id) : null;
            return w ? <div className="small" data-testid="law-witnesses">{w.saw} of {w.supporters} saw it work themselves{w.saw === 0 ? ': support built on hearsay alone is easily shaken' : ''}.</div> : null;
          })()}
          <div className="small muted">{l.note}</div>
          {state.v2 && findClaimDef(state, l.claimId)?.reality && !l.rival && <LawProvenance state={state} claim={l.claimId} />}
          <ul>
            <li>{l.benefit}</li>
            <li style={{ color: '#ffb3bf' }}>{l.risk}</li>
            <li className="muted">{l.trigger}.</li>
          </ul>
          {l.threats.map((t, i) => <div key={i} className="chip bad" style={{ whiteSpace: 'normal', margin: '2px 0' }}>{t}</div>)}
          {l.nextSteps.length > 0 && (
            <div className="small" style={{ marginTop: '0.3rem' }}>
              <b>Win over next:</b>{' '}
              {l.nextSteps.map((n) => (
                <button key={n.id} className="chip gold" onClick={() => { store.select({ kind: 'villager', id: n.id }); store.set({ tab: 'selected' }); }} style={{ cursor: 'pointer', margin: '2px' }}>{firstName(n.name)} — {n.why}</button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ village list (accessible alternative to the canvas)

export function VillagePanel() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const claim = ui.activeClaim;
  const people = state.villagers.slice().sort((a, b) => (a.status === 'dead' ? 1 : 0) - (b.status === 'dead' ? 1 : 0) || b.traits.influence - a.traits.influence);
  return (
    <div data-testid="village-panel">
      <Callouts />
      {state.v2?.minds && (
        <Suspense fallback={null}>
          <VillageMinds />
        </Suspense>
      )}
      <h3>The village</h3>
      <p className="small muted">{claim ? 'Showing belief in the active story.' : 'Choose a story to see who believes it.'} Select anyone to inspect them.</p>
      {people.map((v) => {
        const view = getVillagerView(state, v.id);
        const b = view.beliefs.find((x) => x.claimId === claim);
        return (
          <button
            key={v.id}
            className={`list-btn ${ui.selection?.id === v.id ? 'sel' : ''}`}
            onClick={() => {
              // asking for someone from the list is asking for their full card; a tap on the map shows the small one beside them instead
              store.select({ kind: 'villager', id: v.id });
              store.set({ tab: 'selected' });
              getRenderer()?.focusVillager(v.id);
            }}
          >
            <Avatar look={v.look} faction={v.faction} label="" />
            <span style={{ minWidth: 0 }}>
              <b>{v.name}</b> <span className="muted small">{v.role}</span>
              <div className="small muted">{v.status === 'dead' ? 'Lost' : v.dutyNote}</div>
            </span>
            <span className={`chip ${b && (b.conv ?? 0) >= 50 ? 'gold' : ''}`}>{v.status === 'dead' ? '†' : b ? b.label : '—'}</span>
          </button>
        );
      })}
      <h3>Places</h3>
      {state.world.landmarks.filter((l) => l.kind !== 'rubble').map((l) => (
        <button
          key={l.id}
          className={`list-btn ${ui.selection?.id === l.id ? 'sel' : ''}`}
          data-place={l.id}
          onClick={() => {
            store.select({ kind: 'landmark', id: l.id });
            store.set({ tab: 'selected' });
            getRenderer()?.focusTile(l.x, l.y, 1.3);
          }}
        >
          <Icon name={l.kind === 'home' || l.kind === 'cabin' ? 'home' : l.kind === 'bridge' ? 'bridge' : l.kind === 'beacon' ? 'flame' : l.kind === 'belltower' ? 'bell' : l.kind === 'field' ? 'wheat' : 'compass'} />
          <span><b>{l.name}</b> <span className="muted small">{l.kind}</span></span>
          <span className={`chip ${l.hp <= 0 ? 'bad' : l.lit ? 'gold' : ''}`}>{l.hp <= 0 ? 'ruin' : l.lit ? 'lit' : l.kind === 'bridge' ? `${l.hp}/${l.maxHp}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ forecast

export function ForecastPanel() {
  const state = useStore((s) => s.state)!;
  const f = getForecast(state);
  const flood = state.scn.features.flood;
  return (
    <div data-testid="forecast-panel">
      <Callouts />
      <h3>Tonight</h3>
      <div className="card" style={{ padding: '0.7rem' }}>
        <b>{f.tonight.label}</b>
        {flood && <div className="small muted">River level {f.tonight.level} · {f.tonight.trend} · rain {f.tonight.rain}</div>}
        {f.kind === 'drought' && <div className="small muted">Heat {f.tonight.level} · rain {f.tonight.rain} · sky {f.tonight.trend === 'ebbing' ? 'clouding' : 'clear'}</div>}
        {f.tonight.warning && <div className="small" style={{ color: 'var(--gold)', marginTop: '0.3rem' }}>{f.tonight.warning}</div>}
      </div>
      {flood && f.bridge && (
        <>
          <h3>Bridge</h3>
          <Bar value={f.bridge.hp} max={f.bridge.maxHp} kind={f.bridge.hp / f.bridge.maxHp < 0.4 ? 'red' : 'gold'} label="Bridge integrity" />
          <p className="small">{f.bridge.standing ? `Integrity ${f.bridge.hp}/${f.bridge.maxHp}. Unwatched, tonight takes about ${f.bridge.projectedDamage}.` : 'The bridge is gone.'} Watchers on deck: {f.bridge.watchers}.</p>
        </>
      )}
      {flood && (
        <>
          <h3>If nothing else changes</h3>
          <p className="small">{f.homesAtRisk.length ? `${f.homesAtRisk.length} homes will be touched by water: ${f.homesAtRisk.slice(0, 5).map((h) => `${h.name} (${h.depth})`).join(', ')}.` : 'No home is reached by water.'}</p>
          {f.peopleAtRisk.length > 0 && <p className="small" style={{ color: '#ffb3bf' }}>In danger: {f.peopleAtRisk.map((p) => `${p.name} (${p.note})`).join(', ')}.</p>}
          {f.evacuating.length > 0 && <p className="small">Will evacuate: {f.evacuating.join(', ')}.</p>}
          {f.trapped.length > 0 && <p className="small" style={{ color: '#ffb3bf' }}>Cannot reach safety: {f.trapped.join(', ')}.</p>}
        </>
      )}
      {f.crops && (
        <>
          <h3>The fields</h3>
          <p className="small">{f.crops.ripe} of {f.crops.total} ripe. Average growth {f.crops.avgGrowth}%, soil moisture {f.crops.avgMoisture}%.</p>
          {f.crops.fields.map((c) => (
            <div className="kv" key={c.id}>
              <span>{c.name}</span>
              <Bar value={c.growth} kind={c.ripe ? 'gold' : 'blue'} label={`${c.name} growth`} />
              <b className="small">{c.harvested ? 'in' : c.ripe ? 'ripe' : `+${c.tonight}`}</b>
            </div>
          ))}
          <p className="small muted">Dry soil makes crops crawl. Moonlight and rain make them run.</p>
        </>
      )}
      {f.caravans.length > 0 && (
        <>
          <h3>On the road</h3>
          {f.caravans.map((c, i) => (
            <p key={i} className="small">{c.food} food due day {c.arrives}.{c.blocked ? ' The road is buried in mud: it waits.' : ''}</p>
          ))}
        </>
      )}
      {state.scn.features.wolves && (
        <>
          <h3>The packs</h3>
          {f.packs.length === 0 && <p className="small">No pack is hunting tonight.</p>}
          {f.packs.map((p) => (
            <p key={p.id} className="small"><b>{p.id}</b> is heading for {state.world.landmarks.find((l) => l.id === p.target)?.name ?? 'the pens'} — {p.eta}.</p>
          ))}
          <h3>Pens</h3>
          {f.pens.map((p) => (
            <div className="kv" key={p.id}><span>{p.name}</span><span /><b>{p.stock} {p.guarded ? '(smoke)' : ''}</b></div>
          ))}
          {f.sick.length > 0 && <p className="small" style={{ color: '#ffb3bf' }}>Sick: {f.sick.join(', ')}.</p>}
        </>
      )}
      <h3>Resources</h3>
      <p className="small">Food {f.food.stock}{state.scn.features.crops || flood ? ` → about ${f.food.projected} after tonight (+${f.food.produce} harvest, −${f.food.eat} eaten)` : ''}. Fuel {f.fuel}.</p>
      {f.beacons.length > 0 && (
        <>
          <h3>Fires</h3>
          {f.beacons.map((b) => (
            <div key={b.id} className="small">{b.name}: {b.lit ? `burning, ${b.nights} night(s) left${state.scn.features.fire ? `, ~${b.sparkPct}% spark chance per neighbouring tile` : ''}` : 'cold'}</div>
          ))}
        </>
      )}
      <h3>Omens tonight</h3>
      <ul className="small">{f.tonight.omen.map((o, i) => <li key={i}>{o}</li>)}</ul>
      <h3>Coming</h3>
      <ul className="small">
        {f.upcoming.map((u) => (
          <li key={u.day}><b>Day {u.day}:</b> {u.label}{u.level !== null && flood ? ` (level ${u.level})` : ''}{flood ? ` — ${u.trend}` : ''}{u.warning ? ` — ${u.warning}` : ''}</li>
        ))}
      </ul>
      <Twists />
    </div>
  );
}

// ------------------------------------------------------------------ log

/** The event a "Why?" link asked about, with what caused it (the engine's own cause links, a few steps back). */
function FocusedEvent({ state, id }: { state: RunState; id: number }) {
  const e = state.log.find((x) => x.id === id);
  if (!e) return null;
  const chain: GameEvent[] = [];
  let causes = e.cause ?? [];
  while (causes.length && chain.length < 4) {
    const c = state.log.find((x) => x.id === causes[0]);
    if (!c || chain.includes(c)) break;
    chain.push(c);
    causes = c.cause ?? [];
  }
  return (
    <section className="card log-focus" data-testid="log-focus" aria-label="The event you asked about">
      <p className="small" style={{ margin: 0 }}><span className="log-day">Day {e.day}</span> {e.text}</p>
      {chain.length > 0 && (
        <ul className="small muted" style={{ margin: '0.3rem 0 0' }} data-testid="log-focus-causes">
          {chain.map((c) => <li key={c.id}>Because, day {c.day}: {c.text}</li>)}
        </ul>
      )}
      <button type="button" className="btn small" style={{ marginTop: '0.4rem' }} onClick={() => store.set({ logFocus: undefined })}>Show the whole log</button>
    </section>
  );
}

export function LogPanel() {
  const state = useStore((s) => s.state)!;
  const focus = useStore((s) => s.ui.logFocus);
  const events = state.log.filter((e) => e.importance >= 1).slice(-120).reverse();
  return (
    <div data-testid="log-panel">
      {focus !== undefined && <FocusedEvent state={state} id={focus} />}
      {state.v2?.minds && (
        <Suspense fallback={null}>
          <InfluenceJournal />
        </Suspense>
      )}
      <h3>What has happened</h3>
      {events.map((e) => (
        <button
          key={e.id}
          aria-current={e.id === focus ? 'true' : undefined}
          className={`log-item i${e.importance}${e.id === focus ? ' focused' : ''}`}
          onClick={() => {
            if (e.tile) getRenderer()?.focusTile(e.tile[0], e.tile[1], 1.4);
            else if (e.target) {
              store.select({ kind: 'villager', id: e.target });
              getRenderer()?.focusVillager(e.target);
            }
          }}
        >
          <span className="log-day">D{e.day} {evIcon(e.code)}</span>
          <span>{e.text}</span>
        </button>
      ))}
      {events.length === 0 && <p className="muted small">Nothing yet.</p>}
    </div>
  );
}

export function tabLabel(t: SideTab): string {
  return { selected: 'Inspect', laws: 'Laws', village: 'Village', forecast: 'Tonight', log: 'Log' }[t];
}

export const TABS: SideTab[] = ['selected', 'laws', 'village', 'forecast', 'log'];
export { Icon, getAvailableActions };
