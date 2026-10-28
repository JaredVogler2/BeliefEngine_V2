import { useEffect, useRef, useState } from 'react';
import { describeAction, firstName, getHud, getLawViews, getVillagerView, predictedWater, type RunState } from '../../engine/index.ts';
import { Avatar, Bar, ClaimGlyph, Icon, Pips } from '../components.tsx';
import { store, useStore } from '../store.ts';
import { Hand } from './Hand.tsx';
import { getRenderer } from './MapView.tsx';
import { ActionRow, landmarkBlurb, landmarkOpts, villagerOpts, type Opt } from './Panels.tsx';

/**
 * The interface around the world. The map is the hero: these are small, translucent, and each one earns its place.
 *
 *   top left   one slim rail: menu, the day, what is coming, the village's vital signs, and the law that matters now
 *   top right  help and sound; below them the camera
 *   left       three ways of looking: the world, the social ties, the laws (and tonight's flood when there is one)
 *   bottom     Influence, the stories as small chips, what is planned, undo, details, and End Day
 *   anchored   a small card beside whoever or whatever is selected, with the one to three things worth doing
 *   right      a side sheet with the full detail, closed until asked for
 */

export function TopBar() {
  const state = useStore((s) => s.state)!;
  const hud = getHud(state);
  const th = state.threat[Math.min(state.day, state.threat.length) - 1];
  const next = state.threat[Math.min(state.day, state.threat.length)];
  const danger = (th?.level ?? 0) >= 3;
  const objFail = hud.objectives.filter((o) => o.required && !o.met).length;
  return (
    <header className="topbar" role="banner">
      <button className="btn icon-btn" aria-label="Menu and settings" onClick={() => store.set({ screen: 'settings' })} data-testid="menu-btn">
        <Icon name="menu" />
      </button>
      <div className="daybox" data-testid="day-box" aria-label={`Day ${hud.day} of ${hud.maxDay}`}>
        Day <span>{hud.day}</span>/{hud.maxDay}
      </div>
      <div className={`threat ${danger ? '' : 'calm'}`} role="status">
        <Icon name={state.scn.features.flood ? 'flood' : state.scn.features.wolves ? 'wolf' : 'wheat'} />
        <div className="t-main">
          <div className="t-title">{th?.label ?? ''}</div>
          <div className="t-sub">{th?.warning ?? (next ? `Tomorrow: ${next.label}` : '')}</div>
        </div>
      </div>
      <LawChip />
      <div className="stats" aria-label="Village status">
        {hud.stats.includes('alive') && <div className="stat" title="Villagers alive"><Icon name="user" label="Villagers alive" /><span>{hud.alive}</span><span className="lbl muted small">/{hud.total}</span></div>}
        {hud.stats.includes('homes') && <div className={`stat ${objFail && hud.day === hud.maxDay ? 'bad' : ''}`} title="Homes standing"><Icon name="home" label="Homes standing" /><span>{hud.homes}</span></div>}
        {hud.stats.includes('food') && <div className={`stat ${hud.food < 6 ? 'warn' : ''}`} title="Food in store"><Icon name="food" label="Food" /><span>{hud.food}</span></div>}
        {hud.stats.includes('fed') && <div className="stat" title="Villagers who are not hungry"><Icon name="wheat" label="Well fed" /><span>{state.villagers.filter((v) => v.status !== 'dead' && v.hunger < 60).length}</span></div>}
        {hud.stats.includes('livestock') && <div className={`stat ${hud.livestock < 10 ? 'warn' : ''}`} title="Animals alive"><Icon name="wolf" label="Animals alive" /><span>{hud.livestock}</span><span className="lbl muted small">/{hud.livestockTotal}</span></div>}
        {hud.stats.includes('sick') && <div className={`stat ${hud.sick > 3 ? 'bad' : ''}`} title="People sick"><Icon name="warn" label="People sick" /><span>{hud.sick}</span></div>}
        {hud.stats.includes('fuel') && <div className="stat" title="Fuel in store"><Icon name="fuel" label="Fuel" /><span>{hud.fuel}</span></div>}
      </div>
    </header>
  );
}

/** the one law worth a glance: the one that is working, else the one wavering, else the one waking. A tap opens the ledger. */
function LawChip() {
  const state = useStore((s) => s.state)!;
  const laws = getLawViews(state);
  const top = laws.find((l) => l.status === 'active') ?? laws.find((l) => l.status === 'wavering') ?? laws.find((l) => l.status === 'awakening');
  if (!top) return null;
  return (
    <button className={`law-chip ${top.status}`} onClick={() => store.set({ tab: 'laws', sheetOpen: true })} title="Open the law ledger" data-testid="law-chip">
      <ClaimGlyph icon={top.icon} />
      <span className="l-name">{top.short}</span>
      <span className="l-state">{top.statusLabel}</span>
    </button>
  );
}

export function Corner() {
  const ui = useStore((s) => s.ui);
  const sound = ui.settings.sfx || ui.settings.music;
  return (
    <div className="corner">
      {!store.lastSavedOk && (
        <button className="btn small" data-testid="unsaved" aria-label="This game is not being saved. Open settings to download a copy." title="This browser would not save the game. Open Settings to download a copy." onClick={() => store.set({ screen: 'settings' })}>
          <Icon name="warn" /> Not saved
        </button>
      )}
      <button className="btn icon-btn hide-sm" aria-label="How to play" onClick={() => store.set({ screen: 'howto' })}>
        <Icon name="help" />
      </button>
      <button className="btn icon-btn mute-btn" aria-label={sound ? 'Mute all sound' : 'Unmute'} onClick={() => store.setSettings({ sfx: !sound, music: !sound })}>
        <Icon name={sound ? 'sound' : 'mute'} />
      </button>
    </div>
  );
}

/** ways of looking at the village: the world as it is, who trusts whom, what the laws are doing, where tonight's water will go */
export function Modes() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const lawsOpen = ui.sheetOpen && ui.tab === 'laws';
  const awakening = getLawViews(state).some((l) => !l.rival && (l.status === 'awakening' || l.status === 'active'));
  return (
    <nav className="modes" aria-label="Ways of looking at the village">
      <button className="mode" aria-label="World view" aria-pressed={ui.lens === 'none' && !lawsOpen} onClick={() => store.set({ lens: 'none', ...(lawsOpen ? { sheetOpen: false } : {}) })}>
        <Icon name="compass" />
        <span>World</span>
      </button>
      <button className="mode" aria-label="Toggle social lens: trust ties" aria-pressed={ui.lens === 'social'} onClick={() => store.set({ lens: ui.lens === 'social' ? 'none' : 'social' })}>
        <Icon name="lens" />
        <span>Social</span>
      </button>
      <button className="mode" aria-label="Laws: open the law ledger" aria-pressed={lawsOpen} onClick={() => store.set(lawsOpen ? { sheetOpen: false } : { tab: 'laws', sheetOpen: true })}>
        <Icon name="scroll" />
        <span>Laws</span>
        {awakening && !lawsOpen && <i className="dot" aria-hidden="true" />}
      </button>
      {state.scn.features.flood && (
        <button className="mode" aria-label="Toggle tonight's flood forecast on the map" aria-pressed={ui.showFlood} onClick={() => store.setSettings({ showFlood: !ui.showFlood })}>
          <Icon name="flood" />
          <span>Flood</span>
        </button>
      )}
    </nav>
  );
}

/** Influence, the stories, what is planned, undo, details and End Day, in one low bar along the bottom */
export function Tray() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  const session = store.session!;
  return (
    <footer className="plan tray">
      <div className="ap" data-testid="ap" aria-label={`Influence ${state.ap} of ${state.apMax}`}>
        <Icon name="star" />
        <Pips ap={state.ap} max={state.apMax} />
        <span className="lbl-wide small">Influence</span>
        <b>{state.ap}</b>
        <span className="muted small lbl">+{state.apPerDay}/day</span>
      </div>
      <Hand />
      <div className="plan-list" aria-label="Actions planned today">
        {state.today.map((r, i) => (
          <span key={i} className="plan-item">{describeAction(state, r.action)}</span>
        ))}
      </div>
      <button className="btn" onClick={() => store.undo()} disabled={!session.canUndo} aria-label="Undo last action" data-testid="undo">
        <Icon name="undo" /> <span className="lbl">Undo</span>
      </button>
      <button className="btn sheet-toggle icon-btn" aria-label="Open panel" onClick={() => store.set({ sheetOpen: !ui.sheetOpen })} aria-expanded={ui.sheetOpen} data-testid="sheet-toggle">
        <Icon name="list" />
      </button>
      <button className="btn primary end-btn big" onClick={() => store.set({ confirmEnd: true })} data-testid="end-day">
        End Day <span className="lbl-n">{state.day}</span>
      </button>
    </footer>
  );
}

// ------------------------------------------------------------------------------------------------------ the card beside the selection

/** the few actions worth showing on the small card: telling, the best go-between, a counter or a deal, then reading their mind */
function topActions(opts: Opt[]): Opt[] {
  const seed = opts.filter((o) => o.action.type === 'SEED');
  const msg = opts.filter((o) => o.action.type === 'MESSENGER' && o.preview.ok).sort((a, b) => b.preview.deltas.reduce((m, d) => m + d.after - d.before, 0) - a.preview.deltas.reduce((m, d) => m + d.after - d.before, 0));
  const counter = opts.filter((o) => o.action.type === 'COUNTER');
  const trade = opts.filter((o) => o.action.type === 'TRADE');
  const scout = opts.filter((o) => o.action.type === 'SCOUT');
  const ritual = opts.filter((o) => o.action.type === 'RITUAL' || o.action.type === 'GATHER');
  const picks = [...seed.slice(0, 1), ...ritual.slice(0, 2), ...counter.slice(0, 1), ...trade.slice(0, 1), ...msg.slice(0, 1), ...scout.slice(0, 1)];
  return picks.slice(0, 3);
}

/**
 * A small card next to whoever or whatever is selected, following it as the camera moves. It carries what the player needs first:
 * who this is, why they believe what they believe and whom they trust, and up to three things to do. Everything else is one tap away
 * in the side sheet. On a phone it docks above the bottom bar instead of floating.
 */
export function SelectionPopover() {
  const state = useStore((s) => s.state)!;
  const ui = useStore((s) => s.ui);
  useStore((s) => s.version);
  const sel = ui.selection;
  const ref = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; dock: boolean } | null>(null);
  const hidden = !sel || !!ui.digest || (ui.sheetOpen && ui.tab === 'selected');

  useEffect(() => {
    if (hidden || !sel) return;
    const place = (): void => {
      const stage = document.querySelector('.stage');
      const el = ref.current;
      if (!stage || !el) return;
      const sr = stage.getBoundingClientRect();
      if (sr.width < 700) {
        setPos((p) => (p && p.dock ? p : { left: 0, top: 0, dock: true }));
        return;
      }
      const a = getRenderer()?.entityScreen?.(sel.kind, sel.id) ?? null;
      const pw = el.offsetWidth;
      const ph = el.offsetHeight;
      const rail = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? sr.top) - sr.top + 10;
      const tray = sr.bottom - (document.querySelector('.tray')?.getBoundingClientRect().top ?? sr.bottom) + 10;
      const side = document.querySelector('.side.open')?.getBoundingClientRect();
      const right = side ? sr.right - side.left + 8 : 72;
      const minX = 84;
      const maxX = Math.max(minX, sr.width - right - pw);
      let left = a ? a.x + 36 : minX;
      if (a && left > maxX) left = a.x - 36 - pw;
      left = Math.min(Math.max(minX, left), maxX);
      let top = a ? a.y - ph / 2 : rail;
      top = Math.min(Math.max(rail, top), Math.max(rail, sr.height - tray - ph));
      setPos((p) => (p && !p.dock && Math.abs(p.left - left) < 1.5 && Math.abs(p.top - top) < 1.5 ? p : { left: Math.round(left), top: Math.round(top), dock: false }));
    };
    place();
    const t = window.setInterval(place, 120);
    window.addEventListener('resize', place);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('resize', place);
    };
  }, [hidden, sel]);

  if (hidden || !sel) return null;
  const style = pos && !pos.dock ? { left: pos.left, top: pos.top } : undefined;
  const claimId = ui.activeClaim;

  if (sel.kind === 'villager') {
    const v = state.villagers.find((x) => x.id === sel.id);
    if (!v) return null;
    const view = getVillagerView(state, sel.id);
    const opts = topActions(villagerOpts(state, sel.id, claimId));
    const b = claimId ? view.beliefs.find((x) => x.claimId === claimId) : null;
    return (
      <aside ref={ref} className="pop" style={style} data-dock={pos?.dock ? '1' : '0'} data-pick={state.starter === null ? '1' : '0'} data-ready={pos ? '1' : '0'} data-testid="selection-pop" aria-label={`${view.name}: quick actions`}>
        <header className="pop-head">
          <Avatar look={v.look} faction={v.faction} label={`Portrait of ${v.name}`} />
          <div className="pop-id">
            <h2>{view.name}</h2>
            <div className="pop-chips">
              <span className="chip">{view.role}</span>
              <span className="chip" style={{ borderColor: view.faction.color, color: view.faction.color }}>{view.faction.name}</span>
              {view.status !== 'ok' && <span className="chip bad">{view.status === 'dead' ? `Lost (${view.deathCause})` : view.status}</span>}
            </div>
          </div>
          <button className="btn icon-btn pop-x" aria-label="Close this card" onClick={() => store.select(null)}>
            <Icon name="close" />
          </button>
        </header>
        <p className="pop-want"><em>{view.want}</em></p>
        {b && (
          <div className="pop-belief">
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
              <div className="small muted">Exact conviction hidden: scout them to see it.</div>
            )}
            {b.why && <div className="why">Last moved: {b.why}</div>}
          </div>
        )}
        {view.trusts.length > 0 && view.status !== 'dead' && (
          <p className="pop-trust small">
            <span className="muted">Trusts: </span>
            {view.trusts.slice(0, 3).map((t, i) => (
              <button key={t.id} className="linkish" onClick={() => store.select({ kind: 'villager', id: t.id })}>
                {firstName(t.name)}{i < Math.min(2, view.trusts.length - 1) ? ',' : ''}
              </button>
            ))}
          </p>
        )}
        {!claimId && view.status !== 'dead' && <p className="small muted">Pick a story below to see how to tell it to {firstName(view.name)}.</p>}
        <div className="actions">
          {opts.map((o, i) => <ActionRow key={i} o={o} />)}
        </div>
        <button className="btn small ghost pop-more" onClick={() => store.set({ tab: 'selected', sheetOpen: true })}>
          More about {firstName(view.name)}
        </button>
      </aside>
    );
  }

  const l = state.world.landmarks.find((x) => x.id === sel.id);
  if (!l) return null;
  const opts = topActions(landmarkOpts(state, sel.id, claimId));
  const occupants = state.villagers.filter((x) => x.status !== 'dead' && x.place === l.id);
  return (
    <aside ref={ref} className="pop" style={style} data-dock={pos?.dock ? '1' : '0'} data-pick={state.starter === null ? '1' : '0'} data-ready={pos ? '1' : '0'} data-testid="selection-pop" aria-label={`${l.name}: quick actions`}>
      <header className="pop-head">
        <span className="glyph-circle"><Icon name={l.kind === 'home' || l.kind === 'cabin' ? 'home' : l.kind === 'bridge' ? 'bridge' : l.kind === 'beacon' ? 'flame' : l.kind === 'belltower' ? 'bell' : l.kind === 'field' ? 'wheat' : 'compass'} /></span>
        <div className="pop-id">
          <h2>{l.name}</h2>
          <div className="pop-chips">
            <span className="chip">{l.kind}</span>
            <span className="chip">{l.district === 'east' ? 'Eastbank' : l.district === 'west' ? 'Westbank' : l.district}</span>
          </div>
        </div>
        <button className="btn icon-btn pop-x" aria-label="Close this card" onClick={() => store.select(null)}>
          <Icon name="close" />
        </button>
      </header>
      <p className="pop-want small">{landmarkBlurb(l)}</p>
      {l.kind === 'bridge' && <Bar value={l.hp} max={l.maxHp} kind={l.hp / l.maxHp < 0.4 ? 'red' : 'gold'} label="Bridge integrity" />}
      {(l.kind === 'home' || l.kind === 'cabin') && state.scn.features.flood && <FloodLine state={state} id={l.id} />}
      {occupants.length > 0 && <p className="small">Here now: {occupants.map((o) => firstName(o.name)).join(', ')}.</p>}
      {opts.length === 0 && <p className="small muted">{!claimId ? 'Pick a story below to stage proof for it here.' : 'Nothing a story can do here.'}</p>}
      <div className="actions">
        {opts.map((o, i) => <ActionRow key={i} o={o} />)}
      </div>
      <button className="btn small ghost pop-more" onClick={() => store.set({ tab: 'selected', sheetOpen: true })}>
        More about this place
      </button>
    </aside>
  );
}

/** what tonight's water will do at a house, and where its people would go: the same route the 3D map draws */
function FloodLine({ state, id }: { state: RunState; id: string }) {
  const l = state.world.landmarks.find((q) => q.id === id);
  if (!l) return null;
  const depth = predictedWater(state)[l.y * state.world.w + l.x] ?? 0;
  const shelters = state.world.landmarks.filter((q) => q.kind === 'shelter' && q.hp > 0);
  let near: { name: string; d: number } | null = null;
  for (const sh of shelters) {
    const d = Math.round(Math.hypot(sh.x - l.x, sh.y - l.y));
    if (!near || d < near.d) near = { name: sh.name, d };
  }
  const drawn = getRenderer()?.kind === '3d' && !!near;
  return (
    <p className="small pop-flood" data-testid="home-flood">
      <b style={{ color: depth > 0 ? '#ffb3bf' : '#9fe0c0' }}>{depth > 0 ? `Water tonight: ${depth} deep at this door.` : 'Dry tonight.'}</b>
      {near && ` Nearest shelter: ${near.name}, about ${near.d} tiles${drawn ? ' (the way is drawn on the map)' : ''}.`}
    </p>
  );
}
