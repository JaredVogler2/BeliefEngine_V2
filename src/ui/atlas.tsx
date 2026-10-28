import { useRef, useState } from 'react';
import { ACHIEVEMENTS, KNOWLEDGE, UNLOCKS, VARIANT_LABEL, progressStats } from '../engine/index.ts';
import { sfx } from '../audio/audio.ts';
import { Icon, Modal } from './components.tsx';
import { exportJson, importJson, loadProgress, resetProgress } from './progress.ts';
import { numberToDate } from '../engine/index.ts';
import { downloadText } from './files.ts';
import { store } from './store.ts';

type Tab = 'laws' | 'lore' | 'postcards' | 'badges' | 'unlocks' | 'stats' | 'archive';
const TABS: [Tab, string][] = [['laws', 'Laws'], ['lore', 'Lore'], ['postcards', 'Postcards'], ['badges', 'Badges'], ['unlocks', 'Unlocks'], ['stats', 'Stats'], ['archive', 'Archive']];

/** The seen-in-the-world labels for the event codes a law was observed causing. */
const EFFECT_TEXT: Record<string, string> = {
  HOME_SPARED: 'spared homes', LIFE_SPARED: 'saved lives', BRIDGE_HELD: 'held the bridge', PEN_SPARED: 'kept wolves from pens', RAIN_DISPLACED: 'pushed rain elsewhere', MUDSLIDE: 'buried a road',
  FIRE_STARTED: 'started a fire', FIELD_BURNED: 'burned a field', SMOKE_SICKNESS: 'sickened people', PACK_LURED: 'lured a pack', NIGHT_LABOR: 'exhausted workers', LAW_WAVERING: 'wavered',
  LAW_COLLAPSED: 'collapsed', LAW_SUPPRESSED: 'was suppressed', CROP_BOOSTED: 'ripened crops',
  // what written beliefs do (Generative Chronicle)
  REALITY_EFFECT: 'acted on the world', REALITY_CONFLICT: 'pulled against another belief', CHICKENS_ROSE: 'lifted hens into the air', STRAYS_FLEW_HOME: 'flew strays home',
  BANK_RAISED: 'raised the riverbank', STONE_RAMS_BRIDGE: 'rammed the bridge with a stone', WATER_POOLED: 'pooled water on low ground', FIRE_WARDS_COOLED: 'sank the fire wards',
  FIELD_TENDED: 'tended fields', CHICKS_HATCHED: 'hatched chicks', LAW_HARMED: 'harmed the people who live with it', LEADER_OPPOSES: 'raised a leader against it',
};

const STARTER_LAWS = ['river_fears_fire', 'bridge_stands_watched', 'moonlight_ripens_grain', 'rain_follows_bells', 'wolves_fear_smoke', 'wolves_follow_smoke'];

export function Atlas() {
  const [tab, setTab] = useState<Tab>('laws');
  const [version, setVersion] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState<{ kind: 'good' | 'error'; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const p = loadProgress();
  void version;
  const st = progressStats(p);
  const laws = Object.values(p.atlas.laws);
  return (
    <main className="screen" data-testid="atlas">
      <div className="page atlas">
        <button className="btn small" onClick={() => store.set({ screen: 'title' })} data-testid="atlas-back">← Back</button>
        <h1 style={{ marginTop: '0.8rem' }}>Atlas of Belief</h1>
        <p className="muted">What you have learned about how a village’s belief moves the world. Kept on this device only: no accounts, no names, nothing sent anywhere. Nothing here is needed to win any scenario.</p>
        <div className="tabs mode-tabs atlas-tabs" role="tablist" aria-label="Atlas sections">
          {TABS.map(([t, label]) => (
            <button key={t} role="tab" className="tab" aria-selected={tab === t} data-testid={`atlas-tab-${t}`} onClick={() => { sfx('click'); setTab(t); }}>{label}</button>
          ))}
        </div>

        {tab === 'laws' && (
          <section data-testid="atlas-laws">
            <p className="small muted">{laws.length} of {STARTER_LAWS.length} starting laws recorded. A law is recorded the first time it takes hold, in a win or a loss.</p>
            {laws.map((l) => (
              <article key={l.claimId} className="card atlas-law" data-testid={`atlas-law-${l.claimId}`}>
                <h2>{l.short}</h2>
                <p><em>“{l.text}”</em></p>
                <p><b>Gives:</b> {l.benefit}</p>
                <p><b>Costs:</b> {l.risk}</p>
                <p className="small muted">Took hold {l.activations} time{l.activations === 1 ? '' : 's'} · {l.scenarios.join(', ')} · {l.regions.join(', ')}{l.effects.length ? ` · seen: ${l.effects.map((e) => EFFECT_TEXT[e] ?? e.toLowerCase().replace(/_/g, ' ')).join(', ')}` : ''}</p>
              </article>
            ))}
            {STARTER_LAWS.filter((id) => !p.atlas.laws[id]).map((id) => (
              <article key={id} className="card atlas-law locked" aria-label="An undiscovered law"><h2>? ? ?</h2><p className="muted">A law you have not yet seen take hold.</p></article>
            ))}
            {Object.values(p.atlas.invented ?? {}).length > 0 && (
              <>
                <h2 style={{ marginTop: '1rem' }}>Beliefs you made law</h2>
                <p className="small muted">Written in Generative Chronicle runs. Kept to remember them by: they give no power to any later run.</p>
                {Object.values(p.atlas.invented ?? {}).map((l) => (
                  <article key={l.hash} className="card atlas-law" data-testid={`atlas-invented-${l.hash}`}>
                    <h2>{l.short}</h2>
                    <p><em>“{l.text}”</em></p>
                    <p>{l.mechanics}</p>
                    <p className="small muted">Took hold {l.activations} time{l.activations === 1 ? '' : 's'} · {l.scenarios.join(', ')}{l.effects.length ? ` · seen: ${l.effects.map((e) => EFFECT_TEXT[e] ?? e.toLowerCase().replace(/_/g, ' ')).join(', ')}` : ''}</p>
                  </article>
                ))}
              </>
            )}
            {(['chronicle', 'living', 'lab'] as const).some((v) => st.variants[v].runs > 0) && (
              <section className="card" data-testid="atlas-variants" style={{ marginTop: '1rem' }}>
                <h2>Generative Reality records</h2>
                <p className="small muted">Each mode keeps its own record, apart from the Classic one above.</p>
                <ul className="small">
                  {(['chronicle', 'living', 'lab'] as const).filter((v) => st.variants[v].runs > 0).map((v) => (
                    <li key={v}>{VARIANT_LABEL[v]}: {st.variants[v].runs} run{st.variants[v].runs === 1 ? '' : 's'}, {st.variants[v].victories} won{v === 'lab' ? ' (unranked)' : st.variants[v].best !== null ? `, best score ${st.variants[v].best}` : ''}</li>
                  ))}
                </ul>
              </section>
            )}
          </section>
        )}

        {tab === 'lore' && (
          <section data-testid="atlas-lore">
            <p className="small muted">{st.knowledge} of {KNOWLEDGE.length} things witnessed. Failed runs teach too.</p>
            {KNOWLEDGE.map((k) => {
              const known = !!p.atlas.knowledge[k.id];
              return (
                <article key={k.id} className={`card atlas-law ${known ? '' : 'locked'}`} data-known={known}>
                  <h2>{known ? k.title : '? ? ?'}</h2>
                  <p className={known ? '' : 'muted'}>{known ? k.text : 'Not yet witnessed.'}</p>
                </article>
              );
            })}
          </section>
        )}

        {tab === 'postcards' && (
          <section data-testid="atlas-postcards">
            {Object.keys(p.atlas.postcards).length === 0 && <p className="muted">No villages seen to their end yet.</p>}
            {Object.entries(p.atlas.postcards).map(([id, cards]) => (
              <article key={id} className="card atlas-law">
                <h2>{p.runs.find((r) => r.scenarioId === id)?.name ?? id}</h2>
                {cards.slice().reverse().map((c, i) => <p key={i} className="postcard">“{c}”</p>)}
              </article>
            ))}
          </section>
        )}

        {tab === 'badges' && (
          <section data-testid="atlas-badges">
            <p className="small muted">{st.achievements} of {ACHIEVEMENTS.length} earned. Every badge is something a real strategy does.</p>
            <div className="grid2">
              {ACHIEVEMENTS.map((a) => {
                const got = p.achievements[a.id];
                return (
                  <article key={a.id} className={`card badge ${got ? 'got' : 'locked'}`} data-badge={a.id} data-earned={!!got}>
                    <div className="row" style={{ gap: '0.6rem' }}>
                      <span className="glyph-circle"><Icon name={got ? a.icon : 'help'} /></span>
                      <div><h2 style={{ margin: 0 }}>{a.name}</h2><span className="chip">{got ? 'Earned' : 'Not yet'}</span></div>
                    </div>
                    <p className="small">{a.desc}</p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'unlocks' && (
          <section data-testid="atlas-unlocks">
            <p className="small muted">Unlocks add choices, not power: extra stories, twists, pledges and drafts, each of which changes a rule of the run. Every scenario can be won with none of them.</p>
            {UNLOCKS.map((u) => {
              const got = p.unlocks[u.id];
              return (
                <article key={u.id} className={`card atlas-law ${got ? '' : 'locked'}`} data-unlock={u.id} data-earned={!!got}>
                  <h2>{u.name} <span className={`chip ${got ? 'good' : ''}`}>{got ? 'Unlocked' : 'Locked'}</span></h2>
                  <p className="small"><b>How:</b> {u.how}</p>
                  <p className="small"><b>Opens:</b> {u.opens}</p>
                </article>
              );
            })}
          </section>
        )}

        {tab === 'stats' && (
          <section data-testid="atlas-stats">
            <table className="breakdown"><tbody>
              <tr><td>Runs finished</td><td>{st.runs}</td></tr>
              <tr><td>Victories</td><td>{st.victories}</td></tr>
              <tr><td>Story chapters completed</td><td>{st.chaptersCompleted}</td></tr>
              <tr><td>Different laws that took hold</td><td>{st.uniqueLaws}</td></tr>
              <tr><td>Homes and lives spared by laws</td><td>{st.rescued}</td></tr>
              {Object.entries(st.averageScoreByMode).map(([m, v]) => <tr key={m}><td>Average winning score, {m}</td><td>{v}</td></tr>)}
              <tr><td>Most-used strategy</td><td>{st.favoriteStrategy ?? '—'}</td></tr>
              <tr><td>Best daily village</td><td>{st.bestDaily ? `${st.bestDaily.score} (${numberToDate(st.bestDaily.date)})` : '—'}</td></tr>
              <tr><td>Badges</td><td>{st.achievements} of {ACHIEVEMENTS.length}</td></tr>
            </tbody></table>
          </section>
        )}

        {tab === 'archive' && (
          <section data-testid="atlas-archive">
            <p>Your archive is a small JSON file on this device. Export it to keep a copy or move it to another browser; import restores it. Nothing in it identifies you.</p>
            <div className="row wrap">
              <button className="btn" data-testid="export" onClick={() => { downloadText('belief-engine-atlas.json', exportJson()); setMsg({ kind: 'good', text: 'Exported.' }); }}>Export archive</button>
              <button className="btn" onClick={() => file.current?.click()}>Import from file…</button>
              <input ref={file} type="file" accept="application/json,.json" hidden data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; void f.text().then((t) => setImportText(t)); e.target.value = ''; }} />
              <button className="btn danger" data-testid="reset" onClick={() => setConfirmReset(true)}>Reset progress…</button>
            </div>
            <label className="field" style={{ marginTop: '0.8rem' }}>
              <span>Or paste an exported archive here</span>
              <textarea rows={5} value={importText} onChange={(e) => setImportText(e.target.value)} data-testid="import-text" aria-label="Archive JSON" style={{ width: '100%' }} />
            </label>
            <button className="btn primary" data-testid="import" disabled={!importText.trim()} onClick={() => {
              const r = importJson(importText);
              if (r.ok) { setMsg({ kind: 'good', text: `Imported ${r.runs} run${r.runs === 1 ? '' : 's'}${r.migrated ? ' (upgraded from an older format)' : ''}. This replaced the archive on this device.` }); setImportText(''); setVersion((v) => v + 1); }
              else setMsg({ kind: 'error', text: r.error });
            }}>Import and replace</button>
            {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={msg.kind === 'error' ? 'error-text' : 'good-text'} data-testid="archive-msg">{msg.text}</p>}
          </section>
        )}
      </div>
      {confirmReset && (
        <Modal title="Reset all progress?" onClose={() => setConfirmReset(false)}>
          <p>This erases every badge, unlock, Atlas entry and run record on this device. It cannot be undone, but an exported archive can be imported again. Saved games in progress are not touched.</p>
          <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" data-autofocus onClick={() => setConfirmReset(false)} data-testid="reset-cancel">Keep my progress</button>
            <button className="btn danger" data-testid="reset-confirm" onClick={() => { resetProgress(); setConfirmReset(false); setVersion((v) => v + 1); setMsg({ kind: 'good', text: 'Progress reset.' }); }}>Erase it</button>
          </div>
        </Modal>
      )}
    </main>
  );
}
