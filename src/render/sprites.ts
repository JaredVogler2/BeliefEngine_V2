import type { Landmark, Villager } from '../engine/index.ts';
import { C, FACTION_COLORS, HAIR, ROOFS, SKIN, TS, nz } from './palette.ts';
import { hashString } from '../engine/core/rng.ts';

type G = CanvasRenderingContext2D;

function shadow(g: G, x: number, y: number, w: number, h: number): void {
  g.fillStyle = 'rgba(10,14,8,0.28)';
  g.beginPath();
  g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  g.fill();
}

export function drawHome(g: G, lm: Landmark, x: number, y: number, t: number, burning: boolean, wet: number): void {
  const ruined = lm.hp <= 0;
  const roof = ROOFS[hashString(lm.id) % ROOFS.length];
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 15, 5);
  if (ruined) {
    g.fillStyle = '#4a4036';
    g.beginPath();
    g.moveTo(cx - 14, by);
    g.lineTo(cx - 8, by - 8);
    g.lineTo(cx - 1, by - 5);
    g.lineTo(cx + 6, by - 10);
    g.lineTo(cx + 14, by);
    g.closePath();
    g.fill();
    g.strokeStyle = '#2b241d';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - 9, by - 7);
    g.lineTo(cx - 2, by - 2);
    g.moveTo(cx + 4, by - 9);
    g.lineTo(cx + 10, by - 2);
    g.stroke();
    return;
  }
  const dmg = 1 - lm.hp / lm.maxHp;
  // walls
  g.fillStyle = '#d9c8a4';
  g.fillRect(cx - 11, by - 15, 22, 15);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(cx + 4, by - 15, 7, 15);
  // roof
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(cx - 15, by - 14);
  g.lineTo(cx, by - 29);
  g.lineTo(cx + 15, by - 14);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.moveTo(cx - 15, by - 14);
  g.lineTo(cx, by - 29);
  g.lineTo(cx, by - 14);
  g.closePath();
  g.fill();
  // door + window
  g.fillStyle = '#5a3a24';
  g.fillRect(cx - 3, by - 9, 6, 9);
  g.fillStyle = '#f4d98a';
  g.fillRect(cx - 9, by - 11, 4, 4);
  g.fillRect(cx + 5, by - 11, 4, 4);
  // chimney + smoke
  g.fillStyle = '#6b5b4a';
  g.fillRect(cx + 6, by - 29, 4, 8);
  if (dmg > 0.35) {
    g.strokeStyle = 'rgba(30,20,10,0.7)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(cx - 8, by - 15);
    g.lineTo(cx - 4, by - 8);
    g.lineTo(cx - 7, by - 2);
    g.stroke();
  }
  if (wet > 0) {
    g.fillStyle = `rgba(70,150,220,${Math.min(0.6, 0.25 + wet * 0.12)})`;
    g.fillRect(cx - 12, by - Math.min(15, 4 + wet * 5), 24, Math.min(15, 4 + wet * 5));
  }
  if (burning) flame(g, cx, by - 14, t, 1.4);
}

export function drawCabin(g: G, lm: Landmark, x: number, y: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 12, 4);
  if (lm.hp <= 0) return drawHome(g, lm, x, y, 0, false, 0);
  g.fillStyle = '#8a5e3b';
  g.fillRect(cx - 9, by - 12, 18, 12);
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(cx - 9, by - 3 - i * 3);
    g.lineTo(cx + 9, by - 3 - i * 3);
    g.stroke();
  }
  g.fillStyle = '#5b3a22';
  g.beginPath();
  g.moveTo(cx - 12, by - 11);
  g.lineTo(cx, by - 22);
  g.lineTo(cx + 12, by - 11);
  g.closePath();
  g.fill();
  g.fillStyle = '#f4d98a';
  g.fillRect(cx - 2, by - 8, 4, 4);
}

export function drawMill(g: G, x: number, y: number, t: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 17, 5);
  g.fillStyle = '#cdbb98';
  g.fillRect(cx - 13, by - 22, 22, 22);
  g.fillStyle = '#7a4a3a';
  g.beginPath();
  g.moveTo(cx - 16, by - 21);
  g.lineTo(cx - 2, by - 36);
  g.lineTo(cx + 12, by - 21);
  g.closePath();
  g.fill();
  g.fillStyle = '#5a3a24';
  g.fillRect(cx - 4, by - 10, 6, 10);
  // wheel
  const wx = cx + 14;
  const wy = by - 8;
  g.strokeStyle = '#5a3a24';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(wx, wy, 8, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = t * 0.8 + (i * Math.PI) / 3;
    g.beginPath();
    g.moveTo(wx, wy);
    g.lineTo(wx + Math.cos(a) * 8, wy + Math.sin(a) * 8);
    g.stroke();
  }
}

export function drawMarket(g: G, x: number, y: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 17, 4);
  for (const [dx, col] of [[-10, '#c5503b'], [8, '#d9a441']] as [number, string][]) {
    g.fillStyle = '#6b4a2f';
    g.fillRect(cx + dx - 6, by - 14, 2, 14);
    g.fillRect(cx + dx + 5, by - 14, 2, 14);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(cx + dx - 9, by - 13);
    g.lineTo(cx + dx + 10, by - 13);
    g.lineTo(cx + dx + 7, by - 22);
    g.lineTo(cx + dx - 6, by - 22);
    g.closePath();
    g.fill();
    g.fillStyle = '#8f6b3f';
    g.fillRect(cx + dx - 6, by - 6, 12, 4);
  }
}

export function drawHall(g: G, x: number, y: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 19, 5);
  g.fillStyle = '#c9b88f';
  g.fillRect(cx - 17, by - 18, 34, 18);
  g.fillStyle = '#4f6d7a';
  g.beginPath();
  g.moveTo(cx - 20, by - 17);
  g.lineTo(cx, by - 33);
  g.lineTo(cx + 20, by - 17);
  g.closePath();
  g.fill();
  g.fillStyle = '#5a3a24';
  g.fillRect(cx - 4, by - 11, 8, 11);
  g.fillStyle = '#f4d98a';
  for (const dx of [-12, 8]) g.fillRect(cx + dx, by - 13, 5, 5);
  g.fillStyle = C.gold;
  g.fillRect(cx - 1, by - 41, 2, 9);
  g.fillRect(cx + 1, by - 41, 8, 5);
}

export function drawChapel(g: G, x: number, y: number, green: boolean): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  if (green) {
    shadow(g, cx, by, 14, 5);
    g.fillStyle = '#6b5a3a';
    g.fillRect(cx - 12, by - 4, 24, 3);
    g.fillStyle = '#2e5a38';
    g.beginPath();
    g.arc(cx, by - 14, 11, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5a3a24';
    g.fillRect(cx - 2, by - 8, 4, 8);
    return;
  }
  shadow(g, cx, by, 13, 4);
  g.fillStyle = '#d8d0bd';
  g.fillRect(cx - 10, by - 14, 20, 14);
  g.fillStyle = '#6b5b95';
  g.beginPath();
  g.moveTo(cx - 12, by - 13);
  g.lineTo(cx, by - 26);
  g.lineTo(cx + 12, by - 13);
  g.closePath();
  g.fill();
  g.fillStyle = C.gold;
  g.fillRect(cx - 1, by - 34, 2, 8);
  g.fillRect(cx - 4, by - 31, 8, 2);
  g.fillStyle = '#5a3a24';
  g.fillRect(cx - 3, by - 8, 6, 8);
}

export function drawBellTower(g: G, x: number, y: number, t: number, ringing: boolean): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 12, 4);
  g.fillStyle = '#b9ad94';
  g.fillRect(cx - 7, by - 38, 14, 38);
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(cx + 2, by - 38, 5, 38);
  g.fillStyle = '#7a4a3a';
  g.beginPath();
  g.moveTo(cx - 10, by - 37);
  g.lineTo(cx, by - 52);
  g.lineTo(cx + 10, by - 37);
  g.closePath();
  g.fill();
  g.fillStyle = '#2b241d';
  g.fillRect(cx - 4, by - 36, 8, 10);
  const sw = ringing ? Math.sin(t * 9) * 5 : 0;
  g.fillStyle = C.gold;
  g.beginPath();
  g.arc(cx + sw, by - 29, 3.4, Math.PI, 0);
  g.lineTo(cx + sw + 3.4, by - 26);
  g.lineTo(cx + sw - 3.4, by - 26);
  g.closePath();
  g.fill();
  if (ringing) {
    g.strokeStyle = 'rgba(242,184,75,0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const r = ((t * 30 + i * 14) % 42) + 6;
      g.globalAlpha = 1 - r / 48;
      g.beginPath();
      g.arc(cx, by - 29, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
}

export function drawBeacon(g: G, lm: Landmark, x: number, y: number, t: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 4;
  shadow(g, cx, by, 8, 3);
  g.fillStyle = '#4a4540';
  g.beginPath();
  g.moveTo(cx - 6, by - 12);
  g.lineTo(cx + 6, by - 12);
  g.lineTo(cx + 4, by);
  g.lineTo(cx - 4, by);
  g.closePath();
  g.fill();
  g.fillStyle = '#6a625a';
  g.fillRect(cx - 7, by - 14, 14, 3);
  if (lm.lit && lm.fuelNights > 0) {
    const glow = g.createRadialGradient(cx, by - 20, 2, cx, by - 20, 30);
    glow.addColorStop(0, 'rgba(255,190,90,0.55)');
    glow.addColorStop(1, 'rgba(255,190,90,0)');
    g.fillStyle = glow;
    g.fillRect(cx - 32, by - 52, 64, 64);
    flame(g, cx, by - 14, t, 1.2);
  } else {
    g.fillStyle = '#2b241d';
    g.fillRect(cx - 4, by - 17, 8, 3);
  }
}

export function flame(g: G, cx: number, by: number, t: number, s = 1): void {
  const f = Math.sin(t * 11 + cx) * 1.5;
  g.fillStyle = '#e8743b';
  g.beginPath();
  g.moveTo(cx - 5 * s, by);
  g.quadraticCurveTo(cx - 6 * s + f, by - 9 * s, cx + f, by - 17 * s);
  g.quadraticCurveTo(cx + 6 * s + f, by - 9 * s, cx + 5 * s, by);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd27a';
  g.beginPath();
  g.moveTo(cx - 2.6 * s, by);
  g.quadraticCurveTo(cx - 3 * s, by - 5 * s, cx + f * 0.6, by - 10 * s);
  g.quadraticCurveTo(cx + 3 * s, by - 5 * s, cx + 2.6 * s, by);
  g.closePath();
  g.fill();
}

export function drawShelter(g: G, lm: Landmark, x: number, y: number, occupants: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 15, 4);
  g.fillStyle = '#c9a66b';
  g.beginPath();
  g.moveTo(cx - 14, by);
  g.lineTo(cx, by - 20);
  g.lineTo(cx + 14, by);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.beginPath();
  g.moveTo(cx, by - 20);
  g.lineTo(cx + 14, by);
  g.lineTo(cx, by);
  g.closePath();
  g.fill();
  g.fillStyle = '#3b2a1a';
  g.beginPath();
  g.moveTo(cx - 4, by);
  g.lineTo(cx, by - 10);
  g.lineTo(cx + 4, by);
  g.closePath();
  g.fill();
  g.fillStyle = C.emerald;
  g.fillRect(cx - 1, by - 30, 2, 12);
  g.fillRect(cx + 1, by - 30, 7, 5);
  g.fillStyle = 'rgba(244,236,216,0.95)';
  g.font = '700 9px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText(`${occupants}/${lm.capacity}`, cx, by + 9);
}

export function drawBridge(g: G, lm: Landmark, t: number, watchers: number): void {
  const hp = lm.hp / Math.max(1, lm.maxHp);
  for (let i = 0; i < lm.tiles.length; i++) {
    const [tx, ty] = lm.tiles[i];
    const x = tx * TS;
    const y = ty * TS;
    if (lm.hp <= 0) {
      // broken stumps
      g.fillStyle = '#4a3a2a';
      if (i === 0) g.fillRect(x + 16, y + 6, 6, 20);
      if (i === lm.tiles.length - 1) g.fillRect(x + 4, y + 6, 6, 20);
      continue;
    }
    g.fillStyle = '#7a5a38';
    g.fillRect(x, y + 6, TS, 20);
    g.strokeStyle = 'rgba(20,10,0,0.45)';
    g.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.moveTo(x + 3 + k * 7, y + 6);
      g.lineTo(x + 3 + k * 7, y + 26);
      g.stroke();
    }
    g.fillStyle = '#5a3d22';
    g.fillRect(x, y + 3, TS, 3);
    g.fillRect(x, y + 26, TS, 3);
    if (hp < 0.55 && nz(tx, ty, 9) > 0.35) {
      g.fillStyle = 'rgba(40,90,140,0.75)';
      g.fillRect(x + 8, y + 10, 8, 10);
    }
  }
  if (lm.hp > 0 && watchers > 0) {
    for (let i = 0; i < Math.min(watchers, lm.tiles.length); i++) {
      const [tx, ty] = lm.tiles[i];
      const cx = tx * TS + 16;
      const cy = ty * TS + 2;
      const glow = g.createRadialGradient(cx, cy, 1, cx, cy, 24);
      glow.addColorStop(0, 'rgba(255,224,150,0.55)');
      glow.addColorStop(1, 'rgba(255,224,150,0)');
      g.fillStyle = glow;
      g.fillRect(cx - 24, cy - 24, 48, 48);
      g.fillStyle = '#ffe9b0';
      g.beginPath();
      g.arc(cx, cy + Math.sin(t * 3 + i) * 0.6, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }
}

export function drawField(g: G, lm: Landmark, t: number): void {
  const burned = !!lm.data.burned;
  const ruined = !!lm.data.ruined;
  const crops = lm.data.growth !== undefined && lm.data.moisture !== undefined;
  const growth = Math.max(0, Math.min(100, lm.data.growth ?? 100));
  const moist = lm.data.moisture ?? 100;
  for (const [tx, ty] of lm.tiles) {
    const x = tx * TS;
    const y = ty * TS;
    if (burned) {
      g.fillStyle = 'rgba(25,18,14,0.78)';
      g.fillRect(x, y, TS, TS);
      continue;
    }
    if (ruined) {
      g.fillStyle = 'rgba(90,70,44,0.55)';
      g.fillRect(x, y, TS, TS);
      continue;
    }
    if (crops && lm.data.harvested) {
      g.fillStyle = 'rgba(140,110,60,0.55)';
      g.fillRect(x, y, TS, TS);
      g.fillStyle = '#b89a56';
      for (let r = 0; r < 4; r++) g.fillRect(x + 3, y + 5 + r * 7, TS - 6, 1.6);
      continue;
    }
    if (crops) {
      // dry cracked soil under the crop, crop height follows growth, ripe wheat turns gold
      g.fillStyle = `rgba(${150 - moist * 0.5},${110 - moist * 0.3},${70},0.55)`;
      g.fillRect(x, y, TS, TS);
      const h = 3 + (growth / 100) * 12;
      const ripe = growth >= 100 || !!lm.data.ripe;
      for (let r = 0; r < 4; r++) {
        const sway = Math.sin(t * 1.4 + tx + r) * (ripe ? 1.4 : 0.6);
        g.strokeStyle = ripe ? '#e3b93c' : growth > 55 ? '#9dae44' : `hsl(${60 + growth * 0.4},${35 + moist * 0.3}%,${34 + growth * 0.1}%)`;
        g.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const sx = x + 4 + k * 7;
          g.beginPath();
          g.moveTo(sx, y + 6 + r * 7);
          g.lineTo(sx + sway, y + 6 + r * 7 - h * 0.7);
          g.stroke();
        }
      }
      if (moist <= 8 && !ripe) {
        g.fillStyle = 'rgba(120,90,50,0.35)';
        g.fillRect(x, y, TS, TS);
      }
      continue;
    }
    for (let r = 0; r < 4; r++) {
      const sway = Math.sin(t * 1.4 + tx + r) * 0.8;
      g.fillStyle = r % 2 ? '#d9b84a' : '#c8a63a';
      g.fillRect(x + 2 + sway, y + 3 + r * 7, TS - 4, 4);
      g.fillStyle = 'rgba(255,240,170,0.5)';
      g.fillRect(x + 2 + sway, y + 3 + r * 7, TS - 4, 1);
    }
  }
}

export function drawTree(g: G, x: number, y: number, k: number, hill = false): void {
  const cx = x + 16 + (nz(x, y, 3) - 0.5) * 10;
  const by = y + 28 - nz(x, y, 4) * 6;
  const s = 0.85 + nz(x, y, 5) * 0.4 + k * 0.05;
  shadow(g, cx, by, 8 * s, 3 * s);
  g.fillStyle = '#4a3322';
  g.fillRect(cx - 1.5, by - 6 * s, 3, 6 * s);
  const col = hill ? ['#4f7a4a', '#5f8a55', '#6f9a62'] : ['#244d33', '#2f6240', '#3a7650'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = col[i];
    g.beginPath();
    const w = (12 - i * 2.6) * s;
    const top = by - (10 + i * 8) * s;
    g.moveTo(cx - w, top + 10 * s);
    g.lineTo(cx, top - 6 * s);
    g.lineTo(cx + w, top + 10 * s);
    g.closePath();
    g.fill();
  }
}

export interface VillagerDraw {
  v: Villager;
  x: number;
  y: number;
  moving: boolean;
  t: number;
  selected: boolean;
  hovered: boolean;
  ringConv: number | null;
  ringKnown: boolean;
  hint: boolean;
}

export function drawVillager(g: G, d: VillagerDraw): void {
  const { v } = d;
  const bob = d.moving ? Math.abs(Math.sin(d.t * 10 + v.look.hue)) * 2 : Math.sin(d.t * 1.7 + v.look.hue) * 0.5;
  const x = d.x;
  const y = d.y - bob;
  if (v.status === 'dead') {
    g.fillStyle = 'rgba(10,10,10,0.25)';
    g.beginPath();
    g.ellipse(x, d.y, 7, 2.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9a9488';
    g.fillRect(x - 3, d.y - 12, 6, 12);
    g.beginPath();
    g.arc(x, d.y - 12, 3, Math.PI, 0);
    g.fill();
    g.strokeStyle = '#4a463e';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x, d.y - 10);
    g.lineTo(x, d.y - 4);
    g.moveTo(x - 2, d.y - 8);
    g.lineTo(x + 2, d.y - 8);
    g.stroke();
    return;
  }
  const child = v.archetype === 'child';
  const sc = (child ? 0.78 : 1) * 1.32;
  const garment = FACTION_COLORS[v.faction] ?? '#999';
  shadow(g, x, d.y, 6 * sc, 2.2 * sc);
  if (d.ringConv !== null) {
    const pos = d.ringConv > 0;
    g.strokeStyle = d.ringKnown ? (pos ? `rgba(242,184,75,${0.35 + Math.min(0.65, d.ringConv / 90)})` : d.ringConv < 0 ? 'rgba(229,88,106,0.8)' : 'rgba(150,170,190,0.55)') : 'rgba(180,190,210,0.6)';
    g.lineWidth = d.ringKnown ? 1.5 + Math.min(2.5, Math.abs(d.ringConv) / 30) : 1.5;
    g.setLineDash(d.ringKnown ? [] : [3, 3]);
    g.beginPath();
    g.ellipse(x, d.y - 1, 9 * sc, 4 * sc, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  if (d.selected || d.hint) {
    g.strokeStyle = d.selected ? '#ffffff' : C.gold;
    g.lineWidth = 2;
    const pulse = d.hint ? 1 + Math.sin(d.t * 5) * 0.12 : 1;
    g.beginPath();
    g.ellipse(x, d.y - 1, 12 * pulse, 5.5 * pulse, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // legs
  g.fillStyle = '#3a3128';
  const lw = d.moving ? Math.sin(d.t * 14) * 1.5 : 0;
  g.fillRect(x - 3 * sc + lw, y - 6 * sc, 2.4 * sc, 6 * sc);
  g.fillRect(x + 0.6 * sc - lw, y - 6 * sc, 2.4 * sc, 6 * sc);
  // body
  g.strokeStyle = 'rgba(12,16,28,0.85)';
  g.lineWidth = 1.4;
  g.fillStyle = garment;
  g.beginPath();
  g.moveTo(x - 4.5 * sc, y - 6 * sc);
  g.lineTo(x - 3.2 * sc, y - 14 * sc);
  g.lineTo(x + 3.2 * sc, y - 14 * sc);
  g.lineTo(x + 4.5 * sc, y - 6 * sc);
  g.closePath();
  g.stroke();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x + 0.5 * sc, y - 14 * sc, 3 * sc, 8 * sc);
  // head
  g.fillStyle = SKIN[v.look.skin % SKIN.length];
  g.beginPath();
  g.arc(x, y - 17.4 * sc, 3.6 * sc, 0, Math.PI * 2);
  g.stroke();
  g.fill();
  g.fillStyle = HAIR[v.look.hair % HAIR.length];
  g.beginPath();
  g.arc(x, y - 18.4 * sc, 3.7 * sc, Math.PI, 0);
  g.fill();
  // hats by look.hat
  const hat = v.look.hat;
  const hy = y - 20.6 * sc;
  if (hat === 1) {
    g.fillStyle = '#6b2f8a';
    g.beginPath();
    g.moveTo(x - 4.6 * sc, hy + 1);
    g.lineTo(x + 0.5 * sc, hy - 8 * sc);
    g.lineTo(x + 4.6 * sc, hy + 1);
    g.closePath();
    g.fill();
  } else if (hat === 2) {
    g.fillStyle = '#d9b84a';
    g.fillRect(x - 6 * sc, hy, 12 * sc, 1.8);
    g.fillRect(x - 3 * sc, hy - 2.6 * sc, 6 * sc, 2.8 * sc);
  } else if (hat === 3) {
    g.fillStyle = '#8a8a8a';
    g.beginPath();
    g.arc(x, hy + 1, 4 * sc, Math.PI, 0);
    g.fill();
  } else if (hat === 4) {
    g.fillStyle = '#3e3a52';
    g.fillRect(x - 4.4 * sc, hy - 2 * sc, 8.8 * sc, 3.4 * sc);
  } else if (hat === 5) {
    g.fillStyle = '#c5503b';
    g.fillRect(x - 5 * sc, hy, 10 * sc, 1.8);
    g.fillRect(x - 3 * sc, hy - 3 * sc, 6 * sc, 3.2 * sc);
  } else if (hat === 6) {
    g.fillStyle = '#e9e1d0';
    g.beginPath();
    g.arc(x, hy + 1.2, 4.1 * sc, Math.PI, 0);
    g.fill();
  }
  // status glyphs
  const gy = y - 27 * sc;
  g.font = '700 10px system-ui, sans-serif';
  g.textAlign = 'center';
  if (v.duty === 'evacuate') glyph(g, x, gy, '⇨', '#9ad0ff');
  else if (v.duty === 'trapped') glyph(g, x, gy, '!', C.danger);
  else if (v.duty === 'watch') glyph(g, x, gy, '◉', C.gold);
  else if (v.duty === 'messenger') glyph(g, x, gy, '✉', C.violet);
  else if (v.status === 'injured') glyph(g, x, gy, '+', '#ff9aa8');
  else if (v.status === 'sick') glyph(g, x, gy, '❀', '#9ce0a0');
  if (v.fear >= 70 && v.duty !== 'trapped') glyph(g, x + 7 * sc, gy + 3, '~', '#ffd27a');
}

function glyph(g: G, x: number, y: number, ch: string, col: string): void {
  g.fillStyle = 'rgba(14,22,38,0.8)';
  g.beginPath();
  g.arc(x, y - 3, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = col;
  g.fillText(ch, x, y);
}

export function drawLabel(g: G, text: string, x: number, y: number, accent = '#f4ecd8'): void {
  g.font = '600 11px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  const w = g.measureText(text).width + 10;
  g.fillStyle = 'rgba(14,22,38,0.82)';
  const r = 5;
  const lx = x - w / 2;
  const ly = y - 12;
  g.beginPath();
  g.moveTo(lx + r, ly);
  g.arcTo(lx + w, ly, lx + w, ly + 16, r);
  g.arcTo(lx + w, ly + 16, lx, ly + 16, r);
  g.arcTo(lx, ly + 16, lx, ly, r);
  g.arcTo(lx, ly, lx + w, ly, r);
  g.fill();
  g.fillStyle = accent;
  g.fillText(text, x, y);
}

export function drawPen(g: G, lm: Landmark, x: number, y: number, t: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 17, 5);
  g.strokeStyle = '#6b4a2f';
  g.lineWidth = 2;
  g.strokeRect(cx - 17, by - 18, 34, 18);
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(cx - 17 + i * 8.5, by - 22);
    g.lineTo(cx - 17 + i * 8.5, by);
    g.stroke();
  }
  const n = lm.data.stock ?? 0;
  for (let i = 0; i < Math.min(8, n); i++) {
    const ax = cx - 12 + (i % 4) * 8 + Math.sin(t * 1.3 + i) * 0.8;
    const ay = by - 10 + Math.floor(i / 4) * 7;
    g.fillStyle = '#f2ecd8';
    g.beginPath();
    g.ellipse(ax, ay, 4, 3, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3b3128';
    g.beginPath();
    g.arc(ax + 3.2, ay - 1.2, 1.6, 0, Math.PI * 2);
    g.fill();
  }
  if (n === 0) {
    g.fillStyle = 'rgba(30,20,10,0.6)';
    g.fillRect(cx - 16, by - 16, 32, 14);
  }
}

export function drawCampfire(g: G, lm: Landmark, x: number, y: number, t: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 4;
  shadow(g, cx, by, 9, 3);
  g.fillStyle = '#5a4630';
  g.fillRect(cx - 8, by - 3, 16, 3);
  g.save();
  g.translate(cx, by - 1);
  g.rotate(0.5);
  g.fillRect(-7, -2, 14, 3);
  g.restore();
  if (lm.lit && lm.fuelNights > 0) {
    const glow = g.createRadialGradient(cx, by - 8, 2, cx, by - 8, 34);
    glow.addColorStop(0, 'rgba(255,170,80,0.5)');
    glow.addColorStop(1, 'rgba(255,170,80,0)');
    g.fillStyle = glow;
    g.fillRect(cx - 36, by - 44, 72, 72);
    flame(g, cx, by - 3, t, 1.0);
  } else {
    g.fillStyle = '#2b241d';
    g.beginPath();
    g.arc(cx, by - 4, 4, 0, Math.PI * 2);
    g.fill();
  }
}

export function drawGranary(g: G, x: number, y: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 16, 5);
  g.fillStyle = '#b08a52';
  g.fillRect(cx - 13, by - 18, 26, 18);
  g.fillStyle = '#8c5a2b';
  g.beginPath();
  g.moveTo(cx - 16, by - 17);
  g.lineTo(cx, by - 30);
  g.lineTo(cx + 16, by - 17);
  g.closePath();
  g.fill();
  g.fillStyle = '#5a3a24';
  g.fillRect(cx - 4, by - 10, 8, 10);
  g.fillStyle = '#e6c46a';
  g.fillRect(cx - 12, by - 6, 6, 4);
}

export function drawWell(g: G, x: number, y: number): void {
  const cx = x + TS / 2;
  const by = y + TS - 3;
  shadow(g, cx, by, 10, 4);
  g.fillStyle = '#8f8a80';
  g.beginPath();
  g.ellipse(cx, by - 5, 10, 5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d2c3d';
  g.beginPath();
  g.ellipse(cx, by - 6, 7, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#6b4a2f';
  g.fillRect(cx - 9, by - 22, 2, 18);
  g.fillRect(cx + 7, by - 22, 2, 18);
  g.fillRect(cx - 10, by - 23, 20, 2);
}

export function drawRoadState(g: G, lm: Landmark, now: number): void {
  const blocked = (lm.data.blockedUntil ?? -1) >= now;
  if (!blocked) return;
  for (const [tx, ty] of lm.tiles) {
    g.fillStyle = 'rgba(92,64,38,0.82)';
    g.fillRect(tx * TS, ty * TS + 4, TS, TS - 8);
    g.fillStyle = 'rgba(60,40,22,0.6)';
    g.beginPath();
    g.arc(tx * TS + 10, ty * TS + 16, 6, 0, Math.PI * 2);
    g.arc(tx * TS + 22, ty * TS + 12, 5, 0, Math.PI * 2);
    g.fill();
  }
}

export function drawPack(g: G, x: number, y: number, t: number, size: number, name: string, hungry: boolean): void {
  for (let i = 0; i < size + 1; i++) {
    const wx = x - 8 + i * 9;
    const wy = y + Math.sin(t * 2 + i * 1.7) * 1.2;
    shadow(g, wx, wy, 7, 2.4);
    g.fillStyle = '#4d5560';
    g.beginPath();
    g.ellipse(wx, wy - 6, 7, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(wx + 7, wy - 9, 3.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(wx + 5, wy - 12);
    g.lineTo(wx + 6, wy - 16);
    g.lineTo(wx + 8.5, wy - 12);
    g.fill();
    g.fillRect(wx - 5, wy - 4, 2, 5);
    g.fillRect(wx + 2, wy - 4, 2, 5);
    g.strokeStyle = '#4d5560';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(wx - 7, wy - 7);
    g.quadraticCurveTo(wx - 12, wy - 12, wx - 13, wy - 6);
    g.stroke();
    g.fillStyle = hungry ? '#ff5a4a' : '#f2d36b';
    g.fillRect(wx + 8.4, wy - 10, 1.6, 1.6);
  }
  drawLabel(g, `${name} pack`, x, y - 22, '#ffb3a8');
}
