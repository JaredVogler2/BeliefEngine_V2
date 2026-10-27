import { useState } from 'react';
import type { RunState } from '../engine/index.ts';
import { aliveCount, homesStanding } from '../engine/world/economy.ts';

/**
 * The end-of-run picture: a small painted strip whose every element is read from the final state. Dawn or dusk follows the verdict,
 * the row of houses shows how many still stand (lit window) and how many fell (slumped, dark), the dots are the villagers who lived and
 * died, the bridge is whole or broken, and the foreground follows the kind of danger the village faced (water, grain, wolf-moon).
 * Nothing is celebrated that did not happen. It animates for about two seconds, can be skipped, and is still when motion is reduced.
 */
export function DebriefScene({ state, win }: { state: RunState; win: boolean }) {
  const [skipped, setSkipped] = useState(false);
  const homes = state.world.landmarks.filter((l) => l.kind === 'home');
  const standing = homesStanding(state);
  const alive = aliveCount(state);
  const total = state.villagers.length;
  const bridge = state.world.landmarks.find((l) => l.kind === 'bridge');
  const kind = state.scn.threatKind;
  const shown = homes.slice(0, 14);
  const W = 600;
  const gap = W / (shown.length + 1);
  const label = `${win ? 'Dawn' : 'Dusk'} over ${state.scn.name}: ${alive} of ${total} villagers alive, ${standing} of ${homes.length} homes standing${bridge ? (bridge.hp > 0 ? ', the bridge still standing' : ', the bridge fallen') : ''}.`;
  return (
    <figure className={`scene ${win ? 'dawn' : 'dusk'} ${skipped ? 'still' : ''}`} data-testid="debrief-scene" data-result={win ? 'victory' : 'defeat'}>
      <svg viewBox="0 0 600 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={win ? '#2c4a7a' : '#0e1426'} />
            <stop offset="1" stopColor={win ? '#f0b86a' : '#3a2a4a'} />
          </linearGradient>
        </defs>
        <rect width="600" height="150" fill="url(#sky)" />
        {win && <g className="rays" opacity="0.28">{[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M300 120 L${40 + i * 86} -10 L${74 + i * 86} -10 Z`} fill="#ffe7a8" />)}</g>}
        <g className="orb"><circle cx="300" cy="86" r={win ? 24 : 20} fill={win ? '#ffd778' : '#e8e4d0'} opacity={win ? 0.95 : 0.85} />{!win && <circle cx="308" cy="82" r="18" fill="#1a1630" opacity="0.7" />}</g>
        <path d="M0 118 Q150 100 300 116 T600 112 V150 H0 Z" fill="#14281e" />
        {shown.map((h, i) => {
          const up = h.hp > 0;
          const x = gap * (i + 1);
          return (
            <g key={h.id} className={`house ${up ? 'up' : 'down'}`} transform={`translate(${x - 11} ${up ? 98 : 104})`} style={{ animationDelay: `${i * 70}ms` }}>
              <rect x="2" y="8" width="18" height="14" fill={up ? '#c9a27a' : '#4a3a30'} transform={up ? undefined : 'rotate(7 11 22)'} />
              <path d="M0 9 L11 0 L22 9 Z" fill={up ? '#b5523b' : '#2a1f1a'} transform={up ? undefined : 'rotate(7 11 22)'} />
              {up && <rect className="win" x="8" y="12" width="5" height="6" fill="#ffd778" />}
            </g>
          );
        })}
        {bridge && (
          <g transform="translate(262 122)" className={bridge.hp > 0 ? 'bridge up' : 'bridge down'}>
            <rect x="0" y="0" width="76" height="5" fill="#8a6a44" />
            {bridge.hp <= 0 && <rect x="30" y="-2" width="16" height="12" fill="#14281e" />}
          </g>
        )}
        {(kind === 'flood' || kind === 'mixed') && <path className="water" d="M0 138 Q50 130 100 138 T200 138 T300 138 T400 138 T500 138 T600 138 V150 H0 Z" fill="#3b86c4" opacity={win ? 0.55 : 0.8} />}
        {kind === 'drought' && [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => <path key={i} d={`M${20 + i * 50} 150 q2 -16 -2 -26 M${20 + i * 50} 150 q5 -14 6 -22`} stroke={win ? '#e6c35a' : '#8a7a52'} strokeWidth="2" fill="none" />)}
        {kind === 'wolves' && !win && [0, 1, 2].map((i) => <g key={i} className="eyes"><circle cx={470 + i * 34} cy="128" r="2" fill="#ffd778" /><circle cx={478 + i * 34} cy="128" r="2" fill="#ffd778" /></g>)}
        <g transform="translate(0 142)">
          {state.villagers.slice(0, 20).map((v, i) => (
            <circle key={v.id} cx={W / 2 - (Math.min(20, total) * 11) / 2 + i * 11 + 5} cy="4" r="3.2" fill={v.status === 'dead' ? 'none' : '#f2b84b'} stroke={v.status === 'dead' ? '#9fb2cc' : 'none'} strokeWidth="1.4" />
          ))}
        </g>
      </svg>
      <figcaption className="small muted" data-testid="scene-caption">{label}</figcaption>
      {!skipped && <button type="button" className="btn small scene-skip" onClick={() => setSkipped(true)} data-testid="scene-skip">Skip</button>}
    </figure>
  );
}
