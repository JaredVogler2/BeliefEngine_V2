/**
 * The screenshot matrix of the visual QA phase (docs/3d-rebuild/VISUAL_QA.md): ten real frames of the real 3D world, each from a real
 * engine state played by a bot (never a mock), through `scripts/capture-3d.ts`. Needs a dev or preview server (see that script).
 *
 *   npx vite --host 127.0.0.1 --port 5173 &
 *   npx tsx scripts/capture-matrix.ts [--only A,E] [--quality high] [--url http://127.0.0.1:4173]   # a production build: npm run build && npm run preview
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const qIdx = args.indexOf('--quality');
const quality = qIdx >= 0 ? args[qIdx + 1] : 'high';
const uIdx = args.indexOf('--url');
const url = uIdx >= 0 ? args[uIdx + 1] : null;
const dir = 'docs/3d-rebuild/screenshots';

interface Shot {
  id: string;
  name: string;
  what: string;
  args: string[];
}
const SHOTS: Shot[] = [
  { id: 'A', name: 'A-day1-overview', what: 'Day 1 overview, no interface: river, bridge, both districts, fields', args: ['--size', '1440x900', '--quality', quality] },
  { id: 'A2', name: 'A2-day1-with-interface', what: 'The same moment with the interface at rest (opening choice shown)', args: ['--size', '1440x900', '--quality', quality, '--hud', '1'] },
  { id: 'B', name: 'B-cottages-closeup', what: 'Two cottages, a field and trees up close', args: ['--size', '1440x900', '--quality', quality, '--view', 'az=30,el=32,dist=7.5,x=20.2,z=12.8'] },
  { id: 'C', name: 'C-selected-social-lens', what: 'A villager selected with the social lens on; the card beside them', args: ['--size', '1440x900', '--quality', quality, '--hud', '1', '--day', '3', '--select', 'villager:ivo', '--lens', 'social'] },
  { id: 'D', name: 'D-presurge-storm', what: 'The evening before the surge: storm light, rain, high water', args: ['--size', '1440x900', '--quality', quality, '--day', '7', '--policy', 'threat-aware', '--seed', '2', '--hud', '1'] },
  { id: 'E', name: 'E-law-awakens-beacon', what: 'River Fears Fire waking: ring, ripples across the river, runes, the reach around the lit beacon', args: ['--size', '1440x900', '--quality', quality, '--day', '6', '--resolve', '1', '--t', '1.1', '--policy', 'threat-aware', '--seed', '2', '--view', 'az=20,el=50,dist=13,x=15,z=12'] },
  { id: 'E2', name: 'E2-law-active-overview', what: 'The same law the next morning: the reach stays drawn, the flood stops at it', args: ['--size', '1440x900', '--quality', quality, '--day', '7', '--policy', 'threat-aware', '--seed', '2', '--view', 'az=24,el=46,dist=17,x=16,z=9'] },
  { id: 'F', name: 'F-bridge-watched', what: 'Bridge Stands Watched: watchers on the span, the gold motif, ring', args: ['--size', '1440x900', '--quality', quality, '--day', '6', '--resolve', '1', '--t', '1.2', '--policy', 'bridge-builder', '--seed', '1', '--view', 'az=18,el=36,dist=9,x=13.5,z=8.6'] },
  { id: 'F2', name: 'F2-bridge-watched-ledger', what: 'The same night with the interface: the law chip in the bar and the ledger saying who watches and why', args: ['--size', '1440x900', '--quality', quality, '--hud', '1', '--day', '6', '--resolve', '1', '--t', '1.2', '--policy', 'bridge-builder', '--seed', '1', '--sheet', 'laws', '--view', 'az=18,el=40,dist=12,x=13.5,z=8.6'] },
  { id: 'G', name: 'G-loss-aftermath', what: 'After a loss: the real village at the end, the verdict and the last events', args: ['--size', '1440x900', '--quality', quality, '--day', '9', '--policy', 'noop', '--hud', '1', '--wait', '5000'] },
  { id: 'H', name: 'H-victory-aftermath', what: 'After a win: the village that held, the sky cleared', args: ['--size', '1440x900', '--quality', quality, '--day', '9', '--policy', 'evidence-first', '--hud', '1', '--wait', '5000'] },
  { id: 'I', name: 'I-phone-selected', what: 'Phone portrait, a villager selected, the card above the bottom bar', args: ['--size', '390x844', '--quality', 'medium', '--dpr', '2', '--hud', '1', '--day', '3', '--select', 'villager:ivo'] },
  { id: 'K', name: 'K-desktop-laws-sheet', what: 'Interface open: the law ledger in the side sheet, the village framed beside it', args: ['--size', '1440x900', '--quality', quality, '--hud', '1', '--day', '6', '--policy', 'threat-aware', '--seed', '2', '--sheet', 'laws'] },
  { id: 'L', name: 'L-phone-laws-sheet', what: 'Phone portrait with the bottom sheet open on the laws', args: ['--size', '390x844', '--quality', 'medium', '--dpr', '2', '--hud', '1', '--day', '6', '--policy', 'threat-aware', '--seed', '2', '--sheet', 'laws'] },
  { id: 'M', name: 'M-flood-forecast-overlay', what: 'Tonight\'s forecast on the ground: stripes and a contour at every step of depth', args: ['--size', '1440x900', '--quality', quality, '--day', '6', '--policy', 'threat-aware', '--seed', '2', '--hud', '1'] },
  { id: 'J', name: 'J-phone-low-quality', what: 'Phone portrait on the lowest tier: still 3D, still legible', args: ['--size', '390x844', '--quality', 'low', '--dpr', '2', '--hud', '1', '--day', '3'] },
];

for (const s of SHOTS) {
  if (only && !only.includes(s.id)) continue;
  const out = `${dir}/${s.name}.jpg`;
  console.log(`${s.id}: ${s.what}`);
  try {
    const log = execFileSync('npx', ['tsx', 'scripts/capture-3d.ts', ...s.args, ...(url ? ['--url', url] : []), '--out', out], { encoding: 'utf8', timeout: 600000 });
    console.log(log.trim().split('\n').pop());
  } catch (e) {
    console.log(`  FAILED: ${(e as Error).message.split('\n')[0]}`);
  }
}
